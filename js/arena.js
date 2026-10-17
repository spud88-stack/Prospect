import * as THREE from 'three';

export const ARENA_RADIUS = 8.6;

const LOCATIONS = [
  { name: 'The Harvest Ruins', sky: ['#e7a45c', '#f3dcb0'], fog: '#efcf9f', ground: '#8f7f4e', grass: '#b39a4f', stone: '#bfae90', trees: ['#c4512b', '#d98a2f', '#a33a24', '#e0b04a'], sun: '#ffe0b0', hemi: ['#ffe9c7', '#6a5a40'], dust: '#ffd9a0' },
  { name: 'The Frostbound Spire', sky: ['#6f93bb', '#d9e4ec'], fog: '#c8d6e2', ground: '#6d7a78', grass: '#93a3a0', stone: '#a9b2b8', trees: ['#e7eef2', '#a9c0cc', '#6d8a9c'], sun: '#eef4ff', hemi: ['#dfeaff', '#465058'], dust: '#ffffff' },
  { name: 'The Ashen Grove', sky: ['#6b5a5a', '#c9b3a0'], fog: '#b9a493', ground: '#5c5048', grass: '#7a6a5a', stone: '#8f877e', trees: ['#8c2e2a', '#5a1f1f', '#b54b33'], sun: '#ffc9a8', hemi: ['#f0d6c8', '#3a302a'], dust: '#ff9a6a' },
  { name: 'The Twilight Sanctum', sky: ['#3d3466', '#c88aa0'], fog: '#9c7f9e', ground: '#4f4a5e', grass: '#6f6a86', stone: '#a49fb4', trees: ['#c9a0d8', '#7f5aa0', '#e0b8c8'], sun: '#ffd0e0', hemi: ['#e8d0ff', '#2f2a40'], dust: '#e8c0ff' },
  { name: 'The Verdant Steppe', sky: ['#8fb3c4', '#ecebd2'], fog: '#d8dec4', ground: '#6f7f45', grass: '#8a9e4f', stone: '#c2bba4', trees: ['#5f8a3a', '#a3b04a', '#d7b33e', '#3f6a33'], sun: '#fff3d0', hemi: ['#f4f8e0', '#4c5530'], dust: '#fff8c0' },
  { name: 'The Crimson Bastion', sky: ['#8e3b2e', '#e8b48a'], fog: '#d39a78', ground: '#6e4a3a', grass: '#8e5e40', stone: '#b39a86', trees: ['#b7322a', '#e0703a', '#7a1f1f'], sun: '#ffd0a0', hemi: ['#ffd8c0', '#4a2a20'], dust: '#ffb080' },
];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function floorTexture(loc) {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  const base = new THREE.Color(loc.stone);
  g.fillStyle = loc.stone; g.fillRect(0, 0, 1024, 1024);
  // stone flags laid in rings
  const cx = 512, cy = 512;
  for (let ring = 0; ring < 9; ring++) {
    const r0 = ring * 56 + 30, r1 = r0 + 56;
    const n = Math.max(6, Math.round(ring * 9 + 6));
    const off = Math.random() * Math.PI;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i / n) * Math.PI * 2, a1 = off + ((i + 1) / n) * Math.PI * 2;
      const col = base.clone().offsetHSL(0, rand(-0.03, 0.03), rand(-0.07, 0.05));
      g.fillStyle = '#' + col.getHexString();
      g.beginPath(); g.arc(cx, cy, r1 - 2, a0 + 0.004, a1 - 0.004); g.arc(cx, cy, r0 + 2, a1 - 0.004, a0 + 0.004, true); g.closePath(); g.fill();
    }
  }
  // inner disc + engraved rings
  g.fillStyle = '#' + base.clone().offsetHSL(0, 0, -0.06).getHexString();
  g.beginPath(); g.arc(cx, cy, 30, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(30,20,10,0.35)'; g.lineWidth = 5;
  for (const r of [120, 300, 470]) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
  g.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * 125, cy + Math.sin(a) * 125); g.lineTo(cx + Math.cos(a) * 295, cy + Math.sin(a) * 295); g.stroke();
  }
  // mask emblem
  g.strokeStyle = 'rgba(30,20,10,0.4)'; g.lineWidth = 6;
  g.beginPath(); g.ellipse(cx, cy, 60, 80, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(cx - 34, cy - 10); g.lineTo(cx - 10, cy - 2); g.moveTo(cx + 34, cy - 10); g.lineTo(cx + 10, cy - 2); g.stroke();
  // grime
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,15,10' : '255,250,240'},${rand(0.02, 0.07)})`;
    const s = rand(2, 14); g.fillRect(rand(0, 1024), rand(0, 1024), s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildArena(scene) {
  const loc = pick(LOCATIONS);
  const root = new THREE.Group();
  scene.add(root);
  const mats = [];
  const M = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true, ...extra }); mats.push(m); return m; };
  const add = (geo, mat, cast = true, recv = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; root.add(m); return m; };

  // sky dome
  const skyGeo = new THREE.SphereGeometry(300, 24, 16);
  const top = new THREE.Color(loc.sky[0]), hor = new THREE.Color(loc.sky[1]);
  const cols = [];
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 300;
    const c = hor.clone().lerp(top, Math.pow(Math.max(0, y), 0.6));
    cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  root.add(sky);
  // sun disc
  const sunDir = new THREE.Vector3(rand(-1, 1), rand(0.25, 0.5), rand(0.6, 1)).normalize();
  const sun = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: loc.sun, fog: false, transparent: true, opacity: 0.85 }));
  sun.position.copy(sunDir).multiplyScalar(280); sun.lookAt(0, 0, 0); root.add(sun);

  scene.fog = new THREE.Fog(loc.fog, 22, 150);
  scene.background = new THREE.Color(loc.fog);

  // lights
  const hemi = new THREE.HemisphereLight(loc.hemi[0], loc.hemi[1], 1.1);
  root.add(hemi);
  const dir = new THREE.DirectionalLight(loc.sun, 2.2);
  dir.position.copy(sunDir).multiplyScalar(30);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  const sc = dir.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 80;
  dir.shadow.bias = -0.0006; dir.shadow.normalBias = 0.02;
  root.add(dir); root.add(dir.target);

  // terrain
  const tg = new THREE.PlaneGeometry(260, 260, 90, 90);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, tc = [];
  const gc = new THREE.Color(loc.ground), gr = new THREE.Color(loc.grass);
  const seed = Math.random() * 100;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), r = Math.hypot(x, z);
    const n = Math.sin(x * 0.07 + seed) * Math.cos(z * 0.06 - seed) + Math.sin(x * 0.021 + z * 0.03) * 2;
    const h = r < 16 ? -0.35 : -0.35 + Math.pow((r - 16) / 30, 1.6) * (3 + n * 2.2) + n * 0.4 * Math.min(1, (r - 16) / 10);
    tp.setY(i, h);
    const c = gc.clone().lerp(gr, 0.5 + 0.5 * Math.sin(x * 0.3 + z * 0.17 + seed)).offsetHSL(0, 0, rand(-0.03, 0.03));
    tc.push(c.r, c.g, c.b);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  tg.computeVertexNormals();
  add(tg, M('#ffffff', { vertexColors: true }), false, true);

  // platform
  const stone = M(loc.stone);
  const plat = add(new THREE.CylinderGeometry(9.6, 10.1, 0.5, 48), stone, false, true); plat.position.y = -0.25;
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(loc), roughness: 0.92 }); mats.push(floorMat);
  const floor = add(new THREE.CircleGeometry(9.6, 64), floorMat, false, true); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002;
  const step = add(new THREE.CylinderGeometry(10.6, 11.2, 0.25, 48), M(new THREE.Color(loc.stone).offsetHSL(0, 0, -0.08)), false, true); step.position.y = -0.42;

  // pillars around the ring
  const pillarMat = M(new THREE.Color(loc.stone).offsetHSL(0, 0, -0.04));
  const nP = 8 + Math.floor(Math.random() * 5);
  const off = Math.random() * Math.PI;
  for (let i = 0; i < nP; i++) {
    const a = off + (i / nP) * Math.PI * 2 + rand(-0.12, 0.12);
    const r = rand(11.2, 12.8);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const kind = Math.random();
    if (kind < 0.18) { // fallen column
      const len = rand(3, 5);
      const c = add(new THREE.CylinderGeometry(0.5, 0.5, len, 9), pillarMat); c.position.set(x, 0.1, z); c.rotation.set(Math.PI / 2, 0, rand(0, Math.PI)); c.rotation.order = 'YXZ'; c.rotation.y = rand(0, Math.PI);
      continue;
    }
    const h = kind < 0.55 ? rand(1.2, 3.2) : rand(4.5, 7.5);
    const p = add(new THREE.CylinderGeometry(0.48, 0.56, h, 9), pillarMat); p.position.set(x, h / 2 - 0.3, z);
    p.rotation.z = rand(-0.04, 0.04);
    const base = add(new THREE.BoxGeometry(1.4, 0.4, 1.4), pillarMat); base.position.set(x, -0.1, z); base.rotation.y = a;
    if (h > 4) { const cap = add(new THREE.BoxGeometry(1.3, 0.35, 1.3), pillarMat); cap.position.set(x, h - 0.2, z); cap.rotation.y = a; }
    else for (let k = 0; k < 3; k++) { // rubble
      const rb = add(new THREE.DodecahedronGeometry(rand(0.15, 0.35), 0), pillarMat); rb.position.set(x + rand(-1.2, 1.2), 0.05, z + rand(-1.2, 1.2)); rb.rotation.set(rand(0, 3), rand(0, 3), 0);
    }
  }
  // grand arch
  const ga = off + Math.PI / nP + Math.PI;
  {
    const r = 15.5, x = Math.cos(ga) * r, z = Math.sin(ga) * r;
    const g = new THREE.Group(); g.position.set(x, -0.3, z); g.rotation.y = -ga + Math.PI / 2; root.add(g);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2), pillarMat); p.position.set(s * 3.2, 4.5, 0); p.castShadow = true; g.add(p);
    }
    const l = new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.2, 1.5), pillarMat); l.position.set(0, 9.4, 0); l.castShadow = true; g.add(l);
    const l2 = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.7, 1.3), pillarMat); l2.position.set(0, 10.3, 0); l2.castShadow = true; g.add(l2);
  }

  // trees
  const trunkMat = M('#4a3a2c');
  const leafMats = loc.trees.map(c => M(c));
  for (let i = 0; i < 34; i++) {
    const a = rand(0, Math.PI * 2), r = rand(17, 60);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(((a - ga + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.25 && r < 30) continue;
    const s = rand(0.8, 1.7);
    const groundY = r < 16 ? -0.35 : -0.35 + Math.pow((r - 16) / 30, 1.6) * 2;
    const tr = add(new THREE.CylinderGeometry(0.14 * s, 0.24 * s, 3 * s, 6), trunkMat); tr.position.set(x, groundY + 1.5 * s, z); tr.rotation.z = rand(-0.12, 0.12);
    const lm = pick(leafMats);
    for (let k = 0; k < 3; k++) {
      const f = add(new THREE.IcosahedronGeometry(rand(0.9, 1.5) * s, 0), lm);
      f.position.set(x + rand(-0.7, 0.7) * s, groundY + (3 + rand(0, 1.4)) * s, z + rand(-0.7, 0.7) * s);
      f.rotation.set(rand(0, 3), rand(0, 3), 0);
    }
  }
  // far mountains
  const mtnMat = M(new THREE.Color(loc.fog).lerp(new THREE.Color(loc.ground), 0.35));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand(-0.1, 0.1), r = rand(110, 150), h = rand(25, 60);
    const m = add(new THREE.ConeGeometry(rand(25, 45), h, 6), mtnMat, false, false); m.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r); m.rotation.y = rand(0, 3);
  }
  // rocks
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), r = rand(12, 26);
    const rk = add(new THREE.DodecahedronGeometry(rand(0.3, 1.1), 0), stone); rk.position.set(Math.cos(a) * r, -0.2, Math.sin(a) * r); rk.rotation.set(rand(0, 3), rand(0, 3), 0);
  }
  // grass tufts (instanced)
  const tuftGeo = new THREE.ConeGeometry(0.06, 0.45, 3); tuftGeo.translate(0, 0.2, 0);
  const tuftMat = M(new THREE.Color(loc.grass).offsetHSL(0, 0.05, 0.05));
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 900);
  const dm = new THREE.Object3D();
  for (let i = 0; i < 900; i++) {
    const a = rand(0, Math.PI * 2), r = rand(10.2, 40);
    dm.position.set(Math.cos(a) * r, -0.4 + (r > 16 ? Math.pow((r - 16) / 30, 1.6) * 2 : 0), Math.sin(a) * r);
    dm.rotation.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3)); dm.scale.setScalar(rand(0.6, 1.6)); dm.updateMatrix();
    tufts.setMatrixAt(i, dm.matrix);
  }
  root.add(tufts);

  // drifting motes / leaves
  const nD = 260;
  const dg = new THREE.BufferGeometry();
  const dp = new Float32Array(nD * 3), dv = [];
  for (let i = 0; i < nD; i++) {
    dp[i * 3] = rand(-25, 25); dp[i * 3 + 1] = rand(0, 9); dp[i * 3 + 2] = rand(-25, 25);
    dv.push(rand(0.3, 1.2), rand(-0.25, 0.1), rand(0, Math.PI * 2));
  }
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: loc.dust, size: 0.07, transparent: true, opacity: 0.75, depthWrite: false }));
  root.add(dust);

  let t = 0;
  return {
    name: loc.name, loc,
    update(dt) {
      t += dt;
      const a = dg.attributes.position;
      for (let i = 0; i < nD; i++) {
        const sp = dv[i * 3], fall = dv[i * 3 + 1], ph = dv[i * 3 + 2];
        let x = a.getX(i) + sp * dt, y = a.getY(i) + fall * dt + Math.sin(t * 1.3 + ph) * 0.004, z = a.getZ(i) + Math.cos(t * 0.4 + ph) * dt * 0.3;
        if (x > 25) x = -25; if (y < 0) y = 9; if (y > 9) y = 0;
        a.setXYZ(i, x, y, z);
      }
      a.needsUpdate = true;
    },
    dispose() {
      scene.remove(root);
      root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      sky.material.dispose(); sun.material.dispose(); dust.material.dispose();
    },
  };
}
