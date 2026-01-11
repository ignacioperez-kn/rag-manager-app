import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface SecureImageProps {
  src: string; // The API endpoint (e.g., /document/123/slide/1)
  alt: string;
  className?: string;
}

export const SecureImage = ({ src, alt, className }: SecureImageProps) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    
    const fetchImage = async () => {
      try {
        // Fetch as a "Blob" (binary large object) with Auth headers
        const response = await api.get(src, { responseType: 'blob' });
        if (active) {
          // Create a temporary local URL for the browser
          const url = URL.createObjectURL(response.data);
          setImgUrl(url);
        }
      } catch (e) {
        console.error("Failed to load image", src, e);
        if (active) setError(true);
      }
    };

    fetchImage();

    // Cleanup: revoke URL to avoid memory leaks
    return () => {
      active = false;
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, [src]);

  if (error) return <div className="bg-red-500/10 text-red-400 text-xs p-2 rounded border border-red-500/20">Img Error</div>;
  if (!imgUrl) return <div className="animate-pulse bg-white/5 h-32 rounded w-full"></div>;

  return <img src={imgUrl} alt={alt} className={className} />;
};