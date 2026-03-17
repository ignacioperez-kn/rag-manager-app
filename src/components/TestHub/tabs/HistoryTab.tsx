import { EvalHistoryView } from './shared/EvalHistoryView';
import { EvalReportModal } from '../modals/EvalReportModal';
import { exportRetrievalJSON } from '../utils/export';
import { exportRetrievalHTML } from '../utils/report-templates';
import type { HistoryRun, EvalResult, EvalSummary } from '../types';

export const HistoryTab = () => (
  <EvalHistoryView<HistoryRun, EvalResult, EvalSummary>
    listEndpoint="/test-hub/api/eval-history"
    detailEndpoint={(id) => `/test-hub/api/eval-result/${id}`}
    resumeEndpoint={(id) => `/test-hub/api/resume-eval/${id}`}
    resumeMessage="Eval resumed! Switch to the Retrieval tab to monitor progress."
    exportJSON={exportRetrievalJSON}
    exportHTML={exportRetrievalHTML}
    renderRunMetrics={(r) => (
      <div className="flex gap-4 text-xs">
        <span>Hit@1: <span className={`font-bold ${r.hit_rate_1 > 0.7 ? 'text-green-400' : 'text-red-400'}`}>{(r.hit_rate_1 * 100).toFixed(1)}%</span></span>
        <span>Hit@N: <span className={`font-bold ${r.hit_rate_n > 0.8 ? 'text-green-400' : 'text-red-400'}`}>{(r.hit_rate_n * 100).toFixed(1)}%</span></span>
        <span>MRR: <span className="font-bold text-accent">{r.mrr ? r.mrr.toFixed(3) : '\u2014'}</span></span>
        <span>Latency: <span className="text-gray-300">{r.avg_latency_ms ? `${r.avg_latency_ms}ms` : '\u2014'}</span></span>
      </div>
    )}
    renderDetailLine={(r) => {
      const icon = r.hit_at_1 ? '\u2705' : r.hit_at_n ? '\u2B55' : '\u274C';
      const color = r.hit_at_1 ? 'text-green-400' : r.hit_at_n ? 'text-yellow-400' : 'text-red-400';
      return <div key={r.id} className={color}>{icon} [{r.id}] {r.query} — rank: {r.rank ?? 'miss'} — {r.latency_ms}ms ({r.difficulty})</div>;
    }}
    renderReportModal={({ isOpen, onClose, results, summary }) => (
      <EvalReportModal isOpen={isOpen} onClose={onClose} results={results} summary={summary} />
    )}
  />
);
