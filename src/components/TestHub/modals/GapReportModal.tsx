import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api, searchApi } from '../../../lib/api';
import type { GapAnalysisResult } from '../types';

type ChunkResult = { title: string; content: string; file_name: string; source_type: string; score: number; source_location: string };
type LoadedChunks = Record<string, { loading: boolean; chunks: ChunkResult[] }>;

interface GapReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: GapAnalysisResult[];
  runId?: string;
  onResultUpdate?: (faqId: string, newResult: GapAnalysisResult) => void;
}

export const GapReportModal = ({ isOpen, onClose, results, runId, onResultUpdate }: GapReportModalProps) => {
  const [filter, setFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [catFilter, setCatFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loadedChunks, setLoadedChunks] = useState<LoadedChunks>({});
  const [reEvaluating, setReEvaluating] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const categories = [...new Set(results.map(r => r.category).filter(Boolean))];

  const filtered = results.filter(r => {
    if (filter === 'low' && r.coverage_score >= 4) return false;
    if (filter === 'medium' && (r.coverage_score < 4 || r.coverage_score >= 7)) return false;
    if (filter === 'high' && r.coverage_score < 7) return false;
    if (catFilter && r.category !== catFilter) return false;
    if (searchText && !r.question.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const sevColor = (s: string) => s === 'critical' ? 'text-red-400 bg-red-500/20' : s === 'important' ? 'text-yellow-400 bg-yellow-500/20' : 'text-blue-400 bg-blue-500/20';
  const covBg = (v: number) => v >= 7 ? 'bg-green-500/20 border-green-500/30' : v >= 4 ? 'bg-yellow-500/20 border-yellow-500/30' : 'bg-red-500/20 border-red-500/30';

  /** Build the list of all queries used for a given result */
  const getQueries = (r: GapAnalysisResult) => {
    const queries: { type: string; label: string; query: string }[] = [];
    queries.push({ type: 'direct', label: 'Direct search', query: r.question });
    for (const fq of r.investigation?.follow_up_questions || []) {
      queries.push({ type: 'followup', label: `Follow-up`, query: fq.question });
    }
    for (const ec of r.investigation?.edge_cases || []) {
      queries.push({ type: 'edge', label: `Edge case`, query: ec.question });
    }
    for (const q of r.investigation?.cross_reference_queries || []) {
      queries.push({ type: 'crossref', label: `Cross-ref`, query: q });
    }
    return queries;
  };

  const handleShowChunks = async (key: string, query: string, params: GapAnalysisResult['search_params']) => {
    if (loadedChunks[key]?.chunks.length) {
      setLoadedChunks(prev => { const next = { ...prev }; delete next[key]; return next; });
      return;
    }
    setLoadedChunks(prev => ({ ...prev, [key]: { loading: true, chunks: [] } }));
    try {
      const res = await searchApi.search(query, params?.limit || 5, params?.threshold || 0.5);
      setLoadedChunks(prev => ({ ...prev, [key]: { loading: false, chunks: res.data.results } }));
    } catch {
      setLoadedChunks(prev => ({ ...prev, [key]: { loading: false, chunks: [] } }));
    }
  };

  const handleReEvaluate = async (faqId: string) => {
    if (!runId) return;
    setReEvaluating(prev => ({ ...prev, [faqId]: true }));
    try {
      const { data } = await api.post(`/test-hub/api/re-evaluate-case/${runId}/${faqId}`);
      onResultUpdate?.(faqId, data.result);
    } catch (e: any) {
      alert(`Re-evaluate failed: ${e.response?.data?.error || e.message}`);
    } finally {
      setReEvaluating(prev => ({ ...prev, [faqId]: false }));
    }
  };

  const typeBadge = (type: string) => {
    const colors: Record<string, string> = {
      direct: 'bg-blue-500/20 text-blue-400',
      followup: 'bg-purple-500/20 text-purple-400',
      edge: 'bg-orange-500/20 text-orange-400',
      crossref: 'bg-cyan-500/20 text-cyan-400',
    };
    return colors[type] || 'bg-white/10 text-muted';
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8">
      <div className="bg-[#0f1a2e] border border-white/10 rounded-2xl w-[90vw] max-w-5xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-base">Gap Analysis Report — {filtered.length}/{results.length} FAQs</h2>
          <button onClick={onClose} className="text-muted hover:text-white text-lg">&times;</button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-6 py-3 border-b border-white/10 flex-wrap items-center">
          <select value={filter} onChange={e => setFilter(e.target.value as any)} className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs">
            <option value="all">All Coverage</option>
            <option value="low">Low (&lt;4)</option>
            <option value="medium">Medium (4-6)</option>
            <option value="high">High (7+)</option>
          </select>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search questions..."
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs flex-1 min-w-[200px]" />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-3 custom-scrollbar space-y-2">
          {filtered.map(r => {
            const queries = getQueries(r);
            const isReEval = reEvaluating[r.faq_id];
            return (
            <div key={r.faq_id} className={`border border-white/10 rounded-xl overflow-hidden ${isReEval ? 'opacity-60' : ''}`}>
              {/* Row header */}
              <button onClick={() => setExpanded(expanded === r.faq_id ? null : r.faq_id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${covBg(r.coverage_score)}`}>
                  {r.coverage_score}/10
                </span>
                <span className="text-white text-sm flex-1 truncate">{r.question}</span>
                <div className="flex gap-3 text-xs text-muted shrink-0">
                  {r.gap_count > 0 && <span className="text-yellow-400">{r.gap_count} gaps</span>}
                  {r.contradiction_count > 0 && <span className="text-red-400">{r.contradiction_count} contradictions</span>}
                  {r.unanswered_followup_count > 0 && <span className="text-orange-400">{r.unanswered_followup_count} unanswered</span>}
                </div>
                <span className="text-muted text-xs">{expanded === r.faq_id ? '\u25B2' : '\u25BC'}</span>
              </button>

              {/* Expanded detail */}
              {expanded === r.faq_id && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/10 bg-white/[0.02]">
                  {/* Re-evaluate button */}
                  {runId && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReEvaluate(r.faq_id); }}
                        disabled={isReEval}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/20 text-blue-100 hover:bg-accent/30 border border-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isReEval ? 'Re-evaluating...' : 'Re-evaluate'}
                      </button>
                      <span className="text-[10px] text-muted">Re-run the 3-phase analysis for this FAQ with current KB data</span>
                    </div>
                  )}

                  {/* FAQ Answer */}
                  <div>
                    <div className="text-xs text-muted mb-1">FAQ Answer</div>
                    <div className="text-xs text-gray-300 bg-black/20 rounded-lg p-2">{r.answer_preview}</div>
                  </div>

                  {/* Client Perspective */}
                  {r.investigation?.client_context && (
                    <div>
                      <div className="text-xs text-muted mb-1">Client Perspective</div>
                      <div className="text-xs text-gray-300 italic">{r.investigation.client_context}</div>
                    </div>
                  )}

                  {/* Gaps */}
                  {r.gaps.length > 0 && (
                    <div>
                      <div className="text-xs text-muted mb-1">Gaps Found</div>
                      <div className="space-y-1">
                        {r.gaps.map((g, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${sevColor(g.severity)}`}>{g.severity}</span>
                            <div>
                              <span className="text-white font-medium">{g.topic}</span>
                              <span className="text-muted ml-1">— {g.explanation}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unanswered Follow-ups */}
                  {r.unanswered_followups.length > 0 && (
                    <div>
                      <div className="text-xs text-muted mb-1">Unanswered Follow-ups</div>
                      <div className="space-y-1">
                        {r.unanswered_followups.map((u, i) => (
                          <div key={i} className="text-xs">
                            <span className="text-orange-400">?</span> <span className="text-white">{u.question}</span>
                            <span className="text-muted ml-1">(relevance: {u.best_result_relevance})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contradictions */}
                  {r.contradictions.length > 0 && (
                    <div>
                      <div className="text-xs text-muted mb-1">Contradictions</div>
                      <div className="space-y-1">
                        {r.contradictions.map((c, i) => (
                          <div key={i} className="text-xs bg-red-500/5 border border-red-500/20 rounded-lg p-2">
                            <div><span className="text-muted">FAQ says:</span> <span className="text-white">{c.faq_claim}</span></div>
                            <div><span className="text-muted">Source "{c.source_title}" says:</span> <span className="text-red-400">{c.other_source}</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strengths */}
                  {r.strengths.length > 0 && (
                    <div>
                      <div className="text-xs text-muted mb-1">Strengths</div>
                      <ul className="text-xs text-green-400 list-disc list-inside">
                        {r.strengths.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Suggested Improvements */}
                  {r.suggested_improvements.length > 0 && (
                    <div>
                      <div className="text-xs text-muted mb-1">Suggested Improvements</div>
                      <ul className="text-xs text-accent list-disc list-inside">
                        {r.suggested_improvements.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Reasoning */}
                  <div>
                    <div className="text-xs text-muted mb-1">Reasoning</div>
                    <div className="text-xs text-gray-400">{r.reasoning}</div>
                  </div>

                  {/* Search Queries — the evidence section */}
                  <div className="border-t border-white/10 pt-3 mt-3">
                    <div className="text-xs text-muted mb-2 font-medium">Search Queries Used</div>
                    <div className="space-y-2">
                      {queries.map((q, qi) => {
                        const chunkKey = `${r.faq_id}__${qi}`;
                        const state = loadedChunks[chunkKey];
                        return (
                          <div key={qi} className="bg-black/20 rounded-lg border border-white/5">
                            <div className="flex items-center gap-2 px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${typeBadge(q.type)}`}>{q.label}</span>
                              <span className="text-xs text-gray-300 flex-1 truncate">{q.query}</span>
                              <button
                                onClick={() => handleShowChunks(chunkKey, q.query, r.search_params)}
                                className="text-[10px] px-2 py-1 rounded border border-white/10 hover:bg-white/10 text-accent shrink-0 transition-colors"
                              >
                                {state?.loading ? 'Loading...' : state?.chunks.length ? 'Hide Chunks' : 'Show Chunks'}
                              </button>
                            </div>

                            {/* Inline chunk results */}
                            {state && !state.loading && state.chunks.length > 0 && (
                              <div className="border-t border-white/5 px-3 py-2 space-y-1.5">
                                {state.chunks.map((chunk, ci) => (
                                  <div key={ci} className="text-[11px] bg-black/30 rounded p-2 border border-white/5">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-muted font-mono">#{ci + 1}</span>
                                      <span className="text-accent">{chunk.score?.toFixed(3)}</span>
                                      <span className="text-muted">{chunk.source_type?.toUpperCase()}</span>
                                      <span className="text-gray-400 truncate">{chunk.file_name}</span>
                                    </div>
                                    <div className="text-white font-medium mb-0.5">{chunk.title}</div>
                                    <div className="text-gray-400 line-clamp-3">{chunk.content}</div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {state && !state.loading && state.chunks.length === 0 && (
                              <div className="border-t border-white/5 px-3 py-2 text-[11px] text-muted italic">
                                No chunks found for this query
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Stats footer */}
                  <div className="flex gap-4 text-[10px] text-muted pt-1">
                    <span>Direct: {r.search_stats.direct_results}</span>
                    <span>Follow-up: {r.search_stats.followup_results}</span>
                    <span>Edge cases: {r.search_stats.edge_case_results}</span>
                    <span>Cross-ref: {r.search_stats.cross_ref_results}</span>
                    <span>Latency: {r.latency_ms}ms</span>
                  </div>
                </div>
              )}
            </div>
          );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
};
