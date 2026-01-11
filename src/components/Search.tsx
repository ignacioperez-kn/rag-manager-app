import { useState } from 'react';
import { api } from '../lib/api';
import { SecureImage } from './ui/SecureImage';

export const Search = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    try {
      // Matches backend: GET /search?query_text=...
      const { data } = await api.get('/search', { params: { query_text: query } });
      setResults(data.results);
    } catch (e) {
      alert("Search failed");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search Input Form */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g., 'growth chart Q3'"
          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-white/20 focus:outline-none focus:border-accent"
        />
        <button 
          type="submit" 
          disabled={searching}
          className="bg-accent/20 border border-accent/40 text-blue-100 px-4 py-2 rounded-xl hover:bg-accent/30 transition-colors"
        >
          {searching ? '...' : 'Search'}
        </button>
      </form>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
        {results.length === 0 && !searching && (
          <div className="text-center text-muted/40 text-sm mt-10">No results yet.</div>
        )}

        {results.map((res, i) => (
          <div key={i} className="bg-white/5 border border-white/5 p-4 rounded-xl hover:border-white/10 transition-colors">
            <div className="flex flex-col md:flex-row gap-4">
              
              {/* Text Info */}
              <div className="flex-1">
                <div className="text-xs text-accent mb-1 font-mono">
                  {res.filename} (Slide {res.slide_number})
                </div>
                <div className="text-sm text-gray-300 leading-relaxed">
                  {res.content || "No text content matched."}
                </div>
                <div className="mt-2 text-[10px] text-muted border-t border-white/5 pt-2">
                  Match Score: {Math.round(res.score * 100)}%
                </div>
              </div>

              {/* Secure Image Preview */}
              <div className="w-full md:w-32 flex-shrink-0">
                <div className="aspect-video bg-black/40 rounded-lg overflow-hidden border border-white/10">
                   <SecureImage 
                     src={`/document/${res.doc_uuid}/slide/${res.slide_number}`} 
                     alt={`Slide ${res.slide_number}`}
                     className="w-full h-full object-cover"
                   />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};