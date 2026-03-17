export const MetricCard = ({ label, value, sub, colorClass }: { label: string; value: string; sub?: string; colorClass?: string }) => (
  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
    <div className="text-xs text-muted mb-1">{label}</div>
    <div className={`text-2xl font-bold ${colorClass || 'text-white'}`}>{value}</div>
    {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
  </div>
);
