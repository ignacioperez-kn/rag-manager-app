import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { MDAnalyzeResponse } from '../lib/api';

interface MDPreviewModalProps {
  isOpen: boolean;
  analysis: MDAnalyzeResponse;
  onClose: () => void;
  onConfirm: (strategy: string) => void;
  onTryWithAI: () => void;
  isRetryingWithAI?: boolean;
}

export const MDPreviewModal = ({
  isOpen,
  analysis,
  onClose,
  onConfirm,
  onTryWithAI,
  isRetryingWithAI = false,
}: MDPreviewModalProps) => {
  const [selectedStrategy, setSelectedStrategy] = useState(analysis?.strategy ?? '');

  useEffect(() => {
    if (analysis?.strategy) {
      setSelectedStrategy(analysis.strategy);
    }
  }, [analysis?.strategy]);

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getBadgeStyle = () => {
    return analysis.detection_method === 'ai'
      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
      : 'bg-success/10 text-success border border-success/20';
  };

  const getBadgeText = () => {
    return analysis.detection_method === 'ai' ? 'AI Detected' : 'Auto-detected';
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div role="dialog" aria-modal="true" aria-labelledby="md-preview-title" className="relative bg-[#1e1e1e] rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <h2 id="md-preview-title" className="text-lg font-semibold text-white truncate max-w-[400px]">{analysis.filename}</h2>
            <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${getBadgeStyle()}`}>
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
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Lines', value: analysis.stats.total_lines.toLocaleString() },
              { label: 'Characters', value: analysis.stats.total_chars.toLocaleString() },
              { label: 'Separators', value: analysis.stats.separator_count },
              { label: 'Headings', value: analysis.stats.heading_count },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-lg font-semibold text-white">{stat.value}</div>
                <div className="text-[10px] text-muted uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Strategy selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">Chunking Strategy</h3>
              <button
                onClick={onTryWithAI}
                disabled={isRetryingWithAI}
                className="px-3 py-1 bg-accent/10 hover:bg-accent/20 disabled:bg-accent/5 text-accent text-xs rounded-lg transition-colors flex items-center gap-1.5"
              >
                {isRetryingWithAI ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Analyzing...
                  </>
                ) : 'Analyze with AI'}
              </button>
            </div>

            <p className="text-xs text-muted">{analysis.description}</p>

            <div className="flex flex-wrap gap-2 mt-2">
              {analysis.available_strategies.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStrategy(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors border ${
                    selectedStrategy === s.id
                      ? 'bg-accent/20 text-accent border-accent/40'
                      : 'bg-white/5 text-muted border-white/10 hover:border-white/20'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chunk preview */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-white">
              Chunk Preview
              <span className="ml-2 text-xs text-muted font-normal">
                {analysis.chunk_count} chunks total — showing first {analysis.preview.length}
              </span>
            </h3>

            <div className="space-y-2 max-h-[40vh] overflow-auto custom-scrollbar">
              {analysis.preview.map((chunk) => (
                <div
                  key={chunk.index}
                  className="bg-white/5 rounded-lg p-3 border border-white/5"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted bg-white/5 px-1.5 py-0.5 rounded font-mono">
                        #{chunk.index + 1}
                      </span>
                      <span className="text-sm font-medium text-white truncate max-w-[500px]">
                        {chunk.title}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted whitespace-nowrap">
                      {chunk.char_count.toLocaleString()} chars
                    </span>
                  </div>
                  <p className="text-xs text-muted/80 leading-relaxed line-clamp-3">
                    {chunk.body_preview}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedStrategy)}
            className="px-6 py-2 bg-accent hover:bg-accent/80 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Upload & Process ({analysis.chunk_count} chunks)
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
