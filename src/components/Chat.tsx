import { useState } from 'react';
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
    setModalContent(<SecureImage src={`/document/${slide.document_uuid}/slide/${slide.chunk_id}`} alt={slide.title} className="w-full h-auto rounded" />);
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
              max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed
              ${m.role === 'user' 
                ? 'bg-accent/20 text-blue-100 border border-accent/20 rounded-tr-sm' 
                : 'bg-white/5 text-gray-200 border border-white/10 rounded-tl-sm'}
            `}>
              {m.role === 'assistant' ? (
                <div>
                  <p>{m.summary}</p>
                  {m.slides_text && <p className="mt-4 text-xs italic">{m.slides_text}</p>}
                  {m.slides && m.slides.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {m.slides.map((slide: any, j: number) => (
                        <div key={j} onClick={() => handleImageClick(slide)} className="block bg-black/20 p-2 rounded-lg hover:bg-black/40 cursor-pointer">
                          <SecureImage src={`/document/${slide.document_uuid}/slide/${slide.chunk_id}`} alt={slide.title} className="w-full h-auto rounded" />
                          <p className="text-xs mt-2 truncate">{slide.title}</p>
                          <p className="text-[10px] text-muted truncate">{slide.file_name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                m.content
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