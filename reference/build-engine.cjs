// Adapt the supplied physics without changing its stepping or passenger timing.
const fs = require('node:fs');
const html = fs.readFileSync(__dirname + '/vytah.html', 'utf8');
let core = html.slice(html.indexOf('  var DT = 0.05'), html.indexOf('  function run(scn)'));
let run = html.slice(html.indexOf('  function runInner(scn, logs, clock)'), html.indexOf('\n  /* ---', html.indexOf('  function runInner(scn, logs, clock)')));
run = run.replace('function runInner(scn, logs, clock) {', `function run(scn, policy, observe) {
    const rozhodni = policy.decide, nastup = policy.board, zacatek = policy.start;
    const logs = [], clock = {t: 0};`);
run = run.replace("      if (state === 'moving') move();", `      const activity = state, activeTask = stop && stop.task, activeLoad = onboard.length;
      if (state === 'moving') move();`);
run = run.replace('      if (tick % REC === 0) { fy.push(y); fdoor.push(doorFrac()); }', `      if (observe) observe({t: now, y, v, state, task: stop && stop.task, activity, activeTask, activeLoad, load: onboard.length, stops, dist});
      if (tick % REC === 0) { fy.push(y); fdoor.push(doorFrac()); }`);
fs.writeFileSync(__dirname + '/../tick-engine.js', `/* Physics adapted from reference/vytah.html; see reference/build-engine.cjs.
 * Original 0.05 s integration and door/boarding event order are preserved.
 * The observer only records the run; it cannot change simulation state. */
(function(root){
'use strict';
${core}\n${run}\nconst api={run,DT};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.ElevatorPhysics=api;
})(globalThis);\n`);
