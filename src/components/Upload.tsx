import { useState } from 'react';
import { api, faqApi, ingestApi } from '../lib/api';
import type { FAQAnalyzeResponse } from '../lib/api';
import { FAQPreviewModal } from './FAQPreviewModal';
import { useJobPolling } from '../hooks/useJobPolling';

interface ColumnMapping {
  questionColumn: string | null;
  answerColumn: string | null;
  categoryColumn: string | null;
  linkColumn: string | null;
  linkColumns: string[];
}

export const Upload = ({ onUploadComplete }: { onUploadComplete: () => void }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const { status: jobStatus, progress: jobProgress, message: jobMessage, startPolling } = useJobPolling(onUploadComplete);

  // FAQ preview modal state
  const [faqAnalysis, setFaqAnalysis] = useState<FAQAnalyzeResponse | null>(null);
  const [faqFile, setFaqFile] = useState<File | null>(null);
  const [isRetryingWithAI, setIsRetryingWithAI] = useState(false);

  const isExcelFile = (filename: string) => {
    return /\.xlsx?$/i.test(filename);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input
    if (e.target) {
      e.target.value = '';
    }

    setUploading(true);
    setUploadStatus('');

    try {
      // Route Excel files to FAQ analyze endpoint first
      if (isExcelFile(file.name)) {
        setUploadStatus('Analyzing FAQ file...');
        const response = await faqApi.analyze(file);
        setFaqFile(file);
        setFaqAnalysis(response.data);
        setUploading(false);
        setUploadStatus('');
        return;
      }

      // Regular document upload flow
      setUploadStatus('Requesting upload URL...');
      const generateUrlResponse = await api.post('/generate-upload-url', null, {
        params: { filename: file.name }
      });
      const { upload_url, doc_uuid } = generateUrlResponse.data;

      setUploadStatus('Uploading to storage...');
      const uploadToStorageResponse = await fetch(upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadToStorageResponse.ok) {
        const errorText = await uploadToStorageResponse.text();
        throw new Error(`Failed to upload file to storage: ${errorText}`);
      }

      setUploadStatus('Finalizing...');
      await api.post('/upload', {
        doc_uuid: doc_uuid,
        filename: file.name,
      });

      onUploadComplete();
    } catch (err: any) {
      alert(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
  };

  const handleFAQModalClose = () => {
    setFaqAnalysis(null);
    setFaqFile(null);
    setIsRetryingWithAI(false);
  };

  const handleFAQTryWithAI = async () => {
    if (!faqFile) return;

    setIsRetryingWithAI(true);
    try {
      const response = await faqApi.analyze(faqFile, { useAi: true });
      setFaqAnalysis(response.data);
    } catch (err: any) {
      // Keep previous analysis on failure
      alert(`AI analysis failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsRetryingWithAI(false);
    }
  };

  const handleFAQConfirm = async (mapping: ColumnMapping) => {
    if (!faqAnalysis) return;

    const savedAnalysis = faqAnalysis;
    setUploading(true);
    setFaqAnalysis(null);

    try {
      // Step 1: Analyze links BEFORE upload (temp file gets cleaned up by upload)
      let ingestibleUrls: string[] = [];
      let linksSummary = '';

      if (mapping.linkColumns.length > 0) {
        setUploadStatus('Analyzing reference links...');
        try {
          const linksResult = await faqApi.analyzeLinks(
            savedAnalysis.temp_file_id,
            mapping.linkColumns,
          );
          ingestibleUrls = linksResult.data.ingestible.map((l: any) => l.url);
          const skipped = linksResult.data.unique_skipped;
          if (ingestibleUrls.length > 0) {
            linksSummary = `\n\nFound ${ingestibleUrls.length} ingestible links (${skipped} SharePoint links skipped).`;
          } else if (skipped > 0) {
            linksSummary = `\n\n${skipped} reference links found (all SharePoint — skipped).`;
          }
        } catch (linkErr: any) {
          linksSummary = `\n\nNote: Could not analyze links (${linkErr.message || 'error'})`;
        }
      }

      // Step 2: Import FAQs (this cleans up the temp file)
      setUploadStatus('Importing FAQs...');
      const response = await faqApi.upload(null, {
        tempFileId: savedAnalysis.temp_file_id,
        questionCol: mapping.questionColumn || undefined,
        answerCol: mapping.answerColumn || undefined,
        categoryCol: mapping.categoryColumn || undefined,
        linkCols: mapping.linkColumns.length > 0 ? mapping.linkColumns : undefined,
        replaceExisting: false,
      });

      let message = `Successfully imported ${response.data.count} FAQs`;

      // Step 3: Offer to ingest linked content (URLs already collected)
      if (ingestibleUrls.length > 0) {
        const doIngest = confirm(
          `${message}${linksSummary}\n\nDo you want to ingest the linked web pages and PDFs as separate documents?`
        );

        if (doIngest) {
          const ingestResult = await ingestApi.ingestUrls(ingestibleUrls, savedAnalysis.filename);
          if (ingestResult.data.job_id) {
            startPolling(ingestResult.data.job_id);
          }
          onUploadComplete();
          return;
        }
      }

      alert(message + linksSummary);
      onUploadComplete();
    } catch (err: any) {
      alert(`FAQ import failed: ${err.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
      setUploadStatus('');
      setFaqFile(null);
    }
  };

  return (
    <>
      <div className="relative group">
        {/* Dashed Border Container */}
        <div className={`
          border-2 border-dashed border-white/10 rounded-xl p-8
          flex flex-col items-center justify-center text-center
          transition-colors group-hover:border-accent/50 group-hover:bg-accent/5
          ${uploading ? 'opacity-50 cursor-wait' : ''}
        `}>

          {/* Styled File Input */}
          <input
            type="file"
            accept=".pptx,.docx,.pdf,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-sm text-muted
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-xs file:font-semibold
              file:bg-accent/10 file:text-accent
              hover:file:bg-accent/20
              cursor-pointer"
          />

          <div className="mt-2 text-xs text-muted/60">
            {uploading ? (uploadStatus || 'Uploading...') : 'Supports .pptx, .docx, .pdf, .xlsx (FAQ)'}
          </div>
        </div>
      </div>

      {/* Ingestion Job Progress */}
      {jobStatus !== 'idle' && jobStatus !== 'complete' && (
        <div className={`mt-3 p-3 rounded-lg border ${
          jobStatus === 'error' ? 'bg-red-500/5 border-red-500/20' : 'bg-accent/5 border-accent/20'
        }`}>
          {jobStatus === 'error' ? (
            <p className="text-xs text-red-400">{jobMessage || 'Ingestion failed'}</p>
          ) : (
            <>
              <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1.5">
                <span>Ingesting linked resources...</span>
                <span className="text-accent">{jobProgress}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-accent transition-all duration-500 ease-out"
                  style={{ width: `${jobProgress}%` }}
                />
              </div>
              <p className="text-[10px] text-muted/70 truncate font-mono">{jobMessage}</p>
            </>
          )}
        </div>
      )}

      {/* FAQ Preview Modal */}
      {faqAnalysis && (
        <FAQPreviewModal
          isOpen={true}
          analysis={faqAnalysis}
          onClose={handleFAQModalClose}
          onConfirm={handleFAQConfirm}
          onTryWithAI={handleFAQTryWithAI}
          isRetryingWithAI={isRetryingWithAI}
        />
      )}
    </>
  );
};