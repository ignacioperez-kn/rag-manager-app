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

// ---------------------------------------------------------------------------
// FAQ Modal (Create / Edit)
// ---------------------------------------------------------------------------
const FAQModal = ({
  mode,
  faq,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  faq?: FAQ;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [question, setQuestion] = useState(faq?.question || '');
  const [answer, setAnswer] = useState(faq?.answer || '');
  const [category, setCategory] = useState(faq?.category || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!question.trim() || !answer.trim()) {
      setError('Question and answer are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = { question: question.trim(), answer: answer.trim(), category: category.trim() || undefined };
      if (mode === 'edit' && faq) {
        await faqApi.update(faq.faq_id, data);
      } else {
        await faqApi.create(data);
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal card */}
      <div
        className="relative bg-[#1a1d2e] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">
            {mode === 'create' ? 'Add FAQ' : 'Edit FAQ'}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Fields */}
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted block mb-1.5">Question</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={3}
              placeholder="Enter the FAQ question..."
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-accent text-sm resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">Answer</label>
            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              rows={5}
              placeholder="Enter the FAQ answer..."
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-accent text-sm resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">Category <span className="text-muted/50">(optional)</span></label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g. billing, technical, general..."
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-accent text-sm"
            />
          </div>
        </div>

        {/* Error */}
        {error && <div className="text-red-400 text-xs mt-3">{error}</div>}

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-accent/20 border border-accent/40 text-blue-100 hover:bg-accent/30 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : mode === 'create' ? 'Create FAQ' : 'Save Changes'}
          </button>
        </div>

        {/* Saving hint */}
        {saving && (
          <div className="text-xs text-muted mt-2 text-center">Generating embeddings, this may take a moment...</div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// FAQ List
// ---------------------------------------------------------------------------
export const FAQList = ({ refreshTrigger }: FAQListProps) => {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; faq?: FAQ } | null>(null);

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

  const handleModalSaved = () => {
    setModal(null);
    fetchFaqs();
    fetchSources();
  };

  return (
    <div className="space-y-4">
      {/* Modal */}
      {modal && (
        <FAQModal
          mode={modal.mode}
          faq={modal.faq}
          onClose={() => setModal(null)}
          onSaved={handleModalSaved}
        />
      )}

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

        <button
          onClick={() => setModal({ mode: 'create' })}
          className="px-3 py-2 bg-green-500/10 text-green-400 rounded-lg text-sm hover:bg-green-500/20 transition-colors border border-green-500/20"
        >
          + Add FAQ
        </button>

        <span className="ml-auto text-muted text-sm">
          {loading ? 'Loading...' : `${faqs.length} FAQs`}
        </span>
      </div>

      {/* FAQ list */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        {!loading && faqs.length === 0 && (
          <div className="text-center text-muted py-8">
            No FAQs found. Upload an Excel file or add one manually.
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

              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ mode: 'edit', faq });
                  }}
                  className="text-accent/50 hover:text-accent transition-colors"
                  title="Edit FAQ"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFaq(faq.faq_id);
                  }}
                  className="text-red-400/50 hover:text-red-400 transition-colors"
                  title="Delete FAQ"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
