import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../../lib/api';
import type { EvalResult, EvalSummary, SearchResult, StatusFilter, MODAL_PAGE_SIZE as _ } from '../types';
import { MODAL_PAGE_SIZE } from '../types';
import { ScoreBar } from '../ui/ScoreBar';
import { MetricCard } from '../ui/MetricCard';
import { Badge } from '../ui/Badge';
import { DifficultyExcludeChips } from '../ui/DifficultyExcludeChips';

interface EvalReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: EvalResult[];
  summary: EvalSummary;
  evalParams?: { threshold: number; boostFactor: number };
}

export const EvalReportModal = ({ isOpen, onClose, results, summary, evalParams }: EvalReportModalProps) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [excludedDifficulties, setExcludedDifficulties] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState('');
  const [querySearch, setQuerySearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chunkCache, setChunkCache] = useState<Record<string, SearchResult[]>>({});
  const [chunkLoading, setChunkLoading] = useState<string | null>(null);
  const [resultPage, setResultPage] = useState(0);

  const categories = Array.from(new Set(results.map(r => r.category).filter(Boolean))).sort();

  const toggleDifficulty = (d: string) => {
    setExcludedDifficulties(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  useEffect(() => { setResultPage(0); }, [statusFilter, excludedDifficulties, categoryFilter, querySearch]);

  const filtered = results.filter(r => {
    if (statusFilter === 'hit1' && !r.hit_at_1) return false;
    if (statusFilter === 'hitN' && (!r.hit_at_n || r.hit_at_1)) return false;
    if (statusFilter === 'miss' && r.hit_at_n) return false;
    if (excludedDifficulties.has(r.difficulty)) return false;
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (querySearch && !r.query.toLowerCase().includes(querySearch.toLowerCase())) return false;
    return true;
  });

  const totalResultPages = Math.ceil(filtered.length / MODAL_PAGE_SIZE);
  const pageResults = filtered.slice(resultPage * MODAL_PAGE_SIZE, (resultPage + 1) * MODAL_PAGE_SIZE);

  const fetchChunks = useCallback(async (query: string) => {
    if (chunkCache[query]) return;
    setChunkLoading(query);
    try {
      const { data } = await api.get('/test-hub/api/search', {
        params: {
          query,
          threshold: evalParams?.threshold ?? 0.5,
          limit: 10,
          include_faq: true,
          boost_factor: evalParams?.boostFactor ?? 1.0,
        },
      });
      setChunkCache(prev => ({ ...prev, [query]: data.results || [] }));
    } catch {
      setChunkCache(prev => ({ ...prev, [query]: [] }));
    } finally {
      setChunkLoading(null);
    }
  }, [chunkCache, evalParams]);

  const toggleExpand = (r: EvalResult) => {
    if (expandedId === r.id) {
      setExpandedId(null);
    } else {
      setExpandedId(r.id);
      fetchChunks(r.query);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fTotal = filtered.length;
  const fHit1 = filtered.filter(r => r.hit_at_1).length;
  const fHitN = filtered.filter(r => r.hit_at_n).length;
  const fMrr = fTotal ? filtered.reduce((s, r) => s + r.reciprocal_rank, 0) / fTotal : 0;
  const fLatencies = filtered.map(r => r.latency_ms).filter(l => l > 0);
  const fAvgLat = fLatencies.length ? fLatencies.reduce((a, b) => a + b, 0) / fLatencies.length : 0;
  const fSortedLat = [...fLatencies].sort((a, b) => a - b);
  const fP95Lat = fSortedLat.length ? fSortedLat[Math.floor(fSortedLat.length * 0.95)] : 0;
  const fHitRate1 = fTotal ? fHit1 / fTotal : 0;
  const fHitRateN = fTotal ? fHitN / fTotal : 0;
  const isFiltered = filtered.length !== results.length;

  const statusButtons: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: results.length },
    { key: 'hit1', label: 'Hit@1', count: results.filter(r => r.hit_at_1).length },
    { key: 'hitN', label: 'Hit@N', count: results.filter(r => r.hit_at_n && !r.hit_at_1).length },
    { key: 'miss', label: 'Miss', count: results.filter(r => !r.hit_at_n).length },
  ];

  const modalUI = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/5 shrink-0">
          <h3 className="text-white font-medium">Eval Report <span className="text-muted text-sm font-normal ml-1">({results.length} cases{isFiltered ? `, ${filtered.length} shown` : ''})</span></h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Summary metrics row */}
        <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-white/10 shrink-0">
          <MetricCard label="Hit Rate @1" value={`${(fHitRate1 * 100).toFixed(1)}%`} sub={isFiltered ? `${fHit1}/${fTotal}` : undefined}
            colorClass={fHitRate1 > 0.7 ? 'text-green-400' : fHitRate1 > 0.4 ? 'text-yellow-400' : 'text-red-400'} />
          <MetricCard label={`Hit Rate @${summary.metrics.top_n}`} value={`${(fHitRateN * 100).toFixed(1)}%`} sub={isFiltered ? `${fHitN}/${fTotal}` : undefined}
            colorClass={fHitRateN > 0.8 ? 'text-green-400' : fHitRateN > 0.5 ? 'text-yellow-400' : 'text-red-400'} />
          <MetricCard label="MRR" value={fMrr.toFixed(4)} colorClass="text-accent" />
          <MetricCard label="Avg Latency" value={`${Math.round(fAvgLat)}ms`} sub={`p95: ${Math.round(fP95Lat)}ms`} />
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/10 shrink-0 flex-wrap">
          <div className="flex gap-1">
            {statusButtons.map(s => (
              <button key={s.key} onClick={() => setStatusFilter(s.key)}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  statusFilter === s.key
                    ? 'bg-accent/20 text-blue-100 border border-accent/20'
                    : 'text-muted hover:text-white bg-white/5 border border-transparent'
                }`}>
                {s.label} <span className="text-muted ml-0.5">{s.count}</span>
              </button>
            ))}
          </div>

          <DifficultyExcludeChips items={results} excluded={excludedDifficulties} onToggle={toggleDifficulty} />

          {categories.length > 0 && (
            <div className="w-[180px] shrink-0">
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs" style={{ textOverflow: 'ellipsis' }}>
                <option value="">All categories</option>
                {categories.map(c => <option key={c} value={c}>{c.length > 40 ? c.slice(0, 40) + '...' : c}</option>)}
              </select>
            </div>
          )}

          <input value={querySearch} onChange={e => setQuerySearch(e.target.value)}
            placeholder="Search queries..."
            className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white placeholder-white/20 text-xs w-48 focus:outline-none focus:border-accent" />

          <span className="text-xs text-muted ml-auto">Showing {filtered.length} of {results.length}</span>
        </div>

        {/* Result list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-3 space-y-1">
          {filtered.length === 0 && (
            <div className="text-muted text-sm text-center py-8">No results match the current filters</div>
          )}
          {pageResults.map(r => {
            const isExpanded = expandedId === r.id;
            const statusIcon = r.hit_at_1 ? '\u2705' : r.hit_at_n ? '\u26A0\uFE0F' : '\u274C';
            const statusColor = r.hit_at_1 ? 'border-l-green-500' : r.hit_at_n ? 'border-l-yellow-500' : 'border-l-red-500';
            const chunks = chunkCache[r.query];
            const isLoadingChunks = chunkLoading === r.query;

            return (
              <div key={r.id} className={`border-l-2 ${statusColor} bg-white/5 border border-white/10 rounded-r-lg overflow-hidden`}>
                <button onClick={() => toggleExpand(r)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors">
                  <span className="text-sm shrink-0">{statusIcon}</span>
                  <span className="text-sm text-gray-200 truncate flex-1 min-w-0">{r.query}</span>
                  <Badge variant={r.difficulty === 'exact' ? 'green' : r.difficulty === 'paraphrase' ? 'yellow' : r.difficulty === 'followup' ? 'red' : 'blue'}>{r.difficulty}</Badge>
                  {r.match_details?.source_type && <Badge>{r.match_details.source_type}</Badge>}
                  {r.category && <span className="text-xs text-muted truncate max-w-[80px]">{r.category}</span>}
                  <span className={`text-xs font-mono shrink-0 ${r.hit_at_1 ? 'text-green-400' : r.hit_at_n ? 'text-yellow-400' : 'text-red-400'}`}>
                    {r.rank ? `#${r.rank}` : 'miss'}
                  </span>
                  <span className="text-xs text-muted shrink-0 w-14 text-right">{r.latency_ms}ms</span>
                  <span className="text-muted text-xs shrink-0">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 pt-1 border-t border-white/5 bg-black/20">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-muted">Retrieved chunks for this query:</div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const payload = { ...r, retrieved_chunks: chunks || [] };
                          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `eval_${r.id.slice(0, 8)}_${r.difficulty}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="px-2 py-0.5 rounded text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 transition-colors">
                        Export JSON
                      </button>
                    </div>
                    {isLoadingChunks && !chunks && (
                      <div className="text-xs text-muted py-4 text-center animate-pulse">Loading chunks...</div>
                    )}
                    {chunks && chunks.length === 0 && (
                      <div className="text-xs text-red-400 py-2">No chunks retrieved</div>
                    )}
                    {chunks && chunks.length > 0 && (
                      <div className="space-y-1.5">
                        {chunks.map((c, ci) => {
                          const isMatch = r.match_details && r.match_details.rank === ci + 1;
                          return (
                            <div key={ci}
                              className={`rounded-lg p-2.5 border ${
                                isMatch
                                  ? 'border-green-500/40 bg-green-500/5 border-l-2 border-l-green-400'
                                  : 'border-white/5 bg-white/[0.02]'
                              }`}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-xs font-mono text-muted">#{ci + 1}</span>
                                <Badge variant={c.source_type === 'faq' ? 'green' : 'blue'}>{c.source_type}</Badge>
                                <span className="text-xs text-gray-300 truncate flex-1">{c.title || 'No title'}</span>
                                {isMatch && <span className="text-yellow-400 text-sm" title="Matched chunk">&#9733;</span>}
                                <span className="text-xs font-bold text-white">{(c.final_score * 100).toFixed(1)}%</span>
                              </div>
                              <div className="text-xs text-muted line-clamp-2 mb-2">{c.body_preview}</div>
                              <div className="flex gap-3">
                                <ScoreBar label="Similarity" value={c.similarity} color="text-accent" />
                                <ScoreBar label="Content" value={c.norm_content_score} color="text-green-400" />
                                <ScoreBar label="Final" value={c.final_score} color="text-yellow-400" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalResultPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-2.5 border-t border-white/10 shrink-0 px-5">
            <button onClick={() => setResultPage(p => Math.max(0, p - 1))} disabled={resultPage === 0}
              className="px-2.5 py-1 text-xs rounded-lg bg-white/5 text-muted hover:text-white disabled:opacity-30">Prev</button>
            <span className="text-xs text-muted">Page {resultPage + 1} of {totalResultPages}</span>
            <button onClick={() => setResultPage(p => Math.min(totalResultPages - 1, p + 1))} disabled={resultPage >= totalResultPages - 1}
              className="px-2.5 py-1 text-xs rounded-lg bg-white/5 text-muted hover:text-white disabled:opacity-30">Next</button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalUI, document.body);
};
