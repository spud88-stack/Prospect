import * as THREE from 'three';

const _seg = new THREE.Vector3(), _ap = new THREE.Vector3(), _base = new THREE.Vector3(), _dir = new THREE.Vector3();

function distToSegment(p, a, b) {
  _seg.subVectors(b, a);
  _ap.subVectors(p, a);
  const t = Math.max(0, Math.min(1, _ap.dot(_seg) / (_seg.lengthSq() || 1)));
  return _ap.addScaledVector(_seg, -t).length();
}

// Called once per frame for each attacker/defender pair after both are solved.
export function checkHits(att, def, game) {
  const a = att.action;
  if (a.type !== 'attack' || def.action.type === 'ko') return;
  for (const h of a.tl.hits) {
    if (a.hitDone[h.idx] || a.t < h.t0 || a.t > h.t1 + 0.02) continue;
    const p = att.limbPos(h.limb);
    _base.copy(def.pos); _base.y += 0.12;
    const d = distToSegment(p, _base, def.j.head);
    const isLeg = /f$|knee/.test(h.limb);
    if (d > (isLeg ? 0.36 : 0.31)) continue;
    a.hitDone[h.idx] = true;
    resolveHit(att, def, a, p.clone(), game);
  }
}

function inWindow(act) { return act.t >= act.win0 && act.t <= act.win1; }

export function resolveHit(att, def, a, point, game) {
  const move = a.move, da = def.action;
  _dir.subVectors(def.pos, att.pos).setY(0).normalize();
  const dirv = _dir.clone();
  const heavy = move.dmg >= 14;

  // --- evasion -----------------------------------------------------------
  if (da.type === 'dodge' && da.t >= da.i0 && da.t <= da.i1 && !(da.side && move.arc === 'h')) {
    return evaded(att, def, move, point, game, 'AVOIDED');
  }
  if (da.type === 'special' && inWindow(da)) {
    if (da.kind === 'avoid') { da.success = true; def.counterT = 1.2; return evaded(att, def, move, point, game, 'AVOIDED', 'special'); }
    if (da.kind === 'sway' && move.height !== 'low') { da.success = true; def.counterT = 1.2; return evaded(att, def, move, point, game, 'SWAYED', 'special'); }
  }
  if (da.type === 'attack') {
    const props = da.move.props, S = da.tl.hits[0].t0;
    if (props.includes('duck') && move.height === 'high' && da.t > S * 0.3 && da.t < da.tl.hitEnd + 0.05)
      return evaded(att, def, move, point, game, 'DUCKED');
    if (props.includes('jump') && move.height === 'low' && da.t > S * 0.3 && da.t < da.tl.hitEnd + 0.05)
      return evaded(att, def, move, point, game, 'JUMPED');
  }

  // --- parry ---------------------------------------------------------------
  if (da.type === 'special' && da.kind === 'parry' && inWindow(da)) {
    da.success = true;
    att.stagger(0.85, 'parried', dirv.clone().negate(), 1.2);
    def.stamina = Math.min(100, def.stamina + 25);
    def.gainFlow(22);
    game.sfx.parry();
    game.sparks(point, 0xffd27a, 22, 3.5);
    game.floatText(point, 'PARRIED', 'parry');
    game.hitstop(0.12); game.slowmo(0.35, 0.35); game.shake(0.12);
    game.learn(def, move, 34);
    return;
  }

  // --- absorb --------------------------------------------------------------
  if (da.type === 'special' && da.kind === 'absorb' && inWindow(da)) {
    da.success = true;
    const dmg = move.dmg * 0.35;
    def.hp -= dmg; def.stamina = Math.min(100, def.stamina + 10);
    def.empowerT = 1.6; def.gainFlow(16);
    def.flash = 0.6; def.flashColor.set('#7fc4ff');
    game.sfx.absorb();
    game.sparks(point, 0x8fd0ff, 14, 2.5);
    game.floatText(point, 'ABSORBED', 'absorb');
    game.hitstop(0.06); game.shake(0.05);
    game.learn(def, move, 30);
    if (def.hp <= 0) { def.hp = 0; game.onKO(def, att, dirv); }
    return;
  }

  // --- block ---------------------------------------------------------------
  const facing = def.facingDir.dot(dirv.clone().negate()) > 0.2;
  const blocking = da.type === 'block' || (da.type === 'stagger' && da.kind === 'block');
  if (blocking && facing) {
    const breaks = move.props.includes('break');
    const cost = move.dmg * (breaks ? 1.2 : 1.6);
    def.spend(cost, game.now);
    game.learn(def, move, 12);
    if (def.stamina <= 0 || def.exhausted) {
      def.hp -= move.dmg * 0.6;
      def.stagger(1.2, 'break', dirv, 2.2);
      game.sfx.guardbreak();
      game.sparks(point, 0xff6a4a, 20, 3);
      game.floatText(point, 'GUARD BROKEN', 'break');
      game.hitstop(0.1); game.shake(0.14);
      if (def.hp <= 0) { def.hp = 0; game.onKO(def, att, dirv); }
      return;
    }
    if (breaks) {
      def.hp -= move.dmg * 0.4;
      def.stagger(0.45, 'break', dirv, 2.0);
      game.floatText(point, 'BREAK', 'break');
    } else {
      def.stagger(0.16 + move.dmg * 0.006, 'block', dirv, 1.4);
    }
    a.landed = true;
    def.recoil = 0.5;
    game.sfx.block();
    game.sparks(point, 0xcfe6ff, 8, 1.6);
    game.hitstop(0.045);
    if (def.hp <= 0) { def.hp = 0; game.onKO(def, att, dirv); }
    return;
  }

  // --- clean hit -------------------------------------------------------------
  let dmg = 0.8 * move.dmg * (a.empowered ? 1.35 : 1) * (att.flowTime > 0 ? 1.1 : 1);
  if (def.exhausted) dmg *= 1.15;
  def.hp -= dmg;
  a.landed = true;
  att.stamina = Math.min(100, att.stamina + move.stam * 0.45);
  att.gainFlow(dmg * 1.6);
  def.gainFlow(dmg * 0.5);
  def.flash = 0.9; def.flashColor.set('#ffffff');
  def.recoil = 1;
  const stun = 0.3 + move.dmg * 0.016;
  def.stagger(stun, heavy ? 'heavy' : 'hit', dirv, heavy ? 2.6 : 1.5);
  game.sfx.hit(move.dmg);
  game.sparks(point, 0xffffff, heavy ? 16 : 9, heavy ? 3 : 2);
  game.hitstop(heavy ? 0.09 : 0.055);
  game.shake(heavy ? 0.1 : 0.05);
  if (a.empowered) game.floatText(point, 'EMPOWERED', 'absorb');
  if (def.hp <= 0) { def.hp = 0; game.onKO(def, att, dirv); }
}

function evaded(att, def, move, point, game, label, how) {
  game.sfx.evade();
  game.floatText(point, label, 'evade');
  def.gainFlow(10);
  game.learn(def, move, how === 'special' ? 30 : 18);
}
