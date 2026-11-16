'use strict';
const $=id=>document.getElementById(id);
let output=null;
const showError=message=>{$('error').textContent=message;$('error').hidden=false;};
const reset=()=>{$('results').hidden=true;$('cards').replaceChildren();$('summary').textContent='';$('error').hidden=true;$('error').textContent='';output=null;};
for(const field of ['baseline','candidate']) {
  $(field).addEventListener('input',()=>{reset();$('state').textContent='Inputs changed. Learn and compare again.';});
  $(field+'-file').addEventListener('change',async event=>{
    reset();const file=event.target.files[0];if(!file)return;
    try {
      if(file.size>1500000)throw Error('File exceeds 1.5 MB. Use a smaller window.');
      $(field).value=await file.text();$('state').textContent='File read locally. Ready to compare.';
    } catch(e) {showError(e.message);} finally {event.target.value='';}
  });
}
$('demo').addEventListener('click',()=>{
  reset();const data=LogLens.demo();$('baseline').value=data.training;$('candidate').value=data.candidate;
  $('state').textContent='Synthetic demo: 48 baseline sessions, 6 candidates, including a known blind spot.';
});
$('clear').addEventListener('click',()=>{reset();$('baseline').value='';$('candidate').value='';$('state').textContent='Cleared. Nothing is saved by this app.';});
function element(tag,text,cls) {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
$('analyze').addEventListener('click',()=>{
  reset();
  try {
    let baseline,candidate;
    try{baseline=LogLens.parse($('baseline').value);}catch(e){throw Error('Baseline: '+e.message);}
    try{candidate=LogLens.parse($('candidate').value);}catch(e){throw Error('Candidates: '+e.message);}
    // A reused ID may be valid across disjoint windows, but exact duplicate data is leakage.
    if($('baseline').value.trim()===$('candidate').value.trim())throw Error('Baseline and candidates are identical. Use a separate candidate window.');
    const model=LogLens.train(baseline);const scores=LogLens.score(model,candidate);
    const baselineIds=new Set(baseline.map(s=>s.id));
    const overlap=candidate.some(s=>baselineIds.has(s.id));
    output={version:1,generatedAt:new Date().toISOString(),baselineSessions:baseline.length,reviewLine:model.reviewLine,limitations:'Training-calibrated novelty triage, not attack probability. Synthetic validation only. Export includes session IDs.',scores:scores.map(({features,...s})=>s)};
    $('summary').textContent=`${baseline.length} baseline sessions learned / ${scores.length} candidates / ${scores.filter(s=>s.review).length} above review line ${model.reviewLine.toFixed(2)}.`+(overlap?' Session IDs overlap across inputs: verify the windows are disjoint.':'');
    $('cards').replaceChildren();
    for(const s of scores) {
      const card=element('article',undefined,'session'+(s.review?' review':''));
      const head=element('div',undefined,'sessionhead');head.append(element('h3',s.id),element('span',s.review?'REVIEW NOVELTY':'BELOW REVIEW LINE','status'));card.append(head);
      const number=element('div',s.raw.toFixed(2)+' ','score');number.append(element('small','raw deviation score / not a risk percent'));card.append(number);
      card.append(element('p',`${s.eventCount} events / starts ${s.start}`,'muted'));
      const chips=element('div',undefined,'signals');s.components.forEach(c=>chips.append(element('span',`${c.name}: ${c.weighted.toFixed(2)} contribution`)));card.append(chips);
      const list=element('ul');
      for(const t of s.rare)list.append(element('li',`${t.from} → ${t.to}: seen ${t.count} times in baseline; ${t.bits.toFixed(2)} bits surprise; occurs ${t.occurrences} time(s) here.`));
      if(s.unknown.length)list.append(element('li','Unseen event labels: '+s.unknown.join(', ')+'. May be a schema change or new legitimate workflow.'));
      if(s.eventCount===1)list.append(element('li','One event only: no inter-event pace evidence.'));
      card.append(list);$('cards').append(card);
    }
    $('results').hidden=false;$('state').textContent='Comparison complete. Inputs stayed in this tab.';$('results').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(e) {showError(e.message);$('state').textContent='Comparison stopped. Fix the input error and retry.';}
});
$('download').addEventListener('click',()=>{
  if(!output)return;const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='log-lens-scores.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
