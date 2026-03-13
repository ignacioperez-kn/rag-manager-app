import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api, supabase } from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SubTab = 'dashboard' | 'search' | 'eval' | 'history' | 'inspector' | 'quality' | 'quality-history';

interface DbStats {
  documents: {
    total: number;
    by_type: Record<string, { count: number; processed: number }>;
    list: { id: string; name: string; type: string; processed: boolean; created: string }[];
  };
  chunks: { document_chunks: number; faq_chunks: number; total: number };
  faq_sources: string[];
  faq_pair_count: number;
}

interface SearchResult {
  similarity: number;
  content_score: number;
  norm_content_score: number;
  final_score: number;
  source_type: string;
  title: string;
  body_preview: string;
  matched_via: string;
  category: string;
  faq_id: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  raw_count: number;
  timing: { embedding_ms: number; search_ms: number; total_ms: number };
}

interface EvalResult {
  id: string;
  query: string;
  difficulty: string;
  category: string;
  hit_at_1: boolean;
  hit_at_n: boolean;
  rank: number | null;
  reciprocal_rank: number;
  num_results: number;
  latency_ms: number;
  error: string | null;
  match_details: { rank: number; source_type: string; title: string; score: number } | null;
}

interface EvalSummary {
  metrics: {
    total: number;
    top_n: number;
    hit_rate_1: number;
    hit_rate_n: number;
    mrr: number;
    error_count: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
  };
  breakdowns: {
    by_difficulty: Record<string, { count: number; hit_rate_1: number; hit_rate_n: number; mrr: number }>;
  };
  gaps: {
    missed: { id: string; query: string }[];
    zero_results: { id: string; query: string }[];
    low_rank: { id: string; query: string; rank: number }[];
  };
  saved_to?: string;
  params?: Record<string, any>;
  run_id?: string;
}

interface GenerationSummary {
  generation_run_id: string;
  total_test_cases: number;
  faq_sourced: number;
  document_sourced: number;
  by_difficulty: Record<string, number>;
}

interface HistoryRun {
  id: string;
  run_at: string;
  hit_rate_1: number;
  hit_rate_n: number;
  mrr: number;
  total: number;
  avg_latency_ms: number;
}

// Quality eval types
interface QualityGroundedClaim {
  claim: string;
  source_chunk: number;
  supported: boolean;
}

interface QualityUngroundedClaim {
  claim: string;
  explanation: string;
}

interface QualityChunkSummary {
  index: number;
  title: string;
  file_name: string;
  source_type: string;
  score: number;
  content_preview: string;
}

interface QualityEvalResult {
  id: string;
  query: string;
  difficulty: string;
  category: string;
  latency_ms: number;
  num_chunks: number;
  generated_answer: string;
  chunks_summary: QualityChunkSummary[];
  error: string | null;
  relevance_score: number;
  completeness: string;
  completeness_score: number;
  useful_chunks: number[];
  noise_chunks: number[];
  noise_ratio: number;
  answer_quality: string;
  faithfulness_score: number;
  grounded_claims: QualityGroundedClaim[];
  ungrounded_claims: QualityUngroundedClaim[];
  reasoning: string;
  utility: number;
}

interface QualityEvalSummary {
  metrics: {
    total: number;
    avg_relevance: number;
    avg_completeness_score: number;
    avg_noise_ratio: number;
    avg_faithfulness: number;
    avg_utility: number;
    error_count: number;
  };
  breakdowns: {
    by_difficulty: Record<string, { count: number; avg_relevance: number; avg_faithfulness: number; avg_noise_ratio: number; avg_utility: number }>;
    by_category: Record<string, { count: number; avg_relevance: number; avg_faithfulness: number; avg_noise_ratio: number; avg_utility: number }>;
  };
  params?: Record<string, any>;
  run_id?: string;
}

interface QualityHistoryRun {
  id: string;
  run_at: string;
  total: number;
  avg_relevance: number;
  avg_completeness_score: number;
  avg_noise_ratio: number;
  avg_faithfulness: number;
  avg_utility: number;
}

// ---------------------------------------------------------------------------
// Score bar component
// ---------------------------------------------------------------------------
const ScoreBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
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

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------
const MetricCard = ({ label, value, sub, colorClass }: { label: string; value: string; sub?: string; colorClass?: string }) => (
  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
    <div className="text-xs text-muted mb-1">{label}</div>
    <div className={`text-2xl font-bold ${colorClass || 'text-white'}`}>{value}</div>
    {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
  </div>
);

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
const Badge = ({ children, variant = 'blue' }: { children: React.ReactNode; variant?: 'blue' | 'green' | 'yellow' | 'red' }) => {
  const colors = {
    blue: 'bg-accent/20 text-accent',
    green: 'bg-green-500/20 text-green-400',
    yellow: 'bg-yellow-500/20 text-yellow-400',
    red: 'bg-red-500/20 text-red-400',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[variant]}`}>{children}</span>;
};

// ---------------------------------------------------------------------------
// Export utilities
// ---------------------------------------------------------------------------
const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const fileTs = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// --- Minimal ZIP builder (STORE method, no compression) ---
const crc32 = (data: Uint8Array): number => {
  let crc = ~0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return ~crc >>> 0;
};

const buildZip = (files: { name: string; content: string }[]): Blob => {
  const enc = new TextEncoder();
  const entries = files.map(f => ({ name: enc.encode(f.name), data: enc.encode(f.content) }));
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + e.name.length + e.data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true); lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, e.name.length, true);
    local.set(e.name, 30); local.set(e.data, 30 + e.name.length);
    locals.push(local);
    const central = new Uint8Array(46 + e.name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true); cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, e.name.length, true); cv.setUint32(42, offset, true);
    central.set(e.name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, eocd] as BlobPart[], { type: 'application/zip' });
};

// --- JSON exports ---
const exportRetrievalJSON = (results: EvalResult[], summary: EvalSummary, runId?: string) => {
  const payload = { type: 'retrieval_evaluation', exported_at: new Date().toISOString(), run_id: runId || summary.run_id, summary, results };
  downloadFile(JSON.stringify(payload, null, 2), `retrieval_eval_${runId?.slice(0, 8) || fileTs()}.json`, 'application/json');
};

const exportQualityJSON = (results: QualityEvalResult[], summary: QualityEvalSummary, runId?: string) => {
  const payload = { type: 'quality_evaluation', exported_at: new Date().toISOString(), run_id: runId || summary.run_id, summary, results };
  downloadFile(JSON.stringify(payload, null, 2), `quality_eval_${runId?.slice(0, 8) || fileTs()}.json`, 'application/json');
};

// --- Shared CSS for HTML reports ---
const REPORT_CSS = [
  '*{margin:0;padding:0;box-sizing:border-box}',
  "body{font-family:'Inter',-apple-system,system-ui,sans-serif;background:#f8f9fa;color:#1a1a2e;padding:2rem;line-height:1.6;font-size:14px}",
  '.container{max-width:1100px;margin:0 auto}',
  'h1{font-size:1.5rem;margin-bottom:.25rem;color:#0f172a}',
  'h2{font-size:1.1rem;margin-bottom:1rem;color:#1e293b}',
  '.subtitle{color:#64748b;font-size:.85rem;margin-bottom:1.5rem}',
  '.params{display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1.5rem}',
  '.param{background:#e2e8f0;padding:.2rem .6rem;border-radius:6px;font-size:.75rem;color:#475569}',
  '.param b{color:#1e293b}',
  '.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:1.5rem}',
  '.card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem}',
  '.card-label{font-size:.7rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600}',
  '.card-value{font-size:1.75rem;font-weight:700;margin-top:.25rem}',
  '.card-sub{font-size:.75rem;color:#94a3b8;margin-top:.25rem}',
  '.section{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem}',
  'table{width:100%;border-collapse:collapse;font-size:.8rem}',
  'th{text-align:left;padding:.6rem .5rem;border-bottom:2px solid #e2e8f0;color:#64748b;font-weight:600;font-size:.7rem;text-transform:uppercase;letter-spacing:.04em}',
  'td{padding:.5rem;border-bottom:1px solid #f1f5f9;vertical-align:top}',
  'tr:hover{background:#f8fafc}',
  '.tc{text-align:center}.tr{text-align:right}',
  '.green{color:#16a34a}.yellow{color:#ca8a04}.red{color:#dc2626}.blue{color:#2563eb}.gray{color:#94a3b8}',
  '.tag{display:inline-block;padding:.1rem .5rem;border-radius:9999px;font-size:.7rem;font-weight:500}',
  '.tag-exact{background:#dcfce7;color:#166534}',
  '.tag-paraphrase{background:#fef9c3;color:#854d0e}',
  '.tag-keywords{background:#fee2e2;color:#991b1b}',
  '.tag-followup{background:#e0e7ff;color:#3730a3}',
  '.gap-item{padding:.3rem 0;font-size:.8rem;color:#475569;border-bottom:1px solid #f1f5f9}',
  '.dl{font-size:.75rem;font-weight:600;color:#64748b;margin-bottom:.25rem}',
  'details{margin-bottom:.25rem}',
  'details summary{cursor:pointer;padding:.5rem 0;font-size:.85rem}',
  'details summary:hover{color:#2563eb}',
  '.answer-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:1rem;margin:.5rem 0;font-size:.8rem;white-space:pre-wrap}',
  '.claim-good{color:#16a34a;font-size:.8rem;padding:.2rem 0}',
  '.claim-bad{color:#dc2626;font-size:.8rem;padding:.2rem 0}',
  '.chunk-row{display:flex;gap:.5rem;align-items:center;padding:.3rem 0;font-size:.75rem;border-bottom:1px solid #f1f5f9}',
  '.match-cell{font-size:.7rem;color:#64748b}',
  '@media print{body{padding:.5rem}.section{break-inside:avoid}}',
].join('\n');

// --- Shared JS helpers injected into report <script> ---
const REPORT_HELPERS_JS = [
  'var D=REPORT_DATA,m=D.summary.metrics;',
  "var esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};",
  "var cc=function(v,lo,hi){return v>=hi?'green':v>=lo?'yellow':'red';};",
  "var dtag=function(d){var c=d==='exact'?'tag-exact':d==='paraphrase'?'tag-paraphrase':d==='keywords'?'tag-keywords':'tag-followup';return '<span class=\"tag '+c+'\">'+esc(d)+'</span>';};",
  "var paramBar=function(){var p=D.summary.params||{},k=Object.keys(p);if(!k.length)return '';var h='<div class=\"params\">';k.forEach(function(key){h+='<span class=\"param\"><b>'+esc(key)+':</b> '+esc(p[key])+'</span>';});return h+'</div>';};",
].join('\n');

// --- Retrieval eval HTML viewer (static template, loads data.js) ---
const RETRIEVAL_REPORT_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Retrieval Evaluation Report</title>
<style>${REPORT_CSS}</style></head><body>
<div class="container" id="app"></div>
<script src="data.js"></script>
<script>
${REPORT_HELPERS_JS}
var h='';
h+='<h1>Retrieval Evaluation Report</h1>';
h+='<div class="subtitle">'+esc(D.exported_at)+(D.run_id?' &mdash; Run '+esc(D.run_id.slice(0,8)):'')+' &mdash; '+m.total+' test cases</div>';
h+=paramBar();
h+='<div class="metrics">';
h+='<div class="card"><div class="card-label">Hit Rate @1</div><div class="card-value '+cc(m.hit_rate_1,.4,.7)+'">'+(m.hit_rate_1*100).toFixed(1)+'%</div></div>';
h+='<div class="card"><div class="card-label">Hit Rate @'+m.top_n+'</div><div class="card-value '+cc(m.hit_rate_n,.5,.8)+'">'+(m.hit_rate_n*100).toFixed(1)+'%</div></div>';
h+='<div class="card"><div class="card-label">MRR</div><div class="card-value blue">'+m.mrr.toFixed(3)+'</div></div>';
h+='<div class="card"><div class="card-label">Avg Latency</div><div class="card-value">'+m.avg_latency_ms.toFixed(0)+'ms</div><div class="card-sub">P95: '+m.p95_latency_ms.toFixed(0)+'ms</div></div>';
h+='</div>';
var bd=D.summary.breakdowns&&D.summary.breakdowns.by_difficulty;
if(bd&&Object.keys(bd).length){
  h+='<div class="section"><h2>Breakdown by Difficulty</h2><table><thead><tr><th>Difficulty</th><th class="tc">Count</th><th class="tc">Hit@1</th><th class="tc">Hit@N</th><th class="tc">MRR</th></tr></thead><tbody>';
  Object.keys(bd).forEach(function(d){var i=bd[d];
    h+='<tr><td>'+dtag(d)+'</td><td class="tc">'+i.count+'</td>';
    h+='<td class="tc '+cc(i.hit_rate_1,.4,.7)+'">'+(i.hit_rate_1*100).toFixed(1)+'%</td>';
    h+='<td class="tc '+cc(i.hit_rate_n,.5,.8)+'">'+(i.hit_rate_n*100).toFixed(1)+'%</td>';
    h+='<td class="tc blue">'+i.mrr.toFixed(3)+'</td></tr>';
  });
  h+='</tbody></table></div>';
}
var gaps=D.summary.gaps;
if(gaps){
  var gh='';
  var gb=function(label,items){if(!items||!items.length)return '';var g='<div style="margin-bottom:1rem"><h3 style="font-size:.85rem;font-weight:600;color:#475569;margin-bottom:.5rem">'+esc(label)+' ('+items.length+')</h3>';items.slice(0,20).forEach(function(i){g+='<div class="gap-item">'+esc(i.query)+(i.rank?' <span class="gray">rank #'+i.rank+'</span>':'')+'</div>';});return g+'</div>';};
  gh+=gb('Zero Results',gaps.zero_results);
  gh+=gb('Missed (outside Top-N)',gaps.missed);
  gh+=gb('Low Rank (found but not #1)',gaps.low_rank);
  if(!gh)gh='<div class="green" style="font-weight:600">No gaps detected!</div>';
  h+='<div class="section"><h2>Gap Analysis</h2>'+gh+'</div>';
}
h+='<div class="section"><h2>All Results ('+D.results.length+')</h2>';
h+='<table><thead><tr><th>Query</th><th>Difficulty</th><th class="tc">Status</th><th class="tc">Rank</th><th class="tr">Latency</th><th>Match</th></tr></thead><tbody>';
D.results.forEach(function(r){
  var st=r.hit_at_1?'<span class="green">Hit@1</span>':r.hit_at_n?'<span class="yellow">Hit@N</span>':'<span class="red">Miss</span>';
  var rk=r.rank!=null?'#'+r.rank:'<span class="gray">&mdash;</span>';
  var mt=r.match_details?esc(r.match_details.source_type)+' | '+esc(r.match_details.title||'')+' ('+(r.match_details.score*100).toFixed(1)+'%)':'<span class="gray">&mdash;</span>';
  h+='<tr><td style="max-width:350px">'+esc(r.query)+'</td><td>'+dtag(r.difficulty)+'</td>';
  h+='<td class="tc">'+st+'</td><td class="tc" style="font-weight:600">'+rk+'</td>';
  h+='<td class="tr">'+r.latency_ms+'ms</td><td class="match-cell">'+mt+'</td></tr>';
});
h+='</tbody></table></div>';
document.getElementById('app').innerHTML=h;
</script></body></html>`;

// --- Quality eval HTML viewer (static template, loads data.js) ---
const QUALITY_REPORT_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quality Evaluation Report</title>
<style>${REPORT_CSS}</style></head><body>
<div class="container" id="app"></div>
<script src="data.js"></script>
<script>
${REPORT_HELPERS_JS}
var h='';
h+='<h1>Quality Evaluation Report</h1>';
h+='<div class="subtitle">'+esc(D.exported_at)+(D.run_id?' &mdash; Run '+esc(D.run_id.slice(0,8)):'')+' &mdash; '+m.total+' test cases</div>';
h+=paramBar();
h+='<div class="metrics">';
h+='<div class="card"><div class="card-label">Relevance</div><div class="card-value '+cc(m.avg_relevance,4,7)+'">'+m.avg_relevance.toFixed(1)+'/10</div></div>';
h+='<div class="card"><div class="card-label">Faithfulness</div><div class="card-value '+cc(m.avg_faithfulness,4,7)+'">'+m.avg_faithfulness.toFixed(1)+'/10</div></div>';
h+='<div class="card"><div class="card-label">Completeness</div><div class="card-value '+cc(m.avg_completeness_score,.4,.7)+'">'+(m.avg_completeness_score*100).toFixed(0)+'%</div></div>';
h+='<div class="card"><div class="card-label">Noise Ratio</div><div class="card-value '+(m.avg_noise_ratio<.3?'green':m.avg_noise_ratio<.5?'yellow':'red')+'">'+(m.avg_noise_ratio*100).toFixed(1)+'%</div></div>';
h+='<div class="card"><div class="card-label">Utility</div><div class="card-value '+cc(m.avg_utility,4,7)+'">'+m.avg_utility.toFixed(1)+'/10</div></div>';
h+='</div>';
var bd=D.summary.breakdowns&&D.summary.breakdowns.by_difficulty;
if(bd&&Object.keys(bd).length){
  h+='<div class="section"><h2>Breakdown by Difficulty</h2><table><thead><tr><th>Difficulty</th><th class="tc">Count</th><th class="tc">Relevance</th><th class="tc">Faithfulness</th><th class="tc">Noise</th><th class="tc">Utility</th></tr></thead><tbody>';
  Object.keys(bd).forEach(function(d){var i=bd[d];
    h+='<tr><td>'+dtag(d)+'</td><td class="tc">'+i.count+'</td>';
    h+='<td class="tc '+cc(i.avg_relevance,4,7)+'">'+i.avg_relevance.toFixed(1)+'</td>';
    h+='<td class="tc '+cc(i.avg_faithfulness,4,7)+'">'+i.avg_faithfulness.toFixed(1)+'</td>';
    h+='<td class="tc '+(i.avg_noise_ratio<.3?'green':'red')+'">'+(i.avg_noise_ratio*100).toFixed(1)+'%</td>';
    h+='<td class="tc '+cc(i.avg_utility,4,7)+'">'+i.avg_utility.toFixed(1)+'</td></tr>';
  });
  h+='</tbody></table></div>';
}
h+='<div class="section"><h2>All Results ('+D.results.length+')</h2>';
D.results.forEach(function(r){
  var rl=cc(r.relevance_score||0,4,7),fl=cc(r.faithfulness_score||0,4,7);
  var ql=r.answer_quality==='Good'?'green':r.answer_quality==='Acceptable'?'yellow':'red';
  h+='<details><summary>';
  h+='<span class="'+rl+'" style="font-weight:600">R:'+(r.relevance_score||0)+'</span> ';
  h+='<span class="'+fl+'" style="font-weight:600">F:'+(r.faithfulness_score||0)+'</span> ';
  h+='<span class="'+ql+'">'+esc(r.answer_quality||'')+'</span> ';
  h+='<span style="margin-left:.5rem">'+esc(r.query)+'</span> ';
  h+=dtag(r.difficulty)+' <span class="gray">'+r.latency_ms+'ms</span>';
  h+='</summary><div style="padding:.5rem 0 1rem 1rem;border-bottom:1px solid #e2e8f0">';
  h+='<div style="margin-bottom:.75rem"><div class="dl">Generated Answer</div><div class="answer-box">'+esc(r.generated_answer||'')+'</div></div>';
  if(r.reasoning){h+='<div style="margin-bottom:.75rem"><div class="dl">Judge Reasoning</div><div style="font-size:.8rem;color:#475569">'+esc(r.reasoning)+'</div></div>';}
  var gc=r.grounded_claims||[],uc=r.ungrounded_claims||[];
  if(gc.length||uc.length){
    h+='<div style="margin-bottom:.75rem"><div class="dl">Claims Analysis</div>';
    gc.forEach(function(c){h+='<div class="claim-good">&#10003; '+esc(c.claim)+' <span class="gray">(chunk #'+c.source_chunk+')</span></div>';});
    uc.forEach(function(c){h+='<div class="claim-bad">&#10007; '+esc(c.claim)+' <span class="gray">&mdash; '+esc(c.explanation)+'</span></div>';});
    h+='</div>';
  }
  var ch=r.chunks_summary||[];
  if(ch.length){
    h+='<div><div class="dl">Retrieved Chunks ('+r.num_chunks+')</div>';
    ch.forEach(function(c){
      var u=(r.useful_chunks||[]).indexOf(c.index)>=0,n=(r.noise_chunks||[]).indexOf(c.index)>=0;
      var lb=u?'<span class="green">useful</span>':n?'<span class="red">noise</span>':'';
      h+='<div class="chunk-row"><span style="font-weight:600">#'+(c.index+1)+'</span>';
      h+='<span class="tag '+(c.source_type==='faq'?'tag-exact':'tag-followup')+'">'+esc(c.source_type)+'</span>';
      h+='<span>'+esc(c.title||c.file_name||'')+'</span><span class="gray">'+(c.score*100).toFixed(1)+'%</span>'+lb+'</div>';
    });
    h+='</div>';
  }
  h+='</div></details>';
});
h+='</div>';
document.getElementById('app').innerHTML=h;
</script></body></html>`;

// --- HTML export: ZIP bundle (report.html + data.js) ---
const exportRetrievalHTML = (results: EvalResult[], summary: EvalSummary, runId?: string) => {
  const id = runId || summary.run_id || '';
  const data = JSON.stringify({
    type: 'retrieval_evaluation', exported_at: new Date().toLocaleString(),
    run_id: id, summary, results,
  }, null, 2);
  const zip = buildZip([
    { name: 'data.js', content: 'var REPORT_DATA = ' + data + ';\n' },
    { name: 'report.html', content: RETRIEVAL_REPORT_HTML },
  ]);
  downloadBlob(zip, `retrieval_eval_${id?.slice(0, 8) || fileTs()}.zip`);
};

const exportQualityHTML = (results: QualityEvalResult[], summary: QualityEvalSummary, runId?: string) => {
  const id = runId || summary.run_id || '';
  const data = JSON.stringify({
    type: 'quality_evaluation', exported_at: new Date().toLocaleString(),
    run_id: id, summary, results,
  }, null, 2);
  const zip = buildZip([
    { name: 'data.js', content: 'var REPORT_DATA = ' + data + ';\n' },
    { name: 'report.html', content: QUALITY_REPORT_HTML },
  ]);
  downloadBlob(zip, `quality_eval_${id?.slice(0, 8) || fileTs()}.zip`);
};

// ---------------------------------------------------------------------------
// Eval Report Modal
// ---------------------------------------------------------------------------
type StatusFilter = 'all' | 'hit1' | 'hitN' | 'miss';

interface EvalReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: EvalResult[];
  summary: EvalSummary;
  evalParams?: { threshold: number; boostFactor: number };
}

const EvalReportModal = ({ isOpen, onClose, results, summary, evalParams }: EvalReportModalProps) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [querySearch, setQuerySearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chunkCache, setChunkCache] = useState<Record<string, SearchResult[]>>({});
  const [chunkLoading, setChunkLoading] = useState<string | null>(null);

  // Collect unique categories from results
  const categories = Array.from(new Set(results.map(r => r.category).filter(Boolean))).sort();

  // Filter results
  const filtered = results.filter(r => {
    if (statusFilter === 'hit1' && !r.hit_at_1) return false;
    if (statusFilter === 'hitN' && (!r.hit_at_n || r.hit_at_1)) return false;
    if (statusFilter === 'miss' && r.hit_at_n) return false;
    if (difficultyFilter && r.difficulty !== difficultyFilter) return false;
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (querySearch && !r.query.toLowerCase().includes(querySearch.toLowerCase())) return false;
    return true;
  });

  // Fetch chunks for a query on expand
  const fetchChunks = useCallback(async (query: string) => {
    if (chunkCache[query]) return;
    setChunkLoading(query);
    try {
      const { data } = await api.get('/test-hub/api/search', {
        params: {
          query,
          threshold: evalParams?.threshold ?? 0.5,
          limit: 10,
          include_faq: true,
          boost_factor: evalParams?.boostFactor ?? 1.0,
        },
      });
      setChunkCache(prev => ({ ...prev, [query]: data.results || [] }));
    } catch {
      setChunkCache(prev => ({ ...prev, [query]: [] }));
    } finally {
      setChunkLoading(null);
    }
  }, [chunkCache, evalParams]);

  const toggleExpand = (r: EvalResult) => {
    if (expandedId === r.id) {
      setExpandedId(null);
    } else {
      setExpandedId(r.id);
      fetchChunks(r.query);
    }
  };

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Compute metrics from filtered results
  const fTotal = filtered.length;
  const fHit1 = filtered.filter(r => r.hit_at_1).length;
  const fHitN = filtered.filter(r => r.hit_at_n).length;
  const fMrr = fTotal ? filtered.reduce((s, r) => s + r.reciprocal_rank, 0) / fTotal : 0;
  const fLatencies = filtered.map(r => r.latency_ms).filter(l => l > 0);
  const fAvgLat = fLatencies.length ? fLatencies.reduce((a, b) => a + b, 0) / fLatencies.length : 0;
  const fSortedLat = [...fLatencies].sort((a, b) => a - b);
  const fP95Lat = fSortedLat.length ? fSortedLat[Math.floor(fSortedLat.length * 0.95)] : 0;
  const fHitRate1 = fTotal ? fHit1 / fTotal : 0;
  const fHitRateN = fTotal ? fHitN / fTotal : 0;
  const isFiltered = filtered.length !== results.length;

  const statusButtons: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: results.length },
    { key: 'hit1', label: 'Hit@1', count: results.filter(r => r.hit_at_1).length },
    { key: 'hitN', label: 'Hit@N', count: results.filter(r => r.hit_at_n && !r.hit_at_1).length },
    { key: 'miss', label: 'Miss', count: results.filter(r => !r.hit_at_n).length },
  ];

  const modalUI = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/5 shrink-0">
          <h3 className="text-white font-medium">Eval Report <span className="text-muted text-sm font-normal ml-1">({results.length} cases{isFiltered ? `, ${filtered.length} shown` : ''})</span></h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Summary metrics row — recomputed from filtered results */}
        <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-white/10 shrink-0">
          <MetricCard label="Hit Rate @1" value={`${(fHitRate1 * 100).toFixed(1)}%`} sub={isFiltered ? `${fHit1}/${fTotal}` : undefined}
            colorClass={fHitRate1 > 0.7 ? 'text-green-400' : fHitRate1 > 0.4 ? 'text-yellow-400' : 'text-red-400'} />
          <MetricCard label={`Hit Rate @${summary.metrics.top_n}`} value={`${(fHitRateN * 100).toFixed(1)}%`} sub={isFiltered ? `${fHitN}/${fTotal}` : undefined}
            colorClass={fHitRateN > 0.8 ? 'text-green-400' : fHitRateN > 0.5 ? 'text-yellow-400' : 'text-red-400'} />
          <MetricCard label="MRR" value={fMrr.toFixed(4)} colorClass="text-accent" />
          <MetricCard label="Avg Latency" value={`${Math.round(fAvgLat)}ms`} sub={`p95: ${Math.round(fP95Lat)}ms`} />
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/10 shrink-0 flex-wrap">
          {/* Status filter */}
          <div className="flex gap-1">
            {statusButtons.map(s => (
              <button key={s.key} onClick={() => setStatusFilter(s.key)}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  statusFilter === s.key
                    ? 'bg-accent/20 text-blue-100 border border-accent/20'
                    : 'text-muted hover:text-white bg-white/5 border border-transparent'
                }`}>
                {s.label} <span className="text-muted ml-0.5">{s.count}</span>
              </button>
            ))}
          </div>

          {/* Difficulty filter */}
          <select value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs">
            <option value="">All difficulties</option>
            <option value="exact">exact</option>
            <option value="paraphrase">paraphrase</option>
            <option value="keywords">keywords</option>
            <option value="followup">followup</option>
          </select>

          {/* Category filter */}
          {categories.length > 0 && (
            <div className="w-[180px] shrink-0">
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs" style={{ textOverflow: 'ellipsis' }}>
                <option value="">All categories</option>
                {categories.map(c => <option key={c} value={c}>{c.length > 40 ? c.slice(0, 40) + '...' : c}</option>)}
              </select>
            </div>
          )}

          {/* Query search */}
          <input value={querySearch} onChange={e => setQuerySearch(e.target.value)}
            placeholder="Search queries..."
            className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white placeholder-white/20 text-xs w-48 focus:outline-none focus:border-accent" />

          <span className="text-xs text-muted ml-auto">Showing {filtered.length} of {results.length}</span>
        </div>

        {/* Result list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-3 space-y-1">
          {filtered.length === 0 && (
            <div className="text-muted text-sm text-center py-8">No results match the current filters</div>
          )}
          {filtered.map(r => {
            const isExpanded = expandedId === r.id;
            const statusIcon = r.hit_at_1 ? '\u2705' : r.hit_at_n ? '\u26A0\uFE0F' : '\u274C';
            const statusColor = r.hit_at_1 ? 'border-l-green-500' : r.hit_at_n ? 'border-l-yellow-500' : 'border-l-red-500';
            const chunks = chunkCache[r.query];
            const isLoadingChunks = chunkLoading === r.query;

            return (
              <div key={r.id} className={`border-l-2 ${statusColor} bg-white/5 border border-white/10 rounded-r-lg overflow-hidden`}>
                {/* Collapsed row */}
                <button onClick={() => toggleExpand(r)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors">
                  <span className="text-sm shrink-0">{statusIcon}</span>
                  <span className="text-sm text-gray-200 truncate flex-1 min-w-0">{r.query}</span>
                  <Badge variant={r.difficulty === 'exact' ? 'green' : r.difficulty === 'paraphrase' ? 'yellow' : r.difficulty === 'followup' ? 'red' : 'blue'}>{r.difficulty}</Badge>
                  {r.match_details?.source_type && <Badge>{r.match_details.source_type}</Badge>}
                  {r.category && <span className="text-xs text-muted truncate max-w-[80px]">{r.category}</span>}
                  <span className={`text-xs font-mono shrink-0 ${r.hit_at_1 ? 'text-green-400' : r.hit_at_n ? 'text-yellow-400' : 'text-red-400'}`}>
                    {r.rank ? `#${r.rank}` : 'miss'}
                  </span>
                  <span className="text-xs text-muted shrink-0 w-14 text-right">{r.latency_ms}ms</span>
                  <span className="text-muted text-xs shrink-0">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </button>

                {/* Expanded chunk inspection */}
                {isExpanded && (
                  <div className="px-4 pb-3 pt-1 border-t border-white/5 bg-black/20">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-muted">Retrieved chunks for this query:</div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const payload = { ...r, retrieved_chunks: chunks || [] };
                          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `eval_${r.id.slice(0, 8)}_${r.difficulty}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="px-2 py-0.5 rounded text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 transition-colors">
                        Export JSON
                      </button>
                    </div>
                    {isLoadingChunks && !chunks && (
                      <div className="text-xs text-muted py-4 text-center animate-pulse">Loading chunks...</div>
                    )}
                    {chunks && chunks.length === 0 && (
                      <div className="text-xs text-red-400 py-2">No chunks retrieved</div>
                    )}
                    {chunks && chunks.length > 0 && (
                      <div className="space-y-1.5">
                        {chunks.map((c, ci) => {
                          const isMatch = r.match_details && r.match_details.rank === ci + 1;
                          return (
                            <div key={ci}
                              className={`rounded-lg p-2.5 border ${
                                isMatch
                                  ? 'border-green-500/40 bg-green-500/5 border-l-2 border-l-green-400'
                                  : 'border-white/5 bg-white/[0.02]'
                              }`}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-xs font-mono text-muted">#{ci + 1}</span>
                                <Badge variant={c.source_type === 'faq' ? 'green' : 'blue'}>{c.source_type}</Badge>
                                <span className="text-xs text-gray-300 truncate flex-1">{c.title || 'No title'}</span>
                                {isMatch && <span className="text-yellow-400 text-sm" title="Matched chunk">★</span>}
                                <span className="text-xs font-bold text-white">{(c.final_score * 100).toFixed(1)}%</span>
                              </div>
                              <div className="text-xs text-muted line-clamp-2 mb-2">{c.body_preview}</div>
                              <div className="flex gap-3">
                                <ScoreBar label="Similarity" value={c.similarity} color="text-accent" />
                                <ScoreBar label="Content" value={c.norm_content_score} color="text-green-400" />
                                <ScoreBar label="Final" value={c.final_score} color="text-yellow-400" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(modalUI, document.body);
};

// ============================= MAIN COMPONENT =============================
export const TestHub = () => {
  const [subTab, setSubTab] = useState<SubTab>('dashboard');

  const subTabs: { key: SubTab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'search', label: 'Query Playground' },
    { key: 'eval', label: 'Eval Runner' },
    { key: 'history', label: 'History' },
    { key: 'quality', label: 'Quality Eval' },
    { key: 'quality-history', label: 'Quality History' },
    { key: 'inspector', label: 'Chunk Inspector' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {subTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              subTab === t.key
                ? 'bg-accent/20 text-blue-100 border border-accent/20'
                : 'text-muted hover:text-white bg-white/5 border border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        {subTab === 'dashboard' && <DashboardTab />}
        {subTab === 'search' && <SearchTab />}
        {subTab === 'eval' && <EvalTab />}
        {subTab === 'history' && <HistoryTab />}
        {subTab === 'quality' && <QualityEvalTab />}
        {subTab === 'quality-history' && <QualityHistoryTab />}
        {subTab === 'inspector' && <InspectorTab />}
      </div>
    </div>
  );
};

// ============================= DASHBOARD =============================
const DashboardTab = () => {
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
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Documents" value={String(stats.documents.total)} />
        <MetricCard label="Doc Chunks" value={String(stats.chunks.document_chunks)} />
        <MetricCard label="FAQ Pairs" value={String(stats.faq_pair_count)} />
        <MetricCard label="Total Embeddings" value={String(stats.chunks.total)} colorClass="text-accent" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Documents list */}
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

        {/* Type breakdown + FAQ sources */}
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

// ============================= SEARCH PLAYGROUND =============================
const SearchTab = () => {
  const [query, setQuery] = useState('');
  const [threshold, setThreshold] = useState(0.7);
  const [limit, setLimit] = useState(10);
  const [includeFaq, setIncludeFaq] = useState(true);
  const [boostFactor, setBoostFactor] = useState(1.0);
  const [searching, setSearching] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState('');

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const { data } = await api.get('/test-hub/api/search', {
        params: { query, threshold, limit, include_faq: includeFaq, boost_factor: boostFactor },
      });
      setResponse(data);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <form onSubmit={handleSearch} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a search query..."
            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-accent text-sm"
          />
          <button
            type="submit"
            disabled={searching}
            className="bg-accent/20 border border-accent/40 text-blue-100 px-5 py-2 rounded-xl hover:bg-accent/30 transition-colors font-medium disabled:opacity-50 text-sm"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
        <div className="flex gap-4 text-sm items-center">
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs">Threshold</label>
            <input type="number" step="0.05" min="0" max="1" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-center text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs">Limit</label>
            <input type="number" min="1" max="50" value={limit} onChange={e => setLimit(parseInt(e.target.value))}
              className="w-14 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-center text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs">FAQ</label>
            <select value={String(includeFaq)} onChange={e => setIncludeFaq(e.target.value === 'true')}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs">
              <option value="true">Include</option>
              <option value="false">Exclude</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted text-xs">FAQ Boost</label>
            <input type="number" step="0.1" min="0" max="5" value={boostFactor} onChange={e => setBoostFactor(parseFloat(e.target.value))}
              className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-center text-xs" />
          </div>
        </div>
      </form>

      {/* Timing */}
      {response && (
        <div className="text-xs text-muted flex gap-3">
          <span className="text-accent">Embed: {response.timing.embedding_ms}ms</span>
          <span className="text-green-400">Search: {response.timing.search_ms}ms</span>
          <span className="text-white">Total: {response.timing.total_ms}ms</span>
          <span>{response.raw_count} raw &rarr; {response.results.length} returned</span>
        </div>
      )}

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {/* Results */}
      <div className="space-y-2">
        {response?.results.map((r, i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/[0.07] transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted">#{i + 1}</span>
                <Badge>{r.source_type}</Badge>
                {r.matched_via && <Badge variant="yellow">{r.matched_via}</Badge>}
                {r.category && <Badge variant="green">{r.category}</Badge>}
              </div>
              <span className="text-sm font-bold text-white">{(r.final_score * 100).toFixed(1)}%</span>
            </div>
            <div className="text-sm font-medium text-gray-200 mb-1">{r.title || 'No title'}</div>
            <div className="text-xs text-muted mb-3 line-clamp-2">{r.body_preview}</div>
            <div className="flex gap-3">
              <ScoreBar label="Similarity" value={r.similarity} color="text-accent" />
              <ScoreBar label="Content" value={r.norm_content_score} color="text-green-400" />
              <ScoreBar label="Final (0.7/0.3)" value={r.final_score} color="text-yellow-400" />
            </div>
          </div>
        ))}
        {response && response.results.length === 0 && (
          <div className="text-muted text-sm text-center py-8">No results</div>
        )}
      </div>
    </div>
  );
};

// ============================= EVAL RUNNER =============================
const EvalTab = () => {
  const [source, setSource] = useState('auto');
  const [difficulty, setDifficulty] = useState('');
  const [topN, setTopN] = useState(5);
  const [threshold, setThreshold] = useState(0.7);
  const [boostFactor, setBoostFactor] = useState(1.0);
  const [maxCases, setMaxCases] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ index: 0, total: 0 });
  const [liveStats, setLiveStats] = useState({ hits1: 0, hitsN: 0, count: 0 });
  const [logLines, setLogLines] = useState<{ text: string; color: string }[]>([]);
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [evalResults, setEvalResults] = useState<EvalResult[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const evalParamsRef = useRef({ threshold: 0.7, boostFactor: 1.0 });
  const logRef = useRef<HTMLDivElement>(null);

  // --- Generation state ---
  const [genSource, setGenSource] = useState('both');
  const [genPhases, setGenPhases] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ processed: 0, total: 0, phase: '' });
  const [genSummary, setGenSummary] = useState<GenerationSummary | null>(null);
  const [dbTestCaseCount, setDbTestCaseCount] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  // Load DB test case count on mount
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/test-hub/api/generated-test-cases', { params: { limit: 1, offset: 0 } });
        setDbTestCaseCount(data.total ?? 0);
      } catch { /* ignore */ }
    })();
  }, [genSummary]);

  const addLog = (text: string, color: string) => {
    setLogLines(prev => [...prev, { text, color }]);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  // --- Generate test cases ---
  const runGeneration = async () => {
    setGenerating(true);
    setGenSummary(null);
    setGenProgress({ processed: 0, total: 0, phase: '' });

    const params = new URLSearchParams({ sources: genSource, phases: genPhases });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const baseUrl = api.defaults.baseURL?.replace(/\/+$/, '') || '';
      const res = await fetch(`${baseUrl}/test-hub/api/generate-test-cases?${params}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok || !res.body) {
        addLog?.(`Generation failed: ${res.status}`, 'text-red-400');
        setGenerating(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }

          if (data.type === 'start') {
            setGenProgress({ processed: 0, total: data.total, phase: 'starting' });
          } else if (data.type === 'phase') {
            setGenProgress(prev => ({ ...prev, phase: data.phase }));
          } else if (data.type === 'progress') {
            setGenProgress({ processed: data.processed, total: data.total, phase: data.phase });
          } else if (data.type === 'complete') {
            setGenSummary(data);
          } else if (data.type === 'error') {
            setGenSummary(null);
          }
        }
      }
    } catch { /* ignore */ }

    setGenerating(false);
  };

  const clearTestCases = async () => {
    if (!confirm('Clear all generated test cases from the database?')) return;
    setClearing(true);
    try {
      await api.delete('/test-hub/api/generated-test-cases');
      setDbTestCaseCount(0);
      setGenSummary(null);
    } catch { /* ignore */ }
    setClearing(false);
  };

  // --- Run eval ---
  const runEval = async () => {
    setRunning(true);
    setSummary(null);
    setEvalResults([]);
    setLogLines([]);
    setProgress({ index: 0, total: 0 });
    setLiveStats({ hits1: 0, hitsN: 0, count: 0 });
    evalParamsRef.current = { threshold, boostFactor };

    const params = new URLSearchParams({
      source,
      top_n: String(topN),
      threshold: String(threshold),
      boost_factor: String(boostFactor),
    });
    if (difficulty) params.set('difficulty', difficulty);
    if (maxCases) params.set('max_cases', maxCases);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const baseUrl = api.defaults.baseURL?.replace(/\/+$/, '') || '';
      const res = await fetch(`${baseUrl}/test-hub/api/run-eval?${params}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok || !res.body) {
        addLog(`Eval request failed: ${res.status}`, 'text-red-400');
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let h1 = 0, hN = 0, cnt = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }

          if (data.type === 'start') {
            addLog(`Starting evaluation: ${data.total} test cases`, 'text-accent');
            setProgress({ index: 0, total: data.total });
          } else if (data.type === 'progress') {
            const r: EvalResult = data.result;
            cnt++;
            if (r.hit_at_1) h1++;
            if (r.hit_at_n) hN++;
            setProgress({ index: data.index, total: data.total });
            setLiveStats({ hits1: h1, hitsN: hN, count: cnt });
            setEvalResults(prev => [...prev, r]);

            const icon = r.hit_at_1 ? '\u2705' : r.hit_at_n ? '\u2B55' : '\u274C';
            const color = r.hit_at_1 ? 'text-green-400' : r.hit_at_n ? 'text-yellow-400' : 'text-red-400';
            addLog(`${icon} [${r.id?.slice(0, 8) ?? ''}] ${r.query} (${r.difficulty}) — rank: ${r.rank ?? 'miss'} — ${r.latency_ms}ms`, color);
          } else if (data.type === 'complete') {
            setSummary(data);
            addLog('Evaluation complete!', 'text-green-400');
            if (data.saved_to) addLog(`Saved to: ${data.saved_to}`, 'text-muted');
          }
        }
      }
    } catch (e: any) {
      addLog(`Error: ${e.message}`, 'text-red-400');
    }

    setRunning(false);
  };

  const pct = progress.total > 0 ? (progress.index / progress.total * 100) : 0;
  const genPct = genProgress.total > 0 ? (genProgress.processed / genProgress.total * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ---- Generate Test Cases Panel ---- */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-medium text-sm">Generate Test Cases</h3>
          {dbTestCaseCount !== null && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent/20 text-accent">
              {dbTestCaseCount} in DB
            </span>
          )}
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-xs text-muted block mb-1">Source</label>
            <select value={genSource} onChange={e => setGenSource(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
              <option value="both">FAQs + Documents</option>
              <option value="faq">FAQs Only</option>
              <option value="document">Documents Only</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Phases</label>
            <select value={genPhases} onChange={e => setGenPhases(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
              <option value="all">All</option>
              <option value="standard">Standard Only</option>
              <option value="followup">Follow-ups Only</option>
            </select>
          </div>
          <button onClick={runGeneration} disabled={generating}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              generating ? 'bg-white/10 text-muted cursor-not-allowed' : 'bg-accent/20 text-blue-100 hover:bg-accent/30 border border-accent/40'
            }`}>
            {generating ? 'Generating...' : 'Generate'}
          </button>
          <button onClick={clearTestCases} disabled={clearing || generating}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50">
            {clearing ? 'Clearing...' : 'Clear All'}
          </button>
        </div>

        {/* Generation progress */}
        {generating && (
          <div>
            <div className="flex justify-between mb-1 text-xs">
              <span className="text-muted">Phase: <span className="text-white">{genProgress.phase || 'starting'}</span></span>
              <span className="text-muted">{genProgress.processed}/{genProgress.total}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${genPct}%` }} />
            </div>
          </div>
        )}

        {/* Generation summary */}
        {genSummary && (
          <div className="grid grid-cols-4 gap-2">
            <MetricCard label="Total Generated" value={String(genSummary.total_test_cases)} colorClass="text-accent" />
            <MetricCard label="From FAQs" value={String(genSummary.faq_sourced)} colorClass="text-green-400" />
            <MetricCard label="From Docs" value={String(genSummary.document_sourced)} colorClass="text-blue-400" />
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="text-xs text-muted mb-2">By Difficulty</div>
              <div className="space-y-1">
                {Object.entries(genSummary.by_difficulty).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-gray-400">{k}</span>
                    <span className="text-yellow-400 font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---- Eval Runner Controls ---- */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted block mb-1">Test Cases</label>
          <select value={source} onChange={e => setSource(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="auto">Database (auto)</option>
            <option value="db">Database only</option>
            <option value="csv_auto">CSV: Auto</option>
            <option value="csv_manual">CSV: Manual</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Difficulty</label>
          <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="">All</option>
            <option value="exact">Exact</option>
            <option value="paraphrase">Paraphrase</option>
            <option value="keywords">Keywords</option>
            <option value="followup">Follow-up</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Top-N</label>
          <input type="number" min="1" max="20" value={topN} onChange={e => setTopN(parseInt(e.target.value))}
            className="w-14 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Threshold</label>
          <input type="number" step="0.05" min="0" max="1" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))}
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Max Cases</label>
          <input type="number" min="1" value={maxCases} onChange={e => setMaxCases(e.target.value)} placeholder="all"
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">FAQ Boost</label>
          <input type="number" step="0.1" min="0" max="5" value={boostFactor} onChange={e => setBoostFactor(parseFloat(e.target.value))}
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <button onClick={runEval} disabled={running || generating}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            running || generating ? 'bg-white/10 text-muted cursor-not-allowed' : 'bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/30'
          }`}>
          {running ? 'Running...' : 'Run Evaluation'}
        </button>
      </div>

      {/* Progress */}
      {(running || summary) && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-white font-medium">{running ? 'Running...' : 'Complete'}</span>
              {!running && summary && evalResults.length > 0 && (
                <>
                  <button onClick={() => setReportOpen(true)}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-accent/20 text-blue-100 hover:bg-accent/30 border border-accent/40 transition-colors">
                    View Report
                  </button>
                  <button onClick={() => exportRetrievalHTML(evalResults, summary)}
                    className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                    Export HTML
                  </button>
                  <button onClick={() => exportRetrievalJSON(evalResults, summary)}
                    className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                    Export JSON
                  </button>
                </>
              )}
            </div>
            <span className="text-muted text-xs">{progress.index}/{progress.total}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          {liveStats.count > 0 && (
            <div className="flex gap-4 mt-2 text-xs text-muted">
              <span>Hit@1: <span className="text-white">{(liveStats.hits1 / liveStats.count * 100).toFixed(1)}%</span></span>
              <span>Hit@N: <span className="text-white">{(liveStats.hitsN / liveStats.count * 100).toFixed(1)}%</span></span>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <MetricCard label="Hit Rate @1" value={`${(summary.metrics.hit_rate_1 * 100).toFixed(1)}%`}
              colorClass={summary.metrics.hit_rate_1 > 0.7 ? 'text-green-400' : summary.metrics.hit_rate_1 > 0.4 ? 'text-yellow-400' : 'text-red-400'} />
            <MetricCard label={`Hit Rate @${summary.metrics.top_n}`} value={`${(summary.metrics.hit_rate_n * 100).toFixed(1)}%`}
              colorClass={summary.metrics.hit_rate_n > 0.8 ? 'text-green-400' : summary.metrics.hit_rate_n > 0.5 ? 'text-yellow-400' : 'text-red-400'} />
            <MetricCard label="MRR" value={summary.metrics.mrr.toFixed(4)} colorClass="text-accent" />
            <MetricCard label="Avg Latency" value={`${summary.metrics.avg_latency_ms}ms`} sub={`p95: ${summary.metrics.p95_latency_ms}ms`} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Difficulty breakdown */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-white font-medium text-sm mb-3">By Difficulty</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted">
                    <th className="text-left py-1">Difficulty</th>
                    <th className="text-center">Count</th>
                    <th className="text-center">Hit@1</th>
                    <th className="text-center">Hit@N</th>
                    <th className="text-center">MRR</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.breakdowns.by_difficulty).map(([diff, info]) => (
                    <tr key={diff} className="border-t border-white/5">
                      <td className="py-1.5 text-gray-300 font-medium">{diff}</td>
                      <td className="text-center text-muted">{info.count}</td>
                      <td className={`text-center ${info.hit_rate_1 > 0.7 ? 'text-green-400' : 'text-red-400'}`}>{(info.hit_rate_1 * 100).toFixed(1)}%</td>
                      <td className={`text-center ${info.hit_rate_n > 0.8 ? 'text-green-400' : 'text-red-400'}`}>{(info.hit_rate_n * 100).toFixed(1)}%</td>
                      <td className="text-center text-accent">{info.mrr.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Gap report */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-white font-medium text-sm mb-3">Gap Report</h3>
              <div className="text-xs space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {summary.gaps.zero_results.length > 0 && (
                  <div>
                    <div className="text-red-400 font-semibold">{summary.gaps.zero_results.length} queries returned ZERO results</div>
                    {summary.gaps.zero_results.slice(0, 5).map(r => (
                      <div key={r.id} className="pl-2 text-muted">[{r.id?.slice(0, 8)}] {r.query}</div>
                    ))}
                  </div>
                )}
                {summary.gaps.missed.length > 0 && (
                  <div>
                    <div className="text-yellow-400 font-semibold">{summary.gaps.missed.length} expected results NOT in top-N</div>
                    {summary.gaps.missed.slice(0, 5).map(r => (
                      <div key={r.id} className="pl-2 text-muted">[{r.id?.slice(0, 8)}] {r.query}</div>
                    ))}
                  </div>
                )}
                {summary.gaps.low_rank.length > 0 && (
                  <div>
                    <div className="text-accent font-semibold">{summary.gaps.low_rank.length} found but NOT at rank 1</div>
                    {summary.gaps.low_rank.slice(0, 5).map(r => (
                      <div key={r.id} className="pl-2 text-muted">[{r.id?.slice(0, 8)}] rank={r.rank} {r.query}</div>
                    ))}
                  </div>
                )}
                {summary.gaps.zero_results.length === 0 && summary.gaps.missed.length === 0 && summary.gaps.low_rank.length === 0 && (
                  <div className="text-green-400">No gaps detected!</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Live log */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-white font-medium text-sm mb-2">Live Log</h3>
        <div ref={logRef} className="max-h-60 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5">
          {logLines.length === 0 && <span className="text-muted">Run an evaluation to see results...</span>}
          {logLines.map((l, i) => (
            <div key={i} className={l.color}>{l.text}</div>
          ))}
        </div>
      </div>

      {/* Report modal */}
      {summary && evalResults.length > 0 && (
        <EvalReportModal
          isOpen={reportOpen}
          onClose={() => setReportOpen(false)}
          results={evalResults}
          summary={summary}
          evalParams={evalParamsRef.current}
        />
      )}
    </div>
  );
};

// ============================= HISTORY =============================
const HistoryTab = () => {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ id: string; label: string; results: EvalResult[]; summary: EvalSummary | null } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/test-hub/api/eval-history');
        setRuns(data.runs || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadDetail = async (run: HistoryRun) => {
    try {
      const { data } = await api.get(`/test-hub/api/eval-result/${run.id}`);
      const label = run.run_at ? new Date(run.run_at).toLocaleString() : run.id.slice(0, 8);
      setDetail({ id: run.id, label, results: data.results || [], summary: data.summary || null });
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  if (loading) return <div className="text-muted text-sm">Loading history...</div>;

  if (detail) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button onClick={() => { setDetail(null); setReportOpen(false); }} className="text-xs text-accent hover:underline">&larr; Back to list</button>
          {detail.summary && detail.results.length > 0 && (
            <>
              <button onClick={() => setReportOpen(true)}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-accent/20 text-blue-100 hover:bg-accent/30 border border-accent/40 transition-colors">
                View Report
              </button>
              <button onClick={() => exportRetrievalHTML(detail.results, detail.summary!, detail.id)}
                className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                Export HTML
              </button>
              <button onClick={() => exportRetrievalJSON(detail.results, detail.summary!, detail.id)}
                className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                Export JSON
              </button>
            </>
          )}
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-white font-medium text-sm mb-3">{detail.label} &mdash; {detail.results.length} cases</h3>
          <div className="max-h-96 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5">
            {detail.results.map(r => {
              const icon = r.hit_at_1 ? '\u2705' : r.hit_at_n ? '\u2B55' : '\u274C';
              const color = r.hit_at_1 ? 'text-green-400' : r.hit_at_n ? 'text-yellow-400' : 'text-red-400';
              return <div key={r.id} className={color}>{icon} [{r.id}] {r.query} — rank: {r.rank ?? 'miss'} — {r.latency_ms}ms ({r.difficulty})</div>;
            })}
          </div>
        </div>
        {detail.summary && detail.results.length > 0 && (
          <EvalReportModal
            isOpen={reportOpen}
            onClose={() => setReportOpen(false)}
            results={detail.results}
            summary={detail.summary}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.length === 0 && <div className="text-muted text-sm">No evaluation runs yet</div>}
      {runs.map(r => (
        <div key={r.id} onClick={() => loadDetail(r)}
          className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.07] cursor-pointer transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-200">{r.run_at ? new Date(r.run_at).toLocaleString() : r.id.slice(0, 8)}</span>
              <span className="text-xs text-muted ml-2">{r.total} cases</span>
            </div>
            <div className="flex gap-4 text-xs">
              <span>Hit@1: <span className={`font-bold ${r.hit_rate_1 > 0.7 ? 'text-green-400' : 'text-red-400'}`}>{(r.hit_rate_1 * 100).toFixed(1)}%</span></span>
              <span>Hit@N: <span className={`font-bold ${r.hit_rate_n > 0.8 ? 'text-green-400' : 'text-red-400'}`}>{(r.hit_rate_n * 100).toFixed(1)}%</span></span>
              <span>MRR: <span className="font-bold text-accent">{r.mrr ? r.mrr.toFixed(3) : '\u2014'}</span></span>
              <span>Latency: <span className="text-gray-300">{r.avg_latency_ms ? `${r.avg_latency_ms}ms` : '\u2014'}</span></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================= QUALITY REPORT MODAL =============================
type QualityFilter = 'all' | 'high' | 'medium' | 'low';

interface QualityReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: QualityEvalResult[];
}

const QualityReportModal = ({ isOpen, onClose, results }: QualityReportModalProps) => {
  const [relevanceFilter, setRelevanceFilter] = useState<QualityFilter>('all');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [querySearch, setQuerySearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = Array.from(new Set(results.map(r => r.category).filter(Boolean))).sort();

  const filtered = results.filter(r => {
    if (relevanceFilter === 'high' && r.relevance_score < 7) return false;
    if (relevanceFilter === 'medium' && (r.relevance_score < 4 || r.relevance_score >= 7)) return false;
    if (relevanceFilter === 'low' && r.relevance_score >= 4) return false;
    if (difficultyFilter && r.difficulty !== difficultyFilter) return false;
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (querySearch && !r.query.toLowerCase().includes(querySearch.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fTotal = filtered.length || 1;
  const fAvgRel = filtered.reduce((s, r) => s + (r.relevance_score || 0), 0) / fTotal;
  const fAvgFaith = filtered.reduce((s, r) => s + (r.faithfulness_score || 0), 0) / fTotal;
  const fAvgNoise = filtered.reduce((s, r) => s + (r.noise_ratio || 0), 0) / fTotal;
  const fAvgUtility = filtered.reduce((s, r) => s + (r.utility || 0), 0) / fTotal;
  const isFiltered = filtered.length !== results.length;

  const relevanceButtons: { key: QualityFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: results.length },
    { key: 'high', label: 'High (7+)', count: results.filter(r => r.relevance_score >= 7).length },
    { key: 'medium', label: 'Medium (4-6)', count: results.filter(r => r.relevance_score >= 4 && r.relevance_score < 7).length },
    { key: 'low', label: 'Low (<4)', count: results.filter(r => r.relevance_score < 4).length },
  ];

  const relColor = (v: number) => v >= 7 ? 'text-green-400' : v >= 4 ? 'text-yellow-400' : 'text-red-400';
  const qualityBadge = (q: string) => q === 'Good' ? 'green' as const : q === 'Acceptable' ? 'yellow' as const : 'red' as const;

  const modalUI = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/5 shrink-0">
          <h3 className="text-white font-medium">Quality Report <span className="text-muted text-sm font-normal ml-1">({results.length} cases{isFiltered ? `, ${filtered.length} shown` : ''})</span></h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Summary metrics */}
        <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-white/10 shrink-0">
          <MetricCard label="Avg Relevance" value={`${fAvgRel.toFixed(1)}/10`} colorClass={relColor(fAvgRel)} />
          <MetricCard label="Avg Faithfulness" value={`${fAvgFaith.toFixed(1)}/10`} colorClass={relColor(fAvgFaith)} />
          <MetricCard label="Noise Ratio" value={`${(fAvgNoise * 100).toFixed(1)}%`} colorClass={fAvgNoise < 0.3 ? 'text-green-400' : fAvgNoise < 0.5 ? 'text-yellow-400' : 'text-red-400'} />
          <MetricCard label="Utility" value={`${fAvgUtility.toFixed(1)}/10`} colorClass={relColor(fAvgUtility)} />
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/10 shrink-0 flex-wrap">
          <div className="flex gap-1">
            {relevanceButtons.map(s => (
              <button key={s.key} onClick={() => setRelevanceFilter(s.key)}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  relevanceFilter === s.key
                    ? 'bg-accent/20 text-blue-100 border border-accent/20'
                    : 'text-muted hover:text-white bg-white/5 border border-transparent'
                }`}>
                {s.label} <span className="text-muted ml-0.5">{s.count}</span>
              </button>
            ))}
          </div>

          <select value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs">
            <option value="">All difficulties</option>
            <option value="exact">exact</option>
            <option value="paraphrase">paraphrase</option>
            <option value="keywords">keywords</option>
            <option value="followup">followup</option>
          </select>

          {categories.length > 0 && (
            <div className="w-[180px] shrink-0">
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-xs" style={{ textOverflow: 'ellipsis' }}>
                <option value="">All categories</option>
                {categories.map(c => <option key={c} value={c}>{c.length > 40 ? c.slice(0, 40) + '...' : c}</option>)}
              </select>
            </div>
          )}

          <input value={querySearch} onChange={e => setQuerySearch(e.target.value)}
            placeholder="Search queries..."
            className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white placeholder-white/20 text-xs w-48 focus:outline-none focus:border-accent" />

          <span className="text-xs text-muted ml-auto">Showing {filtered.length} of {results.length}</span>
        </div>

        {/* Result list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-3 space-y-1">
          {filtered.length === 0 && (
            <div className="text-muted text-sm text-center py-8">No results match the current filters</div>
          )}
          {filtered.map(r => {
            const isExpanded = expandedId === r.id;

            return (
              <div key={r.id} className={`border-l-2 ${r.relevance_score >= 7 ? 'border-l-green-500' : r.relevance_score >= 4 ? 'border-l-yellow-500' : 'border-l-red-500'} bg-white/5 border border-white/10 rounded-r-lg overflow-hidden`}>
                {/* Collapsed row */}
                <button onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors">
                  <Badge variant={relColor(r.relevance_score).includes('green') ? 'green' : relColor(r.relevance_score).includes('yellow') ? 'yellow' : 'red'}>R:{r.relevance_score}</Badge>
                  <Badge variant={relColor(r.faithfulness_score).includes('green') ? 'green' : relColor(r.faithfulness_score).includes('yellow') ? 'yellow' : 'red'}>F:{r.faithfulness_score}</Badge>
                  <Badge variant={qualityBadge(r.answer_quality)}>{r.answer_quality}</Badge>
                  <span className="text-sm text-gray-200 truncate flex-1 min-w-0">{r.query}</span>
                  <Badge variant={r.difficulty === 'exact' ? 'green' : r.difficulty === 'paraphrase' ? 'yellow' : r.difficulty === 'followup' ? 'red' : 'blue'}>{r.difficulty}</Badge>
                  <span className="text-xs text-muted shrink-0">{r.latency_ms}ms</span>
                  <span className="text-muted text-xs shrink-0">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-3 pt-1 border-t border-white/5 bg-black/20 space-y-3">
                    {/* Generated answer */}
                    <div>
                      <div className="text-xs text-muted mb-1 font-medium">Generated Answer</div>
                      <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-gray-200 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
                        {r.generated_answer}
                      </div>
                    </div>

                    {/* Reasoning */}
                    {r.reasoning && (
                      <div>
                        <div className="text-xs text-muted mb-1 font-medium">Judge Reasoning</div>
                        <div className="text-xs text-gray-400 bg-white/[0.02] rounded-lg p-2">{r.reasoning}</div>
                      </div>
                    )}

                    {/* Claim mapping */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Grounded claims */}
                      <div>
                        <div className="text-xs text-green-400 mb-1 font-medium">Grounded Claims ({r.grounded_claims?.length || 0})</div>
                        <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                          {(r.grounded_claims || []).map((c, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs bg-green-500/5 border border-green-500/20 rounded p-2">
                              <span className="text-green-400 shrink-0 mt-0.5">{'\u2713'}</span>
                              <div className="min-w-0">
                                <div className="text-gray-300">{c.claim}</div>
                                <div className="text-green-400/70 text-[10px]">Chunk #{c.source_chunk}</div>
                              </div>
                            </div>
                          ))}
                          {(!r.grounded_claims || r.grounded_claims.length === 0) && (
                            <div className="text-xs text-muted">None</div>
                          )}
                        </div>
                      </div>

                      {/* Ungrounded claims */}
                      <div>
                        <div className="text-xs text-red-400 mb-1 font-medium">Ungrounded Claims ({r.ungrounded_claims?.length || 0})</div>
                        <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                          {(r.ungrounded_claims || []).map((c, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs bg-red-500/5 border border-red-500/20 rounded p-2">
                              <span className="text-red-400 shrink-0 mt-0.5">{'\u2717'}</span>
                              <div className="min-w-0">
                                <div className="text-gray-300">{c.claim}</div>
                                <div className="text-red-400/70 text-[10px]">{c.explanation}</div>
                              </div>
                            </div>
                          ))}
                          {(!r.ungrounded_claims || r.ungrounded_claims.length === 0) && (
                            <div className="text-xs text-muted">None</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Chunks */}
                    <div>
                      <div className="text-xs text-muted mb-1 font-medium">Retrieved Chunks ({r.num_chunks})</div>
                      <div className="space-y-1.5">
                        {(r.chunks_summary || []).map(c => {
                          const isUseful = (r.useful_chunks || []).includes(c.index);
                          const isNoise = (r.noise_chunks || []).includes(c.index);
                          return (
                            <div key={c.index}
                              className={`rounded-lg p-2.5 border ${
                                isUseful ? 'border-green-500/40 bg-green-500/5' : isNoise ? 'border-red-500/40 bg-red-500/5' : 'border-white/5 bg-white/[0.02]'
                              }`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono text-muted">#{c.index}</span>
                                <Badge variant={c.source_type === 'faq' ? 'green' : 'blue'}>{c.source_type}</Badge>
                                <span className="text-xs text-gray-300 truncate flex-1">{c.title || c.file_name || 'No title'}</span>
                                {isUseful && <span className="text-green-400 text-xs">useful</span>}
                                {isNoise && <span className="text-red-400 text-xs">noise</span>}
                                <span className="text-xs font-bold text-white">{(c.score * 100).toFixed(1)}%</span>
                              </div>
                              <div className="text-xs text-muted line-clamp-2">{c.content_preview}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(modalUI, document.body);
};

// ============================= QUALITY EVAL TAB =============================
const QualityEvalTab = () => {
  const [source, setSource] = useState('auto');
  const [difficulty, setDifficulty] = useState('');
  const [threshold, setThreshold] = useState(0.7);
  const [boostFactor, setBoostFactor] = useState(1.0);
  const [maxCases, setMaxCases] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ index: 0, total: 0 });
  const [liveStats, setLiveStats] = useState({ relevance: 0, faithfulness: 0, noise: 0, count: 0 });
  const [logLines, setLogLines] = useState<{ text: string; color: string }[]>([]);
  const [summary, setSummary] = useState<QualityEvalSummary | null>(null);
  const [evalResults, setEvalResults] = useState<QualityEvalResult[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (text: string, color: string) => {
    setLogLines(prev => [...prev, { text, color }]);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  const runQualityEval = async () => {
    setRunning(true);
    setSummary(null);
    setEvalResults([]);
    setLogLines([]);
    setProgress({ index: 0, total: 0 });
    setLiveStats({ relevance: 0, faithfulness: 0, noise: 0, count: 0 });

    const params = new URLSearchParams({
      source,
      threshold: String(threshold),
      boost_factor: String(boostFactor),
    });
    if (difficulty) params.set('difficulty', difficulty);
    if (maxCases) params.set('max_cases', maxCases);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const baseUrl = api.defaults.baseURL?.replace(/\/+$/, '') || '';
      const res = await fetch(`${baseUrl}/test-hub/api/run-quality-eval?${params}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok || !res.body) {
        addLog(`Quality eval failed: ${res.status}`, 'text-red-400');
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalRel = 0, totalFaith = 0, totalNoise = 0, cnt = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }

          if (data.type === 'start') {
            addLog(`Starting quality evaluation: ${data.total} test cases`, 'text-accent');
            setProgress({ index: 0, total: data.total });
          } else if (data.type === 'progress') {
            const r: QualityEvalResult = data.result;
            cnt++;
            totalRel += r.relevance_score || 0;
            totalFaith += r.faithfulness_score || 0;
            totalNoise += r.noise_ratio || 0;
            setProgress({ index: data.index, total: data.total });
            setLiveStats({ relevance: totalRel / cnt, faithfulness: totalFaith / cnt, noise: totalNoise / cnt, count: cnt });
            setEvalResults(prev => [...prev, r]);

            const relIcon = r.relevance_score >= 7 ? '\u2705' : r.relevance_score >= 4 ? '\u26A0\uFE0F' : '\u274C';
            const color = r.relevance_score >= 7 ? 'text-green-400' : r.relevance_score >= 4 ? 'text-yellow-400' : 'text-red-400';
            addLog(`${relIcon} [${r.id?.slice(0, 8) ?? ''}] R:${r.relevance_score} F:${r.faithfulness_score} Q:${r.answer_quality} — ${r.query} (${r.difficulty}) — ${r.latency_ms}ms`, color);
          } else if (data.type === 'complete') {
            setSummary(data);
            addLog('Quality evaluation complete!', 'text-green-400');
            if (data.run_id) addLog(`Saved run: ${data.run_id}`, 'text-muted');
          }
        }
      }
    } catch (e: any) {
      addLog(`Error: ${e.message}`, 'text-red-400');
    }

    setRunning(false);
  };

  const pct = progress.total > 0 ? (progress.index / progress.total * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted block mb-1">Test Cases</label>
          <select value={source} onChange={e => setSource(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="auto">Database (auto)</option>
            <option value="db">Database only</option>
            <option value="csv_auto">CSV: Auto</option>
            <option value="csv_manual">CSV: Manual</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Difficulty</label>
          <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="">All</option>
            <option value="exact">Exact</option>
            <option value="paraphrase">Paraphrase</option>
            <option value="keywords">Keywords</option>
            <option value="followup">Follow-up</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Threshold</label>
          <input type="number" step="0.05" min="0" max="1" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))}
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Max Cases</label>
          <input type="number" min="1" value={maxCases} onChange={e => setMaxCases(e.target.value)} placeholder="all"
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">FAQ Boost</label>
          <input type="number" step="0.1" min="0" max="5" value={boostFactor} onChange={e => setBoostFactor(parseFloat(e.target.value))}
            className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <button onClick={runQualityEval} disabled={running}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            running ? 'bg-white/10 text-muted cursor-not-allowed' : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30'
          }`}>
          {running ? 'Running...' : 'Run Quality Eval'}
        </button>
      </div>

      {/* Progress */}
      {(running || summary) && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-white font-medium">{running ? 'Running...' : 'Complete'}</span>
              {!running && summary && evalResults.length > 0 && (
                <>
                  <button onClick={() => setReportOpen(true)}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-accent/20 text-blue-100 hover:bg-accent/30 border border-accent/40 transition-colors">
                    View Report
                  </button>
                  <button onClick={() => exportQualityHTML(evalResults, summary)}
                    className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                    Export HTML
                  </button>
                  <button onClick={() => exportQualityJSON(evalResults, summary)}
                    className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                    Export JSON
                  </button>
                </>
              )}
            </div>
            <span className="text-muted text-xs">{progress.index}/{progress.total}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          {liveStats.count > 0 && (
            <div className="flex gap-4 mt-2 text-xs text-muted">
              <span>Relevance: <span className="text-white">{liveStats.relevance.toFixed(1)}/10</span></span>
              <span>Faithfulness: <span className="text-white">{liveStats.faithfulness.toFixed(1)}/10</span></span>
              <span>Noise: <span className="text-white">{(liveStats.noise * 100).toFixed(1)}%</span></span>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <>
          <div className="grid grid-cols-5 gap-3">
            <MetricCard label="Relevance" value={`${summary.metrics.avg_relevance.toFixed(1)}/10`}
              colorClass={summary.metrics.avg_relevance >= 7 ? 'text-green-400' : summary.metrics.avg_relevance >= 4 ? 'text-yellow-400' : 'text-red-400'} />
            <MetricCard label="Faithfulness" value={`${summary.metrics.avg_faithfulness.toFixed(1)}/10`}
              colorClass={summary.metrics.avg_faithfulness >= 7 ? 'text-green-400' : summary.metrics.avg_faithfulness >= 4 ? 'text-yellow-400' : 'text-red-400'} />
            <MetricCard label="Completeness" value={`${(summary.metrics.avg_completeness_score * 100).toFixed(0)}%`}
              colorClass={summary.metrics.avg_completeness_score > 0.7 ? 'text-green-400' : summary.metrics.avg_completeness_score > 0.4 ? 'text-yellow-400' : 'text-red-400'} />
            <MetricCard label="Noise Ratio" value={`${(summary.metrics.avg_noise_ratio * 100).toFixed(1)}%`}
              colorClass={summary.metrics.avg_noise_ratio < 0.3 ? 'text-green-400' : summary.metrics.avg_noise_ratio < 0.5 ? 'text-yellow-400' : 'text-red-400'} />
            <MetricCard label="Utility" value={`${summary.metrics.avg_utility.toFixed(1)}/10`}
              colorClass={summary.metrics.avg_utility >= 7 ? 'text-green-400' : summary.metrics.avg_utility >= 4 ? 'text-yellow-400' : 'text-red-400'} />
          </div>

          {/* Difficulty breakdown */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-white font-medium text-sm mb-3">By Difficulty</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="text-left py-1">Difficulty</th>
                  <th className="text-center">Count</th>
                  <th className="text-center">Relevance</th>
                  <th className="text-center">Faithfulness</th>
                  <th className="text-center">Noise</th>
                  <th className="text-center">Utility</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.breakdowns.by_difficulty).map(([diff, info]) => (
                  <tr key={diff} className="border-t border-white/5">
                    <td className="py-1.5 text-gray-300 font-medium">{diff}</td>
                    <td className="text-center text-muted">{info.count}</td>
                    <td className={`text-center ${info.avg_relevance >= 7 ? 'text-green-400' : info.avg_relevance >= 4 ? 'text-yellow-400' : 'text-red-400'}`}>{info.avg_relevance.toFixed(1)}</td>
                    <td className={`text-center ${info.avg_faithfulness >= 7 ? 'text-green-400' : info.avg_faithfulness >= 4 ? 'text-yellow-400' : 'text-red-400'}`}>{info.avg_faithfulness.toFixed(1)}</td>
                    <td className={`text-center ${info.avg_noise_ratio < 0.3 ? 'text-green-400' : 'text-red-400'}`}>{(info.avg_noise_ratio * 100).toFixed(1)}%</td>
                    <td className={`text-center ${info.avg_utility >= 7 ? 'text-green-400' : 'text-yellow-400'}`}>{info.avg_utility.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Live log */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-white font-medium text-sm mb-2">Live Log</h3>
        <div ref={logRef} className="max-h-60 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5">
          {logLines.length === 0 && <span className="text-muted">Run a quality evaluation to see results...</span>}
          {logLines.map((l, i) => (
            <div key={i} className={l.color}>{l.text}</div>
          ))}
        </div>
      </div>

      {/* Report modal */}
      {summary && evalResults.length > 0 && (
        <QualityReportModal
          isOpen={reportOpen}
          onClose={() => setReportOpen(false)}
          results={evalResults}
        />
      )}
    </div>
  );
};

// ============================= QUALITY HISTORY =============================
const QualityHistoryTab = () => {
  const [runs, setRuns] = useState<QualityHistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ id: string; label: string; results: QualityEvalResult[]; summary: QualityEvalSummary | null } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/test-hub/api/quality-eval-history');
        setRuns(data.runs || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadDetail = async (run: QualityHistoryRun) => {
    try {
      const { data } = await api.get(`/test-hub/api/quality-eval-result/${run.id}`);
      const label = run.run_at ? new Date(run.run_at).toLocaleString() : run.id.slice(0, 8);
      setDetail({ id: run.id, label, results: data.results || [], summary: data.summary || null });
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  if (loading) return <div className="text-muted text-sm">Loading quality history...</div>;

  if (detail) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button onClick={() => { setDetail(null); setReportOpen(false); }} className="text-xs text-accent hover:underline">&larr; Back to list</button>
          {detail.summary && detail.results.length > 0 && (
            <>
              <button onClick={() => setReportOpen(true)}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-accent/20 text-blue-100 hover:bg-accent/30 border border-accent/40 transition-colors">
                View Report
              </button>
              <button onClick={() => exportQualityHTML(detail.results, detail.summary!, detail.id)}
                className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                Export HTML
              </button>
              <button onClick={() => exportQualityJSON(detail.results, detail.summary!, detail.id)}
                className="px-2 py-1 rounded-lg text-xs text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                Export JSON
              </button>
            </>
          )}
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-white font-medium text-sm mb-3">{detail.label} &mdash; {detail.results.length} cases</h3>
          <div className="max-h-96 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5">
            {detail.results.map(r => {
              const relIcon = (r.relevance_score || 0) >= 7 ? '\u2705' : (r.relevance_score || 0) >= 4 ? '\u26A0\uFE0F' : '\u274C';
              const color = (r.relevance_score || 0) >= 7 ? 'text-green-400' : (r.relevance_score || 0) >= 4 ? 'text-yellow-400' : 'text-red-400';
              return <div key={r.id} className={color}>{relIcon} [{r.id}] R:{r.relevance_score} F:{r.faithfulness_score} Q:{r.answer_quality} — {r.query} ({r.difficulty})</div>;
            })}
          </div>
        </div>
        {detail.summary && detail.results.length > 0 && (
          <QualityReportModal
            isOpen={reportOpen}
            onClose={() => setReportOpen(false)}
            results={detail.results}
          />
        )}
      </div>
    );
  }

  const relColor = (v: number) => v >= 7 ? 'text-green-400' : v >= 4 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-2">
      {runs.length === 0 && <div className="text-muted text-sm">No quality evaluation runs yet</div>}
      {runs.map(r => (
        <div key={r.id} onClick={() => loadDetail(r)}
          className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.07] cursor-pointer transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-200">{r.run_at ? new Date(r.run_at).toLocaleString() : r.id.slice(0, 8)}</span>
              <span className="text-xs text-muted ml-2">{r.total} cases</span>
            </div>
            <div className="flex gap-4 text-xs">
              <span>Relevance: <span className={`font-bold ${relColor(r.avg_relevance)}`}>{r.avg_relevance.toFixed(1)}</span></span>
              <span>Faithfulness: <span className={`font-bold ${relColor(r.avg_faithfulness)}`}>{r.avg_faithfulness.toFixed(1)}</span></span>
              <span>Noise: <span className={`font-bold ${r.avg_noise_ratio < 0.3 ? 'text-green-400' : 'text-red-400'}`}>{(r.avg_noise_ratio * 100).toFixed(1)}%</span></span>
              <span>Utility: <span className={`font-bold ${relColor(r.avg_utility)}`}>{r.avg_utility.toFixed(1)}</span></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================= CHUNK INSPECTOR =============================
const InspectorTab = () => {
  const [sourceType, setSourceType] = useState('all');
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [chunks, setChunks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadChunks = async (p: number = page) => {
    setLoading(true);
    try {
      const { data } = await api.get('/test-hub/api/sample-chunks', {
        params: { source_type: sourceType, limit, page: p },
      });
      setChunks(data.chunks || []);
      setTotalPages(data.total_pages || 1);
      setTotalCount(data.total_count || 0);
      setPage(data.page || p);
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    loadChunks(p);
  };

  // Build visible page numbers (max 5 around current)
  const pageNumbers = () => {
    const pages: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted block mb-1">Source Type</label>
          <select value={sourceType} onChange={e => { setSourceType(e.target.value); setPage(1); }}
            className="bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="all">All</option>
            <option value="document">Documents Only</option>
            <option value="faq">FAQ Only</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Per Page</label>
          <input type="number" min="1" max="50" value={limit} onChange={e => { setLimit(parseInt(e.target.value) || 10); setPage(1); }}
            className="w-14 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-white text-center text-xs" />
        </div>
        <button onClick={() => { setPage(1); loadChunks(1); }} disabled={loading}
          className="bg-accent/20 border border-accent/40 text-blue-100 px-4 py-1.5 rounded-lg hover:bg-accent/30 transition-colors text-sm font-medium disabled:opacity-50">
          {loading ? 'Loading...' : 'Load Chunks'}
        </button>
        {totalCount > 0 && (
          <span className="text-xs text-muted ml-auto">{totalCount} total chunks</span>
        )}
      </div>

      {/* Chunk list */}
      <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
        {chunks.length === 0 && !loading && <div className="text-muted text-sm text-center py-6">Click "Load Chunks" to inspect database contents</div>}
        {chunks.map(c => (
          <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={c.type === 'faq' ? 'green' : 'blue'}>{c.type}</Badge>
              {c.chunk_id != null && <span className="text-xs text-muted font-mono">#{c.chunk_id}</span>}
              {c.chunk_type && <Badge variant="yellow">{c.chunk_type}</Badge>}
              {c.source_file && <span className="text-xs text-muted">{c.source_file}</span>}
              {c.boost_factor != null && <span className="text-xs text-muted">boost: {c.boost_factor}</span>}
            </div>
            <div className="text-sm font-medium text-gray-200 mb-1">{c.title || 'No title'}</div>
            <div className="text-xs text-muted mb-2">{c.body_preview}</div>
            {c.summary && <div className="text-xs text-muted/70 italic">{c.summary}</div>}
            {c.category && <div className="text-xs text-muted/70 mt-1">Category: {c.category}</div>}
            {c.metadata && (
              <details className="mt-2">
                <summary className="text-xs text-muted cursor-pointer hover:text-white">Metadata</summary>
                <pre className="text-xs text-muted/60 mt-1 bg-black/20 p-2 rounded-lg overflow-x-auto">{JSON.stringify(c.metadata, null, 2)}</pre>
              </details>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-2">
          <button onClick={() => goToPage(page - 1)} disabled={page <= 1 || loading}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/5 text-muted hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            &laquo; Prev
          </button>
          {pageNumbers().map(p => (
            <button key={p} onClick={() => goToPage(p)} disabled={loading}
              className={`w-8 py-1 text-xs rounded-lg transition-colors ${
                p === page
                  ? 'bg-accent/20 text-blue-100 border border-accent/20'
                  : 'bg-white/5 text-muted hover:text-white hover:bg-white/10'
              }`}>
              {p}
            </button>
          ))}
          <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages || loading}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/5 text-muted hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            Next &raquo;
          </button>
        </div>
      )}
    </div>
  );
};
