// Candidate dispatcher: estimates a batch's complete trip from previously boarded destinations.
module.exports=function plan({floor,time,calls,lift,boarding,history},options={}){
 const groups=new Map();for(const c of calls){const key=c.from+':'+c.dir;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
 let best=Infinity,pick=calls[0];
 const travel=d=>{const v=Math.min(lift.speed,Math.sqrt(d*lift.acceleration));return d?d/v+v/lift.acceleration:0;};
 for(const [key,group] of groups){
  const c=group[0],n=Math.min(lift.capacity,group.length),freq=history[key]||[];
  const possible=Array.from({length:lift.floors},(_,i)=>i).filter(i=>(i-c.from)*c.dir>0).sort((a,b)=>(a-b)*c.dir);
  let sum=0;const weights=possible.map(f=>{const w=(freq[f]||0)+1;sum+=w;return w;});
  let stops=0,range=0,cumulative=0,prev=0;
  for(let i=0;i<possible.length;i++){const probability=weights[i]/sum;stops+=1-(1-probability)**n;cumulative+=probability;const maximumProbability=cumulative**n-prev;range+=Math.abs(possible[i]-c.from)*lift.floorHeight*maximumProbability;prev=cumulative**n;}
  const approach=travel(Math.abs(c.from-floor)*lift.floorHeight);
  const estimate=approach+range/lift.speed+stops*lift.speed/lift.acceleration+(1+stops)*(lift.doorOpen+lift.doorClose)+n*(boarding.in+boarding.out);
  const pressure=group.slice(0,options.cap===false?group.length:lift.capacity).reduce((a,p)=>a+(1+(time-p.t)/120)**(options.power||2),0);
  const cost=options.mode==='simple'?approach+(lift.doorOpen+lift.doorClose)+range/lift.speed:estimate;
  const score=cost/pressure;
  if(score<best){best=score;pick=c;}
 }
 if(time-calls[0].t>(options.limit||600))pick=calls[0];
 return pick;
};
