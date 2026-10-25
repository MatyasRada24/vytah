const fs=require('fs'),vm=require('vm'),original=fs.readFileSync('experiments/simulation-v2.cjs','utf8'),s=require('../scenario.json');
for(const hold of [1,2,3,5,8])for(const minimum of [0,3,6]){
const addition=`   if(kind==='smart'&&cabin.length&&cabin.length<l.capacity){
 const recent=people.slice(0,index).filter(p=>p.from===floor&&direction(p)===dir&&t-p.t<=60).length;
 if(recent>=${minimum}){
 add(${hold},'ČEKÁ NA SKUPINU');
 while(cabin.length<l.capacity){const p=waiting.find(x=>x.from===floor&&direction(x)===dir);if(!p)break;waiting=waiting.filter(x=>x!==p);cabin.push(p);add(s.boarding.in*(p.slow||1),'NÁSTUP');p.board=t;}
 }
 }
`;
const code=original.replace("   add(l.doorClose,'ZAVÍRÁ');",addition+"   add(l.doorClose,'ZAVÍRÁ');");const ctx={};vm.runInNewContext(code,ctx);const r=ctx.ElevatorLab.compare(s),m=ctx.ElevatorLab.metrics(r,r.duration);console.log(hold,minimum,m.smart.avgTotal.toFixed(1),m.smart.energy.toFixed(4),m.smart.maxWait.toFixed(1));fs.writeFileSync(`experiments/hold-${hold}-${minimum}.cjs`,code);
}
