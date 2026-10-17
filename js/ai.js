// Opponent brain: reads the player's attacks, picks defenses with a skill roll,
// manages distance and strings together combos from its own deck.

export const TEMPERAMENTS = {
  aggressive: { label: 'Aggressive', aggr: 1.0, range: 1.55, combo: 0.85, def: { block: 0.55, dodge: 0.15, special: 0.3 } },
  patient: { label: 'Patient', aggr: 0.4, range: 2.2, combo: 0.45, def: { block: 0.35, dodge: 0.2, special: 0.6 } },
  evasive: { label: 'Evasive', aggr: 0.6, range: 2.4, combo: 0.5, def: { block: 0.15, dodge: 0.55, special: 0.45 } },
  balanced: { label: 'Balanced', aggr: 0.65, range: 1.9, combo: 0.6, def: { block: 0.45, dodge: 0.3, special: 0.35 } },
};

const rand = (a, b) => a + Math.random() * (b - a);

export class AIController {
  constructor(me, opp, profile) {
    this.me = me; this.opp = opp; this.p = profile;
    this.seenId = -1; this.plan = null; this.blockUntil = 0;
    this.nextAttackAt = 0; this.comboLeft = 0; this.pressedFor = -1;
    this.strafeDir = 0; this.strafeT = 0; this.engage = false;
  }

  update(dt, game) {
    const me = this.me, opp = this.opp, it = me.intent, p = this.p;
    it.light = it.alt = it.dodge = it.special = it.switchSide = it.switchFace = it.flow = false;
    it.mx = it.mz = 0;
    if (me.action.type === 'ko' || me.action.type === 'bow' || opp.action.type === 'ko') { it.block = false; return; }
    const now = game.now;
    const dist = Math.hypot(opp.pos.x - me.pos.x, opp.pos.z - me.pos.z);

    // --- read the opponent ---------------------------------------------------
    const oa = opp.action;
    if (oa.type === 'attack' && oa.id !== this.seenId) {
      this.seenId = oa.id;
      this.planDefense(oa, dist, now);
    }
    if (this.plan && now >= this.plan.at) {
      const pl = this.plan; this.plan = null;
      if (pl.kind === 'dodge') { it.dodge = true; it.mx = pl.mx; it.mz = pl.mz; }
      else if (pl.kind === 'special') { it.special = true; it.mx = pl.mx; }
      else if (pl.kind === 'block') this.blockUntil = pl.until;
    }
    it.block = now < this.blockUntil;

    // --- offense ---------------------------------------------------------------
    const act = me.action;
    if (act.type === 'attack') {
      if (this.comboLeft > 0 && this.pressedFor !== act.id && act.t > act.tl.hitEnd - 0.06) {
        this.pressedFor = act.id;
        const whiffed = !act.landed && act.t > act.tl.hitEnd;
        if (!whiffed && me.stamina > 12) {
          this.comboLeft--;
          if (Math.random() < 0.22) it.alt = true; else it.light = true;
        } else this.comboLeft = 0;
      }
    } else if ((act.type === 'idle' || act.type === 'block') && !it.block && !this.plan) {
      const n = me.nextMoves();
      const mv = n.light || n.alt;
      const reach = mv ? mv.reach : 1.4;
      const punish = opp.isVulnerableWindow() && Math.random() < p.skill;
      const lowStam = me.stamina < 25 && !punish;
      if (now > this.nextAttackAt && !lowStam) {
        this.engage = true;
        if (dist < reach + 0.12) {
          const rate = p.aggr * 2.4 + (punish ? 12 : 0);
          if (Math.random() < rate * dt) {
            if (n.alt && Math.random() < 0.28 && n.alt.reach > dist - 0.1) it.alt = true; else it.light = true;
            this.comboLeft = Math.floor(Math.random() * (1 + p.combo * 2.6));
            this.nextAttackAt = now + rand(0.5, 1.6) / (0.5 + p.aggr);
            this.engage = false;
          }
        }
      } else this.engage = false;

      // stance play
      if (Math.random() < 0.18 * dt) { if (Math.random() < 0.5) it.switchSide = true; else it.switchFace = true; }
      if (me.flow >= 100 && dist < 2.6) it.flow = true;
    }

    // --- footwork ---------------------------------------------------------------
    let desired = this.engage ? 1.25 : p.range;
    if (me.stamina < 25) desired += 1.0;
    if (dist > desired + 0.25) it.mz = 1;
    else if (dist < desired - 0.35) it.mz = -1;
    if ((this.strafeT -= dt) <= 0) {
      this.strafeDir = [-1, 0, 1, -1, 1][Math.floor(Math.random() * 5)];
      this.strafeT = rand(0.6, 2.0);
    }
    it.mx = this.strafeDir * (this.engage ? 0.3 : 0.75);
    // stay off the arena edge
    const r = Math.hypot(me.pos.x, me.pos.z);
    if (r > 7.5 && dist > 1.2) it.mz = 1;
  }

  planDefense(oa, dist, now) {
    const p = this.p, opp = this.opp, me = this.me;
    const move = oa.move;
    const S = oa.tl.hits[0].t0;
    const tth = Math.max(0, (S - oa.t) / opp.speedMult());
    if (dist > move.reach + 0.7) return; // will whiff: let it
    const reactAt = now + p.react * rand(0.85, 1.2);
    const impact = now + tth;
    const blockUntil = impact + (oa.tl.hitEnd - S) + 0.18;
    if (Math.random() > p.skill) {
      // misread: late block or the wrong dodge
      const r = Math.random();
      if (r < 0.35) this.plan = { kind: 'block', at: impact + 0.03, until: blockUntil };
      else if (r < 0.55) this.plan = { kind: 'dodge', at: Math.max(reactAt, impact - 0.12), mx: Math.random() < 0.5 ? -1 : 1, mz: 0 };
      return;
    }
    const w = p.def;
    let roll = Math.random() * (w.block + w.dodge + w.special);
    let kind = roll < w.block ? 'block' : roll < w.block + w.dodge ? 'dodge' : 'special';
    const style = me.style.kind;
    if (kind === 'special' && style === 'sway' && move.height === 'low') kind = 'block';
    let at;
    if (kind === 'block') at = reactAt;
    else if (kind === 'dodge') at = impact - 0.13;
    else at = style === 'parry' ? impact - 0.1 : style === 'absorb' ? Math.max(reactAt, impact - 0.3) : impact - 0.14;
    if (at < reactAt) { // not enough time for the fancy option
      if (reactAt < impact - 0.02) { kind = 'block'; at = reactAt; } else return;
    }
    if (kind === 'block') this.plan = { kind, at, until: blockUntil };
    else if (kind === 'dodge') {
      const side = move.arc === 'v' && Math.random() < 0.7;
      this.plan = { kind, at, mx: side ? (Math.random() < 0.5 ? -1 : 1) : 0, mz: side ? 0 : -1 };
    } else this.plan = { kind, at, mx: Math.random() < 0.5 ? -1 : 1 };
  }
}
