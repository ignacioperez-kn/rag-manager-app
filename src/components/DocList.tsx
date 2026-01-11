import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useJobPolling } from '../hooks/useJobPolling';
import { Modal } from './ui/Modal';

export const DocList = () => {
  const [docs, setDocs] = useState<any[]>([]);
  
  // 1. Destructure 'message' from the hook
  const { status, progress, message, startPolling } = useJobPolling(); 
  
  const [activeJobDoc, setActiveJobDoc] = useState<string | null>(null);
  
  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalContent, setModalContent] = useState<any>(null);

  const fetchDocs = async () => {
    try {
        const { data } = await api.get('/documents');
        setDocs(data.documents);
    } catch(e) { console.error(e) }
  };

  useEffect(() => { fetchDocs(); }, []);

  // --- Actions ---

  const handleDelete = async (id: string) => {
    if(!confirm("Are you sure you want to delete this document?")) return;
    try {
        await api.delete(`/document/${id}`);
        fetchDocs(); 
    } catch(e) { alert("Delete failed"); }
  };

  const handleManifest = async (id: string) => {
    try {
        const { data } = await api.get(`/document/${id}/manifest`);
        setModalTitle("Document Manifest");
        setModalContent(data);
        setModalOpen(true);
    } catch(e) { alert("Could not fetch manifest"); }
  };

  const handleViewRag = async (id: string) => {
    try {
        const { data } = await api.get(`/document/${id}/rag`);
        setModalTitle("RAG Content");
        setModalContent(data); 
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

  return (
    <>
      <div className="space-y-3 h-full overflow-y-auto pr-2 custom-scrollbar">
        {docs.length === 0 && <div className="text-center text-muted/50 py-10">No documents.</div>}

        {docs.map((doc) => (
          <div key={doc.id} className="flex flex-col p-4 bg-white/5 border border-white/5 rounded-xl hover:border-white/10 transition-all gap-3">
            
            {/* Header: Name & ID */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-black/20 rounded-lg text-accent text-xs font-bold shrink-0 mt-1">
                 {doc.doc_type?.toUpperCase() || 'FILE'}
              </div>
              <div className="min-w-0 flex-1">
                {/* 1. Mapped original_name */}
                <h3 className="text-sm font-medium text-gray-200 truncate" title={doc.original_name}>
                    {doc.original_name}
                </h3>
                
                {/* 2. Added Metadata Row */}
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted">
                    <span>{formatDate(doc.created_at)}</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span>{doc.slide_count} Slides</span>
                </div>

                {/* 3. ETA MESSAGE DISPLAY (New Section) */}
                {activeJobDoc === doc.id && status !== 'idle' && status !== 'complete' && (
                    <div className="mt-2 p-2 bg-black/20 rounded border border-white/5">
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
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3 mt-1">
               <button onClick={() => handleDelete(doc.id)} className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] rounded transition-colors">
                 Delete
               </button>

               <button onClick={() => handleManifest(doc.id)} className="px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-300 text-[10px] rounded transition-colors">
                 Manifest
               </button>

               <button onClick={() => handleViewRag(doc.id)} className="px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-300 text-[10px] rounded transition-colors">
                 JSON
               </button>

               <div className="ml-auto">
                 {/* Case A: Already Processed (from DB) */}
                 {doc.rag_processed ? (
                     <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-400 text-[10px] rounded border border-green-500/20 cursor-default">
                        <span>✓ RAG Ready</span>
                     </div>
                 ) : (
                    /* Case B: Currently Processing (Active Job) */
                    activeJobDoc === doc.id && status !== 'idle' && status !== 'complete' ? (
                        <div className="flex items-center gap-2">
                             {/* Small spinner or just text */}
                             <span className="w-2 h-2 rounded-full bg-accent animate-pulse"/>
                             <span className="text-[10px] text-accent font-medium">Processing...</span>
                        </div>
                    ) : (
                        /* Case C: Not Processed Yet */
                        <button 
                            onClick={() => handleProcessRag(doc.id)}
                            className="px-2 py-1 bg-accent/10 hover:bg-accent/20 text-accent text-[10px] rounded font-medium transition-colors"
                        >
                            Process RAG
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