import { useState, useRef } from 'react';
import { api } from '../lib/api';

export function useJobPolling() {
  const [status, setStatus] = useState<string>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [logs, setLogs] = useState<string>('');
  
  // Ref to stop polling if component unmounts
  const pollInterval = useRef<number | null>(null);

  const startPolling = async (jobId: string) => {
    setStatus('starting');
    
    pollInterval.current = window.setInterval(async () => {
      try {
        const { data } = await api.get(`/jobs/${jobId}`);
        
        setStatus(data.status);
        setProgress(data.progress);
        setLogs(data.message);

        // Stop polling if complete or error
        if (['complete', 'error', 'skipped'].includes(data.status)) {
          if (pollInterval.current) clearInterval(pollInterval.current);
        }
      } catch (e) {
        console.error("Polling error", e);
        setStatus('error');
        if (pollInterval.current) clearInterval(pollInterval.current);
      }
    }, 1000); // Poll every 1 second
  };

  return { status, progress, logs, startPolling };
}