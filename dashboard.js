'use strict';
const $ = id => document.getElementById(id);
const Lab = globalThis.ElevatorLab;
const ALGORITHMS = {eco:'ECO',smart:'LOOK+',look:'LOOK'};
let source = Lab.validate(globalThis.DEFAULT_SCENARIO), result, reference, time = 0, playing = false, lastFrame = 0, lastPaint = 0;
const fmt = (n, digits = 1) => n === null || !Number.isFinite(n) ? '—' : n.toLocaleString('cs-CZ', {minimumFractionDigits: digits, maximumFractionDigits: digits});
const clock = n => `${Math.floor(n / 60).toString().padStart(2, '0')}:${Math.floor(n % 60).toString().padStart(2, '0')}`;
function setup(nextSource = source) {
  // Compute before committing UI state: invalid imports leave the current experiment intact.
  const next = Lab.compare(nextSource, $('scope').value, $('algorithmSelect').value);
  const previous = next.algorithm === 'look' ? next : Lab.compare(nextSource, $('scope').value, next.algorithm === 'eco' ? 'smart' : 'look');
  source = nextSource; result = next; reference = previous; playing = false; time = 0;
  $('scenarioName').textContent = source.name;
  $('algorithmLegend').textContent = ALGORITHMS[result.algorithm];
  $('fileBadge').textContent = `JSON · ${typeof source.hash === 'string' ? source.hash.slice(0,30) : 'vlastní zadání'}`;
  $('sourceInfo').textContent = `${source.people.length} cestujících · pevný průběh příjezdů`;
  const l = source.lift;
  $('configGrid').innerHTML = [['Podlaží', l.floors], ['Cestujících', result.scenario.people.length], ['Kapacita', `${l.capacity} osob`], ['Rychlost', `${fmt(l.speed)} m/s`], ['Výška patra', `${fmt(l.floorHeight)} m`], ['Zrychlení', `${fmt(l.acceleration)} m/s²`], ['Dveře ↔', `${fmt(l.doorOpen)} / ${fmt(l.doorClose)} s`], ['Nástup / výstup', `${fmt(source.boarding.in)} / ${fmt(source.boarding.out)} s`]].map(([k,v]) => `<dl><dt>${k}</dt><dd>${v}</dd></dl>`).join('');
  $('scope').options[0].textContent = `Celý soubor · ${source.people.length} osob`;
  $('scope').options[1].textContent = `Horizont zadání · ${source.evaluation.horizon} s`;
  $('scopeNote').textContent = result.mode === 'all' ? `Všechny záznamy people, včetně příjezdů po horizontu ${source.evaluation.horizon} s. Limit běhu ${clock(source.evaluation.maxTime)}.` : `Jen příchody t ≤ ${source.evaluation.horizon} s; následně doobsloužení do limitu ${clock(source.evaluation.maxTime)}.`;
  $('fairNote').textContent = `Parametry z JSON jsou pevné. ${source.info.destVisible ? 'Cíle jsou v datech dostupné, tento algoritmus přesto využívá pouze směr před nástupem.' : 'Cíl před nástupem je skrytý (destVisible: false).'} Budoucí příjezdy se při plánování nepoužívají.`;
  $('lifts').innerHTML = ['dumb','smart'].map((kind,i) => `<article class="lift ${i ? 'smart' : ''}" id="${kind}Lift"><div class="lift-header"><h3 class="lift-title">${i ? 'Chytrý' : 'Hloupý'} výtah</h3><span class="algorithm">${i ? ALGORITHMS[result.algorithm] : 'FIFO · HTML'}</span></div><p class="lift-subtitle">${i ? 'Slučuje zastávky ve směru jízdy' : 'Obsluhuje cíle v pořadí nástupu'}</p><div class="building" style="height:${Math.max(320,l.floors * 32)}px"><div class="floors">${Array.from({length:l.floors},(_,f)=>`<div class="floor"><span class="floor-id">${f===0?'P':f}</span><span class="queue" id="${kind}Queue${f}"></span></div>`).join('')}</div><div class="shaft"><div class="car" id="${kind}Car"><span>0</span></div></div><div class="floor-scale">${'<div class="scale-item"></div>'.repeat(l.floors)}</div></div><div class="live-line"><span class="live-state" id="${kind}State">ČEKÁ</span><span id="${kind}Load">0 / ${l.capacity} osob</span></div><div class="lift-metrics"><div><small>Odbaveno</small><strong id="${kind}Served">0 <span>/ ${result.scenario.people.length}</span></strong></div><div><small>Čekajících</small><strong id="${kind}Waiting">0</strong></div><div><small>Průměr čekání</small><strong id="${kind}Wait">—</strong></div><div><small>Energie</small><strong id="${kind}Energy">0 <span>kWh</span></strong></div></div></article>`).join('');
  $('timeline').max = result.duration;
  $('endTime').textContent = ` / ${clock(result.duration)}`;
  $('timelineMiddle').textContent = `${result.scenario.people.length} stejných cestujících`;
  render();
}
function renderLift(kind, snapshot) {
  const car = $(`${kind}Car`), building = car.closest('.building');
  const height = building.clientHeight / source.lift.floors;
  car.style.height = `${Math.min(33,height - 5)}px`;
  car.style.transform = `translateY(-${snapshot.floor * height}px)`;
  car.classList.toggle('open', ['NÁSTUP','VÝSTUP','OTEVÍRÁ'].includes(snapshot.state));
  car.firstElementChild.textContent = `${snapshot.dir > 0 ? '↑' : snapshot.dir < 0 ? '↓' : ''} ${snapshot.cabin.length}`;
  car.setAttribute('aria-label', `${fmt(snapshot.floor)}. patro, ${snapshot.cabin.length} osob, ${snapshot.state}`);
  $(`${kind}State`).textContent = snapshot.state;
  $(`${kind}Load`).textContent = `${snapshot.cabin.length} / ${source.lift.capacity} osob`;
  $(`${kind}Served`).innerHTML = `${snapshot.served.length} <span>/ ${result.scenario.people.length}</span>`;
  $(`${kind}Waiting`).textContent = snapshot.waiting.length;
  $(`${kind}Wait`).innerHTML = `${fmt(snapshot.avgWait)} <span>s</span>`;
  $(`${kind}Energy`).innerHTML = `${fmt(snapshot.energy,3)} <span>kWh</span>`;
  for(let f=0;f<source.lift.floors;f++) {
    const count = snapshot.waiting.filter(p=>p.from===f).length;
    const queue = $(`${kind}Queue${f}`);
    // Cap the glyphs so large queues never overflow the shaft.
    if(queue.dataset.count !== String(count)) {
      queue.dataset.count = count;
      queue.innerHTML = '<i class="person" aria-hidden="true"></i>'.repeat(Math.min(count,3)) + (count ? `<span class="queue-count">${count}</span>` : '');
      queue.setAttribute('aria-label', `${count} čekajících v patře ${f}`);
    }
  }
}
function setMetric(id, value) {
  $(id).textContent = value === null ? '—' : `${fmt(value)} %`;
  $(id).classList.toggle('negative',value !== null && value < 0);
}
function renderChart() {
  const w=640,h=240,left=48,right=16,top=15,bottom=35;
  const points=[];
  const steps=Math.max(1,Math.min(100,Math.ceil(time/15)));
  for(let i=0;i<=steps;i++) { const t=time*i/steps; points.push([t,Lab.snapshot(result.dumb,t).energy,Lab.snapshot(result.smart,t).energy]); }
  const max=Math.max(.01,...points.flatMap(p=>p.slice(1))) * 1.12;
  const x=t=>left+t/result.duration*(w-left-right),y=v=>h-bottom-v/max*(h-top-bottom);
  let svg='';
  for(let i=0;i<=4;i++) {const v=max*i/4;svg+=`<line x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}" stroke="#e7ebe5"/><text x="${left-9}" y="${y(v)+3}" text-anchor="end" font-size="10" fill="#68716c" font-family="Consolas,monospace">${fmt(v,2)}</text>`;}
  for(let i=0;i<=4;i++){const t=result.duration*i/4;svg+=`<text x="${x(t)}" y="${h-10}" text-anchor="middle" font-size="10" fill="#68716c" font-family="Consolas,monospace">${clock(t)}</text>`;}
  for(const [column,color] of [[1,'#a46826'],[2,'#26724e']])svg+=`<path d="${points.map((p,i)=>`${i?'L':'M'}${x(p[0]).toFixed(2)},${y(p[column]).toFixed(2)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
  svg+=`<line x1="${x(time)}" y1="${top}" x2="${x(time)}" y2="${h-bottom}" stroke="#aebbac" stroke-dasharray="3 5"/>`;
  $('energyChart').innerHTML=svg;
}
function render() {
  const m=Lab.metrics(result,time),finished=time>=result.duration,complete=result.dumb.finished&&result.smart.finished;
  renderLift('dumb',m.dumb);renderLift('smart',m.smart);
  $('playBtn').textContent=playing?'Ⅱ Pozastavit':finished?'↺ Přehrát znovu':'▶ Spustit';
  $('status').textContent=finished?(complete?'Dokončeno':'Časový limit'):playing?'Simulace běží':time>0?'Pozastaveno':'Připraveno';
  $('clock').textContent=clock(time);$('timeline').value=time;
  const pending=result.scenario.people.filter(p=>p.t>time).length;
  $('phase').textContent=finished?'Konec porovnání':m.dumb.arrived.length===0?'Čekání na první cestující':pending?`Příchozí: ${m.dumb.arrived.length} / ${result.scenario.people.length}`:'Všichni dorazili · doobsluhování';
  $('resultsNote').textContent=`${finished?'Konečný':'Průběžný'} výsledek v čase ${clock(time)}. Časové úspory: ${m.matched} stejných osob odbavených oběma výtahy. ${finished&&!complete?'POZOR: dosažen maxTime; část osob zůstala neobsloužena. ':''}${finished&&complete?'Oba výtahy obsloužily celé zvolené zadání.':'Před dokončením nejde o výsledek za všechny cestující.'}`;
  $('upgradeNote').hidden = !(finished && complete && reference.smart.finished && result.algorithm !== 'look');
  if (!$('upgradeNote').hidden) {
    const end = Math.max(result.duration,reference.duration);
    const old = Lab.snapshot(reference.smart,end), improved = Lab.snapshot(result.smart,end);
    const reduction = (a,b) => a > 0 ? fmt((a-b)/a*100)+' %' : '—';
    $('upgradeNote').classList.toggle('tradeoff',improved.maxWait > old.maxWait);
    $('upgradeNote').textContent = ALGORITHMS[result.algorithm]+' proti '+ALGORITHMS[reference.algorithm]+': zkrácení průměrné cesty '+reduction(old.avgTotal,improved.avgTotal)+', úspora energie '+reduction(old.energy,improved.energy)+'. Nejdelší čekání: '+fmt(old.maxWait)+' → '+fmt(improved.maxWait)+' s. Energie za společný interval '+clock(end)+'. Záporné procento znamená zhoršení. Hlavní karty níže porovnávají s hloupým FIFO.';
  }
  setMetric('totalSaving',m.totalPct);setMetric('waitSaving',m.waitPct);setMetric('energySaving',time>0?m.energyPct:null);
  $('totalNote').textContent=m.totalDiff===null?'Čekáme na první společně odbavené osoby.':`${m.totalDiff>=0?'Úspora':'Prodloužení'} ${fmt(Math.abs(m.totalDiff))} s na cestujícího.`;
  $('waitNote').textContent=m.waitDiff===null?'Čekáme na první společně odbavené osoby.':`${m.waitDiff>=0?'Úspora':'Prodloužení'} ${fmt(Math.abs(m.waitDiff))} s na cestujícího.`;
  const energyDiff=m.dumb.energy-m.smart.energy;
  $('energyNote').textContent=time>0?`${energyDiff>=0?'Ušetřeno':'Navíc'} ${fmt(Math.abs(energyDiff),3)} kWh za stejný časový interval.`:'Stejný energetický model pro oba výtahy.';
  const rows=[
    ['Rozvezeno',s=>`${s.served.length} z ${result.scenario.people.length}`],
    ['Hotovo v čase',s=>s.completedAt===null?'—':`${clock(s.completedAt)} (${fmt(s.completedAt)} s)`],
    ['Průměrné čekání',s=>`${fmt(s.avgWait)} s`],
    ['Průměrná jízda',s=>`${fmt(s.avgRide)} s`],
    ['Průměrně celkem',s=>`<strong>${fmt(s.avgTotal)} s</strong>`],
    ['Nejdelší čekání',s=>`${fmt(s.maxWait)} s`],
    ['Nejdelší celkem',s=>`${fmt(s.maxTotal)} s`],
    ['Zastavení (otevření dveří)',s=>fmt(s.stops,0)],
    ['Ujetá dráha',s=>`${fmt(s.distance,0)} m`],
    [`Rozvezeno do ${fmt(result.scenario.evaluation.horizon,0)} s`,s=>fmt(s.servedInHorizon,0)],
    ['Čekající / v kabině',s=>`${s.waiting.length} / ${s.cabin.length}`],
    ['Čekání — 95. percentil',s=>`${fmt(s.p95Wait)} s`],
    ['Z toho bez cestujících',s=>`${fmt(s.emptyDistance,0)} m`],
    ['Rozjezdy',s=>fmt(s.starts,0)],
    ['Modelová spotřeba',s=>`${fmt(s.energy,3)} kWh`]
  ];
  $('metricsTable').innerHTML=rows.map(([name,fn])=>`<tr><td>${name}</td><td>${fn(m.dumb)}</td><td>${fn(m.smart)}</td></tr>`).join('');
  renderChart();
}
$('playBtn').addEventListener('click',()=>{if(time>=result.duration)time=0;playing=!playing;lastFrame=performance.now();render();});
$('resetBtn').addEventListener('click',()=>{time=0;playing=false;render();});
$('finishBtn').addEventListener('click',()=>{time=result.duration;playing=false;render();$('results').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});
$('timeline').addEventListener('input',()=>{time=Number($('timeline').value);playing=false;render();});
$('scope').addEventListener('change',()=>{setup();});
$('algorithmSelect').addEventListener('change',()=>{setup();});
$('importBtn').addEventListener('click',()=>$('fileInput').click());
$('fileInput').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  const button=$('importBtn');button.disabled=true;button.textContent='Načítám zadání…';
  try{if(file.size>3000000)throw Error('Soubor smí mít nejvýše 3 MB.');const next=Lab.validate(JSON.parse(await file.text()));setup(next);$('importError').hidden=true;}
  catch(error){$('importError').textContent=`Soubor se nepodařilo načíst: ${error.message}`;$('importError').hidden=false;}
  finally{button.disabled=false;button.textContent='Nahrát vlastní JSON ↑';event.target.value='';}
});
$('restoreBtn').addEventListener('click',()=>{$('scope').value='all';setup(Lab.validate(globalThis.DEFAULT_SCENARIO));$('importError').hidden=true;});
$('exportBtn').addEventListener('click',()=>{
  const m=Lab.metrics(result,time);
  const summary=s=>({served:s.served.length,completedAtSeconds:s.completedAt,waiting:s.waiting.length,onboard:s.cabin.length,energyKWh:s.energy,avgWaitingSeconds:s.avgWait,avgRideSeconds:s.avgRide,avgJourneySeconds:s.avgTotal,maxWaitingSeconds:s.maxWait,maxJourneySeconds:s.maxTotal,p95WaitingSeconds:s.p95Wait,servedInHorizon:s.servedInHorizon,horizonSeconds:result.scenario.evaluation.horizon,distanceMetres:s.distance,emptyDistanceMetres:s.emptyDistance,starts:s.starts,stops:s.stops});
  const data={format:'vytah-lab-vysledky',version:2,baseline:'Základní výtah z vytah.html (rozhodni + nastup)',physics:{source:'vytah.html',stepSeconds:0.05},scenario:source.name,mode:result.mode,algorithm:{eco:'ECO v3',smart:'LOOK+ v2',look:'LOOK v1'}[result.algorithm],simulationTime:time,duration:result.duration,complete:time>=result.duration&&result.dumb.finished&&result.smart.finished,energyAssumptions:Lab.ENERGY,input:result.scenario,pairedPeople:m.matched,journeyReductionPct:m.totalPct,waitReductionPct:m.waitPct,energyReductionPct:m.energyPct,fifo:summary(m.dumb),smart:summary(m.smart),passengers:{fifo:result.dumb.people.map(p=>({...p,board:p.board<=time?p.board:null,done:p.done<=time?p.done:null})),smart:result.smart.people.map(p=>({...p,board:p.board<=time?p.board:null,done:p.done<=time?p.done:null}))}};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='vytah-lab-vysledky.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
});
function tick(now){if(playing){time=Math.min(result.duration,time+Math.min(.25,(now-lastFrame)/1000)*Number($('speed').value));if(time>=result.duration)playing=false;if(now-lastPaint>80||!playing){render();lastPaint=now;}}lastFrame=now;requestAnimationFrame(tick);}
window.addEventListener('resize',()=>render());
setup();requestAnimationFrame(tick);
