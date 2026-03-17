interface LiveLogProps {
  logLines: { text: string; color: string }[];
  logRef: React.RefObject<HTMLDivElement | null>;
  emptyMessage?: string;
}

export const LiveLog = ({ logLines, logRef, emptyMessage = 'Run an evaluation to see results...' }: LiveLogProps) => (
  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-white font-medium text-sm">Live Log</h3>
      {logLines.length > 200 && <span className="text-xs text-muted">Showing last 200 of {logLines.length}</span>}
    </div>
    <div ref={logRef} className="max-h-60 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5">
      {logLines.length === 0 && <span className="text-muted">{emptyMessage}</span>}
      {(logLines.length > 200 ? logLines.slice(-200) : logLines).map((l, i) => (
        <div key={i} className={l.color}>{l.text}</div>
      ))}
    </div>
  </div>
);
