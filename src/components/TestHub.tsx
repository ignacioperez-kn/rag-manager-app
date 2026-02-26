import { useState, useEffect, useRef } from 'react';
import { api, supabase } from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SubTab = 'dashboard' | 'search' | 'eval' | 'history' | 'inspector';

interface DbStats {
  documents: {
    total: number;
    by_type: Record<string, { count: number; processed: number }>;
    list: { id: string; name: string; type: string; processed: boolean; created: string }[];
  };
  chunks: { document_chunks: number; faq_chunks: number; total: number };
  faq_sources: string[];
  faq_pair_count: number;
}

interface SearchResult {
  similarity: number;
  content_score: number;
  norm_content_score: number;
  final_score: number;
  source_type: string;
  title: string;
  body_preview: string;
  matched_via: string;
  category: string;
  faq_id: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  raw_count: number;
  timing: { embedding_ms: number; search_ms: number; total_ms: number };
}

interface EvalResult {
  id: string;
  query: string;
  difficulty: string;
  hit_at_1: boolean;
  hit_at_n: boolean;
  rank: number | null;
  reciprocal_rank: number;
  latency_ms: number;
  error: string | null;
}

interface EvalSummary {
  metrics: {
    total: number;
    top_n: number;
    hit_rate_1: number;
    hit_rate_n: number;
    mrr: number;
    error_count: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
  };
  breakdowns: {
    by_difficulty: Record<string, { count: number; hit_rate_1: number; hit_rate_n: number; mrr: number }>;
  };
  gaps: {
    missed: { id: string; query: string }[];
    zero_results: { id: string; query: string }[];
    low_rank: { id: string; query: string; rank: number }[];
  };
  saved_to?: string;
}

interface HistoryRun {
  file: string;
  hit_rate_1: number;
  hit_rate_n: number;
  mrr: number;
  total: number;
  avg_latency_ms: number;
}

// ---------------------------------------------------------------------------
// Score bar component
// ---------------------------------------------------------------------------
const ScoreBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="flex-1">
    <div className="flex justify-between mb-0.5 text-xs">
      <span className="text-muted">{label}</span>
      <span className={color}>{(value * 100).toFixed(1)}%</span>
    </div>
    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
      <div className={`h-full rounded-full ${color.replace('text-', 'bg-')}`} style={{ width: `${value * 100}%` }} />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------
const MetricCard = ({ label, value, sub, colorClass }: { label: string; value: string; sub?: string; colorClass?: string }) => (
  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
    <div className="text-xs text-muted mb-1">{label}</div>
    <div className={`text-2xl font-bold ${colorClass || 'text-white'}`}>{value}</div>
    {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
  </div>
);

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
const Badge = ({ children, variant = 'blue' }: { children: React.ReactNode; variant?: 'blue' | 'green' | 'yellow' | 'red' }) => {
  const colors = {
    blue: 'bg-accent/20 text-accent',
    green: 'bg-green-500/20 text-green-400',
    yellow: 'bg-yellow-500/20 text-yellow-400',
    red: 'bg-red-500/20 text-red-400',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[variant]}`}>{children}</span>;
};

// ============================= MAIN COMPONENT =============================
export const TestHub = () => {
  const [subTab, setSubTab] = useState<SubTab>('dashboard');

  const subTabs: { key: SubTab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'search', label: 'Query Playground' },
    { key: 'eval', label: 'Eval Runner' },
    { key: 'history', label: 'History' },
    { key: 'inspector', label: 'Chunk Inspector' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {subTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              subTab === t.key
                ? 'bg-accent/20 text-blue-100 border border-accent/20'
                : 'text-muted hover:text-white bg-white/5 border border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        {subTab === 'dashboard' && <DashboardTab />}
        {subTab === 'search' && <SearchTab />}
        {subTab === 'eval' && <EvalTab />}
        {subTab === 'history' && <HistoryTab />}
        {subTab === 'inspector' && <InspectorTab />}
      </div>
    </div>
  );
};

// ============================= DASHBOARD =============================
const DashboardTab = () => {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/test-hub/api/db-stats');
        setStats(data);
      } catch (e: any) {
        setError(e.response?.data?.detail || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-muted text-sm">Loading database stats...</div>;
  if (error) return <div className="text-red-400 text-sm">Error: {error}</div>;
  if (!stats) return null;

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Documents" value={String(stats.documents.total)} />
        <MetricCard label="Doc Chunks" value={String(stats.chunks.document_chunks)} />
        <MetricCard label="FAQ Pairs" value={String(stats.faq_pair_count)} />
        <MetricCard label="Total Embeddings" value={String(stats.chunks.total)} colorClass="text-accent" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Documents list */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-white font-medium text-sm mb-3">Documents</h3>
          <div className="space-y-1.5 text-xs max-h-64 overflow-y-auto custom-scrollbar">
            {stats.documents.list.length === 0 && <span className="text-muted">No documents</span>}
            {stats.documents.list.map(d => (
              <div key={d.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/5">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge>{d.type}</Badge>
                  <span className="text-gray-300 truncate">{d.name}</span>
                </div>
                <Badge variant={d.processed ? 'green' : 'yellow'}>{d.processed ? 'processed' : 'pending'}</Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Type breakdown + FAQ sources */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-white font-medium text-sm mb-3">By Type</h3>
          <div className="space-y-3">
            {Object.entries(stats.documents.by_type).map(([type, info]) => (
              <div key={type}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300 font-medium">{type.toUpperCase()}</span>
                  <span className="text-muted">{info.processed}/{info.count} processed</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${info.count ? (info.processed / info.count * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>

          <h3 className="text-white font-medium text-sm mt-4 mb-2">FAQ Sources</h3>
          <div className="space-y-1 text-xs">
            {stats.faq_sources.length === 0 && <span className="text-muted">No FAQ sources</span>}
            {stats.faq_sources.map(s => (
              <div key={s} className="py-1 px-2 rounded hover:bg-white/5 text-gray-300">{s}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================= SEARCH PLAYGROUND =============================
const SearchTab = () => {
  const [query, setQuery] = useState('');
  const [threshold, setThreshold] = useState(0.7);
  const [limit, setLimit] = useState(10);
  const [includeFaq, setIncludeFaq] = useState(true);
  const [boostFactor, setBoostFactor] = useState(1.0);
  const [searching, setSearching] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState('');

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const { data } = await api.get('/test-hub/api/search', {
        params: { query, threshold, limit, include_faq: includeFaq, boost_factor: boostFactor },
      });
      setResponse(data);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <form onSubmit={handleSearch} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a search query..."
            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-accent text-sm"
          />
          <button
            type="submit"
            disabled={searching}
            className="bg-accent/20 border border-accent/40 text-blue-100 px-5 py-2 rounded-xl hover:bg-accent/30 transition-colors font-medium disabled:opacity-50 text-sm"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
        <div className="flex gap-4 text-sm items-center">
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs">Threshold</label>
            <input type="number" step="0.05" min="0" max="1" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-center text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs">Limit</label>
            <input type="number" min="1" max="50" value={limit} onChange={e => setLimit(parseInt(e.target.value))}
              className="w-14 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-center text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs">FAQ</label>
            <select value={String(includeFaq)} onChange={e => setIncludeFaq(e.target.value === 'true')}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs">
              <option value="true">Include</option>
              <option value="false">Exclude</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs">FAQ Boost</label>
            <input type="number" step="0.1" min="0" max="5" value={boostFactor} onChange={e => setBoostFactor(parseFloat(e.target.value))}
              className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-center text-xs" />
          </div>
        </div>
      </form>

      {/* Timing */}
      {response && (
        <div className="text-xs text-muted flex gap-3">
          <span className="text-accent">Embed: {response.timing.embedding_ms}ms</span>
          <span className="text-green-400">Search: {response.timing.search_ms}ms</span>
          <span className="text-white">Total: {response.timing.total_ms}ms</span>
          <span>{response.raw_count} raw &rarr; {response.results.length} returned</span>
        </div>
      )}

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {/* Results */}
      <div className="space-y-2">
        {response?.results.map((r, i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/[0.07] transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted">#{i + 1}</span>
                <Badge>{r.source_type}</Badge>
                {r.matched_via && <Badge variant="yellow">{r.matched_via}</Badge>}
                {r.category && <Badge variant="green">{r.category}</Badge>}
              </div>
              <span className="text-sm font-bold text-white">{(r.final_score * 100).toFixed(1)}%</span>
            </div>
            <div className="text-sm font-medium text-gray-200 mb-1">{r.title || 'No title'}</div>
            <div className="text-xs text-muted mb-3 line-clamp-2">{r.body_preview}</div>
            <div className="flex gap-3">
              <ScoreBar label="Similarity" value={r.similarity} color="text-accent" />
              <ScoreBar label="Content" value={r.norm_content_score} color="text-green-400" />
              <ScoreBar label="Final (0.7/0.3)" value={r.final_score} color="text-yellow-400" />
            </div>
          </div>
        ))}
        {response && response.results.length === 0 && (
          <div className="text-muted text-sm text-center py-8">No results</div>
        )}
      </div>
    </div>
  );
};

// ============================= EVAL RUNNER =============================
const EvalTab = () => {
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
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (text: string, color: string) => {
    setLogLines(prev => [...prev, { text, color }]);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  const runEval = async () => {
    setRunning(true);
    setSummary(null);
    setLogLines([]);
    setProgress({ index: 0, total: 0 });
    setLiveStats({ hits1: 0, hitsN: 0, count: 0 });

    const params = new URLSearchParams({
      source,
      top_n: String(topN),
      threshold: String(threshold),
      boost_factor: String(boostFactor),
    });
    if (difficulty) params.set('difficulty', difficulty);
    if (maxCases) params.set('max_cases', maxCases);

    try {
      // We need to manually add the auth header for fetch (not axios)
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const baseUrl = api.defaults.baseURL?.replace(/\/+$/, '') || '';
      const res = await fetch(`${baseUrl}/test-hub/api/run-eval?${params}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let h1 = 0, hN = 0, cnt = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'start') {
            addLog(`Starting evaluation: ${data.total} test cases`, 'text-accent');
            setProgress({ index: 0, total: data.total });
          } else if (data.type === 'progress') {
            const r: EvalResult = data.result;
            cnt++;
            if (r.hit_at_1) h1++;
            if (r.hit_at_n) hN++;
            setProgress({ index: data.index, total: data.total });
            setLiveStats({ hits1: h1, hitsN: hN, count: cnt });

            const icon = r.hit_at_1 ? '\u2705' : r.hit_at_n ? '\u2B55' : '\u274C';
            const color = r.hit_at_1 ? 'text-green-400' : r.hit_at_n ? 'text-yellow-400' : 'text-red-400';
            addLog(`${icon} [${r.id}] ${r.query} (${r.difficulty}) — rank: ${r.rank ?? 'miss'} — ${r.latency_ms}ms`, color);
          } else if (data.type === 'complete') {
            setSummary(data);
            addLog('Evaluation complete!', 'text-green-400');
            if (data.saved_to) addLog(`Saved to: ${data.saved_to}`, 'text-muted');
          }
        }
      }
    } catch (e: any) {
      addLog(`Error: ${e.message}`, 'text-red-400');
    }

    setRunning(false);
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
            <option value="auto">Auto-generated</option>
            <option value="manual">Manual</option>
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
        <button onClick={runEval} disabled={running}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            running ? 'bg-white/10 text-muted cursor-not-allowed' : 'bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/30'
          }`}>
          {running ? 'Running...' : 'Run Evaluation'}
        </button>
      </div>

      {/* Progress */}
      {(running || summary) && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex justify-between mb-2 text-sm">
            <span className="text-white font-medium">{running ? 'Running...' : 'Complete'}</span>
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
          <div className="grid grid-cols-4 gap-3">
            <MetricCard label="Hit Rate @1" value={`${(summary.metrics.hit_rate_1 * 100).toFixed(1)}%`}
              colorClass={summary.metrics.hit_rate_1 > 0.7 ? 'text-green-400' : summary.metrics.hit_rate_1 > 0.4 ? 'text-yellow-400' : 'text-red-400'} />
            <MetricCard label={`Hit Rate @${summary.metrics.top_n}`} value={`${(summary.metrics.hit_rate_n * 100).toFixed(1)}%`}
              colorClass={summary.metrics.hit_rate_n > 0.8 ? 'text-green-400' : summary.metrics.hit_rate_n > 0.5 ? 'text-yellow-400' : 'text-red-400'} />
            <MetricCard label="MRR" value={summary.metrics.mrr.toFixed(4)} colorClass="text-accent" />
            <MetricCard label="Avg Latency" value={`${summary.metrics.avg_latency_ms}ms`} sub={`p95: ${summary.metrics.p95_latency_ms}ms`} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Difficulty breakdown */}
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

            {/* Gap report */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-white font-medium text-sm mb-3">Gap Report</h3>
              <div className="text-xs space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {summary.gaps.zero_results.length > 0 && (
                  <div>
                    <div className="text-red-400 font-semibold">{summary.gaps.zero_results.length} queries returned ZERO results</div>
                    {summary.gaps.zero_results.slice(0, 5).map(r => (
                      <div key={r.id} className="pl-2 text-muted">[{r.id}] {r.query}</div>
                    ))}
                  </div>
                )}
                {summary.gaps.missed.length > 0 && (
                  <div>
                    <div className="text-yellow-400 font-semibold">{summary.gaps.missed.length} expected results NOT in top-N</div>
                    {summary.gaps.missed.slice(0, 5).map(r => (
                      <div key={r.id} className="pl-2 text-muted">[{r.id}] {r.query}</div>
                    ))}
                  </div>
                )}
                {summary.gaps.low_rank.length > 0 && (
                  <div>
                    <div className="text-accent font-semibold">{summary.gaps.low_rank.length} found but NOT at rank 1</div>
                    {summary.gaps.low_rank.slice(0, 5).map(r => (
                      <div key={r.id} className="pl-2 text-muted">[{r.id}] rank={r.rank} {r.query}</div>
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

      {/* Live log */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-white font-medium text-sm mb-2">Live Log</h3>
        <div ref={logRef} className="max-h-60 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5">
          {logLines.length === 0 && <span className="text-muted">Run an evaluation to see results...</span>}
          {logLines.map((l, i) => (
            <div key={i} className={l.color}>{l.text}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================= HISTORY =============================
const HistoryTab = () => {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ file: string; results: EvalResult[] } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/test-hub/api/eval-history');
        setRuns(data.runs || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadDetail = async (file: string) => {
    try {
      const { data } = await api.get(`/test-hub/api/eval-result/${file}`);
      setDetail({ file, results: data.results || [] });
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  if (loading) return <div className="text-muted text-sm">Loading history...</div>;

  if (detail) {
    return (
      <div className="space-y-2">
        <button onClick={() => setDetail(null)} className="text-xs text-accent hover:underline mb-2">&larr; Back to list</button>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-white font-medium text-sm mb-3">{detail.file} &mdash; {detail.results.length} cases</h3>
          <div className="max-h-96 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5">
            {detail.results.map(r => {
              const icon = r.hit_at_1 ? '\u2705' : r.hit_at_n ? '\u2B55' : '\u274C';
              const color = r.hit_at_1 ? 'text-green-400' : r.hit_at_n ? 'text-yellow-400' : 'text-red-400';
              return <div key={r.id} className={color}>{icon} [{r.id}] {r.query} — rank: {r.rank ?? 'miss'} — {r.latency_ms}ms ({r.difficulty})</div>;
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.length === 0 && <div className="text-muted text-sm">No evaluation runs yet</div>}
      {runs.map(r => (
        <div key={r.file} onClick={() => loadDetail(r.file)}
          className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.07] cursor-pointer transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-200">{r.file}</span>
              <span className="text-xs text-muted ml-2">{r.total} cases</span>
            </div>
            <div className="flex gap-4 text-xs">
              <span>Hit@1: <span className={`font-bold ${r.hit_rate_1 > 0.7 ? 'text-green-400' : 'text-red-400'}`}>{(r.hit_rate_1 * 100).toFixed(1)}%</span></span>
              <span>Hit@N: <span className={`font-bold ${r.hit_rate_n > 0.8 ? 'text-green-400' : 'text-red-400'}`}>{(r.hit_rate_n * 100).toFixed(1)}%</span></span>
              <span>MRR: <span className="font-bold text-accent">{r.mrr ? r.mrr.toFixed(3) : '\u2014'}</span></span>
              <span>Latency: <span className="text-gray-300">{r.avg_latency_ms ? `${r.avg_latency_ms}ms` : '\u2014'}</span></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================= CHUNK INSPECTOR =============================
const InspectorTab = () => {
  const [sourceType, setSourceType] = useState('all');
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [chunks, setChunks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadChunks = async (p: number = page) => {
    setLoading(true);
    try {
      const { data } = await api.get('/test-hub/api/sample-chunks', {
        params: { source_type: sourceType, limit, page: p },
      });
      setChunks(data.chunks || []);
      setTotalPages(data.total_pages || 1);
      setTotalCount(data.total_count || 0);
      setPage(data.page || p);
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    loadChunks(p);
  };

  // Build visible page numbers (max 5 around current)
  const pageNumbers = () => {
    const pages: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted block mb-1">Source Type</label>
          <select value={sourceType} onChange={e => { setSourceType(e.target.value); setPage(1); }}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="all">All</option>
            <option value="document">Documents Only</option>
            <option value="faq">FAQ Only</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Per Page</label>
          <input type="number" min="1" max="50" value={limit} onChange={e => { setLimit(parseInt(e.target.value) || 10); setPage(1); }}
            className="w-14 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <button onClick={() => { setPage(1); loadChunks(1); }} disabled={loading}
          className="bg-accent/20 border border-accent/40 text-blue-100 px-4 py-1.5 rounded-lg hover:bg-accent/30 transition-colors text-sm font-medium disabled:opacity-50">
          {loading ? 'Loading...' : 'Load Chunks'}
        </button>
        {totalCount > 0 && (
          <span className="text-xs text-muted ml-auto">{totalCount} total chunks</span>
        )}
      </div>

      {/* Chunk list */}
      <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
        {chunks.length === 0 && !loading && <div className="text-muted text-sm text-center py-6">Click "Load Chunks" to inspect database contents</div>}
        {chunks.map(c => (
          <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={c.type === 'faq' ? 'green' : 'blue'}>{c.type}</Badge>
              {c.chunk_id != null && <span className="text-xs text-muted font-mono">#{c.chunk_id}</span>}
              {c.chunk_type && <Badge variant="yellow">{c.chunk_type}</Badge>}
              {c.source_file && <span className="text-xs text-muted">{c.source_file}</span>}
              {c.boost_factor != null && <span className="text-xs text-muted">boost: {c.boost_factor}</span>}
            </div>
            <div className="text-sm font-medium text-gray-200 mb-1">{c.title || 'No title'}</div>
            <div className="text-xs text-muted mb-2">{c.body_preview}</div>
            {c.summary && <div className="text-xs text-muted/70 italic">{c.summary}</div>}
            {c.category && <div className="text-xs text-muted/70 mt-1">Category: {c.category}</div>}
            {c.metadata && (
              <details className="mt-2">
                <summary className="text-xs text-muted cursor-pointer hover:text-white">Metadata</summary>
                <pre className="text-xs text-muted/60 mt-1 bg-black/20 p-2 rounded-lg overflow-x-auto">{JSON.stringify(c.metadata, null, 2)}</pre>
              </details>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-2">
          <button onClick={() => goToPage(page - 1)} disabled={page <= 1 || loading}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/5 text-muted hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            &laquo; Prev
          </button>
          {pageNumbers().map(p => (
            <button key={p} onClick={() => goToPage(p)} disabled={loading}
              className={`w-8 py-1 text-xs rounded-lg transition-colors ${
                p === page
                  ? 'bg-accent/20 text-blue-100 border border-accent/20'
                  : 'bg-white/5 text-muted hover:text-white hover:bg-white/10'
              }`}>
              {p}
            </button>
          ))}
          <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages || loading}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/5 text-muted hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            Next &raquo;
          </button>
        </div>
      )}
    </div>
  );
};
