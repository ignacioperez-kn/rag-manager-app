import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { QualityEvalResult, QualityFilter } from '../types';
import { MODAL_PAGE_SIZE } from '../types';
import { MetricCard } from '../ui/MetricCard';
import { Badge } from '../ui/Badge';
import { DifficultyExcludeChips } from '../ui/DifficultyExcludeChips';
import ClaimTrace from '../../ClaimTrace';

interface QualityReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: QualityEvalResult[];
}

export const QualityReportModal = ({ isOpen, onClose, results }: QualityReportModalProps) => {
  const [relevanceFilter, setRelevanceFilter] = useState<QualityFilter>('all');
  const [excludedDifficulties, setExcludedDifficulties] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState('');
  const [querySearch, setQuerySearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resultPage, setResultPage] = useState(0);

  const categories = Array.from(new Set(results.map(r => r.category).filter(Boolean))).sort();

  const toggleDifficulty = (d: string) => {
    setExcludedDifficulties(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  useEffect(() => { setResultPage(0); }, [relevanceFilter, excludedDifficulties, categoryFilter, querySearch]);

  const filtered = results.filter(r => {
    if (relevanceFilter === 'high' && r.relevance_score < 7) return false;
    if (relevanceFilter === 'medium' && (r.relevance_score < 4 || r.relevance_score >= 7)) return false;
    if (relevanceFilter === 'low' && r.relevance_score >= 4) return false;
    if (excludedDifficulties.has(r.difficulty)) return false;
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (querySearch && !r.query.toLowerCase().includes(querySearch.toLowerCase())) return false;
    return true;
  });

  const totalResultPages = Math.ceil(filtered.length / MODAL_PAGE_SIZE);
  const pageResults = filtered.slice(resultPage * MODAL_PAGE_SIZE, (resultPage + 1) * MODAL_PAGE_SIZE);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fTotal = filtered.length || 1;
  const fAvgRel = filtered.reduce((s, r) => s + (r.relevance_score || 0), 0) / fTotal;
  const fAvgFaith = filtered.reduce((s, r) => s + (r.faithfulness_score || 0), 0) / fTotal;
  const fAvgNoise = filtered.reduce((s, r) => s + (r.noise_ratio || 0), 0) / fTotal;
  const fAvgUtility = filtered.reduce((s, r) => s + (r.utility || 0), 0) / fTotal;
  const isFiltered = filtered.length !== results.length;

  const relevanceButtons: { key: QualityFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: results.length },
    { key: 'high', label: 'High (7+)', count: results.filter(r => r.relevance_score >= 7).length },
    { key: 'medium', label: 'Medium (4-6)', count: results.filter(r => r.relevance_score >= 4 && r.relevance_score < 7).length },
    { key: 'low', label: 'Low (<4)', count: results.filter(r => r.relevance_score < 4).length },
  ];

  const relColor = (v: number) => v >= 7 ? 'text-green-400' : v >= 4 ? 'text-yellow-400' : 'text-red-400';
  const qualityBadge = (q: string) => q === 'Good' ? 'green' as const : q === 'Acceptable' ? 'yellow' as const : 'red' as const;

  const modalUI = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/5 shrink-0">
          <h3 className="text-white font-medium">Quality Report <span className="text-muted text-sm font-normal ml-1">({results.length} cases{isFiltered ? `, ${filtered.length} shown` : ''})</span></h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Summary metrics */}
        <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-white/10 shrink-0">
          <MetricCard label="Avg Relevance" value={`${fAvgRel.toFixed(1)}/10`} colorClass={relColor(fAvgRel)} />
          <MetricCard label="Avg Faithfulness" value={`${fAvgFaith.toFixed(1)}/10`} colorClass={relColor(fAvgFaith)} />
          <MetricCard label="Noise Ratio" value={`${(fAvgNoise * 100).toFixed(1)}%`} colorClass={fAvgNoise < 0.3 ? 'text-green-400' : fAvgNoise < 0.5 ? 'text-yellow-400' : 'text-red-400'} />
          <MetricCard label="Utility" value={`${fAvgUtility.toFixed(1)}/10`} colorClass={relColor(fAvgUtility)} />
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/10 shrink-0 flex-wrap">
          <div className="flex gap-1">
            {relevanceButtons.map(s => (
              <button key={s.key} onClick={() => setRelevanceFilter(s.key)}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  relevanceFilter === s.key
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

            return (
              <div key={r.id} className={`border-l-2 ${r.relevance_score >= 7 ? 'border-l-green-500' : r.relevance_score >= 4 ? 'border-l-yellow-500' : 'border-l-red-500'} bg-white/5 border border-white/10 rounded-r-lg overflow-hidden`}>
                <button onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors">
                  <Badge variant={relColor(r.relevance_score).includes('green') ? 'green' : relColor(r.relevance_score).includes('yellow') ? 'yellow' : 'red'}>R:{r.relevance_score}</Badge>
                  <Badge variant={relColor(r.faithfulness_score).includes('green') ? 'green' : relColor(r.faithfulness_score).includes('yellow') ? 'yellow' : 'red'}>F:{r.faithfulness_score}</Badge>
                  <Badge variant={qualityBadge(r.answer_quality)}>{r.answer_quality}</Badge>
                  <span className="text-sm text-gray-200 truncate flex-1 min-w-0">{r.query}</span>
                  <Badge variant={r.difficulty === 'exact' ? 'green' : r.difficulty === 'paraphrase' ? 'yellow' : r.difficulty === 'followup' ? 'red' : 'blue'}>{r.difficulty}</Badge>
                  <span className="text-xs text-muted shrink-0">{r.latency_ms}ms</span>
                  <span className="text-muted text-xs shrink-0">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 pt-1 border-t border-white/5 bg-black/20 space-y-3">
                    {r.reasoning && (
                      <div>
                        <div className="text-xs text-muted mb-1 font-medium">Judge Reasoning</div>
                        <div className="text-xs text-gray-400 bg-white/[0.02] rounded-lg p-2">{r.reasoning}</div>
                      </div>
                    )}
                    <ClaimTrace
                      generatedAnswer={r.generated_answer || ''}
                      groundedClaims={r.grounded_claims || []}
                      ungroundedClaims={r.ungrounded_claims || []}
                      chunks={r.chunks_summary || []}
                    />
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
