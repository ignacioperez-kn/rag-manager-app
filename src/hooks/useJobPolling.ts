import { useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';

type Status = 'idle' | 'starting' | 'processing' | 'complete' | 'error' | 'skipped';

export function useJobPolling(onSuccess?: () => void) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [message, setMessage] = useState<string>('');
  
  const pollInterval = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  }, []);

  const startPolling = useCallback(async (jobId: string) => {
    setStatus('starting');
    
    pollInterval.current = window.setInterval(async () => {
      try {
        const { data } = await api.get(`/jobs/${jobId}`);
        
        setStatus(data.status);
        setProgress(data.progress);
        setMessage(data.message);

        if (['complete', 'error', 'skipped'].includes(data.status)) {
          stopPolling();
          if (data.status === 'complete' && onSuccess) {
            onSuccess();
          }
          // Reset to idle after a brief delay so the bar disappears cleanly
          setTimeout(() => {
            setStatus('idle');
            setProgress(0);
            setMessage('');
          }, 3000);
        }
      } catch (e) {
        console.error("Polling error", e);
        setStatus('error');
        stopPolling();
      }
    }, 10000); // Poll every 10 seconds

    return stopPolling;
  }, [onSuccess, stopPolling]);

  return { status, progress, message, startPolling, stopPolling };
}