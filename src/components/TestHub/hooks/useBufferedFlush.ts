import { useRef, useCallback, useEffect } from 'react';

type LogLine = { text: string; color: string };

export function useBufferedFlush<TResult>(
  setResults: React.Dispatch<React.SetStateAction<TResult[]>>,
  setLogLines: React.Dispatch<React.SetStateAction<LogLine[]>>,
  interval = 200,
) {
  const resultsBufferRef = useRef<TResult[]>([]);
  const logBufferRef = useRef<LogLine[]>([]);
  const flushTimerRef = useRef<number>(0);

  const startFlushTimer = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = window.setInterval(() => {
      if (resultsBufferRef.current.length > 0) {
        const batch = resultsBufferRef.current;
        resultsBufferRef.current = [];
        setResults(prev => [...prev, ...batch]);
      }
      if (logBufferRef.current.length > 0) {
        const batch = logBufferRef.current;
        logBufferRef.current = [];
        setLogLines(prev => [...prev, ...batch]);
      }
    }, interval);
  }, [setResults, setLogLines, interval]);

  const stopFlushTimer = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = 0;
    }
    // Final flush
    if (resultsBufferRef.current.length > 0) {
      const batch = resultsBufferRef.current;
      resultsBufferRef.current = [];
      setResults(prev => [...prev, ...batch]);
    }
    if (logBufferRef.current.length > 0) {
      const batch = logBufferRef.current;
      logBufferRef.current = [];
      setLogLines(prev => [...prev, ...batch]);
    }
  }, [setResults, setLogLines]);

  useEffect(() => {
    return () => { if (flushTimerRef.current) clearInterval(flushTimerRef.current); };
  }, []);

  return { resultsBufferRef, logBufferRef, startFlushTimer, stopFlushTimer };
}
