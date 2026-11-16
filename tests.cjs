'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const L=require('./engine.js');const demo=L.demo();const baseline=L.parse(demo.training);const model=L.train(baseline);const results=L.score(model,L.parse(demo.candidate));
const byId=id=>results.find(s=>s.id===id);
const event=(session,event,timestamp='2026-11-01T10:00:00Z')=>JSON.stringify({session,event,timestamp});
test('demo generator deterministic',()=>assert.deepEqual(L.demo(),demo));
test('training and candidate populations are separate',()=>{assert.equal(baseline.length,48);assert.equal(results.length,6);const ids=new Set(baseline.map(s=>s.id));assert.ok(results.every(s=>!ids.has(s.id)));});
test('burst retries rank above held-out ordinary sessions',()=>assert.ok(byId('burst-retries').raw>byId('ordinary-morning').raw+3));
test('unseen export sequence ranks above held-out ordinary sessions',()=>assert.ok(byId('new-export-path').raw>byId('ordinary-retry').raw+1));
test('burst and export cross training-calibrated review line',()=>{assert.ok(byId('burst-retries').review);assert.ok(byId('new-export-path').review);});
test('ordinary candidates below review line',()=>{assert.equal(byId('ordinary-morning').review,false);assert.equal(byId('ordinary-retry').review,false);});
test('honest blind spot remains below line',()=>assert.equal(byId('known-blind-spot').review,false));
test('unusual UTC hour increases score but is not promised a flag',()=>assert.ok(byId('unusual-hour').raw>byId('ordinary-morning').raw));
test('unknown event labels reported',()=>assert.deepEqual(byId('new-export-path').unknown,['export']));
test('score decomposes into displayed component contributions',()=>{for(const s of results)assert.ok(Math.abs(s.raw-s.components.reduce((n,c)=>n+c.weighted,0))<1e-10);});
test('all scores and review line finite and nonnegative',()=>{assert.ok(Number.isFinite(model.reviewLine));for(const s of results)assert.ok(Number.isFinite(s.raw)&&s.raw>=0);});
test('candidate analysis does not retrain baseline',()=>{const before=JSON.stringify([...model.transitions].map(([k,v])=>[k,[...v]]));L.score(model,L.parse(demo.candidate));assert.equal(JSON.stringify([...model.transitions].map(([k,v])=>[k,[...v]])),before);});
test('event ordering matters with same event counts',()=>{const a=L.parse(['login','read','read','logout'].map((e,i)=>event('a',e,`2026-11-09T10:0${i}:00Z`)).join('\n'));const b=L.parse(['read','logout','login','read'].map((e,i)=>event('b',e,`2026-11-09T10:0${i}:00Z`)).join('\n'));assert.ok(L.score(model,b)[0].raw>L.score(model,a)[0].raw);});
test('input is timestamp sorted within session',()=>{const s=L.parse(event('a','logout','2026-11-01T10:01:00Z')+'\n'+event('a','login'));assert.deepEqual(s[0].events.map(x=>x.event),['login','logout']);});
test('timezone offsets normalized to UTC',()=>assert.equal(L.parse(event('s','x','2026-11-01T15:30:00+05:30'))[0].events[0].t,Date.parse('2026-11-01T10:00:00Z')));
test('blank lines tolerated',()=>assert.equal(L.parse('\n'+event('a','login')+'\n\n').length,1));
test('same-timestamp ordering is stable by input line',()=>assert.deepEqual(L.parse(event('a','b')+'\n'+event('a','a'))[0].events.map(e=>e.event),['b','a']));
test('single event candidate has no pace evidence',()=>{const s=L.score(model,L.parse(event('one','login')))[0];assert.equal(s.features.pace,null);assert.equal(s.components.find(c=>c.name==='pace').value,0);});
test('prototype-like session IDs safe in Map',()=>assert.equal(L.parse(event('__proto__','login'))[0].id,'__proto__'));
test('HTML-looking session ID remains text data',()=>assert.equal(L.parse(event('<img src=x>','login'))[0].id,'<img src=x>'));
for(const [name,input,pattern] of [
 ['empty','',/first/],['bad JSON','not json',/Line 1/],['bad second line',event('a','b')+'\n{',/Line 2/],
 ['array','[]',/JSON object/],['null','null',/JSON object/],['no session',JSON.stringify({event:'a',timestamp:'2026-11-01T10:00:00Z'}),/session/],
 ['no event',JSON.stringify({session:'a',timestamp:'2026-11-01T10:00:00Z'}),/event/],['whitespace session',event(' ','x'),/session/],
 ['overlong event',event('a','x'.repeat(81)),/event/],['no timezone',event('a','x','2026-11-01T10:00:00'),/timezone/],
 ['invalid date',event('a','x','2026-02-30T10:00:00Z'),/calendar/],['invalid hour',event('a','x','2026-11-01T25:00:00Z'),/calendar/],
 ['reserved UNKNOWN',event('a','<UNKNOWN>'),/reserved/],['reserved START',event('a','<START>'),/reserved/],['reserved END',event('a','<END>'),/reserved/],
 ['over size',' '.repeat(1500001)+'x',/million/],['over count',Array(5001).fill(event('a','login')).join('\n'),/5,000/]
])test('rejects '+name,()=>assert.throws(()=>L.parse(input),pattern));
test('insufficient baseline sessions refused',()=>assert.throws(()=>L.train(baseline.slice(0,4)),/5 sessions/));
test('insufficient baseline events refused',()=>assert.throws(()=>L.train(L.parse(Array.from({length:5},(_,i)=>event('s'+i,'login')).join('\n'))),/20 events/));
test('5000 events supported without truncation',()=>assert.equal(L.parse(Array(5000).fill(event('a','login')).join('\n'))[0].events.length,5000));
test('session limit enforced',()=>assert.throws(()=>L.parse(Array.from({length:1001},(_,i)=>event('s'+i,'login')).join('\n')),/1,000 sessions/));
test('identical observed benign and malicious intent indistinguishable',()=>{const s=L.parse(event('benign','login')+'\n'+event('malicious','login'));const r=L.score(model,s);assert.equal(r[0].raw,r[1].raw);});
test('comparison permutation leaves model ranking unchanged',()=>assert.deepEqual(L.score(model,[...L.parse(demo.candidate)].reverse()).map(s=>[s.id,s.raw]),results.map(s=>[s.id,s.raw])));
test('no network APIs or persistent storage in app/core',()=>{for(const name of ['engine.js','app.js']){const s=fs.readFileSync(__dirname+'/'+name,'utf8');assert.doesNotMatch(s,/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|indexedDB)\s*[.(]/);}});
test('HTML CSP denies connection egress and remote scripts',()=>{const s=fs.readFileSync(__dirname+'/index.html','utf8');assert.match(s,/connect-src 'none'/);assert.match(s,/script-src 'self'/);assert.doesNotMatch(s,/<script[^>]+src="https?:/);});

test('repeated transitions aggregated for readable evidence',()=>{const s=byId('burst-retries');assert.equal(s.rare[0].occurrences,17);assert.equal(new Set(s.rare.map(t=>JSON.stringify([t.from,t.to]))).size,s.rare.length);});

test('learning a different event order changes novelty ranking',()=>{
 const altered=baseline.map(s=>({...s,events:s.events.map((e,i)=>({...e,event:s.events[s.events.length-1-i].event}))}));
 const other=L.train(altered);
 const normal=L.parse(['login','read','read','logout'].map((e,i)=>event('n',e,`2026-11-09T10:0${i}:00Z`)).join('\n'));
 const reversed=L.parse(['logout','read','read','login'].map((e,i)=>event('r',e,`2026-11-09T10:0${i}:00Z`)).join('\n'));
 assert.ok(L.score(model,normal)[0].raw<L.score(model,reversed)[0].raw);
 assert.ok(L.score(other,normal)[0].raw>L.score(other,reversed)[0].raw);
});
