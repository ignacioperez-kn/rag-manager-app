import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { FAQAnalyzeResponse } from '../lib/api';

interface ColumnMapping {
  questionColumn: string | null;
  answerColumn: string | null;
  categoryColumn: string | null;
  linkColumn: string | null;
  linkColumns: string[];
}

interface FAQPreviewModalProps {
  isOpen: boolean;
  analysis: FAQAnalyzeResponse;
  onClose: () => void;
  onConfirm: (mapping: ColumnMapping) => void;
  onTryWithAI: () => void;
  isRetryingWithAI?: boolean;
}

export const FAQPreviewModal = ({
  isOpen,
  analysis,
  onClose,
  onConfirm,
  onTryWithAI,
  isRetryingWithAI = false,
}: FAQPreviewModalProps) => {
  const detectionFailed = analysis.detection_method === 'failed';

  // Initialize column mapping from detected values or null
  const [mapping, setMapping] = useState<ColumnMapping>({
    questionColumn: analysis.detected_mapping?.question_column ?? null,
    answerColumn: analysis.detected_mapping?.answer_column ?? null,
    categoryColumn: analysis.detected_mapping?.category_column ?? null,
    linkColumn: analysis.link_column ?? null,
    linkColumns: analysis.link_columns ?? (analysis.link_column ? [analysis.link_column] : []),
  });

  // Sync mapping state when analysis changes (e.g., after AI retry)
  useEffect(() => {
    setMapping({
      questionColumn: analysis.detected_mapping?.question_column ?? null,
      answerColumn: analysis.detected_mapping?.answer_column ?? null,
      categoryColumn: analysis.detected_mapping?.category_column ?? null,
      linkColumn: analysis.link_column ?? null,
      linkColumns: analysis.link_columns ?? (analysis.link_column ? [analysis.link_column] : []),
    });
  }, [analysis.detected_mapping, analysis.link_column, analysis.link_columns]);

  // Determine if confirm is enabled
  const canConfirm = mapping.questionColumn && mapping.answerColumn;

  // Get badge styling based on detection method
  const getBadgeStyle = () => {
    switch (analysis.detection_method) {
      case 'programmatic':
        return 'bg-success/10 text-success border border-success/20';
      case 'ai':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'failed':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      default:
        return 'bg-muted/10 text-muted';
    }
  };

  const getBadgeText = () => {
    switch (analysis.detection_method) {
      case 'programmatic':
        return 'Auto-detected';
      case 'ai':
        return 'AI Detected';
      case 'failed':
        return 'Detection Failed';
      default:
        return 'Unknown';
    }
  };

  // Highlighted columns for the table
  const highlightedColumns = useMemo(() => {
    const set = new Set<string>();
    if (mapping.questionColumn) set.add(mapping.questionColumn);
    if (mapping.answerColumn) set.add(mapping.answerColumn);
    if (mapping.categoryColumn) set.add(mapping.categoryColumn);
    for (const lc of mapping.linkColumns) set.add(lc);
    return set;
  }, [mapping]);

  // Determine confirm button text
  const getConfirmText = () => {
    const linkInfo = mapping.linkColumns.length > 0
      ? ` (${mapping.linkColumns.length} link col${mapping.linkColumns.length > 1 ? 's' : ''})`
      : '';
    return `Confirm & Import ${analysis.total_rows} FAQs${linkInfo}`;
  };

  const handleConfirm = () => {
    if (canConfirm) {
      onConfirm(mapping);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#1e1e1e] rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">{analysis.filename}</h2>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getBadgeStyle()}`}>
              {getBadgeText()}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Detection Result Section */}
          {detectionFailed ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <p className="text-amber-400 font-medium">Could not auto-detect columns</p>
                  <p className="text-muted text-sm mt-1">
                    The column names don't match common patterns. You can try AI detection or select columns manually below.
                  </p>
                  <button
                    onClick={onTryWithAI}
                    disabled={isRetryingWithAI}
                    className="mt-3 px-4 py-1.5 bg-accent hover:bg-accent/80 disabled:bg-accent/50 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                  >
                    {isRetryingWithAI ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Analyzing with AI...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        Try with AI
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-success/10 border border-success/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-success flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-success font-medium">Columns detected successfully</p>
                  <div className="mt-2 text-sm text-muted space-y-1">
                    <p><span className="text-white">Question:</span> {mapping.questionColumn}</p>
                    <p><span className="text-white">Answer:</span> {mapping.answerColumn}</p>
                    {mapping.categoryColumn && (
                      <p><span className="text-white">Category:</span> {mapping.categoryColumn}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Reference Links Notice - show when link columns are selected */}
          {mapping.linkColumns.length > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <div className="flex-1">
                  <p className="text-blue-400 font-medium">Reference Links ({mapping.linkColumns.length} column{mapping.linkColumns.length > 1 ? 's' : ''})</p>
                  <p className="text-muted text-sm mt-1">
                    URLs from {mapping.linkColumns.map(c => `"${c}"`).join(', ')} will be saved as reference metadata on each FAQ.
                    Linked web pages and PDFs can be ingested separately after import.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Manual Selection (always visible) */}
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-3">
              {detectionFailed ? 'Select columns manually' : 'Adjust column mapping'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Question Column */}
              <div>
                <label className="block text-xs text-muted mb-1">Question Column *</label>
                <select
                  value={mapping.questionColumn || ''}
                  onChange={(e) => setMapping({ ...mapping, questionColumn: e.target.value || null })}
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                >
                  <option value="">Select column...</option>
                  {analysis.columns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              {/* Answer Column */}
              <div>
                <label className="block text-xs text-muted mb-1">Answer Column *</label>
                <select
                  value={mapping.answerColumn || ''}
                  onChange={(e) => setMapping({ ...mapping, answerColumn: e.target.value || null })}
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                >
                  <option value="">Select column...</option>
                  {analysis.columns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>

              {/* Link Columns (reference URLs - checkboxes) */}
              <div className="sm:col-span-2">
                <label className="block text-xs text-muted mb-1">
                  Link Columns <span className="text-blue-400">(reference URLs)</span>
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  {analysis.columns.map((col) => (
                    <label key={col} className="flex items-center gap-1.5 text-sm text-white/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mapping.linkColumns.includes(col)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...mapping.linkColumns, col]
                            : mapping.linkColumns.filter(c => c !== col);
                          setMapping({ ...mapping, linkColumns: next, linkColumn: next[0] || null });
                        }}
                        className="rounded border-white/20 bg-[#2a2a2a] text-accent focus:ring-accent/50"
                      />
                      <span className={mapping.linkColumns.includes(col) ? 'text-blue-400' : ''}>{col}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Category Column (Optional) */}
              <div>
                <label className="block text-xs text-muted mb-1">Category Column</label>
                <select
                  value={mapping.categoryColumn || ''}
                  onChange={(e) => setMapping({ ...mapping, categoryColumn: e.target.value || null })}
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                >
                  <option value="">(Optional)</option>
                  {analysis.columns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Preview Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-white">Data Preview</h3>
              <span className="text-xs text-muted">
                Showing {analysis.preview_rows.length} of {analysis.total_rows} rows
              </span>
            </div>
            <div className="border border-white/10 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5">
                      {analysis.columns.map((col) => (
                        <th
                          key={col}
                          className={`px-3 py-2 text-left text-xs font-medium text-muted whitespace-nowrap ${
                            highlightedColumns.has(col)
                              ? 'bg-accent/10 border-l-2 border-l-accent'
                              : ''
                          }`}
                        >
                          {col}
                          {col === mapping.questionColumn && (
                            <span className="ml-1 text-accent">(Q)</span>
                          )}
                          {col === mapping.answerColumn && (
                            <span className="ml-1 text-accent">(A)</span>
                          )}
                          {mapping.linkColumns.includes(col) && (
                            <span className="ml-1 text-blue-400">(Link)</span>
                          )}
                          {col === mapping.categoryColumn && (
                            <span className="ml-1 text-accent">(Cat)</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {analysis.preview_rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-white/5">
                        {analysis.columns.map((col) => (
                          <td
                            key={col}
                            className={`px-3 py-2 text-white/80 max-w-xs truncate ${
                              highlightedColumns.has(col)
                                ? 'bg-accent/10 border-l-2 border-l-accent'
                                : ''
                            }`}
                            title={row[col] || ''}
                          >
                            {row[col] || <span className="text-muted/50 italic">empty</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 bg-accent hover:bg-accent/80 disabled:bg-accent/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {getConfirmText()}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
