// Move data, stance poses and the animation timeline builder.
//
// Poses are described in a fighter's local space: the fighter stands at the
// origin, faces +Z, +Y is up and +X is the fighter's LEFT side. Every pose and
// move is authored "canonically" for the left-lead side and mirrored for the
// right-lead side, exactly like attacks in Absolver can be slotted into either
// side of a stance.

export const STANCES = ['FL', 'FR', 'BL', 'BR'];
export const STANCE_NAMES = { FL: 'Front Left', FR: 'Front Right', BL: 'Back Left', BR: 'Back Right' };

const VKEYS = ['hip', 'chest', 'lh', 'rh', 'lf', 'rf', 'lhp', 'rhp', 'lfp', 'rfp'];
const SKEYS = ['hipYaw', 'chestYaw', 'spin'];

export function clonePose(p) {
  const o = {};
  for (const k of VKEYS) o[k] = p[k].slice();
  for (const k of SKEYS) o[k] = p[k];
  return o;
}

export function lerpPose(a, b, t, out) {
  out = out || clonePose(a);
  for (const k of VKEYS) {
    const av = a[k], bv = b[k], ov = out[k];
    ov[0] = av[0] + (bv[0] - av[0]) * t;
    ov[1] = av[1] + (bv[1] - av[1]) * t;
    ov[2] = av[2] + (bv[2] - av[2]) * t;
  }
  for (const k of SKEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

const mv = v => [-v[0], v[1], v[2]];
export function mirrorPose(p) {
  return {
    hip: mv(p.hip), chest: mv(p.chest),
    lh: mv(p.rh), rh: mv(p.lh), lf: mv(p.rf), rf: mv(p.lf),
    lhp: mv(p.rhp), rhp: mv(p.lhp), lfp: mv(p.rfp), rfp: mv(p.lfp),
    hipYaw: -p.hipYaw, chestYaw: -p.chestYaw, spin: -p.spin,
  };
}
export const mirrorLimb = l => (l[0] === 'l' ? 'r' : 'l') + l.slice(1);

const POLES = { lhp: [0.7, -1, -0.5], rhp: [-0.7, -1, -0.5], lfp: [0.12, 0.1, 1], rfp: [-0.12, 0.1, 1] };

const GUARD_F = {
  hip: [0, 0.93, 0], hipYaw: -0.45,
  chest: [0, 1.36, 0.04], chestYaw: -0.35,
  lh: [0.12, 1.42, 0.36], rh: [-0.06, 1.41, 0.19],
  lf: [0.13, 0.07, 0.27], rf: [-0.17, 0.07, -0.22],
  ...POLES, spin: 0,
};
const GUARD_B = {
  hip: [0, 0.9, 0], hipYaw: -1.1,
  chest: [0.02, 1.34, -0.02], chestYaw: -0.95,
  lh: [0.28, 1.3, 0.3], rh: [0.02, 1.45, 0.2],
  lf: [0.2, 0.07, 0.22], rf: [-0.2, 0.07, -0.2],
  ...POLES, spin: 0,
};

export function guardPose(stance) {
  const base = clonePose(stance[0] === 'F' ? GUARD_F : GUARD_B);
  return stance[1] === 'R' ? mirrorPose(base) : base;
}

// Overlays used for defensive actions (canonical, mirrored by side).
export function blockPose(stance) {
  const p = clonePose(stance[0] === 'F' ? GUARD_F : GUARD_B);
  p.lh = [0.1, 1.6, 0.3]; p.rh = [-0.09, 1.57, 0.27];
  p.lhp = [0.9, -0.6, 0.2]; p.rhp = [-0.9, -0.6, 0.2];
  p.chest[1] -= 0.05; p.chest[2] += 0.02; p.hip[1] -= 0.04;
  p.chestYaw *= 0.5; p.hipYaw *= 0.8;
  return stance[1] === 'R' ? mirrorPose(p) : p;
}

export function specialPose(kind, stance, t) {
  const p = clonePose(stance[0] === 'F' ? GUARD_F : GUARD_B);
  if (kind === 'parry') {
    p.lh = [0.38, 1.5, 0.5]; p.lhp = [1, -0.2, -0.2];
    p.rh = [-0.08, 1.5, 0.22]; p.chestYaw = 0.25; p.chest[2] += 0.05;
  } else if (kind === 'absorb') {
    p.lh = [-0.08, 1.45, 0.34]; p.rh = [0.08, 1.38, 0.32];
    p.lhp = [1, -0.3, 0.3]; p.rhp = [-1, -0.3, 0.3];
    p.chest[2] += 0.08; p.hip[1] -= 0.08; p.chestYaw = 0; p.hipYaw *= 0.5;
  } else if (kind === 'sway') {
    p.chest = [0.28, 1.22, -0.2]; p.hip = [0.12, 0.84, -0.06];
    p.lh = [0.3, 1.3, 0.25]; p.rh = [0.0, 1.4, 0.1]; p.chestYaw = -0.9;
  } else if (kind === 'avoid') {
    p.chest = [0, 1.2, 0.02]; p.hip[1] = 0.8;
    p.lh = [0.4, 1.15, 0.1]; p.rh = [-0.35, 1.25, 0.0];
    p.spin = Math.PI * 2 * Math.min(1, t * 2.3);
  }
  return stance[1] === 'R' ? mirrorPose(p) : p;
}

export function hitPose(stance, heavy) {
  const p = guardPose(stance);
  p.chest[2] -= heavy ? 0.28 : 0.16; p.chest[1] -= 0.06; p.hip[2] -= 0.06;
  p.lh[2] -= 0.15; p.rh[2] -= 0.15; p.lh[1] -= 0.1; p.rh[1] -= 0.1;
  return p;
}
export function breakPose(stance) {
  const p = guardPose(stance);
  p.chest = [p.chest[0], 1.18, 0.22]; p.hip[1] = 0.84;
  p.lh = [0.25, 0.95, 0.15]; p.rh = [-0.25, 0.95, 0.12];
  return p;
}
export function koPose() {
  return {
    hip: [0, 0.18, -0.55], chest: [0, 0.22, -1.1], hipYaw: 0, chestYaw: 0, spin: 0,
    lh: [0.55, 0.06, -1.05], rh: [-0.55, 0.06, -1.25],
    lf: [0.22, 0.07, 0.25], rf: [-0.2, 0.2, 0.05],
    lhp: [1, 0.3, 0], rhp: [-1, 0.3, 0], lfp: [0.2, 1, 0.2], rfp: [-0.2, 1, 0.3],
  };
}
export function bowPose() {
  const p = clonePose(GUARD_F);
  p.lf = [0.12, 0.07, 0.04]; p.rf = [-0.12, 0.07, -0.04];
  p.hip = [0, 0.97, -0.04]; p.hipYaw = 0; p.chestYaw = 0;
  p.chest = [0, 1.33, 0.2];
  p.lh = [0.03, 1.22, 0.36]; p.rh = [-0.03, 1.22, 0.36];
  p.lhp = [1, -0.3, 0]; p.rhp = [-1, -0.3, 0];
  return p;
}

// ---------------------------------------------------------------------------
// Attack archetypes. Each returns windup/strike poses (canonical) and the limb
// whose world position is the hitbox. sx = +1 for the lead (left) limb, -1 for
// the rear (right) limb.

const mk = (B, f) => { const p = clonePose(B); f(p); return p; };
const H = sx => (sx > 0 ? 'lh' : 'rh');
const F = sx => (sx > 0 ? 'lf' : 'rf');
function plantOn(p, B, sx, amt = 0.45) { // shift weight over the support foot
  const s = B[F(-sx)];
  p.hip[0] += (s[0] - p.hip[0]) * amt;
  p.hip[2] += (s[2] - p.hip[2]) * amt;
  p.chest[0] += (s[0] - p.chest[0]) * amt;
}

const ARCH = {
  straight(B, sx, m) {
    const h = H(sx), o = H(-sx), y = m.y || 1.5;
    return {
      windup: mk(B, p => { p[h] = [sx * 0.1, y - 0.05, 0.1]; p.chestYaw = B.chestYaw + sx * 0.18; }),
      strike: mk(B, p => {
        p[h] = [0, y, 0.88]; p[o] = [-sx * 0.05, 1.5, 0.22];
        p.chestYaw = -sx * 0.75; p.hipYaw = -sx * 0.3;
        p.hip[2] += 0.1; p.chest[2] += 0.17; p.chest[1] -= 0.03;
      }),
      limb: h,
    };
  },
  hook(B, sx) {
    const h = H(sx);
    return {
      windup: mk(B, p => { p[h] = [sx * 0.42, 1.45, 0.15]; p.chestYaw = sx * 0.3; p[h + 'p'] = [sx, 0.3, -0.3]; }),
      strike: mk(B, p => {
        p[h] = [-sx * 0.08, 1.5, 0.64]; p[h + 'p'] = [sx, 0.4, 0];
        p.chestYaw = -sx * 0.9; p.hipYaw = -sx * 0.5; p.chest[2] += 0.1; p.hip[2] += 0.05;
      }),
      limb: h,
    };
  },
  uppercut(B, sx) {
    const h = H(sx);
    return {
      windup: mk(B, p => { p[h] = [sx * 0.16, 1.05, 0.2]; p.hip[1] -= 0.08; p.chest[1] -= 0.08; p.chestYaw = sx * 0.2; }),
      strike: mk(B, p => {
        p[h] = [sx * 0.02, 1.62, 0.58]; p[h + 'p'] = [sx * 0.3, -1, 0.2];
        p.hip[1] += 0.03; p.chestYaw = -sx * 0.6; p.chest[2] += 0.1;
      }),
      limb: h,
    };
  },
  hammer(B, sx) {
    const h = H(sx);
    return {
      windup: mk(B, p => { p[h] = [sx * 0.12, 1.95, 0.02]; p.chest[2] -= 0.06; p[h + 'p'] = [sx, 0.2, -0.6]; }),
      strike: mk(B, p => {
        p[h] = [sx * 0.02, 1.2, 0.74]; p.chest[2] += 0.2; p.chest[1] -= 0.07;
        p.hip[1] -= 0.06; p.chestYaw = -sx * 0.5;
      }),
      limb: h,
    };
  },
  backfist(B, sx) {
    const h = H(sx);
    return {
      windup: mk(B, p => { p[h] = [-sx * 0.12, 1.42, 0.22]; p.chestYaw = B.chestYaw - sx * 0.3; }),
      strike: mk(B, p => { p[h] = [sx * 0.3, 1.55, 0.74]; p.chestYaw = -sx * 0.1; p[h + 'p'] = [sx * 0.8, 0.3, -0.2]; p.chest[2] += 0.06; }),
      limb: h,
    };
  },
  elbow(B, sx) {
    const h = H(sx);
    return {
      windup: mk(B, p => { p[h] = [sx * 0.35, 1.45, -0.05]; p.chestYaw = sx * 0.4; }),
      strike: mk(B, p => {
        p[h] = [-sx * 0.15, 1.52, 0.2]; p[h + 'p'] = [sx * 0.2, 0.1, 1];
        p.chestYaw = -sx * 1.1; p.hipYaw = -sx * 0.6; p.chest[2] += 0.12;
      }),
      limb: h[0] + 'elbow',
    };
  },
  twin(B) {
    return {
      windup: mk(B, p => { p.lh = [0.16, 1.28, 0.08]; p.rh = [-0.16, 1.28, 0.08]; p.chestYaw = 0; p.chest[2] -= 0.05; }),
      strike: mk(B, p => {
        p.lh = [0.12, 1.36, 0.82]; p.rh = [-0.12, 1.36, 0.82];
        p.chestYaw = 0; p.hipYaw *= 0.3; p.hip[2] += 0.12; p.chest[2] += 0.18;
      }),
      limb: 'lh',
    };
  },
  frontkick(B, sx, m) {
    const f = F(sx), y = m.y || 1.0;
    return {
      windup: mk(B, p => { p[f] = [sx * 0.1, 0.62, 0.35]; p[f + 'p'] = [0, 0.6, 1]; plantOn(p, B, sx); }),
      strike: mk(B, p => {
        p[f] = [sx * 0.05, y, 1.0]; plantOn(p, B, sx);
        p.chest[2] -= 0.12; p.hip[2] -= 0.04; p.chestYaw *= 0.5;
      }),
      limb: f,
    };
  },
  sidekick(B, sx) {
    const f = F(sx);
    return {
      windup: mk(B, p => { p[f] = [sx * 0.05, 0.75, 0.22]; p.hipYaw = -sx * 1.4; p.chestYaw = -sx * 1.3; plantOn(p, B, sx); }),
      strike: mk(B, p => {
        p[f] = [0, 1.05, 1.02]; p.hipYaw = -sx * 1.5; p.chestYaw = -sx * 1.4;
        plantOn(p, B, sx); p.chest[0] -= sx * 0.18; p.chest[2] -= 0.12; p.chest[1] -= 0.05;
        p[f + 'p'] = [sx, 0.5, 0.3];
      }),
      limb: f,
    };
  },
  roundhouse(B, sx) {
    const f = F(sx);
    return {
      windup: mk(B, p => { p[f] = [sx * 0.45, 0.72, 0.02]; p.hipYaw = -sx * 0.6; p[f + 'p'] = [sx, 0.4, 0.5]; plantOn(p, B, sx); }),
      strike: mk(B, p => {
        p[f] = [-sx * 0.15, 1.42, 0.74]; p.hipYaw = -sx * 1.5; p.chestYaw = -sx * 1.0;
        plantOn(p, B, sx); p.chest[0] += sx * 0.12; p.chest[2] -= 0.1; p.chest[1] -= 0.06;
        p[f + 'p'] = [-sx * 0.5, 0.6, 1];
      }),
      limb: f,
    };
  },
  lowkick(B, sx) {
    const f = F(sx);
    return {
      windup: mk(B, p => { p[f] = [sx * 0.35, 0.3, -0.05]; plantOn(p, B, sx); }),
      strike: mk(B, p => {
        p[f] = [-sx * 0.12, 0.22, 0.8]; p.hip[1] -= 0.14; p.chest[1] -= 0.16;
        p.hipYaw = -sx * 1.0; plantOn(p, B, sx);
      }),
      limb: f,
    };
  },
  axe(B, sx) {
    const f = F(sx);
    return {
      windup: mk(B, p => { p[f] = [sx * 0.12, 1.78, 0.5]; p.chest[2] -= 0.14; plantOn(p, B, sx); p[f + 'p'] = [0, 1, 0.3]; }),
      strike: mk(B, p => { p[f] = [sx * 0.05, 0.55, 0.88]; p.chest[2] += 0.06; plantOn(p, B, sx); }),
      limb: f,
    };
  },
  knee(B, sx) {
    const f = F(sx);
    return {
      windup: mk(B, p => { p[f] = [sx * 0.1, 0.35, 0.0]; plantOn(p, B, sx); }),
      strike: mk(B, p => {
        p[f] = [sx * 0.08, 0.72, 0.3]; p[f + 'p'] = [0, 0.6, 1]; plantOn(p, B, sx);
        p.lh = [0.14, 1.42, 0.56]; p.rh = [-0.14, 1.42, 0.56]; p.hip[2] += 0.12; p.chestYaw = 0;
      }),
      limb: f[0] + 'knee',
    };
  },
  jumpknee(B, sx) {
    const r = ARCH.knee(B, sx), s = F(-sx);
    r.strike.hip[1] += 0.3; r.strike.chest[1] += 0.3; r.strike[s] = [r.strike[s][0], 0.42, 0.0];
    r.strike[F(sx)][1] += 0.3;
    r.windup.hip[1] -= 0.12; r.windup.chest[1] -= 0.12;
    return r;
  },
  spinkick(B, sx) {
    const f = F(sx), s = F(-sx), dir = sx;
    return {
      windup: mk(B, p => {
        p.spin = dir * Math.PI * 0.85; p[f] = [sx * 0.05, 0.65, -0.3]; p[s] = [0, 0.07, 0.05];
        p.hip = [0, 0.9, 0.05]; p.chest = [0, 1.34, 0.05]; p.hipYaw = 0; p.chestYaw = 0;
      }),
      strike: mk(B, p => {
        p.spin = dir * Math.PI; p[f] = [0, 1.05, -1.02]; p[s] = [0, 0.07, 0.05];
        p.hip = [0, 0.9, 0.06]; p.chest = [0, 1.3, 0.16]; p.hipYaw = 0; p.chestYaw = 0;
      }),
      endSpin: dir * Math.PI * 2, limb: f,
    };
  },
  spinfist(B, sx) {
    const h = H(sx), dir = sx;
    return {
      windup: mk(B, p => {
        p.spin = dir * Math.PI; p[h] = [sx * 0.1, 1.4, 0.12]; p.lf = [0.1, 0.07, 0.05]; p.rf = [-0.1, 0.07, -0.05];
        p.hipYaw = 0; p.chestYaw = 0;
      }),
      strike: mk(B, p => {
        p.spin = dir * Math.PI * 1.5; p[h] = [sx * 0.78, 1.52, 0.06]; p[h + 'p'] = [0, -0.4, -1];
        p.lf = [0.1, 0.07, 0.05]; p.rf = [-0.1, 0.07, -0.05]; p.hipYaw = 0; p.chestYaw = 0; p.chest[0] -= sx * 0.06;
      }),
      endSpin: dir * Math.PI * 2, limb: h,
    };
  },
  tornado(B, sx) {
    const f = F(sx), s = F(-sx), dir = sx;
    return {
      windup: mk(B, p => {
        p.spin = dir * Math.PI; p[f] = [sx * 0.2, 0.8, 0.1]; p[s] = [0, 0.18, 0];
        p.hip[1] += 0.08; p.chest[1] += 0.08; p.hipYaw = 0; p.chestYaw = 0;
      }),
      strike: mk(B, p => {
        p.spin = dir * Math.PI * 1.5; p[f] = [sx * 0.92, 1.4, 0.05]; p[s] = [0, 0.3, 0];
        p.hip = [-sx * 0.05, 1.08, 0]; p.chest = [-sx * 0.25, 1.45, 0]; p.hipYaw = 0; p.chestYaw = 0;
        p[f + 'p'] = [0, 1, 0.3];
      }),
      endSpin: dir * Math.PI * 2, limb: f,
    };
  },
  duckpunch(B, sx) {
    const h = H(sx);
    return {
      windup: mk(B, p => { p.hip[1] = 0.74; p.chest[1] = 1.15; p.chest[2] += 0.08; p[h] = [sx * 0.12, 1.1, 0.1]; }),
      strike: mk(B, p => {
        p.hip[1] = 0.66; p.hip[2] += 0.1; p.chest = [p.chest[0], 1.06, 0.28];
        p[h] = [sx * 0.04, 1.02, 0.84]; p.chestYaw = -sx * 0.7; p.hipYaw = -sx * 0.3;
        p[H(-sx)] = [-sx * 0.08, 1.2, 0.35];
      }),
      limb: h,
    };
  },
  sweep(B, sx) {
    const f = F(sx), s = F(-sx);
    return {
      windup: mk(B, p => { p.hip[1] = 0.55; p.chest[1] = 0.98; p[f] = [sx * 0.6, 0.09, 0.2]; p[s] = [0, 0.07, -0.05]; p.lh = [0.3, 0.6, 0.2]; }),
      strike: mk(B, p => {
        p.hip[1] = 0.52; p.chest = [0, 0.96, 0.1]; p[f] = [-sx * 0.3, 0.1, 0.82]; p[s] = [0, 0.07, -0.05];
        p.hipYaw = -sx * 1.2; p.chestYaw = -sx * 0.6; p.lh = [0.35, 0.55, 0.1]; p.rh = [-0.3, 0.6, 0.05];
      }),
      limb: f,
    };
  },
  stomp(B, sx) {
    const f = F(sx);
    return {
      windup: mk(B, p => { p[f] = [sx * 0.1, 0.72, 0.38]; p[f + 'p'] = [0, 0.6, 1]; plantOn(p, B, sx); p.chest[2] -= 0.05; }),
      strike: mk(B, p => { p[f] = [sx * 0.05, 0.1, 0.66]; plantOn(p, B, sx, 0.2); p.chest[2] += 0.1; p.hip[1] -= 0.06; }),
      limb: f,
    };
  },
};

function double(a, b, B) {
  // a then b: strike2 starts from a mid pose that pulls the first limb back.
  const mid = lerpPose(a.strike, B, 0.6);
  return { windup: a.windup, strike: a.strike, limb: a.limb, windup2: mid, strike2: b.strike, limb2: b.limb };
}
ARCH.onetwo = (B, sx, m) => double(ARCH.straight(B, sx, m), ARCH.straight(B, -sx, m), B);
ARCH.flurry = (B, sx) => double(ARCH.hook(B, sx), ARCH.hook(B, -sx), B);
ARCH.kickpunch = (B, sx) => double(ARCH.frontkick(B, sx, {}), ARCH.straight(B, -sx, {}), B);

// ---------------------------------------------------------------------------
// The move pool. Fields: name, arch, sx (1 lead / -1 rear), from/to facing,
// sw (switches side), dmg, startup/active/recovery (seconds), stam, height,
// arc ('h' horizontal / 'v' vertical), props, lunge (metres), y (arch param).

const M = (id, name, arch, sx, from, to, sw, dmg, su, ac, re, stam, height, arc, props = [], lunge = 0.3, y) =>
  ({ id, name, arch, sx, from, to, sw, dmg, startup: su, active: ac, recovery: re, stam, height, arc, props, lunge, y });

export const MOVES = [
  M('jab', 'Jab', 'straight', 1, 'F', 'F', false, 6, 0.2, 0.08, 0.26, 7, 'high', 'v', [], 0.25),
  M('cross', 'Straight Cross', 'straight', -1, 'F', 'F', true, 8, 0.26, 0.08, 0.3, 10, 'high', 'v', [], 0.3),
  M('palm', 'Palm Strike', 'straight', 1, 'F', 'B', false, 9, 0.3, 0.09, 0.3, 11, 'mid', 'v', [], 0.35, 1.35),
  M('lhook', 'Lead Hook', 'hook', 1, 'F', 'B', false, 9, 0.3, 0.09, 0.32, 11, 'high', 'h'),
  M('rhook', 'Rear Hook', 'hook', -1, 'B', 'F', true, 10, 0.32, 0.09, 0.32, 12, 'high', 'h'),
  M('upper', 'Uppercut', 'uppercut', -1, 'F', 'F', true, 12, 0.36, 0.1, 0.38, 14, 'mid', 'v'),
  M('lupper', 'Lead Uppercut', 'uppercut', 1, 'B', 'F', false, 9, 0.28, 0.09, 0.3, 10, 'mid', 'v'),
  M('hammer', 'Hammer Fist', 'hammer', 1, 'B', 'F', false, 13, 0.4, 0.1, 0.4, 15, 'high', 'v', ['break']),
  M('backfist', 'Backfist', 'backfist', 1, 'B', 'B', false, 7, 0.22, 0.08, 0.28, 8, 'high', 'h', [], 0.2),
  M('rbackfist', 'Whip Backfist', 'backfist', -1, 'B', 'F', true, 8, 0.24, 0.08, 0.28, 9, 'high', 'h'),
  M('elbow', 'Elbow Strike', 'elbow', -1, 'F', 'B', true, 10, 0.26, 0.08, 0.3, 11, 'high', 'h', [], 0.45),
  M('lelbow', 'Rising Elbow', 'elbow', 1, 'B', 'B', true, 9, 0.24, 0.08, 0.3, 10, 'high', 'h', [], 0.45),
  M('twin', 'Twin Palms', 'twin', 1, 'B', 'F', false, 14, 0.42, 0.1, 0.42, 16, 'mid', 'v', ['break'], 0.4),
  M('onetwo', 'One-Two', 'onetwo', 1, 'F', 'F', true, 6, 0.22, 0.07, 0.34, 14, 'high', 'v', ['double'], 0.3),
  M('fkick', 'Front Kick', 'frontkick', 1, 'F', 'F', false, 12, 0.34, 0.1, 0.4, 13, 'mid', 'v', [], 0.3),
  M('push', 'Push Kick', 'frontkick', -1, 'F', 'B', true, 11, 0.36, 0.1, 0.4, 13, 'mid', 'v', ['break'], 0.3, 0.85),
  M('crane', 'Crane Kick', 'frontkick', 1, 'B', 'F', true, 13, 0.4, 0.1, 0.42, 14, 'high', 'v', ['jump'], 0.35, 1.38),
  M('sidekick', 'Side Kick', 'sidekick', 1, 'B', 'B', false, 14, 0.38, 0.1, 0.42, 15, 'mid', 'v', [], 0.35),
  M('round', 'Roundhouse', 'roundhouse', -1, 'F', 'F', true, 15, 0.42, 0.1, 0.45, 17, 'high', 'h', [], 0.3),
  M('lround', 'Lead Roundhouse', 'roundhouse', 1, 'B', 'F', false, 13, 0.38, 0.1, 0.42, 15, 'high', 'h', [], 0.25),
  M('lowkick', 'Low Kick', 'lowkick', -1, 'F', 'F', false, 8, 0.28, 0.09, 0.32, 9, 'low', 'h', [], 0.25),
  M('shin', 'Shin Kick', 'lowkick', 1, 'B', 'F', false, 7, 0.24, 0.08, 0.3, 8, 'low', 'h', [], 0.25),
  M('axe', 'Axe Kick', 'axe', 1, 'F', 'B', false, 18, 0.55, 0.1, 0.5, 20, 'high', 'v', ['break'], 0.35),
  M('heel', 'Heel Drop', 'axe', -1, 'F', 'F', true, 16, 0.5, 0.1, 0.48, 18, 'high', 'v', ['break'], 0.35),
  M('knee', 'Knee Strike', 'knee', -1, 'F', 'F', true, 11, 0.28, 0.09, 0.33, 12, 'mid', 'v', [], 0.45),
  M('jknee', 'Flying Knee', 'jumpknee', -1, 'B', 'F', true, 16, 0.46, 0.1, 0.46, 18, 'mid', 'v', ['jump'], 0.8),
  M('sbk', 'Spinning Back Kick', 'spinkick', -1, 'B', 'F', true, 17, 0.48, 0.1, 0.48, 19, 'mid', 'v', [], 0.3),
  M('sbf', 'Spinning Backfist', 'spinfist', 1, 'B', 'B', true, 13, 0.4, 0.1, 0.4, 15, 'high', 'h', [], 0.35),
  M('tornado', 'Tornado Kick', 'tornado', -1, 'B', 'F', false, 19, 0.52, 0.1, 0.52, 21, 'high', 'h', ['jump'], 0.4),
  M('duck', 'Ducking Strike', 'duckpunch', -1, 'F', 'B', true, 9, 0.32, 0.09, 0.34, 11, 'mid', 'v', ['duck'], 0.35),
  M('sweep', 'Sweeping Kick', 'sweep', 1, 'B', 'B', true, 12, 0.42, 0.1, 0.44, 14, 'low', 'h', ['duck'], 0.2),
  M('stomp', 'Stomp', 'stomp', 1, 'F', 'F', false, 10, 0.34, 0.09, 0.36, 12, 'low', 'v', [], 0.3),
  M('flurry', 'Twin Hooks', 'flurry', 1, 'B', 'F', false, 7, 0.3, 0.08, 0.38, 16, 'high', 'h', ['double'], 0.3),
  M('heart', 'Heart Palm', 'straight', -1, 'B', 'F', false, 11, 0.34, 0.09, 0.36, 13, 'mid', 'v', ['break'], 0.35, 1.3),
  M('kickpunch', 'Snap & Strike', 'kickpunch', 1, 'F', 'F', true, 7, 0.3, 0.08, 0.38, 16, 'mid', 'v', ['double'], 0.3),
];
export const MOVE_BY_ID = Object.fromEntries(MOVES.map(m => [m.id, m]));

// Precompute reach (how far in front of the root the strike lands).
for (const m of MOVES) {
  const B = clonePose(m.from === 'F' ? GUARD_F : GUARD_B);
  const a = ARCH[m.arch](B, m.sx, m);
  const zOf = (pose, limb) => {
    if (limb.endsWith('knee')) return 0.55;
    if (limb.endsWith('elbow')) return 0.42;
    const v = pose[limb];
    // spun poses: project onto the facing direction after the spin
    return v[2] * Math.cos(pose.spin) + v[0] * Math.sin(pose.spin);
  };
  m.reach = Math.abs(zOf(a.strike, a.limb)) + m.lunge + 0.28;
  m.hits = a.strike2 ? 2 : 1;
  m.speed = m.startup < 0.27 ? 'Fast' : m.startup < 0.37 ? 'Medium' : 'Slow';
}

export function endStance(move, startStance) {
  const side = startStance[1];
  return move.to + (move.sw ? (side === 'L' ? 'R' : 'L') : side);
}

const easeOut = u => 1 - (1 - u) ** 3;
const smooth = u => u * u * (3 - 2 * u);

export function buildTimeline(move, startStance, speed = 1) {
  const S = move.startup / speed, A = move.active, R = move.recovery / speed;
  const B = clonePose(move.from === 'F' ? GUARD_F : GUARD_B);
  const canonEnd = guardPose(move.to + (move.sw ? 'R' : 'L'));
  const a = ARCH[move.arch](B, move.sx, move);
  const keys = [
    { t: 0, p: B },
    { t: S * 0.6, p: a.windup },
    { t: S, p: a.strike, ease: 'out' },
    { t: S + A, p: a.strike },
  ];
  const hits = [{ t0: S, t1: S + A, limb: a.limb, idx: 0 }];
  let t = S + A;
  if (a.strike2) {
    keys.push({ t: t + 0.08, p: a.windup2 });
    keys.push({ t: t + 0.16, p: a.strike2, ease: 'out' });
    keys.push({ t: t + 0.16 + A, p: a.strike2 });
    hits.push({ t0: t + 0.16, t1: t + 0.16 + A, limb: a.limb2, idx: 1 });
    t += 0.16 + A;
  }
  const endP = clonePose(canonEnd); endP.spin = a.endSpin || 0;
  keys.push({ t: t + R, p: endP });
  if (startStance[1] === 'R') {
    for (const k of keys) k.p = mirrorPose(k.p);
    for (const h of hits) h.limb = mirrorLimb(h.limb);
  }
  return { keys, hits, total: t + R, hitEnd: t, recovery: R, end: endStance(move, startStance) };
}

export function sampleTimeline(tl, t, out) {
  const k = tl.keys;
  if (t <= 0) return lerpPose(k[0].p, k[0].p, 0, out);
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i].t) {
      const span = k[i].t - k[i - 1].t;
      const u = span > 0 ? (t - k[i - 1].t) / span : 1;
      return lerpPose(k[i - 1].p, k[i].p, k[i].ease === 'out' ? easeOut(u) : smooth(u), out);
    }
  }
  return lerpPose(k[k.length - 1].p, k[k.length - 1].p, 0, out);
}

// ---------------------------------------------------------------------------
// Styles and decks.

export const STYLES = {
  forsaken: {
    name: 'Forsaken', ability: 'Parry', kind: 'parry', color: '#e6c36a',
    desc: 'Deflect an incoming strike with precise timing. A successful parry staggers the attacker and restores stamina. Unforgiving if mistimed.',
    starter: ['jab', 'cross', 'palm', 'lhook', 'rhook', 'backfist', 'fkick', 'sidekick', 'hammer', 'lupper'],
  },
  kahlt: {
    name: 'Kahlt', ability: 'Absorb', kind: 'absorb', color: '#d06a4e',
    desc: 'Brace and absorb blows, taking reduced damage without flinching. Absorbing empowers your next strike.',
    starter: ['jab', 'cross', 'upper', 'knee', 'elbow', 'twin', 'push', 'heart', 'backfist', 'lupper'],
  },
  windfall: {
    name: 'Windfall', ability: 'Avoid', kind: 'avoid', color: '#7fb6c9',
    desc: 'Whirl out of harm’s way, evading any strike. A successful avoid quickens your counterattack.',
    starter: ['jab', 'lowkick', 'fkick', 'round', 'lround', 'backfist', 'shin', 'sidekick', 'palm', 'rbackfist'],
  },
  stagger: {
    name: 'Stagger', ability: 'Sway', kind: 'sway', color: '#9fc06e',
    desc: 'A drunken sway that slips high and mid strikes. Attack straight out of the sway for a lightning counter.',
    starter: ['jab', 'duck', 'cross', 'backfist', 'lupper', 'rhook', 'lhook', 'stomp', 'rbackfist', 'knee'],
  },
};

export function slotStance(deck, owner, idx) {
  let s = owner;
  for (let i = 0; i < idx; i++) {
    const m = MOVE_BY_ID[deck[owner].chain[i]];
    if (!m) return null;
    s = endStance(m, s);
  }
  return s;
}

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

// Builds a random valid deck from a list of move ids. `weight(move)` biases picks.
export function randomDeck(ids, rnd = Math.random, weight = () => 1, chainLen = 3) {
  const pool = ids.map(id => MOVE_BY_ID[id]).filter(Boolean);
  const choose = (facing, exclude = []) => {
    const opts = pool.filter(m => m.from === facing && !exclude.includes(m.id));
    const list = opts.length ? opts : pool.filter(m => m.from === facing);
    if (!list.length) return null;
    let total = 0; const ws = list.map(m => (total += Math.max(0.01, weight(m))));
    const r = rnd() * total;
    return list[ws.findIndex(w => w >= r)];
  };
  const deck = {};
  for (const st of STANCES) {
    const chain = [];
    let s = st;
    for (let i = 0; i < chainLen; i++) {
      const m = choose(s[0], chain);
      if (!m) break;
      chain.push(m.id); s = endStance(m, s);
    }
    const heavy = choose(st[0], chain.concat(['jab', 'backfist']));
    deck[st] = { chain, alt: heavy ? heavy.id : chain[0] };
  }
  return deck;
}

export function validateDeck(deck, unlocked) {
  for (const st of STANCES) {
    const d = deck[st] || (deck[st] = { chain: [], alt: null });
    let s = st;
    const chain = [];
    for (const id of d.chain) {
      const m = MOVE_BY_ID[id];
      if (!m || m.from !== s[0] || (unlocked && !unlocked.includes(id))) break;
      chain.push(id); s = endStance(m, s);
    }
    d.chain = chain;
    const alt = MOVE_BY_ID[d.alt];
    if (!alt || alt.from !== st[0] || (unlocked && !unlocked.includes(d.alt))) d.alt = null;
  }
  return deck;
}
export { pick };
