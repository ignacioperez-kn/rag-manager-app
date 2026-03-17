import { useState } from 'react';
import { api } from '../../../lib/api';
import type { SearchResponse } from '../types';
import { ScoreBar } from '../ui/ScoreBar';
import { Badge } from '../ui/Badge';

export const SearchTab = () => {
  const [query, setQuery] = useState('');
  const [threshold, setThreshold] = useState(0.7);
  const [limit, setLimit] = useState(10);
  const [includeFaq, setIncludeFaq] = useState(true);
  const [boostFactor, setBoostFactor] = useState(1.0);
  const [searching, setSearching] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState('');

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const { data } = await api.get('/test-hub/api/search', {
        params: { query, threshold, limit, include_faq: includeFaq, boost_factor: boostFactor },
      });
      setResponse(data);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a search query..."
            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-accent text-sm"
          />
          <button
            type="submit"
            disabled={searching}
            className="bg-accent/20 border border-accent/40 text-blue-100 px-5 py-2 rounded-xl hover:bg-accent/30 transition-colors font-medium disabled:opacity-50 text-sm"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
        <div className="flex gap-4 text-sm items-center">
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs">Threshold</label>
            <input type="number" step="0.05" min="0" max="1" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-center text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs">Limit</label>
            <input type="number" min="1" max="50" value={limit} onChange={e => setLimit(parseInt(e.target.value))}
              className="w-14 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-center text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs">FAQ</label>
            <select value={String(includeFaq)} onChange={e => setIncludeFaq(e.target.value === 'true')}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs">
              <option value="true">Include</option>
              <option value="false">Exclude</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs">FAQ Boost</label>
            <input type="number" step="0.1" min="0" max="5" value={boostFactor} onChange={e => setBoostFactor(parseFloat(e.target.value))}
              className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-center text-xs" />
          </div>
        </div>
      </form>

      {response && (
        <div className="text-xs text-muted flex gap-3">
          <span className="text-accent">Embed: {response.timing.embedding_ms}ms</span>
          <span className="text-green-400">Search: {response.timing.search_ms}ms</span>
          <span className="text-white">Total: {response.timing.total_ms}ms</span>
          <span>{response.raw_count} raw &rarr; {response.results.length} returned</span>
        </div>
      )}

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <div className="space-y-2">
        {response?.results.map((r, i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/[0.07] transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted">#{i + 1}</span>
                <Badge>{r.source_type}</Badge>
                {r.matched_via && <Badge variant="yellow">{r.matched_via}</Badge>}
                {r.category && <Badge variant="green">{r.category}</Badge>}
              </div>
              <span className="text-sm font-bold text-white">{(r.final_score * 100).toFixed(1)}%</span>
            </div>
            <div className="text-sm font-medium text-gray-200 mb-1">{r.title || 'No title'}</div>
            <div className="text-xs text-muted mb-3 line-clamp-2">{r.body_preview}</div>
            <div className="flex gap-3">
              <ScoreBar label="Similarity" value={r.similarity} color="text-accent" />
              <ScoreBar label="Content" value={r.norm_content_score} color="text-green-400" />
              <ScoreBar label="Final (0.7/0.3)" value={r.final_score} color="text-yellow-400" />
            </div>
          </div>
        ))}
        {response && response.results.length === 0 && (
          <div className="text-muted text-sm text-center py-8">No results</div>
        )}
      </div>
    </div>
  );
};
