export const ScoreBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="flex-1">
    <div className="flex justify-between mb-0.5 text-xs">
      <span className="text-muted">{label}</span>
      <span className={color}>{(value * 100).toFixed(1)}%</span>
    </div>
    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
      <div className={`h-full rounded-full ${color.replace('text-', 'bg-')}`} style={{ width: `${value * 100}%` }} />
    </div>
  </div>
);
