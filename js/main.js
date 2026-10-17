import * as THREE from 'three';
import { Fighter, randomOutfit, PALETTE, MASK_STYLES, MASK_MARKS } from './fighter.js';
import { MOVES, MOVE_BY_ID, STYLES, STANCES, STANCE_NAMES, randomDeck, validateDeck, slotStance, endStance } from './moves.js';
import { checkHits } from './combat.js';
import { AIController, TEMPERAMENTS } from './ai.js';
import { buildArena, ARENA_RADIUS } from './arena.js';
import { Sfx } from './audio.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ============================================================ renderer
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
camera.position.set(0, 3, 8);
const camLook = new THREE.Vector3(0, 1, 0);
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const sfx = new Sfx();

// ============================================================ profile
const SAVE_KEY = 'prospect-duels-v1';
function starterDeck(ids) { return randomDeck(ids, Math.random, m => (m.startup < 0.31 ? 3 : 1)); }
function newProfile() {
  const style = 'forsaken';
  const unlocked = [...STYLES[style].starter];
  return { name: 'Prospect', style, outfit: randomOutfit(), unlocked, deck: starterDeck(unlocked), learn: {}, wins: 0, losses: 0, streak: 0, best: 0 };
}
function loadProfile() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.deck && s.unlocked && s.outfit && STYLES[s.style]) {
      s.unlocked = s.unlocked.filter(id => MOVE_BY_ID[id]);
      validateDeck(s.deck, s.unlocked);
      return s;
    }
  } catch (e) { /* storage unavailable */ }
  return null;
}
function saveProfile() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (e) { /* ignore */ } }
let profile = loadProfile() || newProfile();

// ============================================================ particles
const SPARK_N = 500;
const sparkGeo = new THREE.BufferGeometry();
const sparkPos = new Float32Array(SPARK_N * 3).fill(-999);
const sparkCol = new Float32Array(SPARK_N * 3);
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.075, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
sparks.frustumCulled = false;
scene.add(sparks);
const sparkState = Array.from({ length: SPARK_N }, () => ({ life: 0, max: 1, v: new THREE.Vector3(), c: new THREE.Color() }));
let sparkIdx = 0;
function emitSparks(p, color, n, speed) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const s = sparkState[sparkIdx], k = sparkIdx;
    sparkIdx = (sparkIdx + 1) % SPARK_N;
    s.life = s.max = rand(0.25, 0.6);
    s.v.set(rand(-1, 1), rand(-0.3, 1.2), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1));
    s.c.copy(c);
    sparkPos[k * 3] = p.x; sparkPos[k * 3 + 1] = p.y; sparkPos[k * 3 + 2] = p.z;
  }
}
function updateSparks(dt) {
  for (let k = 0; k < SPARK_N; k++) {
    const s = sparkState[k];
    if (s.life <= 0) continue;
    s.life -= dt;
    s.v.y -= 7 * dt; s.v.multiplyScalar(1 - dt * 2.5);
    sparkPos[k * 3] += s.v.x * dt; sparkPos[k * 3 + 1] += s.v.y * dt; sparkPos[k * 3 + 2] += s.v.z * dt;
    const f = Math.max(0, s.life / s.max);
    sparkCol[k * 3] = s.c.r * f; sparkCol[k * 3 + 1] = s.c.g * f; sparkCol[k * 3 + 2] = s.c.b * f;
    if (s.life <= 0) sparkPos[k * 3 + 1] = -999;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.color.needsUpdate = true;
}

// ============================================================ game state
const G = {
  mode: 'attract', phase: 'none', phaseT: 0, paused: false,
  f1: null, f2: null, ai1: null, ai2: null, arena: null,
  hitstopT: 0, slowT: 0, slowScale: 1, shakeT: 0, shakeAmp: 0,
  score: [0, 0], round: 1, opp: null, matchLearn: {}, attractReset: 0, orbit: 0,
};
const dummyTarget = { pos: new THREE.Vector3(0, 0, 6) };

const game = {
  now: 0, sfx,
  sparks: emitSparks,
  floatText,
  hitstop(t) { G.hitstopT = Math.max(G.hitstopT, t); },
  slowmo(t, s) { G.slowT = Math.max(G.slowT, t); G.slowScale = s; },
  shake(a) { G.shakeAmp = Math.max(G.shakeAmp * (G.shakeT > 0 ? 1 : 0), a); G.shakeT = 0.25; },
  learn(def, move, amt) { if (def.isPlayer && G.mode === 'duel') learnMove(move, amt); },
  onFlow(f) { sfx.flow(); floatText(f.j.head, 'FLOW STATE', 'flow'); },
  onKO(def, att, dir) {
    if (def.action.type === 'ko') return;
    def.ko(dir);
    sfx.ko();
    G.slowT = 1.1; G.slowScale = 0.28;
    if (G.mode === 'attract') { G.attractReset = 3; return; }
    if (G.mode !== 'duel' || G.phase !== 'fight') return;
    G.phase = 'ko'; G.phaseT = 0;
    G.roundWinner = att === G.f1 ? 0 : 1;
    G.score[G.roundWinner]++;
  },
};

// ============================================================ opponents
const NAME_A = ['Ka', 'Mir', 'Ul', 'Sen', 'Tor', 'Ash', 'Ve', 'Ryn', 'Ost', 'Lio', 'Dar', 'Fen', 'Ise', 'Ko', 'Bra', 'Hal', 'Yun', 'Zei', 'Oru', 'Tae', 'Vash', 'Esk'];
const NAME_B = ['ren', 'vik', 'ash', 'ane', 'or', 'ith', 'mar', 'el', 'ka', 'os', 'dun', 'ya', 'ric', 'eon', 'is', 'thal', 'wyn', 'ro'];
const EPITHETS = ['the Unbowed', 'of the Ashen Reach', 'the Quiet', 'Who Walks Alone', 'of the Fallen Spire', 'the Patient Blade', 'of Seven Masks', 'the Lantern-Bearer',
  'the Unforgiven', 'of the Grey Coast', 'the Last Disciple', 'Who Bends Not', 'of the Hollow Bell', 'the Ember', 'of the Old Roads', 'the Wanderer'];
const TIERS = ['Initiate', 'Prospect', 'Disciple', 'Adept', 'Marked', 'Mentor', 'Master'];
const tierOf = rank => TIERS[Math.min(TIERS.length - 1, Math.floor(rank / 2))];

function genOpponent(rank) {
  const styleKey = pick(Object.keys(STYLES));
  const tKey = pick(Object.keys(TEMPERAMENTS));
  const t = TEMPERAMENTS[tKey];
  const ids = MOVES.map(m => m.id);
  const weight = m => {
    let w = 1;
    if (tKey === 'aggressive') w *= m.startup < 0.32 ? 3 : 0.7;
    if (tKey === 'patient') w *= m.dmg >= 13 ? 2.5 : 1;
    if (tKey === 'evasive') w *= /kick|sweep|round|tornado|stomp|crane/.test(m.arch + m.id) ? 2.2 : 1;
    if (STYLES[styleKey].starter.includes(m.id)) w *= 2;
    return w;
  };
  return {
    name: pick(NAME_A) + pick(NAME_B) + ' ' + pick(EPITHETS),
    style: styleKey, temperament: t.label, tier: tierOf(rank), rank,
    outfit: randomOutfit(),
    deck: randomDeck(ids, Math.random, weight),
    ai: { ...t, skill: Math.min(0.9, 0.3 + rank * 0.065), react: Math.max(0.13, 0.3 - rank * 0.018) },
  };
}

// ============================================================ setup helpers
function spawnFighter(desc, isPlayer) {
  return new Fighter(scene, { name: desc.name, style: desc.style, outfit: desc.outfit, deck: desc.deck, isPlayer });
}
function clearFighters() {
  for (const k of ['f1', 'f2']) if (G[k]) { G[k].dispose(); G[k] = null; }
  G.ai1 = G.ai2 = null;
}
function newArena() {
  if (G.arena) G.arena.dispose();
  G.arena = buildArena(scene);
}
function place(stance2 = 'FL') {
  const { f1, f2 } = G;
  f1.reset('FL'); f1.pos.set(0, 0, -2.1); f1.yaw = 0;
  if (f2) { f2.reset(stance2); f2.pos.set(0, 0, 2.1); f2.yaw = Math.PI; }
}
function playerDesc() { return { name: profile.name, style: profile.style, outfit: profile.outfit, deck: profile.deck }; }

function setupAttract() {
  clearFighters(); newArena();
  const a = genOpponent(4), b = genOpponent(6);
  G.f1 = spawnFighter(a, false); G.f2 = spawnFighter(b, false);
  G.ai1 = new AIController(G.f1, G.f2, a.ai); G.ai2 = new AIController(G.f2, G.f1, b.ai);
  place(pick(STANCES));
  G.mode = 'attract'; G.phase = 'none';
  $('#hud').classList.add('hidden');
}
function setupWardrobe() {
  clearFighters();
  if (!G.arena) newArena();
  G.f1 = spawnFighter(playerDesc(), true);
  G.f1.reset('FL'); G.f1.pos.set(0, 0, 0); G.f1.yaw = 0;
  G.mode = 'wardrobe';
}
function setupDuel() {
  clearFighters(); newArena();
  validateDeck(profile.deck, profile.unlocked);
  const opp = G.opp = genOpponent(profile.streak);
  G.f1 = spawnFighter(playerDesc(), true);
  G.f2 = spawnFighter(opp, false);
  G.ai2 = new AIController(G.f2, G.f1, opp.ai);
  G.mode = 'duel'; G.phase = 'versus'; G.phaseT = 0;
  G.score = [0, 0]; G.round = 1; G.matchLearn = {};
  place(pick(STANCES));
  // versus card
  const st = STYLES[opp.style];
  $('#vs-tier').textContent = `${opp.tier} · Rank ${opp.rank + 1}`;
  $('#vs-name').textContent = opp.name;
  $('#vs-style').innerHTML = `<b style="color:${st.color}">${st.name}</b> &middot; ${st.ability}`;
  $('#vs-temper').textContent = opp.temperament;
  $('#vs-loc').textContent = G.arena.name;
  $('#vs-record').textContent = `Your record ${profile.wins}W – ${profile.losses}L · Streak ${profile.streak}`;
  setupHudNames();
  show('s-versus');
}
function startRound() {
  place(G.f2.stance);
  G.f2.reset(pick(STANCES));
  G.ai2 = new AIController(G.f2, G.f1, G.opp.ai);
  G.phase = 'intro'; G.phaseT = 0;
  $('#hud').classList.remove('hidden');
  announce(`Round ${G.round}`, G.arena.name);
  sfx.gong();
  renderPips();
}
function endMatch(won) {
  G.phase = 'over';
  if (won) { profile.wins++; profile.streak++; profile.best = Math.max(profile.best, profile.streak); }
  else { profile.losses++; profile.streak = 0; }
  saveProfile();
  $('#hud').classList.add('hidden');
  $('#res-title').textContent = won ? 'Victory' : 'Defeated';
  $('#res-title').className = won ? 'win' : 'lose';
  $('#res-sub').textContent = `${won ? 'You overcame' : 'You fell to'} ${G.opp.name} — ${G.score[0]} : ${G.score[1]}`;
  $('#res-record').textContent = `Record ${profile.wins}W – ${profile.losses}L · Streak ${profile.streak} · Best ${profile.best}`;
  const list = $('#res-learn'); list.innerHTML = '';
  const ids = Object.keys(G.matchLearn);
  if (!ids.length) list.innerHTML = '<p class="dim">Defend against new techniques — block, dodge or use your style ability — to learn them.</p>';
  for (const id of ids) {
    const m = MOVE_BY_ID[id], done = profile.unlocked.includes(id);
    const pct = done ? 100 : Math.round(profile.learn[id] || 0);
    list.insertAdjacentHTML('beforeend', `<div class="learn-row ${done ? 'done' : ''}"><span>${m.name}</span><div class="bar"><i style="width:${pct}%"></i></div><em>${done ? 'Learned' : pct + '%'}</em></div>`);
  }
  show('s-result');
}

// ============================================================ learning
function learnMove(move, amt) {
  if (profile.unlocked.includes(move.id)) return;
  const cur = profile.learn[move.id] || 0;
  const nv = Math.min(100, cur + amt);
  profile.learn[move.id] = nv;
  G.matchLearn[move.id] = (G.matchLearn[move.id] || 0) + (nv - cur);
  if (nv >= 100) {
    profile.unlocked.push(move.id); delete profile.learn[move.id];
    toast(move.id, 'Technique learned', move.name, 100, true);
    sfx.learn(); saveProfile();
  } else toast(move.id, 'Learning', move.name, nv, false);
}
function toast(key, label, name, pct, done) {
  let el = $(`#toasts [data-k="${key}"]`);
  if (!el) {
    el = document.createElement('div'); el.className = 'toast'; el.dataset.k = key;
    el.innerHTML = '<small></small><b></b><div class="bar"><i></i></div>';
    $('#toasts').prepend(el);
  }
  el.classList.toggle('done', done);
  el.querySelector('small').textContent = label; el.querySelector('b').textContent = name;
  el.querySelector('i').style.width = pct + '%';
  clearTimeout(el._t); el.classList.remove('out');
  el._t = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, 2600);
}

// ============================================================ floating text / announce
const floaters = $('#floaters');
function floatText(pos, text, cls) {
  if (G.mode !== 'duel') return;
  const v = pos.clone().project(camera);
  if (v.z > 1) return;
  const el = document.createElement('div');
  el.className = 'floater ' + cls; el.textContent = text;
  el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px';
  el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
  floaters.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}
function announce(big, small = '') {
  const a = $('#announce');
  a.querySelector('.big').textContent = big;
  a.querySelector('.small').textContent = small;
  a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
}
function hideAnnounce() { $('#announce').classList.remove('show'); }

// ============================================================ input
const keys = new Set(), pressed = new Set();
addEventListener('keydown', e => {
  if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  sfx.ensure();
  if (!e.repeat) pressed.add(e.code);
  keys.add(e.code);
  onKeyUi(e);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('mousedown', e => { sfx.ensure(); pressed.add('Mouse' + e.button); keys.add('Mouse' + e.button); });
addEventListener('mouseup', e => keys.delete('Mouse' + e.button));
addEventListener('contextmenu', e => { if (G.mode === 'duel') e.preventDefault(); });

const pad = { mx: 0, mz: 0, prev: [], down: [], pressed: [] };
function pollPad() {
  pad.mx = pad.mz = 0; pad.pressed = [];
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (!gp) return;
  const dz = v => (Math.abs(v) < 0.2 ? 0 : v);
  pad.mx = dz(gp.axes[0] || 0); pad.mz = -dz(gp.axes[1] || 0);
  pad.down = gp.buttons.map(b => b.pressed);
  pad.pressed = pad.down.map((d, i) => d && !pad.prev[i]);
  pad.prev = pad.down;
  if (pad.pressed[9]) onKeyUi({ code: 'Escape' });
}

function readPlayer(f) {
  const it = f.intent, k = c => keys.has(c), p = c => pressed.has(c), b = i => !!pad.pressed[i], h = i => !!pad.down[i];
  it.mz = Math.max(-1, Math.min(1, (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) + pad.mz));
  it.mx = Math.max(-1, Math.min(1, (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + pad.mx));
  it.light = p('KeyJ') || p('Mouse0') || b(2);
  it.alt = p('KeyK') || p('Mouse2') || b(3);
  it.block = k('KeyL') || k('ShiftLeft') || k('ShiftRight') || h(5) || h(7);
  it.dodge = p('Space') || b(0);
  it.special = p('KeyE') || p('KeyI') || b(1);
  it.switchSide = p('KeyQ') || b(4);
  it.switchFace = p('KeyR') || b(6);
  it.flow = p('KeyF') || b(10) || b(11);
}
function clearIntent(f) {
  const it = f.intent;
  it.mx = it.mz = 0; it.light = it.alt = it.block = it.dodge = it.special = it.switchSide = it.switchFace = it.flow = false;
}

// ============================================================ screens / UI
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  G.screen = id;
  if (id === 's-main') renderMainStats();
}
function renderMainStats() {
  const st = STYLES[profile.style];
  $('#main-stats').innerHTML = `<span>${st.name} &middot; ${st.ability}</span><span>${profile.wins}W &ndash; ${profile.losses}L</span><span>Streak ${profile.streak}</span><span>Next foe: ${tierOf(profile.streak)}</span><span>${profile.unlocked.length}/${MOVES.length} techniques</span>`;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  sfx.ensure(); sfx.ui();
  const act = b.dataset.act;
  switch (act) {
    case 'duel': setupDuel(); break;
    case 'begin': beginDuel(); break;
    case 'deck': openDeck(); break;
    case 'style': renderStyles(); show('s-style'); break;
    case 'wardrobe': setupWardrobe(); renderWardrobe(); show('s-wardrobe'); break;
    case 'help': show('s-help'); break;
    case 'menu': if (G.mode !== 'attract') setupAttract(); G.paused = false; show('s-main'); break;
    case 'back': show(G.backTo || 's-main'); break;
    case 'resume': G.paused = false; show(null); break;
    case 'forfeit': G.paused = false; G.score[1] = 2; endMatch(false); break;
    case 'next': setupDuel(); break;
    case 'autodeck': profile.deck = starterDeck(profile.unlocked); validateDeck(profile.deck, profile.unlocked); saveProfile(); G.sel = null; renderDeck(); break;
    case 'randfit': profile.outfit = randomOutfit(); saveProfile(); rebuildPlayer(); renderWardrobe(); break;
    case 'reset':
      if (confirm('Erase all progress, learned techniques and your deck?')) { profile = newProfile(); saveProfile(); renderMainStats(); }
      break;
  }
});
function beginDuel() {
  if (G.mode !== 'duel' || G.phase !== 'versus') return;
  show(null);
  startRound();
}
function onKeyUi(e) {
  if (e.code === 'Escape') {
    if (G.mode === 'duel' && (G.phase === 'fight' || G.phase === 'intro' || G.phase === 'ko')) {
      G.paused = !G.paused; show(G.paused ? 's-pause' : null);
    } else if (G.screen && G.screen !== 's-main' && G.screen !== 's-versus' && G.screen !== 's-result') {
      if (G.mode === 'wardrobe') setupAttract();
      show('s-main');
    }
  }
  if (e.code === 'Enter') {
    if (G.screen === 's-versus') beginDuel();
    else if (G.screen === 's-result') setupDuel();
  }
  if (e.code === 'Tab' && G.mode === 'duel') $('#keys').classList.toggle('hidden');
}

// ---- style picker
function renderStyles() {
  const wrap = $('#style-cards'); wrap.innerHTML = '';
  for (const [key, st] of Object.entries(STYLES)) {
    const el = document.createElement('button');
    el.className = 'style-card' + (profile.style === key ? ' sel' : '');
    el.style.setProperty('--sc', st.color);
    el.innerHTML = `<div class="sc-name">${st.name}</div><div class="sc-ab">${st.ability}</div><p>${st.desc}</p>
      <div class="sc-moves">${st.starter.map(id => `<span>${MOVE_BY_ID[id].name}</span>`).join('')}</div>`;
    el.onclick = () => {
      sfx.ui();
      profile.style = key;
      for (const id of st.starter) if (!profile.unlocked.includes(id)) profile.unlocked.push(id);
      saveProfile(); renderStyles();
    };
    wrap.appendChild(el);
  }
}

// ---- stance glyph
function glyph(active, size = 16) {
  const q = { FL: '50,6 6,50 50,50', FR: '50,6 94,50 50,50', BL: '6,50 50,94 50,50', BR: '94,50 50,94 50,50' };
  return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 100 100">${STANCES.map(s =>
    `<polygon points="${q[s]}" class="${s === active ? 'on' : ''}"/>`).join('')}<polygon points="50,6 94,50 50,94 6,50" class="outline"/></svg>`;
}

// ---- deck editor
G.sel = null;
function openDeck() { G.backTo = 's-main'; G.sel = null; renderDeck(); show('s-deck'); }
function moveTags(m) {
  const t = [`<span>${m.dmg}${m.hits > 1 ? '×2' : ''} dmg</span>`, `<span>${m.speed}</span>`, `<span>${m.height}</span>`, `<span>${m.arc === 'h' ? 'horizontal' : 'vertical'}</span>`];
  for (const p of m.props) t.push(`<span class="prop">${p}</span>`);
  return t.join('');
}
function renderDeck() {
  const d = profile.deck, wrap = $('#deck-stances');
  wrap.innerHTML = '';
  for (const st of STANCES) {
    const col = document.createElement('div');
    col.className = 'stance-col';
    let html = `<div class="st-head">${glyph(st, 22)}<span>${STANCE_NAMES[st]}</span></div><div class="chain">`;
    for (let i = 0; i < 3; i++) {
      const s = slotStance(d, st, i);
      const id = d[st].chain[i];
      const m = MOVE_BY_ID[id];
      const disabled = s === null || i > d[st].chain.length;
      const sel = G.sel && G.sel.st === st && G.sel.idx === i;
      html += `<button class="slot ${sel ? 'sel' : ''} ${m ? '' : 'empty'}" data-st="${st}" data-idx="${i}" ${disabled ? 'disabled' : ''}>
        <span class="num">${i + 1}</span><span class="mv">${m ? m.name : 'Empty'}</span>
        <span class="tr">${s ? glyph(s, 13) : ''}${m ? '<i>›</i>' + glyph(endStance(m, s), 13) : ''}</span></button>`;
    }
    const am = MOVE_BY_ID[d[st].alt];
    const asel = G.sel && G.sel.st === st && G.sel.idx === 'alt';
    html += `</div><button class="slot alt ${asel ? 'sel' : ''} ${am ? '' : 'empty'}" data-st="${st}" data-idx="alt">
      <span class="num">ALT</span><span class="mv">${am ? am.name : 'Empty'}</span>
      <span class="tr">${glyph(st, 13)}${am ? '<i>›</i>' + glyph(endStance(am, st), 13) : ''}</span></button>`;
    col.innerHTML = html;
    wrap.appendChild(col);
  }
  wrap.querySelectorAll('.slot').forEach(b => b.onclick = () => {
    sfx.ui();
    G.sel = { st: b.dataset.st, idx: b.dataset.idx === 'alt' ? 'alt' : +b.dataset.idx };
    renderDeck();
  });
  // move list
  const list = $('#deck-moves');
  const head = $('#deck-list-head');
  if (!G.sel) {
    head.innerHTML = `<b>Techniques</b><span>Select a slot to change it. ${profile.unlocked.length}/${MOVES.length} learned.</span>`;
    list.innerHTML = MOVES.map(m => moveRow(m, null)).join('');
    return;
  }
  const need = G.sel.idx === 'alt' ? G.sel.st : slotStance(d, G.sel.st, G.sel.idx);
  head.innerHTML = `<b>${G.sel.idx === 'alt' ? 'Alternate' : 'Chain ' + (G.sel.idx + 1)} · ${STANCE_NAMES[G.sel.st]}</b><span>Starts in ${glyph(need, 14)} ${STANCE_NAMES[need]}</span>`;
  const opts = MOVES.filter(m => m.from === need[0]);
  opts.sort((a, b) => (profile.unlocked.includes(b.id) - profile.unlocked.includes(a.id)) || a.startup - b.startup);
  list.innerHTML = `<button class="mrow clear" data-id="">✕ Clear slot</button>` + opts.map(m => moveRow(m, need)).join('');
  list.querySelectorAll('.mrow:not(.locked)').forEach(b => b.onclick = () => assign(b.dataset.id));
}
function moveRow(m, need) {
  const un = profile.unlocked.includes(m.id);
  const pct = Math.round(profile.learn[m.id] || 0);
  const tr = need ? `${glyph(need, 13)}<i>›</i>${glyph(endStance(m, need), 13)}` : `<small>${m.from === 'F' ? 'Front' : 'Back'} › ${m.to === 'F' ? 'Front' : 'Back'}${m.sw ? ' ⇄' : ''}</small>`;
  return `<button class="mrow ${un ? '' : 'locked'}" data-id="${m.id}" ${!need && un ? 'tabindex="-1"' : ''}>
    <div class="mr-top"><span class="mr-name">${un ? m.name : m.name}</span><span class="tr">${tr}</span></div>
    <div class="tags">${moveTags(m)}</div>
    ${un ? '' : `<div class="lock"><div class="bar"><i style="width:${pct}%"></i></div><em>${pct ? 'Learning ' + pct + '%' : 'Not learned — defend against it to learn'}</em></div>`}
  </button>`;
}
function assign(id) {
  if (!G.sel) return;
  sfx.ui();
  const d = profile.deck[G.sel.st];
  if (G.sel.idx === 'alt') d.alt = id || null;
  else if (!id) d.chain = d.chain.slice(0, G.sel.idx);
  else { d.chain[G.sel.idx] = id; }
  validateDeck(profile.deck, profile.unlocked);
  saveProfile();
  renderDeck();
}

// ---- wardrobe
const uniq = a => [...new Set(a)];
const WARD = [
  ['Mask', o => o.mask.style, (o, v) => (o.mask.style = v), MASK_STYLES.map((_, i) => i), v => MASK_STYLES[v]],
  ['Mask colour', o => o.mask.color, (o, v) => (o.mask.color = v), uniq(PALETTE.mask)],
  ['Mask marking', o => o.mask.mark, (o, v) => (o.mask.mark = v), MASK_MARKS.map((_, i) => i), v => MASK_MARKS[v]],
  ['Marking colour', o => o.mask.markColor, (o, v) => (o.mask.markColor = v), PALETTE.accent],
  ['Hood', o => o.hood, (o, v) => (o.hood = v), [false, true], v => (v ? 'On' : 'Off')],
  ['Hood colour', o => o.hoodColor, (o, v) => (o.hoodColor = v), PALETTE.cloth],
  ['Coat', o => o.coat, (o, v) => (o.coat = v), [false, true], v => (v ? 'On' : 'Off')],
  ['Coat colour', o => o.coatColor, (o, v) => (o.coatColor = v), PALETTE.cloth],
  ['Shirt', o => o.top, (o, v) => (o.top = v), PALETTE.cloth],
  ['Trousers', o => o.pants, (o, v) => (o.pants = v), PALETTE.cloth],
  ['Wraps', o => o.wraps, (o, v) => (o.wraps = v), ['#e8e0cf', '#d8c9a7', '#3b3a36', '#8c3b3b', '#b5b1a5', '#45607a']],
  ['Boots', o => o.boots, (o, v) => (o.boots = v), ['#2a2520', '#4a3a2c', '#1c1c1c', '#6b5a45', '#7a3b2e']],
  ['Sash', o => o.accent, (o, v) => (o.accent = v), PALETTE.accent],
  ['Scarf', o => o.scarf, (o, v) => (o.scarf = v), [false, true], v => (v ? 'On' : 'Off')],
  ['Scarf colour', o => o.scarfColor, (o, v) => (o.scarfColor = v), uniq(PALETTE.accent.concat(PALETTE.cloth))],
  ['Skin', o => o.skin, (o, v) => (o.skin = v), PALETTE.skin],
  ['Hair', o => o.hair, (o, v) => (o.hair = v), PALETTE.hair],
  ['Build', o => o.build, (o, v) => (o.build = v), [0.94, 0.98, 1.02, 1.06], v => ({ 0.94: 'Lithe', 0.98: 'Lean', 1.02: 'Sturdy', 1.06: 'Broad' }[v] || 'Lean')],
];
function renderWardrobe() {
  const wrap = $('#ward-rows'); wrap.innerHTML = '';
  WARD.forEach(([label, get, set, opts, fmt], i) => {
    const v = get(profile.outfit);
    const disp = fmt ? fmt(v) : `<i class="sw" style="background:${v}"></i>`;
    const row = document.createElement('div');
    row.className = 'ward-row';
    row.innerHTML = `<span class="wl">${label}</span><button class="arrow" data-d="-1">‹</button><span class="wv">${disp}</span><button class="arrow" data-d="1">›</button>`;
    row.querySelectorAll('.arrow').forEach(b => b.onclick = () => {
      sfx.ui();
      let k = opts.findIndex(o => o === get(profile.outfit));
      if (k < 0) k = 0; else k = (k + +b.dataset.d + opts.length) % opts.length;
      set(profile.outfit, opts[k]);
      saveProfile(); rebuildPlayer(); renderWardrobe();
    });
    wrap.appendChild(row);
  });
}
function rebuildPlayer() {
  if (G.mode !== 'wardrobe') return;
  const yaw = G.f1.yaw;
  G.f1.dispose();
  G.f1 = spawnFighter(playerDesc(), true);
  G.f1.yaw = yaw;
}
$('#ward-spin').oninput = e => { if (G.f1 && G.mode === 'wardrobe') G.wardYaw = +e.target.value * Math.PI / 180; };

// ============================================================ HUD
const hudEls = {};
for (const id of ['p1', 'p2']) {
  const r = $('#' + id);
  hudEls[id] = { root: r, nm: r.querySelector('.nm'), sty: r.querySelector('.sty'), hp: r.querySelector('.hp .fill'), lag: r.querySelector('.hp .lag'), st: r.querySelector('.st .fill'), stw: r.querySelector('.st'), flow: r.querySelector('.flow .fill'), floww: r.querySelector('.flow'), pips: r.querySelector('.pips') };
}
function setupHudNames() {
  const a = STYLES[profile.style], b = STYLES[G.opp.style];
  hudEls.p1.nm.textContent = profile.name; hudEls.p1.sty.textContent = a.name;
  hudEls.p2.nm.textContent = G.opp.name; hudEls.p2.sty.textContent = `${G.opp.tier} · ${b.name}`;
  $('#keys .ab').textContent = a.ability;
}
function renderPips() {
  for (const [k, i] of [['p1', 0], ['p2', 1]]) {
    hudEls[k].pips.innerHTML = [0, 1].map(n => `<i class="${G.score[i] > n ? 'on' : ''}"></i>`).join('');
  }
}
const compassCells = {};
$$('#compass polygon[data-s]').forEach(p => (compassCells[p.dataset.s] = p));
let lastCompass = '';
function updateHud() {
  for (const [k, f] of [['p1', G.f1], ['p2', G.f2]]) {
    const e = hudEls[k];
    e.hp.style.width = Math.max(0, f.hp) + '%';
    e.lag.style.width = Math.max(0, f.hpLag) + '%';
    e.st.style.width = f.stamina + '%';
    e.stw.classList.toggle('exhausted', f.exhausted);
    const fl = f.flowTime > 0 ? (f.flowTime / 6) * 100 : f.flow;
    e.flow.style.width = fl + '%';
    e.floww.classList.toggle('ready', f.flow >= 100 || f.flowTime > 0);
  }
  const f = G.f1, n = f.nextMoves();
  const key = n.stance + (n.light ? n.light.id : '-') + (n.alt ? n.alt.id : '-') + n.idx;
  if (key !== lastCompass) {
    lastCompass = key;
    for (const s of STANCES) compassCells[s].classList.toggle('on', s === n.stance);
    $('#nx-light').textContent = n.light ? n.light.name : '—';
    $('#nx-alt').textContent = n.alt ? n.alt.name : '—';
    $('#nx-stance').textContent = STANCE_NAMES[n.stance];
    const len = profile.deck[n.owner].chain.length;
    $('#nx-chain').innerHTML = [0, 1, 2].map(i => `<i class="${i < len ? 'has' : ''} ${i === n.idx ? 'on' : ''}"></i>`).join('');
  }
}

// ============================================================ camera
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function updateCamera(dt) {
  const { f1, f2 } = G;
  let pos, look, k = 5;
  if (G.mode === 'duel' && f2 && G.phase !== 'versus') {
    const back = _v.subVectors(f1.pos, f2.pos).setY(0);
    const dist = back.length(); back.divideScalar(dist || 1);
    const right = _w.crossVectors(back.clone().negate(), UP);
    pos = f1.pos.clone().addScaledVector(back, 2.9 + Math.max(0, dist - 2) * 0.35).addScaledVector(right, 0.8).add(new THREE.Vector3(0, 1.75, 0));
    look = f1.pos.clone().lerp(f2.pos, 0.6).add(new THREE.Vector3(0, 1.1, 0));
    if (G.phase === 'ko' || G.phase === 'over') {
      G.orbit += dt * 0.25;
      const mid = f1.pos.clone().lerp(f2.pos, 0.5);
      pos = mid.clone().add(new THREE.Vector3(Math.sin(G.orbit) * 4.2, 1.8, Math.cos(G.orbit) * 4.2));
      look = mid.add(new THREE.Vector3(0, 0.9, 0)); k = 2.5;
    } else G.orbit = Math.atan2(camera.position.x - f1.pos.x, camera.position.z - f1.pos.z);
  } else if (G.mode === 'duel' && f2) {
    G.orbit += dt * 0.22;
    pos = f2.pos.clone().add(new THREE.Vector3(Math.sin(G.orbit) * 2.6, 1.55, Math.cos(G.orbit) * 2.6));
    pos.addScaledVector(_v.subVectors(f2.pos, f1.pos).normalize(), 0.6);
    const right = _w.crossVectors(_v.subVectors(f2.pos, pos).setY(0).normalize(), UP);
    look = f2.pos.clone().addScaledVector(right, -0.9).add(new THREE.Vector3(0, 1.25, 0)); k = 3;
  } else if (G.mode === 'wardrobe') {
    pos = new THREE.Vector3(-0.75, 1.35, 2.75);
    look = new THREE.Vector3(-0.75, 1.05, 0); k = 4;
  } else if (f1 && f2) {
    G.orbit += dt * 0.08;
    const mid = f1.pos.clone().lerp(f2.pos, 0.5);
    pos = mid.clone().add(new THREE.Vector3(Math.sin(G.orbit) * 6.2, 2.2, Math.cos(G.orbit) * 6.2));
    const right = _w.crossVectors(_v.subVectors(mid, pos).setY(0).normalize(), UP);
    look = mid.addScaledVector(right, -1.5).add(new THREE.Vector3(0, 1.0, 0)); k = 2;
  } else return;
  if (window.__cam) { pos = window.__cam.pos; look = window.__cam.look; k = 50; }
  const a = 1 - Math.exp(-dt * k);
  camera.position.lerp(pos, a);
  camLook.lerp(look, a);
  camera.lookAt(camLook);
  if (G.shakeT > 0) {
    G.shakeT -= dt;
    const s = G.shakeAmp * Math.max(0, G.shakeT / 0.25);
    camera.position.x += rand(-s, s); camera.position.y += rand(-s, s) * 0.6;
  }
}

// ============================================================ main loop
function constrain(a, b) {
  for (const f of [a, b]) {
    const r = Math.hypot(f.pos.x, f.pos.z);
    if (r > ARENA_RADIUS) f.pos.multiplyScalar(ARENA_RADIUS / r);
    f.pos.y = 0;
  }
  if (a.action.type === 'ko' || b.action.type === 'ko') return;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
  if (d < 0.9 && d > 1e-4) {
    const push = (0.9 - d) / 2;
    a.pos.x -= dx / d * push; a.pos.z -= dz / d * push;
    b.pos.x += dx / d * push; b.pos.z += dz / d * push;
  }
}

function step(rdt) {
  if (G.paused) return;
  let dt = rdt;
  if (G.slowT > 0) { G.slowT -= rdt; dt *= G.slowScale; }
  if (G.hitstopT > 0) { G.hitstopT -= rdt; dt = 0; }
  game.now += dt;
  if (G.arena) G.arena.update(rdt);
  const { f1, f2 } = G;
  if (!f1) return;

  if (G.mode === 'wardrobe') {
    clearIntent(f1);
    const wy = G.wardYaw || 0;
    dummyTarget.pos.set(Math.sin(wy) * 6, 0, Math.cos(wy) * 6);
    f1.update(dt, dummyTarget, game);
    f1.pos.set(0, 0, 0);
    f1.render(dt);
    return;
  }

  // phases
  if (G.mode === 'duel') {
    G.phaseT += rdt;
    if (G.phase === 'intro') {
      if (G.phaseT > 1.5 && !G.saidFight) { G.saidFight = true; announce('Duel', ''); }
      if (G.phaseT > 2.3) { G.phase = 'fight'; G.saidFight = false; hideAnnounce(); }
    } else if (G.phase === 'ko') {
      if (G.phaseT > 1.4 && !G.bowed) {
        G.bowed = true;
        const w = G.roundWinner === 0 ? f1 : f2;
        w.bow();
        renderPips();
        const final = G.score[G.roundWinner] >= 2;
        announce(G.roundWinner === 0 ? (final ? 'Victory' : 'Round Won') : (final ? 'Defeated' : 'Round Lost'), `${G.score[0]} — ${G.score[1]}`);
      }
      if (G.phaseT > 4.2) {
        G.bowed = false; hideAnnounce();
        if (G.score[G.roundWinner] >= 2) endMatch(G.roundWinner === 0);
        else { G.round++; startRound(); }
      }
    }
  } else if (G.mode === 'attract' && G.attractReset > 0) {
    G.attractReset -= rdt;
    if (G.attractReset <= 0) { place(pick(STANCES)); G.ai1 = new AIController(G.f1, G.f2, G.ai1.p); G.ai2 = new AIController(G.f2, G.f1, G.ai2.p); }
  }

  const fighting = G.mode === 'attract' || (G.mode === 'duel' && G.phase === 'fight');
  if (dt > 0) {
    if (G.mode === 'duel') { if (fighting) readPlayer(f1); else clearIntent(f1); }
    if (fighting) { if (G.ai1) G.ai1.update(dt, game); if (G.ai2) G.ai2.update(dt, game); }
    else { clearIntent(f2); if (G.ai1) clearIntent(f1); }
    f1.update(dt, f2, game);
    f2.update(dt, f1, game);
    constrain(f1, f2);
  }
  f1.render(dt); f2.render(dt);
  if (dt > 0 && fighting) { checkHits(f1, f2, game); checkHits(f2, f1, game); }
  if (G.mode === 'duel') updateHud();
}

let last = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, (t - last) / 1000);
  last = t;
  pollPad();
  step(rdt);
  updateSparks(rdt);
  updateCamera(rdt);
  renderer.render(scene, camera);
  pressed.clear();
}

// ============================================================ boot
setupAttract();
show('s-main');
requestAnimationFrame(frame);
// debugging hooks for the console
window.__G = G;
window.__tick = (n = 60, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) { step(dt); updateSparks(dt); updateCamera(dt); pressed.clear(); }
  renderer.render(scene, camera);
};
window.__press = code => pressed.add(code);
window.__keys = keys;
