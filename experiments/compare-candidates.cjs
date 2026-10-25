const fs=require('fs'),vm=require('vm'),source=fs.readFileSync('simulation.js','utf8'),s=require('../scenario.json');
const replaceStart=source.indexOf('   if(!cabin.length){',source.indexOf('  function choose()'));
const replaceEnd=source.indexOf('   const destinations=',replaceStart);
const afterUnload="   while(cabin.length<l.capacity){";
const switchDirection=`   if(kind!=='fifo'&&!cabin.length){const local=waiting.find(p=>p.from===floor);if(local)dir=direction(local);}\n`;
function policy(ageScale,power,emergency){return `   if(!cabin.length){
    if(!calls.length)return undefined;
    if(t-calls[0].t>${emergency}){dir=calls[0].dir;return calls[0].from;}
    let best=-Infinity,pick=calls[0];
    const candidates=calls.filter((c,i)=>calls.findIndex(x=>x.from===c.from&&x.dir===c.dir)===i);
    for(const c of candidates){
      let remaining=l.capacity,benefit=0,duration=motion(Math.abs(c.from-floor)*l.floorHeight,l.speed,l.acceleration).duration;
      let at=c.from;
      const floors=[...new Set(calls.filter(x=>x.dir===c.dir&&(x.from-c.from)*c.dir>=0).map(x=>x.from))].sort((a,b)=>(a-b)*c.dir);
      for(const f of floors){
       if(!remaining)break;
       const group=calls.filter(x=>x.from===f&&x.dir===c.dir).slice(0,remaining);
       if(!group.length)continue;
       duration+=motion(Math.abs(f-at)*l.floorHeight,l.speed,l.acceleration).duration+l.doorOpen+l.doorClose+group.length*(s.boarding.in+s.boarding.out);
       benefit+=group.reduce((sum,p)=>sum+(1+(t-p.t)/${ageScale})**${power},0);
       remaining-=group.length;at=f;
      }
      const end=c.dir>0?l.floors-1:0;
      duration+=motion(Math.abs(end-at)*l.floorHeight,l.speed,l.acceleration).duration+l.doorOpen+l.doorClose;
      const score=benefit/Math.max(1,duration);
      if(score>best){best=score;pick=c;}
    }
    dir=pick.dir;return pick.from;
   }
`;}
function bench(code){const ctx={};vm.runInNewContext(code,ctx);const r=ctx.ElevatorLab.compare(s),m=ctx.ElevatorLab.metrics(r,r.duration);return {wait:m.smart.avgWait,total:m.smart.avgTotal,energy:m.smart.energy,max:m.smart.maxWait,starts:m.smart.starts,dist:m.smart.distance};}
console.log('original',bench(source));console.log('turn at unload',bench(source.replace(afterUnload,switchDirection+afterUnload)));
for(const [scale,power,emergency] of [[120,1,600],[120,2,600],[60,2,600],[120,2,300],[120,1,300],[120,2,1200]]){
 let code=source.slice(0,replaceStart)+policy(scale,power,emergency)+source.slice(replaceEnd);code=code.replace(afterUnload,switchDirection+afterUnload);
 console.log([scale,power,emergency],bench(code));
 fs.writeFileSync(`experiments/candidate-${scale}-${power}-${emergency}.cjs`,code);
}

