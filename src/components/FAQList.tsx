import { useState, useEffect, useCallback } from 'react';
import { faqApi } from '../lib/api';

interface FAQ {
  faq_id: string;
  question: string;
  answer: string;
  category: string | null;
  source_file?: string;
  row_number?: number;
}

interface FAQListProps {
  refreshTrigger?: number;
}

export const FAQList = ({ refreshTrigger }: FAQListProps) => {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const res = await faqApi.getSources();
      setSources(res.data.sources || []);
    } catch (err) {
      console.error('Failed to fetch FAQ sources:', err);
    }
  }, []);

  const fetchFaqs = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedSource ? selectedSource : undefined;
      const res = await faqApi.list(params);
      setFaqs(res.data.faqs || []);
    } catch (err) {
      console.error('Failed to fetch FAQs:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSource]);

  const deleteSource = async (source: string) => {
    if (!confirm(`Delete all FAQs from "${source}"?`)) return;
    try {
      await faqApi.deleteSource(source);
      fetchSources();
      fetchFaqs();
    } catch (err: any) {
      alert(`Failed to delete: ${err.response?.data?.detail || err.message}`);
    }
  };

  const deleteFaq = async (faqId: string) => {
    if (!confirm('Delete this FAQ?')) return;
    try {
      await faqApi.delete(faqId);
      fetchFaqs();
    } catch (err: any) {
      alert(`Failed to delete: ${err.response?.data?.detail || err.message}`);
    }
  };

  useEffect(() => {
    fetchSources();
  }, [fetchSources, refreshTrigger]);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs, refreshTrigger]);

  const toggleExpand = (faqId: string) => {
    setExpandedFaq(expandedFaq === faqId ? null : faqId);
  };

  return (
    <div className="space-y-4">
      {/* Source filter and actions */}
      <div className="flex items-center gap-4 flex-wrap">
        <select
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value)}
          className="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white"
        >
          <option value="">All Sources</option>
          {sources.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {selectedSource && (
          <button
            onClick={() => deleteSource(selectedSource)}
            className="px-3 py-2 bg-red-500/10 text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition-colors"
          >
            Delete Source
          </button>
        )}

        <span className="ml-auto text-muted text-sm">
          {loading ? 'Loading...' : `${faqs.length} FAQs`}
        </span>
      </div>

      {/* FAQ list */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        {!loading && faqs.length === 0 && (
          <div className="text-center text-muted py-8">
            No FAQs found. Upload an Excel file to get started.
          </div>
        )}

        {faqs.map(faq => (
          <div
            key={faq.faq_id}
            className="p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => toggleExpand(faq.faq_id)}
              >
                <div className="flex items-center gap-2 mb-1">
                  {faq.category && (
                    <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs rounded shrink-0">
                      {faq.category}
                    </span>
                  )}
                  {faq.source_file && (
                    <span className="px-2 py-0.5 bg-white/10 text-muted text-xs rounded shrink-0 truncate max-w-[150px]">
                      {faq.source_file}
                    </span>
                  )}
                </div>
                <p className="text-white font-medium text-sm">
                  {faq.question}
                </p>
                {expandedFaq === faq.faq_id ? (
                  <p className="text-gray-300 text-xs mt-2 whitespace-pre-wrap">
                    {faq.answer}
                  </p>
                ) : (
                  <p className="text-muted text-xs mt-1 line-clamp-2">
                    {faq.answer}
                  </p>
                )}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteFaq(faq.faq_id);
                }}
                className="text-red-400/50 hover:text-red-400 transition-colors shrink-0"
                title="Delete FAQ"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
