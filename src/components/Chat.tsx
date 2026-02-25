import { useState } from 'react';
import ReactMarkdown from 'react-markdown'; // <--- Import this
import { api } from '../lib/api';
import { SecureImage } from './ui/SecureImage';
import { Modal } from './ui/Modal';

export const Chat = () => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<any>(null);

  const handleSend = async () => {
    if (!query.trim()) return;
    
    const newMsgs = [...messages, { role: 'user', content: query }];
    setMessages(newMsgs);
    setQuery('');
    setLoading(true);

    try {
      const { data } = await api.post('/chat', { query });
      setMessages([...newMsgs, { role: 'assistant', ...data }]); 
    } catch (e) {
      setMessages([...newMsgs, { role: 'error', content: "Failed to get response" }]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick = (slide: any) => {
    // Adapt extraction to the new structure (flat) with fallback to nested
    const metadata = slide.metadata || {};
    const isSlide = slide.is_slide ?? (metadata.slide_number != null);

    if (!isSlide) return; // Don't open modal for non-slide content

    // Use the URL from backend if available, otherwise construct it
    // Handle both flat fields and nested fields
    const uuid = slide.document_uuid;
    const slideNum = slide.slide_number ?? metadata.slide_number;
    
    // Construct URL: prefer explicit URL, then slide path
    const imgUrl = slide.url || `/document/${uuid}/slide/${slideNum}`;
    
    setModalContent(
      <SecureImage 
        src={imgUrl} 
        alt={slide.title || slide.content?.title || "Slide"} 
        className="w-full h-auto rounded" 
      />
    );
    setModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[65vh] custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted/40 text-sm italic">
            Ask a question to start searching...
          </div>
        )}
        
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`
              max-w-[85%] rounded-2xl px-5 py-4 text-sm leading-relaxed shadow-sm
              ${m.role === 'user' 
                ? 'bg-accent/20 text-blue-100 border border-accent/20 rounded-tr-sm' 
                : 'bg-white/5 text-gray-200 border border-white/10 rounded-tl-sm'}
            `}>
              {m.role === 'assistant' ? (
                <div className="space-y-4">
                  {/* --- MARKDOWN RENDERER --- */}
                  <ReactMarkdown
                    components={{
                      h3: (props) => <h3 className="text-lg font-semibold text-white mt-4 mb-2" {...props} />,
                      strong: (props) => <strong className="font-bold text-white" {...props} />,
                      ul: (props) => <ul className="list-disc pl-5 space-y-1 my-2" {...props} />,
                      ol: (props) => <ol className="list-decimal pl-5 space-y-1 my-2" {...props} />,
                      li: (props) => <li className="marker:text-gray-500" {...props} />,
                      p: (props) => <p className="mb-2 last:mb-0" {...props} />,
                    }}
                  >
                    {m.summary}
                  </ReactMarkdown>
                  
                  {/* Relevant Sources Grid */}
                  {m.slides && m.slides.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-white/10">
                      <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">Relevant Sources</p>
                      <div className="grid grid-cols-2 gap-3">
                        {m.slides.map((slide: any, j: number) => {
                          // Adapt data extraction: Flat structure with fallback to nested
                          const content = slide.content || {};
                          const metadata = slide.metadata || {};
                          
                          const displayTitle = slide.title || content.title || "Untitled";
                          const docName = slide.file_name || metadata.document_name || "Unknown Doc";
                          // is_slide is explicit in new API, fallback to checking slide_number in metadata
                          const isSlide = slide.is_slide ?? (metadata.slide_number != null);
                          const slideNum = slide.slide_number ?? metadata.slide_number;
                          const chunkIndex = slide.chunk_id ?? metadata.chunk_index;

                          const displayLocation = isSlide 
                            ? `Slide ${slideNum}` 
                            : `Chunk ${chunkIndex ?? '?'}`;
                          
                          return (
                            <div 
                              key={j} 
                              onClick={() => handleImageClick(slide)} 
                              className={`group block bg-black/20 p-2 rounded-lg border border-transparent transition-all ${isSlide ? 'hover:bg-black/40 hover:border-white/20 cursor-pointer' : 'cursor-default'}`}
                            >
                              {/* Thumbnail or Text Icon */}
                              <div className="relative overflow-hidden rounded mb-2 h-24 bg-black/30 flex items-center justify-center">
                                  {isSlide ? (
                                    <SecureImage 
                                        src={slide.url || `/document/${slide.document_uuid}/slide/${slideNum}`} 
                                        alt={displayTitle} 
                                        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500" 
                                    />
                                  ) : (
                                    <div className="text-center p-2">
                                      <svg className="w-8 h-8 mx-auto text-gray-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      <span className="text-[10px] text-gray-400">Text Content</span>
                                    </div>
                                  )}
                              </div>
                              <p className="text-xs font-medium text-gray-200 truncate pr-2" title={displayTitle}>{displayTitle}</p>
                              <div className="flex items-center gap-1 mt-1">
                                  <span className="text-[10px] text-accent/80 bg-accent/10 px-1.5 py-0.5 rounded">
                                      {displayLocation}
                                  </span>
                                  <p className="text-[10px] text-gray-500 truncate flex-1">{docName}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="text-xs text-muted animate-pulse ml-2">Thinking...</div>}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/10 bg-black/20">
        <div className="flex gap-3">
          <input 
            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all"
            placeholder="Ask a question..."
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={handleSend} 
            disabled={loading}
            className="bg-accent hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/20"
          >
            Send
          </button>
        </div>
      </div>
      <Modal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        title="Slide Preview"
        content={modalContent} 
      />
    </div>
  );
};