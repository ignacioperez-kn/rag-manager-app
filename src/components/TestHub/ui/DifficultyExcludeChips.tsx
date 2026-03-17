interface DifficultyExcludeChipsProps {
  items: { difficulty: string }[];
  excluded: Set<string>;
  onToggle: (difficulty: string) => void;
  onReset?: () => void;
  label?: string;
}

export const DifficultyExcludeChips = ({ items, excluded, onToggle, onReset, label = 'Difficulty:' }: DifficultyExcludeChipsProps) => {
  const difficulties = Array.from(new Set(items.map(r => r.difficulty).filter(Boolean))).sort();
  if (difficulties.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-muted text-[11px]">{label}</span>
      {difficulties.map(d => {
        const isExcluded = excluded.has(d);
        const count = items.filter(r => r.difficulty === d).length;
        return (
          <button key={d} onClick={() => onToggle(d)}
            className={`px-2 py-0.5 text-[11px] rounded-md border transition-colors ${
              isExcluded
                ? 'bg-red-900/30 border-red-500/30 text-red-400 line-through opacity-60'
                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
            }`}>
            {d} <span className="text-muted ml-0.5">{count}</span>
          </button>
        );
      })}
      {onReset && excluded.size > 0 && (
        <button onClick={onReset} className="text-[10px] text-accent hover:underline ml-1">Reset</button>
      )}
    </div>
  );
};
