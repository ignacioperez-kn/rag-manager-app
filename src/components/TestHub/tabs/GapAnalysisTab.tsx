import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../../lib/api';
import { useTestHubJob } from '../../../hooks/useTestHubJob';
import type { GapAnalysisResult, GapAnalysisSummary } from '../types';
import { MetricCard } from '../ui/MetricCard';
import { LiveLog } from '../ui/LiveLog';
import { useBufferedFlush } from '../hooks/useBufferedFlush';
import { GapReportModal } from '../modals/GapReportModal';
import { exportGapJSON } from '../utils/export';
import { GapHistoryTab } from './GapHistoryTab';

export const GapAnalysisTab = () => {
  const [clientPersona, setClientPersona] = useState('');
  const [kbContext, setKbContext] = useState('');
  const [sourceFile, setSourceFile] = useState('');
  const [category, setCategory] = useState('');
  const [maxFaqs, setMaxFaqs] = useState('');
  const [searchLimit, setSearchLimit] = useState(5);
  const [threshold, setThreshold] = useState(0.5);
  const [boostFactor, setBoostFactor] = useState(1.0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ index: 0, total: 0 });
  const [liveStats, setLiveStats] = useState({ coverage: 0, gaps: 0, contradictions: 0, count: 0 });
  const [logLines, setLogLines] = useState<{ text: string; color: string }[]>([]);
  const [summary, setSummary] = useState<GapAnalysisSummary | null>(null);
  const [gapResults, setGapResults] = useState<GapAnalysisResult[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [faqSources, setFaqSources] = useState<string[]>([]);
  const [faqCategories, setFaqCategories] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef({ totalCov: 0, totalGaps: 0, totalContradictions: 0, cnt: 0 });

  const { resultsBufferRef, logBufferRef, startFlushTimer, stopFlushTimer } = useBufferedFlush<GapAnalysisResult>(setGapResults, setLogLines);

  const gapJob = useTestHubJob({
    operation: 'gap_analysis',
    onEvent: useCallback((data: any) => {
      if (data.type === 'start') {
        startFlushTimer();
        logBufferRef.current.push({ text: `Starting gap analysis: ${data.total} FAQs`, color: 'text-accent' });
        setProgress({ index: 0, total: data.total });
      } else if (data.type === 'progress' && data.result) {
        startFlushTimer();
        const r: GapAnalysisResult = data.result;
        const s = statsRef.current;
        s.cnt++;
        s.totalCov += r.coverage_score || 0;
        s.totalGaps += r.gap_count || 0;
        s.totalContradictions += r.contradiction_count || 0;
        setProgress({ index: data.completed || s.cnt, total: data.total || 0 });
        setLiveStats({ coverage: s.totalCov / s.cnt, gaps: s.totalGaps, contradictions: s.totalContradictions, count: s.cnt });
        resultsBufferRef.current.push(r);
        const icon = r.coverage_score >= 7 ? '\u2705' : r.coverage_score >= 4 ? '\u26A0\uFE0F' : '\u274C';
        const color = r.coverage_score >= 7 ? 'text-green-400' : r.coverage_score >= 4 ? 'text-yellow-400' : 'text-red-400';
        logBufferRef.current.push({ text: `${icon} [${r.coverage_score}/10] ${r.gap_count}gaps ${r.contradiction_count}contr — ${r.question.slice(0, 80)} — ${r.latency_ms}ms`, color });
      } else if (data.type === 'complete') {
        stopFlushTimer();
        setSummary(data);
        setLogLines(prev => [...prev, { text: 'Gap analysis complete!', color: 'text-green-400' }]);
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

  // Sync running state on reconnect
  useEffect(() => {
    if (gapJob.status === 'running' && !running) {
      setRunning(true);
      setHistoryOpen(false);
    }
  }, [gapJob.status]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  // Load FAQ sources for filters
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/test-hub/api/db-stats');
        setFaqSources(data.faq_sources || []);
      } catch { /* ignore */ }
      try {
        const { data } = await api.get('/faq/stats');
        if (data?.categories) setFaqCategories(data.categories);
      } catch { /* ignore */ }
    })();
  }, []);

  const runGapAnalysis = async () => {
    setRunning(true);
    setHistoryOpen(false);
    setSummary(null);
    setGapResults([]);
    setLogLines([]);
    resultsBufferRef.current = [];
    logBufferRef.current = [];
    statsRef.current = { totalCov: 0, totalGaps: 0, totalContradictions: 0, cnt: 0 };
    setProgress({ index: 0, total: 0 });
    setLiveStats({ coverage: 0, gaps: 0, contradictions: 0, count: 0 });

    const params: Record<string, string> = {
      search_limit: String(searchLimit),
      search_threshold: String(threshold),
      boost_factor: String(boostFactor),
    };
    if (sourceFile) params.source_file = sourceFile;
    if (category) params.category = category;
    if (maxFaqs) params.max_faqs = maxFaqs;

    try {
      // The useTestHubJob.start sends query params but we also need a JSON body for client_persona.
      // Since start() uses api.post(endpoint, null, { params }), we need to send the persona differently.
      // We'll start the job manually and connect SSE via reconnect.
      const { data } = await api.post('/test-hub/api/run-gap-analysis', { client_persona: clientPersona || null, kb_context: kbContext || null }, { params });
      if (data.error) throw new Error(data.error);
      const jobId = data.job_id;
      gapJob.reconnect(jobId, []);
    } catch (e: any) {
      if (e.response?.status === 409) {
        setLogLines([{ text: `Error: ${e.response.data?.error || 'Another job is running'}`, color: 'text-red-400' }]);
      } else {
        setLogLines([{ text: `Error: ${e.message}`, color: 'text-red-400' }]);
      }
      setRunning(false);
    }
  };

  const pct = progress.total > 0 ? (progress.index / progress.total * 100) : 0;
  const covColor = (v: number) => v >= 7 ? 'text-green-400' : v >= 4 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      {/* Context inputs */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
        <div>
          <label className="text-xs text-muted block mb-1">Client Persona <span className="text-muted/60">(optional)</span></label>
          <textarea value={clientPersona} onChange={e => setClientPersona(e.target.value)}
            placeholder="Describe the client perspective, e.g. 'Small business owner with 5 employees, no HR department, first time dealing with TyEL insurance.' Leave empty to auto-generate per FAQ."
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-xs resize-none h-16" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">KB Scope & Context <span className="text-muted/60">(optional)</span></label>
          <textarea value={kbContext} onChange={e => setKbContext(e.target.value)}
            placeholder="Describe what the KB covers and what it intentionally excludes, e.g. 'The KB provides practical HR guidance but does not contain legal advice or specific legal interpretations. It focuses on Varma's own services and processes, not general pension legislation details.'"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-xs resize-none h-16" />
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted block mb-1">Source File</label>
          <select value={sourceFile} onChange={e => setSourceFile(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="">All</option>
            {faqSources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {faqCategories.length > 0 && (
          <div>
            <label className="text-xs text-muted block mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
              <option value="">All</option>
              {faqCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-muted block mb-1">Max FAQs</label>
          <input type="number" min="1" value={maxFaqs} onChange={e => setMaxFaqs(e.target.value)} placeholder="all"
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Search Limit</label>
          <input type="number" min="1" max="20" value={searchLimit} onChange={e => setSearchLimit(parseInt(e.target.value) || 5)}
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Threshold</label>
          <input type="number" step="0.05" min="0" max="1" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))}
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">FAQ Boost</label>
          <input type="number" step="0.1" min="0" max="5" value={boostFactor} onChange={e => setBoostFactor(parseFloat(e.target.value))}
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <button onClick={runGapAnalysis} disabled={running}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            running ? 'bg-white/10 text-muted cursor-not-allowed' : 'bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 border border-teal-500/30'
          }`}>
          {running ? 'Analyzing...' : 'Run Gap Analysis'}
        </button>
        {running && (
          <button onClick={() => gapJob.cancel()} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-colors">
            Cancel
          </button>
        )}
      </div>

      {/* Progress */}
      {(running || summary) && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-white font-medium">{running ? 'Analyzing...' : 'Complete'}</span>
              {!running && summary && gapResults.length > 0 && (
                <>
                  <button onClick={() => setReportOpen(true)}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-accent/20 text-blue-100 hover:bg-accent/30 border border-accent/40 transition-colors">
                    View Report
                  </button>
                  <button onClick={() => exportGapJSON(gapResults, summary)}
                    className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                    Export JSON
                  </button>
                </>
              )}
            </div>
            <span className="text-muted text-xs">{progress.index}/{progress.total}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          {liveStats.count > 0 && (
            <div className="flex gap-4 mt-2 text-xs text-muted">
              <span>Coverage: <span className={covColor(liveStats.coverage)}>{liveStats.coverage.toFixed(1)}/10</span></span>
              <span>Gaps: <span className="text-yellow-400">{liveStats.gaps}</span></span>
              <span>Contradictions: <span className="text-red-400">{liveStats.contradictions}</span></span>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <>
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="Avg Coverage" value={`${summary.metrics.avg_coverage_score.toFixed(1)}/10`}
              colorClass={covColor(summary.metrics.avg_coverage_score)} />
            <MetricCard label="Total Gaps" value={String(summary.metrics.total_gaps)}
              colorClass={summary.metrics.total_gaps > 0 ? 'text-yellow-400' : 'text-green-400'} />
            <MetricCard label="Critical Gaps" value={String(summary.metrics.critical_gaps)}
              colorClass={summary.metrics.critical_gaps > 0 ? 'text-red-400' : 'text-green-400'} />
            <MetricCard label="Contradictions" value={String(summary.metrics.total_contradictions)}
              colorClass={summary.metrics.total_contradictions > 0 ? 'text-red-400' : 'text-green-400'} />
            <MetricCard label="Unanswered" value={String(summary.metrics.total_unanswered)}
              colorClass={summary.metrics.total_unanswered > 0 ? 'text-orange-400' : 'text-green-400'} />
            <MetricCard label="Distribution" value={`${summary.metrics.distribution.high}H / ${summary.metrics.distribution.medium}M / ${summary.metrics.distribution.low}L`}
              sub={`${summary.metrics.total} FAQs`} />
          </div>

          {/* Category breakdown */}
          {Object.keys(summary.breakdowns.by_category).length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-white font-medium text-sm mb-3">By Category</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted">
                    <th className="text-left py-1">Category</th>
                    <th className="text-center">Count</th>
                    <th className="text-center">Avg Coverage</th>
                    <th className="text-center">Gaps</th>
                    <th className="text-center">Contradictions</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.breakdowns.by_category).map(([cat, info]) => (
                    <tr key={cat} className="border-t border-white/5">
                      <td className="py-1.5 text-gray-300 font-medium">{cat}</td>
                      <td className="text-center text-muted">{info.count}</td>
                      <td className={`text-center ${covColor(info.avg_coverage)}`}>{info.avg_coverage.toFixed(1)}</td>
                      <td className={`text-center ${info.gap_count > 0 ? 'text-yellow-400' : 'text-muted'}`}>{info.gap_count}</td>
                      <td className={`text-center ${info.contradiction_count > 0 ? 'text-red-400' : 'text-muted'}`}>{info.contradiction_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Top Gaps */}
          {summary.top_gaps.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-white font-medium text-sm mb-3">Top Gaps Across FAQs</h3>
              <div className="space-y-1">
                {summary.top_gaps.slice(0, 10).map((g, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${g.severity === 'critical' ? 'text-red-400 bg-red-500/20' : 'text-yellow-400 bg-yellow-500/20'}`}>
                      {g.severity}
                    </span>
                    <span className="text-white">{g.topic}</span>
                    <span className="text-muted">({g.count}x)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attention Needed */}
          {summary.attention_needed.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-white font-medium text-sm mb-3">FAQs Needing Attention</h3>
              <div className="space-y-1">
                {summary.attention_needed.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`font-bold ${covColor(a.coverage_score)}`}>{a.coverage_score}/10</span>
                    <span className="text-white truncate flex-1">{a.question}</span>
                    <span className="text-muted shrink-0">{a.gap_count} gaps</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <LiveLog logLines={logLines} logRef={logRef} emptyMessage="Run a gap analysis to see results..." />

      {summary && gapResults.length > 0 && (
        <GapReportModal
          isOpen={reportOpen}
          onClose={() => setReportOpen(false)}
          results={gapResults}
          runId={summary?.run_id}
          onResultUpdate={(faqId, newResult) => {
            setGapResults(prev => prev.map(r => r.faq_id === faqId ? newResult : r));
          }}
        />
      )}

      {/* Run History */}
      <div className="border-t border-white/10 pt-1">
        <button onClick={() => setHistoryOpen(prev => !prev)}
          className="w-full flex items-center justify-between py-2.5 text-sm hover:bg-white/[0.02] rounded-lg px-2 transition-colors">
          <span className="font-medium text-white">Run History</span>
          <span className="text-muted text-xs">{historyOpen ? '\u25B2 Collapse' : '\u25BC Expand'}</span>
        </button>
        {historyOpen && !running && <GapHistoryTab />}
        {historyOpen && running && (
          <div className="text-muted text-xs text-center py-4">History hidden while analysis is running</div>
        )}
      </div>
    </div>
  );
};
