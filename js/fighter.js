import * as THREE from 'three';
import {
  MOVE_BY_ID, STYLES, guardPose, blockPose, specialPose, hitPose, breakPose, koPose, bowPose,
  clonePose, lerpPose, buildTimeline, sampleTimeline, endStance, slotStance,
} from './moves.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _p = new THREE.Vector3(), _m = new THREE.Matrix4();
const _hu = new THREE.Vector3(), _hs = new THREE.Vector3(), _hf = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3();
const _pole = new THREE.Vector3(), _tgt = new THREE.Vector3(), ZERO = new THREE.Vector3();

function rotY(v, yaw, s, out) {
  const c = Math.cos(yaw), n = Math.sin(yaw);
  return out.set((v[0] * c + v[2] * n) * s, v[1] * s, (-v[0] * n + v[2] * c) * s);
}
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function solveIK(a, t, l1, l2, pole, mid, end) {
  const d = _d.subVectors(t, a);
  let dist = d.length();
  if (dist < 1e-5) { d.set(0, -1, 0); dist = 1e-5; } else d.divideScalar(dist);
  const D = clamp(dist, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.002);
  const cosA = clamp((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const perp = _p.copy(pole).addScaledVector(d, -pole.dot(d));
  if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1).addScaledVector(d, -d.z);
  perp.normalize();
  mid.copy(a).addScaledVector(d, l1 * cosA).addScaledVector(perp, l1 * sinA);
  end.copy(a).addScaledVector(d, D);
}

function placeSeg(mesh, a, b) {
  _c.subVectors(b, a);
  const len = _c.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, _c.divideScalar(len));
  mesh.scale.set(1, Math.max(len, 1e-4), 1);
}

// ---------------------------------------------------------------------------
// Outfits

export const PALETTE = {
  cloth: ['#3b3a36', '#5b4a3a', '#7a3b2e', '#a0522d', '#c08a3e', '#d8c9a7', '#e8e0cf', '#2f4858', '#4d6b6a',
    '#6b705c', '#8a8f6a', '#3d2c3e', '#6d2e46', '#8c3b3b', '#2a2a30', '#b5b1a5', '#45607a', '#7f5a83'],
  accent: ['#c9a35a', '#b23a2e', '#e6dcc2', '#2b2b2b', '#4f7f8a', '#d17a2b', '#8aa05a', '#7a4ea0'],
  skin: ['#f1c9a5', '#e0ac85', '#c68b62', '#a8704a', '#7d5236', '#5c3b28'],
  hair: ['#1d1a17', '#3b2a1e', '#6b4a2f', '#a3a09a', '#d8cfc0', '#5a2b1f'],
  mask: ['#ece7da', '#ece7da', '#f4efe3', '#e2dccb', '#2a2826', '#8e2b22', '#c9a35a', '#5f8f7a', '#dcd6c8'],
};
export const MASK_STYLES = ['Visage', 'Plate', 'Horned', 'Beaked', 'Half', 'Crowned'];
export const MASK_MARKS = ['None', 'Stripe', 'Band', 'Tears'];

const pickR = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
export function randomOutfit(rnd = Math.random) {
  return {
    skin: pickR(PALETTE.skin, rnd), top: pickR(PALETTE.cloth, rnd), pants: pickR(PALETTE.cloth, rnd),
    wraps: pickR(['#e8e0cf', '#d8c9a7', '#3b3a36', '#8c3b3b', '#b5b1a5'], rnd), boots: pickR(['#2a2520', '#4a3a2c', '#1c1c1c', '#6b5a45'], rnd),
    accent: pickR(PALETTE.accent, rnd), hair: pickR(PALETTE.hair, rnd),
    mask: { style: Math.floor(rnd() * MASK_STYLES.length), color: pickR(PALETTE.mask, rnd), mark: Math.floor(rnd() * MASK_MARKS.length), markColor: pickR(PALETTE.accent, rnd) },
    hood: rnd() < 0.5, hoodColor: pickR(PALETTE.cloth, rnd),
    coat: rnd() < 0.6, coatColor: pickR(PALETTE.cloth, rnd),
    scarf: rnd() < 0.55, scarfColor: pickR(PALETTE.accent.concat(PALETTE.cloth), rnd),
    build: 0.94 + rnd() * 0.12,
  };
}

// ---------------------------------------------------------------------------

let ATTACK_ID = 0;

export class Fighter {
  constructor(scene, opts) {
    this.scene = scene;
    this.name = opts.name;
    this.isPlayer = !!opts.isPlayer;
    this.styleKey = opts.style;
    this.style = STYLES[opts.style];
    this.deck = opts.deck;
    this.outfit = opts.outfit;
    this.scale = this.outfit.build || 1;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mats = [];
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.j = {};
    for (const k of ['hip', 'chest', 'neck', 'head', 'shL', 'shR', 'elL', 'elR', 'haL', 'haR', 'hjL', 'hjR', 'knL', 'knR', 'ftL', 'ftR', 'side', 'up', 'fwd', 'hipSide'])
      this.j[k] = new THREE.Vector3();
    this.buildModel(this.outfit);
    this.reset('FL');
  }

  reset(stance) {
    this.hp = 100; this.hpLag = 100; this.stamina = 100; this.flow = 0; this.flowTime = 0;
    this.exhausted = false; this.lastSpend = -10; this.counterT = 0; this.empowerT = 0;
    this.stance = stance;
    this.action = { type: 'idle', t: 0 };
    this.pose = guardPose(stance);
    this.blockW = 0; this.walkPhase = 0; this.flash = 0; this.flashColor = new THREE.Color(1, 1, 1);
    this.recoil = 0; this.buffer = null; this.vel.set(0, 0, 0); this.knock.set(0, 0, 0);
    this.intent = { mx: 0, mz: 0, light: false, alt: false, block: false, dodge: false, special: false, switchSide: false, switchFace: false, flow: false };
    this.time = 0;
    this.scarfInit = false;
  }

  // ------------------------------------------------------------------ model
  buildModel(o) {
    const mat = (c, extra = {}) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.02, flatShading: true, ...extra });
      this.mats.push(m); return m;
    };
    const add = (geo, m, parent = this.group) => {
      const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; parent.add(mesh); return mesh;
    };
    const cyl = (rt, rb, m, seg = 7) => add(new THREE.CylinderGeometry(rt, rb, 1, seg), m);
    const sph = (r, m, parent) => add(new THREE.SphereGeometry(r, 10, 8), m, parent);
    const box = (x, y, z, m, parent) => add(new THREE.BoxGeometry(x, y, z), m, parent);

    const top = mat(o.top), pants = mat(o.pants), skin = mat(o.skin), wraps = mat(o.wraps);
    const accent = mat(o.accent), boots = mat(o.boots);
    const coat = o.coat ? mat(o.coatColor) : top;
    const torsoGeo = new THREE.CylinderGeometry(0.17, 0.125, 1, 8); torsoGeo.scale(1.25, 1, 0.78);
    const m = this.m = {
      torso: add(torsoGeo, coat),
      pelvis: box(0.29, 0.2, 0.2, pants), belt: box(0.31, 0.07, 0.215, accent),
      neck: cyl(0.045, 0.05, skin),
      uaL: cyl(0.05, 0.062, coat), uaR: cyl(0.05, 0.062, coat),
      faL: cyl(0.038, 0.048, wraps), faR: cyl(0.038, 0.048, wraps),
      shL: sph(0.07, coat), shR: sph(0.07, coat), elL: sph(0.05, wraps), elR: sph(0.05, wraps),
      haL: sph(0.05, wraps), haR: sph(0.05, wraps),
      thL: cyl(0.066, 0.086, pants), thR: cyl(0.066, 0.086, pants),
      shinL: cyl(0.048, 0.064, pants), shinR: cyl(0.048, 0.064, pants),
      knL: sph(0.066, pants), knR: sph(0.066, pants),
    };
    const footGeo = new THREE.BoxGeometry(0.095, 0.075, 0.23); footGeo.translate(0, 0, 0.05);
    m.footL = add(footGeo, boots); m.footR = add(footGeo, boots);
    if (o.coat) {
      const tail = new THREE.BoxGeometry(0.17, 0.6, 0.025); tail.translate(0, -0.3, 0);
      m.tailL = add(tail, coat); m.tailR = add(tail, coat);
      const sash = new THREE.BoxGeometry(0.1, 0.42, 0.02); sash.translate(0, -0.21, 0);
      m.sash = add(sash, accent);
    }

    // Head
    const head = this.headGroup = new THREE.Group();
    this.group.add(head);
    sph(0.105, skin, head).scale.set(1, 1.08, 1.05);
    if (o.hood) {
      const hood = mat(o.hoodColor);
      const h = sph(0.135, hood, head); h.scale.set(1.02, 1.08, 1.12); h.position.set(0, 0.015, -0.03);
      const peak = add(new THREE.ConeGeometry(0.07, 0.14, 7), hood, head); peak.position.set(0, 0.11, -0.1); peak.rotation.x = -1.1;
      const cowl = add(new THREE.CylinderGeometry(0.13, 0.17, 0.12, 9), hood, head); cowl.position.set(0, -0.13, -0.01);
    } else {
      const hair = mat(o.hair);
      const h = sph(0.112, hair, head); h.scale.set(1, 0.85, 1.05); h.position.set(0, 0.035, -0.02);
      if (o.build > 1) { const k = sph(0.045, hair, head); k.position.set(0, 0.13, -0.07); }
    }
    this.buildMask(o.mask, head, mat, add);

    if (o.scarf) {
      const n = 9;
      this.scarf = { n, seg: 0.095, p: [], pp: [], width: 0.085 };
      for (let i = 0; i < n; i++) { this.scarf.p.push(new THREE.Vector3()); this.scarf.pp.push(new THREE.Vector3()); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      const idx = [];
      for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const sm = mat(o.scarfColor, { side: THREE.DoubleSide });
      this.scarfMesh = new THREE.Mesh(g, sm); this.scarfMesh.castShadow = true; this.scarfMesh.frustumCulled = false;
      this.group.add(this.scarfMesh);
      const wrap = add(new THREE.TorusGeometry(0.075, 0.035, 5, 10), sm); wrap.rotation.x = Math.PI / 2;
      m.scarfWrap = wrap;
    }
  }

  buildMask(mk, head, mat, add) {
    const mm = mat(mk.color, { roughness: 0.55 });
    const dark = mat('#0e0c0a');
    const markM = mat(mk.markColor || '#b23a2e');
    const st = mk.style;
    let face;
    if (st === 1) face = add(new THREE.IcosahedronGeometry(0.1, 1), mm, head);
    else face = add(new THREE.SphereGeometry(0.1, 14, 10), mm, head);
    face.scale.set(0.95, st === 4 ? 0.72 : 1.2, 0.5);
    face.position.set(0, st === 4 ? 0.035 : 0, 0.07);
    for (const s of [-1, 1]) {
      const eye = add(new THREE.BoxGeometry(0.04, 0.012, 0.03), dark, head);
      eye.position.set(s * 0.036, 0.022, 0.112); eye.rotation.z = s * 0.18; eye.rotation.y = s * 0.3;
    }
    if (st === 1) { const c = add(new THREE.BoxGeometry(0.016, 0.07, 0.15), mm, head); c.position.set(0, 0.125, 0.03); }
    if (st === 2) for (const s of [-1, 1]) {
      const h = add(new THREE.ConeGeometry(0.022, 0.14, 6), mm, head);
      h.position.set(s * 0.07, 0.12, 0.05); h.rotation.z = -s * 0.5; h.rotation.x = -0.3;
    }
    if (st === 3) { const b = add(new THREE.ConeGeometry(0.035, 0.1, 6), mm, head); b.position.set(0, -0.045, 0.13); b.rotation.x = Math.PI / 2 + 0.35; }
    if (st === 5) {
      const ring = add(new THREE.TorusGeometry(0.16, 0.012, 5, 18), markM, head); ring.position.set(0, 0.02, -0.02);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.15 + 0.7 * i / 6);
        const sp = add(new THREE.ConeGeometry(0.014, 0.07, 4), markM, head);
        sp.position.set(Math.cos(a) * 0.19, Math.sin(a) * 0.19 + 0.02, -0.02); sp.rotation.z = a - Math.PI / 2;
      }
    }
    if (mk.mark === 1) {
      const s = add(new THREE.SphereGeometry(0.1, 12, 10), markM, head);
      s.scale.set(0.14, st === 4 ? 0.74 : 1.21, 0.52); s.position.copy(face.position);
    } else if (mk.mark === 2) {
      const s = add(new THREE.SphereGeometry(0.1, 12, 10), markM, head);
      s.scale.set(0.97, 0.3, 0.52); s.position.set(0, 0.022, 0.07);
    } else if (mk.mark === 3) {
      for (const sx of [-1, 1]) {
        const s = add(new THREE.BoxGeometry(0.012, 0.06, 0.01), markM, head);
        s.position.set(sx * 0.036, -0.025, 0.112); s.rotation.y = sx * 0.3;
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
  }

  // ------------------------------------------------------------------ helpers
  get facingDir() { return _a.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  speedMult() {
    let s = 1;
    if (this.flowTime > 0) s *= 1.22;
    if (this.exhausted) s *= 0.8;
    return s;
  }
  spend(x, now) {
    this.stamina -= x; this.lastSpend = now;
    if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
  }
  gainFlow(x) { if (this.flowTime <= 0) this.flow = Math.min(100, this.flow + x); }
  limbPos(limb) {
    const j = this.j;
    return { lh: j.haL, rh: j.haR, lf: j.ftL, rf: j.ftR, lknee: j.knL, rknee: j.knR, lelbow: j.elL, relbow: j.elR }[limb];
  }
  currentStance() { return this.action.type === 'attack' ? this.action.tl.end : this.stance; }
  nextMoves() {
    // What a light / alt press would do right now (for HUD and AI).
    const cur = this.currentStance();
    let owner = cur, idx = 0;
    const c = this.action.type === 'attack' ? this.action.chain : null;
    if (c && c.idx + 1 < this.deck[c.owner].chain.length && slotStance(this.deck, c.owner, c.idx + 1) === cur) {
      owner = c.owner; idx = c.idx + 1;
    }
    const light = MOVE_BY_ID[this.deck[owner].chain[idx]] || null;
    const alt = MOVE_BY_ID[this.deck[cur].alt] || null;
    return { light, alt, owner, idx, stance: cur };
  }
  isVulnerableWindow() {
    const a = this.action;
    if (a.type === 'attack') return a.t > a.tl.hitEnd;
    return a.type === 'stagger' || (a.type === 'special' && a.t > a.win1) || (a.type === 'dodge' && a.t > a.i1);
  }

  // ------------------------------------------------------------------ actions
  startAttack(move, stance, chain, game) {
    let speed = this.speedMult();
    if (this.counterT > 0) { speed *= 1.35; this.counterT = 0; }
    const tl = buildTimeline(move, stance, speed);
    this.pose.spin = wrapAngle(this.pose.spin);
    this.stance = stance;
    this.spend(move.stam, game.now);
    const empowered = this.empowerT > 0; this.empowerT = 0;
    this.action = { type: 'attack', t: 0, move, tl, chain, hitDone: [], landed: false, whooshed: false, id: ++ATTACK_ID, empowered };
  }
  tryBuffered(game) {
    const b = this.buffer;
    if (!b) return false;
    this.buffer = null;
    const cur = this.currentStance();
    if (b.kind === 'light' || b.kind === 'alt') {
      const n = this.nextMoves();
      if (b.kind === 'light' && n.light) {
        this.startAttack(n.light, cur, { owner: n.owner, idx: n.idx }, game); return true;
      }
      if (n.alt) { this.startAttack(n.alt, cur, null, game); return true; }
      if (n.light) { this.startAttack(n.light, cur, { owner: n.owner, idx: n.idx }, game); return true; }
      return false;
    }
    this.stance = cur;
    this.pose.spin = wrapAngle(this.pose.spin);
    if (b.kind === 'dodge') {
      let x = b.mx, z = b.mz;
      if (Math.hypot(x, z) < 0.3) { x = 0; z = -1; }
      const side = Math.abs(x) > Math.abs(z);
      if (side) { x = Math.sign(x); z = 0; } else { x = 0; z = z > 0 ? 0.6 : -1; }
      this.spend(14, game.now);
      this.action = { type: 'dodge', t: 0, dur: 0.42, i0: 0.03, i1: 0.27, side, dx: x, dz: z, moved: 0 };
      game.sfx.dodge();
      return true;
    }
    if (b.kind === 'special') {
      const kind = this.style.kind;
      const cfg = {
        parry: { dur: 0.48, win0: 0.03, win1: 0.24, cost: 8 },
        absorb: { dur: 0.62, win0: 0.04, win1: 0.5, cost: 10 },
        avoid: { dur: 0.46, win0: 0.03, win1: 0.32, cost: 12 },
        sway: { dur: 0.5, win0: 0.02, win1: 0.34, cost: 9 },
      }[kind];
      this.spend(cfg.cost, game.now);
      let dx = Math.sign(b.mx) || (Math.random() < 0.5 ? -1 : 1);
      this.action = { type: 'special', kind, t: 0, ...cfg, dx, moved: 0, success: false };
      game.sfx.dodge();
      return true;
    }
    if (b.kind === 'switchSide' || b.kind === 'switchFace') {
      const to = b.kind === 'switchSide' ? cur[0] + (cur[1] === 'L' ? 'R' : 'L') : (cur[0] === 'F' ? 'B' : 'F') + cur[1];
      this.spend(3, game.now);
      this.action = { type: 'switch', t: 0, dur: 0.24, from: cur, to };
      return true;
    }
    return false;
  }
  stagger(dur, kind, pushDir, push) {
    this.pose.spin = wrapAngle(this.pose.spin);
    if (this.action.type === 'attack') this.stance = this.action.move.from + this.stance[1];
    this.action = { type: 'stagger', t: 0, dur, kind };
    this.knock.copy(pushDir).multiplyScalar(push);
    this.buffer = null;
  }
  ko(pushDir) {
    this.action = { type: 'ko', t: 0, from: clonePose(this.pose) };
    this.action.from.spin = wrapAngle(this.action.from.spin);
    this.knock.copy(pushDir).multiplyScalar(3.2);
    this.buffer = null;
  }
  bow() { this.action = { type: 'bow', t: 0, from: clonePose(this.pose) }; this.action.from.spin = wrapAngle(this.action.from.spin); }

  // ------------------------------------------------------------------ update
  update(dt, opp, game) {
    this.time += dt;
    const sm = this.speedMult();
    if (this.flowTime > 0) this.flowTime -= dt;
    this.counterT = Math.max(0, this.counterT - dt);
    this.empowerT = Math.max(0, this.empowerT - dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.recoil = Math.max(0, this.recoil - dt * 4);
    this.hpLag += (this.hp - this.hpLag) * Math.min(1, dt * (this.hpLag > this.hp + 0.5 ? 1.6 : 10));

    // Intent -> input buffer
    const it = this.intent, act = this.action;
    const alive = act.type !== 'ko' && act.type !== 'bow';
    if (alive) {
      for (const k of ['light', 'alt', 'dodge', 'special', 'switchSide', 'switchFace']) {
        if (it[k]) this.buffer = { kind: k, ttl: 0.32, mx: it.mx, mz: it.mz };
      }
      if (it.flow && this.flow >= 100 && this.flowTime <= 0) {
        this.flowTime = 6; this.flow = 0; game.onFlow(this);
      }
    }
    if (this.buffer && (this.buffer.ttl -= dt) <= 0) this.buffer = null;

    // Facing
    _a.subVectors(opp.pos, this.pos); _a.y = 0;
    const dist = _a.length();
    const fwd = _b.copy(_a).divideScalar(dist || 1);
    const right = _c.set(-fwd.z, 0, fwd.x);
    const targetYaw = Math.atan2(fwd.x, fwd.z);
    let turn = 14;
    if (act.type === 'attack') turn = act.t < act.tl.hits[0].t0 * 0.85 ? 7 : 0.8;
    if (act.type === 'ko' || act.type === 'bow') turn = act.type === 'bow' ? 4 : 0;
    if (act.type === 'stagger') turn = 3;
    this.yaw += wrapAngle(targetYaw - this.yaw) * Math.min(1, dt * turn);

    // Regen
    const resting = act.type === 'idle' || act.type === 'block' || act.type === 'switch';
    if (resting && game.now - this.lastSpend > 0.65) {
      const rate = (act.type === 'block' ? 9 : 26) * (this.flowTime > 0 ? 2 : 1) * (this.exhausted ? 0.7 : 1);
      this.stamina = Math.min(100, this.stamina + rate * dt);
    }
    if (this.exhausted && this.stamina >= 35) this.exhausted = false;

    // Movement input
    let moveSpeed = 0;
    const wantMove = _d.set(0, 0, 0);
    const im = Math.hypot(it.mx, it.mz);
    if (im > 0.01) wantMove.addScaledVector(fwd, it.mz / Math.max(1, im)).addScaledVector(right, it.mx / Math.max(1, im));

    const tAdv = dt * sm;
    switch (act.type) {
      case 'idle':
      case 'block': {
        act.t += dt;
        moveSpeed = act.type === 'block' ? 1.1 : (it.mz < -0.1 ? 1.9 : 2.4);
        if (this.tryBuffered(game)) break;
        const nb = it.block ? 'block' : 'idle';
        if (nb !== act.type) this.action = { type: nb, t: 0 };
        break;
      }
      case 'attack': {
        const tl = act.tl, prevT = act.t;
        act.t += tAdv;
        const S = tl.hits[0].t0;
        // lunge
        const e = u => 1 - (1 - clamp(u, 0, 1)) ** 2;
        const step = act.move.lunge * (e(act.t / S) - e(prevT / S));
        if (dist > 1.0) this.pos.addScaledVector(this.facingDir, Math.min(step, Math.max(0, dist - 1.0)));
        if (!act.whooshed && act.t > S * 0.7) { act.whooshed = true; game.sfx.whoosh(act.move.dmg); }
        const cancelAt = tl.hitEnd + tl.recovery * (act.landed ? 0.25 : 0.55);
        if (act.t >= cancelAt) {
          if (this.buffer && this.tryBuffered(game)) break;
          if (it.block) { this.stance = tl.end; this.pose.spin = wrapAngle(this.pose.spin); this.action = { type: 'block', t: 0 }; break; }
        }
        if (act.t >= tl.total) {
          this.stance = tl.end; this.pose.spin = wrapAngle(this.pose.spin);
          this.action = { type: 'idle', t: 0 };
          this.tryBuffered(game);
        }
        break;
      }
      case 'dodge': {
        act.t += tAdv;
        const u = clamp(act.t / (act.dur * 0.75), 0, 1);
        const total = act.side ? 1.15 : 1.3;
        const target = total * (1 - (1 - u) ** 2.2);
        const d = target - act.moved; act.moved = target;
        _p.set(0, 0, 0).addScaledVector(fwd, act.dz).addScaledVector(right, act.dx);
        this.pos.addScaledVector(_p, d);
        if (act.t >= act.dur) this.action = { type: 'idle', t: 0 };
        else if (act.t > act.i1 + 0.05 && this.buffer && (this.buffer.kind === 'light' || this.buffer.kind === 'alt')) this.tryBuffered(game);
        break;
      }
      case 'special': {
        act.t += tAdv;
        if (act.kind === 'avoid' || act.kind === 'sway') {
          const u = clamp(act.t / (act.dur * 0.8), 0, 1);
          const total = act.kind === 'avoid' ? 1.15 : 0.35;
          const target = total * Math.sin(u * Math.PI / 2);
          const d = target - act.moved; act.moved = target;
          _p.set(0, 0, 0).addScaledVector(right, act.kind === 'avoid' ? act.dx : act.dx * 0.5).addScaledVector(fwd, act.kind === 'sway' ? -0.8 : -0.25);
          this.pos.addScaledVector(_p, d);
        }
        const canCancel = act.kind === 'sway' ? act.t > 0.12 : act.success && act.t > 0.08;
        if (canCancel && this.buffer && (this.buffer.kind === 'light' || this.buffer.kind === 'alt')) { this.tryBuffered(game); break; }
        if (act.t >= act.dur) this.action = { type: 'idle', t: 0 };
        break;
      }
      case 'stagger':
        act.t += dt;
        if (act.t >= act.dur) this.action = { type: 'idle', t: 0 };
        break;
      case 'switch':
        act.t += tAdv;
        moveSpeed = 1.2;
        if (act.t >= act.dur) { this.stance = act.to; this.action = { type: 'idle', t: 0 }; this.tryBuffered(game); }
        break;
      case 'ko':
      case 'bow':
        act.t += dt;
        break;
    }

    // apply locomotion
    this.vel.lerp(wantMove.multiplyScalar(moveSpeed), Math.min(1, dt * 12));
    if (moveSpeed === 0) this.vel.multiplyScalar(Math.max(0, 1 - dt * 14));
    this.pos.addScaledVector(this.vel, dt);
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 7));
    this.walkPhase += dt * this.vel.length() * 6.5;

    this.computePose(dt);
  }

  computePose(dt) {
    const a = this.action;
    let target, k = 16;
    switch (a.type) {
      case 'attack': target = sampleTimeline(a.tl, a.t, this._tp); k = 40; break;
      case 'dodge': {
        target = guardPose(this.stance);
        const u = Math.sin(clamp(a.t / a.dur, 0, 1) * Math.PI);
        // local lean: fighter's right is -X
        target.chest[0] += -a.dx * 0.2 * u; target.chest[2] += a.dz * 0.18 * u;
        target.chest[1] -= 0.12 * u; target.hip[1] -= 0.12 * u; k = 22;
        break;
      }
      case 'special': {
        target = specialPose(a.kind, this.stance, a.t);
        if (a.kind === 'sway' && a.dx > 0) { target.chest[0] -= 0.5; target.hip[0] -= 0.2; }
        k = a.kind === 'avoid' ? 60 : 24;
        break;
      }
      case 'stagger': {
        if (a.kind === 'block') { target = blockPose(this.stance); k = 30; break; }
        const u = Math.sin(clamp(a.t / a.dur, 0, 1) * Math.PI);
        const g = guardPose(this.stance);
        const h = a.kind === 'break' || a.kind === 'parried' ? breakPose(this.stance) : hitPose(this.stance, a.kind === 'heavy');
        target = lerpPose(g, h, a.kind === 'break' || a.kind === 'parried' ? Math.min(1, u * 2) : u);
        k = 24; break;
      }
      case 'switch': {
        const u = clamp(a.t / a.dur, 0, 1);
        target = lerpPose(guardPose(a.from), guardPose(a.to), u * u * (3 - 2 * u)); k = 30; break;
      }
      case 'ko': target = lerpPose(a.from, koPose(), clamp(a.t / 0.6, 0, 1) ** 0.7); k = 30; break;
      case 'bow': target = lerpPose(a.from, bowPose(), clamp(a.t / 0.7, 0, 1)); k = 10; break;
      default: target = guardPose(this.stance);
    }
    if (a.type !== 'attack') this._tp = null; else this._tp = target;
    // block overlay
    this.blockW += ((a.type === 'block' || (a.type === 'stagger' && a.kind === 'block') ? 1 : 0) - this.blockW) * Math.min(1, dt * 22);
    if (this.blockW > 0.01 && a.type !== 'attack') target = lerpPose(target, blockPose(this.stance), this.blockW);
    lerpPose(this.pose, target, Math.min(1, dt * k), this.pose);
  }

  // ------------------------------------------------------------------ render
  solve() {
    const j = this.j, p = this.renderPose(), s = this.scale;
    const yaw = this.yaw + p.spin;
    const W = (v, out) => rotY(v, yaw, s, out).add(this.pos);
    W(p.hip, j.hip); W(p.chest, j.chest);
    j.up.subVectors(j.chest, j.hip).normalize();
    const cy = yaw + p.chestYaw, hy = yaw + p.hipYaw;
    j.side.set(Math.cos(cy), 0, -Math.sin(cy));
    j.side.addScaledVector(j.up, -j.side.dot(j.up)).normalize();
    j.fwd.crossVectors(j.side, j.up);
    j.hipSide.set(Math.cos(hy), 0, -Math.sin(hy));
    j.shL.copy(j.chest).addScaledVector(j.side, 0.19 * s).addScaledVector(j.up, 0.07 * s);
    j.shR.copy(j.chest).addScaledVector(j.side, -0.19 * s).addScaledVector(j.up, 0.07 * s);
    j.neck.copy(j.chest).addScaledVector(j.up, 0.17 * s);
    j.head.copy(j.chest).addScaledVector(j.up, 0.31 * s).addScaledVector(j.fwd, 0.015);
    _b.copy(j.hip).addScaledVector(UP, -0.05 * s);
    j.hjL.copy(_b).addScaledVector(j.hipSide, 0.1 * s);
    j.hjR.copy(_b).addScaledVector(j.hipSide, -0.1 * s);
    const pole = _pole, tgt = _tgt;
    solveIK(j.shL, W(p.lh, tgt), 0.29 * s, 0.27 * s, rotY(p.lhp, yaw, 1, pole), j.elL, j.haL);
    solveIK(j.shR, W(p.rh, tgt), 0.29 * s, 0.27 * s, rotY(p.rhp, yaw, 1, pole), j.elR, j.haR);
    W(p.lf, tgt); tgt.y = Math.max(tgt.y, this.pos.y + 0.06);
    solveIK(j.hjL, tgt, 0.46 * s, 0.45 * s, rotY(p.lfp, yaw, 1, pole), j.knL, j.ftL);
    W(p.rf, tgt); tgt.y = Math.max(tgt.y, this.pos.y + 0.06);
    solveIK(j.hjR, tgt, 0.46 * s, 0.45 * s, rotY(p.rfp, yaw, 1, pole), j.knR, j.ftR);
  }

  renderPose() {
    const p = this._rp || (this._rp = clonePose(this.pose));
    lerpPose(this.pose, this.pose, 0, p);
    const a = this.action;
    // breathing + walk cycle (only when grounded in neutral)
    const br = Math.sin(this.time * 2.2) * 0.012;
    p.chest[1] += br; p.lh[1] += br * 0.8; p.rh[1] += br * 0.8;
    const sp = this.vel.length();
    if (sp > 0.15 && (a.type === 'idle' || a.type === 'block' || a.type === 'switch')) {
      // local move direction (fighter faces +Z, +X is left)
      const c = Math.cos(-this.yaw), n = Math.sin(-this.yaw);
      const lx = (this.vel.x * c + this.vel.z * n) / sp, lz = (-this.vel.x * n + this.vel.z * c) / sp;
      const amp = Math.min(1, sp / 2.2);
      const s1 = Math.sin(this.walkPhase), s2 = Math.sin(this.walkPhase + Math.PI);
      p.lf[0] += lx * 0.13 * s1 * amp; p.lf[2] += lz * 0.13 * s1 * amp; p.lf[1] += Math.max(0, Math.cos(this.walkPhase)) * 0.08 * amp;
      p.rf[0] += lx * 0.13 * s2 * amp; p.rf[2] += lz * 0.13 * s2 * amp; p.rf[1] += Math.max(0, Math.cos(this.walkPhase + Math.PI)) * 0.08 * amp;
      p.hip[1] -= Math.abs(Math.sin(this.walkPhase)) * 0.02;
    }
    if (this.recoil > 0) { p.chest[2] -= this.recoil * 0.15; p.chest[1] -= this.recoil * 0.04; }
    return p;
  }

  render(dt) {
    this.solve();
    const j = this.j, m = this.m, s = this.scale;
    // torso
    _a.copy(j.hip).addScaledVector(j.up, 0.02 * s);
    placeSeg(m.torso, _a, j.neck);
    _m.makeBasis(j.side, j.up, j.fwd);
    m.torso.quaternion.setFromRotationMatrix(_m);
    m.torso.scale.set(s, j.neck.distanceTo(_a), s);
    // pelvis (hip yaw, tilted with torso a bit)
    const hipUp = _hu.copy(UP).lerp(j.up, 0.4).normalize();
    const hs = _hs.copy(j.hipSide).addScaledVector(hipUp, -j.hipSide.dot(hipUp)).normalize();
    const hf = _hf.crossVectors(hs, hipUp);
    _m.makeBasis(hs, hipUp, hf);
    m.pelvis.position.copy(j.hip).addScaledVector(hipUp, -0.04 * s); m.pelvis.quaternion.setFromRotationMatrix(_m); m.pelvis.scale.setScalar(s);
    m.belt.position.copy(j.hip).addScaledVector(hipUp, 0.04 * s); m.belt.quaternion.copy(m.pelvis.quaternion); m.belt.scale.setScalar(s);
    placeSeg(m.neck, j.neck, _a.copy(j.neck).addScaledVector(j.up, 0.09 * s));
    // limbs
    placeSeg(m.uaL, j.shL, j.elL); placeSeg(m.faL, j.elL, j.haL);
    placeSeg(m.uaR, j.shR, j.elR); placeSeg(m.faR, j.elR, j.haR);
    placeSeg(m.thL, j.hjL, j.knL); placeSeg(m.shinL, j.knL, j.ftL);
    placeSeg(m.thR, j.hjR, j.knR); placeSeg(m.shinR, j.knR, j.ftR);
    for (const [mesh, p] of [[m.shL, j.shL], [m.shR, j.shR], [m.elL, j.elL], [m.elR, j.elR], [m.haL, j.haL], [m.haR, j.haR], [m.knL, j.knL], [m.knR, j.knR]]) {
      mesh.position.copy(p); mesh.scale.setScalar(s);
    }
    // feet: point along hip facing, pitch with shin when raised
    for (const [mesh, ft, kn] of [[m.footL, j.ftL, j.knL], [m.footR, j.ftR, j.knR]]) {
      mesh.position.copy(ft);
      const shin = _a.subVectors(ft, kn).normalize();
      const flat = _b.copy(hf); flat.y = 0; flat.normalize();
      const lift = clamp((ft.y - this.pos.y - 0.12) * 3, 0, 1);
      const dir = _c.copy(flat).lerp(shin, lift * 0.85).normalize();
      _m.lookAt(ZERO, dir, UP);
      mesh.quaternion.setFromRotationMatrix(_m);
      mesh.rotateY(Math.PI);
      mesh.scale.setScalar(s);
    }
    // head
    _m.makeBasis(j.side, j.up, j.fwd);
    this.headGroup.position.copy(j.head);
    this.headGroup.quaternion.setFromRotationMatrix(_m);
    this.headGroup.scale.setScalar(s);
    // coat tails follow the thighs
    if (m.tailL) {
      for (const [mesh, side, hjN, knN] of [[m.tailL, 1, j.hjL, j.knL], [m.tailR, -1, j.hjR, j.knR]]) {
        const anchor = _a.copy(j.hip).addScaledVector(hs, side * 0.1 * s).addScaledVector(hf, -0.09 * s).addScaledVector(hipUp, 0.02);
        const thigh = _b.subVectors(knN, hjN).normalize();
        const down = _c.set(0, -1, 0).addScaledVector(hf, -0.35).normalize();
        const dir = down.lerp(thigh, 0.55).normalize();
        if (dir.dot(hf) > 0.1) dir.addScaledVector(hf, -(dir.dot(hf) - 0.1)).normalize();
        const yAxis = _d.copy(dir).negate();
        const xAxis = _x.copy(hs).addScaledVector(yAxis, -hs.dot(yAxis)).normalize();
        const zAxis = _z.crossVectors(xAxis, yAxis);
        _m.makeBasis(xAxis, yAxis, zAxis);
        mesh.position.copy(anchor); mesh.quaternion.setFromRotationMatrix(_m); mesh.scale.setScalar(s);
      }
      const anchor = _a.copy(j.hip).addScaledVector(hf, 0.11 * s).addScaledVector(hs, 0.06 * s);
      m.sash.position.copy(anchor); m.sash.quaternion.copy(m.pelvis.quaternion); m.sash.scale.setScalar(s);
    }
    if (this.scarf) this.updateScarf(dt);
    // hit flash / flow glow
    const glow = this.flowTime > 0 ? 0.18 + 0.08 * Math.sin(this.time * 10) : 0;
    const f = Math.max(this.flash, glow);
    for (const mat of this.mats) {
      mat.emissive.copy(this.flash > glow ? this.flashColor : FLOW_COLOR);
      mat.emissiveIntensity = f;
    }
  }

  updateScarf(dt) {
    const sc = this.scarf, j = this.j;
    const anchor = _a.copy(j.neck).addScaledVector(j.fwd, -0.06).addScaledVector(j.up, 0.02);
    this.m.scarfWrap.position.copy(j.neck).addScaledVector(j.up, 0.03);
    _m.makeBasis(j.side, j.fwd, _b.copy(j.up).negate());
    this.m.scarfWrap.quaternion.setFromRotationMatrix(_m);
    if (!this.scarfInit) {
      for (let i = 0; i < sc.n; i++) {
        sc.p[i].copy(anchor).addScaledVector(j.fwd, -i * sc.seg * 0.5).addScaledVector(UP, -i * sc.seg * 0.8);
        sc.pp[i].copy(sc.p[i]);
      }
      this.scarfInit = true;
    }
    dt = Math.min(dt, 1 / 30);
    const wind = _b.set(Math.sin(this.time * 0.7) * 0.6 + 0.4, 0, Math.cos(this.time * 0.5) * 0.4);
    sc.p[0].copy(anchor); sc.pp[0].copy(anchor);
    for (let i = 1; i < sc.n; i++) {
      const p = sc.p[i], pp = sc.pp[i];
      const vx = (p.x - pp.x) * 0.96, vy = (p.y - pp.y) * 0.96, vz = (p.z - pp.z) * 0.96;
      pp.copy(p);
      p.x += vx + wind.x * dt * dt * 3; p.y += vy - 9.8 * dt * dt * 0.6; p.z += vz + wind.z * dt * dt * 3;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < sc.n; i++) {
        const a = sc.p[i - 1], b = sc.p[i];
        _c.subVectors(b, a); const l = _c.length() || 1e-5;
        const diff = (l - sc.seg) / l;
        if (i === 1) b.addScaledVector(_c, -diff);
        else { a.addScaledVector(_c, diff * 0.5); b.addScaledVector(_c, -diff * 0.5); }
      }
      for (let i = 1; i < sc.n; i++) {
        const p = sc.p[i];
        if (p.y < this.pos.y + 0.03) p.y = this.pos.y + 0.03;
        // keep out of the torso
        _c.subVectors(p, j.chest); _c.y = 0;
        const d = _c.dot(j.fwd);
        if (d > -0.12 && p.y > j.hip.y - 0.1) p.addScaledVector(j.fwd, -0.12 - d);
      }
    }
    const pos = this.scarfMesh.geometry.attributes.position;
    for (let i = 0; i < sc.n; i++) {
      const w = sc.width * (i === sc.n - 1 ? 0.7 : 1);
      pos.setXYZ(i * 2, sc.p[i].x + j.side.x * w, sc.p[i].y + j.side.y * w, sc.p[i].z + j.side.z * w);
      pos.setXYZ(i * 2 + 1, sc.p[i].x - j.side.x * w, sc.p[i].y - j.side.y * w, sc.p[i].z - j.side.z * w);
    }
    pos.needsUpdate = true;
    this.scarfMesh.geometry.computeVertexNormals();
  }
}
const FLOW_COLOR = new THREE.Color('#ffc870');
