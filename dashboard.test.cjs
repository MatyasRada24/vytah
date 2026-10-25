// Offline script wiring and exported metrics, without a server or browser network.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function app(){
 const elements=new Map();let exported;
 function element(id){
  if(!elements.has(id))elements.set(id,{value:({scope:'all',algorithmSelect:'eco',speed:'32'})[id]||'',options:[{},{}],style:{},dataset:{},handlers:{},classList:{toggle(){}},firstElementChild:{},closest:()=>({clientHeight:320}),setAttribute(){},scrollIntoView(){},click(){},addEventListener(name,fn){this.handlers[name]=fn;}});
  return elements.get(id);
 }
 const context=vm.createContext({document:{getElementById:element,createElement:()=>({click(){}})},window:{addEventListener(){}},requestAnimationFrame(){},performance:{now:()=>0},matchMedia:()=>({matches:true}),setTimeout(){},Blob,URL:{createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}}});
 const html=fs.readFileSync('index.html','utf8');
 for(const [,file] of html.matchAll(/<script defer src="([^"]+)"/g))vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 return {element,async export(){element('exportBtn').handlers.click();return JSON.parse(await exported.text());}};
}
test('offline page loads all dependencies and initial export hides future events',async()=>{
 const page=app(),data=await page.export();
 assert.equal(data.version,2);assert.equal(data.physics.stepSeconds,.05);
 assert.equal(data.fifo.served,0);assert.equal(data.fifo.completedAtSeconds,null);
 assert.equal(data.fifo.avgRideSeconds,null);assert.equal(data.fifo.servedInHorizon,0);
 assert.ok(data.passengers.fifo.every(p=>p.board===null&&p.done===null));
 assert.match(page.element('metricsTable').innerHTML,/Rozvezeno do 600 s/);
});
test('final and horizon exports contain all new computed metrics',async()=>{
 const page=app();page.element('finishBtn').handlers.click();let data=await page.export();
 assert.equal(data.complete,true);assert.equal(data.fifo.served,400);
 assert.equal(data.fifo.completedAtSeconds,3879.05);assert.equal(data.fifo.stops,309);
 assert.equal(data.fifo.servedInHorizon,42);assert.equal(data.smart.servedInHorizon,50);
 assert.ok(Math.abs(data.fifo.avgRideSeconds-22.429)<1e-8);
 assert.ok(Math.abs(data.fifo.maxJourneySeconds-1457.05)<1e-8);
 assert.equal(data.fifo.maxWaitingSeconds,1438.65);assert.equal(data.fifo.horizonSeconds,600);
 assert.ok(data.passengers.fifo.every(p=>p.done!==null));
 page.element('scope').value='horizon';page.element('scope').handlers.change();page.element('finishBtn').handlers.click();data=await page.export();
 assert.equal(data.fifo.served,113);assert.equal(data.fifo.servedInHorizon,42);
 assert.equal(data.input.people.length,113);
});
