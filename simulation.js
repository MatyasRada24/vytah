/* Shared 0.05 s physics from the supplied simulator, different dispatch only. */
(function (root) {
 'use strict';
 const Physics=typeof module!=='undefined'&&module.exports?require('./tick-engine.js'):root.ElevatorPhysics;
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
  if(!['fifo','look','smart','eco'].includes(kind))throw Error('Neznámý algoritmus.');
  const l=s.lift,e=ENERGY,segments=[];
  let t=0,floor=l.startFloor,dir=1,waiting=[],cabin=[];
  function observeCalls(stav){
   t=stav.cas;floor=stav.patro;
   // Copy only information exposed by the reference simulator to the controller.
   waiting=stav.cekajici.map(p=>({from:p.patro,to:p.patro+p.smer,t:p.od}));
   cabin=stav.vKabine.map(p=>({from:p.odkud,to:p.cil}));
  }
  function choose(){
   if(kind==='fifo')return cabin.length?cabin[0].to:waiting[0]?.from;
   // Dispatch only sees floor, hall direction and elapsed waiting; never hidden destinations.
   const calls=waiting.map(p=>({from:p.from,dir:direction(p),t:p.t}));
   if(!cabin.length){
    if(!calls.length)return undefined;
    const oldest=calls[0];let pick=oldest;
    if(kind==='smart'||kind==='eco'){
     // Estimate complete pickup workload using only currently visible hall calls.
     // Square waiting age so a small old queue can outweigh a large fresh queue.
     if(t-oldest.t<(kind==='eco'?900:600)){
      const groups=new Map();
      for(const call of calls){
       const key=call.from+':'+call.dir;
       if(!groups.has(key))groups.set(key,[]);
       groups.get(key).push(call);
      }
      let best=Infinity;
      for(const group of groups.values()){
       const c=group[0];
       const pressure=group.slice(0,l.capacity).reduce((sum,p)=>sum+(kind==='eco'?1+(t-p.t)/240:(1+(t-p.t)/120)**2),0);
       const travel=motion(Math.abs(c.from-floor)*l.floorHeight,l.speed,l.acceleration).duration;
       // Direction boundary is a proxy, not knowledge of any passenger destination.
       const boundary=c.dir>0?l.floors-1:0;
       const estimatedSweep=Math.abs(c.from-boundary)*l.floorHeight/l.speed;
       let cost=travel+l.doorOpen+l.doorClose+estimatedSweep;
       if(kind==='eco'){
        // Seconds + 6 seconds per Wh of empty repositioning work. Same physical
        // energy model as the executed trip; no hidden passenger destinations.
        const reposition=motion(Math.abs(c.from-floor)*l.floorHeight,l.speed,l.acceleration);
        const emptyForce=Math.max(0,-l.capacity*e.personKg/2*9.81*Math.sign(c.from-floor)+e.frictionN);
        const repositionWh=(emptyForce*reposition.distance+.5*(2*e.cabinKg+l.capacity*e.personKg/2)*reposition.peak**2)/e.efficiency/3600;
        cost=travel+l.doorOpen+l.doorClose+6*repositionWh;
       }
       const score=cost/pressure;
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
  const policy={
   decide(stav){
    if(kind==='fifo')return stav.vKabine.length?stav.vKabine[0].cil:stav.cekajici[0]?.patro??null;
    // Keep each chosen leg fixed, as in the existing smart dispatch policies.
    if(!stav.stoji)return stav.cil;
    observeCalls(stav);return choose()??null;
   },
   board(stav,osoba){
    // Exact nastup() rule supplied in vytah.html: no extra pickups during delivery.
    if(kind==='fifo')return stav.vKabine.every(p=>p.odkud===stav.patro);
    if((kind==='smart'||kind==='eco')&&!stav.vKabine.length){
     const local=stav.cekajici.find(p=>p.patro===stav.patro),oldest=stav.cekajici[0];
     if(local&&(oldest.patro===stav.patro||stav.cas-oldest.od<(kind==='eco'?120:360)))dir=local.smer;
    }
    return osoba.smer===dir;
   }
  };
  const labels=['ČEKÁ','JÍZDA','OTEVÍRÁ','VÝSTUP','NÁSTUP','ZAVÍRÁ'];
  const taskCode={open:2,out:3,in:4,close:5};
  const trace={floor:[l.startFloor],energy:[0],distance:[0],emptyDistance:[0],starts:[0],stops:[0],state:[0],dir:[0]};
  let energy=0,emptyDistance=0,starts=0,previous={t:0,y:l.startFloor*l.floorHeight,v:0,state:'idle',dist:0};
  const raw=Physics.run(s,policy,step=>{
   const dt=step.t-previous.t,travel=step.dist-previous.dist;
   const moving=step.activity==='moving',activeCode=moving?1:step.activity==='stop'?taskCode[step.activeTask]:0;
   let work=0;
   if(moving){
    if(previous.state!=='moving')starts++;
    const cw=e.cabinKg+l.capacity*e.personKg/2,loadKg=step.activeLoad*e.personKg;
    const force=Math.max(0,(e.cabinKg+loadKg-cw)*9.81*Math.sign(step.y-previous.y)+e.frictionN);
    work=(force*travel+.5*(e.cabinKg+loadKg+cw)*Math.max(0,step.v**2-previous.v**2))/e.efficiency;
    if(!step.activeLoad)emptyDistance+=travel;
   }
   const power=e.standbyW+(moving?e.driveW:step.activity==='stop'?e.doorW:0);
   const last=segments[segments.length-1];
   if(last&&last.state===labels[activeCode]&&last.load===step.activeLoad){last.end=step.t;last.to=step.y/l.floorHeight;}
   else segments.push({start:previous.t,end:step.t,from:previous.y/l.floorHeight,to:step.y/l.floorHeight,state:labels[activeCode],load:step.activeLoad,energy});
   energy+=(power*dt+work)/3600000;
   trace.floor.push(step.y/l.floorHeight);trace.energy.push(energy);trace.distance.push(step.dist);trace.emptyDistance.push(emptyDistance);
   trace.starts.push(starts);trace.stops.push(step.stops);
   trace.state.push(step.state==='moving'?1:step.state==='stop'?taskCode[step.task]:0);
   trace.dir.push(step.state==='moving'?Math.sign(step.v):0);
   previous=step;
  });
  if(!raw.ok)throw Error(raw.error.message);
  for(const key of Object.keys(trace))trace[key]=Float64Array.from(trace[key]);
  return {kind,people:raw.persons.map(p=>({id:p.id,t:p.t,from:p.from,to:p.to,slow:p.slow,board:p.tBoard,done:p.tExit})),segments,trace,step:Physics.DT,end:raw.endTime,finished:raw.finished,floor:previous.y/l.floorHeight,energy,distance:raw.metrics.dist,emptyDistance,starts,stops:raw.metrics.stops,lift:l,horizon:s.evaluation.horizon};
 }
 function snapshot(run,time){
  const t=Math.max(0,time),trace=run.trace,pos=Math.min(t,run.end)/run.step;
  const i=Math.min(trace.floor.length-1,Math.floor(pos+1e-9)),j=Math.min(i+1,trace.floor.length-1),fraction=Math.max(0,pos-i);
  const interpolate=key=>trace[key][i]+(trace[key][j]-trace[key][i])*fraction;
  const floor=interpolate('floor'),energy=interpolate('energy')+ENERGY.standbyW*Math.max(0,t-run.end)/3600000;
  const distance=interpolate('distance'),emptyDistance=interpolate('emptyDistance'),starts=trace.starts[i],stops=trace.stops[i];
  const state=t>=run.end?'ČEKÁ':['ČEKÁ','JÍZDA','OTEVÍRÁ','VÝSTUP','NÁSTUP','ZAVÍRÁ'][trace.state[i]],dir=trace.dir[i];
  const arrived=run.people.filter(p=>p.t<=t),waiting=arrived.filter(p=>p.board===null||p.board>t);
  const cabin=arrived.filter(p=>p.board!==null&&p.board<=t&&(p.done===null||p.done>t));
  const served=arrived.filter(p=>p.done!==null&&p.done<=t);
  const boarded=arrived.filter(p=>p.board!==null&&p.board<=t),waits=boarded.map(p=>p.board-p.t).sort((a,b)=>a-b);
  const totals=served.map(p=>p.done-p.t),complete=served.length===run.people.length;
  return {floor,energy,distance,emptyDistance,starts,stops,state,dir,waiting,cabin,served,arrived,
   avgWait:mean(waits),avgRide:mean(served.map(p=>p.done-p.board)),avgTotal:mean(totals),
   maxWait:waits.length?Math.max(...waits):null,maxTotal:totals.length?Math.max(...totals):null,
   p95Wait:waits.length?waits[Math.ceil(.95*waits.length)-1]:null,
   completedAt:complete?(served.length?Math.max(...served.map(p=>p.done)):0):null,
   servedInHorizon:served.filter(p=>p.done<=run.horizon).length};
 }
 function compare(s,mode='all',algorithm='smart'){
  if(!['smart','look','eco'].includes(algorithm))throw Error('Neznámý algoritmus.');
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
