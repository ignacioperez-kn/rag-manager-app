import { useState } from 'react';
import { api } from '../lib/api';
import { SecureImage } from './ui/SecureImage';

// --- Sub-component for FAQ results ---
const FAQResultItem = ({ res }: { res: any }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const { title, content, score, category, matched_via } = res;

  return (
    <div className="p-4 border border-accent/30 bg-accent/5 rounded-xl transition-all hover:bg-accent/10">
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs rounded-full font-medium">
          FAQ
        </span>
        {category && (
          <span className="px-2 py-0.5 bg-white/10 text-muted text-xs rounded-full">
            {category}
          </span>
        )}
        <span className="ml-auto text-xs text-muted">
          {Math.round(score * 100)}% match
          {matched_via && ` (via ${matched_via})`}
        </span>
      </div>

      <h3 className="text-white font-medium mb-2">{title}</h3>

      {isExpanded ? (
        <p className="text-gray-300 text-sm whitespace-pre-wrap">{content}</p>
      ) : (
        <p className="text-gray-300 text-sm line-clamp-3">{content}</p>
      )}

      {content && content.length > 200 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-xs font-medium text-accent hover:text-accent/80 flex items-center gap-1 transition-colors focus:outline-none"
        >
          {isExpanded ? (
            <>
              <span>Show Less</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            </>
          ) : (
            <>
              <span>Show More</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </>
          )}
        </button>
      )}
    </div>
  );
};

// --- Sub-component for individual document results ---
const ResultItem = ({ res }: { res: any }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if this is a FAQ result
  if (res.source_type === 'faq') {
    return <FAQResultItem res={res} />;
  }

  // Extract useful data for cleaner access - handle both old and new formats
  const content = res.content || {};
  const metadata = res.metadata || {};
  const score = res.score || 0;
  const document_uuid = res.document_uuid;

  // Adapt to different result structures (PPTX vs PDF/Text)
  // New format has title/content at top level, old format has them nested
  const displayTitle = res.title || content.title || "Untitled Section";
  const displaySummary = res.summary || content.summary || res.content || content.content || "No content available.";
  const displayBody = typeof res.content === 'string' ? res.content : (content.body_text || content.source_text || content.content);
  const hasSlide = (res.source_type === 'pptx' || metadata.slide_number !== null) && res.source_location !== null;
  const slideNumber = res.source_location || metadata.slide_number;
  const displayLocation = hasSlide ? `Slide ${slideNumber}` : `Chunk ${res.source_location ?? metadata.chunk_index ?? '?'}`;
  const docName = res.file_name || metadata.document_name || "Unknown Document";

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 transition-all hover:bg-white/10">
      <div className="flex gap-4">
        {/* Left Side: Text Content */}
        <div className="flex-1 min-w-0">
          {/* Metadata Header */}
          <div className="flex items-center gap-2 text-xs text-blue-200/70 mb-1">
            <span className="bg-blue-500/10 px-2 py-0.5 rounded">
              {docName}
            </span>
            <span>| {displayLocation}</span>
            <span>| Match: {Math.round(score * 100)}%</span>
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-white mb-2 truncate">
            {displayTitle}
          </h3>

          {/* Summary (Always visible) */}
          <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">
            {typeof displaySummary === 'string' ? displaySummary : JSON.stringify(displaySummary)}
          </p>

          {/* Expanded Content: Body Text */}
          {isExpanded && displayBody && (
            <div className="mt-4 pt-4 border-t border-white/10 text-sm text-gray-300 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="uppercase text-xs text-muted font-bold mb-2 tracking-wider">
                Full Content
              </div>
              {/* whitespace-pre-wrap preserves the markdown structure from your JSON */}
              <div className="whitespace-pre-wrap font-mono text-xs bg-black/20 p-3 rounded-lg border border-white/5">
                {typeof displayBody === 'string' ? displayBody : JSON.stringify(displayBody, null, 2)}
              </div>
            </div>
          )}

          {/* Toggle Button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-3 text-xs font-medium text-accent hover:text-accent/80 flex items-center gap-1 transition-colors focus:outline-none"
          >
            {isExpanded ? (
              <>
                <span>Show Less</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
              </>
            ) : (
              <>
                <span>Show Details</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </>
            )}
          </button>
        </div>

        {/* Right Side: Thumbnail Image - Only for slides */}
        {hasSlide && (
          <div className="flex-shrink-0">
            <div className={`relative overflow-hidden rounded-lg border border-white/10 bg-black/40 transition-all duration-300 ${isExpanded ? 'w-48' : 'w-32 h-24'}`}>
              <SecureImage
                src={`/document/${document_uuid}/slide/${slideNumber}`}
                alt={`Slide ${slideNumber}`}
                className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Main Search Component ---
export const Search = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  
  // Search Settings
  const [limit, setLimit] = useState(5);
  const [matchThreshold, setMatchThreshold] = useState(0.7);
  const [docType, setDocType] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    try {
      const params: any = {
        query_text: query,
        limit,
        match_threshold: matchThreshold
      };
      if (docType) params.doc_type = docType;

      const { data } = await api.get('/search', { params });
      setResults(data.results);
    } catch (e: any) {
      alert(`Search failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full p-4">
      {/* Search Input Form */}
      <form onSubmit={handleSearch} className="flex flex-col gap-4 mb-8">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., 'growth chart Q3'"
            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-accent shadow-sm"
          />
          <button
            type="submit"
            disabled={searching}
            className="bg-accent/20 border border-accent/40 text-blue-100 px-6 py-2 rounded-xl hover:bg-accent/30 transition-colors font-medium disabled:opacity-50"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap gap-4 text-sm items-center bg-white/5 p-3 rounded-lg border border-white/5">
          <div className="flex items-center">
            <label className="text-muted mr-2">Limit</label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-center"
            />
          </div>
          <div className="w-px h-4 bg-white/10"></div>
          <div className="flex items-center">
            <label className="text-muted mr-2">Threshold</label>
            <input
              type="number"
              step="0.1"
              max="1"
              min="0"
              value={matchThreshold}
              onChange={(e) => setMatchThreshold(parseFloat(e.target.value))}
              className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-center"
            />
          </div>
          <div className="w-px h-4 bg-white/10"></div>
          <div className="flex items-center">
            <label className="text-muted mr-2">Type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white"
            >
              <option value="">All Types</option>
              <option value="pptx">PowerPoint</option>
              <option value="docx">Word</option>
              <option value="pdf">PDF</option>
              <option value="faq">FAQ</option>
            </select>
          </div>
        </div>
      </form>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar pb-10">
        {results.length === 0 && !searching && (
          <div className="flex flex-col items-center justify-center h-40 text-muted/40 text-sm">
            <p>No results found.</p>
          </div>
        )}

        {results.map((res, i) => (
          <ResultItem key={`${res.document_uuid}-${res.chunk_id}-${i}`} res={res} />
        ))}
      </div>
    </div>
  );
};