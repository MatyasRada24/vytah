const fs=require('fs'),vm=require('vm'),baseline=fs.readFileSync('experiments/simulation-v2.cjs','utf8'),s=require('../scenario.json');
let rngState=1917;const rnd=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};
const pick=a=>a[Math.floor(rnd()*a.length)],results=[];
function source(p){return baseline.replace('t-oldest.t<600',`t-oldest.t<${p.urgent}`).replace('t-waiting[0].t<360',`t-waiting[0].t<${p.turn}`).replace('(1+(t-p.t)/120)**2',`(1+(t-p.t)/${p.age})**${p.exponent}`).replace('const score=(travel+l.doorOpen+l.doorClose+estimatedSweep)/pressure;',`const emptyMotion=motion(Math.abs(c.from-floor)*l.floorHeight,l.speed,l.acceleration);
const emptyForce=Math.max(0,-l.capacity*e.personKg/2*9.81*Math.sign(c.from-floor)+e.frictionN);
const repositionWh=(emptyForce*emptyMotion.distance+.5*(2*e.cabinKg+l.capacity*e.personKg/2)*emptyMotion.peak**2)/e.efficiency/3600;
const score=(travel+l.doorOpen+l.doorClose+${p.sweep}*estimatedSweep+${p.energy}*repositionWh)/pressure;`);}
for(let i=0;i<240;i++){
const p={urgent:pick([240,360,480,600,900]),turn:pick([120,180,240,300,360,480,600]),age:pick([30,60,120,240]),exponent:pick([1,1.5,2,3]),sweep:pick([0,.5,1,2]),energy:pick([0,1,3,6])};
const code=source(p),ctx={};vm.runInNewContext(code,ctx);const r=ctx.ElevatorLab.compare(s),m=ctx.ElevatorLab.metrics(r,r.duration);const v={total:m.smart.avgTotal,wait:m.smart.avgWait,energy:m.smart.energy,max:m.smart.maxWait};
results.push({p,...v,score:v.total/218.4539+v.energy/1.29491});
}
const winners=results.filter(v=>v.total<218.4539&&v.energy<1.29491&&v.max<=669.34).sort((a,b)=>a.score-b.score);
console.log('joint winners',winners.length);console.log(JSON.stringify(winners.slice(0,6),null,2));
fs.writeFileSync('experiments/energy-search-results.json',JSON.stringify(results,null,2));
if(winners.length){fs.writeFileSync('experiments/energy-dispatch.cjs',source(winners[0].p));fs.writeFileSync('experiments/energy-dispatch-parameters.json',JSON.stringify(winners[0],null,2));}
