import { useState } from 'react';
import { api, faqApi } from '../lib/api';
import type { FAQAnalyzeResponse } from '../lib/api';
import { FAQPreviewModal } from './FAQPreviewModal';

interface ColumnMapping {
  questionColumn: string | null;
  answerColumn: string | null;
  categoryColumn: string | null;
  linkColumn: string | null;
}

export const Upload = ({ onUploadComplete }: { onUploadComplete: () => void }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');

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

    setUploading(true);
    const isScrapingMode = !!mapping.linkColumn;
    setUploadStatus(isScrapingMode ? 'Scraping URLs and generating answers...' : 'Importing FAQs...');
    setFaqAnalysis(null);

    try {
      const response = await faqApi.upload(null, {
        tempFileId: faqAnalysis.temp_file_id,
        questionCol: mapping.questionColumn || undefined,
        answerCol: mapping.answerColumn || undefined,
        categoryCol: mapping.categoryColumn || undefined,
        linkCol: mapping.linkColumn || undefined,
        replaceExisting: false,
      });

      let message = `Successfully imported ${response.data.count} FAQs`;

      // Report scrape failures if any
      const failures = (response.data as any).scrape_failures;
      if (failures && failures.length > 0) {
        message += `\n\n${failures.length} URLs failed to scrape:`;
        failures.slice(0, 5).forEach((f: any) => {
          message += `\n- Row ${f.row}: ${f.reason}`;
        });
        if (failures.length > 5) {
          message += `\n... and ${failures.length - 5} more`;
        }
      }

      alert(message);
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