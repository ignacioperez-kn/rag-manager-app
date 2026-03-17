import { EvalHistoryView } from './shared/EvalHistoryView';
import { QualityReportModal } from '../modals/QualityReportModal';
import { exportQualityJSON } from '../utils/export';
import { exportQualityHTML } from '../utils/report-templates';
import type { QualityHistoryRun, QualityEvalResult, QualityEvalSummary } from '../types';

const relColor = (v: number) => v >= 7 ? 'text-green-400' : v >= 4 ? 'text-yellow-400' : 'text-red-400';

export const QualityHistoryTab = () => (
  <EvalHistoryView<QualityHistoryRun, QualityEvalResult, QualityEvalSummary>
    listEndpoint="/test-hub/api/quality-eval-history"
    detailEndpoint={(id) => `/test-hub/api/quality-eval-result/${id}`}
    resumeEndpoint={(id) => `/test-hub/api/resume-quality-eval/${id}`}
    resumeMessage="Quality eval resumed! Switch to the Quality tab to monitor progress."
    exportJSON={exportQualityJSON}
    exportHTML={exportQualityHTML}
    emptyMessage="No quality evaluation runs yet"
    resumeButtonClass="bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border-purple-500/30"
    renderRunMetrics={(r) => (
      <div className="flex gap-4 text-xs">
        <span>Relevance: <span className={`font-bold ${relColor(r.avg_relevance)}`}>{r.avg_relevance.toFixed(1)}</span></span>
        <span>Faithfulness: <span className={`font-bold ${relColor(r.avg_faithfulness)}`}>{r.avg_faithfulness.toFixed(1)}</span></span>
        <span>Noise: <span className={`font-bold ${r.avg_noise_ratio < 0.3 ? 'text-green-400' : 'text-red-400'}`}>{(r.avg_noise_ratio * 100).toFixed(1)}%</span></span>
        <span>Utility: <span className={`font-bold ${relColor(r.avg_utility)}`}>{r.avg_utility.toFixed(1)}</span></span>
      </div>
    )}
    renderDetailLine={(r) => {
      const relIcon = (r.relevance_score || 0) >= 7 ? '\u2705' : (r.relevance_score || 0) >= 4 ? '\u26A0\uFE0F' : '\u274C';
      const color = (r.relevance_score || 0) >= 7 ? 'text-green-400' : (r.relevance_score || 0) >= 4 ? 'text-yellow-400' : 'text-red-400';
      return <div key={r.id} className={color}>{relIcon} [{r.id}] R:{r.relevance_score} F:{r.faithfulness_score} Q:{r.answer_quality} — {r.query} ({r.difficulty})</div>;
    }}
    renderReportModal={({ isOpen, onClose, results }) => (
      <QualityReportModal isOpen={isOpen} onClose={onClose} results={results} />
    )}
  />
);
