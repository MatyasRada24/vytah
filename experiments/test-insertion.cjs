const fs=require('fs'),vm=require('vm'),s=require('../scenario.json'),original=fs.readFileSync('experiments/simulation-v2.cjs','utf8');
const start=original.indexOf('   const destinations=cabin.map'),end=original.indexOf("   throw Error('Neplatná trasa kabiny.');",start)+"   throw Error('Neplatná trasa kabiny.');".length;
const route=`   const destinations=[...new Set(cabin.map(p=>p.to))];
   let best=Infinity,pick=destinations[0];
   for(const scan of [dir,-dir]){
    const route=[...destinations.filter(f=>(f-floor)*scan>0).sort((a,b)=>(a-b)*scan),...destinations.filter(f=>(f-floor)*scan<0).sort((a,b)=>(b-a)*scan)];
    let cost=0,elapsed=0,at=floor;
    for(const f of route){elapsed+=motion(Math.abs(f-at)*l.floorHeight,l.speed,l.acceleration).duration+l.doorOpen;const exiting=cabin.filter(p=>p.to===f);cost+=exiting.length*elapsed;elapsed+=exiting.length*s.boarding.out+l.doorClose;at=f;}
    cost+=ENERGY_WEIGHT*elapsed;
    if(cost<best){best=cost;pick=route[0];}
   }
   dir=Math.sign(pick-floor);
   const ahead=calls.filter(c=>c.dir===dir&&(c.from-floor)*dir>0&&(pick-c.from)*dir>=0);
   if(cabin.length<l.capacity&&ahead.length)pick=[pick,...ahead.map(c=>c.from)].sort((a,b)=>Math.abs(a-floor)-Math.abs(b-floor))[0];
   return pick;`;
for(const age of [0,60,120,240])for(const energy of [0,2]){
let code=original.slice(0,start)+route.replace('ENERGY_WEIGHT',energy)+original.slice(end);
code=code.replace("kind==='fifo'||direction(x)===dir","kind==='fifo'||direction(x)===dir||t-x.t>="+age);
const ctx={};vm.runInNewContext(code,ctx);const r=ctx.ElevatorLab.compare(s),m=ctx.ElevatorLab.metrics(r,r.duration);console.log(age,energy,m.smart.avgTotal.toFixed(2),m.smart.avgWait.toFixed(2),m.smart.energy.toFixed(4),m.smart.maxWait.toFixed(1));fs.writeFileSync(`experiments/insertion-${age}-${energy}.cjs`,code);
}
