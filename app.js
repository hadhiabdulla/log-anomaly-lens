'use strict';
const $=id=>document.getElementById(id);
let output=null;
let mode='beginner';
const added=[];
function updateCounts(){
  const count=id=>$(id).value.split(/\r?\n/).filter(x=>x.trim()).length;
  $('data-counts').textContent=`Normal examples: ${count('baseline')} events / New visits: ${count('candidate')} events`;
}
function setMode(value){
 mode=value;document.body.className=value;
 $('beginner-mode').setAttribute('aria-pressed',String(value==='beginner'));
 $('advanced-mode').setAttribute('aria-pressed',String(value==='advanced'));
 $('mode-help').textContent=value==='beginner'?'Start with a ready-made example. No log files or coding needed.':'Direct JSONL and file inputs, model scores and contribution details. The same model powers both views.';
 $('demo').textContent=value==='beginner'?'1. Load practice example':'Load synthetic demo';
 $('analyze').textContent=value==='beginner'?'2. Compare visits':'Learn baseline & compare';
 document.querySelectorAll('.technical').forEach(d=>d.open=value==='advanced');
 document.querySelectorAll('.session').forEach(card=>{const review=card.classList.contains('review');card.querySelector('.status').textContent=value==='beginner'?(review?'WORTH A CLOSER LOOK':'NOT ABOVE REVIEW LINE'):(review?'REVIEW NOVELTY':'BELOW REVIEW LINE');});
 if(output)updateSummary();
}
$('beginner-mode').addEventListener('click',()=>setMode('beginner'));
$('advanced-mode').addEventListener('click',()=>setMode('advanced'));
$('event-kind').addEventListener('change',()=>{$('custom-wrap').hidden=$('event-kind').value!=='custom';$('event-custom').required=$('event-kind').value==='custom';});
$('event-form').addEventListener('submit',e=>{
 e.preventDefault();reset();
 try{
  const target=$('event-target').value;
  const kind=$('event-kind').value==='custom'?$('event-custom').value.trim():$('event-kind').value;
  const row={timestamp:($('event-time').value.length===16?$('event-time').value+':00':$('event-time').value)+'Z',session:$('event-session').value.trim(),event:kind};
  const line=JSON.stringify(row);LogLens.parse(line);
  added.push({target,previous:$(target).value});
  $(target).value=($(target).value.trim()?$(target).value.trim()+'\n':'')+line;
  updateCounts();$('builder-status').textContent=`Added ${kind} to ${row.session} in ${target==='baseline'?'normal examples':'new visits'}. Add the next event or compare when ready.`;
  $('state').textContent='Events changed. Compare again when your examples are ready.';
 }catch(err){showError(err.message);$('builder-status').textContent='Event was not added: '+err.message;}
});
$('undo-event').addEventListener('click',()=>{const last=added.pop();if(!last){$('builder-status').textContent='No manually added event to undo.';return;}$(last.target).value=last.previous;reset();updateCounts();$('builder-status').textContent='Last manually added event removed.';});
const showError=message=>{$('error').textContent=message;$('error').hidden=false;};
const reset=()=>{$('results').hidden=true;$('cards').replaceChildren();$('summary').textContent='';$('error').hidden=true;$('error').textContent='';output=null;};
for(const field of ['baseline','candidate']) {
  $(field).addEventListener('input',()=>{reset();added.length=0;updateCounts();$('state').textContent='Inputs changed. Learn and compare again.';});
  $(field+'-file').addEventListener('change',async event=>{
    reset();const file=event.target.files[0];if(!file)return;
    try {
      if(file.size>1500000)throw Error('File exceeds 1.5 MB. Use a smaller window.');
      $(field).value=await file.text();added.length=0;updateCounts();$('state').textContent='File read locally. Ready to compare.';
    } catch(e) {showError(e.message);} finally {event.target.value='';}
  });
}
$('demo').addEventListener('click',()=>{
  reset();const data=LogLens.demo();$('baseline').value=data.training;$('candidate').value=data.candidate;added.length=0;updateCounts();
  $('state').textContent='Synthetic demo: 48 baseline sessions, 6 candidates, including a known blind spot.';
});
$('clear').addEventListener('click',()=>{reset();$('baseline').value='';$('candidate').value='';added.length=0;updateCounts();$('builder-status').textContent='No events added yet.';$('state').textContent='Cleared. Nothing is saved by this app.';});
function updateSummary(){
 const n=output.scores.filter(s=>s.review).length;
 $('summary').textContent=mode==='beginner'?`${output.baselineSessions} normal example visits compared with ${output.scores.length} new visits. ${n} worth a closer look. This does not tell us whether an attack happened.`:`${output.baselineSessions} baseline sessions learned / ${output.scores.length} candidates / ${n} above review line ${output.reviewLine.toFixed(2)}.`;
 if(output.overlap)$('summary').textContent+=' Visit IDs appear in both inputs: check that the time periods are separate.';
}
function element(tag,text,cls) {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
$('analyze').addEventListener('click',()=>{
  reset();
  try {
    let baseline,candidate;
    try{baseline=LogLens.parse($('baseline').value);}catch(e){throw Error('Baseline: '+e.message);}
    try{candidate=LogLens.parse($('candidate').value);}catch(e){throw Error('Candidates: '+e.message);}
    // A reused ID may be valid across disjoint windows, but exact duplicate data is leakage.
    if($('baseline').value.trim()===$('candidate').value.trim())throw Error('Baseline and candidates are identical. Use a separate candidate window.');
    const model=LogLens.train(baseline);const scores=LogLens.score(model,candidate);const sessionsById=new Map(candidate.map(s=>[s.id,s]));
    const baselineIds=new Set(baseline.map(s=>s.id));
    const overlap=candidate.some(s=>baselineIds.has(s.id));
    output={version:1,generatedAt:new Date().toISOString(),baselineSessions:baseline.length,reviewLine:model.reviewLine,limitations:'Training-calibrated novelty triage, not attack probability. Synthetic validation only. Export includes session IDs.',scores:scores.map(({features,...s})=>s)};
    output.overlap=overlap;updateSummary();
    $('cards').replaceChildren();
    for(const s of scores) {
      const card=element('article',undefined,'session'+(s.review?' review':''));
      const head=element('div',undefined,'sessionhead');head.append(element('h3',s.id),element('span',mode==='beginner'?(s.review?'WORTH A CLOSER LOOK':'NOT ABOVE REVIEW LINE'):(s.review?'REVIEW NOVELTY':'BELOW REVIEW LINE'),'status'));card.append(head);
      const words=LensExplain.describe(model,sessionsById.get(s.id),s);
      card.append(element('p',words.summary,'plain-summary'),element('p',words.next,'next-check'));
      const technical=element('details',undefined,'technical');technical.open=mode==='advanced';technical.append(element('summary','Show model score & technical evidence'));
      const number=element('div',s.raw.toFixed(2)+' ','score');number.append(element('small','raw deviation score / not a risk percent'));technical.append(number);
      technical.append(element('p',`${s.eventCount} events / starts ${s.start}`,'muted'));
      const chips=element('div',undefined,'signals');s.components.forEach(c=>chips.append(element('span',`${c.name}: ${c.weighted.toFixed(2)} contribution`)));technical.append(chips);
      const list=element('ul');
      for(const t of s.rare)list.append(element('li',`${t.from} → ${t.to}: seen ${t.count} times in baseline; ${t.bits.toFixed(2)} bits surprise; occurs ${t.occurrences} time(s) here.`));
      if(s.unknown.length)list.append(element('li','Unseen event labels: '+s.unknown.join(', ')+'. May be a schema change or new legitimate workflow.'));
      if(s.eventCount===1)list.append(element('li','One event only: no inter-event pace evidence.'));
      technical.append(list);card.append(technical);$('cards').append(card);
    }
    $('results').hidden=false;$('state').textContent='Comparison complete. Inputs stayed in this tab.';$('results').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(e) {showError(mode==='beginner'?e.message.replace('Baseline needs at least 5 sessions. Use 30 or more representative normal sessions when possible.','Add at least 5 separate normal visits first (different visit IDs). Use 30 or more representative normal visits when possible.').replace('Baseline needs at least 20 events.','Your normal examples need at least 20 events in total.'):e.message);$('state').textContent='Comparison stopped. Fix the input error and retry.';}
});
$('download').addEventListener('click',()=>{
  if(!output)return;const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='log-lens-scores.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
