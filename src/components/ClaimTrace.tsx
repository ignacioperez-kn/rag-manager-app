import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────
interface GroundedClaim { claim: string; source_chunk: number; supported: boolean; }
interface UngroundedClaim { claim: string; explanation: string; }
interface ChunkSummary { index: number; title: string; file_name: string; source_type: string; score: number; content_preview: string; }
interface ClaimTraceProps {
  generatedAnswer: string;
  groundedClaims: GroundedClaim[];
  ungroundedClaims: UngroundedClaim[];
  chunks: ChunkSummary[];
}
interface ClaimGroup { chunkIndex: number; claims: { claim: GroundedClaim; originalIdx: number }[]; }
interface Line { y1: number; y2: number; color: string; groupIdx: number; chunkIdx: number; }

// ── Colors ─────────────────────────────────────────────────────────────────
const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#ef4444',
];
const GAP = 72;

// ── Component ──────────────────────────────────────────────────────────────
const ClaimTrace: React.FC<ClaimTraceProps> = ({
  generatedAnswer, groundedClaims, ungroundedClaims, chunks,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const chunkRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [lines, setLines] = useState<Line[]>([]);
  const [hoveredGroup, setHoveredGroup] = useState<number | null>(null);
  const [hoveredChunk, setHoveredChunk] = useState<number | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
  const [similarities, setSimilarities] = useState<Record<string, number> | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  // ── Group claims by source chunk ─────────────────────────────────────
  const groups: ClaimGroup[] = useMemo(() => {
    const map = new Map<number, { claim: GroundedClaim; originalIdx: number }[]>();
    groundedClaims.forEach((c, i) => {
      const key = c.source_chunk;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ claim: c, originalIdx: i });
    });
    // Sort by chunk index
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([chunkIndex, claims]) => ({ chunkIndex, claims }));
  }, [groundedClaims]);

  // ── Compute SVG lines (one per group → chunk) ───────────────────────
  const computeLines = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const next: Line[] = [];

    groups.forEach((group, gi) => {
      const groupEl = groupRefs.current.get(gi);
      const chunkIdx = group.chunkIndex - 1;
      const chunkEl = chunkRefs.current.get(chunkIdx);
      if (!groupEl || !chunkEl) return;
      const gr = groupEl.getBoundingClientRect();
      const kr = chunkEl.getBoundingClientRect();
      next.push({
        y1: gr.top + gr.height / 2 - cRect.top,
        y2: kr.top + kr.height / 2 - cRect.top,
        color: COLORS[chunkIdx % COLORS.length],
        groupIdx: gi,
        chunkIdx,
      });
    });
    setLines(next);
  }, [groups]);

  useEffect(() => {
    const t = setTimeout(computeLines, 80);
    window.addEventListener('resize', computeLines);
    return () => { clearTimeout(t); window.removeEventListener('resize', computeLines); };
  }, [computeLines, expandedGroup]);

  // ── Fetch cosine similarities ────────────────────────────────────────
  const fetchSimilarities = async () => {
    if (simLoading || similarities) return;
    setSimLoading(true);
    try {
      const claimsPayload = groundedClaims.map((c, i) => ({
        text: c.claim, chunk_index: c.source_chunk, claim_index: i,
      }));
      const chunksPayload = chunks.map(c => ({ index: c.index, content: c.content_preview }));
      const { data } = await api.post('/test-hub/api/claim-similarities', {
        claims: claimsPayload, chunks: chunksPayload,
      });
      setSimilarities(data.similarities || {});
    } catch (e) {
      console.error('Failed to compute similarities', e);
    } finally {
      setSimLoading(false);
    }
  };

  // ── Hover logic ──────────────────────────────────────────────────────
  const usedChunks = new Set(groundedClaims.map(c => c.source_chunk));
  const activeGroupSet = new Set<number>();
  const activeChunkSet = new Set<number>();
  if (hoveredGroup !== null) {
    activeGroupSet.add(hoveredGroup);
    activeChunkSet.add(groups[hoveredGroup]?.chunkIndex - 1);
  }
  if (hoveredChunk !== null) {
    activeChunkSet.add(hoveredChunk);
    groups.forEach((g, gi) => { if (g.chunkIndex - 1 === hoveredChunk) activeGroupSet.add(gi); });
  }
  const anyHover = hoveredGroup !== null || hoveredChunk !== null;

  // ── Avg similarity per group ─────────────────────────────────────────
  const groupAvgSim = (group: ClaimGroup): number | null => {
    if (!similarities) return null;
    const vals = group.claims
      .map(c => similarities[`${c.originalIdx}-${group.chunkIndex}`])
      .filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  return (
    <div className="space-y-3">
      {/* Generated answer */}
      <div className="p-3 bg-black/30 rounded-lg border border-white/10">
        <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Generated Answer</div>
        <div className="text-sm text-gray-200 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar leading-relaxed">
          {generatedAnswer}
        </div>
      </div>

      {/* Claim ↔ Chunk trace */}
      <div ref={containerRef} className="relative" style={{ display: 'grid', gridTemplateColumns: `1fr ${GAP}px 1fr`, gap: 0 }}>

        {/* ── LEFT: Claim groups ──────────────────────────────────── */}
        <div className="space-y-1.5 pr-1 z-10">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-1">
            Claims ({groundedClaims.length} grounded, {groups.length} groups)
          </div>
          {groups.map((group, gi) => {
            const color = COLORS[(group.chunkIndex - 1) % COLORS.length];
            const active = activeGroupSet.has(gi);
            const dimmed = anyHover && !active;
            const expanded = expandedGroup === gi;
            const avgSim = groupAvgSim(group);

            return (
              <div
                key={gi}
                ref={el => { if (el) groupRefs.current.set(gi, el); }}
                onMouseEnter={() => setHoveredGroup(gi)}
                onMouseLeave={() => setHoveredGroup(null)}
                onClick={() => { setExpandedGroup(expanded ? null : gi); }}
                className={`p-2 rounded-md border-l-[3px] border border-white/10 text-xs cursor-pointer select-none
                  transition-all duration-150
                  ${active ? 'bg-white/10 border-white/20' : 'bg-white/[0.03]'}
                  ${dimmed ? 'opacity-30' : ''}`}
                style={{ borderLeftColor: color }}
              >
                {/* Group header */}
                <div className="flex items-center gap-2">
                  <span className="text-gray-200 font-medium flex-1 leading-snug">
                    {group.claims.length === 1
                      ? group.claims[0].claim.claim
                      : `${group.claims.length} claims`}
                  </span>
                  <span className="text-muted text-[10px] shrink-0">→ #{group.chunkIndex}</span>
                  {avgSim != null && (
                    <span className={`font-mono text-[10px] px-1 rounded shrink-0 ${avgSim >= 0.7 ? 'text-green-400 bg-green-500/10' : avgSim >= 0.5 ? 'text-yellow-400 bg-yellow-500/10' : 'text-red-400 bg-red-500/10'}`}>
                      {avgSim.toFixed(3)}
                    </span>
                  )}
                  {group.claims.length > 1 && (
                    <span className="text-muted text-[10px]">{expanded ? '\u25B2' : '\u25BC'}</span>
                  )}
                </div>

                {/* Expanded: individual claims */}
                {expanded && group.claims.length > 1 && (
                  <div className="mt-2 space-y-1 pl-2 border-l border-white/10">
                    {group.claims.map(({ claim: c, originalIdx }) => {
                      const simKey = `${originalIdx}-${group.chunkIndex}`;
                      const sim = similarities?.[simKey];
                      return (
                        <div key={originalIdx} className="text-gray-400 text-[11px] leading-snug flex items-start gap-1">
                          <span className="text-muted shrink-0">·</span>
                          <span className="flex-1">{c.claim}</span>
                          {sim != null && (
                            <span className={`font-mono text-[10px] shrink-0 ${sim >= 0.7 ? 'text-green-400' : sim >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {sim.toFixed(3)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Ungrounded */}
          {ungroundedClaims.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Ungrounded ({ungroundedClaims.length})</div>
              {ungroundedClaims.map((c, i) => (
                <div key={`u${i}`} className="p-2 rounded-md border-l-[3px] border border-red-500/20 bg-red-500/5 text-xs mb-1.5"
                  style={{ borderLeftColor: '#ef4444' }}>
                  <div className="text-red-300 leading-snug">{c.claim}</div>
                  <div className="text-red-400/50 text-[10px] mt-0.5">{c.explanation}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── MIDDLE: SVG lines (one per group) ──────────────────── */}
        <svg className="w-full h-full z-0" style={{ overflow: 'visible' }}>
          {lines.map((line, i) => {
            const active = activeGroupSet.has(line.groupIdx) || activeChunkSet.has(line.chunkIdx);
            const dimmed = anyHover && !active;
            return (
              <g key={i}>
                <path
                  d={`M 0 ${line.y1} C ${GAP * 0.5} ${line.y1}, ${GAP * 0.5} ${line.y2}, ${GAP} ${line.y2}`}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={active ? 2.5 : 1.2}
                  opacity={dimmed ? 0.08 : active ? 1 : 0.45}
                  className="transition-all duration-150"
                />
                <circle cx={0} cy={line.y1} r={active ? 3 : 2} fill={line.color} opacity={dimmed ? 0.08 : 0.8} />
                <circle cx={GAP} cy={line.y2} r={active ? 3 : 2} fill={line.color} opacity={dimmed ? 0.08 : 0.8} />
              </g>
            );
          })}
        </svg>

        {/* ── RIGHT: Chunks ──────────────────────────────────────── */}
        <div className="space-y-1.5 pl-1 z-10">
          <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Source Chunks ({chunks.length})</div>
          {chunks.map((chunk, i) => {
            const color = COLORS[i % COLORS.length];
            const isUsed = usedChunks.has(chunk.index);
            const active = activeChunkSet.has(i);
            const dimmed = anyHover && !active;
            return (
              <div
                key={chunk.index}
                ref={el => { if (el) chunkRefs.current.set(i, el); }}
                onMouseEnter={() => setHoveredChunk(i)}
                onMouseLeave={() => setHoveredChunk(null)}
                className={`p-2 rounded-md border-r-[3px] border border-white/10 text-xs cursor-default
                  transition-all duration-150
                  ${active ? 'bg-white/10 border-white/20' : isUsed ? 'bg-white/[0.03]' : 'bg-white/[0.01]'}
                  ${dimmed ? 'opacity-15' : !isUsed && !active ? 'opacity-40' : ''}`}
                style={{ borderRightColor: color }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-mono text-muted text-[10px]">#{chunk.index}</span>
                  <span className="text-gray-300 truncate flex-1 leading-snug">{chunk.title || chunk.file_name}</span>
                  <span className={`text-[10px] font-medium ${isUsed ? 'text-green-400' : 'text-red-400'}`}>
                    {isUsed ? 'used' : 'noise'}
                  </span>
                </div>
                <div className="text-muted text-[10px] line-clamp-2 leading-snug">{chunk.content_preview}</div>
                <div className="text-muted text-[10px] mt-0.5">{chunk.file_name} · {(chunk.score * 100).toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Similarity button */}
      <div className="flex items-center gap-2">
        <button
          onClick={fetchSimilarities}
          disabled={simLoading || similarities !== null}
          className={`px-3 py-1 rounded-lg text-xs transition-colors border ${
            similarities ? 'text-green-400 border-green-500/30 bg-green-500/10 cursor-default'
            : simLoading ? 'text-muted border-white/10 bg-white/5 cursor-wait'
            : 'text-accent border-accent/30 bg-accent/10 hover:bg-accent/20 cursor-pointer'
          }`}
        >
          {similarities ? 'Similarities computed' : simLoading ? 'Computing embeddings...' : 'Compute cosine similarity'}
        </button>
        {similarities && (
          <span className="text-[10px] text-muted">
            Avg: {(() => {
              const vals = Object.values(similarities);
              return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3) : '—';
            })()}
          </span>
        )}
      </div>
    </div>
  );
};

export default ClaimTrace;
