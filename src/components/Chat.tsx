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
    // Use the URL from backend if available, otherwise construct it
    const imgUrl = slide.url || `/document/${slide.document_uuid}/slide/${slide.chunk_id}`;
    
    setModalContent(
      <SecureImage 
        src={imgUrl} 
        alt={slide.title} 
        className="w-full h-auto rounded" 
      />
    );
    setModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[400px]">
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
                      // Style the headers (###)
                      h3: ({node, ...props}) => <h3 className="text-lg font-semibold text-white mt-4 mb-2" {...props} />,
                      // Style bold text (**)
                      strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
                      // Style unordered lists (*)
                      ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-1 my-2" {...props} />,
                      // Style ordered lists (1.)
                      ol: ({node, ...props}) => <ol className="list-decimal pl-5 space-y-1 my-2" {...props} />,
                      // Style list items
                      li: ({node, ...props}) => <li className="marker:text-gray-500" {...props} />,
                      // Style paragraphs to prevent huge margins
                      p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                    }}
                  >
                    {m.summary}
                  </ReactMarkdown>
                  
                  {/* Slides Grid */}
                  {m.slides && m.slides.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-white/10">
                      <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">Relevant Sources</p>
                      <div className="grid grid-cols-2 gap-3">
                        {m.slides.map((slide: any, j: number) => (
                          <div 
                            key={j} 
                            onClick={() => handleImageClick(slide)} 
                            className="group block bg-black/20 p-2 rounded-lg hover:bg-black/40 hover:border-white/20 border border-transparent transition-all cursor-pointer"
                          >
                            <div className="relative overflow-hidden rounded mb-2">
                                <SecureImage 
                                    // Prefer the backend provided URL
                                    src={slide.url || `/document/${slide.document_uuid}/slide/${slide.chunk_id}`} 
                                    alt={slide.title} 
                                    className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-500" 
                                />
                            </div>
                            <p className="text-xs font-medium text-gray-200 truncate pr-2" title={slide.title}>{slide.title}</p>
                            <div className="flex items-center gap-1 mt-1">
                                <span className="text-[10px] text-accent/80 bg-accent/10 px-1.5 py-0.5 rounded">
                                    Slide {slide.slide_number}
                                </span>
                                <p className="text-[10px] text-gray-500 truncate flex-1">{slide.file_name}</p>
                            </div>
                          </div>
                        ))}
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