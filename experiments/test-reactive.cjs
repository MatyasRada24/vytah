const fs=require('fs');let code=fs.readFileSync('experiments/simulation-v2.cjs','utf8');
const old=`    starts++;add(m.duration,'JÍZDA',target,{motion:m,work});`;
const movement=`    starts++;
    const origin=floor,departure=t,sign=Math.sign(target-floor);let destination=target,profile=m;
    const kineticFactor=.5*(e.cabinKg+loadKg+cw)/e.efficiency;
    while(t<departure+profile.duration-1e-9){
     const before=t-departure;
     const event=Math.min(departure+profile.duration,index<people.length?people[index].t:Infinity,s.evaluation.maxTime);
     const after=event-departure;
     const segmentDistance=(progress(profile,after)-progress(profile,before))*profile.distance;
     const reached=f=>Math.min(profile.peak,profile.acceleration*f);
     const segmentWork=force*segmentDistance/e.efficiency+kineticFactor*(reached(after)**2-reached(before)**2);
     const position=origin+sign*progress(profile,after)*profile.distance/l.floorHeight;
     add(event-t,'JÍZDA',position,{motion:profile,offset:before,work:segmentWork,force:force/e.efficiency,kineticFactor});
     if(t>=s.evaluation.maxTime)break;
     if(cabin.length<l.capacity){
      const candidates=[...new Set(waiting.filter(p=>direction(p)===sign&&(p.from-floor)*sign>1e-8&&(destination-p.from)*sign>0).map(p=>p.from))].sort((a,b)=>(a-b)*sign);
      for(const f of candidates){
       const alternative=motion(Math.abs(f-origin)*l.floorHeight,l.speed,l.acceleration);
       // Calls are considered only after their arrival event. Brake from the same trajectory.
       if(t-departure<=alternative.duration-alternative.ramp+1e-9){destination=f;profile=alternative;break;}
      }
     }
    }
    if(t<s.evaluation.maxTime)floor=destination;`;
code=code.replace(old,movement);
const oldSnapshot=`const dt=Math.min(t,segment.end)-segment.start,fraction=segment.motion?progress(segment.motion,dt):0;`;
const newSnapshot=`const dt=Math.min(t,segment.end)-segment.start;
   let fraction=segment.motion?progress(segment.motion,dt):0;
   let partialWork=segment.work*fraction;
   if(segment.offset!==undefined){
    const startDistance=progress(segment.motion,segment.offset)*segment.motion.distance;
    const travelled=progress(segment.motion,segment.offset+dt)*segment.motion.distance-startDistance;
    const segmentLength=Math.abs(segment.to-segment.from)*run.lift.floorHeight;
    fraction=segmentLength?travelled/segmentLength:0;
    const velocity=elapsed=>Math.min(segment.motion.peak,segment.motion.acceleration*elapsed);
    partialWork=segment.force*travelled+segment.kineticFactor*(velocity(segment.offset+dt)**2-velocity(segment.offset)**2);
   }`;
code=code.replace(oldSnapshot,newSnapshot).replace('segment.work*fraction)/3600000','partialWork)/3600000').replace('(segment.motion?.distance||0)*fraction','(segment.offset!==undefined?Math.abs(segment.to-segment.from)*run.lift.floorHeight:(segment.motion?.distance||0))*fraction');
// replacement above must cover both distance and empty-distance expressions
code=code.replace('(segment.motion?.distance||0)*fraction','(segment.offset!==undefined?Math.abs(segment.to-segment.from)*run.lift.floorHeight:(segment.motion?.distance||0))*fraction');
fs.writeFileSync('experiments/reactive.cjs',code);
const E=require('./reactive.cjs'),s=require('../scenario.json'),r=E.compare(s),m=E.metrics(r,r.duration);console.log(JSON.stringify({avg:m.smart.avgTotal,wait:m.smart.avgWait,energy:m.smart.energy,max:m.smart.maxWait,served:m.smart.served.length,done:r.smart.finished,fifo:m.dumb.avgTotal},null,2));
