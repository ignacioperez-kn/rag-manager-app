import { useState, useRef, useCallback, useEffect } from 'react';
import { api, supabase } from '../lib/api';

type JobStatus = 'idle' | 'running' | 'complete' | 'error' | 'cancelled';

interface UseTestHubJobOptions {
  /** Called for each SSE event from the job */
  onEvent: (event: any) => void;
  /** Operation type to auto-reconnect to (e.g. "eval", "generate", "quality_eval") */
  operation?: string;
  /** Called when job reaches a terminal state */
  onDone?: (status: JobStatus) => void;
}

export function useTestHubJob({ onEvent, operation, onDone }: UseTestHubJobOptions) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus>('idle');
  const abortRef = useRef<AbortController | null>(null);
  const eventIndexRef = useRef(0);
  const jobIdRef = useRef<string | null>(null);
  const statusRef = useRef<JobStatus>('idle');
  const onEventRef = useRef(onEvent);
  const onDoneRef = useRef(onDone);
  onEventRef.current = onEvent;
  onDoneRef.current = onDone;

  // Keep refs in sync with state
  const updateStatus = useCallback((s: JobStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const updateJobId = useCallback((id: string | null) => {
    jobIdRef.current = id;
    setJobId(id);
  }, []);

  /** Fetch final job data and fire onEvent with the summary so components update */
  const finishFromPoll = useCallback(async (id: string, s: JobStatus) => {
    updateStatus(s);
    // Fetch the full job to get the summary and replay it as an event
    try {
      const { data: jobData } = await api.get(`/test-hub/api/jobs/${id}`);
      if (jobData.summary && Object.keys(jobData.summary).length > 0) {
        onEventRef.current(jobData.summary);
      }
    } catch { /* best-effort */ }
    onDoneRef.current?.(s);
  }, [updateStatus]);

  const connectSSE = useCallback(async (id: string, fromIndex: number) => {
    // Abort any existing connection
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const baseUrl = api.defaults.baseURL?.replace(/\/+$/, '') || '';
      const res = await fetch(
        `${baseUrl}/test-hub/api/jobs/${id}/events?from_index=${fromIndex}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        }
      );

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }
          eventIndexRef.current++;
          onEventRef.current(data);

          // Check for terminal events
          if (data.type === 'complete') {
            updateStatus('complete');
            onDoneRef.current?.('complete');
          } else if (data.type === 'error') {
            updateStatus('error');
            onDoneRef.current?.('error');
          } else if (data.type === 'cancelled') {
            updateStatus('cancelled');
            onDoneRef.current?.('cancelled');
          }
        }
      }

      // Stream ended cleanly — check final job status via poll
      if (statusRef.current === 'running') {
        try {
          const { data: jobData } = await api.get(`/test-hub/api/jobs/${id}`);
          const s = jobData.status as JobStatus;
          if (s === 'complete' || s === 'error' || s === 'cancelled') {
            await finishFromPoll(id, s);
          } else {
            // Job still running but stream ended — reconnect
            setTimeout(() => connectSSE(id, eventIndexRef.current), 1000);
          }
        } catch {
          // Can't reach server — retry
          setTimeout(() => connectSSE(id, eventIndexRef.current), 2000);
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      // Connection lost — reconnect if job is still supposed to be running
      if (statusRef.current === 'running') {
        setTimeout(() => connectSSE(id, eventIndexRef.current), 2000);
      }
    }
  }, [updateStatus, finishFromPoll]);

  /** Reconnect SSE when tab regains focus (browsers throttle/kill background connections) */
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && statusRef.current === 'running' && jobIdRef.current) {
        // Tab became visible — reconnect to pick up missed events
        connectSSE(jobIdRef.current, eventIndexRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [connectSSE]);

  /** Start a new job */
  const start = useCallback(async (endpoint: string, params: Record<string, string>) => {
    try {
      const { data } = await api.post(endpoint, null, { params });
      if (data.error) {
        throw new Error(data.error);
      }
      const id = data.job_id;
      updateJobId(id);
      updateStatus('running');
      eventIndexRef.current = 0;
      connectSSE(id, 0);
      return id;
    } catch (e: any) {
      // 409 = another job running
      if (e.response?.status === 409) {
        throw new Error(e.response.data?.error || 'Another operation is already running');
      }
      throw e;
    }
  }, [connectSSE, updateJobId, updateStatus]);

  /** Cancel the running job */
  const cancel = useCallback(async () => {
    if (!jobIdRef.current) return;
    await api.post(`/test-hub/api/jobs/${jobIdRef.current}/cancel`);
  }, []);

  /** Reconnect to an active job, repopulating results */
  const reconnect = useCallback(async (id: string, existingResults?: any[]) => {
    updateJobId(id);
    updateStatus('running');
    eventIndexRef.current = 0;

    // Fetch existing results so the UI can be repopulated
    if (!existingResults) {
      try {
        const { data } = await api.get(`/test-hub/api/jobs/${id}/results`);
        existingResults = data.results || [];
      } catch { existingResults = []; }
    }

    // Replay results as synthetic progress events
    for (const r of existingResults ?? []) {
      onEventRef.current({ type: 'progress', result: r, completed: 0, total: 0 });
      eventIndexRef.current++;
    }

    // Connect to live events from where we left off
    connectSSE(id, eventIndexRef.current);
  }, [connectSSE, updateJobId, updateStatus]);

  /** Check for active OR recently-completed job on mount */
  useEffect(() => {
    if (!operation) return;
    let cancelled = false;
    (async () => {
      try {
        // First check for a running job
        const { data } = await api.get('/test-hub/api/active-job');
        if (cancelled) return;
        if (data.job_id && data.operation === operation && (data.status === 'pending' || data.status === 'running')) {
          reconnect(data.job_id);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [operation, reconnect]);

  /** Cleanup on unmount */
  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  return { jobId, status, start, cancel, reconnect };
}
