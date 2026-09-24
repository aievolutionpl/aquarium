import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const DEBUG = new URLSearchParams(location.search).has('debug');
const MOBILE = matchMedia('(max-width: 820px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const loader = document.getElementById('loader');
let revealed = false;
function forceReveal() { if (!revealed) { revealed = true; loader.classList.add('gone'); } }
setTimeout(forceReveal, 1200);

// ---------- tank dimensions ----------
const W = 11, H = 4.6, D = 4.2, WATER = 4.32, HX = W / 2, HZ = D / 2;
const SX = W / 6, SZ = D / 2.6, SY = WATER / 3.0; // scale factors vs. original 6x3.2x2.6 layout

// ---------- noise ----------
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { return vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.25 + vnoise(x * 4.3, y * 4.3) * 0.125; }
function sandH(x, z) { return 0.26 + (-z + HZ) / D * 0.42 + (fbm(x * 0.6 + 3, z * 0.7 + 7) - 0.45) * 0.3; }
let seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
const R = (a, b) => a + (b - a) * rnd();

// ---------- renderer ----------
const canvas = document.getElementById('c');
let renderer = null, composer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
} catch (e) {
  loader.innerHTML = '<span>Twoja przeglądarka nie obsługuje WebGL — akwarium 3D nie może się wyświetlić.</span>';
  loader.classList.remove('gone'); revealed = true;
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = !MOBILE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040607);
scene.fog = new THREE.FogExp2(0x0a2a2e, 0.022);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 90);
camera.position.set(0, 2.3, 12.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.enablePan = false; controls.minDistance = 4; controls.maxDistance = 18;
controls.minPolarAngle = 0.9; controls.maxPolarAngle = 1.75;
controls.minAzimuthAngle = -1.1; controls.maxAzimuthAngle = 1.1;
controls.target.set(0, 2.2, 0);
controls.rotateSpeed = 0.5;

// ---------- procedural textures ----------
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(repeat, repeat);
  t.anisotropy = 4; return t;
}
const sandTex = canvasTex(512, (g, s) => {
  g.fillStyle = '#8f7b5c'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 26000; i++) {
    const l = 90 + rnd() * 120, r = rnd() * 1.6 + 0.4;
    g.fillStyle = `rgb(${l},${l * 0.88 | 0},${l * 0.68 | 0})`;
    g.beginPath(); g.arc(rnd() * s, rnd() * s, r, 0, 7); g.fill();
  }
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(30,25,20,${rnd() * 0.6})`; g.beginPath(); g.arc(rnd() * s, rnd() * s, rnd() * 3 + 1, 0, 7); g.fill(); }
}, 5);
const rockTex = canvasTex(256, (g, s) => {
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const n = fbm(x / 18, y / 18) * 0.8 + hash(x, y) * 0.2, i = (y * s + x) * 4, v = 40 + n * 70;
    img.data[i] = v; img.data[i + 1] = v * 1.02; img.data[i + 2] = v * 0.95; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
});
const woodTex = canvasTex(256, (g, s) => {
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const n = Math.sin(x / 3 + fbm(x / 30, y / 6) * 8) * 0.5 + 0.5, i = (y * s + x) * 4;
    img.data[i] = 45 + n * 40; img.data[i + 1] = 30 + n * 26; img.data[i + 2] = 20 + n * 14; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
});
// caustics: worley F2-F1 lines, tileable
function causticTex(sd) {
  seed = sd;
  const s = 256, pts = []; for (let i = 0; i < 22; i++) pts.push([rnd() * s, rnd() * s]);
  return canvasTex(s, (g) => {
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      let f1 = 1e9, f2 = 1e9;
      for (const p of pts) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const dx = x - p[0] - ox * s, dy = y - p[1] - oy * s, d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const v = Math.pow(Math.max(0, 1 - (f2 - f1) / 9), 3) * 255, i = (y * s + x) * 4;
      img.data[i] = v * 0.85; img.data[i + 1] = v; img.data[i + 2] = v * 0.95; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
const caus1 = causticTex(11), caus2 = causticTex(29);
seed = 7;
const shaftTex = canvasTex(128, (g, s) => {
  const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  const gx = g.createLinearGradient(0, 0, s, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, s, s);
});
function alphaTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
// broad leaf: pointed ellipse, midrib + side veins, soft edge
const leafTex = alphaTex(128, 256, (g, w, h) => {
  g.beginPath(); g.moveTo(w / 2, h - 2); g.bezierCurveTo(w * 1.02, h * 0.72, w * 0.9, h * 0.2, w / 2, 2); g.bezierCurveTo(w * 0.1, h * 0.2, -w * 0.02, h * 0.72, w / 2, h - 2); g.closePath();
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#9fcf7a'); gr.addColorStop(0.5, '#e4f7c8'); gr.addColorStop(1, '#9fcf7a'); g.fillStyle = gr; g.fill();
  g.save(); g.clip(); g.strokeStyle = 'rgba(40,70,20,0.35)'; g.lineWidth = 1.5;
  for (let y = 20; y < h - 10; y += 16) { g.beginPath(); g.moveTo(w / 2, y + 14); g.quadraticCurveTo(w * 0.3, y + 6, 0, y - 10); g.moveTo(w / 2, y + 14); g.quadraticCurveTo(w * 0.7, y + 6, w, y - 10); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,230,0.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 4); g.stroke();
  const ed = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.75); ed.addColorStop(0, 'rgba(0,0,0,0)'); ed.addColorStop(1, 'rgba(20,40,10,0.45)'); g.fillStyle = ed; g.fillRect(0, 0, w, h); g.restore();
});
// ribbon/blade: midrib, darker edges, parallel veins
const ribbonTex = alphaTex(64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(120,170,90,0)'); gr.addColorStop(0.12, '#8cbf6a'); gr.addColorStop(0.5, '#d8f0b8'); gr.addColorStop(0.88, '#8cbf6a'); gr.addColorStop(1, 'rgba(120,170,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(40,80,20,0.25)'; g.lineWidth = 1; for (const x of [0.3, 0.42, 0.58, 0.7]) { g.beginPath(); g.moveTo(x * w, 0); g.lineTo(x * w, h); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,220,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
});
const blobTex = alphaTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
const moteTex = alphaTex(64, 64, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
const backTex = canvasTex(256, (g, s) => {
  const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#0e4a50'); gr.addColorStop(0.6, '#07262a'); gr.addColorStop(1, '#030d0e');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xbfe9ff, 0x2a2014, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3dc, 2.6); sun.position.set(0.8, 12, 2);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 3, bottom: -3, near: 4, far: 18 });
sun.shadow.bias = -0.0015; scene.add(sun);
const fill = new THREE.PointLight(0x39b7c9, 9, 12, 1.6); fill.position.set(-3.5, 3, 2.4); scene.add(fill);
const rim = new THREE.DirectionalLight(0x6fc9ff, 0.6); rim.position.set(-4, 3, -5); scene.add(rim);

// ---------- room + tank ----------
const room = new THREE.Group(); scene.add(room);
const cab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 1.6, D + 0.4), new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.55, metalness: 0.2 }));
cab.position.y = -0.85; room.add(cab);
const floorM = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x070808, roughness: 0.4, metalness: 0.3 }));
floorM.rotation.x = -Math.PI / 2; floorM.position.y = -1.65; room.add(floorM);

const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: backTex, fog: false }));
back.position.set(0, H / 2, -HZ + 0.005); scene.add(back);

const glassMat = MOBILE
  ? new THREE.MeshPhysicalMaterial({ color: 0xcfeff0, transparent: true, opacity: 0.05, roughness: 0.3, metalness: 0, clearcoat: 0, depthWrite: false })
  : new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, thickness: 0.1, roughness: 0.05, ior: 1.5, metalness: 0, transparent: true, opacity: 1, clearcoat: 0, clearcoatRoughness: 0.3, depthWrite: false, specularIntensity: 0.3, attenuationColor: new THREE.Color(0xbfe8e0), attenuationDistance: 3 });
const gt = 0.03;
function pane(w, h, pos, rotY) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, gt), glassMat); m.position.copy(pos); m.rotation.y = rotY || 0; m.renderOrder = 10; scene.add(m); }
pane(W, H, new THREE.Vector3(0, H / 2, HZ));
pane(D, H, new THREE.Vector3(-HX, H / 2, 0), Math.PI / 2);
pane(D, H, new THREE.Vector3(HX, H / 2, 0), Math.PI / 2);
// glass edges (greenish thick edges) + black trim
const edgeMat = new THREE.MeshStandardMaterial({ color: 0x5fae9e, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.55 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0c, roughness: 0.4, metalness: 0.6 });
for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.045, H, 0.045), edgeMat); e.position.set(sx * HX, H / 2, sz * HZ); scene.add(e); }
for (const y of [0.02, H - 0.02]) {
  for (const sz of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.05, 0.06), trimMat); t.position.set(0, y, sz * HZ); scene.add(t); }
  for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, D + 0.06), trimMat); t.position.set(sx * HX, y, 0); scene.add(t); }
}
// lamp lid
const lid = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.08, D * 0.6), trimMat); lid.position.set(0, H + 0.08, -0.2); scene.add(lid);
const lampStrip = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, 0.2), new THREE.MeshBasicMaterial({ color: 0xfff6e6 }));
lampStrip.rotation.x = Math.PI / 2; lampStrip.position.set(0, H + 0.035, -0.2); scene.add(lampStrip);

// water surface (seen from below/front)
const surfMat = new THREE.MeshStandardMaterial({ color: 0x7fd0d0, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
const surfGeo = new THREE.PlaneGeometry(W - 0.02, D - 0.02, 60, 26); surfGeo.rotateX(-Math.PI / 2);
const surf = new THREE.Mesh(surfGeo, surfMat); surf.position.y = WATER; scene.add(surf);
const surfBase = surfGeo.attributes.position.array.slice();
// water volume tint (front face slightly tinted)
const vol = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, WATER, D - 0.04), new THREE.MeshBasicMaterial({ color: 0x1d6f70, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.BackSide }));
vol.position.y = WATER / 2; scene.add(vol);

// ---------- substrate ----------
const sandGeo = new THREE.PlaneGeometry(W - 0.02, D - 0.02, 140, 60); sandGeo.rotateX(-Math.PI / 2);
{ const p = sandGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, sandH(p.getX(i), p.getZ(i))); sandGeo.computeVertexNormals(); }
const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.95, metalness: 0 }));
sand.receiveShadow = true; scene.add(sand);
// sand front section (visible through glass)
{
  const sg = new THREE.PlaneGeometry(W - 0.02, 1, 140, 1); const p = sg.attributes.position;
  for (let i = 0; i < p.count; i++) { const top = p.getY(i) > 0; p.setXYZ(i, p.getX(i), top ? sandH(p.getX(i), HZ - 0.01) : 0.03, HZ - 0.02); }
  const m = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1, color: 0x9a8a70 })); scene.add(m);
}
// caustics layers
const causMats = [caus1, caus2].map((t, i) => {
  t.repeat.set(3.1 + i * 1.7, 1.3 + i * 0.7); t.rotation = i * 0.6;
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.11, color: 0xcff6ff, fog: false });
});
const causMeshes = causMats.map((m, i) => { const c = new THREE.Mesh(sandGeo, m); c.position.y = 0.006 + i * 0.003; c.renderOrder = 2; scene.add(c); return c; });

// ---------- rocks + driftwood ----------
const obstacles = [], solids = [], perches = [];
const rockMat = new THREE.MeshStandardMaterial({ map: rockTex, color: 0x5a5f5c, roughness: 1, metalness: 0 });
function contactShadow(x, z, size, op) { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); m.rotation.x = -Math.PI / 2; m.position.set(x, sandH(x, z) + 0.02, z); m.renderOrder = 1; scene.add(m); return m; }
function rock(x, z, s, sy) {
  x *= SX; z *= SZ; s *= 1.45;
  const g = new THREE.IcosahedronGeometry(1, 4); const p = g.attributes.position; const v = new THREE.Vector3();
  const o = rnd() * 100;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + (fbm(v.x * 1.1 + o, v.y * 1.1 + v.z * 0.9) - 0.45) * 0.32; v.multiplyScalar(n); if (v.y < -0.3) v.y = -0.3; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, rockMat); m.scale.set(s, s * sy, s * R(0.7, 1)); m.rotation.y = rnd() * 6;
  m.position.set(x, sandH(x, z) + s * sy * 0.15, z); m.castShadow = m.receiveShadow = true; scene.add(m); solids.push(m);
  contactShadow(x, z, s * 2.6, 0.85);
  obstacles.push({ c: new THREE.Vector3(x, m.position.y + s * sy * 0.4, z), r: s * 1.05 });
}
rock(-1.9, -0.55, 0.55, 1.1); rock(-1.35, -0.15, 0.32, 0.8); rock(-2.4, 0.2, 0.25, 0.7);
rock(1.7, -0.7, 0.45, 1.3); rock(2.25, -0.2, 0.28, 0.9); rock(0.4, 0.55, 0.18, 0.7);
rock(-0.6, -0.8, 0.3, 1.0); rock(2.7, 0.55, 0.16, 0.7); rock(-2.8, -0.75, 0.3, 1.5);
const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0x9a8070, roughness: 0.9, metalness: 0 });
function branch(pts, r) {
  r *= 1.5; const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0] * SX, p[1] * SY, p[2] * SZ)));
  const g = new THREE.TubeGeometry(curve, 24, r, 8, false); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (hash(i, 1) - 0.5) * r * 0.25, p.getY(i), p.getZ(i) + (hash(i, 2) - 0.5) * r * 0.25);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, woodMat); m.castShadow = m.receiveShadow = true; scene.add(m); solids.push(m);
  for (let t = 0; t <= 1; t += 0.125) obstacles.push({ c: curve.getPoint(t), r: r + 0.12 });
  for (let t = 0.2; t < 0.9; t += 0.2) { const q = curve.getPoint(t); if (q.y > 1.0) perches.push(q.clone().add(new THREE.Vector3(0, r * 0.9, 0))); }
}
branch([[0.9, 0.35, -0.4], [0.2, 0.8, -0.55], [-0.4, 1.5, -0.7], [-0.7, 2.2, -0.85]], 0.09);
branch([[0.2, 0.8, -0.55], [0.5, 1.4, -0.8], [0.95, 1.9, -0.95]], 0.05);
branch([[-0.1, 1.2, -0.62], [-0.6, 1.35, -0.3], [-1.0, 1.25, -0.1]], 0.04);
branch([[1.3, 0.3, -0.1], [0.6, 0.45, -0.35], [0.9, 0.35, -0.4]], 0.08);

// ---------- plants (instanced, vertex sway) ----------
const plantU = { uT: { value: 0 } };
function swayMat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.45, ...opts });
  m.onBeforeCompile = (s) => {
    s.uniforms.uT = plantU.uT;
    s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      vec4 wp0 = instanceMatrix * vec4(transformed, 1.0);
      float hh = max(wp0.y - ip.y, 0.0);
      float ph = ip.x * 1.7 + ip.z * 2.3 + instanceMatrix[0][2] * 3.0;
      float sp = 0.7 + fract(ph * 0.37) * 0.6;
      float sw = sin(uT * 0.8 * sp + ph - hh * 1.6) * 0.6 + sin(uT * 1.5 * sp + ph * 1.3 - hh * 2.2) * 0.3;
      vec3 off = vec3(sw * 0.08 * hh * hh, 0.0, cos(uT * 0.6 * sp + ph) * 0.05 * hh * hh);
      transformed += (inverse(mat3(instanceMatrix)) * off);`);
  };
  return m;
}
function placeInstances(geo, mat, n, filter, scaleFn, hue = [0.23, 0.33]) {
  const im = new THREE.InstancedMesh(geo, mat, n); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  let k = 0, guard = 0;
  while (k < n && guard++ < n * 50) {
    const x = R(-HX + 0.15, HX - 0.15), z = R(-HZ + 0.1, HZ - 0.15);
    if (!filter(x / SX, z / SZ)) continue;
    p.set(x, sandH(x, z) - 0.02, z); e.set(R(-0.12, 0.12), rnd() * 6.28, R(-0.12, 0.12)); q.setFromEuler(e);
    const sc = scaleFn(); s.set(sc[0], sc[1], sc[0]); m4.compose(p, q, s); im.setMatrixAt(k, m4);
    im.setColorAt(k, new THREE.Color().setHSL(R(hue[0], hue[1]), R(0.4, 0.62), R(0.2, 0.34))); k++;
  }
  im.count = k; im.frustumCulled = false; im.renderOrder = 1; scene.add(im); return im;
}
const plantStats = {};
// 1) vallisneria: tall twisted ribbons at the back
{
  const g = new THREE.PlaneGeometry(0.11, 1, 1, 18); g.translate(0, 0.5, 0);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i) * (0.7 + Math.sin(Math.min(y, 0.999) * Math.PI) * 0.4) * (y > 0.88 ? Math.max(0.05, (1 - y) / 0.12) : 1); const a = y * 1.6; p.setXYZ(i, x * Math.cos(a), y, x * Math.sin(a) + y * y * 0.12); }
  g.computeVertexNormals();
  plantStats.vallis = placeInstances(g, swayMat(0xffffff, { map: ribbonTex, alphaTest: 0.3 }), MOBILE ? 60 : 95, (x, z) => z < -0.45 && Math.abs(x + 1.9) > 0.5 || (z < 0 && Math.abs(x) > 2.3), () => [R(1.1, 1.6), R(2.2, 3.6)]).count;
}
// 2) grass clumps: short curved blades
{
  const g = new THREE.PlaneGeometry(0.045, 0.34, 1, 8); g.translate(0, 0.17, 0);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 0.34; p.setX(i, p.getX(i) * (1 - y * y * 0.8)); p.setZ(i, y * y * 0.16); }
  g.computeVertexNormals();
  const clumps = [[-0.5, 0.7], [0.9, 0.6], [-2.5, 0.8], [2.4, 0.7], [1.2, 0.2], [-1.0, 0.45], [2.0, 0.95], [-0.2, 0.95]];
  plantStats.grass = placeInstances(g, swayMat(0xffffff, { map: ribbonTex, alphaTest: 0.3 }), MOBILE ? 380 : 650, (x, z) => clumps.some(c => Math.hypot(x - c[0], z - c[1]) < 0.3), () => [R(0.9, 1.3), R(0.6, 1.5)], [0.2, 0.3]).count;
}
// 3) stem plants (rotala / ludwigia): whorls of real leaves along stems
{
  const leaf = new THREE.PlaneGeometry(0.06, 0.15, 1, 3); leaf.translate(0, 0.075, 0);
  { const p = leaf.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 0.15; p.setZ(i, Math.sin(y * 2.2) * 0.02); } leaf.computeVertexNormals(); }
  const n = MOBILE ? 800 : 1400; const im = new THREE.InstancedMesh(leaf, swayMat(0xffffff, { map: leafTex }), n);
  const bushes = [[2.55, -0.9, 1.6], [-2.6, -0.95, 1.3], [0.2, -0.95, 1.1], [1.1, -0.2, 0.7], [-2.0, 0.55, 0.7], [-1.1, -1.0, 1.4], [2.0, 0.3, 0.6]];
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let k = 0;
  for (let [bx, bz, h] of bushes) { bx *= SX; bz *= SZ; h *= 1.6;
    const red = Math.abs(bx - 1.1 * SX) < 0.01 || Math.abs(bx + 1.1 * SX) < 0.01;
    for (let st = 0; st < 7; st++) {
      const sx = bx + R(-0.3, 0.3), sz = bz + R(-0.2, 0.2), sh = h * R(0.6, 1), base = sandH(sx, sz);
      for (let y = 0.05, rot = rnd() * 6; y < sh && k < n; y += 0.085, rot += 0.9) {
        for (let a = 0; a < 3 && k < n; a++) {
          const lean = sin01(y / sh); p.set(sx + lean * 0.06, base + y, sz); e.set(0, rot + a * 2.094, 0, 'YXZ'); e.x = R(0.9, 1.25) - (y / sh) * 0.5; q.setFromEuler(e);
          const sc = 1.15 - (y / sh) * 0.45; s.set(sc, sc, sc); m4.compose(p, q, s); im.setMatrixAt(k, m4);
          const top = y / sh;
          im.setColorAt(k, red ? new THREE.Color().setHSL(0.98 + top * 0.03, 0.55, 0.2 + top * 0.12) : new THREE.Color().setHSL(R(0.25, 0.31), 0.55, 0.18 + top * 0.14)); k++;
        }
      }
    }
  }
  im.count = k; im.frustumCulled = false; im.renderOrder = 1; scene.add(im); plantStats.stemLeaves = k;
}
function sin01(x) { return Math.sin(x * Math.PI * 0.5); }
// 4) broad-leaf rosettes (echinodorus / anubias): arching wide leaves
{
  const g = new THREE.PlaneGeometry(0.2, 0.5, 2, 8); g.translate(0, 0.25, 0);
  { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 0.5, x = p.getX(i); p.setZ(i, y * y * 0.28 - Math.abs(x) * 0.25); p.setY(i, p.getY(i) * (1 - y * 0.25)); } g.computeVertexNormals(); }
  const ros = [[-1.55, 0.35, 1.0], [1.45, 0.75, 0.9], [-0.1, 0.25, 0.8], [2.85, -0.1, 1.1], [-2.9, 0.1, 1.0]];
  const n = ros.length * 11; const im = new THREE.InstancedMesh(g, swayMat(0xffffff, { map: leafTex }), n);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(); let k = 0;
  for (const [rx, rz, sc0] of ros) { const x = rx * SX, z = rz * SZ, y = sandH(x, z) - 0.02, anub = sc0 < 0.95;
    for (let i = 0; i < 11; i++) { p.set(x + R(-0.03, 0.03), y, z + R(-0.03, 0.03)); e.set(R(0.15, 0.6), i * 0.571 * 1.0 + rnd() * 0.4, 0, 'YXZ'); q.setFromEuler(e);
      const sc = sc0 * R(0.75, 1.25) * (anub ? 0.8 : 1.3); s.set(sc * (anub ? 1.3 : 0.9), sc, sc); m4.compose(p, q, s); im.setMatrixAt(k, m4);
      im.setColorAt(k, new THREE.Color().setHSL(anub ? R(0.28, 0.32) : R(0.22, 0.27), anub ? 0.45 : 0.6, anub ? R(0.14, 0.2) : R(0.24, 0.32))); k++; }
    contactShadow(x, z, 0.9 * sc0, 0.5);
  }
  im.count = k; im.frustumCulled = false; im.renderOrder = 1; scene.add(im); plantStats.broadLeaves = k;
}
// moss on wood/rocks (small instanced spheres)
{
  const g = new THREE.IcosahedronGeometry(0.03, 1); const n = 260; const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x2f5a22, roughness: 1 }), n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { const o = obstacles[i % obstacles.length]; const d = new THREE.Vector3(R(-1, 1), R(0.2, 1), R(-1, 1)).normalize().multiplyScalar(o.r * 0.72); const sc = R(0.6, 1.4); m4.makeScale(sc, sc * 0.6, sc).setPosition(o.c.x + d.x, o.c.y + d.y, o.c.z + d.z); im.setMatrixAt(i, m4); }
  scene.add(im);
}

// ---------- light shafts ----------
const shafts = [];
for (let i = 0; i < 11; i++) {
  const m = new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xd9fbff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const w = R(0.5, 1.4), mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, WATER * 1.05), m);
  mesh.position.set(R(-4.6, 4.6), WATER / 2 + 0.05, R(-1.4, 1.0)); mesh.rotation.z = R(-0.28, -0.12); mesh.rotation.y = R(-0.3, 0.3);
  mesh.renderOrder = 5; scene.add(mesh); shafts.push({ m, base: R(0.05, 0.09), ph: rnd() * 6 });
}

// ---------- bubbles + dust ----------
const filterPos = new THREE.Vector3(HX - 0.3, 0.3, -HZ + 0.25);
const filt = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, WATER - 0.4, 16), new THREE.MeshStandardMaterial({ color: 0x1a1d1e, roughness: 0.5, metalness: 0.3 }));
filt.position.set(HX - 0.3, WATER / 2 + 0.1, -HZ + 0.18); scene.add(filt);
const NB = 90;
const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xcfeef5, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.3, emissive: 0x5fa8b8, emissiveIntensity: 0.15, depthWrite: false }), NB);
const bState = []; for (let i = 0; i < NB; i++) bState.push({ y: R(0.3, WATER), s: R(0.008, 0.03), ph: rnd() * 6, v: R(0.35, 0.7) });
bubbles.frustumCulled = false; scene.add(bubbles);
const ND = MOBILE ? 22 : 50; const dg = new THREE.BufferGeometry(); const dp = new Float32Array(ND * 3);
for (let i = 0; i < ND; i++) { dp[i * 3] = R(-HX, HX); dp[i * 3 + 1] = R(0.3, WATER); dp[i * 3 + 2] = R(-HZ, HZ); }
dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xcfe6de, map: moteTex, size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.22, depthWrite: false, fog: true }));
scene.add(dust);

// ---------- fish ----------
// Smooth travelling-wave swimming: every vertex of body + fins is displaced sideways by a wave
// that runs head -> tail with amplitude growing toward the tail (no segment seams, no pops).
function waveMaterial(base, u, kind) {
  base.onBeforeCompile = (s) => {
    s.uniforms.uT = u.uT; s.uniforms.uA = u.uA; s.uniforms.uL = u.uL; s.uniforms.uF = u.uF; s.uniforms.uTurn = u.uTurn;
    const fin = kind === 'fin';
    s.vertexShader = 'uniform float uT, uA, uL, uF, uTurn;\n' + (fin ? 'attribute float aEdge; varying float vEdge;\n' : '') + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      ${fin ? 'vEdge = aEdge; transformed.x += sin(uT * 1.3 + aEdge * 3.5 + transformed.y * 20.0) * aEdge * aEdge * uL * 0.05;' : ''}
      float zn = transformed.z / uL;                       // +0.5 head .. -0.5 tail (fins can go further)
      float env = smoothstep(0.35, -0.75, zn);              // stiff head, flexible tail
      float wave = sin(uT - zn * 6.2831 * 0.9);
      transformed.x += wave * uA * (0.15 + 1.6 * env * env);
      transformed.x += uTurn * uL * env * env * 0.35;       // body bends into turns
      transformed.x += sin(uT * 0.45 + transformed.y * 7.0 + transformed.z * 4.0) * uF * abs(transformed.y);`);
    if (fin) s.fragmentShader = 'varying float vEdge;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.a *= (1.0 - smoothstep(0.55, 1.0, vEdge) * 0.85) * (0.55 + 0.45 * smoothstep(0.0, 0.25, vEdge));`);
    if (kind === 'body') s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float fres = pow(1.0 - abs(dot(normalize(normal), vec3(0.0, 0.0, 1.0))), 3.0);
      totalEmissiveRadiance += vec3(0.35, 0.6, 0.65) * fres * 0.45;`);
  };
  return base;
}
// Soft membrane fin: smoothed outline, fan of rings from the root; aEdge 0 (root) -> 1 (rim).
function finGeo(pts, color, x = 0) {
  const ol = new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(q[0], q[1], 0)), true, 'centripetal', 0.5).getPoints(40);
  let cx = 0, cy = 0; for (const q of pts) { cx += q[0]; cy += q[1]; } cx /= pts.length; cy /= pts.length;
  const c0 = new THREE.Vector3(pts[0][0] * 0.6 + cx * 0.4, pts[0][1] * 0.6 + cy * 0.4, 0);
  const RINGS = 5, P = [], E = [], C = [];
  const base = new THREE.Color(color).lerp(new THREE.Color(0xd8dcd6), 0.3), dark = base.clone().multiplyScalar(0.6), cc = new THREE.Color();
  const vtx = (i, r) => { const o = ol[i % ol.length]; return [c0.x + (o.x - c0.x) * r, c0.y + (o.y - c0.y) * r, 0]; };
  for (let i = 0; i < ol.length; i++) for (let k = 0; k < RINGS; k++) {
    const r0 = k / RINGS, r1 = (k + 1) / RINGS;
    const quad = [[i, r0], [i + 1, r0], [i + 1, r1], [i, r0], [i + 1, r1], [i, r1]];
    for (const [ii, r] of quad) { const v = vtx(ii, r); P.push(...v); E.push(r);
      const ray = Math.pow(Math.abs(Math.sin(ii / ol.length * Math.PI * 14)), 6); cc.copy(base).lerp(dark, ray * 0.6 * r); C.push(cc.r, cc.g, cc.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aEdge', new THREE.Float32BufferAttribute(E, 1));
  // gentle cup/bend out of plane
  const pp = g.attributes.position; for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin(E[i] * 2.0) * 0.012 * Math.sign(pp.getY(i) || 1));
  g.rotateY(-Math.PI / 2); if (x) g.translate(x, 0, 0); g.computeVertexNormals(); return g;
}
function merge(geos) {
  const list = geos.map(g => { g = g.index ? g.toNonIndexed() : g; if (!g.attributes.normal) g.computeVertexNormals(); return g; });
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), A = new Float32Array(n); let o = 0;
  for (const g of list) {
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); if (g.attributes.aEdge) A.set(g.attributes.aEdge.array, o);
    if (g.attributes.color) C.set(g.attributes.color.array, o * 3); else C.fill(1, o * 3, (o + g.attributes.position.count) * 3);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.BufferAttribute(N, 3)); m.setAttribute('color', new THREE.BufferAttribute(C, 3)); m.setAttribute('aEdge', new THREE.BufferAttribute(A, 1));
  return m;
}
function bodyGeo(L, Hh, Wd, colorFn, taper = 0.65) {
  const g = new THREE.SphereGeometry(1, 56, 32); g.rotateX(Math.PI / 2);
  const p = g.attributes.position; const cols = new Float32Array(p.count * 3); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = z < 0 ? 1 - taper * Math.pow(-z, 1.35) : 1 - 0.22 * Math.pow(z, 2.2);
    x *= k; y *= k; y += z > 0 ? -0.1 * z * z : 0;
    if (z < -0.82) { const f = (-z - 0.82) / 0.18; y *= 1 + f * 0.6; } // caudal peduncle flare
    colorFn(c, x, y, z);
    if (Math.abs(z - 0.52 + y * y * 0.12) < 0.022 && Math.abs(y) < 0.75) c.multiplyScalar(0.62); // gill cover line
    if (z > 0.93 && Math.abs(y + 0.05) < 0.12) c.multiplyScalar(0.45); // mouth
    const belly = THREE.MathUtils.smoothstep(-y, 0.2, 1) * 0.18; c.r += belly; c.g += belly; c.b += belly; // countershading
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    p.setXYZ(i, x * Wd / 2, y * Hh / 2, z * L / 2);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals(); g.computeBoundingBox(); return g;
}
function eyeGeoFor(body, er, ez, ey, irisHex) {
  const bw = body.boundingBox, parts = [];
  for (const sx of [-1, 1]) {
    const x = sx * bw.max.x * 0.7;
    const iris = new THREE.SphereGeometry(er, 14, 10); iris.translate(x, ey, ez); paint(iris, irisHex); parts.push(iris);
    const pup = new THREE.SphereGeometry(er * 0.62, 12, 8); pup.translate(x + sx * er * 0.5, ey, ez + er * 0.1); paint(pup, 0x020203); parts.push(pup);
    const hl = new THREE.SphereGeometry(er * 0.2, 6, 4); hl.translate(x + sx * er * 0.95, ey + er * 0.3, ez + er * 0.3); paint(hl, 0xffffff); parts.push(hl);
  }
  return merge(parts);
}
function paint(g, hex) { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function pecGeo(len, wid, color) { const g = finGeo([[0, 0], [-len * 0.4, wid], [-len, wid * 0.7], [-len * 0.9, 0]], color); g.rotateZ(Math.PI / 2); return g; }

const SPECIES = {
  neon: { name: 'Neon Innesa', L: 0.2, speed: 0.6, school: true, scale: 1.7, build() {
    const body = bodyGeo(0.2, 0.052, 0.036, (c, x, y, z) => {
      if (Math.abs(y - 0.2) < 0.17) c.setRGB(0.08, 0.7, 1.0);
      else if (y < 0.03 && z < 0.35) c.setRGB(0.95, 0.07, 0.1);
      else if (y < 0) c.setRGB(0.82, 0.82, 0.8); else c.setRGB(0.32, 0.3, 0.22);
    });
    return { body, bm: { emissive: 0x06324a, emissiveIntensity: 0.7 }, iri: 1, finOp: 0.45, fins: [
      finGeo([[-0.085, 0], [-0.135, 0.035], [-0.118, 0], [-0.135, -0.035]], 0xdcdcdc),
      finGeo([[0.0, 0.022], [-0.025, 0.05], [-0.042, 0.022]], 0xdddddd),
      finGeo([[-0.01, -0.022], [-0.03, -0.042], [-0.06, -0.018]], 0xdddddd)], eye: [0.011, 0.074, 0.008, 0x3aa0c8] };
  } },
  rummy: { name: 'Bystrzyk czerwononosy', L: 0.24, speed: 0.55, school: true, scale: 1.6, build() {
    const body = bodyGeo(0.24, 0.06, 0.04, (c, x, y, z) => {
      if (z > 0.45) c.setRGB(0.95, 0.12, 0.1); else c.setRGB(0.78, 0.8, 0.74);
      if (z > 0.3 && z <= 0.45) c.setRGB(0.9, 0.45, 0.35);
    });
    const tail = finGeo([[-0.1, 0], [-0.17, 0.045], [-0.15, 0], [-0.17, -0.045]], 0xf2f2f2);
    { const p = tail.attributes.position, col = tail.attributes.color; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const blk = Math.abs(y) < 0.012 || Math.abs(y) > 0.03 ? 0.08 : 1; col.setXYZ(i, blk, blk, blk); } }
    return { body, bm: { metalness: 0.35 }, iri: 0.8, finOp: 0.7, fins: [tail,
      finGeo([[0.0, 0.026], [-0.03, 0.058], [-0.05, 0.026]], 0xe8e8e8),
      finGeo([[-0.01, -0.026], [-0.04, -0.05], [-0.07, -0.02]], 0xe8e8e8)], eye: [0.013, 0.09, 0.01, 0xd03020] };
  } },
  angel: { name: 'Skalar', L: 0.42, speed: 0.24, scale: 1.45, build() {
    const body = bodyGeo(0.42, 0.34, 0.07, (c, x, y, z) => {
      const bar = Math.sin(z * 9.5 + 1.2) > 0.72 ? 0.2 : 1; c.setRGB(0.84 * bar, 0.82 * bar, 0.72 * bar);
      if (y > 0.6) c.multiplyScalar(0.8);
    }, 0.55);
    return { body, bm: { metalness: 0.4, roughness: 0.28 }, iri: 0.6, finOp: 0.55, pec: [0.08, 0.035, 0xe6e0cc], fins: [
      finGeo([[0.02, 0.14], [-0.2, 0.52], [-0.14, 0.12]], 0xd9d2bd),
      finGeo([[0.02, -0.14], [-0.2, -0.54], [-0.14, -0.12]], 0xd9d2bd),
      finGeo([[-0.19, 0], [-0.33, 0.15], [-0.3, 0], [-0.33, -0.15]], 0xe8e2cf),
      finGeo([[0.1, -0.05], [0.02, -0.34], [0.05, -0.05]], 0xf2eadb, 0.02)], eye: [0.02, 0.15, 0.04, 0xb02020] };
  } },
  guppy: { name: 'Gupik', L: 0.18, speed: 0.42, scale: 1.45, build() {
    const hue = rnd(); const tailC = new THREE.Color().setHSL(hue, 0.85, 0.55).getHex();
    const body = bodyGeo(0.18, 0.05, 0.035, (c, x, y, z) => { if (z < -0.2) c.setHSL(hue, 0.8, 0.5); else c.setRGB(0.72, 0.74, 0.7); if (y > 0.3 && z < 0.2) c.setRGB(0.2, 0.55, 0.9); });
    return { body, bm: { metalness: 0.3 }, iri: 1, finOp: 0.82, fins: [
      finGeo([[-0.08, 0], [-0.22, 0.1], [-0.26, 0.0], [-0.22, -0.1]], tailC),
      finGeo([[-0.01, 0.022], [-0.07, 0.075], [-0.085, 0.02]], tailC)], eye: [0.011, 0.065, 0.008, 0x3a3a20] };
  } },
  cory: { name: 'Kirysek', L: 0.26, speed: 0.17, bottom: true, scale: 1.4, build() {
    const body = bodyGeo(0.26, 0.1, 0.085, (c, x, y, z) => { const sp = hash(Math.round(x * 12), Math.round(z * 12 + y * 9)) > 0.6 ? 0.45 : 1; c.setRGB(0.62 * sp, 0.5 * sp, 0.32 * sp); if (y < -0.3) c.setRGB(0.8, 0.72, 0.6); }, 0.55);
    return { body, bm: { metalness: 0.35, roughness: 0.35 }, iri: 0.5, finOp: 0.7, pec: [0.06, 0.03, 0xb8a07a], fins: [
      finGeo([[0.03, 0.04], [-0.02, 0.12], [-0.04, 0.045]], 0xb8a07a),
      finGeo([[-0.12, 0], [-0.19, 0.06], [-0.17, 0], [-0.19, -0.06]], 0xb8a07a)], eye: [0.014, 0.1, 0.025, 0x806030] };
  } },
  ram: { name: 'Pielęgniczka Ramireza', L: 0.2, speed: 0.2, scale: 1.7, build() {
    const body = bodyGeo(0.2, 0.11, 0.05, (c, x, y, z) => {
      c.setRGB(0.95, 0.75, 0.25); if (z > 0.3) c.setRGB(0.98, 0.55, 0.2);
      if (hash(Math.round(x * 20), Math.round(z * 18 + y * 11)) > 0.72) c.setRGB(0.2, 0.6, 0.95);
      if (Math.abs(z - 0.55) < 0.07 && y > -0.2) c.setRGB(0.05, 0.05, 0.06);
    }, 0.6);
    return { body, bm: { metalness: 0.3, roughness: 0.3 }, iri: 0.9, finOp: 0.7, pec: [0.05, 0.025, 0xffd08a], fins: [
      finGeo([[0.05, 0.05], [0.02, 0.13], [-0.06, 0.1], [-0.1, 0.05]], 0x6a78a0),
      finGeo([[-0.09, 0], [-0.16, 0.06], [-0.15, 0], [-0.16, -0.06]], 0xffb060),
      finGeo([[0.0, -0.05], [-0.05, -0.1], [-0.09, -0.04]], 0xe8a080)], eye: [0.012, 0.075, 0.02, 0xd02020] };
  } },
  betta: { name: 'Bojownik', L: 0.32, speed: 0.16, scale: 1.4, build() {
    const body = bodyGeo(0.32, 0.1, 0.07, (c, x, y, z) => c.setRGB(0.55, 0.05, 0.12 + (y > 0 ? 0.15 : 0)));
    return { body, bm: { metalness: 0.4, roughness: 0.25, emissive: 0x200010 }, iri: 1, finOp: 0.75, pec: [0.05, 0.03, 0xa0102a], fins: [
      finGeo([[-0.12, 0], [-0.3, 0.22], [-0.52, 0.18], [-0.56, 0], [-0.52, -0.2], [-0.3, -0.24]], 0xb01030),
      finGeo([[0.04, 0.04], [-0.1, 0.24], [-0.26, 0.2], [-0.14, 0.04]], 0x9a1838),
      finGeo([[0.06, -0.04], [-0.08, -0.3], [-0.26, -0.28], [-0.14, -0.04]], 0x9a1838)], eye: [0.015, 0.11, 0.02, 0x201010], flutter: 0.08 };
  } },
};

const fishes = [];
const BOUND = { x: HX - 0.35, z: HZ - 0.3, y0: 0.6, y1: WATER - 0.2 };
function spawn(kind, n) {
  const sp = SPECIES[kind]; let shared = null;
  for (let i = 0; i < n; i++) {
    const u = { uT: { value: rnd() * 10 }, uA: { value: sp.L * 0.1 }, uL: { value: sp.L }, uF: { value: 0 }, uTurn: { value: 0 } };
    const def = kind === 'guppy' || !shared ? sp.build() : shared; if (!shared) shared = def;
    if (!def.eyeG) { const [er, ez, ey, ic] = def.eye; def.eyeG = eyeGeoFor(def.body, er, ez, ey, ic); def.finG = merge(def.fins); if (def.pec) def.pecG = pecGeo(...def.pec); }
    u.uF.value = def.flutter || 0.012;
    const g = new THREE.Group();
    const BodyMat = MOBILE ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
    const bopts = { vertexColors: true, roughness: 0.32, metalness: 0.2, ...def.bm };
    if (!MOBILE) Object.assign(bopts, { iridescence: def.iri || 0.5, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600], clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const body = new THREE.Mesh(def.body, waveMaterial(new BodyMat(bopts), u, 'body')); body.castShadow = !MOBILE && !sp.school; g.add(body);
    const fins = new THREE.Mesh(def.finG, waveMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: Math.min(0.85, def.finOp + 0.1), side: THREE.DoubleSide, depthWrite: false, roughness: 0.4, emissive: 0x0a0a0a }), u, 'fin'));
    fins.renderOrder = 3; g.add(fins);
    g.add(new THREE.Mesh(def.eyeG, waveMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.1 }), u)));
    const pecs = [];
    if (def.pecG) for (const sx of [-1, 1]) {
      const pv = new THREE.Group(); pv.position.set(sx * def.body.boundingBox.max.x * 0.8, -def.body.boundingBox.max.y * 0.25, sp.L * 0.18);
      const pm = new THREE.Mesh(def.pecG, waveMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: def.finOp * 0.7, side: THREE.DoubleSide, depthWrite: false }), { uT: u.uT, uA: { value: 0 }, uL: u.uL, uF: { value: 0 }, uTurn: { value: 0 } }, 'fin')); pm.renderOrder = 3;
      pm.rotation.z = sx * 0.2; pv.add(pm); g.add(pv); pecs.push({ pv, sx });
    }
    g.scale.setScalar(R(0.88, 1.12) * sp.scale);
    const pos = new THREE.Vector3(R(-BOUND.x + 0.5, BOUND.x - 0.5), R(1.2, WATER - 0.8), R(-HZ + 0.6, HZ - 0.6));
    if (sp.bottom) pos.set(R(-HX + 1, HX - 1), 0, R(-0.2, HZ - 0.5)), pos.y = sandH(pos.x, pos.z) + 0.08;
    if (kind === 'neon') pos.set(R(-2.5, 0.5), R(2.0, 2.8), R(-0.4, 0.8));
    if (kind === 'rummy') pos.set(R(1.0, 3.5), R(1.3, 2.0), R(-0.6, 0.6));
    g.position.copy(pos); scene.add(g);
    const dir = new THREE.Vector3(R(-1, 1), 0, R(-0.3, 0.3)).normalize();
    const shadow = sp.school ? null : contactShadow(pos.x, pos.z, sp.L * sp.scale * 1.6, 0.35);
    fishes.push({ shadow, id: fishes.length, kind, sp, g, u, pos, pecs, vel: dir.multiplyScalar(0.2), speed: sp.speed * R(0.9, 1.1), wp: null, wpT: 0, rest: 0, yaw: 0, eat: 0 });
  }
}
seed = 1234;
spawn('neon', MOBILE ? 26 : 36); spawn('rummy', MOBILE ? 10 : 14); spawn('angel', 3); spawn('guppy', 8); spawn('cory', 6); spawn('ram', 2); spawn('betta', 1);

// ---------- food ----------
const NF = 80; const foods = [];
const foodMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.018, 0), new THREE.MeshStandardMaterial({ color: 0xc86a2a, roughness: 0.8, emissive: 0x3a1500 }), NF);
foodMesh.count = 0; foodMesh.frustumCulled = false; scene.add(foodMesh);
let eaten = 0;
function feed(x) {
  const cx = typeof x === 'number' ? THREE.MathUtils.clamp(x, -HX + 0.8, HX - 0.8) : R(-HX + 1.5, HX - 1.5);
  for (let i = 0; i < 30 && foods.length < NF; i++) foods.push({ p: new THREE.Vector3(cx + R(-0.7, 0.7), WATER - 0.01, R(-0.9, 0.9)), rot: rnd() * 6, ph: rnd() * 6, float: R(0.5, 2.5), age: 0 });
}

// ---------- behaviour ----------
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), steer = new THREE.Vector3(), m4 = new THREE.Matrix4(), qTarget = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const sep = new THREE.Vector3(), ali = new THREE.Vector3(), coh = new THREE.Vector3(), fwd = new THREE.Vector3();
function updateFish(f, dt, t) {
  steer.set(0, 0, 0);
  const p = f.pos, sp = f.sp;
  let speed = f.speed;
  let food = null, fd = 1e9;
  for (const fo of foods) { const d = fo.p.distanceTo(p); if (d < fd && d < 4.5) { fd = d; food = fo; } }
  if (food && !(sp.bottom && food.p.y > 1.2)) {
    tmp.subVectors(food.p, p).normalize().multiplyScalar(2.6); steer.add(tmp); speed *= 1.9;
    if (fd < 0.08 + sp.L * 0.3) { foods.splice(foods.indexOf(food), 1); f.eat = 0.4; eaten++; if (window.__onEat) window.__onEat(f); }
  } else if (sp.school) {
    sep.set(0, 0, 0); ali.set(0, 0, 0); coh.set(0, 0, 0); let n = 0;
    for (const o of fishes) {
      if (o === f || o.kind !== f.kind) continue; const d = o.pos.distanceTo(p);
      if (d < 0.9) { ali.add(o.vel); coh.add(o.pos); n++; if (d < 0.16) sep.add(tmp.subVectors(p, o.pos).divideScalar(d * d + 1e-3)); }
    }
    if (n) { ali.divideScalar(n).sub(f.vel).multiplyScalar(1.3); coh.divideScalar(n).sub(p).multiplyScalar(0.9); steer.add(ali).add(coh); }
    steer.add(sep.multiplyScalar(0.025));
    const ph = f.kind === 'neon' ? 0 : 2.4;
    const wx = Math.sin(t * 0.07 + ph) * (HX - 1.6), wy = (f.kind === 'neon' ? 2.5 : 1.8) + Math.sin(t * 0.15 + ph) * 0.5, wz = Math.sin(t * 0.05 + 1 + ph) * (HZ - 1.1);
    steer.add(tmp.set(wx - p.x, wy - p.y, wz - p.z).multiplyScalar(0.16));
  } else {
    f.wpT -= dt;
    if (!f.wp || f.wpT < 0 || f.wp.distanceTo(p) < 0.35) {
      f.wpT = R(6, 14);
      const x = R(-BOUND.x + 0.4, BOUND.x - 0.4), z = R(-HZ + 0.7, HZ - 0.6);
      const y = sp.bottom ? sandH(x, z) + 0.08 : f.kind === 'guppy' ? R(2.4, WATER - 0.5) : f.kind === 'ram' ? R(0.9, 1.5) : R(1.4, WATER - 0.9);
      f.wp = new THREE.Vector3(x, y, z);
    }
    steer.add(tmp.subVectors(f.wp, p).normalize().multiplyScalar(0.8));
    if (sp.bottom || f.kind === 'ram') { f.rest -= dt; if (f.rest < -R(4, 8)) f.rest = R(1.5, 3.5); if (f.rest > 0) speed *= 0.12; }
  }
  // soft avoidance: glass, floor, surface, decor (look-ahead)
  const m = 0.55, k = 3.2;
  if (p.x > BOUND.x - m) steer.x -= k * (p.x - BOUND.x + m); if (p.x < -BOUND.x + m) steer.x += k * (-BOUND.x + m - p.x);
  if (p.z > BOUND.z - m) steer.z -= k * (p.z - BOUND.z + m); if (p.z < -BOUND.z + m) steer.z += k * (-BOUND.z + m - p.z);
  const floorY = sandH(p.x, p.z) + (sp.bottom ? 0.06 : 0.35);
  if (!sp.bottom && p.y < floorY + 0.25) steer.y += k * (floorY + 0.25 - p.y);
  if (p.y > BOUND.y1 - 0.2) steer.y -= k * (p.y - BOUND.y1 + 0.2);
  fwd.copy(f.vel).multiplyScalar(0.8).add(p);
  for (const o of obstacles) {
    const d = fwd.distanceTo(o.c) - o.r, d0 = p.distanceTo(o.c) - o.r;
    if (d < 0.35) steer.add(tmp.subVectors(fwd, o.c).normalize().multiplyScalar((0.35 - d) * 7));
    if (d0 < 0.05) p.add(tmp.subVectors(p, o.c).normalize().multiplyScalar(0.05 - d0)); // hard push-out: never inside decor
  }
  f.vel.addScaledVector(steer, dt);
  if (!sp.bottom) f.vel.y *= 0.96;
  const v = f.vel.length(); const want = speed * (0.85 + 0.15 * Math.sin(t * 0.8 + f.id));
  if (v > 1e-4) f.vel.multiplyScalar(THREE.MathUtils.lerp(v, want, 0.04) / v);
  const hl = Math.hypot(f.vel.x, f.vel.z); if (Math.abs(f.vel.y) > hl * 0.5) f.vel.y = Math.sign(f.vel.y) * hl * 0.5;
  p.addScaledVector(f.vel, dt);
  p.x = THREE.MathUtils.clamp(p.x, -HX + 0.15, HX - 0.15); p.z = THREE.MathUtils.clamp(p.z, -HZ + 0.12, HZ - 0.12);
  p.y = THREE.MathUtils.clamp(p.y, sandH(p.x, p.z) + 0.05, WATER - 0.06);
  if (sp.bottom) p.y = THREE.MathUtils.lerp(p.y, sandH(p.x, p.z) + 0.07, 0.1);
  f.g.position.copy(p);
  // orientation + turn bend
  const yawNow = Math.atan2(f.vel.x, f.vel.z);
  let dy = yawNow - f.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); f.yaw = yawNow;
  f.u.uTurn.value = THREE.MathUtils.lerp(f.u.uTurn.value, THREE.MathUtils.clamp(-dy / Math.max(dt, 1e-3) * 0.25, -1, 1), 0.1);
  if (hl + Math.abs(f.vel.y) > 1e-3) {
    m4.lookAt(tmp.set(0, 0, 0), tmp2.copy(f.vel).negate(), UP); qTarget.setFromRotationMatrix(m4);
    f.g.quaternion.slerp(qTarget, 1 - Math.pow(0.03, dt));
  }
  const cur = f.vel.length();
  if (f.eat > 0) f.eat -= dt;
  f.u.uT.value += dt * (5 + cur / sp.L * 5.5 + (f.eat > 0 ? 12 : 0));
  f.u.uA.value = THREE.MathUtils.lerp(f.u.uA.value, sp.L * (0.05 + Math.min(cur / f.speed, 2.2) * 0.055), 0.05);
  for (const pc of f.pecs) pc.pv.rotation.y = pc.sx * (0.5 + Math.sin(f.u.uT.value * 0.6 + pc.sx) * 0.35);
}

// ---------- other animals ----------
const animals = [];
const rayc = new THREE.Raycaster();
function topAt(x, z) { rayc.set(tmp.set(x, WATER + 1, z), tmp2.set(0, -1, 0)); const h = rayc.intersectObjects([sand, ...solids], false)[0]; return h ? h.point.y : sandH(x, z); }
function lambert(c, o = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, ...o }); }
// snail (Neritina-like): foot + spiral shell with bands, antennae; crawls along a surface
function makeSnail(shellHue) {
  const g = new THREE.Group();
  const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), lambert(0xc9b89a, { roughness: 0.4, transparent: true, opacity: 0.92 }));
  foot.scale.set(0.06, 0.025, 0.12); foot.position.y = 0.02; g.add(foot);
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 0.75, r = 0.075 * Math.pow(0.8, i), rad = 0.05 * Math.pow(0.8, i) + 0.004;
    const s = new THREE.SphereGeometry(rad, 14, 10); s.translate(Math.cos(a) * r * 0.25, 0.075 + Math.sin(a) * r * 0.6 * 0.5 + i * 0.006, -0.01 + Math.sin(a) * r * 0.35 - Math.cos(a) * 0.01);
    paint(s, new THREE.Color().setHSL(shellHue, 0.6, i % 2 ? 0.18 : 0.42).getHex()); parts.push(s);
  }
  const shell = new THREE.Mesh(merge(parts), new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.25, clearcoat: 1 }));
  shell.scale.set(1, 1, 1.25); g.add(shell);
  for (const sx of [-1, 1]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.07, 5), lambert(0x8a7a60)); a.position.set(sx * 0.025, 0.04, 0.12); a.rotation.set(1.1, 0, sx * -0.4); g.add(a); }
  g.scale.setScalar(1.6); return g;
}
function addSnail(surface, shellHue) {
  const g = makeSnail(shellHue); scene.add(g);
  animals.push({ type: 'snail', name: 'Ślimak', g, surf: surface, a: rnd() * 6, u: R(surface.u0, surface.u1), v: R(surface.v0, surface.v1), turn: 0, update(dt, t) {
    const s = this.surf; this.turn += (rnd() - 0.5) * dt * 2; this.turn *= 0.98; this.a += this.turn * dt;
    const sp = 0.035 * (0.7 + 0.3 * Math.sin(t * 1.3 + this.a));
    this.u += Math.cos(this.a) * sp * dt; this.v += Math.sin(this.a) * sp * dt;
    if (this.u < s.u0 || this.u > s.u1) { this.a = Math.PI - this.a; this.u = THREE.MathUtils.clamp(this.u, s.u0, s.u1); }
    if (this.v < s.v0 || this.v > s.v1) { this.a = -this.a; this.v = THREE.MathUtils.clamp(this.v, s.v0, s.v1); }
    const p = s.pos(this.u, this.v), d = tmp.copy(s.U).multiplyScalar(Math.cos(this.a)).addScaledVector(s.V, Math.sin(this.a)).normalize();
    const n = s.normal(this.u, this.v), x = tmp2.crossVectors(n, d).normalize(); d.crossVectors(x, n);
    m4.makeBasis(x, n, d); this.g.quaternion.setFromRotationMatrix(m4); this.g.position.copy(p);
    this.g.children[0].scale.z = 0.12 * (1 + Math.sin(t * 2.2 + this.a) * 0.08); // foot wave
  } });
}
addSnail({ U: new THREE.Vector3(1, 0, 0), V: new THREE.Vector3(0, 1, 0), u0: -HX + 0.5, u1: HX - 0.9, v0: 1.4, v1: WATER - 0.4, pos: (u, v) => new THREE.Vector3(u, v, -HZ + 0.012), normal: () => new THREE.Vector3(0, 0, 1) }, 0.09);
addSnail({ U: new THREE.Vector3(0, 0, 1), V: new THREE.Vector3(0, 1, 0), u0: -HZ + 0.4, u1: HZ - 0.4, v0: 1.0, v1: WATER - 0.5, pos: (u, v) => new THREE.Vector3(-HX + 0.03, v, u), normal: () => new THREE.Vector3(1, 0, 0) }, 0.13);
addSnail({ U: new THREE.Vector3(1, 0, 0), V: new THREE.Vector3(0, 0, 1), u0: -1.5, u1: 1.5, v0: 0.3, v1: HZ - 0.4, pos: (u, v) => new THREE.Vector3(u, sandH(u, v) - 0.005, v), normal: (u, v) => new THREE.Vector3(sandH(u - 0.05, v) - sandH(u + 0.05, v), 0.1, sandH(u, v - 0.05) - sandH(u, v + 0.05)).normalize() }, 0.02);

// cherry shrimp: curved segmented translucent body, legs, antennae; picks at substrate and hops
function makeShrimp(col) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const mat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.3, transparent: true, opacity: 0.88, clearcoat: 1, emissive: new THREE.Color(col).multiplyScalar(0.15) });
  const segs = [];
  for (let i = 0; i < 7; i++) {
    const r = i === 0 ? 0.03 : 0.026 * (1 - i * 0.1), s = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat);
    s.scale.set(r * 0.9, r, i === 0 ? 0.05 : 0.022); s.position.set(0, 0.04 + Math.sin(i * 0.35) * 0.02, 0.05 - i * 0.028); body.add(s); segs.push(s);
  }
  const fan = new THREE.Mesh(finGeo([[0, 0], [-0.04, 0.025], [-0.045, -0.025]], col), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  fan.rotation.x = Math.PI / 2; fan.position.set(0, 0.035, -0.15); body.add(fan);
  const legM = lambert(col), legs = [];
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.045, 4), legM); l.position.set(sx * 0.012, 0.02, 0.05 - i * 0.02); l.rotation.z = sx * 0.5; body.add(l); legs.push(l); }
  for (const sx of [-1, 1]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0015, 0.16, 4), legM); a.geometry.translate(0, 0.08, 0); a.position.set(sx * 0.01, 0.05, 0.08); a.rotation.set(1.1, 0, sx * -0.5); body.add(a); }
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05 })); e.position.set(sx * 0.018, 0.055, 0.085); body.add(e); }
  g.scale.setScalar(2.0); return { g, legs, body };
}
function addShrimp(x, z, col) {
  const s = makeShrimp(col); scene.add(s.g);
  const y = topAt(x, z);
  animals.push({ type: 'shrimp', name: 'Krewetka', ...s, p: new THREE.Vector3(x, y, z), from: null, to: null, hopT: 0, wait: R(1, 4), heading: rnd() * 6, update(dt, t) {
    if (this.to) {
      this.hopT += dt / 0.9; const k = Math.min(this.hopT, 1), e = k * k * (3 - 2 * k);
      this.p.lerpVectors(this.from, this.to, e); this.p.y += Math.sin(k * Math.PI) * 0.35;
      this.body.rotation.x = -Math.sin(k * Math.PI) * 0.35;
      if (k >= 1) { this.to = null; this.wait = R(2, 6); }
    } else {
      this.wait -= dt;
      this.body.rotation.x = Math.sin(t * 9 + this.heading) * 0.05 + 0.08; // picking at substrate
      if (this.wait < 0) {
        const nx = THREE.MathUtils.clamp(this.p.x + R(-1.2, 1.2), -HX + 0.4, HX - 0.4), nz = THREE.MathUtils.clamp(this.p.z + R(-0.8, 0.8), -HZ + 0.3, HZ - 0.3);
        const fo = foods.find(f => f.p.y < sandH(f.p.x, f.p.z) + 0.1);
        this.from = this.p.clone(); this.to = fo ? new THREE.Vector3(fo.p.x, topAt(fo.p.x, fo.p.z), fo.p.z) : new THREE.Vector3(nx, topAt(nx, nz), nz);
        this.heading = Math.atan2(this.to.x - this.p.x, this.to.z - this.p.z); this.hopT = 0;
        if (fo) foods.splice(foods.indexOf(fo), 1);
      }
    }
    this.g.position.copy(this.p); this.g.rotation.y += Math.atan2(Math.sin(this.heading - this.g.rotation.y), Math.cos(this.heading - this.g.rotation.y)) * 0.1;
    this.legs.forEach((l, i) => l.rotation.x = Math.sin(t * (this.to ? 25 : 6) + i) * 0.4);
  } });
}
addShrimp(-2.5, 0.9, 0xd8261c); addShrimp(-1.9, 1.3, 0xe23a1a); addShrimp(2.2, 1.2, 0xc01830); addShrimp(3.2, -0.3, 0xe05020);

// African dwarf frog: floats at surface with limbs spread, dives to sit on the driftwood, kicks back up
function makeFrog() {
  const g = new THREE.Group(), skin = lambert(0x6b6f4a, { roughness: 0.7 }), belly = lambert(0xb7ae88);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin); body.scale.set(0.08, 0.05, 0.11); g.add(body);
  const bel = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), belly); bel.scale.set(0.07, 0.035, 0.1); bel.position.y = -0.015; g.add(bel);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin); head.scale.set(0.065, 0.04, 0.06); head.position.set(0, 0.01, 0.1); g.add(head);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), new THREE.MeshStandardMaterial({ color: 0x151510, roughness: 0.05 })); e.position.set(sx * 0.035, 0.04, 0.12); g.add(e);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); hl.position.set(sx * 0.04, 0.05, 0.13); g.add(hl);
  }
  // spots
  for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), lambert(0x2e2f1c)); s.position.set(R(-0.06, 0.06), 0.04, R(-0.08, 0.08)); s.scale.y = 0.4; g.add(s); }
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.06, -0.005, -0.08); g.add(hip);
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.09, 4, 8), skin); th.rotation.z = Math.PI / 2; th.position.x = sx * 0.055; hip.add(th);
    const knee = new THREE.Group(); knee.position.x = sx * 0.11; hip.add(knee);
    const sh = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.1, 4, 8), skin); sh.rotation.x = Math.PI / 2; sh.position.z = -0.06; knee.add(sh);
    const ft = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8), new THREE.MeshStandardMaterial({ color: 0x55583a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })); ft.rotation.x = -Math.PI / 2; ft.position.z = -0.14; knee.add(ft);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.08, 4, 6), skin); arm.position.set(sx * 0.08, -0.01, 0.07); arm.rotation.set(0.6, 0, sx * 1.1); g.add(arm);
    legs.push({ hip, knee, sx, arm });
  }
  g.scale.setScalar(1.9); return { g, legs };
}
{
  const fr = makeFrog(); scene.add(fr.g);
  const perch = perches.length ? perches.reduce((a, b) => (b.y > a.y ? b : a)) : new THREE.Vector3(0, 1.5, -0.5);
  animals.push({ type: 'frog', name: 'Żabka karłowata', ...fr, p: new THREE.Vector3(1.6, WATER - 0.15, 0.9), state: 'float', timer: 8, target: null, kick: 0, perch, update(dt, t) {
    this.timer -= dt; const p = this.p;
    if (this.state === 'float') { // hang at surface, limbs spread, slow drift
      p.y = THREE.MathUtils.lerp(p.y, WATER - 0.13 + Math.sin(t * 0.8) * 0.01, 0.05); p.x += Math.sin(t * 0.13) * dt * 0.06; p.z += Math.cos(t * 0.11) * dt * 0.04;
      this.g.rotation.x = THREE.MathUtils.lerp(this.g.rotation.x, 0.5, 0.03);
      if (this.timer < 0) { this.state = 'dive'; this.target = this.perch.clone().add(new THREE.Vector3(0, 0.07, 0)); }
    } else if (this.state === 'dive' || this.state === 'rise') {
      const d = tmp.subVectors(this.target, p), L = d.length();
      this.kick += dt * 3.2; const push = Math.max(0, Math.sin(this.kick * Math.PI * 2)) * 0.9 + 0.12;
      p.addScaledVector(d.normalize(), Math.min(L, push * dt));
      this.g.rotation.y = Math.atan2(d.x, d.z); this.g.rotation.x = -Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) * 0.8;
      if (L < 0.03) { if (this.state === 'dive') { this.state = 'sit'; this.timer = R(7, 12); } else { this.state = 'float'; this.timer = R(8, 14); } }
    } else if (this.state === 'sit') {
      this.g.rotation.x = THREE.MathUtils.lerp(this.g.rotation.x, 0, 0.05);
      p.y = this.target.y + Math.sin(t * 2.5) * 0.004; // breathing
      if (this.timer < 0) { this.state = 'rise'; this.target = new THREE.Vector3(THREE.MathUtils.clamp(p.x + R(-1.5, 1.5), -HX + 0.6, HX - 0.6), WATER - 0.13, THREE.MathUtils.clamp(p.z + R(-0.5, 0.8), -HZ + 0.4, HZ - 0.4)); }
    }
    p.x = THREE.MathUtils.clamp(p.x, -HX + 0.3, HX - 0.3); p.z = THREE.MathUtils.clamp(p.z, -HZ + 0.3, HZ - 0.3);
    this.g.position.copy(p);
    const swim = this.state === 'dive' || this.state === 'rise', k = swim ? Math.sin(this.kick * Math.PI * 2) : 0;
    for (const l of this.legs) {
      l.hip.rotation.y = l.sx * (swim ? 0.2 + k * 0.6 : this.state === 'sit' ? 1.2 : 0.5);
      l.knee.rotation.y = l.sx * (swim ? -0.3 - k * 1.2 : this.state === 'sit' ? -2.4 : -0.3);
    }
  } });
}
// water mites / daphnia drifting in the column (tiny, jerky)
{
  const NM = 24, mm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshStandardMaterial({ color: 0xe8d8b0, emissive: 0x302818 }), NM);
  const st = []; for (let i = 0; i < NM; i++) st.push({ p: new THREE.Vector3(R(-HX + 0.5, HX - 0.5), R(1, WATER - 0.4), R(-HZ + 0.4, HZ - 0.4)), v: new THREE.Vector3(), j: 0 });
  mm.frustumCulled = false; scene.add(mm);
  animals.push({ type: 'daphnia', name: 'Rozwielitki', count: NM, g: mm, update(dt) {
    st.forEach((s, i) => { s.j -= dt; if (s.j < 0) { s.j = R(0.3, 1.2); s.v.set(R(-0.1, 0.1), R(0.08, 0.2), R(-0.1, 0.1)); } s.v.y -= dt * 0.25; s.v.multiplyScalar(0.97); s.p.addScaledVector(s.v, dt);
      s.p.y = THREE.MathUtils.clamp(s.p.y, 0.9, WATER - 0.3); s.p.x = THREE.MathUtils.clamp(s.p.x, -HX + 0.3, HX - 0.3); s.p.z = THREE.MathUtils.clamp(s.p.z, -HZ + 0.3, HZ - 0.3);
      m4.makeScale(1, 0.8, 1).setPosition(s.p); mm.setMatrixAt(i, m4); });
    mm.instanceMatrix.needsUpdate = true;
  } });
}

// glass reflection sheen on the front pane
{
  const sheenTex = canvasTex(256, (g2, s) => { const gr = g2.createLinearGradient(0, 0, s, s); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.42, 'rgba(255,255,255,0)'); gr.addColorStop(0.47, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.56, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, s, s); });
  sheenTex.wrapS = sheenTex.wrapT = THREE.ClampToEdgeWrapping;
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: sheenTex, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sh.position.set(0, H / 2, HZ + 0.02); sh.renderOrder = 11; scene.add(sh);
}

// ---------- camera shots + UI ----------
const PORTRAIT = () => innerWidth < innerHeight;
const SHOTS = [
  { n: 'front', label: 'Ujęcie: front', pos: [0, 2.3, 12.2], tgt: [0, 2.25, 0] },
  { n: 'bok', label: 'Ujęcie: z bliska', pos: [-3.4, 1.8, 5.6], tgt: [-1.4, 1.6, 0] },
  { n: 'góra', label: 'Ujęcie: z góry', pos: [3.4, 6.2, 9.4], tgt: [0, 1.4, 0] },
];
let shot = 0, camAnim = null;
function goShot(i) { shot = i; camAnim = { pos: new THREE.Vector3(...SHOTS[i].pos), tgt: new THREE.Vector3(...SHOTS[i].tgt), t: 0 }; document.getElementById('bShot').textContent = SHOTS[i].label; }
// frame the tank so it fills the viewport (cover height; in portrait the camera slowly pans along the tank)
function frameFront(aspect) {
  camera.fov = aspect < 1 ? 52 : 40;
  const visH = aspect < 1 ? 2.1 : THREE.MathUtils.clamp(6.8 / aspect, 3.8, 4.8);
  const d = HZ + (visH / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) - HZ * 0.25;
  SHOTS[0].pos = [0, 2.3, d]; SHOTS[0].tgt = [0, 2.2, 0];
  controls.maxDistance = Math.max(18, d + 3);
}
let night = false, lightMix = 0;
const bLight = document.getElementById('bLight');
bLight.onclick = () => { night = !night; bLight.setAttribute('aria-pressed', night); bLight.textContent = night ? 'Tryb dzienny' : 'Tryb nocny'; };
document.getElementById('bFeed').onclick = () => feed();
document.getElementById('bShot').onclick = () => goShot((shot + 1) % SHOTS.length);
let showNames = false; const labelsEl = document.getElementById('labels'); const bNames = document.getElementById('bNames');
const labelFish = []; const seen = new Set();
for (const f of fishes) { if (!seen.has(f.kind) || f.kind === 'angel' || f.kind === 'cory' && labelFish.filter(x => x.kind === 'cory').length < 2) { seen.add(f.kind); const el = document.createElement('div'); el.className = 'lbl'; el.textContent = f.sp.name; el.hidden = true; labelsEl.appendChild(el); labelFish.push({ f, el, kind: f.kind }); } }
bNames.onclick = () => { showNames = !showNames; bNames.setAttribute('aria-pressed', showNames); for (const l of labelFish) l.el.hidden = !showNames; };
const dlg = document.getElementById('aiDlg'); document.getElementById('bAi').onclick = () => dlg.showModal();


// ---------- mini-game: Karmienie ----------
{
  const G = { on: false, t: 0, score: 0, combo: 0, best: 0, last: -9, timer: null };
  const hud = document.getElementById('gHud'), res = document.getElementById('gRes');
  const $ = (id) => document.getElementById(id);
  const rec = () => +(localStorage.getItem('aqRecord') || 0);
  const pop = (txt, x, y) => { const e = document.createElement('div'); e.className = 'gpop'; e.textContent = txt; e.style.left = x + 'px'; e.style.top = y + 'px'; hud.appendChild(e); setTimeout(() => e.remove(), 900); };
  window.__onEat = (f) => {
    if (!G.on) return; const now = performance.now() / 1000;
    G.combo = now - G.last < 1.6 ? G.combo + 1 : 1; G.last = now; G.best = Math.max(G.best, G.combo);
    const pts = 10 * G.combo; G.score += pts; const sp = toScreen(f.pos); pop('+' + pts + (G.combo > 1 ? ' ×' + G.combo : ''), sp.x, sp.y);
  };
  const draw = () => { $('gScore').textContent = G.score; $('gTime').textContent = Math.ceil(G.t); $('gCombo').textContent = G.combo > 1 ? 'Combo ×' + G.combo : ''; };
  function start() { res.hidden = true; G.on = true; G.t = 60; G.score = 0; G.combo = 0; G.best = 0; hud.hidden = false; document.body.classList.add('game'); draw();
    clearInterval(G.timer); G.timer = setInterval(() => { G.t -= 0.25; if (G.combo && performance.now() / 1000 - G.last > 1.6) G.combo = 0; draw(); if (G.t <= 0) end(); }, 250); }
  function end() { clearInterval(G.timer); G.on = false; hud.hidden = true; const r = Math.max(rec(), G.score); const nr = G.score > rec() && G.score > 0; localStorage.setItem('aqRecord', r);
    $('rScore').textContent = G.score; $('rCombo').textContent = '×' + G.best; $('rRec').textContent = r + (nr ? ' — nowy rekord!' : ''); res.hidden = false; }
  function quit() { res.hidden = true; hud.hidden = true; G.on = false; clearInterval(G.timer); document.body.classList.remove('game'); }
  $('bGame').onclick = start; $('gAgain').onclick = start; $('gBack').onclick = quit; $('gStop').onclick = end;
  // tap into water = throw food at that x
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!G.on || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 12) return;
    const r = canvas.getBoundingClientRect(); const v = new THREE.Vector3(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
    const k = (0 - camera.position.z) / v.z; const x = camera.position.x + v.x * k;
    const before = foods.length; for (let i = 0; i < 8 && foods.length < NF; i++) foods.push({ p: new THREE.Vector3(THREE.MathUtils.clamp(x + R(-0.25, 0.25), -HX + 0.3, HX - 0.3), WATER - 0.01, R(-0.6, 0.6)), rot: rnd() * 6, ph: rnd() * 6, float: R(0.3, 1.2), age: 0 });
    if (foods.length > before) pop('•', e.clientX - r.left, e.clientY - r.top);
  });
  window.__game = { state: () => ({ on: G.on, time: G.t, score: G.score, combo: G.combo, best: G.best, record: rec() }), start, end };
}
// parallax
const ptr = { x: 0, y: 0 }, par = { x: 0, y: 0 };
addEventListener('pointermove', (e) => { ptr.x = e.clientX / innerWidth - 0.5; ptr.y = e.clientY / innerHeight - 0.5; }, { passive: true });

// ---------- post ----------
composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.55, 0.8); composer.addPass(bloom);
composer.addPass(new OutputPass());

let framed = false;
function onResize() {
  if (!renderer || !composer) return;
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h;
  frameFront(w / h); if (!framed) { framed = true; camera.position.set(...SHOTS[0].pos); controls.target.set(...SHOTS[0].tgt); } else if (shot === 0) goShot(0);
  camera.updateProjectionMatrix();
}
addEventListener('resize', onResize); onResize();

// ---------- loop ----------
const clock = new THREE.Clock(); const fpsEl = document.getElementById('fps'); if (DEBUG) fpsEl.hidden = false;
let frames = 0, fpsT = 0, elapsed = 0, fpsVal = 0; const lookT = new THREE.Vector3();
const bm = new THREE.Matrix4(), dayFog = new THREE.Color(0x0a2a2e), nightFog = new THREE.Color(0x020a14);
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05); elapsed += dt; const t = elapsed;
  plantU.uT.value = t;
  for (const f of fishes) { updateFish(f, dt, t); if (f.shadow) { const gy = sandH(f.g.position.x, f.g.position.z), hgt = f.g.position.y - gy; f.shadow.position.set(f.g.position.x, gy + 0.025, f.g.position.z); f.shadow.scale.setScalar(1 + hgt * 0.25); f.shadow.material.opacity = THREE.MathUtils.clamp(0.5 - hgt * 0.1, 0.08, 0.45); } }
  for (const a of animals) a.update(dt, t);
  // food
  for (const fo of foods) { fo.age += dt; if (fo.age > fo.float) { fo.p.y -= dt * 0.12; fo.p.x += Math.sin(t * 1.3 + fo.ph) * dt * 0.05; } fo.rot += dt; if (fo.p.y < sandH(fo.p.x, fo.p.z) + 0.02) fo.p.y = sandH(fo.p.x, fo.p.z) + 0.02; }
  for (let i = foods.length - 1; i >= 0; i--) if (foods[i].age > 40) foods.splice(i, 1);
  foodMesh.count = foods.length; foods.forEach((fo, i) => { bm.makeRotationFromEuler(new THREE.Euler(fo.rot, fo.rot * 0.7, 0)).setPosition(fo.p); foodMesh.setMatrixAt(i, bm); }); foodMesh.instanceMatrix.needsUpdate = true;
  // bubbles
  bState.forEach((b, i) => { b.y += dt * b.v; if (b.y > WATER) b.y = 0.35; const x = filterPos.x - 0.12 + Math.sin(t * 3 + b.ph + b.y * 4) * 0.03 * b.y, z = filterPos.z + 0.1 + Math.cos(t * 2.3 + b.ph) * 0.03 * b.y; bm.makeScale(b.s, b.s * 0.9, b.s).setPosition(x, b.y, z); bubbles.setMatrixAt(i, bm); });
  bubbles.instanceMatrix.needsUpdate = true;
  dust.rotation.y = Math.sin(t * 0.02) * 0.05; dust.position.y = Math.sin(t * 0.1) * 0.03;
  // water surface waves
  const sp = surfGeo.attributes.position; for (let i = 0; i < sp.count; i++) { const x = surfBase[i * 3], z = surfBase[i * 3 + 2]; sp.setY(i, Math.sin(x * 3 + t * 1.2) * 0.012 + Math.sin(z * 5 - t * 1.6 + x) * 0.008); } sp.needsUpdate = true;
  // caustics
  caus1.offset.set(t * 0.012, t * 0.007); caus2.offset.set(-t * 0.009, t * 0.011);
  // light mix
  lightMix = THREE.MathUtils.lerp(lightMix, night ? 1 : 0, 0.03);
  sun.intensity = 2.6 * (1 - lightMix) + 0.25 * lightMix; sun.color.setHSL(THREE.MathUtils.lerp(0.11, 0.6, lightMix), 0.4, 0.9);
  hemi.intensity = 1.1 - 0.8 * lightMix; fill.intensity = 6 + 4 * lightMix; fill.color.setHSL(THREE.MathUtils.lerp(0.52, 0.62, lightMix), 0.7, 0.55);
  scene.fog.color.copy(dayFog).lerp(nightFog, lightMix);
  causMats.forEach(m => m.opacity = 0.12 * (1 - lightMix * 0.8));
  lampStrip.material.color.setHSL(THREE.MathUtils.lerp(0.1, 0.62, lightMix), 0.6, THREE.MathUtils.lerp(0.95, 0.35, lightMix));
  bloom.strength = 0.4 + lightMix * 0.45;
  shafts.forEach(s => s.m.opacity = s.base * (0.7 + 0.3 * Math.sin(t * 0.5 + s.ph)) * (1 - lightMix * 0.85));
  // camera
  if (camAnim) { camAnim.t += dt; camera.position.lerp(camAnim.pos, 0.04); controls.target.lerp(camAnim.tgt, 0.04); if (camAnim.t > 3) camAnim = null; }
  par.x += (ptr.x - par.x) * 0.04; par.y += (ptr.y - par.y) * 0.04;
  controls.update();
  const pan = PORTRAIT() && shot === 0 ? Math.sin(t * 0.06) * (HX - 2.2) : 0;
  const off = new THREE.Vector3(pan + par.x * 0.35 + Math.sin(t * 0.09) * 0.1, -par.y * 0.2 + Math.sin(t * 0.13) * 0.05, 0);
  camera.position.add(off); lookT.copy(controls.target); lookT.x += pan; camera.lookAt(lookT);
  composer.render(dt);
  camera.position.sub(off);
  // labels
  if (showNames) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const l of labelFish) { tmp.copy(l.f.pos); tmp.y += l.f.sp.L * 0.9; tmp.project(camera); l.el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px,${(-tmp.y * 0.5 + 0.5) * h}px) translate(-50%,-100%)`; l.el.style.opacity = tmp.z < 1 ? 1 : 0; }
  }
  if (!revealed && elapsed > 0.3) forceReveal();
  frames++; fpsT += dt; if (fpsT > 0.5) { fpsVal = frames / fpsT; if (DEBUG) fpsEl.textContent = fpsVal.toFixed(0) + ' FPS'; frames = 0; fpsT = 0; }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
window.__aq = { fishes, feed, foods, animals };
// Stable debug/game API (contract for the mini-game layer) — see README.md
const scr = new THREE.Vector3();
function toScreen(v) { scr.copy(v).project(camera); const w = canvas.clientWidth, h = canvas.clientHeight; return { x: Math.round((scr.x * 0.5 + 0.5) * w), y: Math.round((-scr.y * 0.5 + 0.5) * h), visible: scr.z < 1 && Math.abs(scr.x) <= 1 && Math.abs(scr.y) <= 1 }; }
window.__aquarium = Object.freeze({
  version: 2,
  tank: { width: W, height: H, depth: D, water: WATER },
  fishCounts() { const o = {}; for (const f of fishes) o[f.kind] = (o[f.kind] || 0) + 1; return o; },
  fishTotal() { return fishes.length; },
  speciesNames() { const o = {}; for (const k in SPECIES) o[k] = SPECIES[k].name; return o; },
  animalCounts() { const o = {}; for (const a of animals) o[a.type] = (o[a.type] || 0) + (a.count || 1); return o; },
  animalTotal() { return animals.length; },
  fps() { return Math.round(fpsVal * 10) / 10; },
  fishScreen() { return fishes.map(f => ({ id: f.id, species: f.kind, name: f.sp.name, ...toScreen(f.pos) })); },
  animalScreen() { return animals.filter(a => a.type !== 'daphnia').map((a, i) => ({ id: i, type: a.type, name: a.name, ...toScreen(a.g.position) })); },
  foodCount() { return foods.length; },
  eatenCount() { return eaten; },
  feed(xWorld) { feed(xWorld); return foods.length; },
  night() { return night; },
  frogScreen() { const a = animals.find(x => x.type === 'frog'); return a ? toScreen(a.g.position) : null; },
  state() { return { fishCounts: this.fishCounts(), fishTotal: fishes.length, animalCounts: this.animalCounts(), fps: this.fps(), food: foods.length, eaten, night }; },
});

if (DEBUG) setTimeout(() => { const pre = document.createElement('pre'); pre.id = 'aqstate'; pre.hidden = true; pre.textContent = JSON.stringify({ ...window.__aquarium.state(), fishScreenSample: window.__aquarium.fishScreen().slice(0, 3), animals: window.__aquarium.animalScreen() }); document.body.appendChild(pre); }, 3500);
