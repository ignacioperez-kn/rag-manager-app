import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Card } from './ui/Card';

export const DocDetail = ({ doc, onBack }: { doc: any, onBack: () => void }) => {
  const [manifest, setManifest] = useState<any>(null);
  const [slides, setSlides] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const fetchManifestAndSlides = async () => {
      try {
        const manifestRes = await api.get(`/document/${doc.id}/manifest`);
        setManifest(manifestRes.data);

        if (doc.doc_type === 'pptx') {
          const slideCount = manifestRes.data?.slide_count || doc.slide_count || 0;
          const slideUrls = [];
          for (let i = 1; i <= slideCount; i++) {
            const slideRes = await api.get(`/document/${doc.id}/slide/${i}`, { responseType: 'blob' });
            const url = URL.createObjectURL(slideRes.data);
            slideUrls.push(url);
          }
          setSlides(slideUrls);
        }
      } catch (error) {
        console.error("Failed to fetch document details", error);
      } finally {
        setLoading(false);
      }
    };

    fetchManifestAndSlides();
  }, [doc]);

  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{doc.original_name}</h2>
        <button onClick={onBack} className="px-4 py-2 bg-gray-700 rounded-lg">Back</button>
      </div>

      {loading ? (
        <p>Loading document details...</p>
      ) : (
        <div>
          {doc.doc_type === 'pptx' && slides.length > 0 && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Slides</h3>
              <div className="relative">
                <img src={slides[currentSlide]} alt={`Slide ${currentSlide + 1}`} className="w-full rounded-lg" />
                <div className="absolute top-1/2 transform -translate-y-1/2 flex justify-between w-full px-4">
                  <button 
                    onClick={() => setCurrentSlide(s => Math.max(0, s - 1))} 
                    disabled={currentSlide === 0}
                    className="px-4 py-2 bg-gray-800 rounded-full"
                  >
                    &lt;
                  </button>
                  <button 
                    onClick={() => setCurrentSlide(s => Math.min(slides.length - 1, s + 1))}
                    disabled={currentSlide === slides.length - 1}
                    className="px-4 py-2 bg-gray-800 rounded-full"
                  >
                    &gt;
                  </button>
                </div>
              </div>
              <p className="text-center mt-2">Slide {currentSlide + 1} of {slides.length}</p>
            </div>
          )}

          {manifest && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Manifest</h3>
              <pre className="bg-gray-800 p-4 rounded-lg text-sm overflow-auto">
                {JSON.stringify(manifest, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
