/* Deterministic event simulation. Identical hardware, different dispatch only. */
(function (root) {
 'use strict';
 const ENERGY = Object.freeze({cabinKg:800,personKg:75,efficiency:.8,frictionN:180,standbyW:80,doorW:200,driveW:120});
 const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
 const direction = p => Math.sign(p.to-p.from);
 function validate(raw) {
  if (!raw || raw.format!=='vytah-zadani' || raw.version!==1) throw Error('Očekávám formát vytah-zadani, verze 1.');
  const s=JSON.parse(JSON.stringify(raw)), l=s.lift;
  if (!l || !s.boarding || !s.evaluation || !s.info) throw Error('Chybí lift, boarding, info nebo evaluation.');
  const finite=(v,min,max)=>typeof v==='number' && Number.isFinite(v) && v>=min && v<=max;
  if (!Number.isInteger(l.floors)||!finite(l.floors,2,40)||!Number.isInteger(l.capacity)||!finite(l.capacity,1,100)) throw Error('Počet podlaží musí být 2–40, kapacita 1–100.');
  if (!Number.isInteger(l.startFloor)||!finite(l.startFloor,0,l.floors-1)) throw Error('Neplatné počáteční patro.');
  for(const key of ['floorHeight','speed','acceleration','doorOpen','doorClose']) if(!finite(l[key],.01,100)) throw Error('Neplatný parametr: '+key);
  for(const key of ['in','out']) if(!finite(s.boarding[key],.01,100)) throw Error('Neplatná doba nástupu/výstupu.');
  if(!finite(s.evaluation.maxTime,1,86400)||!finite(s.evaluation.horizon,0,s.evaluation.maxTime)) throw Error('Neplatný časový horizont.');
  if(typeof s.info.destVisible!=='boolean') throw Error('destVisible musí být true nebo false.');
  if(!Array.isArray(s.people)||s.people.length>10000) throw Error('people musí být pole nejvýše 10 000 cestujících.');
  const ids=new Set();
  for(const p of s.people){
   if(!Number.isInteger(p.id)||ids.has(p.id)) throw Error('Každý cestující musí mít jedinečné číselné id.');
   ids.add(p.id);
   if(!finite(p.t,0,s.evaluation.maxTime)||!Number.isInteger(p.from)||!Number.isInteger(p.to)||!finite(p.from,0,l.floors-1)||!finite(p.to,0,l.floors-1)||p.from===p.to||(p.slow!==undefined&&!finite(p.slow,1,100))) throw Error('Neplatná data cestujícího '+p.id+'.');
  }
  s.people.sort((a,b)=>a.t-b.t||a.id-b.id);
  s.name=typeof s.name==='string'?s.name.slice(0,120):'Importovaný scénář';
  return s;
 }
 function motion(distance,speed,acceleration){
  const peak=Math.min(speed,Math.sqrt(distance*acceleration)),ramp=peak/acceleration;
  const cruise=peak?Math.max(0,(distance-peak*peak/acceleration)/peak):0;
  return {duration:2*ramp+cruise,peak,ramp,cruise,distance,acceleration};
 }
 function progress(m,elapsed){
  if(!m.distance)return 1;
  const t=Math.min(m.duration,Math.max(0,elapsed));let d;
  if(t<m.ramp)d=.5*m.acceleration*t*t;
  else if(t<m.ramp+m.cruise)d=.5*m.peak*m.ramp+m.peak*(t-m.ramp);
  else d=m.distance-.5*m.acceleration*(m.duration-t)**2;
  return d/m.distance;
 }
 function simulate(s,kind){
  const l=s.lift,e=ENERGY,people=s.people.map(p=>({...p,board:null,done:null})),segments=[];
  let t=0,floor=l.startFloor,dir=1,index=0,waiting=[],cabin=[],energy=0,distance=0,emptyDistance=0,starts=0,stops=0;
  const arrivals=()=>{while(index<people.length&&people[index].t<=t+1e-9)waiting.push(people[index++]);};
  function add(duration,state,target=floor,extra={}){
   if(duration<=0)return;
   const power=e.standbyW+(state==='JÍZDA'?e.driveW:state==='ČEKÁ'?0:e.doorW);
   const segment={start:t,end:t+duration,from:floor,to:target,state,load:cabin.length,energy,distance,emptyDistance,starts,stops,power,work:0,...extra};
   segments.push(segment);energy+=(power*duration+segment.work)/3600000;
   if(state==='JÍZDA'){const d=Math.abs(target-floor)*l.floorHeight;distance+=d;if(!cabin.length)emptyDistance+=d;}
   t+=duration;floor=target;arrivals();
  }
  function choose(){
   if(kind==='fifo')return cabin.length?cabin[0].to:waiting[0]?.from;
   // Dispatch only sees floor, hall direction and elapsed waiting; never hidden destinations.
   const calls=waiting.map(p=>({from:p.from,dir:direction(p),t:p.t}));
   if(!cabin.length){
    if(!calls.length)return undefined;
    const oldest=calls[0];let pick=oldest;
    if(kind==='smart'){
     // Estimate complete pickup workload using only currently visible hall calls.
     // Square waiting age so a small old queue can outweigh a large fresh queue.
     if(t-oldest.t<600){
      const groups=new Map();
      for(const call of calls){
       const key=call.from+':'+call.dir;
       if(!groups.has(key))groups.set(key,[]);
       groups.get(key).push(call);
      }
      let best=Infinity;
      for(const group of groups.values()){
       const c=group[0];
       const pressure=group.slice(0,l.capacity).reduce((sum,p)=>sum+(1+(t-p.t)/120)**2,0);
       const travel=motion(Math.abs(c.from-floor)*l.floorHeight,l.speed,l.acceleration).duration;
       // Direction boundary is a proxy, not knowledge of any passenger destination.
       const boundary=c.dir>0?l.floors-1:0;
       const estimatedSweep=Math.abs(c.from-boundary)*l.floorHeight/l.speed;
       const score=(travel+l.doorOpen+l.doorClose+estimatedSweep)/pressure;
       if(score<best){best=score;pick=c;}
      }
     }
    }else if(t-oldest.t<120){
     let best=Infinity;
     for(const c of calls){
      const group=calls.filter(x=>x.from===c.from&&x.dir===c.dir).length;
      const travel=motion(Math.abs(c.from-floor)*l.floorHeight,l.speed,l.acceleration).duration;
      const score=(travel+l.doorOpen+l.doorClose)/(1+(t-c.t)/60+.25*Math.min(group,l.capacity));
      if(score<best){best=score;pick=c;}
     }
    }
    dir=pick.dir;return pick.from;
   }
   const destinations=cabin.map(p=>p.to);
   for(let attempt=0;attempt<2;attempt++){
    const ahead=destinations.filter(f=>(f-floor)*dir>0);
    if(ahead.length){
     const end=dir>0?Math.max(...ahead):Math.min(...ahead);
     if(cabin.length<l.capacity)for(const c of calls)if(c.dir===dir&&(c.from-floor)*dir>0&&(end-c.from)*dir>=0)ahead.push(c.from);
     return ahead.sort((a,b)=>Math.abs(a-floor)-Math.abs(b-floor))[0];
    }
    dir*=-1;
   }
   throw Error('Neplatná trasa kabiny.');
  }
  arrivals();let guard=0;
  while(t<s.evaluation.maxTime&&(index<people.length||waiting.length||cabin.length)){
   if(++guard>100000)throw Error('Překročen limit událostí.');
   const target=choose();
   if(target===undefined){add(people[index].t-t,'ČEKÁ');continue;}
   if(target!==floor){
    const m=motion(Math.abs(target-floor)*l.floorHeight,l.speed,l.acceleration),loadKg=cabin.length*e.personKg;
    const cw=e.cabinKg+l.capacity*e.personKg/2;
    const force=Math.max(0,(e.cabinKg+loadKg-cw)*9.81*Math.sign(target-floor)+e.frictionN);
    const work=(force*m.distance+.5*(e.cabinKg+loadKg+cw)*m.peak**2)/e.efficiency;
    starts++;
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
     if(kind==='smart'&&cabin.length>0&&cabin.length<=2&&cabin.length<l.capacity){
      const candidates=[...new Set(waiting.filter(p=>direction(p)===sign&&(p.from-floor)*sign>1e-8&&(destination-p.from)*sign>0).map(p=>p.from))].sort((a,b)=>(a-b)*sign);
      for(const f of candidates){ if(waiting.filter(p=>p.from===f&&direction(p)===sign).length<1)continue;
       const alternative=motion(Math.abs(f-origin)*l.floorHeight,l.speed,l.acceleration);
       // Calls are considered only after their arrival event. Brake from the same trajectory.
       if(t-departure<=alternative.duration-alternative.ramp+1e-9){destination=f;profile=alternative;break;}
      }
     }
    }
    if(t<s.evaluation.maxTime)floor=destination;
    if(t>=s.evaluation.maxTime)break;
   }
   stops++;add(l.doorOpen,'OTEVÍRÁ');
   for(const p of [...cabin])if(p.to===floor){add(s.boarding.out*(p.slow||1),'VÝSTUP');p.done=t;cabin=cabin.filter(x=>x!==p);}
   // Reuse the open doors at a turnaround, unless another floor is long overdue.
   // The original LOOK policy is retained unchanged under kind === 'look'.
   if(kind==='smart'&&!cabin.length){
    const local=waiting.find(p=>p.from===floor);
    if(local&&(waiting[0].from===floor||t-waiting[0].t<360))dir=direction(local);
   }
   while(cabin.length<l.capacity){
    const p=waiting.find(x=>x.from===floor&&(kind==='fifo'||direction(x)===dir));if(!p)break;
    waiting=waiting.filter(x=>x!==p);cabin.push(p);add(s.boarding.in*(p.slow||1),'NÁSTUP');p.board=t;
   }
   add(l.doorClose,'ZAVÍRÁ');
  }
  const finished=people.every(p=>p.done!==null&&p.done<=s.evaluation.maxTime);
  return {kind,people,segments,end:Math.min(t,s.evaluation.maxTime),finished,floor,energy,distance,emptyDistance,starts,stops,lift:l};
 }
 function snapshot(run,time){
  const t=Math.max(0,time),list=run.segments;let lo=0,hi=list.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(list[mid].start<=t)lo=mid+1;else hi=mid;}
  const segment=list[lo-1];
  let floor=run.lift.startFloor,energy=0,distance=0,emptyDistance=0,starts=0,stops=0,state='ČEKÁ',dir=0;
  if(segment){
   const dt=Math.min(t,segment.end)-segment.start;
   let fraction=segment.motion?progress(segment.motion,dt):0;
   let partialWork=segment.work*fraction;
   if(segment.offset!==undefined){
    const startDistance=progress(segment.motion,segment.offset)*segment.motion.distance;
    const travelled=progress(segment.motion,segment.offset+dt)*segment.motion.distance-startDistance;
    const segmentLength=Math.abs(segment.to-segment.from)*run.lift.floorHeight;
    fraction=segmentLength?travelled/segmentLength:0;
    const velocity=elapsed=>Math.min(segment.motion.peak,segment.motion.acceleration*elapsed);
    partialWork=segment.force*travelled+segment.kineticFactor*(velocity(segment.offset+dt)**2-velocity(segment.offset)**2);
   }
   floor=segment.from+(segment.to-segment.from)*fraction;
   energy=segment.energy+(segment.power*dt+partialWork)/3600000;
   distance=segment.distance+(segment.offset!==undefined?Math.abs(segment.to-segment.from)*run.lift.floorHeight:(segment.motion?.distance||0))*fraction;
   emptyDistance=segment.emptyDistance+(!segment.load?(segment.offset!==undefined?Math.abs(segment.to-segment.from)*run.lift.floorHeight:(segment.motion?.distance||0))*fraction:0);
   starts=segment.starts;stops=segment.stops;
   if(t<segment.end){state=segment.state;dir=Math.sign(segment.to-segment.from);}
   else{floor=segment.to;energy+=ENERGY.standbyW*(t-segment.end)/3600000;}
  }else energy=ENERGY.standbyW*t/3600000;
  const arrived=run.people.filter(p=>p.t<=t),waiting=arrived.filter(p=>p.board===null||p.board>t);
  const cabin=arrived.filter(p=>p.board!==null&&p.board<=t&&(p.done===null||p.done>t));
  const served=arrived.filter(p=>p.done!==null&&p.done<=t);
  return {floor,energy,distance,emptyDistance,starts,stops,state,dir,waiting,cabin,served,arrived,avgWait:mean(served.map(p=>p.board-p.t)),avgTotal:mean(served.map(p=>p.done-p.t)),maxWait:served.length?Math.max(...served.map(p=>p.board-p.t)):null};
 }
 function compare(s,mode='all',algorithm='smart'){
  if(!['smart','look'].includes(algorithm))throw Error('Neznámý algoritmus.');
  s=validate(s);if(mode==='horizon')s.people=s.people.filter(p=>p.t<=s.evaluation.horizon);
  const dumb=simulate(s,'fifo'),smart=simulate(s,algorithm);
  return {scenario:s,dumb,smart,duration:Math.max(dumb.end,smart.end,1),mode,algorithm};
 }
 function metrics(result,t){
  const dumb=snapshot(result.dumb,t),smart=snapshot(result.smart,t),ids=new Set(smart.served.map(p=>p.id));
  const a=dumb.served.filter(p=>ids.has(p.id)),matches=new Set(a.map(p=>p.id)),b=smart.served.filter(p=>matches.has(p.id));
  const dw=mean(a.map(p=>p.board-p.t)),sw=mean(b.map(p=>p.board-p.t)),dt=mean(a.map(p=>p.done-p.t)),st=mean(b.map(p=>p.done-p.t));
  return {dumb,smart,matched:a.length,waitPct:dw>0?(dw-sw)/dw*100:null,totalPct:dt>0?(dt-st)/dt*100:null,energyPct:dumb.energy>0?(dumb.energy-smart.energy)/dumb.energy*100:null,waitDiff:dw===null?null:dw-sw,totalDiff:dt===null?null:dt-st};
 }
 const api={ENERGY,validate,motion,progress,simulate,snapshot,compare,metrics};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.ElevatorLab=api;
})(globalThis);
