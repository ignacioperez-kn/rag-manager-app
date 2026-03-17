import { useState } from 'react';
import { api } from '../../../lib/api';
import { Badge } from '../ui/Badge';

export const InspectorTab = () => {
  const [sourceType, setSourceType] = useState('all');
  const [docType, setDocType] = useState('');
  const [docName, setDocName] = useState('');
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [chunks, setChunks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadChunks = async (p: number = page) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { source_type: sourceType, limit, page: p };
      if (docType) params.doc_type = docType;
      if (docName.trim()) params.doc_name = docName.trim();
      const { data } = await api.get('/test-hub/api/sample-chunks', { params });
      setChunks(data.chunks || []);
      setTotalPages(data.total_pages || 1);
      setTotalCount(data.total_count || 0);
      setPage(data.page || p);
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    loadChunks(p);
  };

  const pageNumbers = () => {
    const pages: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted block mb-1">Source</label>
          <select value={sourceType} onChange={e => { setSourceType(e.target.value); setDocType(''); setPage(1); }}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="all">All</option>
            <option value="document">Documents</option>
            <option value="faq">FAQ</option>
          </select>
        </div>
        {sourceType !== 'faq' && (
          <div>
            <label className="text-xs text-muted block mb-1">Doc Type</label>
            <select value={docType} onChange={e => { setDocType(e.target.value); setPage(1); }}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
              <option value="">All Types</option>
              <option value="pdf">PDF</option>
              <option value="docx">Word</option>
              <option value="pptx">PowerPoint</option>
              <option value="web">Web</option>
            </select>
          </div>
        )}
        {sourceType !== 'faq' && (
          <div>
            <label className="text-xs text-muted block mb-1">Document Name</label>
            <input type="text" value={docName} onChange={e => { setDocName(e.target.value); }}
              placeholder="Search..."
              className="w-36 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs placeholder:text-muted/50" />
          </div>
        )}
        <div>
          <label className="text-xs text-muted block mb-1">Per Page</label>
          <input type="number" min="1" max="50" value={limit} onChange={e => { setLimit(parseInt(e.target.value) || 10); setPage(1); }}
            className="w-14 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <button onClick={() => { setPage(1); loadChunks(1); }} disabled={loading}
          className="bg-accent/20 border border-accent/40 text-blue-100 px-4 py-1.5 rounded-lg hover:bg-accent/30 transition-colors text-sm font-medium disabled:opacity-50">
          {loading ? 'Loading...' : 'Load Chunks'}
        </button>
        {totalCount > 0 && (
          <span className="text-xs text-muted ml-auto">{totalCount} total chunks</span>
        )}
      </div>

      <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
        {chunks.length === 0 && !loading && <div className="text-muted text-sm text-center py-6">Click "Load Chunks" to inspect database contents</div>}
        {chunks.map(c => (
          <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={c.type === 'faq' ? 'green' : c.type === 'pdf' ? 'blue' : c.type === 'docx' ? 'yellow' : c.type === 'pptx' ? 'red' : 'blue'}>{c.type}</Badge>
              {c.chunk_id != null && <span className="text-xs text-muted font-mono">#{c.chunk_id}</span>}
              {c.chunk_type && <Badge variant="yellow">{c.chunk_type}</Badge>}
              {(c.metadata?.original_name || c.metadata?.document_name) && (
                <span className="text-xs text-muted truncate max-w-[200px]">{c.metadata.original_name || c.metadata.document_name}</span>
              )}
              {c.source_file && <span className="text-xs text-muted">{c.source_file}</span>}
              {c.boost_factor != null && <span className="text-xs text-muted">boost: {c.boost_factor}</span>}
            </div>
            <div className="text-sm font-medium text-gray-200 mb-1">{c.title || 'No title'}</div>
            <div className="text-xs text-muted mb-2">{c.body_preview}</div>
            {c.summary && <div className="text-xs text-muted/70 italic">{c.summary}</div>}
            {c.category && <div className="text-xs text-muted/70 mt-1">Category: {c.category}</div>}
            {c.metadata && (
              <details className="mt-2">
                <summary className="text-xs text-muted cursor-pointer hover:text-white">Metadata</summary>
                <pre className="text-xs text-muted/60 mt-1 bg-black/20 p-2 rounded-lg overflow-x-auto">{JSON.stringify(c.metadata, null, 2)}</pre>
              </details>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-2">
          <button onClick={() => goToPage(page - 1)} disabled={page <= 1 || loading}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/5 text-muted hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            &laquo; Prev
          </button>
          {pageNumbers().map(p => (
            <button key={p} onClick={() => goToPage(p)} disabled={loading}
              className={`w-8 py-1 text-xs rounded-lg transition-colors ${
                p === page
                  ? 'bg-accent/20 text-blue-100 border border-accent/20'
                  : 'bg-white/5 text-muted hover:text-white hover:bg-white/10'
              }`}>
              {p}
            </button>
          ))}
          <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages || loading}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/5 text-muted hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            Next &raquo;
          </button>
        </div>
      )}
    </div>
  );
};
