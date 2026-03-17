import { useState, useEffect, useRef, useCallback } from 'react';
import { useTestHubJob } from '../../../hooks/useTestHubJob';
import type { QualityEvalResult, QualityEvalSummary } from '../types';
import { MetricCard } from '../ui/MetricCard';
import { DifficultyExcludeChips } from '../ui/DifficultyExcludeChips';
import { LiveLog } from '../ui/LiveLog';
import { useBufferedFlush } from '../hooks/useBufferedFlush';
import { QualityReportModal } from '../modals/QualityReportModal';
import { exportQualityJSON } from '../utils/export';
import { exportQualityHTML } from '../utils/report-templates';
import { QualityHistoryTab } from './QualityHistoryTab';

export const QualityEvalTab = () => {
  const [source, setSource] = useState('auto');
  const [difficulty, setDifficulty] = useState('');
  const [chunkLimit, setChunkLimit] = useState(5);
  const [threshold, setThreshold] = useState(0.7);
  const [boostFactor, setBoostFactor] = useState(1.0);
  const [maxCases, setMaxCases] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ index: 0, total: 0 });
  const [liveStats, setLiveStats] = useState({ relevance: 0, faithfulness: 0, noise: 0, count: 0 });
  const [logLines, setLogLines] = useState<{ text: string; color: string }[]>([]);
  const [summary, setSummary] = useState<QualityEvalSummary | null>(null);
  const [evalResults, setEvalResults] = useState<QualityEvalResult[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [summaryExcluded, setSummaryExcluded] = useState<Set<string>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const qStatsRef = useRef({ totalRel: 0, totalFaith: 0, totalNoise: 0, cnt: 0 });

  const { resultsBufferRef, logBufferRef, startFlushTimer, stopFlushTimer } = useBufferedFlush<QualityEvalResult>(setEvalResults, setLogLines);

  const qualityJob = useTestHubJob({
    operation: 'quality_eval',
    onEvent: useCallback((data: any) => {
      if (data.type === 'start') {
        startFlushTimer();
        logBufferRef.current.push({ text: `Starting quality evaluation: ${data.total} test cases`, color: 'text-accent' });
        setProgress({ index: 0, total: data.total });
      } else if (data.type === 'progress' && data.result) {
        startFlushTimer(); // idempotent — ensures flush runs on reconnect too
        const r: QualityEvalResult = data.result;
        const s = qStatsRef.current;
        s.cnt++;
        s.totalRel += r.relevance_score || 0;
        s.totalFaith += r.faithfulness_score || 0;
        s.totalNoise += r.noise_ratio || 0;
        setProgress({ index: data.completed || s.cnt, total: data.total || 0 });
        setLiveStats({ relevance: s.totalRel / s.cnt, faithfulness: s.totalFaith / s.cnt, noise: s.totalNoise / s.cnt, count: s.cnt });
        resultsBufferRef.current.push(r);
        const relIcon = r.relevance_score >= 7 ? '\u2705' : r.relevance_score >= 4 ? '\u26A0\uFE0F' : '\u274C';
        const color = r.relevance_score >= 7 ? 'text-green-400' : r.relevance_score >= 4 ? 'text-yellow-400' : 'text-red-400';
        logBufferRef.current.push({ text: `${relIcon} [${r.id?.slice(0, 8) ?? ''}] R:${r.relevance_score} F:${r.faithfulness_score} Q:${r.answer_quality} — ${r.query} (${r.difficulty}) — ${r.latency_ms}ms`, color });
      } else if (data.type === 'complete') {
        stopFlushTimer();
        setSummary(data);
        setLogLines(prev => [...prev, { text: 'Quality evaluation complete!', color: 'text-green-400' }]);
        if (data.run_id) setLogLines(prev => [...prev, { text: `Saved run: ${data.run_id}`, color: 'text-muted' }]);
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
    if (qualityJob.status === 'running' && !running) {
      setRunning(true);
      setHistoryOpen(false);
    }
  }, [qualityJob.status]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  const runQualityEval = async () => {
    setRunning(true);
    setHistoryOpen(false);
    setSummary(null);
    setEvalResults([]);
    setLogLines([]);
    resultsBufferRef.current = [];
    logBufferRef.current = [];
    qStatsRef.current = { totalRel: 0, totalFaith: 0, totalNoise: 0, cnt: 0 };
    setProgress({ index: 0, total: 0 });
    setLiveStats({ relevance: 0, faithfulness: 0, noise: 0, count: 0 });

    const params: Record<string, string> = {
      source,
      limit: String(chunkLimit),
      threshold: String(threshold),
      boost_factor: String(boostFactor),
    };
    if (difficulty) params.difficulty = difficulty;
    if (maxCases) params.max_cases = maxCases;

    try {
      await qualityJob.start('/test-hub/api/run-quality-eval', params);
    } catch (e: any) {
      setLogLines([{ text: `Error: ${e.message}`, color: 'text-red-400' }]);
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

  return (
    <div className="space-y-4">
      {/* Controls */}
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
          <label className="text-xs text-muted block mb-1">Chunks</label>
          <input type="number" step="1" min="1" max="50" value={chunkLimit} onChange={e => setChunkLimit(parseInt(e.target.value) || 5)}
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
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
        <button onClick={runQualityEval} disabled={running}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            running ? 'bg-white/10 text-muted cursor-not-allowed' : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30'
          }`}>
          {running ? 'Running...' : 'Run Quality Eval'}
        </button>
        {running && (
          <button onClick={() => qualityJob.cancel()} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-colors">
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
                  <button onClick={() => exportQualityHTML(evalResults, summary)}
                    className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                    Export HTML
                  </button>
                  <button onClick={() => exportQualityJSON(evalResults, summary)}
                    className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                    Export JSON
                  </button>
                </>
              )}
            </div>
            <span className="text-muted text-xs">{progress.index}/{progress.total}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          {liveStats.count > 0 && (
            <div className="flex gap-4 mt-2 text-xs text-muted">
              <span>Relevance: <span className="text-white">{liveStats.relevance.toFixed(1)}/10</span></span>
              <span>Faithfulness: <span className="text-white">{liveStats.faithfulness.toFixed(1)}/10</span></span>
              <span>Noise: <span className="text-white">{(liveStats.noise * 100).toFixed(1)}%</span></span>
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
            const n = pool ? (pool.length || 1) : 1;
            const rel = pool ? pool.reduce((s, r) => s + (r.relevance_score || 0), 0) / n : summary.metrics.avg_relevance;
            const faith = pool ? pool.reduce((s, r) => s + (r.faithfulness_score || 0), 0) / n : summary.metrics.avg_faithfulness;
            const comp = pool ? pool.reduce((s, r) => s + (r.completeness_score || 0), 0) / n : summary.metrics.avg_completeness_score;
            const noise = pool ? pool.reduce((s, r) => s + (r.noise_ratio || 0), 0) / n : summary.metrics.avg_noise_ratio;
            const util = pool ? pool.reduce((s, r) => s + (r.utility || 0), 0) / n : summary.metrics.avg_utility;
            const isFilteredSummary = summaryExcluded.size > 0;

            return (
              <div className="grid grid-cols-5 gap-3">
                <MetricCard label="Relevance" value={`${rel.toFixed(1)}/10`}
                  sub={isFilteredSummary ? `${pool!.length} cases` : undefined}
                  colorClass={rel >= 7 ? 'text-green-400' : rel >= 4 ? 'text-yellow-400' : 'text-red-400'} />
                <MetricCard label="Faithfulness" value={`${faith.toFixed(1)}/10`}
                  colorClass={faith >= 7 ? 'text-green-400' : faith >= 4 ? 'text-yellow-400' : 'text-red-400'} />
                <MetricCard label="Completeness" value={`${(comp * 100).toFixed(0)}%`}
                  colorClass={comp > 0.7 ? 'text-green-400' : comp > 0.4 ? 'text-yellow-400' : 'text-red-400'} />
                <MetricCard label="Noise Ratio" value={`${(noise * 100).toFixed(1)}%`}
                  colorClass={noise < 0.3 ? 'text-green-400' : noise < 0.5 ? 'text-yellow-400' : 'text-red-400'} />
                <MetricCard label="Utility" value={`${util.toFixed(1)}/10`}
                  colorClass={util >= 7 ? 'text-green-400' : util >= 4 ? 'text-yellow-400' : 'text-red-400'} />
              </div>
            );
          })()}

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-white font-medium text-sm mb-3">By Difficulty</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="text-left py-1">Difficulty</th>
                  <th className="text-center">Count</th>
                  <th className="text-center">Relevance</th>
                  <th className="text-center">Faithfulness</th>
                  <th className="text-center">Noise</th>
                  <th className="text-center">Utility</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.breakdowns.by_difficulty).map(([diff, info]) => (
                  <tr key={diff} className="border-t border-white/5">
                    <td className="py-1.5 text-gray-300 font-medium">{diff}</td>
                    <td className="text-center text-muted">{info.count}</td>
                    <td className={`text-center ${info.avg_relevance >= 7 ? 'text-green-400' : info.avg_relevance >= 4 ? 'text-yellow-400' : 'text-red-400'}`}>{info.avg_relevance.toFixed(1)}</td>
                    <td className={`text-center ${info.avg_faithfulness >= 7 ? 'text-green-400' : info.avg_faithfulness >= 4 ? 'text-yellow-400' : 'text-red-400'}`}>{info.avg_faithfulness.toFixed(1)}</td>
                    <td className={`text-center ${info.avg_noise_ratio < 0.3 ? 'text-green-400' : 'text-red-400'}`}>{(info.avg_noise_ratio * 100).toFixed(1)}%</td>
                    <td className={`text-center ${info.avg_utility >= 7 ? 'text-green-400' : 'text-yellow-400'}`}>{info.avg_utility.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <LiveLog logLines={logLines} logRef={logRef} emptyMessage="Run a quality evaluation to see results..." />

      {summary && evalResults.length > 0 && (
        <QualityReportModal
          isOpen={reportOpen}
          onClose={() => setReportOpen(false)}
          results={evalResults}
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
        {historyOpen && !running && <QualityHistoryTab />}
        {historyOpen && running && (
          <div className="text-muted text-xs text-center py-4">History hidden while evaluation is running</div>
        )}
      </div>
    </div>
  );
};
