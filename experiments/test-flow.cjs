const fs=require('fs'),vm=require('vm'),original=fs.readFileSync('experiments/simulation-v2.cjs','utf8'),s=require('../scenario.json');
const marker='  function choose(){';
for(const ratio of [.5,.7])for(const threshold of [1,2])for(const express of [false,true]){
 const helper=`  function dominant(){
 const groups=new Map();for(const p of waiting){const key=p.from+':'+direction(p);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 const group=[...groups.values()].sort((a,b)=>b.length-a.length)[0];
 return group&&group.length>=l.capacity*${threshold}&&group.length>=waiting.length*${ratio}&&t-waiting[0].t<600?group[0]:null;
 }
`;
 let code=original.replace(marker,helper+marker).replace('    const oldest=calls[0];let pick=oldest;',`    const focus=dominant();if(focus){dir=direction(focus);return focus.from;}\n    const oldest=calls[0];let pick=oldest;`);
 if(express){code=code.replace('if(cabin.length<l.capacity)for(const c of calls)','if(cabin.length<l.capacity&&!dominant())for(const c of calls)');code=code.replace('   while(cabin.length<l.capacity){',`   while(cabin.length<l.capacity){
    const focus=dominant();if(!cabin.length&&focus&&focus.from!==floor)break;
`);}
 const ctx={};vm.runInNewContext(code,ctx);const r=ctx.ElevatorLab.compare(s),m=ctx.ElevatorLab.metrics(r,r.duration);console.log(ratio,threshold,express,m.smart.avgTotal.toFixed(2),m.smart.avgWait.toFixed(2),m.smart.energy.toFixed(4),m.smart.maxWait.toFixed(1));fs.writeFileSync(`experiments/flow-${ratio}-${threshold}-${express}.cjs`,code);
}
