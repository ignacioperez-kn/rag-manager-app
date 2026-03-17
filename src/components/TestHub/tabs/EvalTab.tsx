import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../../lib/api';
import { useTestHubJob } from '../../../hooks/useTestHubJob';
import type { EvalResult, EvalSummary, GenerationSummary } from '../types';
import { MetricCard } from '../ui/MetricCard';
import { DifficultyExcludeChips } from '../ui/DifficultyExcludeChips';
import { LiveLog } from '../ui/LiveLog';
import { useBufferedFlush } from '../hooks/useBufferedFlush';
import { EvalReportModal } from '../modals/EvalReportModal';
import { exportRetrievalJSON } from '../utils/export';
import { exportRetrievalHTML } from '../utils/report-templates';
import { HistoryTab } from './HistoryTab';

export const EvalTab = () => {
  const [source, setSource] = useState('auto');
  const [difficulty, setDifficulty] = useState('');
  const [topN, setTopN] = useState(5);
  const [threshold, setThreshold] = useState(0.7);
  const [boostFactor, setBoostFactor] = useState(1.0);
  const [maxCases, setMaxCases] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ index: 0, total: 0 });
  const [liveStats, setLiveStats] = useState({ hits1: 0, hitsN: 0, count: 0 });
  const [logLines, setLogLines] = useState<{ text: string; color: string }[]>([]);
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [evalResults, setEvalResults] = useState<EvalResult[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [summaryExcluded, setSummaryExcluded] = useState<Set<string>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(true);
  const evalParamsRef = useRef({ threshold: 0.7, boostFactor: 1.0 });
  const logRef = useRef<HTMLDivElement>(null);
  const evalStatsRef = useRef({ h1: 0, hN: 0, cnt: 0 });

  const { resultsBufferRef, logBufferRef, startFlushTimer, stopFlushTimer } = useBufferedFlush<EvalResult>(setEvalResults, setLogLines);

  const evalJob = useTestHubJob({
    operation: 'eval',
    onEvent: useCallback((data: any) => {
      if (data.type === 'start') {
        startFlushTimer();
        logBufferRef.current.push({ text: `Starting evaluation: ${data.total} test cases`, color: 'text-accent' });
        setProgress({ index: 0, total: data.total });
      } else if (data.type === 'progress' && data.result) {
        startFlushTimer(); // idempotent — ensures flush runs on reconnect too
        const r: EvalResult = data.result;
        evalStatsRef.current.cnt++;
        if (r.hit_at_1) evalStatsRef.current.h1++;
        if (r.hit_at_n) evalStatsRef.current.hN++;
        setProgress({ index: data.completed || evalStatsRef.current.cnt, total: data.total || 0 });
        setLiveStats({ hits1: evalStatsRef.current.h1, hitsN: evalStatsRef.current.hN, count: evalStatsRef.current.cnt });
        resultsBufferRef.current.push(r);
        const icon = r.hit_at_1 ? '\u2705' : r.hit_at_n ? '\u2B55' : '\u274C';
        const color = r.hit_at_1 ? 'text-green-400' : r.hit_at_n ? 'text-yellow-400' : 'text-red-400';
        logBufferRef.current.push({ text: `${icon} [${r.id?.slice(0, 8) ?? ''}] ${r.query} (${r.difficulty}) — rank: ${r.rank ?? 'miss'} — ${r.latency_ms}ms`, color });
      } else if (data.type === 'complete') {
        stopFlushTimer();
        setSummary(data);
        setLogLines(prev => [...prev, { text: 'Evaluation complete!', color: 'text-green-400' }]);
        setRunning(false);
      } else if (data.type === 'error') {
        stopFlushTimer();
        setLogLines(prev => [...prev, { text: `Error: ${data.message}`, color: 'text-red-400' }]);
        setRunning(false);
      }
    }, [startFlushTimer, stopFlushTimer, logBufferRef, resultsBufferRef]),
    onDone: useCallback(() => { stopFlushTimer(); setRunning(false); }, [stopFlushTimer]),
  });

  // Sync running state when hook reconnects to an active job
  useEffect(() => {
    if (evalJob.status === 'running' && !running) {
      setRunning(true);
      setHistoryOpen(false);
    }
  }, [evalJob.status]);

  // --- Generation state ---
  const [genSource, setGenSource] = useState('both');
  const [genPhases, setGenPhases] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ processed: 0, total: 0, phase: '' });
  const [genSummary, setGenSummary] = useState<GenerationSummary | null>(null);
  const [dbTestCaseCount, setDbTestCaseCount] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  const genJob = useTestHubJob({
    operation: 'generate',
    onEvent: useCallback((data: any) => {
      if (data.type === 'start') {
        setGenerating(true);
        setGenProgress({ processed: 0, total: data.total, phase: 'starting' });
      } else if (data.type === 'phase') {
        setGenProgress(prev => ({ ...prev, phase: data.phase }));
      } else if (data.type === 'progress') {
        setGenProgress({ processed: data.completed || 0, total: data.total || 0, phase: data.phase || '' });
      } else if (data.type === 'complete') {
        setGenSummary(data);
        setGenerating(false);
      } else if (data.type === 'error') {
        setGenSummary(null);
        setGenerating(false);
      }
    }, []),
    onDone: useCallback(() => setGenerating(false), []),
  });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/test-hub/api/generated-test-cases', { params: { limit: 1, offset: 0 } });
        setDbTestCaseCount(data.total ?? 0);
      } catch { /* ignore */ }
    })();
  }, [genSummary]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  const runGeneration = async () => {
    setGenerating(true);
    setGenSummary(null);
    setGenProgress({ processed: 0, total: 0, phase: '' });
    try {
      await genJob.start('/test-hub/api/generate-test-cases', { sources: genSource, phases: genPhases });
    } catch (e: any) {
      alert(e.message || 'Failed to start generation');
      setGenerating(false);
    }
  };

  const clearTestCases = async () => {
    if (!confirm('Clear all generated test cases from the database?')) return;
    setClearing(true);
    try {
      await api.delete('/test-hub/api/generated-test-cases');
      setDbTestCaseCount(0);
      setGenSummary(null);
    } catch { /* ignore */ }
    setClearing(false);
  };

  const runEval = async () => {
    setRunning(true);
    setHistoryOpen(false);
    setSummary(null);
    setEvalResults([]);
    setLogLines([]);
    resultsBufferRef.current = [];
    logBufferRef.current = [];
    evalStatsRef.current = { h1: 0, hN: 0, cnt: 0 };
    setProgress({ index: 0, total: 0 });
    setLiveStats({ hits1: 0, hitsN: 0, count: 0 });
    evalParamsRef.current = { threshold, boostFactor };

    const params: Record<string, string> = {
      source,
      top_n: String(topN),
      threshold: String(threshold),
      boost_factor: String(boostFactor),
    };
    if (difficulty) params.difficulty = difficulty;
    if (maxCases) params.max_cases = maxCases;

    try {
      await evalJob.start('/test-hub/api/run-eval', params);
    } catch (e: any) {
      logBufferRef.current.push({ text: `Error: ${e.message}`, color: 'text-red-400' });
      stopFlushTimer();
      setRunning(false);
    }
  };

  const toggleSummaryExclude = (d: string) => {
    setSummaryExcluded(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  const pct = progress.total > 0 ? (progress.index / progress.total * 100) : 0;
  const genPct = genProgress.total > 0 ? (genProgress.processed / genProgress.total * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ---- Generate Test Cases Panel ---- */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-medium text-sm">Generate Test Cases</h3>
          {dbTestCaseCount !== null && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent/20 text-accent">
              {dbTestCaseCount} in DB
            </span>
          )}
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-xs text-muted block mb-1">Source</label>
            <select value={genSource} onChange={e => setGenSource(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
              <option value="both">FAQs + Documents</option>
              <option value="faq">FAQs Only</option>
              <option value="document">Documents Only</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Phases</label>
            <select value={genPhases} onChange={e => setGenPhases(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
              <option value="all">All</option>
              <option value="standard">Standard Only</option>
              <option value="followup">Follow-ups Only</option>
            </select>
          </div>
          <button onClick={runGeneration} disabled={generating}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              generating ? 'bg-white/10 text-muted cursor-not-allowed' : 'bg-accent/20 text-blue-100 hover:bg-accent/30 border border-accent/40'
            }`}>
            {generating ? 'Generating...' : 'Generate'}
          </button>
          {generating && (
            <button onClick={() => genJob.cancel()} className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors">
              Cancel
            </button>
          )}
          <button onClick={clearTestCases} disabled={clearing || generating}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50">
            {clearing ? 'Clearing...' : 'Clear All'}
          </button>
        </div>

        {generating && (
          <div>
            <div className="flex justify-between mb-1 text-xs">
              <span className="text-muted">Phase: <span className="text-white">{genProgress.phase || 'starting'}</span></span>
              <span className="text-muted">{genProgress.processed}/{genProgress.total}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${genPct}%` }} />
            </div>
          </div>
        )}

        {genSummary && (
          <div className="grid grid-cols-4 gap-2">
            <MetricCard label="Total Generated" value={String(genSummary.total_test_cases)} colorClass="text-accent" />
            <MetricCard label="From FAQs" value={String(genSummary.faq_sourced)} colorClass="text-green-400" />
            <MetricCard label="From Docs" value={String(genSummary.document_sourced)} colorClass="text-blue-400" />
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-xs text-muted mb-2">By Difficulty</div>
              <div className="space-y-1">
                {Object.entries(genSummary.by_difficulty).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-gray-400">{k}</span>
                    <span className="text-yellow-400 font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---- Eval Runner Controls ---- */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted block mb-1">Test Cases</label>
          <select value={source} onChange={e => setSource(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="auto">Database (auto)</option>
            <option value="db">Database only</option>
            <option value="csv_auto">CSV: Auto</option>
            <option value="csv_manual">CSV: Manual</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Difficulty</label>
          <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="">All</option>
            <option value="exact">Exact</option>
            <option value="paraphrase">Paraphrase</option>
            <option value="keywords">Keywords</option>
            <option value="followup">Follow-up</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Top-N</label>
          <input type="number" min="1" max="20" value={topN} onChange={e => setTopN(parseInt(e.target.value))}
            className="w-14 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Threshold</label>
          <input type="number" step="0.05" min="0" max="1" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))}
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Max Cases</label>
          <input type="number" min="1" value={maxCases} onChange={e => setMaxCases(e.target.value)} placeholder="all"
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">FAQ Boost</label>
          <input type="number" step="0.1" min="0" max="5" value={boostFactor} onChange={e => setBoostFactor(parseFloat(e.target.value))}
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <button onClick={runEval} disabled={running || generating}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            running || generating ? 'bg-white/10 text-muted cursor-not-allowed' : 'bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/30'
          }`}>
          {running ? 'Running...' : 'Run Evaluation'}
        </button>
        {running && (
          <button onClick={() => evalJob.cancel()} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-colors">
            Cancel
          </button>
        )}
      </div>

      {/* Progress */}
      {(running || summary) && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-white font-medium">{running ? 'Running...' : 'Complete'}</span>
              {!running && summary && evalResults.length > 0 && (
                <>
                  <button onClick={() => setReportOpen(true)}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-accent/20 text-blue-100 hover:bg-accent/30 border border-accent/40 transition-colors">
                    View Report
                  </button>
                  <button onClick={() => exportRetrievalHTML(evalResults, summary)}
                    className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                    Export HTML
                  </button>
                  <button onClick={() => exportRetrievalJSON(evalResults, summary)}
                    className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                    Export JSON
                  </button>
                </>
              )}
            </div>
            <span className="text-muted text-xs">{progress.index}/{progress.total}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          {liveStats.count > 0 && (
            <div className="flex gap-4 mt-2 text-xs text-muted">
              <span>Hit@1: <span className="text-white">{(liveStats.hits1 / liveStats.count * 100).toFixed(1)}%</span></span>
              <span>Hit@N: <span className="text-white">{(liveStats.hitsN / liveStats.count * 100).toFixed(1)}%</span></span>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <>
          <DifficultyExcludeChips
            items={evalResults}
            excluded={summaryExcluded}
            onToggle={toggleSummaryExclude}
            onReset={() => setSummaryExcluded(new Set())}
            label="Include:"
          />

          {(() => {
            const pool = summaryExcluded.size > 0
              ? evalResults.filter(r => !summaryExcluded.has(r.difficulty))
              : null;
            const total = pool ? pool.length || 1 : summary.metrics.total || 1;
            const hr1 = pool ? pool.filter(r => r.hit_at_1).length / total : summary.metrics.hit_rate_1;
            const hrN = pool ? pool.filter(r => r.hit_at_n).length / total : summary.metrics.hit_rate_n;
            const mrr = pool ? pool.reduce((s, r) => s + r.reciprocal_rank, 0) / total : summary.metrics.mrr;
            const lats = pool ? pool.map(r => r.latency_ms).filter(l => l > 0) : null;
            const avgLat = lats ? (lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0) : summary.metrics.avg_latency_ms;
            const sortedLats = lats ? [...lats].sort((a, b) => a - b) : null;
            const p95Lat = sortedLats ? (sortedLats.length ? sortedLats[Math.floor(sortedLats.length * 0.95)] : 0) : summary.metrics.p95_latency_ms;
            const isFilteredSummary = summaryExcluded.size > 0;

            return (
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="Hit Rate @1" value={`${(hr1 * 100).toFixed(1)}%`}
                  sub={isFilteredSummary ? `${pool!.filter(r => r.hit_at_1).length}/${pool!.length}` : undefined}
                  colorClass={hr1 > 0.7 ? 'text-green-400' : hr1 > 0.4 ? 'text-yellow-400' : 'text-red-400'} />
                <MetricCard label={`Hit Rate @${summary.metrics.top_n}`} value={`${(hrN * 100).toFixed(1)}%`}
                  sub={isFilteredSummary ? `${pool!.filter(r => r.hit_at_n).length}/${pool!.length}` : undefined}
                  colorClass={hrN > 0.8 ? 'text-green-400' : hrN > 0.5 ? 'text-yellow-400' : 'text-red-400'} />
                <MetricCard label="MRR" value={mrr.toFixed(4)} colorClass="text-accent" />
                <MetricCard label="Avg Latency" value={`${Math.round(avgLat)}ms`} sub={`p95: ${Math.round(p95Lat)}ms`} />
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-white font-medium text-sm mb-3">By Difficulty</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted">
                    <th className="text-left py-1">Difficulty</th>
                    <th className="text-center">Count</th>
                    <th className="text-center">Hit@1</th>
                    <th className="text-center">Hit@N</th>
                    <th className="text-center">MRR</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.breakdowns.by_difficulty).map(([diff, info]) => (
                    <tr key={diff} className="border-t border-white/5">
                      <td className="py-1.5 text-gray-300 font-medium">{diff}</td>
                      <td className="text-center text-muted">{info.count}</td>
                      <td className={`text-center ${info.hit_rate_1 > 0.7 ? 'text-green-400' : 'text-red-400'}`}>{(info.hit_rate_1 * 100).toFixed(1)}%</td>
                      <td className={`text-center ${info.hit_rate_n > 0.8 ? 'text-green-400' : 'text-red-400'}`}>{(info.hit_rate_n * 100).toFixed(1)}%</td>
                      <td className="text-center text-accent">{info.mrr.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-white font-medium text-sm mb-3">Gap Report</h3>
              <div className="text-xs space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {summary.gaps.zero_results.length > 0 && (
                  <div>
                    <div className="text-red-400 font-semibold">{summary.gaps.zero_results.length} queries returned ZERO results</div>
                    {summary.gaps.zero_results.slice(0, 5).map(r => (
                      <div key={r.id} className="pl-2 text-muted">[{r.id?.slice(0, 8)}] {r.query}</div>
                    ))}
                  </div>
                )}
                {summary.gaps.missed.length > 0 && (
                  <div>
                    <div className="text-yellow-400 font-semibold">{summary.gaps.missed.length} expected results NOT in top-N</div>
                    {summary.gaps.missed.slice(0, 5).map(r => (
                      <div key={r.id} className="pl-2 text-muted">[{r.id?.slice(0, 8)}] {r.query}</div>
                    ))}
                  </div>
                )}
                {summary.gaps.low_rank.length > 0 && (
                  <div>
                    <div className="text-accent font-semibold">{summary.gaps.low_rank.length} found but NOT at rank 1</div>
                    {summary.gaps.low_rank.slice(0, 5).map(r => (
                      <div key={r.id} className="pl-2 text-muted">[{r.id?.slice(0, 8)}] rank={r.rank} {r.query}</div>
                    ))}
                  </div>
                )}
                {summary.gaps.zero_results.length === 0 && summary.gaps.missed.length === 0 && summary.gaps.low_rank.length === 0 && (
                  <div className="text-green-400">No gaps detected!</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <LiveLog logLines={logLines} logRef={logRef} />

      {summary && evalResults.length > 0 && (
        <EvalReportModal
          isOpen={reportOpen}
          onClose={() => setReportOpen(false)}
          results={evalResults}
          summary={summary}
          evalParams={evalParamsRef.current}
        />
      )}

      {/* Run History — collapsible, auto-collapses when running */}
      <div className="border-t border-white/10 pt-1">
        <button
          onClick={() => setHistoryOpen(prev => !prev)}
          className="w-full flex items-center justify-between py-2.5 text-sm hover:bg-white/[0.02] rounded-lg px-2 transition-colors"
        >
          <span className="font-medium text-white">Run History</span>
          <span className="text-muted text-xs">{historyOpen ? '\u25B2 Collapse' : '\u25BC Expand'}</span>
        </button>
        {historyOpen && !running && <HistoryTab />}
        {historyOpen && running && (
          <div className="text-muted text-xs text-center py-4">History hidden while evaluation is running</div>
        )}
      </div>
    </div>
  );
};
