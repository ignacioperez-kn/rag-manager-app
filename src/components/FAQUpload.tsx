import { useState } from 'react';
import { faqApi } from '../lib/api';

interface FAQUploadProps {
  onUploadComplete?: () => void;
}

export const FAQUpload = ({ onUploadComplete }: FAQUploadProps) => {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.xlsx?$/)) {
      alert('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    // Check if a source with this filename already exists
    let replaceExisting = false;
    try {
      const { data } = await faqApi.getSources();
      if (data.sources?.includes(file.name)) {
        if (!confirm(`"${file.name}" already exists. Replace the existing FAQs?`)) {
          e.target.value = '';
          return;
        }
        replaceExisting = true;
      }
    } catch {
      // If sources check fails, proceed without replace
    }

    setUploading(true);
    try {
      const response = await faqApi.upload(file, { replaceExisting });

      alert(`Successfully imported ${response.data.count} FAQs`);
      onUploadComplete?.();
    } catch (err: any) {
      alert(`Upload failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="relative group">
      <div className={`
        border-2 border-dashed border-white/10 rounded-xl p-8
        flex flex-col items-center justify-center text-center
        transition-colors group-hover:border-accent/50 group-hover:bg-accent/5
        ${uploading ? 'opacity-50 cursor-wait' : ''}
      `}>
        <div className="text-4xl mb-4">FAQ</div>
        <p className="text-muted text-sm mb-4">
          Upload Excel file with FAQ data<br/>
          <span className="text-xs">Columns are auto-detected</span>
        </p>

        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleUpload}
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
          {uploading ? 'Uploading and processing...' : 'Supports .xlsx and .xls files'}
        </div>
      </div>
    </div>
  );
};
