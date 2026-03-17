import type { EvalResult, EvalSummary, QualityEvalResult, QualityEvalSummary } from '../types';
import { downloadBlob, fileTs } from './export';
import { buildZip } from './zip';

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

// --- Retrieval eval HTML viewer ---
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

// --- Quality eval HTML viewer ---
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
export const exportRetrievalHTML = (results: EvalResult[], summary: EvalSummary, runId?: string) => {
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

export const exportQualityHTML = (results: QualityEvalResult[], summary: QualityEvalSummary, runId?: string) => {
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
