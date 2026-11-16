/* Plain-language explanations use observed events and learned features, never inferred intent. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LensExplain=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function describe(model,session,result){
    const sentences=[];
    const typical=Math.expm1(model.stats.volume.mean);
    const failures=session.events.filter(e=>e.event==='login_failed').length;
    if(failures>0)sentences.push(`${failures} recorded sign-in failure${failures===1?'':'s'} in this visit.`);
    if(result.components.find(c=>c.name==='volume').value>1)sentences.push(`${result.eventCount} events, ${result.eventCount>typical?'more':'fewer'} than the normal examples (typically about ${Math.round(typical)}).`);
    if(result.components.find(c=>c.name==='pace').value>1&&result.features.pace!==null)sentences.push(`Events happened ${result.features.pace<model.stats.pace.mean?'closer together':'further apart'} than in the normal examples.`);
    if(result.unknown.length)sentences.push(`New event names were not in the normal examples: ${result.unknown.join(', ')}. A new feature or naming change could explain this.`);
    else if(result.components.find(c=>c.name==='sequence').value>1)sentences.push('The order of events was less familiar than in the normal examples.');
    if(result.components.find(c=>c.name==='hour').value>1)sentences.push(`This visit started at ${new Date(session.events[0].t).getUTCHours().toString().padStart(2,'0')}:00 UTC, an uncommon start hour in the examples.`);
    if(!sentences.length)sentences.push('These events look broadly similar to the normal examples. That does not prove the visit was safe.');
    return {title:result.review?'Worth a closer look':'Not above the review line',summary:sentences.join(' '),next:result.review?'Check whether this activity was expected. A new legitimate workflow, changed event names or a different schedule can look unusual. This result alone does not establish an attack.':'Do not treat this as a safety pass. Normal-looking misuse and patient attacks can be missed. Use other context if you have a concern.'};
  }
  return {describe};
});
