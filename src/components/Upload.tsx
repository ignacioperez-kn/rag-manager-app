import { useState } from 'react';
import { api } from '../lib/api';

export const Upload = ({ onUploadComplete }: { onUploadComplete: () => void }) => {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', e.target.files[0]);

    try {
      await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onUploadComplete(); 
    } catch (err) {
      alert('Upload failed');
    } finally {
      setUploading(false);
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
          accept=".pptx,.docx" 
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
          {uploading ? 'Uploading...' : 'Supports .pptx and .docx'}
        </div>
      </div>
    </div>
  );
};