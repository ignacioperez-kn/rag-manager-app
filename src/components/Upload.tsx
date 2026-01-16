import { useState } from 'react';
import { api } from '../lib/api';

export const Upload = ({ onUploadComplete }: { onUploadComplete: () => void }) => {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);

    try {
      // Step 1: Request the signed URL from the backend
      const generateUrlResponse = await api.post('/generate-upload-url', null, {
        params: { filename: file.name }
      });
      const { upload_url, doc_uuid } = generateUrlResponse.data;

      // Step 2: Upload the file directly to storage using the signed URL
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

      // Step 3: Notify the backend that the upload is complete
      await api.post('/upload', {
        doc_uuid: doc_uuid,
        filename: file.name,
      });
      
      onUploadComplete(); 
    } catch (err: any) {
      alert(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
      if (e.target) {
        e.target.value = ''; // Clear the input so the same file can be uploaded again
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
          accept=".pptx,.docx, .pdf" 
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
          {uploading ? 'Uploading...' : 'Supports .pptx, .docx, and .pdf'}
        </div>
      </div>
    </div>
  );
};