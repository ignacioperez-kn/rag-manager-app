export const Badge = ({ children, variant = 'blue' }: { children: React.ReactNode; variant?: 'blue' | 'green' | 'yellow' | 'red' }) => {
  const colors = {
    blue: 'bg-accent/20 text-accent',
    green: 'bg-green-500/20 text-green-400',
    yellow: 'bg-yellow-500/20 text-yellow-400',
    red: 'bg-red-500/20 text-red-400',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[variant]}`}>{children}</span>;
};

export const RunStatusBadge = ({ status, completed, total }: { status?: string; completed?: number; total?: number }) => {
  const s = status || 'completed';
  const map: Record<string, { label: string; variant: 'green' | 'yellow' | 'red' | 'blue' }> = {
    completed: { label: 'Completed', variant: 'green' },
    running: { label: 'Running', variant: 'blue' },
    failed: { label: 'Failed', variant: 'red' },
    cancelled: { label: 'Cancelled', variant: 'yellow' },
  };
  const info = map[s] || { label: s, variant: 'blue' as const };
  const progress = s !== 'completed' && completed != null && total != null && total > 0
    ? ` (${completed}/${total})`
    : '';
  return <Badge variant={info.variant}>{info.label}{progress}</Badge>;
};
