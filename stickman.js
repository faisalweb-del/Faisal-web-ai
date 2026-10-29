/* Stickman pajangan untuk Partical Message: 6 karakter garis yang hidup sendiri di bawah daftar chat.
   Dimuat hanya kalau "Show stickman" aktif. Tidak memakai library. API: PMStick.start(elemen), PMStick.stop(). */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var COLORS = ['#29b6f6', '#fb8c1a', '#fdd835', '#2a2f3a', '#5ec91e', '#e53935'];
  var S = { on: false, host: null, svg: null, W: 360, H: 210, b: 1, floor: 204, actors: [], gen: 0, clock: 0, waiters: [], areaKey: '', floorFn: null, pend: 0, bubs: [], props: [], raf: 0, tm: 0, last: 0, bench: null, tv: null, ball: null, cast: [], parts: [], pops: [], projs: [], holes: [], rfx: [], blocks: [], lad: null, chest: null, cre: null, rowsFn: null, lifting: null, undo: 0, ghit: null, flash: null, notes: [], gfront: null, order: '' };
  var DEF = { lean: 0.03, tilt: 0, aLu: 0.1, aLf: 0.2, aRu: 0.1, aRf: 0.2, tLt: 0.05, tLs: 0.05, tRt: 0.05, tRs: 0.05, dy: 0, rot: 0, dx: 0 };
  var SIT = { tLt: 1.5, tLs: 0.12, tRt: 1.5, tRs: 0.12 };
  var sin = Math.sin, cos = Math.cos, abs = Math.abs;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function mk(tag, at, par) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); if (par) par.appendChild(e); return e; }
  function mix(o, p) { var r = {}, k; for (k in o) r[k] = o[k]; for (k in p) r[k] = p[k]; return r; }
  function tri(u) { u = ((u % 2) + 2) % 2; return (u < 1 ? u : 2 - u) * 2 - 1; }

  /* ---------- jam virtual dan tidur ---------- */
  function sleep(sec) { return new Promise(function (res, rej) { S.waiters.push({ t: S.clock + sec, res: res, rej: rej, g: S.gen }); }); }

  /* ---------- aktor ---------- */
  function Actor(i, layer) {
    this.i = i; this.col = COLORS[i]; this.x = -80; this.face = 1; this.fy = rnd(0, 4); this.ph = rnd(0, 6); this.walk = rnd(0, 6);
    this.rise = 1; this.sc = 1; this.hold = ''; this.act = null; this.k = 14; this.v = mix(DEF, {}); for (var kk in this.v) this.v[kk] = 0; this.st = 0; this.held = false; this.liftY = 0; this.lt = null; this.team = 0;
    this.p = mix(DEF, { rise: 1, sc: 1 }); this.tg = mix(DEF, {});
    this.g = mk('g', {}, layer);
    this.path = mk('path', { fill: 'none', stroke: this.col, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.g);
    this.head = mk('circle', { fill: 'none', stroke: this.col }, this.g);
    this.tool = mk('path', { fill: 'none', stroke: '#8a6a3c', 'stroke-width': 2.6, 'stroke-linecap': 'round', visibility: 'hidden' }, this.g); this.tool2 = mk('path', { fill: 'none', stroke: '#aab3c2', 'stroke-width': 3.4, 'stroke-linecap': 'round', visibility: 'hidden' }, this.g);
    this.hit = null;
    this.prop = mk('rect', { fill: '#3b4252', stroke: '#cfd6e6', 'stroke-width': 1, rx: 1.5, visibility: 'hidden' }, this.g);
    if (i === 3) this.g.setAttribute('style', 'filter: drop-shadow(0 0 1.2px rgba(255,255,255,.75))');
  }
  Actor.prototype.set = function (o) { var t = {}, k; for (k in DEF) t[k] = o && o[k] !== undefined ? o[k] : DEF[k]; this.tg = t; };
  Actor.prototype.run = function (fn, dur) {
    var a = this, g = S.gen; if (a.act) a.act.res();
    return new Promise(function (res) { a.act = { fn: fn, t: 0, dur: dur, res: function () { if (g === S.gen) res(); } }; });
  };
  Actor.prototype.cancel = function () { if (this.act) { var r = this.act.res; this.act = null; r(); } };
  Actor.prototype.drop = function () { this.act = null; };
  Actor.prototype.update = function (dt) {
    var a = this;
    if (a.held) { var s0 = S.b * a.p.sc, nx = a.x + (a.px - a.x) * (1 - Math.exp(-18 * dt)); a.hv = (nx - a.x) / Math.max(dt, 0.001); a.x = nx; a.liftY += (Math.max(0, S.floor - a.py - 43 * s0) - a.liftY) * (1 - Math.exp(-16 * dt)); a.act = null; }
    else if (a.act) { var ac = a.act; ac.t += dt; var r = ac.fn(ac.t, dt, a); if (r === true || (ac.dur != null && ac.t >= ac.dur)) { if (a.act === ac) a.act = null; ac.res(); } }
    else if (!a.held) { a.k = 12; a.set(standPose(S.clock, a)); }
    if (a.st > 0) { a.st -= dt; var u = 1 - Math.max(0, a.st) / 0.85, hop = sin(Math.min(1, u * 1.6) * 3.14159); a.face = 0; a.tg.aLu = a.tg.aRu = 2.55; a.tg.aLf = a.tg.aRf = 2.85; a.tg.dy = -9 * hop; a.tg.lean = -0.18; a.tg.tLt = a.tg.tRt = 0.28; a.tg.tLs = a.tg.tRs = 0.1; a.k = 22; }
    if (a.held) { var hw = S.clock * 4.2 + a.ph, sv = a.hv || 0; a.k = 9; a.face = 0; a.tg = mix(DEF, { aLu: 2.7 + 0.28 * sin(hw * 1.3), aLf: 2.85 + 0.3 * sin(hw * 1.3 + 1), aRu: 2.7 + 0.28 * sin(hw * 1.1 + 2), aRf: 2.85 + 0.3 * sin(hw + 3), tLt: 0.28 * sin(hw), tRt: -0.28 * sin(hw), tLs: 0.14 + 0.24 * sin(hw + 1), tRs: 0.14 - 0.24 * sin(hw + 1), lean: 0, rot: Math.max(-0.5, Math.min(0.5, sv * 0.0012)) + 0.09 * sin(hw * 0.8) }); }
    var p = a.p, t = a.tg, key, w = a.k, z = w >= 18 ? 1 : 0.62, h = dt / 2, v = a.v, n2;
    for (n2 = 0; n2 < 2; n2++) for (key in DEF) { v[key] += (w * w * (t[key] - p[key]) - 2 * z * w * v[key]) * h; p[key] += v[key] * h; }
    p.rise += (a.rise - p.rise) * (1 - Math.exp(-4 * dt));
    p.sc += (a.sc - p.sc) * (1 - Math.exp(-2.4 * dt));
  };
  Actor.prototype.draw = function () {
    var a = this, p = a.p, s = S.b * p.sc, f = a.face || 1, front = a.face === 0;
    var T = 26 * s, N = 4 * s, HR = 8 * s, UA = 13 * s, FA = 12 * s, TH = 15 * s, SH = 15 * s;
    function pt(x, y, ang, len, side) { var sx = front ? side : f; return [x + sx * sin(ang) * len, y + cos(ang) * len]; }
    var ext = Math.max(TH * cos(p.tLt) + SH * cos(p.tLs), TH * cos(p.tRt) + SH * cos(p.tRs));
    var hipY = S.floor - a.fy - ext + p.dy * S.b - a.liftY + (1 - p.rise) * 100 * s, hx = a.x + p.dx * S.b;
    var lx = front ? 0 : f * sin(p.lean);
    var neckX = hx + lx * T, neckY = hipY - cos(p.lean) * T;
    var shX = hx + lx * T * 0.88, shY = hipY - cos(p.lean) * T * 0.88;
    var hdX = neckX + (front ? 0 : f * sin(p.lean) * (N + HR)) + p.tilt * s, hdY = neckY - (N + HR);
    var eL = pt(shX, shY, p.aLu, UA, -1), hL = pt(eL[0], eL[1], p.aLf, FA, -1);
    var eR = pt(shX, shY, p.aRu, UA, 1), hR = pt(eR[0], eR[1], p.aRf, FA, 1);
    var kL = pt(hx, hipY, p.tLt, TH, -1), fL = pt(kL[0], kL[1], p.tLs, SH, -1);
    var kR = pt(hx, hipY, p.tRt, TH, 1), fR = pt(kR[0], kR[1], p.tRs, SH, 1);
    function q(v) { return v[0].toFixed(1) + ' ' + v[1].toFixed(1); }
    a.path.setAttribute('d', 'M' + q(fL) + 'L' + q(kL) + 'L' + hx.toFixed(1) + ' ' + hipY.toFixed(1) + 'L' + q(kR) + 'L' + q(fR) +
      'M' + hx.toFixed(1) + ' ' + hipY.toFixed(1) + 'L' + neckX.toFixed(1) + ' ' + neckY.toFixed(1) +
      'M' + q(hL) + 'L' + q(eL) + 'L' + shX.toFixed(1) + ' ' + shY.toFixed(1) + 'L' + q(eR) + 'L' + q(hR));
    a.path.setAttribute('stroke-width', (3.9 * Math.sqrt(s)).toFixed(2));
    a.head.setAttribute('cx', hdX.toFixed(1)); a.head.setAttribute('cy', hdY.toFixed(1)); a.head.setAttribute('r', HR.toFixed(1)); a.head.setAttribute('stroke-width', (3.6 * Math.sqrt(s)).toFixed(2));
    a.hand = hR; a.handL = hL; a.hipY = hipY;
    if (a.hold === 'phone') { a.prop.setAttribute('visibility', 'visible'); a.prop.setAttribute('x', (hR[0] - 3.5 * s).toFixed(1)); a.prop.setAttribute('y', (hR[1] - 8 * s).toFixed(1)); a.prop.setAttribute('width', (7 * s).toFixed(1)); a.prop.setAttribute('height', (11 * s).toFixed(1)); }
    else if (a.hold === 'pad') { a.prop.setAttribute('visibility', 'visible'); var mx = (hL[0] + hR[0]) / 2, my = (hL[1] + hR[1]) / 2; a.prop.setAttribute('x', (mx - 6 * s).toFixed(1)); a.prop.setAttribute('y', (my - 3 * s).toFixed(1)); a.prop.setAttribute('width', (12 * s).toFixed(1)); a.prop.setAttribute('height', (6 * s).toFixed(1)); }
    else if (a.hold === 'block') { a.prop.setAttribute('visibility', 'visible'); a.prop.setAttribute('fill', a.bkc || '#8d9199'); var mx2 = (hL[0] + hR[0]) / 2, my2 = (hL[1] + hR[1]) / 2; a.prop.setAttribute('x', (mx2 - 6.5 * s).toFixed(1)); a.prop.setAttribute('y', (my2 - 6.5 * s).toFixed(1)); a.prop.setAttribute('width', (13 * s).toFixed(1)); a.prop.setAttribute('height', (13 * s).toFixed(1)); }
    else a.prop.setAttribute('visibility', 'hidden');
    if (a.hold !== 'block' && a.hold !== 'pad' && a.hold !== 'phone') a.prop.setAttribute('fill', '#3b4252');
    if (a.hold === 'pick') { var dx = hR[0] - eR[0], dy2 = hR[1] - eR[1], dl = Math.sqrt(dx * dx + dy2 * dy2) || 1; dx /= dl; dy2 /= dl; var ex = hR[0] + dx * 15 * s, ey = hR[1] + dy2 * 15 * s, bx0 = hR[0] - dx * 5 * s, by0 = hR[1] - dy2 * 5 * s; a.tool.setAttribute('d', 'M' + bx0.toFixed(1) + ' ' + by0.toFixed(1) + 'L' + ex.toFixed(1) + ' ' + ey.toFixed(1)); a.tool2.setAttribute('d', 'M' + (ex - dy2 * 7 * s).toFixed(1) + ' ' + (ey + dx * 7 * s).toFixed(1) + 'L' + (ex + dy2 * 7 * s).toFixed(1) + ' ' + (ey - dx * 7 * s).toFixed(1)); a.tool.setAttribute('visibility', 'visible'); a.tool2.setAttribute('visibility', 'visible'); }
    else { a.tool.setAttribute('visibility', 'hidden'); a.tool2.setAttribute('visibility', 'hidden'); }
    var vis = a.x > -70 && a.x < S.W + 70;
    a.g.setAttribute('visibility', vis ? 'visible' : 'hidden');
    var rt = p.rot; a.g.setAttribute('transform', abs(rt) > 0.002 ? 'rotate(' + (rt * 57.2958).toFixed(1) + ' ' + hx.toFixed(1) + ' ' + (hipY - 12 * s).toFixed(1) + ')' : '');
    a.hipX = hx; a.top = hdY - HR; a.sH = s;
    if (a.hit) { var on = vis && a.rise > 0.6 && !S.pend && a.x > 6 && a.x < S.W - 6, hw2 = 17 * s; if (a.held) on = true; a.hit.setAttribute('x', (hx - hw2).toFixed(1)); a.hit.setAttribute('y', (hdY - HR - 6).toFixed(1)); a.hit.setAttribute('width', (hw2 * 2).toFixed(1)); a.hit.setAttribute('height', Math.max(10, S.floor - (hdY - HR - 6) + 4).toFixed(1)); a.hit.style.display = on ? '' : 'none'; }
  };

  /* ---------- pose dasar ---------- */
  function standPose(t, a) { var b = sin(t * 1.7 + a.ph) * 0.025; return { lean: 0.03, aLu: 0.12 + b, aLf: 0.2, aRu: 0.12 - b, aRf: 0.2, tLt: 0.06, tLs: 0.06, tRt: 0.06, tRs: 0.06 }; }
  function walkPose(ph, sp, extra) { // jalan santai dan lari ala animasi garis: lutut menekuk, tangan mengayun, badan condong
    var s0 = sin(ph), c = cos(ph), run = sp >= 95, o;
    if (!run) {
      var amp = sp < 40 ? 0.38 : 0.52;
      o = { lean: 0.05 + 0.02 * abs(s0), tilt: 1.3 * s0, dy: -1.4 * abs(c) + 1,
        tLt: amp * s0, tRt: -amp * s0, tLs: amp * s0 - 0.8 * Math.max(0, c) - 0.06, tRs: -amp * s0 - 0.8 * Math.max(0, -c) - 0.06,
        aLu: -amp * 0.85 * s0, aRu: amp * 0.85 * s0, aLf: -amp * 0.85 * s0 + 0.35 + 0.25 * Math.max(0, -s0), aRf: amp * 0.85 * s0 + 0.35 + 0.25 * Math.max(0, s0) };
    } else {
      var A = 1.05;
      o = { lean: 0.34, tilt: 3 + 1.5 * s0, dy: -7 * abs(c) - 1,
        tLt: A * s0 + 0.1, tRt: -A * s0 + 0.1, tLs: A * s0 - 1.9 * Math.max(0, c) - 0.25, tRs: -A * s0 - 1.9 * Math.max(0, -c) - 0.25,
        aLu: -1.15 * s0, aRu: 1.15 * s0, aLf: -1.15 * s0 + 1.35, aRf: 1.15 * s0 + 1.35 };
    }
    return mix(o, extra || {});
  }
  function wavePose(t, a, hand) {
    var w = sin(t * 9), o = { lean: 0.02, tilt: sin(t * 2) * 1.5, aLu: 0.15, aLf: 0.25, tLt: 0.07, tRt: 0.07 };
    if (hand === 'L') { o.aLu = 2.6 + 0.08 * w; o.aLf = 2.6 + 0.7 * w; o.aRu = 0.15; o.aRf = 0.25; } else { o.aRu = 2.6 + 0.08 * w; o.aRf = 2.6 + 0.7 * w; }
    return o;
  }

  /* ---------- aksi gerak ---------- */
  function walkTo(a, x, spd) {
    spd = (spd || 55) * S.b; a.hold = a.hold === 'pad' ? '' : a.hold;
    return a.run(function (t, dt) {
      var d = x - a.x, st = spd * dt; a.k = spd / S.b >= 95 ? 27 : 21;
      if (a.st > 0) return;
      if (abs(d) <= st) { a.x = x; return true; }
      a.face = d > 0 ? 1 : -1; a.x += (d > 0 ? 1 : -1) * st; a.walk += st * (spd / S.b >= 95 ? 0.056 : 0.095) / (S.b * a.p.sc);
      a.set(walkPose(a.walk, spd / S.b));
    });
  }
  function enter(a, side, x, spd) { a.rise = 1; a.p.rise = 1; a.sc = 1; a.p.sc = 1; a.x = side < 0 ? -45 : S.W + 45; a.face = side < 0 ? 1 : -1; return walkTo(a, x, spd); }
  function leave(a, spd) { var side = a.x < S.W / 2 ? -1 : 1; a.hold = ''; return walkTo(a, side < 0 ? -55 : S.W + 55, spd || 60).then(function () { a.face = 1; }); }
  function idle(a, sec, o) { return a.run(function (t) { a.k = 10; if (o && o.face !== undefined) a.face = o.face; a.set(o && o.fn ? o.fn(t, a) : standPose(t, a)); }, sec); }
  function waveFor(a, sec, hand) { return a.run(function (t) { a.face = 0; a.k = 14; a.set(wavePose(t + a.ph, a, hand || (a.ph > 3 ? 'L' : 'R'))); }, sec); }
  function look(a, sec) { return a.run(function (t) { a.k = 8; a.face = sin(t * 1.3 + a.ph) > 0.1 ? 1 : (sin(t * 1.3 + a.ph) < -0.1 ? -1 : 0); a.set(standPose(t, a)); }, sec); }
  function marchInPlace(a, sec) { return a.run(function (t) { a.face = 0; a.k = 14; a.walk += 5 * 0.016; var s2 = sin(t * 7); a.set({ lean: 0, dy: -abs(s2) * 2.5, tLt: 0.1 + 0.2 * Math.max(0, s2), tRt: 0.1 + 0.2 * Math.max(0, -s2), aLu: 0.3 + 0.2 * s2, aRu: 0.3 - 0.2 * s2, aLf: 0.5, aRf: 0.5 }); }, sec); }
  function allOf(list, fn) { return Promise.all(list.map(fn)); }
  function leaveAll(list) { return allOf(list, function (a, i) { return sleep(i * 0.4).then(function () { return leave(a, rnd(50, 80)); }); }); }
  function clearProps() {
    S.bench.a = 0; S.bench.ta = 0; S.tv.a = 0; S.tv.ta = 0; S.sofa.a = 0; S.sofa.ta = 0; S.portal.a = 0; S.portal.ta = 0; S.ball.on = false; S.ball.fly = null;
    S.bubs.forEach(function (q) { q.g.remove(); }); S.bubs = [];
    S.parts.forEach(function (q) { q.el.remove(); }); S.parts = []; S.pops.forEach(function (q) { q.el.remove(); }); S.pops = [];
    S.projs.forEach(function (o) { o.g.remove(); o.res(); }); S.projs = [];
    restoreFx(true); S.blocks.forEach(function (o) { o.g.remove(); }); S.blocks = []; S.chest.a = 0; S.chest.ta = 0; S.cre.on = false; S.lad.mode = ''; S.lad.a = 0; S.lad.tw = null; S.undo = 0;
  }
  function reset() {
    S.actors.forEach(function (a) { a.cancel(); a.x = -90; a.rise = 1; a.p.rise = 1; a.sc = 1; a.p.sc = 1; a.hold = ''; a.face = 1; a.fy = rnd(0, 4); a.held = false; a.liftY = 0; a.st = 0; a.p.rot = 0; a.p.dx = 0; a.p.dy = 0; a.team = 0; for (var k in a.v) a.v[k] = 0; });
    S.lifting = null; clearProps();
  }
  function slots(n, pad) { pad = pad || 32; var r = [], w = S.W - pad * 2; for (var i = 0; i < n; i++) r.push(pad + w * (n === 1 ? 0.5 : i / (n - 1)) + rnd(-8, 8)); return shuffle(r); }

  /* ---------- adegan ---------- */
  async function scenePeek() { // ngumpet lalu mengintip dari bawah layar
    var L = shuffle(S.cast);
    await allOf(L, async function (a, i) {
      a.x = rnd(30, S.W - 30); a.rise = 0; a.p.rise = 0; a.face = 0; a.fy = 0;
      await sleep(rnd(0.5, 4) + i * 2.5);
      var rounds = Math.floor(rnd(2, 4));
      for (var r = 0; r < rounds; r++) {
        a.rise = rnd(0.36, 0.46); a.x = a.x + rnd(-30, 30); a.x = Math.max(25, Math.min(S.W - 25, a.x));
        await a.run(function (t) { a.face = 0; a.set({ tilt: sin(t * 2.2) * 5, aLu: 0.1, aRu: 0.1 }); }, rnd(1.5, 3));
        if (Math.random() < 0.55) await a.run(function (t) { a.face = 0; a.set(mix(wavePose(t, a, 'R'), { tilt: 0 })); }, rnd(1.2, 2.2));
        a.rise = 0; await sleep(rnd(1, 3));
      }
      if (Math.random() < 0.6) { a.rise = 1; a.x = rnd(40, S.W - 40); await waveFor(a, 2.2); }
      a.rise = 0; await sleep(1.4);
    });
    S.actors.forEach(function (a) { a.x = -90; a.rise = 1; a.p.rise = 1; });
  }
  async function sceneGame() { // dorong bangku, duduk bareng main game
    var b = S.b, L = shuffle(S.cast), pusher = L[0], seats = Math.max(2, Math.min(4, L.length - 1 - (L.length >= 5 && Math.random() < 0.4 ? 1 : 0))), sit = L.slice(1, 1 + seats), spec = L.slice(1 + seats);
    var bx = S.W * rnd(0.34, 0.42), offs = seats === 2 ? [-18, 18] : seats === 3 ? [-26, 0, 26] : [-33, -11, 11, 33];
    S.tv.x = S.W - 44 * b; S.tv.ta = 1; S.bench.ta = 1; S.bench.x = -100;
    S.actors.forEach(function (a) { a.fy = 0; });
    // pendorong membawa bangku masuk
    pusher.x = -70 * b; pusher.face = 1; S.bench.x = pusher.x + 66 * b;
    var tx = bx - 66 * b;
    await pusher.run(function (t, dt) {
      var st = 30 * b * dt, d = tx - pusher.x; pusher.k = 14; if (d <= st) { pusher.x = tx; S.bench.x = pusher.x + 66 * b; return true; }
      pusher.x += st; pusher.walk += st * 0.095 / b; S.bench.x = pusher.x + 66 * b;
      pusher.set(walkPose(pusher.walk, 30, { lean: 0.28, aLu: 1.45, aRu: 1.5, aLf: 1.5, aRf: 1.55 }));
    });
    S.bench.x = bx;
    await idle(pusher, 0.9, { face: 1, fn: function (t, a) { return { lean: 0.1, aLu: 0.5, aLf: 1.4 + sin(t * 8) * 0.2, aRu: 0.2, aRf: 0.6 }; } }); // lap keringat
    var seatX = function (i) { return bx + offs[i] * b; }, gate = [];
    var all = [pusher].concat(sit), done = 0;
    var sitters = all.map(function (a, i) {
      return (async function () {
        if (a !== pusher) { await sleep(i * rnd(1.2, 2.2)); await enter(a, -1, seatX(i) - 16 * b, rnd(45, 65)); } else { await sleep(1); }
        await walkTo(a, seatX(i), 25); a.face = 1; a.hold = 'pad';
        await a.run(function (t) { a.k = 7; a.face = 1; a.set(mix(SIT, { lean: 0.1, tilt: 2, aLu: 0.75, aLf: 1.45, aRu: 0.85, aRf: 1.5 })); }, 1.2);
        done++;
      })();
    });
    var watchers = spec.map(function (a, i) {
      return (async function () {
        await sleep(rnd(2, 7)); await enter(a, Math.random() < 0.5 ? -1 : 1, bx + rnd(-40, 40) * b, 50); a.fy = 10 + i * 3; a.face = 1;
        await idle(a, rnd(1, 3), { face: 1 });
      })();
    });
    await Promise.all(sitters.concat(watchers));
    // main game
    var T = rnd(24, 36), t0 = S.clock, ends = false;
    var play = all.map(function (a, i) {
      return (async function () {
        while (S.clock - t0 < T) {
          var d = rnd(1.2, 3.2), m = Math.random();
          var base = function (t) { return mix(SIT, { lean: 0.14, tilt: 3, aLu: 0.75 + 0.05 * sin(t * 13 + a.ph), aLf: 1.45, aRu: 0.85, aRf: 1.5 + 0.06 * sin(t * 11) }); };
          await a.run(function (t) { a.k = 10; a.face = 1; a.set(base(t)); }, d);
          if (S.clock - t0 >= T) break;
          if (m < 0.3) await a.run(function (t) { a.k = 12; a.set(mix(SIT, { lean: -0.05, dy: -2 * abs(sin(t * 10)), aLu: 2.8 + 0.2 * sin(t * 10), aLf: 2.9, aRu: 2.7, aRf: 2.9 })); }, rnd(1.1, 1.8));
          else if (m < 0.5) await a.run(function (t) { a.k = 10; a.set(mix(SIT, { lean: 0.4, tilt: 4, aLu: 0.75, aLf: 1.45, aRu: 0.85, aRf: 1.5 })); }, rnd(0.8, 1.4));
          else if (m < 0.7) await a.run(function (t) { a.k = 16; a.set(mix(SIT, { lean: 0.08 + 0.13 * sin(t * 17), tilt: 0, aLu: 0.7, aLf: 1.4, aRu: 0.8, aRf: 1.5 })); }, rnd(1, 1.8));
          else if (m < 0.82) await a.run(function (t) { a.k = 12; a.set(mix(SIT, { lean: -0.12, aLu: 1.4, aLf: 0.7, aRu: 1.5, aRf: 0.8, tilt: -3 })); }, rnd(1, 1.6));
        }
      })();
    });
    var cheer = spec.map(function (a) {
      return (async function () {
        while (S.clock - t0 < T) {
          await idle(a, rnd(1.5, 4), { face: 1 });
          if (S.clock - t0 >= T) break;
          await a.run(function (t) { a.k = 12; a.face = 1; a.set({ lean: -0.04, dy: -3 * abs(sin(t * 9)), aLu: 2.7 + 0.2 * sin(t * 9), aLf: 2.8, aRu: 2.6, aRf: 2.8, tLt: 0.15, tRt: 0.15 }); }, rnd(1, 2));
        }
      })();
    });
    await Promise.all(play.concat(cheer));
    // selesai: semua berdiri dan bubar
    await allOf(all, function (a, i) {
      return a.run(function (t) { a.face = 0; a.k = 9; a.set({ lean: 0.05, aLu: 1.2, aLf: 0.7, aRu: 1.2, aRf: 0.7, tLt: 0.1, tRt: 0.1, tilt: sin(t * 3) * 3 }); }, 1.6 + i * 0.2);
    });
    S.bench.ta = 0; S.tv.ta = 0; all.forEach(function (a) { a.hold = ''; });
    await leaveAll(all.concat(spec));
    S.actors.forEach(function (a) { a.fy = rnd(0, 4); });
  }
  async function sceneSelfie() {
    var L = shuffle(S.cast), star = L[0], crowd = L.slice(1), cx = S.W * rnd(0.4, 0.6);
    await enter(star, Math.random() < 0.5 ? -1 : 1, cx, 55); star.hold = 'phone'; star.face = 0;
    await star.run(function (t) { star.k = 8; star.set({ lean: 0.03, aRu: 2.0, aRf: 2.45, aLu: 0.15, aLf: 0.25, tilt: -2 }); }, 1.5);
    var spots = [-34, 34, -62, 62, -22].slice(0, crowd.length);
    await allOf(crowd, async function (a, i) {
      await sleep(i * rnd(0.8, 1.5)); await enter(a, spots[i] < 0 ? -1 : 1, cx + spots[i] * S.b, rnd(45, 65)); a.face = 0;
      var kind = i % 3;
      await a.run(function (t) {
        a.k = 8; a.face = 0;
        if (kind === 0) a.set({ lean: 0.02, aLu: 2.7, aLf: 2.6 + 0.1 * sin(t * 4), aRu: 0.15, aRf: 0.2, tilt: spots[i] > 0 ? -3 : 3 }); // peace
        else if (kind === 1) a.set({ lean: 0.02, aLu: 0.9, aLf: -0.6, aRu: 0.9, aRf: -0.6, tilt: 0 }); // tangan di pinggang
        else a.set({ lean: 0.02, aLu: 2.9, aLf: 3.0, aRu: 2.9, aRf: 3.0 }); // angkat tangan
      }, 3 + (crowd.length - i) * 0.4);
    });
    await sleep(1);
    S.flash.t = 0.45; S.flash.x = star.hand[0]; S.flash.y = star.hand[1];
    await sleep(0.8);
    await allOf(crowd.concat([star]), function (a, i) { return a.run(function (t) { a.face = 0; a.k = 12; a.set({ lean: 0.02 + 0.02 * sin(t * 8), dy: -abs(sin(t * 9 + i)) * 3, aLu: 2.8, aLf: 2.9, aRu: 2.7, aRf: 2.9, tLt: 0.15, tRt: 0.15 }); }, 1.6); });
    await star.run(function (t) { star.face = 0; star.k = 8; star.set({ lean: 0.05, aRu: 1.1, aRf: 1.9, aLu: 0.2, aLf: 0.3, tilt: -2 }); }, 2.8); // lihat hasil foto
    await idle(star, 0.5); star.hold = '';
    await leaveAll(crowd.concat([star]));
  }
  async function sceneDance() {
    var L = shuffle(S.cast), xs = slots(L.length, 36), T = rnd(14, 20), t0 = S.clock;
    await allOf(L, async function (a, i) {
      await sleep(i * 0.7); await enter(a, i % 2 ? 1 : -1, xs[i], rnd(50, 70)); a.face = 0;
      var v = (a.i + i) % 4, sp = rnd(7, 10);
      await a.run(function (t) {
        a.k = 14; a.face = 0; var s2 = sin(t * sp + a.ph), c2 = cos(t * sp + a.ph);
        if (v === 0) a.set({ dy: -abs(s2) * 6, aLu: 2.6 + 0.3 * s2, aLf: 2.7, aRu: 2.6 - 0.3 * s2, aRf: 2.7, tLt: 0.15, tRt: 0.15, lean: 0 });
        else if (v === 1) { a.x += c2 * 0.35; a.set({ lean: 0.08 * s2, tilt: 3 * s2, aLu: 1.2 + 0.7 * s2, aLf: 1.4 + s2, aRu: 1.2 - 0.7 * s2, aRf: 1.4 - s2, tLt: 0.1 + 0.15 * Math.max(0, s2), tRt: 0.1 + 0.15 * Math.max(0, -s2), dy: -abs(s2) * 2 }); }
        else if (v === 2) a.set({ dy: -abs(s2) * 3, aLu: 1.57, aLf: 1.57 + (s2 > 0 ? 1.5 : 0), aRu: 1.57, aRf: 1.57 + (s2 > 0 ? 0 : 1.5), tLt: 0.2, tRt: 0.2, tilt: s2 > 0 ? 3 : -3 }); // robot
        else a.set({ lean: 0.05, dy: -abs(s2) * 2, aLu: 0.6 + s2, aLf: 0.9 + s2, aRu: 0.6 - s2, aRf: 0.9 - s2, tLt: 0.3 * s2, tRt: -0.3 * s2, tilt: 2 * c2 });
        if (Math.random() < 0.02) spawnNote(a);
      }, T - i * 0.7 > 5 ? T - i * 0.7 : 5);
    });
    await leaveAll(L);
  }
  async function sceneBall() {
    var L = shuffle(S.cast), A = L[0], B = L[1], rest = L.slice(2), d = Math.min(S.W * 0.62, 220), ax = S.W / 2 - d / 2, bx = S.W / 2 + d / 2;
    var ent = [enter(A, -1, ax, 60), enter(B, 1, bx, 60)].concat(rest.map(function (a, i) { return sleep(rnd(1, 6)).then(function () { return enter(a, Math.random() < 0.5 ? -1 : 1, S.W / 2 + rnd(-35, 35), 50); }).then(function () { a.fy = 7 + i * 2; return idle(a, 1, { face: i % 2 ? 1 : -1 }); }); }));
    await Promise.all(ent);
    A.face = 1; B.face = -1;
    var from = A, to = B, n = Math.floor(rnd(6, 10)), hold = A;
    S.ball.on = true; var hy = S.floor - 46 * S.b;
    function setBall(x, y) { S.ball.x = x; S.ball.y = y; }
    setBall(A.x + 10 * S.b, hy);
    for (var i = 0; i < n; i++) {
      var f = from, t = to, dir = t.x > f.x ? 1 : -1;
      await f.run(function (tt) { f.face = dir; f.k = 14; var u = Math.min(1, tt / 0.45); f.set({ lean: -0.1 * u, aRu: u < 0.6 ? -0.9 : 2.3, aRf: u < 0.6 ? -1.3 : 2.5, aLu: 0.5, aLf: 1 }); setBall(f.x + dir * (u < 0.6 ? -4 : 8) * S.b, hy - (u < 0.6 ? 6 : 14) * S.b); }, 0.5);
      var sx = f.x + dir * 10 * S.b, ex = t.x - dir * 10 * S.b, dur = rnd(0.9, 1.3), drop = Math.random() < 0.18 && i > 1;
      t.face = -dir;
      var fl = new Promise(function (res) { var t1 = 0; S.ball.fly = function (dt) { t1 += dt; var u = Math.min(1, t1 / dur); setBall(sx + (ex - sx) * u, hy - 14 * S.b - 62 * S.b * 4 * u * (1 - u) + (drop ? 28 * S.b * u * u : 0)); if (u >= 1) { S.ball.fly = null; res(); } }; });
      var catchP = t.run(function (tt) { t.face = -dir; t.k = 10; var u = Math.min(1, tt / dur); t.set({ lean: 0.04, aLu: 1.3 + 0.2 * u, aLf: 1.9 + 0.3 * u, aRu: 1.3 + 0.2 * u, aRf: 1.9 + 0.3 * u, tLt: 0.12, tRt: 0.12 }); }, dur + 0.15);
      await Promise.all([fl, catchP]);
      if (drop) { // bola jatuh, tertawa
        S.ball.vy = -90; var bt = 0;
        await t.run(function (tt, dt) { t.face = -dir; t.k = 12; t.set({ lean: 0.2 + 0.1 * sin(tt * 16), aLu: 0.4, aLf: 0.7, aRu: 0.4, aRf: 0.7 }); S.ball.vy += 480 * dt; S.ball.y = Math.min(S.floor - 4, S.ball.y + S.ball.vy * dt); S.ball.x += dir * 20 * dt; if (S.ball.y >= S.floor - 4 && S.ball.vy > 0) { S.ball.vy = -S.ball.vy * 0.45; if (abs(S.ball.vy) < 25) S.ball.vy = 0; } }, 1.8);
        setBall(t.x + (-dir) * 8 * S.b, hy - 10 * S.b);
      } else setBall(t.x - dir * 8 * S.b, hy - 10 * S.b);
      from = t; to = f;
    }
    S.ball.on = false;
    await allOf([A, B], function (a) { return a.run(function (t) { a.face = 0; a.k = 12; a.set({ dy: -abs(sin(t * 9)) * 3, aLu: 2.8, aLf: 2.9, aRu: 2.7, aRf: 2.9 }); }, 1.6); });
    await leaveAll(L); S.actors.forEach(function (a) { a.fy = rnd(0, 4); });
  }

  /* ---------- gelembung chat dan properti baru ---------- */
  function bubble(x, y, txt, col) {
    var g = mk('g', {}, S.gfront), w = txt.length > 2 ? 44 : 28;
    mk('rect', { x: -w / 2, y: -14, width: w, height: 24, rx: 6, fill: col || '#b85450' }, g); mk('path', { d: 'M-6 10 L-12 17 L2 10 Z', fill: col || '#b85450' }, g);
    var t = mk('text', { x: 0, y: 4, 'font-size': 15, 'text-anchor': 'middle', fill: '#fff', 'font-family': 'sans-serif' }, g); t.textContent = txt;
    S.bubs.push({ g: g, x: x, y: y, life: 0, vy: rnd(14, 22) });
  }
  function sofaProp(x) { S.sofa.x = x; S.sofa.ta = 1; }
  async function sceneSofa() { // duduk sebaris di sofa, ngobrol lewat gelembung chat
    var b = S.b, L = shuffle(S.cast), sit = L.slice(0, 3), rest = L.slice(3), cx = S.W * rnd(0.4, 0.6), offs = [-32, 0, 32];
    S.actors.forEach(function (a) { a.fy = 0; });
    sofaProp(cx);
    await allOf(sit, async function (a, i) {
      await sleep(i * rnd(1, 2)); await enter(a, i === 2 ? 1 : -1, cx + offs[i] * b + (i === 2 ? 30 : -30) * b, rnd(45, 60));
      await walkTo(a, cx + offs[i] * b, 26); a.face = 1;
      await a.run(function (t) { a.k = 7; a.set(mix(SIT, { lean: 0.06, aLu: 0.5, aLf: 0.9 })); }, 1);
    });
    var T = rnd(24, 34), t0 = S.clock, EM = ['👽', '?', '🤯', '😂', '👍', '💬', '❤️', '🔥'], COL = ['#b85450', '#4e9b5a', '#4a6fb8'];
    var acts = sit.map(function (a, i) {
      return (async function () {
        var role = i % 3; a.hold = role === 0 ? 'pad' : role === 1 ? 'phone' : '';
        while (S.clock - t0 < T) {
          await a.run(function (t) {
            a.k = 8; a.face = 1;
            if (role === 0) a.set(mix(SIT, { lean: 0.12, tilt: 2, aLu: 0.8, aLf: 1.5, aRu: 0.85, aRf: 1.5 }));
            else if (role === 1) a.set(mix(SIT, { lean: 0.1, aLu: 0.4, aLf: 0.7, aRu: 0.9, aRf: 1.9, tilt: 1 + sin(t * 2) }));
            else a.set(mix(SIT, { lean: 0.02, aLu: 0.9, aLf: 1.6, aRu: 0.9, aRf: 1.7, tilt: sin(t * 1.3) * 2 }));
          }, rnd(2, 4.5));
          if (S.clock - t0 >= T) break;
          bubble(a.x + 10 * b, S.floor - 62 * b, pick(EM), pick(COL));
          await a.run(function (t) { a.k = 12; a.set(mix(SIT, { lean: -0.04, dy: -1.5 * abs(sin(t * 12)), aLu: 2.6, aLf: 2.8, aRu: 0.6, aRf: 1.4 })); }, rnd(0.8, 1.4));
        }
      })();
    });
    var extra = rest.map(function (a, i) {
      return (async function () {
        await sleep(rnd(2, 8)); await enter(a, Math.random() < 0.5 ? -1 : 1, cx + rnd(-70, 70) * b, 50); a.fy = 12;
        await look(a, rnd(4, 9)); await leave(a, 55);
      })();
    });
    await Promise.all(acts.concat(extra));
    sit.forEach(function (a) { a.hold = ''; });
    S.sofa.ta = 0; await leaveAll(sit); S.actors.forEach(function (a) { a.fy = rnd(0, 4); });
  }
  async function sceneRace() { // lomba lari
    var b = S.b, L = shuffle(S.cast), x0 = 30 * b, x1 = S.W - 34 * b, sp = L.map(function () { return rnd(130, 190); });
    await allOf(L, async function (a, i) { await sleep(i * 0.5); await enter(a, -1, x0 + i * 7 * b, 55); a.face = 1; });
    await allOf(L, function (a, i) { a.fy = i * 3; return a.run(function (t) { a.k = 9; a.face = 1; a.set({ lean: 0.4, aLu: -0.9, aLf: 0.6, aRu: 0.9, aRf: 1.8, tLt: 0.9, tRt: -0.5, tLs: 0.2, tRs: -1.2, dy: 2 }); }, 1.3 + sleepJ(i)); });
    await sleep(0.5); // siap, mulai!
    var order = [];
    await allOf(L, function (a, i) { return walkTo(a, x1 - i * 2, sp[i]).then(function () { order.push(a); }); });
    var win = order[0];
    await allOf(L, function (a, i) {
      var w = a === win;
      return a.run(function (t) {
        a.k = 10; a.face = w ? 0 : 1;
        if (w) a.set({ dy: -abs(sin(t * 9)) * 6, aLu: 2.7 + 0.3 * sin(t * 9), aLf: 2.8, aRu: 2.6, aRf: 2.8, tLt: 0.15, tRt: 0.15, lean: 0 });
        else a.set({ lean: 0.35 + 0.05 * sin(t * 7), aLu: 0.3, aLf: 0.5, aRu: 0.2, aRf: 0.4, tLt: 0.08, tRt: 0.08, tilt: sin(t * 3) * 2 }); // ngos-ngosan
      }, 3.5);
    });
    await allOf(L, function (a, i) { return sleep(i * 0.3).then(function () { return leave(a, rnd(45, 70)); }); }); S.actors.forEach(function (a) { a.fy = rnd(0, 4); });
  }
  function sleepJ(i) { return i * 0.1; }
  async function scenePortal() { // lari masuk portal, lalu muncul lagi satu-satu
    var b = S.b, L = shuffle(S.cast), px = S.W - 32 * b;
    S.portal.x = px; S.portal.ta = 1; await sleep(1.2);
    await allOf(L, async function (a, i) {
      await sleep(i * rnd(1, 1.8)); await enter(a, -1, px - 14 * b, rnd(110, 170));
      S.flash.t = 0.4; S.flash.x = px; S.flash.y = S.floor - 28 * b; a.x = -90;
    });
    await sleep(rnd(2.5, 4));
    await allOf(L, async function (a, i) {
      await sleep(i * rnd(1.2, 2)); a.x = px; a.face = -1; S.flash.t = 0.4; S.flash.x = px; S.flash.y = S.floor - 28 * b;
      await walkTo(a, rnd(S.W * 0.2, S.W * 0.7), rnd(45, 65));
      var m = Math.random(); if (m < 0.5) await look(a, rnd(2, 4)); else await waveFor(a, 2);
    });
    S.portal.ta = 0; await sleep(0.8); await leaveAll(L);
  }
  async function sceneChat() { // jalan bareng sambil ngobrol
    var b = S.b, L = shuffle(S.cast), dir = Math.random() < 0.5 ? 1 : -1, EM = ['😂', '?', '👍', '💬', '❤️'], COL = ['#b85450', '#4e9b5a', '#4a6fb8'];
    var x0 = dir > 0 ? -30 : S.W + 30, mid = S.W / 2;
    L.forEach(function (a, i) { a.x = x0 - dir * i * 34 * b; a.face = dir; });
    var gx = dir > 0 ? S.W + 50 : -50, talk = true;
    var talker = (async function () { while (talk) { await sleep(rnd(1.4, 3)); var a = pick(L); if (a.x > 10 && a.x < S.W - 10) bubble(a.x, S.floor - 62 * b, pick(EM), pick(COL)); } })();
    await allOf(L, function (a, i) { return walkTo(a, gx, rnd(32, 42)); });
    talk = false;
  }
  /* ---------- efek: partikel, teks tabrakan, proyektil, lubang, baris jatuh ---------- */
  var G = 520;
  function part(x, y, col, n, spd, sz) {
    for (var i = 0; i < n && S.parts.length < 90; i++) {
      var e = mk('rect', { width: sz, height: sz, fill: col }, S.gfront);
      S.parts.push({ el: e, x: x, y: y, vx: rnd(-1, 1) * spd, vy: rnd(-1.3, 0.1) * spd, life: 0, max: rnd(0.5, 1.1), r: rnd(0, 6) });
    }
  }
  function pop(txt, x, y, col) {
    var t = mk('text', { 'font-size': 17, 'font-weight': 900, 'text-anchor': 'middle', fill: col || '#ffd54a', stroke: '#1b1f2a', 'stroke-width': 3, 'paint-order': 'stroke', 'font-family': 'sans-serif' }, S.gfront); t.textContent = txt;
    S.pops.push({ el: t, x: x, y: y, life: 0 });
  }
  function drawItem(g, kind) {
    if (kind === 'ball') { mk('circle', { r: 4.6, fill: '#f5f5f5', stroke: '#8d96ab', 'stroke-width': 1.2 }, g); mk('path', { d: 'M-4 0 Q0 -3 4 0', fill: 'none', stroke: '#8d96ab', 'stroke-width': 1 }, g); }
    else if (kind === 'crate') { mk('rect', { x: -6, y: -6, width: 12, height: 12, fill: '#b98a4e', stroke: '#6d4a22', 'stroke-width': 1.5 }, g); mk('path', { d: 'M-6 -6L6 6M6 -6L-6 6', stroke: '#6d4a22', 'stroke-width': 1.2 }, g); }
    else if (kind === 'rock') { mk('path', { d: 'M-6 2 L-3 -5 L3 -6 L7 0 L4 5 L-3 5Z', fill: '#8b909c', stroke: '#4d525e', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, g); }
    else if (kind === 'shoe') { mk('path', { d: 'M-7 3 L-7 -3 L-2 -3 L0 0 L7 2 L7 4 Z', fill: '#e53935', stroke: '#7d1b19', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }, g); }
    else if (kind === 'pie') { mk('path', { d: 'M-7 2 A7 5 0 0 1 7 2 Z', fill: '#f2c46b', stroke: '#9b6a22', 'stroke-width': 1.2 }, g); mk('circle', { cx: -2, cy: -1, r: 2, fill: '#fff' }, g); }
    else { var c = BK[kind] || BK.stone; mk('rect', { x: -6, y: -6, width: 12, height: 12, fill: c[0], stroke: c[1], 'stroke-width': 1.3 }, g); }
  }
  function proj(kind, x0, y0, tx, ty, dur, cb) {
    var g = mk('g', {}, S.gfront); drawItem(g, kind);
    return new Promise(function (res) { S.projs.push({ g: g, x0: x0, y0: y0, vx: (tx - x0) / dur, vy: (ty - y0) / dur - 0.5 * G * dur, t: 0, dur: dur, rot: rnd(0, 6), vr: rnd(-10, 10), cb: cb, res: res, gen: S.gen, tx: tx, ty: ty }); });
  }
  function hole(x, y, r) {
    var g = mk('g', {}, S.ghole), n = 9, d = '', i, a0 = rnd(0, 6);
    for (i = 0; i < n; i++) { var an = a0 + i * 6.2832 / n + rnd(-0.18, 0.18), rr = r * rnd(0.68, 1.18); d += (i ? 'L' : 'M') + (cos(an) * rr).toFixed(1) + ' ' + (sin(an) * rr).toFixed(1); }
    mk('path', { d: d + 'Z', fill: '#06080c', stroke: '#d5d9e3', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, g);
    var cr = '';
    for (i = 0; i < 9; i++) { var an2 = a0 + i * 0.7 + rnd(-0.25, 0.25), r1 = r * 1.05, r2 = r * rnd(1.5, 2.5), mx = cos(an2 + 0.18) * (r1 + r2) / 2, my = sin(an2 + 0.18) * (r1 + r2) / 2; cr += 'M' + (cos(an2) * r1).toFixed(1) + ' ' + (sin(an2) * r1).toFixed(1) + 'L' + mx.toFixed(1) + ' ' + my.toFixed(1) + 'L' + (cos(an2) * r2).toFixed(1) + ' ' + (sin(an2) * r2).toFixed(1); }
    mk('path', { d: cr, fill: 'none', stroke: '#e6e9f0', 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0.8 }, g);
    var o = { g: g, x: x, y: y, s: 0, ts: 1 }; S.holes.push(o); part(x, y, '#9aa3b6', 12, 170, 3); return o;
  }
  function rowsNow() {
    var out = []; if (!S.rowsFn) return out;
    try { S.rowsFn().forEach(function (el) { var r = el.getBoundingClientRect(); if (r.width > 120 && r.height > 24 && r.top > 40 && r.bottom < S.H - 30 && !S.rfx.some(function (o) { return o.el === el; })) out.push({ el: el, r: r }); }); } catch (e) {}
    return out;
  }
  function rowFall(el, dir) {
    var o = { el: el, x: 0, y: 0, r: 0, vx: dir * rnd(50, 110), vy: -rnd(130, 220), vr: dir * rnd(0.6, 1.6), mode: 'fall', old: el.style.cssText, bt: 0 };
    el.style.transition = 'none'; el.style.willChange = 'transform'; el.style.pointerEvents = 'none'; el.style.position = el.style.position || 'relative'; el.style.zIndex = '3'; S.rfx.push(o);
  }
  function restoreFx(now) {
    S.rfx.forEach(function (o) { if (now) { o.el.style.cssText = o.old; o.mode = 'done'; } else if (o.mode !== 'back') { o.mode = 'back'; o.bt = 0; o.fx = o.x; o.fy = o.y; o.fr = o.r; o.el.style.visibility = ''; } });
    if (now) S.rfx = [];
    S.holes.forEach(function (h) { if (now) h.g.remove(); else h.ts = 0; }); if (now) S.holes = [];
  }
  function fxStep(dt) {
    var i;
    for (i = S.parts.length - 1; i >= 0; i--) { var q = S.parts[i]; q.life += dt; q.vy += 520 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.r += 9 * dt; q.el.setAttribute('transform', 'translate(' + q.x.toFixed(1) + ' ' + q.y.toFixed(1) + ') rotate(' + (q.r * 57).toFixed(0) + ')'); q.el.setAttribute('opacity', Math.max(0, 1 - q.life / q.max).toFixed(2)); if (q.life >= q.max) { q.el.remove(); S.parts.splice(i, 1); } }
    for (i = S.pops.length - 1; i >= 0; i--) { var p = S.pops[i]; p.life += dt; var sc = p.life < 0.15 ? 0.4 + p.life / 0.15 * 0.9 : 1.3 - Math.min(0.3, (p.life - 0.15) * 0.5); p.el.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + (p.y - p.life * 22).toFixed(1) + ') scale(' + sc.toFixed(2) + ')'); p.el.setAttribute('opacity', Math.max(0, 1 - (p.life - 0.6) / 0.35).toFixed(2)); if (p.life > 0.95) { p.el.remove(); S.pops.splice(i, 1); } }
    for (i = S.projs.length - 1; i >= 0; i--) {
      var o = S.projs[i]; if (o.gen !== S.gen) { o.g.remove(); S.projs.splice(i, 1); o.res(); continue; }
      o.t += dt; var tt = Math.min(o.t, o.dur), x = o.x0 + o.vx * tt, y = o.y0 + o.vy * tt + 0.5 * G * tt * tt;
      o.g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + ((o.rot + o.vr * o.t) * 57).toFixed(0) + ') scale(' + S.b.toFixed(2) + ')');
      if (o.t >= o.dur) { o.g.remove(); S.projs.splice(i, 1); if (o.cb) try { o.cb(o); } catch (e) {} o.res(); }
    }
    for (i = S.holes.length - 1; i >= 0; i--) { var h = S.holes[i]; h.s += (h.ts - h.s) * (1 - Math.exp(-(h.ts ? 14 : 5) * dt)); h.g.setAttribute('transform', 'translate(' + h.x.toFixed(1) + ' ' + h.y.toFixed(1) + ') scale(' + (h.ts ? h.s * (1 + 0.25 * Math.max(0, 1 - h.s)) : h.s).toFixed(3) + ')'); if (!h.ts && h.s < 0.04) { h.g.remove(); S.holes.splice(i, 1); } }
    for (i = S.rfx.length - 1; i >= 0; i--) {
      var f = S.rfx[i];
      if (f.mode === 'fall') { f.vy += 1000 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.r += f.vr * dt; if (f.y > S.H + 160) { f.mode = 'gone'; f.el.style.visibility = 'hidden'; } }
      else if (f.mode === 'back') { f.bt += dt; var u = Math.min(1, f.bt / 0.95), c1 = 1.9, e = 1 + (c1 + 1) * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2), k = 1 - e; f.x = f.fx * k; f.y = f.fy * k; f.r = f.fr * k; if (u >= 1) { f.el.style.cssText = f.old; S.rfx.splice(i, 1); continue; } }
      if (f.mode !== 'gone') f.el.style.transform = 'translate(' + f.x.toFixed(1) + 'px,' + f.y.toFixed(1) + 'px) rotate(' + (f.r * 57.3).toFixed(1) + 'deg)';
    }
  }

  /* ---------- aksi bertarung dan melempar ---------- */
  function lieOf(dir) { return { rot: dir * 1.5, dy: 34, aLu: 0.6, aLf: 0.9, aRu: 1.6, aRf: 2.0, tLt: 0.5, tRt: -0.2, tLs: 0.5, tRs: 0.3, lean: 0 }; }
  async function knock(a, dir, big, dizzy) { // terpukul/terkena lemparan, terdorong ke arah dir
    var x0 = a.x, T = big ? 0.55 : 0.5; a.face = -dir;
    await a.run(function (t, dt) {
      a.k = 22; a.face = -dir; var u = Math.min(1, t / T), e = 1 - Math.pow(1 - u, 2);
      a.x = x0 + dir * (big ? 36 : 12) * S.b * e;
      a.set({ lean: -0.45 * sin(u * 3.14), aLu: 1.5, aLf: 0.5, aRu: 1.1, aRf: -0.4, tLt: -0.35 * sin(u * 3.14), tRt: 0.4 * sin(u * 3.14), dy: big ? -10 * sin(u * 3.14) : 0, rot: big ? -dir * 0.3 * sin(u * 3.14) + dir * 0.0 : 0 });
    }, T);
    if (big) {
      await a.run(function (t) { a.k = 14; a.face = -dir; a.set(lieOf(dir)); }, 1.3 + rnd(0, 0.5));
      if (dizzy) pop('💫', a.x, S.floor - 52 * S.b, '#fff');
      await a.run(function (t) { a.k = 13; a.face = -dir; var u = Math.min(1, t / 0.7); a.set({ rot: dir * 1.5 * (1 - u * u), dy: 34 * (1 - u), aLu: 1.4, aLf: 0.6, aRu: 1.4, aRf: 0.6, lean: 0.25 * u, tLt: 0.4, tRt: 0.2 }); }, 0.75);
    } else await idle(a, 0.3);
  }
  async function punchAct(a, dir, tgt, onHit) {
    var done = false; a.face = dir;
    await a.run(function (t) {
      a.k = 26; a.face = dir; var u = t / 0.62;
      if (u < 0.3) { var w = u / 0.3; a.set({ lean: -0.18 * w, aRu: -0.9 * w, aRf: -1.4 * w, aLu: 0.7, aLf: 1.5, tLt: -0.15, tRt: 0.3 }); }
      else if (u < 0.55) { a.x += dir * 70 * S.b * (1 / 60); a.set({ lean: 0.38, aRu: 1.5, aRf: 1.55, aLu: -0.6, aLf: -0.3, tLt: 0.5, tRt: -0.3, tLs: 0.2 }); if (!done) { done = true; if (onHit) onHit(); } }
      else a.set({ lean: 0.15, aRu: 0.9, aRf: 1.4, aLu: 0.7, aLf: 1.5, tLt: 0.1, tRt: 0.1 });
    }, 0.62);
  }
  async function kickAct(a, dir, onHit) {
    var done = false; a.face = dir;
    await a.run(function (t) {
      a.k = 26; a.face = dir; var u = t / 0.7;
      if (u < 0.3) a.set({ lean: -0.3 * u / 0.3, aLu: 1.2, aLf: 0.6, aRu: 0.1, aRf: 0.2, tRt: -0.6, tRs: -1.2, tLt: 0.05 });
      else if (u < 0.6) { a.set({ lean: -0.35, aLu: 1.5, aLf: 0.8, aRu: -0.7, aRf: -0.4, tRt: 1.5, tRs: 1.35, tLt: 0.05, tLs: 0.05 }); if (!done) { done = true; if (onHit) onHit(); } }
      else a.set({ lean: 0, aLu: 0.8, aLf: 0.9, aRu: 0.4, aRf: 0.6, tRt: 0.5, tRs: 0.2 });
    }, 0.7);
  }
  async function throwAct(a, dir, tx, ty, kind, dur, cb) { // lempar benda, mengembalikan promise saat benda mendarat
    var rel = false, p = null; a.face = dir;
    await a.run(function (t) {
      a.k = 22; a.face = dir; var u = Math.min(1, t / 0.55);
      if (u < 0.45) { var w = u / 0.45; a.set({ lean: -0.22 * w, aRu: -0.1 - 1.0 * w, aRf: -1.5 * w, aLu: 1.0, aLf: 1.2, tilt: -2 * w, tLt: -0.2 * w, tRt: 0.3 * w }); }
      else { var w2 = Math.min(1, (u - 0.45) / 0.25); a.set({ lean: 0.34 * w2, aRu: 2.1, aRf: 2.4, aLu: -0.4, aLf: -0.2, tLt: 0.55, tRt: -0.2, tilt: 2 }); if (!rel) { rel = true; p = proj(kind, a.hand[0], a.hand[1], tx, ty, dur, cb); } }
    }, 0.72);
    return p || Promise.resolve();
  }
  function shake(a, sec) { return a.run(function (t) { a.k = 16; a.face = 0; a.set({ lean: 0.05, tilt: sin(t * 22) * 4, aLu: 0.2, aLf: 0.3, aRu: 0.2, aRf: 0.3 }); }, sec); }
  function laugh(a, sec, dir) { return a.run(function (t) { a.k = 14; if (dir) a.face = dir; a.set({ lean: -0.12 + 0.1 * sin(t * 15), dy: -abs(sin(t * 11)) * 2.5, aLu: 0.5 + 0.3 * sin(t * 15), aLf: 1.2, aRu: 0.9, aRf: 1.6 + 0.4 * sin(t * 15), tilt: sin(t * 15) * 2 }); }, sec); }
  function shrug(a, sec) { return a.run(function (t) { a.k = 12; a.face = 0; var u = Math.min(1, t / 0.4); a.set({ lean: 0.02, aLu: 0.7 * u, aLf: 1.3 * u + 0.2, aRu: 0.7 * u, aRf: 1.3 * u + 0.2, tilt: sin(t * 3) * 3, dy: -2 * u }); }, sec); }
  function panicPose(t, a, i) { var w = t * 11 + i; return { lean: 0.1 * sin(w), dy: -abs(sin(w)) * 5, aLu: 2.6 + 0.4 * sin(w), aLf: 2.8 + 0.5 * sin(w + 1), aRu: 2.6 + 0.4 * sin(w + 2), aRf: 2.8 + 0.5 * sin(w + 3), tLt: 0.2 * sin(w), tRt: -0.2 * sin(w) }; }
  function onStage(a) { return a.x > -30 && a.x < S.W + 30 && a.rise > 0.5; }

  /* ---------- scene: ngobrol berdua ---------- */
  async function sceneTalk() {
    var b = S.b, L = shuffle(S.cast), A = L[0], B = L[1], C = L[2], cx = S.W * rnd(0.36, 0.64), gap = 25 * b;
    var EM = ['😂', '?', '👍', '💬', '❤️', '🤔', '😮', '!', '🎮', '🍕'], COL = ['#b85450', '#4e9b5a', '#4a6fb8', '#8e6bb8'];
    await allOf([A, B], function (a, i) { return sleep(i * rnd(0.6, 1.4)).then(function () { return enter(a, i ? 1 : -1, cx + (i ? 1 : -1) * gap + (i ? 1 : -1) * 55 * b, rnd(36, 52)); }).then(function () { return walkTo(a, cx + (i ? 1 : -1) * gap, rnd(26, 34)); }); });
    A.face = 1; B.face = -1;
    var T = rnd(20, 30), t0 = S.clock, sp = A, li = B, cJoined = false;
    function talkPose(t, a, d) { a.k = 9; a.face = d; var w = sin(t * 5.5 + a.ph); a.set({ lean: 0.05, tilt: 1.5 * sin(t * 3), aLu: 0.2, aLf: 0.3, aRu: 1.0 + 0.45 * w, aRf: 1.7 + 0.6 * sin(t * 5.5 + 1), tLt: 0.08, tRt: 0.04 }); }
    function hearPose(t, a, d) { a.k = 8; a.face = d; a.set({ lean: 0.02 + 0.03 * sin(t * 2.2), tilt: 3 * sin(t * 2.2), aLu: 0.15, aLf: 0.3, aRu: 0.15, aRf: 0.3 }); }
    while (S.clock - t0 < T) {
      var d = rnd(1.8, 3.4), dirS = li.x > sp.x ? 1 : -1;
      bubble(sp.x + dirS * 8 * b, S.floor - 64 * b, pick(EM), pick(COL));
      var react = Math.random() < 0.35;
      await Promise.all([sp.run(function (t) { talkPose(t, sp, dirS); }, d), li.run(function (t) { if (react && t > d * 0.55) { li.k = 12; li.face = -dirS; li.set({ lean: -0.1 + 0.1 * sin(t * 15), dy: -abs(sin(t * 11)) * 2.5, aLu: 0.5, aLf: 1.2, aRu: 0.9, aRf: 1.7, tilt: sin(t * 15) * 2 }); } else hearPose(t, li, -dirS); }, d)]);
      if (react) pop('😂', li.x, S.floor - 66 * b, '#fff');
      var t1 = sp; sp = li; li = t1;
      if (C && !cJoined && S.clock - t0 > T * 0.35) { cJoined = true; var side = Math.random() < 0.5 ? -1 : 1; await Promise.all([enter(C, side, cx + side * (gap + 48 * b), 48).then(function () { return walkTo(C, cx + side * (gap + 36 * b), 26); }), idle(A, 1.2, { face: side }), idle(B, 1.2, { face: side })]); C.face = -side; bubble(C.x, S.floor - 64 * b, '👋', '#4a6fb8'); }
    }
    if (C && cJoined) { // yang ketiga pergi duluan, sambil menunjuk
      await C.run(function (t) { C.k = 10; C.face = -cJoined; C.set({ aRu: 1.55, aRf: 1.57, lean: 0.05 }); }, 1);
    }
    var ex = Math.random() < 0.5 ? -1 : 1; // satu lanjut jalan, satunya melihat sebentar
    await Promise.all([leave(A, rnd(40, 55)), sleep(0.8).then(function () { return look(B, 1.6); }).then(function () { return leave(B, rnd(40, 55)); })].concat(C ? [sleep(1.2).then(function () { return leave(C, 50); })] : []));
  }

  /* ---------- scene: lempar-lemparan benda ---------- */
  async function sceneThrow() {
    var b = S.b, L = shuffle(S.cast), A = L[0], B = L[1], C = L[2], d = Math.min(S.W * 0.6, 220), ax = S.W / 2 - d / 2, bx = S.W / 2 + d / 2;
    var ents = [enter(A, -1, ax, 58), enter(B, 1, bx, 58)];
    if (C) ents.push(sleep(rnd(1, 4)).then(function () { return enter(C, Math.random() < 0.5 ? -1 : 1, S.W / 2 + rnd(-30, 30), 48); }).then(function () { C.fy = 9; return look(C, 1); }));
    await Promise.all(ents); A.face = 1; B.face = -1;
    var turn = A, n = Math.floor(rnd(6, 9)), kinds = ['ball', 'crate', 'rock', 'shoe', 'pie'];
    for (var i = 0; i < n; i++) {
      var f = turn, t = f === A ? B : A, dir = t.x > f.x ? 1 : -1, kind = pick(kinds), hit = Math.random() < 0.55, fl = rnd(0.75, 1.0);
      var tx = hit ? t.x : t.x + dir * 85 * b, ty = hit ? S.floor - 38 * b : S.floor - 5 * b;
      t.face = -dir;
      var pr = throwAct(f, dir, tx, ty, kind, fl, null), landing = pr.then ? null : null;
      var prom = pr; // sudah menunggu aksi lempar, sekarang benda di udara
      var arrive = await pr; // promise landing
      void arrive;
      if (hit) { var big = Math.random() < 0.4; part(t.x, S.floor - 38 * b, '#fff', 6, 120, 2.5); pop(pick(['POW!', 'BAM!', '💥', 'DUK!']), t.x, S.floor - 62 * b); await knock(t, dir, big, big); }
      else { pop('wuss', t.x, S.floor - 64 * b, '#9ad'); await idle(t, 0.4); }
      turn = t; await Promise.all([idle(f, 0.2), idle(t, 0.3)]);
    }
    await Promise.all([laugh(A, 2, 1), laugh(B, 2, -1)]);
    await Promise.all([leave(A, 58), leave(B, 58)].concat(C ? [leave(C, 50)] : []));
    S.actors.forEach(function (a) { a.fy = rnd(0, 4); });
  }

  /* ---------- scene: bawa tangga ---------- */
  async function sceneLadder() {
    var b = S.b, L = shuffle(S.cast), H = L[0], C = L[1], D = L[2], LD = S.lad, len = 84 * b, x0 = S.W * rnd(0.4, 0.62), dir = Math.random() < 0.5 ? 1 : -1;
    LD.len = len; LD.mode = 'carry'; LD.carrier = H; LD.dir = dir; LD.a = 1;
    await enter(H, -dir, x0 - dir * 90 * b, 40); H.hold = 'ladder';
    await H.run(function (t, dt) { var d = x0 - dir * 14 * b - H.x, st = 34 * b * dt; H.k = 14; H.face = dir; if (abs(d) <= st) { H.x += d; return true; } H.x += dir * st; H.walk += st * 0.095 / b; H.set(walkPose(H.walk, 34, { aRu: 1.15, aRf: 2.0, aLu: 0.6, aLf: 1.3, lean: 0.1 })); });
    await H.run(function (t) { H.k = 8; H.face = dir; H.set({ lean: 0.1 * sin(t * 3), aRu: 1.1, aRf: 1.9, aLu: 0.5, aLf: 1.2 }); }, 0.6);
    // letakkan: tangga berdiri
    var bx = x0, from = dir * 1.28, to = dir * 0.1;
    LD.mode = 'free'; LD.x = bx; await H.run(function (t) { var u = Math.min(1, t / 0.9), e = u * u * (3 - 2 * u); LD.ang = from + (to - from) * e; LD.x = bx - dir * 16 * b * (1 - e); H.k = 14; H.face = dir; H.set({ lean: 0.2 * e, aRu: 1.5 + 0.8 * e, aRf: 2.0 + 0.6 * e, aLu: 1.3, aLf: 1.9 }); return u >= 1; });
    LD.x = bx; LD.ang = to; H.hold = ''; part(bx, S.floor, '#cfd3dc', 5, 40, 2);
    if (C) { await enter(C, -dir, bx - dir * 70 * b, 52); await walkTo(C, bx - dir * 16 * b, 30); }
    var climber = C || H, holder = C ? H : null;
    if (holder) holder.run(function (t) { holder.k = 8; holder.face = dir; holder.x += (bx - dir * 11 * b - holder.x) * 0.05; holder.set({ lean: 0.18, aRu: 2.3, aRf: 2.6, aLu: 2.3, aLf: 2.6, tLt: 0.2, tRt: -0.15 }); }, 40);
    if (D) sleep(rnd(2, 5)).then(function () { return enter(D, -dir, bx + dir * 55 * b, 46); }).then(function () { D.fy = 8; return idle(D, 1.2, { face: -dir }); });
    var top = len * 0.78, wob = Math.random() < 0.45, h = 0, hh = { v: 0 };
    climber.hold = '';
    await climber.run(function (t, dt) { h = Math.min(top, h + 22 * b * dt); var cyc = h / (7 * b); climber.k = 16; climber.face = 0; climber.fy = h * cos(LD.ang); climber.x = LD.x + sin(LD.ang) * h; var s2 = sin(cyc * 3.14159);
      climber.set({ lean: 0, aLu: 2.8 - 0.7 * max0(s2), aRu: 2.8 - 0.7 * max0(-s2), aLf: 2.9, aRf: 2.9, tLt: 0.9 * max0(s2), tLs: -0.1, tRt: 0.9 * max0(-s2), tRs: -0.1, dy: 0 }); return h >= top; });
    if (!wob) { // sampai atas: ganti bohlam
      pop('💡', climber.x, S.floor - climber.fy - 86 * b, '#fff176');
      await climber.run(function (t) { climber.k = 12; climber.fy = h * cos(LD.ang); climber.x = LD.x + sin(LD.ang) * h; climber.set({ aLu: 2.9, aLf: 3.0, aRu: 2.9 + 0.2 * sin(t * 9), aRf: 3.1, lean: 0.02 }); }, 2.2);
      part(climber.x, S.floor - climber.fy - 80 * b, '#ffe066', 8, 90, 2.5);
      await climber.run(function (t, dt) { h = Math.max(0, h - 30 * b * dt); var cyc = h / (7 * b); climber.k = 16; climber.fy = h * cos(LD.ang); climber.x = LD.x + sin(LD.ang) * h; var s2 = sin(cyc * 3.14159); climber.set({ aLu: 2.8 - 0.7 * max0(s2), aRu: 2.8 - 0.7 * max0(-s2), aLf: 2.9, aRf: 2.9, tLt: 0.9 * max0(s2), tRt: 0.9 * max0(-s2), tRs: -0.1, tLs: -0.1 }); return h <= 0; });
      climber.fy = 0;
    } else { // tangga goyang lalu roboh
      if (holder) bubble(holder.x, S.floor - 66 * b, '😱', '#b85450'); else pop('😱', climber.x, S.floor - 100 * b, '#fff');
      await climber.run(function (t) { LD.ang = to + dir * (0.04 + 0.1 * Math.min(1, t / 1.5)) * sin(t * 7); climber.fy = h * cos(LD.ang); climber.x = LD.x + sin(LD.ang) * h; climber.k = 16; climber.set({ aLu: 2.6 + 0.8 * sin(t * 12), aLf: 3.0, aRu: 2.6 - 0.8 * sin(t * 12), aRf: 3.0, lean: 0.1 * sin(t * 7), tLt: 0.4, tRt: -0.2 }); return t >= 1.6; });
      var vx = dir * 70 * b, vy = 90 * b, a0 = LD.ang;
      LD.tw = { t: 0, dur: 0.85, from: a0, to: dir * 1.5 };
      await climber.run(function (t, dt) { vy -= 900 * dt; climber.fy += vy * dt; climber.x += vx * dt; climber.k = 14; climber.face = 0; climber.set({ rot: dir * 5 * Math.min(0.45, t), aLu: 2.8, aLf: 3.0, aRu: 2.8, aRf: 3.0, tLt: 0.5, tRt: -0.4 }); if (climber.fy <= 0) { climber.fy = 0; return true; } });
      part(climber.x, S.floor, '#cfd3dc', 8, 100, 2.5); pop('BRUK!', climber.x, S.floor - 40 * b, '#ffd54a');
      await climber.run(function (t) { climber.k = 12; climber.face = -dir; climber.set(lieOf(-dir)); }, 1.5);
      if (holder) walkTo(holder, climber.x - dir * 22 * b, 60);
      await climber.run(function (t) { climber.k = 13; var u = Math.min(1, t / 0.7); climber.set({ rot: -dir * 1.5 * (1 - u * u), dy: 34 * (1 - u), lean: 0.2 * u, aLu: 1.4, aLf: 0.6, aRu: 1.4, aRf: 0.6 }); }, 0.8);
      LD.tw = null; LD.ang = dir * 1.5;
      await allOf([climber].concat(holder ? [holder] : []), function (a) { return laugh(a, 1.8, 0); });
    }
    // bawa pergi tangganya
    var carrier = holder || climber;
    LD.mode = 'free'; LD.ang = LD.ang || 0;
    if (abs(LD.ang) > 1) { carrier.hold = 'ladder'; LD.mode = 'carry'; LD.carrier = carrier; LD.dir = dir; }
    else { await walkTo(carrier, LD.x - dir * 14 * b, 40); carrier.face = dir; var f1 = LD.ang; await carrier.run(function (t) { var u = Math.min(1, t / 0.8), e = u * u * (3 - 2 * u); LD.ang = f1 + (dir * 1.28 - f1) * e; carrier.k = 12; carrier.set({ lean: 0.18, aRu: 2.1, aRf: 2.4 }); return u >= 1; }); carrier.hold = 'ladder'; LD.mode = 'carry'; LD.carrier = carrier; LD.dir = dir; }
    var others = [climber, holder, D].filter(function (a) { return a && a !== carrier; });
    await Promise.all([carrier.run(function (t, dt) { var tx = dir > 0 ? S.W + 130 * b : -130 * b, d = tx - carrier.x, st = 38 * b * dt; carrier.k = 14; carrier.face = dir; if (abs(d) <= st) return true; carrier.x += dir * st; carrier.walk += st * 0.095 / b; carrier.set(walkPose(carrier.walk, 34, { aRu: 1.15, aRf: 2.0, aLu: 0.6, aLf: 1.3, lean: 0.1 })); })].concat(others.map(function (a, i) { return sleep(1 + i).then(function () { return leave(a, 48); }); })));
    LD.mode = ''; LD.a = 0; S.actors.forEach(function (a) { a.fy = rnd(0, 4); a.hold = ''; });
  }
  function max0(v) { return v > 0 ? v : 0; }

  /* ---------- scene: bangun pakai block Minecraft ---------- */
  var BK = { grass: ['#8b6a43', '#5a4228', '#a07a50'], stone: ['#8d9199', '#5d6169', '#a8acb4'], plank: ['#b88c52', '#7a5a30', '#cfa468'], dirt: ['#7a5a3a', '#4e3a24', '#94724b'], brick: ['#b2543f', '#6e2f22', '#c9715b'], log: ['#6e5230', '#3f2e18', '#86653b'] };
  var UB = 14;
  function blockG(kind, par) {
    var g = mk('g', {}, par), c = BK[kind], i;
    mk('rect', { x: -UB / 2, y: -UB / 2, width: UB, height: UB, fill: c[0], stroke: c[1], 'stroke-width': 1.3 }, g);
    if (kind === 'grass') mk('rect', { x: -UB / 2 + 0.6, y: -UB / 2 + 0.6, width: UB - 1.2, height: 4, fill: '#5aa832' }, g);
    if (kind === 'plank') { mk('path', { d: 'M-7 -2H7M-7 3H7', stroke: c[1], 'stroke-width': 0.9, opacity: 0.7 }, g); }
    else if (kind === 'brick') { mk('path', { d: 'M-7 -2H7M-7 3H7M-2 -7V-2M3 -2V3M-3 3V7', stroke: c[1], 'stroke-width': 0.9, opacity: 0.8 }, g); }
    else for (i = 0; i < 4; i++) mk('rect', { x: -5 + rnd(0, 8), y: -2 + rnd(-4, 7), width: 2.4, height: 2.4, fill: c[2], opacity: 0.9 }, g);
    return g;
  }
  function addBlock(kind, x, y) { var o = { g: blockG(kind, S.gblk), kind: kind, x: x, y: y, vx: 0, vy: 0, fly: false, rt: 0, a: 1, vr: 0 }; S.blocks.push(o); return o; }
  function clearBlocks() { S.blocks.forEach(function (o) { o.g.remove(); }); S.blocks = []; S.chest.ta = 0; S.cre.on = false; }
  function buildPlan() {
    var m = pick(['house', 'house', 'tower', 'pyramid']), cells = [], r, c;
    if (m === 'house') { for (r = 0; r < 3; r++) for (c = 0; c < 5; c++) { if (c === 2 && r < 2) continue; cells.push({ r: r, c: c, k: r === 0 ? 'stone' : 'plank' }); } for (c = 0; c < 5; c++) cells.push({ r: 3, c: c, k: 'brick' }); for (c = 1; c < 4; c++) cells.push({ r: 4, c: c, k: 'brick' }); }
    else if (m === 'tower') { for (r = 0; r < 5; r++) for (c = 0; c < 2; c++) cells.push({ r: r, c: c, k: r < 2 ? 'stone' : r < 4 ? 'plank' : 'brick' }); }
    else { var w = 5; for (r = 0; r < 3; r++) { for (c = r; c < w - r; c++) cells.push({ r: r, c: c, k: r === 0 ? 'stone' : r === 1 ? 'dirt' : 'grass' }); } }
    var cols = m === 'tower' ? 2 : 5; return { m: m, cells: cells, cols: cols };
  }
  async function sceneBuild() {
    var b = S.b, L = shuffle(S.cast), plan = buildPlan(), u = UB * b, sx = S.W * rnd(0.42, 0.6), chestX = Math.max(34 * b, sx - plan.cols * u / 2 - 70 * b), left = sx - plan.cols * u / 2;
    S.chest.x = chestX; S.chest.ta = 1;
    var queue = plan.cells.slice().sort(function (p, q) { return p.r - q.r || p.c - q.c; }), placed = 0, total = queue.length;
    var ent = L.map(function (a, i) { return sleep(i * rnd(0.8, 1.6)).then(function () { return enter(a, -1, chestX + 18 * b + i * 12 * b, rnd(40, 55)); }); });
    await Promise.all(ent);
    var gen = S.gen, workers = L.slice(0, Math.min(L.length, 3));
    async function worker(a, wi) {
      while (queue.length && gen === S.gen) {
        var cell = queue.shift(), tx = left + (cell.c + 0.5) * u, ty = S.floor - (cell.r + 0.5) * u;
        await walkTo(a, chestX + (16 + wi * 11) * b, rnd(45, 62)); a.face = -1;
        await a.run(function (t) { a.k = 10; a.face = -1; var w = Math.min(1, t / 0.4); a.set({ lean: 0.3 * w, aLu: 0.8, aLf: 1.4, aRu: 0.8, aRf: 1.4, tLt: 0.1, tRt: 0.1 }); }, 0.55);
        a.hold = 'block'; a.bkc = BK[cell.k][0];
        var side = tx > a.x ? 1 : -1; await walkTo(a, tx - side * 11 * b - (cell.r >= 2 ? side * 0 : 0), rnd(48, 66));
        a.face = side; var ob = null;
        await a.run(function (t) {
          a.k = 18; a.face = side; var w = Math.min(1, t / 0.35), up = cell.r >= 2 ? 1 : 0.5 * cell.r;
          a.set({ lean: 0.1 * w, aRu: (0.8 + (1.2 + up * 0.5) * w), aRf: 1.5 + (0.9 + up * 0.4) * w, aLu: 0.8 + (1.0 + up * 0.5) * w, aLf: 1.4 + (0.9 + up * 0.4) * w, dy: cell.r >= 3 ? -5 * sin(w * 3.14) : 0 });
          if (t > 0.38 && !ob) { ob = addBlock(cell.k, a.hand[0], a.hand[1]); a.hold = ''; ob.tw = { t: 0, dur: 0.22, x0: ob.x, y0: ob.y, x1: tx, y1: ty }; part(tx, ty, BK[cell.k][2], 5, 60, 2); }
        }, 0.62);
        placed++;
        await idle(a, rnd(0.1, 0.5));
      }
    }
    await Promise.all(workers.map(worker));
    var ex = L.slice(3); await sleep(0.7);
    // selesai: sorak
    var ret = Math.random();
    if (ret < 0.45) { // creeper datang
      S.cre.x = Math.random() < 0.5 ? -30 : S.W + 30; S.cre.dir = S.cre.x < 0 ? 1 : -1; S.cre.on = true; S.cre.sw = 0;
      var fleeSide = S.cre.dir > 0 ? 1 : -1;
      await allOf(L, function (a, i) { return a.run(function (t) { a.k = 12; a.face = 0; a.set({ lean: 0.04, aLu: 0.5, aLf: 1.3, aRu: 0.5, aRf: 1.3, tilt: sin(t * 2) * 2 }); }, 1.2 + i * 0.1); });
      var cr = S.cre, target = sx + (cr.dir > 0 ? -1 : 1) * (plan.cols * u / 2 + 10 * b);
      while (S.on && gen === S.gen && (cr.dir > 0 ? cr.x < target : cr.x > target)) {
        cr.x += cr.dir * 30 * b * 0.05; await sleep(0.05);
        if (!cr.alert && abs(cr.x - sx) < 140 * b) { cr.alert = true; L.forEach(function (a) { pop('!', a.x, S.floor - 66 * b, '#ff5252'); }); L.forEach(function (a, i) { sleep(i * 0.1).then(function () { return walkTo(a, fleeSide > 0 ? S.W + 50 : -50, 150); }); }); }
      }
      cr.alert = true;
      await sleep(0.2); cr.sw = 1; await sleep(1.4); cr.on = false; S.flash.t = 0.5; S.flash.x = cr.x; S.flash.y = S.floor - 20 * b; pop('BOOM', cr.x, S.floor - 40 * b, '#ff7043');
      S.blocks.forEach(function (o) { var dx = o.x - cr.x, dd = Math.max(20, abs(dx)); o.fly = true; o.vx = dx / dd * rnd(80, 200) + rnd(-40, 40); o.vy = -rnd(120, 300); o.vr = rnd(-8, 8); });
      part(cr.x, S.floor - 10 * b, '#9ccc65', 14, 220, 3); part(cr.x, S.floor - 10 * b, '#ffb74d', 10, 200, 3);
      await sleep(1.8); clearBlocks();
      await allOf(L, function (a, i) { return sleep(i * 0.4).then(function () { return enter(a, fleeSide, S.W * rnd(0.3, 0.7), rnd(60, 80)); }).then(function () { return i === 0 ? shrug(a, 1.6) : look(a, 1.6); }); });
      S.chest.ta = 0; await leaveAll(L);
    } else {
      await allOf(L, function (a, i) { return a.run(function (t) { a.k = 12; a.face = 0; a.set({ dy: -abs(sin(t * 9 + i)) * 5, aLu: 2.7, aLf: 2.8, aRu: 2.6, aRf: 2.8, tLt: 0.15, tRt: 0.15 }); }, 1.6 + i * 0.2); });
      await sleep(0.8);
      // bongkar pakai beliung, dari atas
      var rm = S.blocks.slice().sort(function (p, q) { return p.y - q.y; }), qi = 0;
      await allOf(L.slice(0, 3), async function (a) {
        a.hold = 'pick';
        while (qi < rm.length && gen === S.gen) {
          var ob = rm[qi++], side = ob.x > a.x ? 1 : -1;
          await walkTo(a, ob.x - side * 14 * b, 60); a.face = side;
          await a.run(function (t) { a.k = 26; a.face = side; var w = (t * 3.2) % 1; a.set({ lean: 0.2 * sin(w * 3.14), aRu: w < 0.5 ? 2.4 - w * 1.5 : 1.0 + (w - 0.5) * 1.2, aRf: w < 0.5 ? 2.4 : 1.2, aLu: 0.8, aLf: 1.2, tLt: 0.15, tRt: 0.1 }); }, 0.55);
          part(ob.x, ob.y, BK[ob.kind][2], 7, 90, 2.5); ob.g.remove(); ob.dead = true;
        }
        a.hold = '';
      });
      S.blocks = S.blocks.filter(function (o) { return !o.dead; }); clearBlocks(); await sleep(0.4); await leaveAll(L);
    }
    S.actors.forEach(function (a) { a.fy = rnd(0, 4); a.hold = ''; });
  }

  /* ---------- scene: perang brutal (lubang di wallpaper, kontak jatuh, lalu undo) ---------- */
  async function sceneWar() {
    var b = S.b, L = shuffle(S.cast), T1 = L.slice(0, Math.ceil(L.length / 2)), T2 = L.slice(T1.length), gen = S.gen;
    T1.forEach(function (a) { a.team = 1; }); T2.forEach(function (a) { a.team = 2; });
    var guard = { lean: 0.1, aLu: 0.6, aLf: 1.6, aRu: 0.4, aRf: 1.7, tLt: 0.25, tRt: -0.2, tLs: 0.1 };
    await Promise.all(T1.map(function (a, i) { return sleep(i * 0.5).then(function () { return enter(a, -1, S.W * 0.28 + i * 24 * b, rnd(60, 80)); }); }).concat(T2.map(function (a, i) { return sleep(i * 0.5).then(function () { return enter(a, 1, S.W * 0.72 - i * 24 * b, rnd(60, 80)); }); })));
    T1.forEach(function (a) { a.face = 1; }); T2.forEach(function (a) { a.face = -1; });
    await allOf(L, function (a, i) { pop(pick(['😡', '💢', '🔥']), a.x, S.floor - 68 * b, '#fff'); return a.run(function (t) { a.k = 12; a.set(mix(guard, { lean: 0.1 + 0.04 * sin(t * 8), dy: -abs(sin(t * 8)) * 1.5 })); }, 1.4 + i * 0.1); });
    // menyerbu
    var mid = S.W / 2;
    await allOf(L, function (a, i) { var tx = mid + (a.team === 1 ? -1 : 1) * (14 + (i % 2) * 22) * b; return walkTo(a, tx, rnd(135, 165)); });
    // adu jotos
    var pairs = []; for (var pi = 0; pi < Math.max(T1.length, T2.length); pi++) pairs.push([T1[pi % T1.length], T2[pi % T2.length]]);
    var rounds = 4;
    for (var r = 0; r < rounds; r++) {
      await allOf(pairs, async function (pr, k) {
        var x = r % 2 ? pr[1] : pr[0], y = x === pr[0] ? pr[1] : pr[0], dir = y.x > x.x ? 1 : -1, last = r === rounds - 1 && k === 0;
        if (Math.random() < 0.35) await kickAct(x, dir, function () { part((x.x + y.x) / 2, S.floor - 40 * b, '#fff', 6, 130, 2.5); pop(pick(['BAM!', 'DUK!']), (x.x + y.x) / 2, S.floor - 64 * b); });
        else await punchAct(x, dir, y, function () { part((x.x + y.x) / 2, S.floor - 44 * b, '#ffe082', 8, 140, 2.5); pop(pick(['POW!', 'BUK!', 'HYAH']), (x.x + y.x) / 2, S.floor - 64 * b); });
        if (last) { // terlempar menembus wallpaper
          var wall = dir > 0 ? S.W - 12 * b : 12 * b, spin = 0;
          await y.run(function (t, dt) { y.k = 20; y.face = -dir; y.x += dir * 330 * b * dt; spin += dt; y.set({ rot: dir * spin * 14, dy: -12 * sin(min1(spin * 3) * 3.14), aLu: 2.8, aLf: 3.0, aRu: 2.8, aRf: 3.0, tLt: 0.5, tRt: -0.4 }); if ((dir > 0 && y.x >= wall) || (dir < 0 && y.x <= wall)) return true; });
          y.x = wall; S.flash.t = 0.35; S.flash.x = wall; S.flash.y = S.floor - 42 * b; hole(wall + dir * 6 * b, S.floor - rnd(30, 52) * b, 26 * b); pop('KRAAAK!', wall - dir * 30 * b, S.floor - 70 * b, '#ff7043');
          y.p.rot = 0; y.p.dy = 0;
          await y.run(function (t) { y.k = 14; y.face = -dir; y.set({ rot: dir * -1.45, dy: 30, aLu: 0.6, aLf: 0.9, aRu: 1.0, aRf: 1.4 }); }, 1.3);
          await y.run(function (t) { y.k = 12; y.face = 0; var u = Math.min(1, t / 0.7); y.x -= dir * 14 * b * 0.016; y.set({ rot: -dir * 1.45 * (1 - u * u), dy: 30 * (1 - u), tilt: sin(t * 9) * 4, aLu: 1.2, aLf: 0.6, aRu: 1.2, aRf: 0.6, lean: 0.2 }); }, 0.9);
          pop('💫', y.x, S.floor - 66 * b, '#fff');
        } else await knock(y, dir, Math.random() < 0.3, false);
      });
    }
    // lempar batu ke layar: lubang dan kontak jatuh
    var rows = rowsNow(), nHit = 0, rocks = [];
    var shooters = shuffle(L), rk = Math.floor(rnd(5, 8));
    var cnt = 0;
    await allOf(shooters, async function (a, i) {
      await sleep(i * 0.35);
      for (var q = 0; q < Math.ceil(rk / shooters.length); q++) {
        if (gen !== S.gen) return;
        var dir = a.x < mid ? 1 : -1, row = null;
        if (rows.length && Math.random() < 0.5) row = rows.splice(Math.floor(Math.random() * rows.length), 1)[0];
        var tx = row ? row.r.left + row.r.width * rnd(0.3, 0.7) : rnd(22, S.W - 22), ty = row ? row.r.top + row.r.height / 2 : rnd(S.H * 0.18, Math.max(S.H * 0.3, S.floor - 90 * b));
        a.face = tx > a.x ? 1 : -1;
        await throwAct(a, a.face, tx, ty, 'rock', rnd(0.6, 0.85), function () {
          S.flash.t = 0.3; S.flash.x = tx; S.flash.y = ty;
          if (row) { rowFall(row.el, tx > row.r.left + row.r.width / 2 ? 1 : -1); pop('JATUH', tx, ty - 12, '#fff'); part(tx, ty, '#e0e0e0', 8, 160, 2.5); }
          else hole(tx, ty, rnd(16, 26) * b);
        });
        await idle(a, rnd(0.15, 0.6));
      }
    });
    await sleep(1.8);
    // lihat kerusakan
    await allOf(L, function (a, i) { return i % 2 ? look(a, 2.2) : shrug(a, 2.2); });
    pop('⏪', S.W / 2, S.floor - 90 * b, '#fff'); S.undo = 1;
    await sleep(0.5); restoreFx(false); part(S.W / 2, S.H * 0.4, '#fff', 20, 260, 3);
    await allOf(L, function (a, i) { return a.run(function (t) { a.k = 14; a.face = 0; a.set({ dy: -abs(sin(t * 10)) * 6, aLu: 2.6, aLf: 2.8, aRu: 2.6, aRf: 2.8 }); }, 1.2); });
    await sleep(0.8); await allOf(L, function (a, i) { return a.run(function (t) { a.k = 12; a.face = 0; a.set({ lean: 0.05, aLu: 0.7, aLf: 1.3, aRu: 0.7, aRf: 1.3, tilt: sin(t * 3) * 3 }); }, 1.6); });
    await leaveAll(L);
    S.actors.forEach(function (a) { a.fy = rnd(0, 4); a.team = 0; });
  }
  function min1(v) { return v > 1 ? 1 : v; }

  var SCENES = [{ f: sceneTalk, n: [2, 3], w: 3 }, { f: sceneSofa, n: [3, 3], w: 2 }, { f: sceneGame, n: [3, 4], w: 2 }, { f: sceneBall, n: [2, 3], w: 2 }, { f: sceneThrow, n: [2, 3], w: 2 }, { f: sceneLadder, n: [2, 3], w: 2 }, { f: sceneBuild, n: [3, 4], w: 3 }, { f: sceneWar, n: [3, 4], w: 3 }, { f: sceneSelfie, n: [3, 4], w: 1 }, { f: sceneDance, n: [2, 3], w: 1 }, { f: sceneRace, n: [3, 4], w: 1 }, { f: scenePortal, n: [2, 3], w: 1 }, { f: sceneChat, n: [2, 3], w: 2 }, { f: scenePeek, n: [1, 2], w: 1 }];

  /* ---------- not ♪ dan kilatan ---------- */
  function spawnNote(a) {
    if (S.notes.length > 8) return;
    var t = mk('text', { fill: a.col, 'font-size': 14, 'font-family': 'sans-serif', 'text-anchor': 'middle' }, S.gfront); t.textContent = Math.random() < 0.5 ? '♪' : '♫';
    S.notes.push({ el: t, x: a.x + rnd(-14, 14), y: S.floor - 70 * S.b, life: 0 });
  }

  /* ---------- gambar ---------- */
  function drawProps(dt) {
    var b = S.b, B = S.bench, V = S.tv;
    B.a += (B.ta - B.a) * (1 - Math.exp(-4 * dt)); V.a += (V.ta - V.a) * (1 - Math.exp(-4 * dt));
    B.g.setAttribute('opacity', B.a.toFixed(2)); B.g.setAttribute('transform', 'translate(' + B.x.toFixed(1) + ' ' + S.floor + ') scale(' + b + ')');
    V.g.setAttribute('opacity', V.a.toFixed(2)); V.g.setAttribute('transform', 'translate(' + V.x.toFixed(1) + ' ' + S.floor + ') scale(' + b + ')');
    if (V.a > 0.05) {
      var t = S.clock, sw = 34, sh = 20, by = tri(t * 1.37) * (sh / 2 - 4), bxx = tri(t * 0.93) * (sw / 2 - 4);
      V.ball.setAttribute('cx', bxx.toFixed(1)); V.ball.setAttribute('cy', (-37 + by).toFixed(1));
      V.p1.setAttribute('y', (-37 + by * 0.8 - 5).toFixed(1)); V.p2.setAttribute('y', (-37 + by * 0.7 - 5).toFixed(1));
    }
    var SF = S.sofa, PT = S.portal;
    SF.a += (SF.ta - SF.a) * (1 - Math.exp(-4 * dt)); PT.a += (PT.ta - PT.a) * (1 - Math.exp(-4 * dt));
    SF.g.setAttribute('opacity', SF.a.toFixed(2)); SF.g.setAttribute('transform', 'translate(' + SF.x.toFixed(1) + ' ' + S.floor + ') scale(' + b + ')');
    PT.g.setAttribute('opacity', PT.a.toFixed(2)); PT.g.setAttribute('transform', 'translate(' + PT.x.toFixed(1) + ' ' + S.floor + ') scale(' + b + ')');
    if (PT.a > 0.05) PT.sw.setAttribute('opacity', (0.55 + 0.35 * sin(S.clock * 5)).toFixed(2));
    for (var bi = S.bubs.length - 1; bi >= 0; bi--) { var q = S.bubs[bi]; q.life += dt; q.y -= q.vy * dt; var al = q.life < 0.25 ? q.life / 0.25 : Math.max(0, 1 - (q.life - 2.4) / 0.8); q.g.setAttribute('transform', 'translate(' + q.x.toFixed(1) + ' ' + q.y.toFixed(1) + ') scale(' + Math.min(1, 0.4 + q.life * 3).toFixed(2) + ')'); q.g.setAttribute('opacity', al.toFixed(2)); if (q.life > 3.3) { q.g.remove(); S.bubs.splice(bi, 1); } }
    var LD = S.lad; LD.a += (LD.mode ? 1 - LD.a : -LD.a) * (1 - Math.exp(-10 * dt));
    if (LD.tw) { LD.tw.t += dt; var tu = Math.min(1, LD.tw.t / LD.tw.dur); LD.ang = LD.tw.from + (LD.tw.to - LD.tw.from) * tu * tu; }
    if (LD.mode === 'carry' && LD.carrier) { var cc = LD.carrier, d0 = LD.dir || cc.face || 1, an = d0 * 1.28, sh = (cc.hipY || S.floor) - 22 * S.b, l0 = 30 * S.b, hx0 = cc.hipX != null ? cc.hipX : cc.x; LD.ox = hx0 - d0 * sin(an) * l0 * 1; LD.oy = sh + cos(an) * l0; LD.ang = an; }
    else if (LD.mode) { LD.ox = LD.x; LD.oy = S.floor; }
    LD.g.setAttribute('opacity', LD.mode ? '1' : '0'); if (LD.mode) LD.g.setAttribute('transform', 'translate(' + LD.ox.toFixed(1) + ' ' + LD.oy.toFixed(1) + ') rotate(' + (LD.ang * 57.2958).toFixed(1) + ') scale(' + (S.b).toFixed(2) + ')');
    var CH = S.chest; CH.a += (CH.ta - CH.a) * (1 - Math.exp(-5 * dt)); CH.g.setAttribute('opacity', CH.a.toFixed(2)); CH.g.setAttribute('transform', 'translate(' + CH.x.toFixed(1) + ' ' + S.floor + ') scale(' + b + ')');
    var CR = S.cre; CR.g.setAttribute('opacity', CR.on ? '1' : '0'); if (CR.on) { var wob = CR.sw ? 1 + 0.18 * CR.sw * sin(S.clock * 30) + 0.12 * CR.sw : 1, wf = CR.sw ? 0 : sin(S.clock * 9) * 2; CR.g.setAttribute('transform', 'translate(' + CR.x.toFixed(1) + ' ' + S.floor + ') scale(' + (b * wob).toFixed(3) + ')'); CR.legs.setAttribute('transform', 'translate(' + wf.toFixed(1) + ' 0)'); CR.body.setAttribute('fill', CR.sw && sin(S.clock * 26) > 0 ? '#fff' : '#5fa83a'); CR.head.setAttribute('fill', CR.sw && sin(S.clock * 26) > 0 ? '#fff' : '#6dbb44'); }
    S.blocks.forEach(function (o) {
      if (o.tw) { o.tw.t += dt; var u = Math.min(1, o.tw.t / o.tw.dur), e = u * u * (3 - 2 * u); o.x = o.tw.x0 + (o.tw.x1 - o.tw.x0) * e; o.y = o.tw.y0 + (o.tw.y1 - o.tw.y0) * e - 8 * sin(u * 3.14); if (u >= 1) o.tw = null; }
      if (o.fly) { o.vy += 620 * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rt += o.vr * dt; if (o.y > S.floor - 7 * b) { o.y = S.floor - 7 * b; o.vy *= -0.3; o.vx *= 0.6; } }
      o.g.setAttribute('transform', 'translate(' + o.x.toFixed(1) + ' ' + o.y.toFixed(1) + ') rotate(' + (o.rt * 57).toFixed(0) + ') scale(' + b + ')');
    });
    if (S.undo > 0) { S.undo -= dt * 2; S.fade.setAttribute('opacity', (Math.max(0, S.undo) * 0.45).toFixed(2)); } else S.fade.setAttribute('opacity', '0');
    fxStep(dt);
    var bl = S.ball;
    if (bl.fly) bl.fly(dt);
    bl.el.setAttribute('visibility', bl.on ? 'visible' : 'hidden'); bl.el.setAttribute('cx', bl.x.toFixed(1)); bl.el.setAttribute('cy', bl.y.toFixed(1)); bl.el.setAttribute('r', (4.2 * b).toFixed(1));
    var fl = S.flash; if (fl.t > 0) { fl.t -= dt; var u = Math.max(0, fl.t / 0.45); fl.el.setAttribute('visibility', 'visible'); fl.el.setAttribute('cx', fl.x); fl.el.setAttribute('cy', fl.y); fl.el.setAttribute('r', (6 + (1 - u) * 46).toFixed(1)); fl.el.setAttribute('opacity', (u * 0.85).toFixed(2)); } else fl.el.setAttribute('visibility', 'hidden');
    for (var i = S.notes.length - 1; i >= 0; i--) { var n = S.notes[i]; n.life += dt; n.y -= 22 * dt; n.x += sin(n.life * 3) * 8 * dt; n.el.setAttribute('x', n.x.toFixed(1)); n.el.setAttribute('y', n.y.toFixed(1)); n.el.setAttribute('opacity', Math.max(0, 1 - n.life / 2.2).toFixed(2)); if (n.life > 2.2) { n.el.remove(); S.notes.splice(i, 1); } }
  }
  function visible() { return S.host && S.host.isConnected && !S.host.hidden && !document.hidden && S.host.getClientRects().length > 0; }
  function frame(now) {
    S.raf = 0; if (!S.on) return;
    if (!visible()) { S.last = 0; S.tm = setTimeout(function () { S.tm = 0; S.raf = requestAnimationFrame(frame); }, 400); return; }
    var dt = S.last ? Math.min(0.05, (now - S.last) / 1000) : 0.016; S.last = now; S.clock += dt;
    var w = S.host.clientWidth, hh = S.host.clientHeight; if (w && (abs(w - S.W) > 2 || (S.floorFn && abs(hh - S.H) > 2))) layout(w, hh);
    if (S.floorFn && !S.pend) { var ty = S.floorFn(); if (ty) { var df = ty - S.floor; S.floor += abs(df) > 150 ? df : df * (1 - Math.exp(-9 * dt)); } }
    var ws = S.waiters; S.waiters = [];
    ws.forEach(function (x) { if (x.g !== S.gen) return; if (x.t <= S.clock) x.res(); else S.waiters.push(x); });
    S.actors.forEach(function (a) { if (a.down && !a.held && S.clock - a.down.t > 0.4) liftStart(a, a.down.px, a.down.py); a.update(dt); a.draw(); });
    var ord = S.actors.slice().sort(function (p, q) { return q.fy - p.fy || p.i - q.i; }), key = ord.map(function (a) { return a.i; }).join('');
    if (key !== S.order) { S.order = key; ord.forEach(function (a) { S.gact.appendChild(a.g); }); }
    drawProps(dt);
    S.raf = requestAnimationFrame(frame);
  }
  function layout(w, h) {
    S.W = w; S.H = S.floorFn ? (h || 640) : 210; S.b = Math.max(0.7, Math.min(1.15, w / 420)); if (!S.floorFn) S.floor = S.H - 6; else S.floor = S.floorFn() || S.H - 70;
    S.svg.setAttribute('viewBox', '0 0 ' + S.W + ' ' + S.H); S.svg.setAttribute('width', S.W); S.svg.setAttribute('height', S.H);
  }

  /* ---------- siklus panjang: kelompok kecil, sebagian absen ---------- */
  function pickCast(n) { var c = shuffle(S.actors).slice(0, n); return c; }
  async function ambient(free, gen) { // yang tidak ikut scene: lewat sebentar, lihat-lihat, lalu pergi
    var a = pick(free); if (!a) return;
    try {
      await sleep(rnd(3, 12)); if (gen !== S.gen) return;
      a.fy = 12; var side = Math.random() < 0.5 ? -1 : 1;
      await enter(a, side, S.W * rnd(0.25, 0.75), rnd(28, 42)); await look(a, rnd(2, 5));
      if (Math.random() < 0.5) { await walkTo(a, S.W * rnd(0.15, 0.85), rnd(26, 40)); await look(a, rnd(1.5, 3)); }
      await leave(a, rnd(34, 48)); a.fy = rnd(0, 4);
    } catch (e) {}
  }
  function weighted() { var tot = 0; SCENES.forEach(function (c) { tot += c.w; }); var r = Math.random() * tot; for (var i = 0; i < SCENES.length; i++) { r -= SCENES[i].w; if (r <= 0) return SCENES[i]; } return SCENES[0]; }
  async function loop(gen) {
    try {
      await sleep(1.2); var last = null;
      while (S.on && gen === S.gen) {
        var n = 5 + Math.floor(Math.random() * 3);
        for (var i = 0; i < n; i++) {
          reset(); await sleep(rnd(2, 6));
          var sc = weighted(); if (sc === last) sc = weighted(); last = sc;
          var k = sc.n[0] + Math.floor(Math.random() * (sc.n[1] - sc.n[0] + 1)); S.cast = pickCast(k);
          var free = S.actors.filter(function (a) { return S.cast.indexOf(a) < 0; });
          if (free.length && Math.random() < 0.4) ambient(free, gen);
          await sc.f();
          S.actors.forEach(function (a) { a.hold = ''; });
          await sleep(rnd(1.2, 3));
        }
        reset(); await sleep(rnd(10, 18)); // semua ngumpet dulu sebelum mengulang
      }
    } catch (e) { if (S.on && gen === S.gen) console.error('stickman', e); }
  }

  /* ---------- sentuh: kaget, diangkat jari, yang lain panik dan menolong ---------- */
  function bindHit(a) {
    var el = a.hit = mk('rect', { fill: 'rgba(0,0,0,0)' }, S.ghit);
    el.style.cssText = 'pointer-events:all;touch-action:none;cursor:grab;display:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent';
    function pos(e) { var r = S.host.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('pointerdown', function (e) {
      if (!S.on || (S.pend && !a.held)) return; e.preventDefault(); e.stopPropagation(); var p = pos(e);
      a.down = { x: e.clientX, y: e.clientY, t: S.clock, id: e.pointerId, px: p[0], py: p[1] }; try { el.setPointerCapture(e.pointerId); } catch (_) {}
    });
    el.addEventListener('pointermove', function (e) {
      var d = a.down; if (!d || d.id !== e.pointerId) return; e.preventDefault(); var p = pos(e); d.px = p[0]; d.py = p[1];
      if (a.held) { a.px = p[0]; a.py = p[1]; } else if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) liftStart(a, p[0], p[1]);
    });
    function end(e) {
      var d = a.down; if (!d || (e && d.id !== e.pointerId)) return; a.down = null;
      if (a.held) liftEnd(a); else tap(a);
    }
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  function tap(a) { if (S.pend || a.held) return; a.st = 0.85; pop(pick(['!', 'EH?!', '😲', 'WAH!']), a.x, S.floor - 74 * S.b * a.p.sc - a.fy, '#fff'); part(a.x, S.floor - 4, '#cfd3dc', 4, 50, 2); }
  function liftStart(a, px, py) {
    if (S.pend || S.lifting || !S.on) return;
    S.lifting = a; S.pend = 1; S.gen++; var gen = S.gen; S.waiters = []; clearTimeout(S.areaT);
    S.actors.forEach(function (x) { x.drop(); x.hold = ''; x.st = 0; x.rot = 0; });
    clearProps(); a.held = true; a.px = px; a.py = py; a.hv = 0; a.fy = 0; a.sc = 1; a.p.sc = 1; a.face = 0; a.liftY = Math.max(0, S.floor - py - 43 * S.b * 1);
    pop('WAAA!', px, py - 60 * S.b, '#fff'); rescue(gen, a);
  }
  function liftEnd(a) {
    if (!a.held) return; a.held = false; var gen = S.gen, vy = 0, dir = a.hv > 0 ? 1 : -1;
    a.fall = a.run(function (t, dt) {
      vy += 1500 * dt; a.liftY -= vy * dt; a.k = 14; a.face = 0; a.x += clampN(a.hv, -220, 220) * dt * Math.exp(-t * 4);
      a.set({ aLu: 2.8, aLf: 3.0, aRu: 2.8, aRf: 3.0, tLt: 0.4, tRt: -0.4, rot: dir * 0.2 });
      if (a.liftY <= 0) { a.liftY = 0; return true; }
    });
  }
  function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  async function rescue(gen, a) {
    try {
      var b = S.b, others = S.actors.filter(function (h) { return h !== a; }), onS = others.filter(onStage), off = shuffle(others.filter(function (h) { return !onStage(h); }));
      var team = onS.concat(off.slice(0, Math.max(0, 3 - onS.length)));
      var bubs = ['!', '😱', '?!', 'TOLONG!', '🆘'];
      var tasks = team.map(function (h, i) {
        return (async function () {
          if (!onStage(h)) { h.fy = 0; await sleep(i * 0.25); await enter(h, h.i % 2 ? 1 : -1, a.px + (h.i % 2 ? 1 : -1) * rnd(40, 90) * b, rnd(150, 180)); }
          pop('!', h.x, S.floor - 76 * b, '#ff5252');
          await h.run(function (t) { h.k = 20; h.face = 0; h.set(panicPose(t, h, i)); }, 0.7);
          while (a.held && gen === S.gen) {
            var tx = a.x + (h.x < a.x ? -1 : 1) * rnd(12, 46) * b; await walkTo(h, tx, rnd(120, 170)); if (!a.held || gen !== S.gen) break;
            var kind = Math.random();
            if (kind < 0.6) await h.run(function (t) { h.k = 22; h.face = 0; var w = abs(sin(t * 8 + i)); h.set({ lean: -0.05, dy: -w * 13, aLu: 2.9, aLf: 3.0, aRu: 2.9, aRf: 3.0, tLt: 0.3, tRt: 0.3 }); }, rnd(0.8, 1.5));
            else await h.run(function (t) { h.k = 18; h.face = 0; h.set(panicPose(t, h, i + 2)); }, rnd(0.6, 1.2));
            if (Math.random() < 0.5) bubble(h.x + 6 * b, S.floor - 70 * b, pick(bubs), '#b85450');
          }
        })();
      });
      while (a.held && gen === S.gen) await sleep(0.1);
      if (gen !== S.gen) return;
      if (a.fall) await a.fall; if (gen !== S.gen) return;
      pop('BRUK!', a.x, S.floor - 40 * b, '#ffd54a'); part(a.x, S.floor, '#cfd3dc', 8, 100, 2.5);
      var dir = Math.random() < 0.5 ? 1 : -1;
      a.run(function (t) { a.k = 12; a.face = -dir; a.set(lieOf(dir)); }, 60);
      await sleep(0.4);
      await Promise.all(tasks.map(function (p) { return Promise.race([p, sleep(0.8)]); }));
      var hp = team.slice().sort(function (p, q) { return abs(p.x - a.x) - abs(q.x - a.x); }), hero = hp[0];
      await allOf(hp, function (h, i) { return walkTo(h, a.x - dir * (24 + i * 18) * b, 140); });
      hero.face = dir; var pull = a.run(function (t) { a.k = 13; a.face = -dir; var u = Math.min(1, Math.max(0, (t - 1.2) / 0.8)); a.set({ rot: dir * 1.5 * (1 - u * u), dy: 34 * (1 - u), aRu: 1.2 + 0.5 * (1 - u), aRf: 1.6, aLu: 1.4, aLf: 0.6, lean: 0.25 * u }); }, 2.2);
      var assist = hp.map(function (h, i) { return h === hero ? h.run(function (t) { h.k = 13; h.face = dir; var u = Math.min(1, t / 0.6), pl = t > 1.2 ? -0.25 : 0.35; h.set({ lean: pl * u, aRu: 1.15, aRf: 1.55, aLu: 0.5, aLf: 1.0, tLt: 0.2, tRt: -0.25 }); }, 2.3) : h.run(function (t) { h.k = 12; h.face = dir; h.set({ lean: 0.2, aRu: 1.2, aRf: 1.5, aLu: 1.2, aLf: 1.5, tilt: 2 * sin(t * 6) }); }, 2.3); });
      await Promise.all(assist.concat([pull]));
      a.p.rot = 0; a.p.dy = 0;
      bubble(a.x, S.floor - 66 * b, '😅', '#4e9b5a');
      await allOf([a].concat(hp), function (h, i) { return i === 0 ? a.run(function (t) { a.k = 10; a.face = 0; a.set({ lean: 0.08, tilt: sin(t * 7) * 4, aLu: 0.7, aLf: 1.3, aRu: 0.7, aRf: 1.3 }); }, 1.6) : h.run(function (t) { h.k = 12; h.face = 0; h.set({ dy: -abs(sin(t * 9 + i)) * 4, aLu: 2.7, aLf: 2.8, aRu: 2.6, aRf: 2.8 }); }, 1.6); });
      await leaveAll([a].concat(hp));
    } catch (e) { console.error('stickman rescue', e); }
    if (gen !== S.gen) return;
    S.lifting = null; S.pend = 0; S.actors.forEach(function (x) { x.fy = rnd(0, 4); x.held = false; x.liftY = 0; x.p.rot = 0; });
    if (S.on) loop(gen);
  }

  function start(host, opts) {
    if (S.on) return; S.on = true; S.host = host; S.floorFn = opts && opts.floor || null; S.areaKey = ''; S.pend = 0; S.bubs = []; S.gen++; S.clock = 0; S.waiters = []; S.notes = []; S.order = '';
    host.replaceChildren(); host.hidden = false;
    S.svg = mk('svg', { 'aria-hidden': 'true', focusable: 'false' }, host); S.svg.style.cssText = 'display:block;width:100%;height:' + (S.floorFn ? '100%' : '210px') + ';overflow:hidden';
    S.ghole = mk('g', {}, S.svg); S.fade = mk('rect', { x: 0, y: 0, width: 4000, height: 4000, fill: '#fff', opacity: 0 }, S.svg);
    var gback = mk('g', {}, S.svg); S.gblk = mk('g', {}, S.svg);
    // TV pong
    var tv = mk('g', { opacity: 0 }, gback); mk('rect', { x: -4, y: -4, width: 8, height: 4, fill: '#3a4358' }, tv);
    mk('rect', { x: -26, y: -52, width: 52, height: 40, rx: 5, fill: '#10151f', stroke: '#4a5470', 'stroke-width': 2 }, tv); mk('rect', { x: -19, y: -47, width: 38, height: 28, rx: 2, fill: '#0f3a2a' }, tv);
    mk('rect', { x: -17, y: -37, width: 3, height: 10, fill: '#cfe' }, tv).setAttribute('class', 'p0');
    var p1 = mk('rect', { x: -16, y: -42, width: 3, height: 10, fill: '#cfe' }, tv), p2 = mk('rect', { x: 13, y: -42, width: 3, height: 10, fill: '#cfe' }, tv), tb = mk('circle', { r: 2.2, cx: 0, cy: -37, fill: '#fff' }, tv);
    S.tv = { g: tv, x: S.W - 44, a: 0, ta: 0, ball: tb, p1: p1, p2: p2 };
    var bn = mk('g', { opacity: 0 }, gback);
    mk('rect', { x: -52, y: -14, width: 104, height: 6, rx: 3, fill: '#8d6e4c' }, bn); mk('rect', { x: -48, y: -8, width: 5, height: 8, fill: '#6d5237' }, bn); mk('rect', { x: 43, y: -8, width: 5, height: 8, fill: '#6d5237' }, bn);
    S.bench = { g: bn, x: -100, a: 0, ta: 0 };
    var sf = mk('g', { opacity: 0 }, gback);
    mk('rect', { x: -60, y: -46, width: 120, height: 30, rx: 10, fill: '#7d7765' }, sf); mk('rect', { x: -66, y: -28, width: 16, height: 26, rx: 7, fill: '#9a937d' }, sf); mk('rect', { x: 50, y: -28, width: 16, height: 26, rx: 7, fill: '#9a937d' }, sf);
    mk('rect', { x: -56, y: -18, width: 112, height: 14, rx: 5, fill: '#b3ab92' }, sf); mk('rect', { x: -56, y: -6, width: 4, height: 6, fill: '#5d584a' }, sf); mk('rect', { x: 52, y: -6, width: 4, height: 6, fill: '#5d584a' }, sf);
    S.sofa = { g: sf, x: -200, a: 0, ta: 0 };
    var pt = mk('g', { opacity: 0 }, gback);
    mk('rect', { x: -17, y: -58, width: 34, height: 58, rx: 3, fill: '#1b1030', stroke: '#3a2a5a', 'stroke-width': 4 }, pt);
    var sw = mk('rect', { x: -11, y: -52, width: 22, height: 50, rx: 2, fill: '#8a3ffc' }, pt);
    S.portal = { g: pt, x: -200, a: 0, ta: 0, sw: sw };
    var lg = mk('g', { opacity: 0 }, gback), Ll = 100;
    mk('path', { d: 'M-6 0V-' + Ll + 'M6 0V-' + Ll, stroke: '#c58a45', 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }, lg);
    var rg = ''; for (var ri = 1; ri < 11; ri++) rg += 'M-6 -' + (ri * 9) + 'H6'; mk('path', { d: rg, stroke: '#a26d31', 'stroke-width': 2.4, 'stroke-linecap': 'round', fill: 'none' }, lg);
    S.lad = { g: lg, x: 0, ox: 0, oy: 0, ang: 0, mode: '', a: 0, carrier: null, dir: 1, len: 84, tw: null };
    var ch = mk('g', { opacity: 0 }, gback); mk('rect', { x: -13, y: -16, width: 26, height: 16, rx: 2, fill: '#9a6a30', stroke: '#5b3b17', 'stroke-width': 1.6 }, ch); mk('rect', { x: -13, y: -16, width: 26, height: 5, fill: '#b58445', stroke: '#5b3b17', 'stroke-width': 1.2 }, ch); mk('rect', { x: -2.5, y: -13, width: 5, height: 6, fill: '#f0c24a', stroke: '#5b3b17', 'stroke-width': 1 }, ch);
    S.chest = { g: ch, x: -100, a: 0, ta: 0 };
    var cg = mk('g', { opacity: 0 }, gback), cl = mk('g', {}, cg); mk('rect', { x: -7, y: -9, width: 5, height: 9, fill: '#4a8f2c' }, cl); mk('rect', { x: 2, y: -9, width: 5, height: 9, fill: '#4a8f2c' }, cl);
    var cbody = mk('rect', { x: -7, y: -25, width: 14, height: 17, fill: '#5fa83a' }, cg), chead = mk('rect', { x: -9, y: -42, width: 18, height: 18, fill: '#6dbb44', stroke: '#3d7a22', 'stroke-width': 1.2 }, cg);
    mk('rect', { x: -6, y: -37, width: 4, height: 5, fill: '#10200a' }, cg); mk('rect', { x: 2, y: -37, width: 4, height: 5, fill: '#10200a' }, cg); mk('rect', { x: -2.5, y: -32, width: 5, height: 8, fill: '#10200a' }, cg);
    S.cre = { g: cg, legs: cl, body: cbody, head: chead, x: -100, on: false, dir: 1, sw: 0, alert: false };
    S.gact = mk('g', {}, S.svg); S.gfront = mk('g', {}, S.svg);
    S.ball = { el: mk('circle', { fill: '#f5f5f5', stroke: '#9aa3b8', 'stroke-width': 1, visibility: 'hidden' }, S.gfront), x: 0, y: 0, on: false, fly: null, vy: 0 };
    S.flash = { el: mk('circle', { fill: '#fff', visibility: 'hidden' }, S.gfront), t: 0, x: 0, y: 0 };
    S.actors = COLORS.map(function (c, i) { return new Actor(i, S.gact); });
    S.ghit = mk('g', {}, S.svg); S.rowsFn = opts && opts.rows || null; S.cast = S.actors.slice(0, 4); S.lifting = null; S.parts = []; S.pops = []; S.projs = []; S.holes = []; S.rfx = []; S.blocks = []; S.undo = 0;
    S.actors.forEach(bindHit);
    layout(host.clientWidth || 360, host.clientHeight || 210);
    S.last = 0; S.raf = requestAnimationFrame(frame);
    loop(S.gen);
  }

  /* ---------- ikut pindah area aplikasi ---------- */
  async function follow(gen, dir, mode) {
    try {
      S.pend = 1;
      var vis = S.actors.filter(function (a) { return a.x > -35 && a.x < S.W + 35 && a.rise > 0.5; }), b = S.b;
      S.bench.ta = 0; S.tv.ta = 0; S.sofa.ta = 0; S.portal.ta = 0; S.ball.on = false; S.ball.fly = null;
      S.actors.forEach(function (a) { a.hold = ''; a.fy = rnd(0, 4); a.sc = 1; a.p.sc = 1; });
      // yang lagi kelihatan lari ke tepi terdekat (menyusul)
      await allOf(vis, function (a, i) { return sleep(i * 0.12).then(function () { var side = a.x < S.W / 2 ? -1 : 1; return walkTo(a, side < 0 ? -60 : S.W + 60, rnd(150, 190)); }); });
      if (gen !== S.gen) return;
      var old = S.floor; reset(); S.floor = S.floorFn ? (S.floorFn() || old) : old; S.pend = 0;
      await sleep(rnd(0.5, 1.1));
      var side = dir > 0 ? 1 : -1, L = shuffle(S.actors).slice(0, 2 + Math.floor(Math.random() * 2)), xs = slots(L.length, 40);
      if (mode === 'msg') { // ada pesan masuk: satu stickman lari membawa gelembung chat, melambai, lalu pergi
        var st = L[0], tx = S.W * rnd(0.3, 0.7), bt = 0;
        await enter(st, 1, tx, rnd(150, 185));
        bubble(st.x + 10 * S.b, S.floor - 66 * S.b, '💬', '#4e9b5a');
        await st.run(function (t) { st.face = 0; st.k = 12; st.set({ dy: -abs(sin(t * 8)) * 3, aLu: 2.7 + 0.3 * sin(t * 8), aLf: 2.8, aRu: 0.2, aRf: 0.3, lean: 0.02 }); if (t > 0.8 && !bt) { bt = 1; bubble(st.x - 6 * S.b, S.floor - 70 * S.b, '👋', '#4a6fb8'); } }, 2.6);
        await leave(st, rnd(120, 160));
        S.pend = 0; if (S.on && gen === S.gen) loop(gen); return;
      }
      // tiba di area baru sambil berlari, lalu terengah dan melambai
      await allOf(L, function (a, i) { return sleep(i * rnd(0.25, 0.5)).then(function () { return enter(a, side, xs[i], rnd(140, 185)); }).then(function () {
        return a.run(function (t) { a.face = 0; a.k = 10; a.set({ lean: 0.3 + 0.04 * sin(t * 9), dy: abs(sin(t * 9)) * 1.2, aLu: 0.25, aLf: 0.45, aRu: 0.2, aRf: 0.4, tLt: 0.08, tRt: 0.08, tilt: sin(t * 3) * 2 }); }, rnd(1.2, 2));
      }).then(function () { return look(a, rnd(1.5, 3)); }); });
      await sleep(rnd(1.5, 3));
      await leaveAll(L);
    } catch (e) { console.error('stickman follow', e); }
    S.pend = 0;
    if (S.on && gen === S.gen) loop(gen);
  }

  /* ---------- bereaksi: pesan baru datang, kurir stickman ---------- */
  async function courier(gen) {
    try {
      S.pend = 1;
      var b = S.b, vis = S.actors.filter(function (a) { return a.x > -35 && a.x < S.W + 35 && a.rise > 0.5; });
      S.bench.ta = 0; S.tv.ta = 0; S.sofa.ta = 0; S.portal.ta = 0; S.ball.on = false; S.ball.fly = null;
      await allOf(vis, function (a, i) { return sleep(i * 0.1).then(function () { a.hold = ''; return walkTo(a, a.x < S.W / 2 ? -60 : S.W + 60, rnd(150, 190)); }); });
      if (gen !== S.gen) return;
      reset(); S.pend = 0;
      var L = shuffle(S.actors), star = L[0], rest = L.slice(1), side = Math.random() < 0.5 ? -1 : 1, cx = S.W * rnd(0.4, 0.6);
      star.hold = 'phone';
      await enter(star, side, cx, rnd(150, 180));
      await star.run(function (t) { star.face = 0; star.k = 10; star.set({ lean: 0.25 * Math.max(0, 1 - t * 2), aLu: 0.2, aLf: 0.3, aRu: 2.3 + 0.1 * sin(t * 12), aRf: 2.2, tilt: 0 }); }, 0.9);
      bubble(star.x + 12 * b, S.floor - 66 * b, '💬', '#4e9b5a');
      await sleep(0.6);
      var cheer = rest.slice(0, 2).map(function (a, i) {
        return sleep(i * 0.3).then(function () { return enter(a, i % 2 ? 1 : -1, cx + (i % 2 ? 1 : -1) * (30 + i * 12) * b, rnd(140, 180)); }).then(function () {
          return a.run(function (t) { a.face = 0; a.k = 12; a.set({ dy: -abs(sin(t * 9 + i)) * 6, aLu: 2.7, aLf: 2.8, aRu: 2.6, aRf: 2.8, tLt: 0.15, tRt: 0.15 }); }, rnd(1.8, 2.8));
        });
      });
      await Promise.all(cheer.concat([star.run(function (t) { star.face = 0; star.k = 10; star.set({ aRu: 2.3 + 0.1 * sin(t * 12), aRf: 2.2 + 0.4 * sin(t * 12), aLu: 2.6, aLf: 2.7, dy: -abs(sin(t * 8)) * 4 }); }, 2.8)]));
      star.hold = ''; await leaveAll(S.actors.filter(function (a) { return a.x > -40 && a.x < S.W + 40; }));
    } catch (e) { console.error('stickman courier', e); }
    S.pend = 0;
    if (S.on && gen === S.gen) loop(gen);
  }
  function react(kind) {
    if (!S.on || S.pend || !visible() || Date.now() - (S.reactAt || 0) < 45000) return;
    S.reactAt = Date.now();
    S.gen++; S.waiters = []; S.actors.forEach(function (a) { a.drop(); });
    courier(S.gen);
  }
  function alertMsg() {
    if (!S.on || S.pend) return;
    clearTimeout(S.areaT); S.gen++; S.waiters = []; S.actors.forEach(function (a) { a.drop(); });
    follow(S.gen, 1, 'msg');
  }
  function area(key, dir) {
    if (!S.on) return;
    if (!S.areaKey) { S.areaKey = key; return; }
    if (key === S.areaKey) return;
    S.areaKey = key; if (S.lifting) return;
    clearTimeout(S.areaT);
    S.areaT = setTimeout(function () {
      if (!S.on || key !== S.areaKey) return;
      S.gen++; S.waiters = []; S.actors.forEach(function (a) { a.drop(); });
      follow(S.gen, dir || 1);
    }, 450);
  }
  function stop() {
    if (!S.on) return; S.on = false; S.gen++; clearTimeout(S.areaT); cancelAnimationFrame(S.raf); clearTimeout(S.tm);
    S.waiters.forEach(function (w) { w.res(); }); S.waiters = [];
    if (S.host) { S.host.replaceChildren(); S.host.hidden = true; }
    S.actors = []; S.lifting = null; S.pend = 0; restoreFx(true);
  }
  window.PMStick = { _dbg: function () { return { S: S, SC: { sceneSofa: sceneSofa, sceneRace: sceneRace, scenePortal: scenePortal, sceneChat: sceneChat, sceneGame: sceneGame, sceneTalk: sceneTalk, sceneThrow: sceneThrow, sceneLadder: sceneLadder, sceneBuild: sceneBuild, sceneWar: sceneWar, sceneSelfie: sceneSelfie, sceneDance: sceneDance, sceneBall: sceneBall, scenePeek: scenePeek }, setCast: function (n) { S.cast = shuffle(S.actors).slice(0, n); }, liftStart: liftStart, liftEnd: liftEnd, tap: tap, reset: reset, follow: follow, walkTo: walkTo, enter: enter }; }, start: start, stop: stop, area: area, alert: alertMsg, react: react, running: function () { return S.on; } };
})();
