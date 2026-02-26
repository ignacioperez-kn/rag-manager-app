import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, supabase } from '../lib/api';
import { SecureImage } from './ui/SecureImage';
import { Modal } from './ui/Modal';

interface AgenticStep {
  type: string;
  step: string;
  message: string;
  iteration?: number;
  strategy?: string;
  query?: string;
  confidence?: number;
  reasoning?: string;
  decision?: string;
  results_count?: number;
  new_unique?: number;
  total_accumulated?: number;
}

const STEP_ICONS: Record<string, string> = {
  analyzing_query: '\u{1F9E0}',
  searching: '\u{1F50D}',
  search_complete: '\u2705',
  evaluating: '\u{1F9EA}',
  generating_answer: '\u270D\uFE0F',
  error: '\u274C',
  stream_start: '\u{1F680}',
};

export const Chat = () => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<any>(null);
  const [searchMode, setSearchMode] = useState<'simple' | 'agentic'>('simple');
  const [agenticSteps, setAgenticSteps] = useState<AgenticStep[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFollowup = (question: string) => {
    setQuery(question);
    // Use a microtask so the state updates before handleSend reads it
    setTimeout(() => handleSendWithQuery(question), 0);
  };

  const handleSend = () => handleSendWithQuery(query);

  const handleSendWithQuery = async (q: string) => {
    if (!q.trim()) return;

    const currentQuery = q;
    const newMsgs = [...messages, { role: 'user', content: currentQuery }];
    setMessages(newMsgs);
    setQuery('');
    setLoading(true);
    setAgenticSteps([]);

    if (searchMode === 'simple') {
      // ── Simple mode (unchanged) ──
      try {
        const { data } = await api.post('/chat', { query: currentQuery });
        setMessages([...newMsgs, { role: 'assistant', ...data }]);
      } catch (e) {
        setMessages([...newMsgs, { role: 'error', content: "Failed to get response" }]);
      } finally {
        setLoading(false);
      }
    } else {
      // ── Agentic mode (SSE streaming) ──
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const baseUrl = api.defaults.baseURL?.replace(/\/+$/, '') || '';

        const res = await fetch(`${baseUrl}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ query: currentQuery, search_mode: 'agentic' }),
          signal: abortControllerRef.current.signal,
        });

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const steps: AgenticStep[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'stream_start' || data.type === 'step') {
                steps.push(data);
                setAgenticSteps([...steps]);
              } else if (data.type === 'complete') {
                setMessages([...newMsgs, {
                  role: 'assistant',
                  ...data,
                  agenticSteps: [...steps],
                }]);
              } else if (data.type === 'followups') {
                // Append follow-up questions to the last assistant message
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === 'assistant') {
                    updated[updated.length - 1] = { ...last, followup_questions: data.questions };
                  }
                  return updated;
                });
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          setMessages([...newMsgs, { role: 'error', content: "Agentic search failed" }]);
        }
      } finally {
        setLoading(false);
        setAgenticSteps([]);
      }
    }
  };

  const handleImageClick = (slide: any) => {
    const metadata = slide.metadata || {};
    const isSlide = slide.is_slide ?? (metadata.slide_number != null);

    if (!isSlide) return;

    const uuid = slide.document_uuid;
    const slideNum = slide.slide_number ?? metadata.slide_number;
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
                  {/* Agentic Steps (collapsible) */}
                  {m.agenticSteps && m.agenticSteps.length > 0 && (
                    <details className="bg-black/20 rounded-lg border border-white/5">
                      <summary className="px-3 py-2 text-xs text-muted cursor-pointer hover:text-white flex items-center gap-2">
                        <span className="text-accent/70">&#9889;</span>
                        <span>
                          Agentic Search &mdash; {m.debug_info?.total_iterations || '?'} iterations, {m.debug_info?.strategies_used?.length || '?'} strategies
                        </span>
                        <span className="text-muted/50 ml-auto text-[10px]">
                          {m.debug_info?.total_duration_ms ? `${(m.debug_info.total_duration_ms / 1000).toFixed(1)}s` : ''}
                        </span>
                      </summary>
                      <div className="px-3 pb-2 space-y-1 border-t border-white/5 pt-2">
                        {m.agenticSteps.map((step: AgenticStep, si: number) => (
                          <div key={si} className="text-xs text-muted flex items-start gap-2">
                            <span className="text-accent/60 mt-0.5 shrink-0">
                              {STEP_ICONS[step.step] || '\u2192'}
                            </span>
                            <div>
                              <span>{step.message}</span>
                              {step.confidence !== undefined && (
                                <span className={`ml-2 font-medium ${
                                  step.confidence >= 7 ? 'text-green-400' :
                                  step.confidence >= 4 ? 'text-yellow-400' : 'text-red-400'
                                }`}>
                                  [{step.confidence}/10]
                                </span>
                              )}
                              {step.reasoning && (
                                <div className="text-muted/60 mt-0.5 italic">{step.reasoning}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* Markdown Renderer */}
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
                          const content = slide.content || {};
                          const metadata = slide.metadata || {};

                          const displayTitle = slide.title || content.title || "Untitled";
                          const docName = slide.file_name || metadata.document_name || "Unknown Doc";
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

                  {/* Follow-up Questions */}
                  {m.followup_questions && m.followup_questions.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/10">
                      <p className="text-xs text-muted mb-2">Follow-up questions:</p>
                      <div className="flex flex-col gap-1.5">
                        {m.followup_questions.map((q: string, qi: number) => (
                          <button
                            key={qi}
                            onClick={() => handleFollowup(q)}
                            disabled={loading}
                            className="text-left text-xs px-3 py-2 rounded-lg bg-accent/10 text-blue-200 border border-accent/20 hover:bg-accent/20 hover:border-accent/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {q}
                          </button>
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

        {/* Loading indicators */}
        {loading && searchMode === 'simple' && (
          <div className="text-xs text-muted animate-pulse ml-2">Thinking...</div>
        )}
        {loading && searchMode === 'agentic' && (
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                <span className="text-xs font-medium text-accent">Agentic Search in progress...</span>
              </div>
              {agenticSteps.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {agenticSteps.map((step, i) => (
                    <div key={i} className="text-xs text-muted flex items-start gap-2">
                      <span className="text-accent/60 shrink-0">
                        {STEP_ICONS[step.step] || '\u2192'}
                      </span>
                      <div>
                        <span>{step.message}</span>
                        {step.confidence !== undefined && (
                          <span className={`ml-2 font-medium ${
                            step.confidence >= 7 ? 'text-green-400' :
                            step.confidence >= 4 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            [{step.confidence}/10]
                          </span>
                        )}
                        {step.reasoning && (
                          <div className="text-muted/60 mt-0.5 italic text-[11px]">{step.reasoning}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/10 bg-black/20">
        {/* Search Mode Toggle */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted">Mode:</span>
          <button
            onClick={() => setSearchMode('simple')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
              searchMode === 'simple'
                ? 'bg-accent/20 text-blue-100 border border-accent/20'
                : 'text-muted hover:text-white bg-white/5 border border-transparent'
            }`}
          >
            Simple Search
          </button>
          <button
            onClick={() => setSearchMode('agentic')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
              searchMode === 'agentic'
                ? 'bg-accent/20 text-blue-100 border border-accent/20'
                : 'text-muted hover:text-white bg-white/5 border border-transparent'
            }`}
          >
            Agentic Search
          </button>
        </div>

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
