import { useState, useRef, useMemo } from 'react';
import { api } from '../lib/api';
import { useJobPolling } from '../hooks/useJobPolling';
import { Modal } from './ui/Modal';

type DocTypeFilter = 'all' | 'pptx' | 'docx' | 'pdf' | 'faq';
type RagFilter = 'all' | 'processed' | 'unprocessed';

export const DocList = ({ docs, fetchDocs, onSelectDoc, loadingDocs, expanded, onToggleExpand }: { docs: any[], fetchDocs: () => void, onSelectDoc: (doc: any) => void, loadingDocs: boolean, expanded: boolean, onToggleExpand: () => void }) => {

  const { status, progress, message, startPolling } = useJobPolling(fetchDocs);
  const [activeJobDoc, setActiveJobDoc] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalContent, setModalContent] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // --- Filters ---
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocTypeFilter>('all');
  const [ragFilter, setRagFilter] = useState<RagFilter>('all');

  const filteredDocs = useMemo(() => {
    return docs.filter(doc => {
      if (searchText && !doc.original_name.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (typeFilter !== 'all' && doc.doc_type !== typeFilter) return false;
      if (ragFilter === 'processed' && !(doc.doc_type === 'faq' || doc.rag_processed)) return false;
      if (ragFilter === 'unprocessed' && (doc.doc_type === 'faq' || doc.rag_processed)) return false;
      return true;
    });
  }, [docs, searchText, typeFilter, ragFilter]);

  const docTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: docs.length, pptx: 0, docx: 0, pdf: 0, faq: 0 };
    docs.forEach(d => { if (counts[d.doc_type] !== undefined) counts[d.doc_type]++; });
    return counts;
  }, [docs]);

  // --- Actions ---

  const handleDelete = async (doc: any) => {
    if(!confirm("Are you sure you want to delete this document?")) return;
    try {
        if (doc.doc_type === 'faq') {
          await api.delete(`/faq/source/${encodeURIComponent(doc.original_name)}`);
        } else {
          await api.delete(`/document/${doc.id}`);
        }
        fetchDocs();
    } catch(e) { alert("Delete failed"); }
  };

  const handleDownload = async (id: string, filename: string) => {
    try {
        const response = await api.get(`/document/${id}/source`, { responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch(e) { alert("Download failed"); }
  };

  const handleUpdateClick = (id: string) => {
    setSelectedDocId(id);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !selectedDocId) return;
    
    const formData = new FormData();
    formData.append('file', e.target.files[0]);

    try {
      await api.put(`/document/${selectedDocId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      fetchDocs();
    } catch (err) {
      alert('Update failed');
    }
  };

  const handleManifest = async (id: string) => {
    try {
        const { data } = await api.get(`/document/${id}/manifest`);
        setModalTitle("Document Manifest");
        setModalContent(
            <div className="w-full h-full min-h-[60vh] bg-[#1e1e1e] p-4 rounded-lg overflow-auto border border-white/10 shadow-inner custom-scrollbar">
                <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap leading-relaxed">
                    {JSON.stringify(data, null, 2)}
                </pre>
            </div>
        );
        setModalOpen(true);
    } catch(e) { alert("Could not fetch manifest"); }
  };

  const handleViewRag = async (id: string) => {
    try {
        const { data } = await api.get(`/document/${id}/rag`);
        setModalTitle("RAG Content");
        setModalContent(
            <div className="w-full h-full min-h-[60vh] bg-[#1e1e1e] p-4 rounded-lg overflow-auto border border-white/10 shadow-inner custom-scrollbar">
                <pre className="text-xs font-mono text-blue-300 whitespace-pre-wrap leading-relaxed">
                    {JSON.stringify(data, null, 2)}
                </pre>
            </div>
        ); 
        setModalOpen(true);
    } catch(e) { alert("RAG content not found (process it first!)"); }
  };

  const handleProcessRag = async (id: string) => {
    try {
      const { data } = await api.post(`/document/${id}/rag`);
      setActiveJobDoc(id);
      startPolling(data.job_id);
    } catch (e) { alert("Failed to start RAG"); }
  };

  // Helper for date formatting
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const typeButtons: { value: DocTypeFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pptx', label: 'PPTX' },
    { value: 'docx', label: 'DOCX' },
    { value: 'pdf', label: 'PDF' },
    { value: 'faq', label: 'FAQ' },
  ];

  return (
    <>
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} accept=".pptx,.docx" />

      {/* Filter Bar */}
      <div className="space-y-2.5 mb-3">
        {/* Search + Expand toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search documents..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="w-full px-3 py-1.5 pl-8 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-200 placeholder-muted/50 focus:outline-none focus:border-accent/40 transition-colors"
            />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            onClick={onToggleExpand}
            title={expanded ? 'Collapse list' : 'Expand list'}
            className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-muted hover:text-white hover:border-white/20 transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {expanded ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              )}
            </svg>
          </button>
        </div>

        {/* Type filter pills + RAG filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {typeButtons.map(btn => (
            <button
              key={btn.value}
              onClick={() => setTypeFilter(btn.value)}
              className={`px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors ${
                typeFilter === btn.value
                  ? 'bg-accent/20 text-blue-100 border border-accent/30'
                  : 'bg-white/5 text-muted border border-transparent hover:bg-white/10'
              }`}
            >
              {btn.label}
              <span className="ml-1 opacity-60">{docTypeCounts[btn.value]}</span>
            </button>
          ))}
          <span className="w-px h-4 bg-white/10 mx-1" />
          <button
            onClick={() => setRagFilter(f => f === 'all' ? 'processed' : f === 'processed' ? 'unprocessed' : 'all')}
            className={`px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors ${
              ragFilter === 'all'
                ? 'bg-white/5 text-muted hover:bg-white/10'
                : ragFilter === 'processed'
                  ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                  : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
            }`}
          >
            {ragFilter === 'all' ? 'RAG: All' : ragFilter === 'processed' ? 'RAG: Ready' : 'RAG: Pending'}
          </button>
        </div>
      </div>

      {/* Document List */}
      <div className="space-y-3 h-[calc(100%-88px)] overflow-y-auto pr-2 custom-scrollbar">
        {loadingDocs ? (
          <div className="text-center text-accent/50 py-10">Loading documents...</div>
        ) : docs.length === 0 ? (
          <div className="text-center text-muted/50 py-10">No documents.</div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center text-muted/50 py-10">No documents match filters.</div>
        ) : null}

        {filteredDocs.map((doc) => (
          <div key={doc.id} className="flex flex-col p-4 bg-white/5 border border-white/5 rounded-xl hover:border-white/10 transition-all gap-3">
            
            {/* Header: Name & ID */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-black/20 rounded-lg text-accent text-xs font-bold shrink-0 mt-1">
                 {doc.doc_type?.toUpperCase() || 'FILE'}
              </div>
              <div className="min-w-0 flex-1">
                {/* 1. Mapped original_name */}
                <h3 className="text-sm font-medium text-gray-200 truncate cursor-pointer" title={doc.original_name} onClick={() => onSelectDoc(doc)}>
                    {doc.original_name}
                </h3>
                
                {/* 2. Added Metadata Row */}
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted">
                    <span>{formatDate(doc.created_at)}</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span>{doc.doc_type === 'faq' ? `${doc.faq_count} FAQs` : `${doc.slide_count} Slides`}</span>
                </div>

                {/* 3. ETA MESSAGE DISPLAY (New Section) */}
                {activeJobDoc === doc.id && status !== 'idle' && status !== 'complete' && (
                    <div className={`mt-2 p-2 bg-black/20 rounded border ${status === 'error' ? 'border-red-500/50' : 'border-white/5'}`}>
                        {status === 'error' ? (
                          <div>
                            <p className="text-xs text-red-400 mb-2">Processing Failed</p>
                            <p className="text-[10px] text-muted/80 truncate font-mono mb-2">{message}</p>
                            <button onClick={() => handleProcessRag(doc.id)} className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] rounded transition-colors">
                              Retry
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1">
                                <span>Progress</span>
                                <span className="text-accent">{progress}%</span>
                            </div>
                            {/* Progress Bar */}
                            <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden mb-1.5">
                                <div 
                                    className="h-full bg-accent transition-all duration-300 ease-out"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            {/* The Actual Message from Backend */}
                            <p className="text-[10px] text-muted/80 truncate font-mono">
                                {message || "Starting..."}
                            </p>
                          </div>
                        )}
                    </div>
                )}

              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3 mt-1">
               <button
                 onClick={() => handleDelete(doc)}
                 disabled={doc.doc_type !== 'faq' && activeJobDoc === doc.id}
                 className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                 Delete
               </button>

               {doc.doc_type !== 'faq' && (
                 <>
                   <button onClick={() => handleDownload(doc.id, doc.original_name)} className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[10px] rounded transition-colors">
                     Download
                   </button>

                   <button onClick={() => handleUpdateClick(doc.id)} className="px-2 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 text-[10px] rounded transition-colors">
                     Update
                   </button>

                   <button onClick={() => handleManifest(doc.id)} className="px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-300 text-[10px] rounded transition-colors">
                     Manifest
                   </button>

                   <button onClick={() => handleViewRag(doc.id)} className="px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-300 text-[10px] rounded transition-colors">
                     JSON
                   </button>
                 </>
               )}

               <div className="ml-auto">
                 {/* FAQ docs are always RAG Ready */}
                 {doc.doc_type === 'faq' || doc.rag_processed ? (
                     <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-400 text-[10px] rounded border border-green-500/20 cursor-default">
                        <span>✓ RAG Ready</span>
                     </div>
                 ) : (
                    /* Case B: Currently Processing (Active Job) */
                    activeJobDoc === doc.id && status !== 'idle' && status !== 'complete' && status !== 'error' ? (
                        <div className="flex items-center gap-2">
                             {/* Small spinner or just text */}
                             <span className="w-2 h-2 rounded-full bg-accent animate-pulse"/>
                             <span className="text-[10px] text-accent font-medium">Processing...</span>
                        </div>
                    ) : (
                        /* Case C: Not Processed Yet or Error */
                        <button
                            onClick={() => handleProcessRag(doc.id)}
                            disabled={activeJobDoc !== null && activeJobDoc !== doc.id}
                            className={`px-2 py-1 text-[10px] rounded font-medium transition-colors ${
                              status === 'error' && activeJobDoc === doc.id
                                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400'
                                : 'bg-accent/10 hover:bg-accent/20 text-accent'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {status === 'error' && activeJobDoc === doc.id ? 'Retry' : 'Process RAG'}
                        </button>
                    )
                 )}
               </div>
            </div>
          </div>
        ))}
      </div>

      <Modal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        title={modalTitle} 
        content={modalContent} 
      />
    </>
  );
};