import { useState } from 'react';
import { faqApi } from '../lib/api';

interface FAQUploadProps {
  onUploadComplete?: () => void;
}

export const FAQUpload = ({ onUploadComplete }: FAQUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.xlsx?$/)) {
      alert('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    setUploading(true);
    try {
      const response = await faqApi.upload(file, {
        replaceExisting,
        questionCol: 'question',
        answerCol: 'answer'
      });

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
          <span className="text-xs">Expected columns: question, answer</span>
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

        <label className="flex items-center gap-2 mt-4 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(e) => setReplaceExisting(e.target.checked)}
            className="rounded border-white/20 bg-black/30"
          />
          Replace existing FAQs from same file
        </label>

        <div className="mt-2 text-xs text-muted/60">
          {uploading ? 'Uploading and processing...' : 'Supports .xlsx and .xls files'}
        </div>
      </div>
    </div>
  );
};
