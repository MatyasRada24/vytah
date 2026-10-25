'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),E=require('./simulation.js');
const source=require('./scenario.json'),original=require('./reference/original-run.cjs');
const scenario=people=>({...structuredClone(source),people});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function parity(s){
 const expected=original(s),actual=E.simulate(s,'fifo'),m=E.snapshot(actual,actual.end);
 assert.ok(expected.ok);assert.equal(actual.finished,expected.finished);assert.equal(actual.end,expected.endTime);
 assert.deepEqual(actual.people,expected.persons.map(p=>({id:p.id,t:p.t,from:p.from,to:p.to,slow:p.slow,board:p.tBoard,done:p.tExit})));
 for(const key of ['avgWait','avgRide','avgTotal','maxWait','maxTotal']){
  if(expected.metrics[key]===null)assert.equal(m[key],null);else if(m[key]!==null)close(m[key],expected.metrics[key]);
 }
 assert.equal(m.stops,expected.metrics.stops);close(m.distance,expected.metrics.dist);
 assert.equal(m.servedInHorizon,expected.metrics.servedInHorizon);
 assert.equal(m.completedAt,expected.metrics.tAll);
 return m;
}
test('all school passenger times and all requested metrics match original HTML exactly',()=>{
 const m=parity(source);
 assert.equal(m.served.length,400);close(m.completedAt,3879.05);close(m.avgWait,313.66675);
 close(m.avgRide,22.429);close(m.avgTotal,336.09575);close(m.maxWait,1438.65);close(m.maxTotal,1457.05);
 assert.equal(m.stops,309);close(m.distance,2922);assert.equal(m.servedInHorizon,42);
});
test('FIFO boards no intermediate passengers while an earlier batch remains onboard',()=>{
 const s=scenario([{id:1,t:0,from:0,to:2},{id:2,t:0,from:0,to:4},{id:3,t:1,from:2,to:3}]);
 const r=E.simulate(s,'fifo');parity(s);assert.ok(r.people[2].board>r.people[1].done);
});
test('reference parity for slow transfers, arrivals during stops and different hardware',()=>{
 const s=scenario([{id:1,t:0,from:3,to:0,slow:2.25},{id:2,t:1.53,from:3,to:5},{id:3,t:2.01,from:3,to:1},{id:4,t:10,from:0,to:4}]);
 s.lift={...s.lift,startFloor:3,capacity:2,speed:1.3,acceleration:.7,doorOpen:.73,doorClose:1.13};
 s.boarding={in:.83,out:1.17};parity(s);
});
test('same physics and boarding timing for every policy on an unambiguous single trip',()=>{
 const s=scenario([{id:1,t:0,from:0,to:1,slow:2}]),baseline=E.simulate(s,'fifo');
 for(const kind of ['look','smart','eco']){
  const run=E.simulate(s,kind);assert.deepEqual(run.people,baseline.people);assert.deepEqual(run.trace,baseline.trace);
 }
 parity(s);
});
test('deterministic school service, capacity, monotonic energy and conservation of persons',()=>{
 for(const kind of ['fifo','look','smart','eco']){
  const run=E.simulate(source,kind),repeat=E.simulate(source,kind);
  assert.deepEqual(run,repeat);assert.ok(run.finished);
  for(const p of run.people)assert.ok(p.board>=p.t&&p.done>p.board);
  for(const segment of run.segments){assert.ok(segment.load<=6);assert.ok(segment.end>segment.start);}
  let energy=0;
  for(let t=0;t<=run.end;t+=7.3){
   const m=E.snapshot(run,t);assert.equal(m.waiting.length+m.cabin.length+m.served.length,m.arrived.length);
   assert.ok(m.cabin.length<=6);assert.ok(m.energy>=energy);energy=m.energy;
   assert.ok(m.floor>=0&&m.floor<8);assert.ok(m.distance+1e-8>=m.emptyDistance);
  }
 }
});
test('smart policies only observe arrived calls, direction and onboard destinations',()=>{
 for(const kind of ['look','smart','eco']){
  const a=scenario([{id:1,t:0,from:2,to:5},{id:2,t:1,from:4,to:7},{id:3,t:500,from:0,to:4}]);
  const b=structuredClone(a);b.people[0].to=6;b.people[1].to=6;b.people[2]={id:3,t:600,from:7,to:1};
  const x=E.simulate(a,kind),y=E.simulate(b,kind);
  assert.deepEqual(x.segments.filter(s=>s.end<x.people[0].board),y.segments.filter(s=>s.end<y.people[0].board));
  const c=structuredClone(a);c.people[2]=b.people[2];
  const z=E.simulate(c,kind);
  for(const key of Object.keys(x.trace))assert.deepEqual(x.trace[key].slice(0,10000),z.trace[key].slice(0,10000));
 }
});
test('LOOK+ and ECO can reuse open doors at a turnaround',()=>{
 const s=scenario([{id:1,t:0,from:0,to:2},{id:2,t:1,from:2,to:0}]);
 for(const kind of ['smart','eco']){
  const r=E.simulate(s,kind),old=E.simulate(s,'look');
  close(r.people[1].board-r.people[0].done,s.boarding.in);assert.ok(r.stops<old.stops);
 }
});
test('waiting metrics include onboard people, journey metrics only delivered people',()=>{
 const run=E.simulate(scenario([{id:1,t:0,from:0,to:7}]),'fifo'),p=run.people[0];
 const before=E.snapshot(run,p.board-.001),during=E.snapshot(run,p.board),after=E.snapshot(run,p.done);
 assert.equal(before.avgWait,null);assert.equal(before.completedAt,null);
 close(during.avgWait,p.board-p.t);close(during.maxWait,p.board-p.t);
 assert.equal(during.avgRide,null);assert.equal(during.avgTotal,null);assert.equal(during.maxTotal,null);assert.equal(during.completedAt,null);
 close(after.avgRide,p.done-p.board);close(after.avgTotal,p.done-p.t);assert.equal(after.completedAt,p.done);
});
test('served-in-horizon counts exits inclusively, never future exits during replay',()=>{
 const s=scenario([{id:1,t:0,from:0,to:1},{id:2,t:100,from:0,to:7}]);
 const first=E.simulate(s,'fifo').people[0].done;s.evaluation.horizon=first;
 const run=E.simulate(s,'fifo');
 assert.equal(E.snapshot(run,first-.001).servedInHorizon,0);assert.equal(E.snapshot(run,first).servedInHorizon,1);
 assert.equal(E.snapshot(run,run.end).servedInHorizon,1);
 const r=E.compare(source,'horizon');assert.equal(r.scenario.people.length,113);assert.ok(r.scenario.people.every(p=>p.t<=600));
});
test('maxTime stops during movement or transfer, with no fabricated completion',()=>{
 for(const limit of [1,4,7,12]){
  const s=scenario([{id:1,t:0,from:0,to:7},{id:2,t:0,from:0,to:6}]);s.evaluation={horizon:1,maxTime:limit};parity(s);
  for(const kind of ['fifo','eco']){
   const r=E.simulate(s,kind),m=E.snapshot(r,r.end);
   assert.equal(r.end,limit);assert.equal(r.finished,false);assert.equal(m.completedAt,null);
   assert.ok(r.people.every(p=>p.done===null||p.done<=limit));assert.ok(r.people.every(p=>p.board===null||p.board<=limit));
  }
 }
});
test('empty data and invalid input',()=>{
 for(const kind of ['fifo','look','smart','eco']){
  const run=E.simulate(scenario([]),kind),m=E.snapshot(run,0);
  assert.ok(run.finished);assert.equal(m.completedAt,0);assert.equal(m.avgRide,null);assert.equal(m.servedInHorizon,0);
 }
 assert.throws(()=>E.validate(scenario([{id:1,t:0,from:0,to:0}])));
 assert.throws(()=>E.validate(scenario([{id:1,t:-1,from:0,to:1}])));
 assert.throws(()=>E.validate(scenario([{id:1,t:0,from:0,to:1},{id:1,t:2,from:0,to:2}])));
 assert.throws(()=>E.compare(source,'all','unknown'));assert.equal(E.metrics(E.compare(scenario([])),0).totalPct,null);
});
test('common standby interval and negative comparisons are retained',()=>{
 const r=E.compare(source,'all','eco'),run=r.smart;
 close(E.snapshot(run,run.end+60).energy-E.snapshot(run,run.end).energy,E.ENERGY.standbyW*60/3600000);
 const m=E.metrics(r,r.duration),swapped=E.metrics({...r,dumb:r.smart,smart:r.dumb},r.duration);
 assert.equal(m.matched,400);assert.ok(m.totalPct>0&&m.energyPct>0);assert.ok(swapped.totalPct<0&&swapped.energyPct<0);
});
