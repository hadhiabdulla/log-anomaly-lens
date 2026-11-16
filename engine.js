/* Log Anomaly Lens: learned session sequence triage, no network dependencies. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LogLens = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const LIMIT = 5000;
  const mean = xs => xs.reduce((a,b) => a+b,0)/Math.max(1,xs.length);
  const sd = xs => Math.sqrt(mean(xs.map(x => (x-mean(xs))**2)));
  const quantile = (xs,q) => [...xs].sort((a,b)=>a-b)[Math.floor((xs.length-1)*q)];
  function parse(text) {
    if (typeof text !== 'string' || !text.trim()) throw Error('Add JSONL log events first.');
    if (text.length > 1500000) throw Error('Input exceeds 1.5 million characters. Use a smaller window.');
    const lines = text.split(/\r?\n/);
    const rows=[];
    for (let i=0;i<lines.length;i++) {
      if (!lines[i].trim()) continue;
      if (rows.length >= LIMIT) throw Error('Use at most 5,000 events per input.');
      let x;
      try { x=JSON.parse(lines[i]); } catch (_) { throw Error(`Line ${i+1}: invalid JSON.`); }
      if (!x || Array.isArray(x) || typeof x !== 'object') throw Error(`Line ${i+1}: expected a JSON object.`);
      for (const k of ['session','event']) {
        if (typeof x[k] !== 'string' || !x[k].trim() || x[k].length>80) throw Error(`Line ${i+1}: ${k} must be a nonempty string, at most 80 characters.`);
      }
      if (['<START>','<END>','<UNKNOWN>'].includes(x.event)) throw Error(`Line ${i+1}: event name is reserved.`);
      if (typeof x.timestamp !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(x.timestamp)) throw Error(`Line ${i+1}: timestamp must be ISO 8601 with seconds and a timezone (Z or offset).`);
      const t=Date.parse(x.timestamp);
      const parts=x.timestamp.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)/).slice(1).map(Number);
      const [y,m,d,h,mi,s]=parts;
      if (!Number.isFinite(t) || m<1 || m>12 || d<1 || d>new Date(Date.UTC(y,m,0)).getUTCDate() || h>23 || mi>59 || s>59) throw Error(`Line ${i+1}: invalid calendar timestamp.`);
      rows.push({session:x.session,event:x.event,t,line:i+1});
    }
    if (!rows.length) throw Error('Add at least one event.');
    const groups=new Map();
    for(const r of rows) {
      if(!groups.has(r.session)) groups.set(r.session,[]);
      groups.get(r.session).push(r);
    }
    if(groups.size>1000) throw Error('Use at most 1,000 sessions per input.');
    return [...groups].map(([id,events])=>({id,events:events.sort((a,b)=>a.t-b.t||a.line-b.line)}));
  }
  function features(model,session) {
    const es=session.events;
    const path=['<START>',...es.map(e=>e.event),'<END>'];
    const transitions=[];
    for(let i=1;i<path.length;i++) {
      const counts=model.transitions.get(path[i-1]);
      const count=counts?.get(path[i])||0;
      const total=model.totals.get(path[i-1])||0;
      const p=(count+0.25)/(total+0.25*(model.vocabulary.size+2));
      transitions.push({from:path[i-1],to:path[i],count,bits:-Math.log2(p)});
    }
    const gaps=es.slice(1).map((e,i)=>Math.max(0,(e.t-es[i].t)/1000));
    return {
      sequence:mean(transitions.map(x=>x.bits)),
      volume:Math.log1p(es.length),
      pace:gaps.length?mean(gaps.map(x=>Math.log1p(x))):null,
      hour:-Math.log2(((model.hours[new Date(es[0].t).getUTCHours()]||0)+0.25)/(model.sessionCount+24*0.25)),
      transitions,
      unknown:[...new Set(es.filter(e=>!model.vocabulary.has(e.event)).map(e=>e.event))]
    };
  }
  function distance(f,stats) {
    return {
      sequence:Math.max(0,(f.sequence-stats.sequence.mean)/stats.sequence.sd),
      volume:Math.abs((f.volume-stats.volume.mean)/stats.volume.sd),
      pace:f.pace===null?0:Math.abs((f.pace-stats.pace.mean)/stats.pace.sd),
      hour:Math.max(0,(f.hour-stats.hour.mean)/stats.hour.sd)
    };
  }
  function combine(d) { return 0.5*d.sequence+0.2*d.volume+0.2*d.pace+0.1*d.hour; }
  function train(sessions) {
    if(sessions.length<5) throw Error('Baseline needs at least 5 sessions. Use 30 or more representative normal sessions when possible.');
    if(sessions.reduce((n,s)=>n+s.events.length,0)<20) throw Error('Baseline needs at least 20 events.');
    for(const s of sessions) if(s.events.some(e=>e.event==='<START>'||e.event==='<END>')) throw Error('Event names <START> and <END> are reserved.');
    const model={transitions:new Map(),totals:new Map(),vocabulary:new Set(),hours:Array(24).fill(0),sessionCount:sessions.length};
    for(const s of sessions) {
      const path=['<START>',...s.events.map(e=>e.event),'<END>'];
      s.events.forEach(e=>model.vocabulary.add(e.event));
      model.hours[new Date(s.events[0].t).getUTCHours()]++;
      for(let i=1;i<path.length;i++) {
        if(!model.transitions.has(path[i-1])) model.transitions.set(path[i-1],new Map());
        const c=model.transitions.get(path[i-1]); c.set(path[i],(c.get(path[i])||0)+1);
        model.totals.set(path[i-1],(model.totals.get(path[i-1])||0)+1);
      }
    }
    const fs=sessions.map(s=>features(model,s));
    const floors={sequence:0.3,volume:0.25,pace:0.5,hour:0.5};
    model.stats={};
    for(const k of Object.keys(floors)) {
      const xs=fs.map(f=>f[k]).filter(x=>x!==null);
      model.stats[k]={mean:mean(xs),sd:Math.max(floors[k],sd(xs))};
    }
    // Training-calibrated review line, not an independent validation estimate.
    model.reviewLine=Math.max(1,quantile(fs.map(f=>combine(distance(f,model.stats))),0.95)+0.75);
    return model;
  }
  function score(model,sessions) {
    return sessions.map(s=>{
      const f=features(model,s), d=distance(f,model.stats), raw=combine(d);
      const components=Object.entries(d).map(([name,value])=>({name,value,weighted:value*({sequence:0.5,volume:0.2,pace:0.2,hour:0.1}[name])})).sort((a,b)=>b.weighted-a.weighted);
      const rare=[...f.transitions].sort((a,b)=>b.bits-a.bits).slice(0,3);
      return {id:s.id,raw,review:raw>=model.reviewLine,eventCount:s.events.length,start:new Date(s.events[0].t).toISOString(),components,rare,unknown:f.unknown,features:f};
    }).sort((a,b)=>b.raw-a.raw||a.id.localeCompare(b.id));
  }
  function demo() {
    let seed=20261116;
    const rand=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
    function make(id,path,base,gap=30) {
      let t=base;
      return path.map((event,i)=>{
        if(i)t+=gap*(0.8+rand()*0.4)*1000;
        return JSON.stringify({timestamp:new Date(t).toISOString(),session:id,event});
      }).join('\n');
    }
    const normal=['login','read','read','logout'];
    const retry=['login_failed','login','read','logout'];
    const training=Array.from({length:48},(_,i)=>make(`baseline-${i+1}`,i%6===0?retry:normal,Date.UTC(2026,10,1+Math.floor(i/8),9+i%8),25+i%12)).join('\n');
    const candidate=[
      make('ordinary-morning',normal,Date.UTC(2026,10,9,10),31),
      make('ordinary-retry',retry,Date.UTC(2026,10,9,11),30),
      make('burst-retries',[...Array(18).fill('login_failed'),'login','read','logout'],Date.UTC(2026,10,9,12),0.6),
      make('new-export-path',['login','export','export','logout'],Date.UTC(2026,10,9,13),30),
      make('unusual-hour',normal,Date.UTC(2026,10,9,3),30),
      make('known-blind-spot',retry,Date.UTC(2026,10,9,14),30)
    ].join('\n');
    return {training,candidate};
  }
  return {parse,train,score,demo,features};
});
