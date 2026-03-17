import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../../lib/api';
import { RunStatusBadge } from '../../ui/Badge';
import type { BaseHistoryRun } from '../../types';

const PAGE_SIZE = 50;

interface EvalHistoryViewProps<TRun extends BaseHistoryRun, TResult extends { id: string }, TSummary> {
  listEndpoint: string;
  detailEndpoint: (id: string) => string;
  resumeEndpoint: (id: string) => string;
  resumeMessage: string;
  exportJSON: (results: TResult[], summary: TSummary, runId: string) => void;
  exportHTML: (results: TResult[], summary: TSummary, runId: string) => void;
  renderRunMetrics: (run: TRun) => React.ReactNode;
  renderDetailLine: (result: TResult) => React.ReactNode;
  renderReportModal: (props: { isOpen: boolean; onClose: () => void; results: TResult[]; summary: TSummary }) => React.ReactNode;
  emptyMessage?: string;
  resumeButtonClass?: string;
}

export function EvalHistoryView<TRun extends BaseHistoryRun, TResult extends { id: string }, TSummary>({
  listEndpoint, detailEndpoint, resumeEndpoint, resumeMessage,
  exportJSON, exportHTML,
  renderRunMetrics, renderDetailLine, renderReportModal,
  emptyMessage = 'No evaluation runs yet',
  resumeButtonClass = 'bg-accent/20 text-accent hover:bg-accent/30 border-accent/30',
}: EvalHistoryViewProps<TRun, TResult, TSummary>) {
  const [runs, setRuns] = useState<TRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState<string | null>(null);

  // Detail view state
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailLabel, setDetailLabel] = useState('');
  const [detailSummary, setDetailSummary] = useState<TSummary | null>(null);
  const [detailResults, setDetailResults] = useState<TResult[]>([]);
  const [detailPage, setDetailPage] = useState(1);
  const [detailTotalPages, setDetailTotalPages] = useState(1);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  // Report modal + all-results cache (loaded on demand for modal/export)
  const [reportOpen, setReportOpen] = useState(false);
  const [allResults, setAllResults] = useState<TResult[] | null>(null);
  const [allLoading, setAllLoading] = useState(false);

  const loadRuns = async () => {
    try {
      const { data } = await api.get(listEndpoint);
      setRuns(data.runs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRuns(); }, []);

  const loadDetailPage = useCallback(async (runId: string, page: number) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get(detailEndpoint(runId), { params: { page, page_size: PAGE_SIZE } });
      setDetailResults(data.results || []);
      setDetailSummary(data.summary || null);
      setDetailTotalPages(data.total_pages || 1);
      setDetailTotal(data.total || 0);
      setDetailPage(page);
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setDetailLoading(false);
    }
  }, [detailEndpoint]);

  const openDetail = async (run: TRun) => {
    const label = run.run_at ? new Date(run.run_at).toLocaleString() : run.id.slice(0, 8);
    setDetailId(run.id);
    setDetailLabel(label);
    setAllResults(null);
    setReportOpen(false);
    await loadDetailPage(run.id, 1);
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetailResults([]);
    setDetailSummary(null);
    setAllResults(null);
    setReportOpen(false);
  };

  /** Fetch ALL results (for report modal + exports). Cached per detail session. */
  const fetchAllResults = useCallback(async (): Promise<TResult[]> => {
    if (allResults) return allResults;
    if (!detailId) return [];
    setAllLoading(true);
    try {
      const { data } = await api.get(detailEndpoint(detailId), { params: { page: 0 } });
      const results = data.results || [];
      setAllResults(results);
      return results;
    } catch (e: any) {
      alert('Failed to load full results: ' + e.message);
      return [];
    } finally {
      setAllLoading(false);
    }
  }, [detailId, allResults, detailEndpoint]);

  const handleExportJSON = async () => {
    if (!detailSummary || !detailId) return;
    const results = await fetchAllResults();
    if (results.length) exportJSON(results, detailSummary, detailId);
  };

  const handleExportHTML = async () => {
    if (!detailSummary || !detailId) return;
    const results = await fetchAllResults();
    if (results.length) exportHTML(results, detailSummary, detailId);
  };

  const handleViewReport = async () => {
    await fetchAllResults();
    setReportOpen(true);
  };

  const resumeRun = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    setResuming(runId);
    try {
      await api.post(resumeEndpoint(runId));
      alert(resumeMessage);
      loadRuns();
    } catch (err: any) {
      alert('Resume failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setResuming(null);
    }
  };

  if (loading) return <div className="text-muted text-sm">Loading history...</div>;

  // ---- Detail view ----
  if (detailId) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button onClick={closeDetail} className="text-xs text-accent hover:underline">&larr; Back to list</button>
          {detailSummary && detailTotal > 0 && (
            <>
              <button onClick={handleViewReport} disabled={allLoading}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-accent/20 text-blue-100 hover:bg-accent/30 border border-accent/40 transition-colors disabled:opacity-50">
                {allLoading ? 'Loading...' : 'View Report'}
              </button>
              <button onClick={handleExportHTML} disabled={allLoading}
                className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50">
                Export HTML
              </button>
              <button onClick={handleExportJSON} disabled={allLoading}
                className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50">
                Export JSON
              </button>
            </>
          )}
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-white font-medium text-sm mb-3">
            {detailLabel} &mdash; {detailTotal} cases
            {detailTotalPages > 1 && <span className="text-muted font-normal ml-2">Page {detailPage}/{detailTotalPages}</span>}
          </h3>
          <div className="max-h-96 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5">
            {detailLoading ? (
              <div className="text-muted text-center py-4 animate-pulse">Loading...</div>
            ) : detailResults.length === 0 ? (
              <div className="text-muted text-center py-4">No results</div>
            ) : (
              detailResults.map(r => renderDetailLine(r))
            )}
          </div>

          {/* Pagination */}
          {detailTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-3 border-t border-white/5 mt-3">
              <button onClick={() => loadDetailPage(detailId, detailPage - 1)} disabled={detailPage <= 1 || detailLoading}
                className="px-2.5 py-1 text-xs rounded-lg bg-white/5 text-muted hover:text-white disabled:opacity-30">Prev</button>
              {Array.from({ length: Math.min(5, detailTotalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(detailPage - 2, detailTotalPages - 4));
                const p = start + i;
                if (p > detailTotalPages) return null;
                return (
                  <button key={p} onClick={() => loadDetailPage(detailId, p)} disabled={detailLoading}
                    className={`w-8 py-1 text-xs rounded-lg transition-colors ${
                      p === detailPage
                        ? 'bg-accent/20 text-blue-100 border border-accent/20'
                        : 'bg-white/5 text-muted hover:text-white hover:bg-white/10'
                    }`}>{p}</button>
                );
              })}
              <button onClick={() => loadDetailPage(detailId, detailPage + 1)} disabled={detailPage >= detailTotalPages || detailLoading}
                className="px-2.5 py-1 text-xs rounded-lg bg-white/5 text-muted hover:text-white disabled:opacity-30">Next</button>
            </div>
          )}
        </div>

        {/* Report modal — uses allResults (fetched on demand) */}
        {detailSummary && allResults && allResults.length > 0 && renderReportModal({
          isOpen: reportOpen,
          onClose: () => setReportOpen(false),
          results: allResults,
          summary: detailSummary,
        })}
      </div>
    );
  }

  // ---- Run list ----
  return (
    <div className="space-y-2">
      {runs.length === 0 && <div className="text-muted text-sm">{emptyMessage}</div>}
      {runs.map(r => (
        <div key={r.id} onClick={() => openDetail(r)}
          className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.07] cursor-pointer transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-200">{r.run_at ? new Date(r.run_at).toLocaleString() : r.id.slice(0, 8)}</span>
              <span className="text-xs text-muted">{r.total} cases</span>
              <RunStatusBadge status={r.status} completed={r.completed_count} total={r.total_count} />
              {(r.status === 'failed' || r.status === 'cancelled') && (
                <button onClick={(e) => resumeRun(e, r.id)} disabled={resuming === r.id}
                  className={`px-2 py-0.5 text-[11px] rounded-md border transition-colors disabled:opacity-50 ${resumeButtonClass}`}>
                  {resuming === r.id ? 'Resuming...' : 'Resume'}
                </button>
              )}
            </div>
            {renderRunMetrics(r)}
          </div>
        </div>
      ))}
    </div>
  );
}
