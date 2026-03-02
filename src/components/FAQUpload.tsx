import { useState, useCallback } from 'react';
import { faqApi } from '../lib/api';
import type { FAQAnalyzeResponse } from '../lib/api';
import { FAQPreviewModal } from './FAQPreviewModal';

interface FAQUploadProps {
  onUploadComplete?: () => void;
}

interface ColumnMapping {
  questionColumn: string | null;
  answerColumn: string | null;
  categoryColumn: string | null;
}

type UploadState =
  | { status: 'idle' }
  | { status: 'analyzing'; file: File }
  | { status: 'preview'; file: File; analysis: FAQAnalyzeResponse }
  | { status: 'analyzing_ai'; file: File; analysis: FAQAnalyzeResponse }
  | { status: 'processing'; tempFileId: string; mapping: ColumnMapping; filename: string }
  | { status: 'complete'; count: number }
  | { status: 'error'; message: string };

export const FAQUpload = ({ onUploadComplete }: FAQUploadProps) => {
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  const [replaceExisting, setReplaceExisting] = useState(false);

  const resetState = useCallback(() => {
    setState({ status: 'idle' });
    setReplaceExisting(false);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input
    e.target.value = '';

    if (!file.name.match(/\.xlsx?$/)) {
      setState({ status: 'error', message: 'Please select an Excel file (.xlsx or .xls)' });
      return;
    }

    // Check if source already exists
    try {
      const { data } = await faqApi.getSources();
      if (data.sources?.includes(file.name)) {
        const shouldReplace = confirm(`"${file.name}" already exists. Replace the existing FAQs?`);
        if (!shouldReplace) {
          return;
        }
        setReplaceExisting(true);
      }
    } catch {
      // If sources check fails, proceed without replace
    }

    // Start analysis
    setState({ status: 'analyzing', file });

    try {
      const { data: analysis } = await faqApi.analyze(file);
      console.log('Analysis complete, showing preview modal:', analysis);
      setState({ status: 'preview', file, analysis });
    } catch (err: any) {
      setState({
        status: 'error',
        message: err.response?.data?.detail || err.message || 'Failed to analyze file',
      });
    }
  };

  const handleTryWithAI = async () => {
    if (state.status !== 'preview') return;

    const { file, analysis } = state;
    setState({ status: 'analyzing_ai', file, analysis });

    try {
      const { data: aiAnalysis } = await faqApi.analyze(file, { useAi: true });
      setState({ status: 'preview', file, analysis: aiAnalysis });
    } catch (err: any) {
      // Revert to previous analysis on AI failure
      setState({ status: 'preview', file, analysis });
    }
  };

  const handleConfirm = async (mapping: ColumnMapping) => {
    if (state.status !== 'preview' && state.status !== 'analyzing_ai') return;

    const analysis = state.analysis;

    setState({
      status: 'processing',
      tempFileId: analysis.temp_file_id,
      mapping,
      filename: analysis.filename,
    });

    try {
      const { data } = await faqApi.upload(null, {
        tempFileId: analysis.temp_file_id,
        questionCol: mapping.questionColumn || undefined,
        answerCol: mapping.answerColumn || undefined,
        categoryCol: mapping.categoryColumn || undefined,
        replaceExisting,
      });

      setState({ status: 'complete', count: data.count });
      onUploadComplete?.();
    } catch (err: any) {
      setState({
        status: 'error',
        message: err.response?.data?.detail || err.message || 'Failed to import FAQs',
      });
    }
  };

  const handleCloseModal = () => {
    resetState();
  };

  // Render based on state
  const isProcessing = state.status === 'analyzing' || state.status === 'processing';

  return (
    <>
      <div className="relative group">
        <div
          className={`
            border-2 border-dashed border-white/10 rounded-xl p-8
            flex flex-col items-center justify-center text-center
            transition-colors group-hover:border-accent/50 group-hover:bg-accent/5
            ${isProcessing ? 'opacity-50 cursor-wait' : ''}
          `}
        >
          <div className="text-4xl mb-4">FAQ v2</div>
          <p className="text-muted text-sm mb-4">
            Upload Excel file with FAQ data
            <br />
            <span className="text-xs">Columns are auto-detected</span>
          </p>

          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            disabled={isProcessing}
            className="block w-full text-sm text-muted
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-xs file:font-semibold
              file:bg-accent/10 file:text-accent
              hover:file:bg-accent/20
              cursor-pointer"
          />

          <div className="mt-2 text-xs text-muted/60">
            {state.status === 'analyzing' && 'Analyzing file structure...'}
            {state.status === 'processing' && 'Importing FAQs...'}
            {state.status === 'idle' && 'Supports .xlsx and .xls files'}
            {state.status === 'complete' && (
              <span className="text-success">
                Successfully imported {state.count} FAQs
              </span>
            )}
            {state.status === 'error' && (
              <span className="text-red-400">{state.message}</span>
            )}
          </div>

          {/* Show "Done" button after completion */}
          {(state.status === 'complete' || state.status === 'error') && (
            <button
              onClick={resetState}
              className="mt-3 px-4 py-1.5 text-sm text-accent hover:text-accent/80 transition-colors"
            >
              Upload another file
            </button>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {(state.status === 'preview' || state.status === 'analyzing_ai') && (
        <FAQPreviewModal
          isOpen={true}
          analysis={state.analysis}
          onClose={handleCloseModal}
          onConfirm={handleConfirm}
          onTryWithAI={handleTryWithAI}
          isRetryingWithAI={state.status === 'analyzing_ai'}
        />
      )}
    </>
  );
};
