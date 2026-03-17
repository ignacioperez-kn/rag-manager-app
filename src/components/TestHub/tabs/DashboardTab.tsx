import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
import type { DbStats } from '../types';
import { MetricCard } from '../ui/MetricCard';
import { Badge } from '../ui/Badge';

export const DashboardTab = () => {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/test-hub/api/db-stats');
        setStats(data);
      } catch (e: any) {
        setError(e.response?.data?.detail || e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-muted text-sm">Loading database stats...</div>;
  if (error) return <div className="text-red-400 text-sm">Error: {error}</div>;
  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Documents" value={String(stats.documents.total)} />
        <MetricCard label="Doc Chunks" value={String(stats.chunks.document_chunks)} />
        <MetricCard label="FAQ Pairs" value={String(stats.faq_pair_count)} />
        <MetricCard label="Total Embeddings" value={String(stats.chunks.total)} colorClass="text-accent" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-white font-medium text-sm mb-3">Documents</h3>
          <div className="space-y-1.5 text-xs max-h-64 overflow-y-auto custom-scrollbar">
            {stats.documents.list.length === 0 && <span className="text-muted">No documents</span>}
            {stats.documents.list.map(d => (
              <div key={d.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/5">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge>{d.type}</Badge>
                  <span className="text-gray-300 truncate">{d.name}</span>
                </div>
                <Badge variant={d.processed ? 'green' : 'yellow'}>{d.processed ? 'processed' : 'pending'}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-white font-medium text-sm mb-3">By Type</h3>
          <div className="space-y-3">
            {Object.entries(stats.documents.by_type).map(([type, info]) => (
              <div key={type}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300 font-medium">{type.toUpperCase()}</span>
                  <span className="text-muted">{info.processed}/{info.count} processed</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${info.count ? (info.processed / info.count * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>

          <h3 className="text-white font-medium text-sm mt-4 mb-2">FAQ Sources</h3>
          <div className="space-y-1 text-xs">
            {stats.faq_sources.length === 0 && <span className="text-muted">No FAQ sources</span>}
            {stats.faq_sources.map(s => (
              <div key={s} className="py-1 px-2 rounded hover:bg-white/5 text-gray-300">{s}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
