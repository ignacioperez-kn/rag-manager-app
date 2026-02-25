import { useState } from 'react';
import { api, faqApi } from '../lib/api';

export const Upload = ({ onUploadComplete }: { onUploadComplete: () => void }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  const isExcelFile = (filename: string) => {
    return /\.xlsx?$/i.test(filename);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus('');

    try {
      // Route Excel files to FAQ endpoint
      if (isExcelFile(file.name)) {
        setUploadStatus('Processing FAQ file...');
        const response = await faqApi.upload(file, { replaceExisting: false });
        const { count, detected_columns } = response.data;

        let message = `Imported ${count} FAQs`;
        if (detected_columns) {
          message += ` (detected: Q="${detected_columns.question_column}", A="${detected_columns.answer_column?.substring(0, 20)}...")`;
        }
        alert(message);
        onUploadComplete();
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
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  return (
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
  );
};