import type { EvalResult, EvalSummary, QualityEvalResult, QualityEvalSummary, GapAnalysisResult, GapAnalysisSummary } from '../types';

export const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const fileTs = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export const exportRetrievalJSON = (results: EvalResult[], summary: EvalSummary, runId?: string) => {
  const payload = { type: 'retrieval_evaluation', exported_at: new Date().toISOString(), run_id: runId || summary.run_id, summary, results };
  downloadFile(JSON.stringify(payload, null, 2), `retrieval_eval_${runId?.slice(0, 8) || fileTs()}.json`, 'application/json');
};

export const exportQualityJSON = (results: QualityEvalResult[], summary: QualityEvalSummary, runId?: string) => {
  const payload = { type: 'quality_evaluation', exported_at: new Date().toISOString(), run_id: runId || summary.run_id, summary, results };
  downloadFile(JSON.stringify(payload, null, 2), `quality_eval_${runId?.slice(0, 8) || fileTs()}.json`, 'application/json');
};

export const exportGapJSON = (results: GapAnalysisResult[], summary: GapAnalysisSummary, runId?: string) => {
  const payload = { type: 'gap_analysis', exported_at: new Date().toISOString(), run_id: runId || summary.run_id, summary, results };
  downloadFile(JSON.stringify(payload, null, 2), `gap_analysis_${runId?.slice(0, 8) || fileTs()}.json`, 'application/json');
};
