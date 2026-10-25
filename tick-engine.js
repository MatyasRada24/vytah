/* Physics adapted from reference/vytah.html; see reference/build-engine.cjs.
 * Original 0.05 s integration and door/boarding event order are preserved.
 * The observer only records the run; it cannot change simulation state. */
(function(root){
'use strict';
  var DT = 0.05, REC = 2, BRAKE_TOL = 0.1, WALL_LIMIT_MS = 20000;

  function sgn(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function studentError(phase, e, custom) {
    var err = new Error(e && e.message ? e.message : String(e));
    err.student = true; err.phase = phase; err.errName = e && e.name; err.line = null;
    if (!custom && e && e.stack) {
      var m = /:(\d+):\d+/.exec(String(e.stack).split('\n').filter(function (l) { return /:\d+:\d+/.test(l); })[0] || '');
      if (m) err.line = +m[1];
    }
    return err;
  }


  function run(scn, policy, observe) {
    const rozhodni = policy.decide, nastup = policy.board, zacatek = policy.start;
    const logs = [], clock = {t: 0};
    var L = scn.lift, B = scn.boarding, F = L.floors, H = L.floorHeight, CAP = L.capacity;
    var VMAX = L.speed, ACC = L.acceleration, destVisible = !!scn.info.destVisible;
    var maxTime = scn.evaluation.maxTime, horizon = scn.evaluation.horizon;

    if (typeof rozhodni !== 'function') {
      return { ok: false, error: { phase: 'syntax', message: 'V bloku algoritmus chybí funkce rozhodni(stav).', line: null, time: 0 }, log: logs };
    }
    var fnNastup = typeof nastup === 'function' ? nastup : null;

    var P = scn.people.map(function (p) {
      return { id: p.id, t: p.t, from: p.from, to: p.to, slow: p.slow || 1, dir: sgn(p.to - p.from), tBoard: null, tExit: null, vw: null, vc: null };
    });
    var N = P.length, nextArr = 0, delivered = 0;
    var waiting = [], onboard = [];
    var y = L.startFloor * H, v = 0, state = 'idle', target = null, stop = null;
    var dirLast = 1, stops = 0, dist = 0;
    var fy = [y], fdoor = [0];
    var tick = 0;

    function doorFrac() {
      if (!stop) return 0;
      if (stop.task === 'open') return clamp(1 - stop.timer / L.doorOpen, 0, 1);
      if (stop.task === 'close') return clamp(stop.timer / L.doorClose, 0, 1);
      return 1;
    }
    function nearestAhead() {
      var d = sgn(v) || sgn(target * H - y) || 1;
      var brake = Math.max(0, v * v / (2 * ACC) - BRAKE_TOL);
      var f = d > 0 ? Math.ceil((y + brake) / H - 1e-6) : Math.floor((y - brake) / H + 1e-6);
      return clamp(f, 0, F - 1);
    }
    function makeStav() {
      var moving = state === 'moving', patro = clamp(Math.round(y / H), 0, F - 1);
      return Object.freeze({
        cas: tick * DT, patro: patro, poloha: y, rychlost: v,
        smer: moving ? (sgn(v) || sgn(target * H - y)) : 0,
        posledniSmer: dirLast, stoji: !moving, cil: moving ? target : null,
        nejblizsiZastaveni: moving ? nearestAhead() : patro,
        kapacita: CAP, volno: CAP - onboard.length, pocetPater: F, vyskaPatra: H,
        vKabine: Object.freeze(onboard.map(function (p) { return p.vc; })),
        cekajici: Object.freeze(waiting.map(function (p) { return p.vw; })),
      });
    }
    function decide() {
      var r;
      try { r = rozhodni(makeStav()); } catch (e) { throw studentError('rozhodni', e); }
      if (r === null || r === undefined) return null;
      if (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r >= F) {
        throw studentError('rozhodni', new Error('Funkce rozhodni() vrátila ' + (typeof r === 'object' ? 'objekt' : String(r)) + ', ale musí vrátit celé číslo patra od 0 do ' + (F - 1) + ' (nebo null).'), true);
      }
      return r;
    }
    function anythingAt(f) {
      var i;
      for (i = 0; i < onboard.length; i++) if (onboard[i].to === f) return true;
      for (i = 0; i < waiting.length; i++) if (waiting[i].from === f) return true;
      return false;
    }
    function beginStop() { state = 'stop'; stops++; stop = { task: 'open', timer: L.doorOpen, p: null }; v = 0; }
    function nextTask() {
      var f = clamp(Math.round(y / H), 0, F - 1), i;
      for (i = 0; i < onboard.length; i++) if (onboard[i].to === f) { stop.task = 'out'; stop.p = onboard[i]; stop.timer = B.out * onboard[i].slow; return; }
      if (onboard.length < CAP) {
        var stav = fnNastup ? makeStav() : null;
        for (i = 0; i < waiting.length; i++) {
          var p = waiting[i];
          if (p.from !== f) continue;
          var ok = true;
          if (fnNastup) { try { ok = fnNastup(stav, p.vw); } catch (e) { throw studentError('nastup', e); } }
          if (ok) { stop.task = 'in'; stop.p = p; stop.timer = B.in * p.slow; return; }
        }
      }
      stop.task = 'close'; stop.p = null; stop.timer = L.doorClose;
    }
    function doStop() {
      stop.timer -= DT;
      if (stop.timer > 1e-9) return;
      var p = stop.p, now = tick * DT;
      if (stop.task === 'out') {
        onboard.splice(onboard.indexOf(p), 1); p.tExit = now; delivered++;
      } else if (stop.task === 'in') {
        waiting.splice(waiting.indexOf(p), 1); p.tBoard = now; onboard.push(p);
        p.vc = Object.freeze({ id: p.id, odkud: p.from, cil: p.to, od: p.t, nastoupil: now });
      } else if (stop.task === 'close') {
        state = 'idle'; stop = null; return;
      }
      nextTask();
    }
    function move() {
      var ty = target * H, d = ty - y, ad = Math.abs(d), s = d >= 0 ? 1 : -1;
      var vd = Math.min(VMAX, Math.sqrt(2 * ACC * ad)) * s;
      v += clamp(vd - v, -ACC * DT, ACC * DT);
      if (v !== 0) dirLast = sgn(v);
      var yn = y + v * DT;
      if ((ty - yn) * s <= 1e-4 || (ad < 0.03 && Math.abs(v) < 0.3)) {
        dist += ad; y = ty; v = 0; target = null; beginStop();
      } else { dist += Math.abs(v * DT); y = yn; }
    }
    function step() {
      tick++;
      var now = tick * DT;
      clock.t = now;
      while (nextArr < N && P[nextArr].t <= now + 1e-9) {
        var p = P[nextArr++];
        var vw = { id: p.id, patro: p.from, smer: p.dir, od: p.t };
        if (destVisible) vw.cil = p.to;
        p.vw = Object.freeze(vw);
        waiting.push(p);
      }
      if (state === 'idle') {
        var w = decide();
        if (w !== null) {
          var f = clamp(Math.round(y / H), 0, F - 1);
          if (w === f) { if (anythingAt(f)) beginStop(); }
          else { target = w; state = 'moving'; }
        }
      } else if (state === 'moving') {
        var w2 = decide();
        if (w2 !== null) {
          var d = sgn(v) || sgn(target * H - y) || 1, near = nearestAhead();
          target = (w2 - near) * d >= 0 ? w2 : near;
        }
      }
      const activity = state, activeTask = stop && stop.task, activeLoad = onboard.length;
      if (state === 'moving') move();
      else if (state === 'stop') doStop();
      if (observe) observe({t: now, y, v, state, task: stop && stop.task, activity, activeTask, activeLoad, load: onboard.length, stops, dist});
      if (tick % REC === 0) { fy.push(y); fdoor.push(doorFrac()); }
    }

    var wallStart = Date.now();
    try {
      if (typeof zacatek === 'function') { try { zacatek(makeStav()); } catch (e) { throw studentError('zacatek', e); } }
      while (delivered < N && tick * DT < maxTime) {
        step();
        if ((tick & 1023) === 0) {
          if (Date.now() - wallStart > WALL_LIMIT_MS) throw Object.assign(new Error('Simulace trvá příliš dlouho (více než ' + WALL_LIMIT_MS / 1000 + ' s počítání). Je tvůj algoritmus příliš pomalý?'), { student: true, phase: 'timeout', line: null });
        }
      }
    } catch (e) {
      if (e.student) return { ok: false, error: { phase: e.phase, message: e.message, line: e.line, time: tick * DT }, log: logs };
      throw e;
    }
    if (tick % REC !== 0) { fy.push(y); fdoor.push(doorFrac()); }

    var sw = 0, sr = 0, st = 0, nb = 0, mw = 0, mt = 0, tAll = 0, inH = 0, i;
    for (i = 0; i < N; i++) {
      var q = P[i];
      if (q.tBoard !== null) { var wt = q.tBoard - q.t; nb++; sw += wt; if (wt > mw) mw = wt; }
      if (q.tExit !== null) {
        var tot = q.tExit - q.t; st += tot; sr += q.tExit - q.tBoard;
        if (tot > mt) mt = tot; if (q.tExit > tAll) tAll = q.tExit; if (q.tExit <= horizon) inH++;
      }
    }
    var finished = delivered === N;
    return {
      ok: true, finished: finished, endTime: tick * DT,
      metrics: {
        total: N, delivered: delivered, finished: finished,
        tAll: finished ? tAll : null,
        avgTotal: delivered ? st / delivered : null, avgWait: nb ? sw / nb : null, avgRide: delivered ? sr / delivered : null,
        maxWait: mw, maxTotal: mt, stops: stops, dist: dist, servedInHorizon: inH,
      },
      persons: P.map(function (q) { return { id: q.id, t: q.t, from: q.from, to: q.to, slow: q.slow, tBoard: q.tBoard, tExit: q.tExit }; }),
      frames: { dt: DT * REC, y: fy, door: fdoor },
      log: logs,
    };
  }

const api={run,DT};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.ElevatorPhysics=api;
})(globalThis);
