import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import type { GapHistoryRun, GapAnalysisResult, GapAnalysisSummary } from '../types';
import { RunStatusBadge } from '../ui/Badge';
import { GapReportModal } from '../modals/GapReportModal';
import { exportGapJSON } from '../utils/export';

export const GapHistoryTab = () => {
  const [runs, setRuns] = useState<GapHistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ id: string; label: string; results: GapAnalysisResult[]; summary: GapAnalysisSummary | null } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/test-hub/api/gap-analysis-history');
        setRuns(data.runs || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadDetail = async (run: GapHistoryRun) => {
    try {
      const { data } = await api.get(`/test-hub/api/gap-analysis-result/${run.id}`);
      const label = run.run_at ? new Date(run.run_at).toLocaleString() : run.id.slice(0, 8);
      setDetail({ id: run.id, label, results: data.results || [], summary: data.summary || null });
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  if (loading) return <div className="text-muted text-sm">Loading gap analysis history...</div>;

  const covColor = (v: number) => v >= 7 ? 'text-green-400' : v >= 4 ? 'text-yellow-400' : 'text-red-400';

  if (detail) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button onClick={() => { setDetail(null); setReportOpen(false); }} className="text-xs text-accent hover:underline">&larr; Back to list</button>
          {detail.results.length > 0 && (
            <>
              <button onClick={() => setReportOpen(true)}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-accent/20 text-blue-100 hover:bg-accent/30 border border-accent/40 transition-colors">
                View Report
              </button>
              <button onClick={() => exportGapJSON(detail.results, detail.summary!, detail.id)}
                className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                Export JSON
              </button>
            </>
          )}
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-white font-medium text-sm mb-3">{detail.label} &mdash; {detail.results.length} FAQs</h3>
          <div className="max-h-96 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5">
            {detail.results.map(r => {
              const icon = r.coverage_score >= 7 ? '\u2705' : r.coverage_score >= 4 ? '\u26A0\uFE0F' : '\u274C';
              const color = r.coverage_score >= 7 ? 'text-green-400' : r.coverage_score >= 4 ? 'text-yellow-400' : 'text-red-400';
              return <div key={r.faq_id} className={color}>{icon} [{r.coverage_score}/10] {r.gap_count}gaps — {r.question.slice(0, 80)}</div>;
            })}
          </div>
        </div>
        {detail.results.length > 0 && (
          <GapReportModal isOpen={reportOpen} onClose={() => setReportOpen(false)} results={detail.results} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.length === 0 && <div className="text-muted text-sm">No gap analysis runs yet</div>}
      {runs.map(r => (
        <div key={r.id} onClick={() => loadDetail(r)}
          className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.07] cursor-pointer transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-200">{r.run_at ? new Date(r.run_at).toLocaleString() : r.id.slice(0, 8)}</span>
              <span className="text-xs text-muted">{r.total} FAQs</span>
              {r.status && r.status !== 'completed' && <RunStatusBadge status={r.status} completed={r.completed_count} total={r.total_count} />}
              {r.params?.client_persona && <span className="text-xs text-teal-400" title={r.params.client_persona}>custom persona</span>}
            </div>
            <div className="flex gap-4 text-xs">
              <span>Coverage: <span className={`font-bold ${covColor(r.avg_coverage_score)}`}>{r.avg_coverage_score.toFixed(1)}/10</span></span>
              <span>Gaps: <span className={`font-bold ${r.total_gaps > 0 ? 'text-yellow-400' : 'text-green-400'}`}>{r.total_gaps}</span></span>
              <span>Contradictions: <span className={`font-bold ${r.total_contradictions > 0 ? 'text-red-400' : 'text-green-400'}`}>{r.total_contradictions}</span></span>
              <span>Unanswered: <span className="font-bold text-muted">{r.total_unanswered}</span></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
