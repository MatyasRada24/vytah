const fs=require('fs'),vm=require('vm'),original=fs.readFileSync('experiments/simulation-v2.cjs','utf8'),s=require('../scenario.json'),plan=require('./learned-policy.cjs');
const start=original.indexOf("    if(kind==='smart'){");const end=original.indexOf('    dir=pick.dir;',start);
for(const mode of ['simple','full'])for(const cap of [true,false])for(const power of [1,2]){
 let code=original.slice(0,start)+`    pick=planner({floor,time:t,calls,lift:l,boarding:s.boarding,history},${JSON.stringify({mode,cap,power})});\n`+original.slice(end);
 code=code.replace('  const arrivals=','  const history={};\n  const arrivals=');
 code=code.replace('p.board=t;',`p.board=t; const key=p.from+':'+direction(p); if(!history[key])history[key]=[];history[key][p.to]=(history[key][p.to]||0)+1;`);
 const ctx={planner:plan};vm.runInNewContext(code,ctx);const r=ctx.ElevatorLab.compare(s),m=ctx.ElevatorLab.metrics(r,r.duration);console.log(mode,cap,power,m.smart.avgTotal.toFixed(2),m.smart.avgWait.toFixed(2),m.smart.energy.toFixed(4),m.smart.maxWait.toFixed(1));
 fs.writeFileSync(`experiments/learned-${mode}-${cap}-${power}.cjs`,code.replace('planner(',"require('./learned-policy.cjs')(") );
}
