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
setTimeout(forceReveal, 8000);

// ---------- tank dimensions ----------
const W = 6, H = 3.2, D = 2.6, WATER = 3.0, HX = W / 2, HZ = D / 2;

// ---------- noise ----------
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { return vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.25 + vnoise(x * 4.3, y * 4.3) * 0.125; }
function sandH(x, z) { return 0.22 + (-z + HZ) / D * 0.28 + (fbm(x * 0.9 + 3, z * 0.9 + 7) - 0.45) * 0.22; }
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
scene.fog = new THREE.FogExp2(0x0a2a2e, 0.03);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
camera.position.set(0, 1.7, 9);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.enablePan = false; controls.minDistance = 4; controls.maxDistance = 13;
controls.minPolarAngle = 0.9; controls.maxPolarAngle = 1.75;
controls.minAzimuthAngle = -1.1; controls.maxAzimuthAngle = 1.1;
controls.target.set(0, 1.55, 0);
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
}, 3);
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
const backTex = canvasTex(256, (g, s) => {
  const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#0e4a50'); gr.addColorStop(0.6, '#07262a'); gr.addColorStop(1, '#030d0e');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xbfe9ff, 0x2a2014, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3dc, 2.6); sun.position.set(0.6, 9, 1.5);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -3.5, right: 3.5, top: 2, bottom: -2, near: 3, far: 12 });
sun.shadow.bias = -0.0015; scene.add(sun);
const fill = new THREE.PointLight(0x39b7c9, 6, 7, 1.6); fill.position.set(-2, 2.2, 1.6); scene.add(fill);
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
  ? new THREE.MeshPhysicalMaterial({ color: 0xcfeff0, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false })
  : new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, thickness: 0.1, roughness: 0.05, ior: 1.5, metalness: 0, transparent: true, opacity: 1, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, specularIntensity: 1, attenuationColor: new THREE.Color(0xbfe8e0), attenuationDistance: 3 });
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
  t.repeat.set(2.6 + i * 0.7, 1.2 + i * 0.35);
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.22, color: 0xcff6ff, fog: false });
});
const causMeshes = causMats.map((m, i) => { const c = new THREE.Mesh(sandGeo, m); c.position.y = 0.006 + i * 0.003; c.renderOrder = 2; scene.add(c); return c; });

// ---------- rocks + driftwood ----------
const obstacles = [];
const rockMat = new THREE.MeshStandardMaterial({ map: rockTex, color: 0x8a8f8c, roughness: 0.9, metalness: 0 });
function rock(x, z, s, sy) {
  const g = new THREE.IcosahedronGeometry(1, 4); const p = g.attributes.position; const v = new THREE.Vector3();
  const o = rnd() * 100;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + (fbm(v.x * 1.6 + o, v.y * 1.6 + v.z * 1.3) - 0.45) * 0.7; v.multiplyScalar(n); if (v.y < -0.3) v.y = -0.3; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, rockMat); m.scale.set(s, s * sy, s * R(0.7, 1)); m.rotation.y = rnd() * 6;
  m.position.set(x, sandH(x, z) + s * sy * 0.15, z); m.castShadow = m.receiveShadow = true; scene.add(m);
  obstacles.push({ c: new THREE.Vector3(x, m.position.y + s * sy * 0.4, z), r: s * 1.05 });
}
rock(-1.9, -0.55, 0.55, 1.1); rock(-1.35, -0.15, 0.32, 0.8); rock(-2.4, 0.2, 0.25, 0.7);
rock(1.7, -0.7, 0.45, 1.3); rock(2.25, -0.2, 0.28, 0.9); rock(0.4, 0.55, 0.18, 0.7);
const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0x9a8070, roughness: 0.9, metalness: 0 });
function branch(pts, r) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, 24, r, 8, false); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (hash(i, 1) - 0.5) * r * 0.25, p.getY(i), p.getZ(i) + (hash(i, 2) - 0.5) * r * 0.25);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, woodMat); m.castShadow = m.receiveShadow = true; scene.add(m);
  for (let t = 0; t <= 1; t += 0.25) obstacles.push({ c: curve.getPoint(t), r: r + 0.12 });
}
branch([[0.9, 0.35, -0.4], [0.2, 0.8, -0.55], [-0.4, 1.5, -0.7], [-0.7, 2.2, -0.85]], 0.09);
branch([[0.2, 0.8, -0.55], [0.5, 1.4, -0.8], [0.95, 1.9, -0.95]], 0.05);
branch([[-0.1, 1.2, -0.62], [-0.6, 1.35, -0.3], [-1.0, 1.25, -0.1]], 0.04);
branch([[1.3, 0.3, -0.1], [0.6, 0.45, -0.35], [0.9, 0.35, -0.4]], 0.08);

// ---------- plants (instanced, vertex sway) ----------
const plantU = { uT: { value: 0 } };
function swayMat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, ...opts });
  m.onBeforeCompile = (s) => {
    s.uniforms.uT = plantU.uT;
    s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float hh = max(transformed.y, 0.0);
      float ph = ip.x * 1.7 + ip.z * 2.3;
      float sw = sin(uT * 0.9 + ph + hh * 1.2) * 0.6 + sin(uT * 1.7 + ph * 1.3) * 0.3;
      transformed.x += sw * 0.09 * hh * hh;
      transformed.z += cos(uT * 0.7 + ph) * 0.05 * hh * hh;`);
  };
  return m;
}
function placeInstances(geo, mat, n, filter, scaleFn) {
  const im = new THREE.InstancedMesh(geo, mat, n); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0, guard = 0;
  while (k < n && guard++ < n * 50) {
    const x = R(-HX + 0.15, HX - 0.15), z = R(-HZ + 0.1, HZ - 0.15);
    if (!filter(x, z)) continue;
    p.set(x, sandH(x, z) - 0.02, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
    const sc = scaleFn(); s.set(sc[0], sc[1], sc[0]); m4.compose(p, q, s); im.setMatrixAt(k, m4);
    im.setColorAt(k, new THREE.Color().setHSL(R(0.23, 0.33), R(0.45, 0.7), R(0.18, 0.34))); k++;
  }
  im.count = k; im.frustumCulled = false; scene.add(im); return im;
}
// vallisneria ribbons at back
{
  const g = new THREE.PlaneGeometry(0.05, 1, 1, 10); g.translate(0, 0.5, 0);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * 0.6)); }
  placeInstances(g, swayMat(0xffffff, { transparent: false }), MOBILE ? 90 : 160, (x, z) => z < -0.45 && Math.abs(x + 1.9) > 0.5 || (z < 0 && Math.abs(x) > 2.3), () => [R(0.8, 1.4), R(1.4, 2.5)]);
}
// grass clumps (blades)
{
  const g = new THREE.PlaneGeometry(0.02, 0.3, 1, 4); g.translate(0, 0.15, 0);
  const clumps = [[-0.5, 0.7], [0.9, 0.6], [-2.5, 0.8], [2.4, 0.7], [1.2, 0.2], [-1.0, 0.45], [2.0, 0.95], [-0.2, 0.95]];
  placeInstances(g, swayMat(0xffffff), MOBILE ? 500 : 900, (x, z) => clumps.some(c => Math.hypot(x - c[0], z - c[1]) < 0.35), () => [R(0.8, 1.2), R(0.5, 1.4)]);
}
// bushy plants: stems with leaves (leaf instances around column)
{
  const leaf = new THREE.PlaneGeometry(0.09, 0.035); leaf.translate(0.045, 0, 0);
  const n = MOBILE ? 700 : 1300; const im = new THREE.InstancedMesh(leaf, swayMat(0xffffff), n);
  const bushes = [[2.55, -0.9, 1.6], [-2.6, -0.95, 1.3], [0.2, -0.95, 1.1], [1.1, -0.2, 0.7], [-2.0, 0.55, 0.7]];
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let k = 0;
  for (const [bx, bz, h] of bushes) {
    const hue = k % 2 ? R(0.02, 0.06) : R(0.26, 0.32); const red = bx === 1.1;
    for (let st = 0; st < 7; st++) {
      const sx = bx + R(-0.18, 0.18), sz = bz + R(-0.12, 0.12), sh = h * R(0.6, 1), base = sandH(sx, sz);
      for (let y = 0; y < sh && k < n; y += 0.045) {
        for (let a = 0; a < 2 && k < n; a++) {
          p.set(sx, base + y, sz); e.set(R(-0.3, 0.3), rnd() * 6.28, R(-0.5, 0.2)); q.setFromEuler(e);
          const sc = 1.3 - (y / sh) * 0.6; s.set(sc, sc, sc); m4.compose(p, q, s); im.setMatrixAt(k, m4);
          im.setColorAt(k, red ? new THREE.Color().setHSL(R(0.97, 1.02) % 1, 0.55, R(0.22, 0.32)) : new THREE.Color().setHSL(R(0.24, 0.32), 0.6, R(0.2, 0.36))); k++;
        }
      }
    }
    void hue;
  }
  im.count = k; im.frustumCulled = false; scene.add(im);
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
for (let i = 0; i < 7; i++) {
  const m = new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xd9fbff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const w = R(0.3, 0.8), mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, WATER * 1.05), m);
  mesh.position.set(R(-2.4, 2.4), WATER / 2 + 0.05, R(-0.8, 0.6)); mesh.rotation.z = R(-0.28, -0.12); mesh.rotation.y = R(-0.3, 0.3);
  mesh.renderOrder = 5; scene.add(mesh); shafts.push({ m, base: R(0.035, 0.07), ph: rnd() * 6 });
}

// ---------- bubbles + dust ----------
const filterPos = new THREE.Vector3(2.7, 0.3, -1.05);
const filt = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 16), new THREE.MeshStandardMaterial({ color: 0x1a1d1e, roughness: 0.5, metalness: 0.3 }));
filt.position.set(2.7, 1.55, -1.12); scene.add(filt);
const NB = 90;
const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, metalness: 0, transparent: true, opacity: 0.45, clearcoat: 1, emissive: 0x9fe8ff, emissiveIntensity: 0.25, depthWrite: false }), NB);
const bState = []; for (let i = 0; i < NB; i++) bState.push({ y: R(0.3, WATER), s: R(0.008, 0.03), ph: rnd() * 6, v: R(0.35, 0.7) });
bubbles.frustumCulled = false; scene.add(bubbles);
const ND = MOBILE ? 400 : 900; const dg = new THREE.BufferGeometry(); const dp = new Float32Array(ND * 3);
for (let i = 0; i < ND; i++) { dp[i * 3] = R(-HX, HX); dp[i * 3 + 1] = R(0.3, WATER); dp[i * 3 + 2] = R(-HZ, HZ); }
dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xcfe9e0, size: 0.012, transparent: true, opacity: 0.5, depthWrite: false }));
scene.add(dust);

// ---------- fish ----------
function waveMaterial(base, u) {
  base.onBeforeCompile = (s) => {
    s.uniforms.uT = u.uT; s.uniforms.uA = u.uA; s.uniforms.uL = u.uL; s.uniforms.uF = u.uF;
    s.vertexShader = 'uniform float uT, uA, uL, uF;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float tt = clamp((uL * 0.3 - transformed.z) / uL, 0.0, 1.6);
      transformed.x += sin(uT - transformed.z * 5.5 / uL) * uA * tt * tt;
      transformed.x += sin(uT * 0.45 + transformed.y * 7.0 + transformed.z * 4.0) * uF * abs(transformed.y);`);
  };
  return base;
}
function finGeo(pts, x = 0) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  const g = new THREE.ShapeGeometry(sh, 6); g.rotateY(-Math.PI / 2); if (x) g.translate(x, 0, 0); return g;
}
function bodyGeo(L, Hh, Wd, colorFn, taper = 0.65) {
  const g = new THREE.SphereGeometry(1, 28, 18); g.rotateX(Math.PI / 2);
  const p = g.attributes.position; const cols = new Float32Array(p.count * 3); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = z < 0 ? 1 - taper * Math.pow(-z, 1.4) : 1 - 0.18 * z * z;
    x *= k; y *= k; y += z > 0 ? -0.08 * z * z : 0;
    colorFn(c, x, y, z); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    p.setXYZ(i, x * Wd / 2, y * Hh / 2, z * L / 2);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals(); return g;
}
const eyeGeo = new THREE.SphereGeometry(1, 12, 8), eyeMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.2 });
const ringMat = new THREE.MeshStandardMaterial({ color: 0xd8d0b0, roughness: 0.3, metalness: 0.6 });

const SPECIES = {
  neon: { name: 'Neon Innesa', L: 0.2, build(u) {
    const body = bodyGeo(0.2, 0.05, 0.035, (c, x, y, z) => {
      if (Math.abs(y - 0.15) < 0.2) c.setRGB(0.1, 0.75, 1.0);
      else if (y < 0.05 && z < 0.3) c.setRGB(0.9, 0.08, 0.1);
      else if (y < 0) c.setRGB(0.85, 0.85, 0.82); else c.setRGB(0.35, 0.33, 0.25);
    });
    return { body, bm: { emissive: 0x0a3a50, emissiveIntensity: 0.6 }, fins: [
      [finGeo([[-0.09, 0], [-0.13, 0.03], [-0.12, 0], [-0.13, -0.03]]), 0xd8d8d8, 0.4],
      [finGeo([[0.0, 0.02], [-0.03, 0.045], [-0.04, 0.02]]), 0xdddddd, 0.35]], eye: [0.012, 0.075, 0.01] };
  } },
  angel: { name: 'Skalar', L: 0.42, build(u) {
    const body = bodyGeo(0.42, 0.34, 0.07, (c, x, y, z) => {
      const bar = Math.sin(z * 9.5 + 1.2) > 0.72 ? 0.25 : 1; c.setRGB(0.82 * bar, 0.8 * bar, 0.72 * bar);
      if (y > 0.6) c.multiplyScalar(0.8);
    }, 0.55);
    return { body, bm: { metalness: 0.45, roughness: 0.28 }, fins: [
      [finGeo([[0.02, 0.14], [-0.2, 0.5], [-0.14, 0.12]]), 0xd9d2bd, 0.55],
      [finGeo([[0.02, -0.14], [-0.2, -0.52], [-0.14, -0.12]]), 0xd9d2bd, 0.55],
      [finGeo([[-0.19, 0], [-0.33, 0.14], [-0.3, 0], [-0.33, -0.14]]), 0xe8e2cf, 0.4],
      [finGeo([[0.1, -0.05], [0.02, -0.32], [0.05, -0.05]], 0.02), 0xf2eadb, 0.5]], eye: [0.02, 0.15, 0.04] };
  } },
  guppy: { name: 'Gupik', L: 0.18, build(u) {
    const body = bodyGeo(0.18, 0.05, 0.035, (c, x, y, z) => { if (z < -0.2) c.setRGB(0.95, 0.45, 0.1); else c.setRGB(0.7, 0.72, 0.68); if (y > 0.3 && z < 0.2) c.setRGB(0.2, 0.55, 0.9); });
    const hue = rnd();
    const tailC = new THREE.Color().setHSL(hue, 0.85, 0.55).getHex();
    return { body, bm: { metalness: 0.3 }, fins: [
      [finGeo([[-0.08, 0], [-0.22, 0.09], [-0.25, 0.0], [-0.22, -0.09]]), tailC, 0.8],
      [finGeo([[-0.01, 0.022], [-0.07, 0.07], [-0.08, 0.02]]), tailC, 0.7]], eye: [0.011, 0.065, 0.008] };
  } },
  cory: { name: 'Kirysek', L: 0.26, build(u) {
    const body = bodyGeo(0.26, 0.1, 0.085, (c, x, y, z) => { const sp = hash(Math.round(x * 12), Math.round(z * 12 + y * 9)) > 0.6 ? 0.45 : 1; c.setRGB(0.62 * sp, 0.5 * sp, 0.32 * sp); if (y < -0.3) c.setRGB(0.8, 0.72, 0.6); }, 0.55);
    return { body, bm: { metalness: 0.35, roughness: 0.35 }, fins: [
      [finGeo([[0.03, 0.04], [-0.02, 0.12], [-0.04, 0.045]]), 0xb8a07a, 0.7],
      [finGeo([[-0.12, 0], [-0.19, 0.06], [-0.17, 0], [-0.19, -0.06]]), 0xb8a07a, 0.55]], eye: [0.014, 0.1, 0.025] };
  } },
  betta: { name: 'Bojownik', L: 0.32, build(u) {
    const body = bodyGeo(0.32, 0.1, 0.07, (c, x, y, z) => c.setRGB(0.55, 0.05, 0.12 + (y > 0 ? 0.15 : 0)));
    return { body, bm: { metalness: 0.4, roughness: 0.25, emissive: 0x200010 }, fins: [
      [finGeo([[-0.12, 0], [-0.3, 0.22], [-0.52, 0.18], [-0.56, 0], [-0.52, -0.2], [-0.3, -0.24]]), 0xa0102a, 0.72],
      [finGeo([[0.04, 0.04], [-0.1, 0.24], [-0.26, 0.2], [-0.14, 0.04]]), 0x8a0c40, 0.7],
      [finGeo([[0.06, -0.04], [-0.08, -0.3], [-0.26, -0.28], [-0.14, -0.04]]), 0x8a0c40, 0.7]], eye: [0.015, 0.11, 0.02], flutter: 0.08 };
  } },
};

const fishes = [];
function spawn(kind, n) {
  const sp = SPECIES[kind];
  for (let i = 0; i < n; i++) {
    const u = { uT: { value: rnd() * 10 }, uA: { value: sp.L * 0.12 }, uL: { value: sp.L }, uF: { value: 0 } };
    const def = sp.build(u); u.uF.value = def.flutter || 0.01;
    const g = new THREE.Group();
    const scale = R(0.88, 1.12) * (kind === 'neon' ? 1.6 : 1.3);
    const bmat = waveMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2, ...def.bm }), u);
    const body = new THREE.Mesh(def.body, bmat); body.castShadow = !MOBILE && kind !== 'neon'; g.add(body);
    for (const [fg, col, op] of def.fins) {
      const fm = waveMaterial(new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, roughness: 0.4 }), u);
      const f = new THREE.Mesh(fg, fm); f.renderOrder = 3; g.add(f);
    }
    const [er, ez, ey] = def.eye;
    for (const sx of [-1, 1]) {
      const bw = def.body.boundingBox || (def.body.computeBoundingBox(), def.body.boundingBox);
      const ring = new THREE.Mesh(eyeGeo, ringMat); ring.scale.setScalar(er); ring.position.set(sx * bw.max.x * 0.62, ey, ez); g.add(ring);
      const e = new THREE.Mesh(eyeGeo, eyeMat); e.scale.setScalar(er * 0.7); e.position.set(sx * (bw.max.x * 0.62 + er * 0.4), ey, ez + er * 0.2); g.add(e);
    }
    g.scale.setScalar(scale);
    const pos = kind === 'cory' ? new THREE.Vector3(R(-2, 2), 0, R(-0.3, 0.9)) : new THREE.Vector3(R(-2.2, 2.2), R(0.9, 2.5), R(-0.6, 0.8));
    if (kind === 'cory') pos.y = sandH(pos.x, pos.z) + 0.08;
    if (kind === 'neon') pos.set(R(-1.2, 0.2), R(1.3, 1.9), R(-0.2, 0.5));
    g.position.copy(pos); scene.add(g);
    const dir = new THREE.Vector3(R(-1, 1), 0, R(-0.3, 0.3)).normalize();
    fishes.push({ kind, sp, g, u, pos, vel: dir.multiplyScalar(0.2), target: null, speed: { neon: 0.55, angel: 0.22, guppy: 0.4, cory: 0.16, betta: 0.16 }[kind], wp: null, wpT: 0, rest: 0 });
  }
}
seed = 1234;
spawn('neon', MOBILE ? 26 : 38); spawn('angel', 3); spawn('guppy', 7); spawn('cory', 5); spawn('betta', 1);

// ---------- food ----------
const NF = 60; const foods = [];
const foodMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.03, 0.022), new THREE.MeshStandardMaterial({ color: 0xc86a2a, side: THREE.DoubleSide, roughness: 0.8 }), NF);
foodMesh.count = 0; foodMesh.frustumCulled = false; scene.add(foodMesh);
function feed() {
  const cx = R(-1.8, 1.8);
  for (let i = 0; i < 26 && foods.length < NF; i++) foods.push({ p: new THREE.Vector3(cx + R(-0.5, 0.5), WATER - 0.01, R(-0.6, 0.6)), rot: rnd() * 6, ph: rnd() * 6, float: R(0.5, 2.5), age: 0 });
}

// ---------- behaviour ----------
const tmp = new THREE.Vector3(), steer = new THREE.Vector3(), m4 = new THREE.Matrix4(), qTarget = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const BOUND = { x: HX - 0.35, z: HZ - 0.25, y0: 0.55, y1: WATER - 0.2 };
function updateFish(f, dt, t) {
  steer.set(0, 0, 0);
  const p = f.pos;
  let speed = f.speed;
  // food attraction
  let food = null, fd = 1e9;
  for (const fo of foods) { const d = fo.p.distanceTo(p); if (d < fd && d < 3.5) { fd = d; food = fo; } }
  if (food && !(f.kind === 'cory' && food.p.y > 0.9)) {
    tmp.subVectors(food.p, p).normalize().multiplyScalar(2.2); steer.add(tmp); speed *= 1.7;
    if (fd < 0.07 + f.sp.L * 0.25) { foods.splice(foods.indexOf(food), 1); f.u.uA.value = f.sp.L * 0.2; }
  } else if (f.kind === 'neon') {
    // boids
    const sep = new THREE.Vector3(), ali = new THREE.Vector3(), coh = new THREE.Vector3(); let n = 0;
    for (const o of fishes) {
      if (o === f || o.kind !== 'neon') continue; const d = o.pos.distanceTo(p);
      if (d < 0.7) { ali.add(o.vel); coh.add(o.pos); n++; if (d < 0.13) sep.add(tmp.subVectors(p, o.pos).divideScalar(d * d + 1e-4)); }
    }
    if (n) { ali.divideScalar(n).sub(f.vel).multiplyScalar(1.4); coh.divideScalar(n).sub(p).multiplyScalar(1.0); steer.add(ali).add(coh); }
    steer.add(sep.multiplyScalar(0.02));
    // school wander target
    const wx = Math.sin(t * 0.11) * 1.8, wy = 1.55 + Math.sin(t * 0.17) * 0.4, wz = Math.sin(t * 0.07 + 1) * 0.4;
    steer.add(tmp.set(wx - p.x, wy - p.y, wz - p.z).multiplyScalar(0.18));
  } else {
    // patrol waypoints
    f.wpT -= dt;
    if (!f.wp || f.wpT < 0 || f.wp.distanceTo(p) < 0.3) {
      f.wpT = R(5, 12);
      const x = R(-BOUND.x + 0.3, BOUND.x - 0.3), z = R(-0.8, 0.8);
      const y = f.kind === 'cory' ? sandH(x, z) + 0.08 : f.kind === 'guppy' ? R(1.6, 2.6) : R(1.0, 2.3);
      f.wp = new THREE.Vector3(x, y, z);
    }
    steer.add(tmp.subVectors(f.wp, p).normalize().multiplyScalar(0.8));
    if (f.kind === 'cory') { f.rest -= dt; if (f.rest < -R(4, 8)) f.rest = R(1.5, 3); if (f.rest > 0) speed *= 0.15; }
  }
  // walls
  const m = 0.45, k = 3.0;
  if (p.x > BOUND.x - m) steer.x -= k * (p.x - BOUND.x + m); if (p.x < -BOUND.x + m) steer.x += k * (-BOUND.x + m - p.x);
  if (p.z > BOUND.z - m) steer.z -= k * (p.z - BOUND.z + m); if (p.z < -BOUND.z + m) steer.z += k * (-BOUND.z + m - p.z);
  const floorY = sandH(p.x, p.z) + (f.kind === 'cory' ? 0.06 : 0.3);
  if (f.kind !== 'cory' && p.y < floorY + 0.25) steer.y += k * (floorY + 0.25 - p.y);
  if (p.y > BOUND.y1 - 0.2) steer.y -= k * (p.y - BOUND.y1 + 0.2);
  for (const o of obstacles) { const d = p.distanceTo(o.c) - o.r; if (d < 0.3) steer.add(tmp.subVectors(p, o.c).normalize().multiplyScalar((0.3 - d) * 6)); }
  // integrate
  f.vel.addScaledVector(steer, dt);
  if (f.kind !== 'cory') f.vel.y *= 0.96;
  const sp = f.vel.length(); const want = speed * (0.85 + 0.15 * Math.sin(t * 0.8 + f.u.uL.value * 50));
  if (sp > 1e-4) f.vel.multiplyScalar(THREE.MathUtils.lerp(sp, want, 0.04) / sp);
  const hl = Math.hypot(f.vel.x, f.vel.z); if (Math.abs(f.vel.y) > hl * 0.5) f.vel.y = Math.sign(f.vel.y) * hl * 0.5;
  p.addScaledVector(f.vel, dt);
  p.x = THREE.MathUtils.clamp(p.x, -HX + 0.12, HX - 0.12); p.z = THREE.MathUtils.clamp(p.z, -HZ + 0.1, HZ - 0.1);
  p.y = THREE.MathUtils.clamp(p.y, sandH(p.x, p.z) + 0.05, WATER - 0.06);
  if (f.kind === 'cory') p.y = THREE.MathUtils.lerp(p.y, sandH(p.x, p.z) + 0.07, 0.1);
  f.g.position.copy(p);
  if (hl + Math.abs(f.vel.y) > 1e-3) {
    m4.lookAt(tmp.set(0, 0, 0), tmp.clone().copy(f.vel).negate(), UP); qTarget.setFromRotationMatrix(m4);
    f.g.quaternion.slerp(qTarget, 1 - Math.pow(0.02, dt));
  }
  // tail wave rate follows speed
  const cur = f.vel.length();
  f.u.uT.value += dt * (4 + cur / f.sp.L * 5.5);
  f.u.uA.value = THREE.MathUtils.lerp(f.u.uA.value, f.sp.L * (0.07 + Math.min(cur / f.speed, 2) * 0.06), 0.05);
}

// ---------- camera shots + UI ----------
const SHOTS = [
  { n: 'front', label: 'Ujęcie: front', pos: [0, 1.7, 9], tgt: [0, 1.55, 0] },
  { n: 'bok', label: 'Ujęcie: z bliska', pos: [-2.6, 1.3, 4.6], tgt: [-0.8, 1.2, 0] },
  { n: 'góra', label: 'Ujęcie: z góry', pos: [2.4, 4.2, 7.2], tgt: [0, 1.0, 0] },
];
let shot = 0, camAnim = null;
function goShot(i) { shot = i; camAnim = { pos: new THREE.Vector3(...SHOTS[i].pos), tgt: new THREE.Vector3(...SHOTS[i].tgt), t: 0 }; document.getElementById('bShot').textContent = SHOTS[i].label; }
if (MOBILE && innerWidth < innerHeight) { SHOTS[0].pos = [0, 1.9, 11.5]; camera.position.set(0, 1.9, 11.5); camera.fov = 55; controls.maxDistance = 16; }
let night = false, lightMix = 0;
const bLight = document.getElementById('bLight');
bLight.onclick = () => { night = !night; bLight.setAttribute('aria-pressed', night); bLight.textContent = night ? 'Tryb dzienny' : 'Tryb nocny'; };
document.getElementById('bFeed').onclick = feed;
document.getElementById('bShot').onclick = () => goShot((shot + 1) % SHOTS.length);
let showNames = false; const labelsEl = document.getElementById('labels'); const bNames = document.getElementById('bNames');
const labelFish = []; const seen = new Set();
for (const f of fishes) { if (!seen.has(f.kind) || f.kind === 'angel' || f.kind === 'cory' && labelFish.filter(x => x.kind === 'cory').length < 2) { seen.add(f.kind); const el = document.createElement('div'); el.className = 'lbl'; el.textContent = f.sp.name; el.hidden = true; labelsEl.appendChild(el); labelFish.push({ f, el, kind: f.kind }); } }
bNames.onclick = () => { showNames = !showNames; bNames.setAttribute('aria-pressed', showNames); for (const l of labelFish) l.el.hidden = !showNames; };
const dlg = document.getElementById('aiDlg'); document.getElementById('bAi').onclick = () => dlg.showModal();

// parallax
const ptr = { x: 0, y: 0 }, par = { x: 0, y: 0 };
addEventListener('pointermove', (e) => { ptr.x = e.clientX / innerWidth - 0.5; ptr.y = e.clientY / innerHeight - 0.5; }, { passive: true });

// ---------- post ----------
composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.6, 0.82); composer.addPass(bloom);
composer.addPass(new OutputPass());

function onResize() {
  if (!renderer || !composer) return;
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', onResize); onResize();

// ---------- loop ----------
const clock = new THREE.Clock(); const fpsEl = document.getElementById('fps'); if (DEBUG) fpsEl.hidden = false;
let frames = 0, fpsT = 0, elapsed = 0;
const bm = new THREE.Matrix4(), dayFog = new THREE.Color(0x0a2a2e), nightFog = new THREE.Color(0x020a14);
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05); elapsed += dt; const t = elapsed;
  plantU.uT.value = t;
  for (const f of fishes) updateFish(f, dt, t);
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
  causMats.forEach(m => m.opacity = 0.22 * (1 - lightMix * 0.8));
  lampStrip.material.color.setHSL(THREE.MathUtils.lerp(0.1, 0.62, lightMix), 0.6, THREE.MathUtils.lerp(0.95, 0.35, lightMix));
  bloom.strength = 0.35 + lightMix * 0.45;
  shafts.forEach(s => s.m.opacity = s.base * (0.7 + 0.3 * Math.sin(t * 0.5 + s.ph)) * (1 - lightMix * 0.85));
  // camera
  if (camAnim) { camAnim.t += dt; camera.position.lerp(camAnim.pos, 0.04); controls.target.lerp(camAnim.tgt, 0.04); if (camAnim.t > 3) camAnim = null; }
  par.x += (ptr.x - par.x) * 0.04; par.y += (ptr.y - par.y) * 0.04;
  controls.update();
  const off = new THREE.Vector3(par.x * 0.35 + Math.sin(t * 0.09) * 0.1, -par.y * 0.2 + Math.sin(t * 0.13) * 0.05, 0);
  camera.position.add(off); camera.lookAt(controls.target);
  composer.render(dt);
  camera.position.sub(off);
  // labels
  if (showNames) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const l of labelFish) { tmp.copy(l.f.pos); tmp.y += l.f.sp.L * 0.9; tmp.project(camera); l.el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px,${(-tmp.y * 0.5 + 0.5) * h}px) translate(-50%,-100%)`; l.el.style.opacity = tmp.z < 1 ? 1 : 0; }
  }
  if (!revealed && elapsed > 0.3) forceReveal();
  if (DEBUG) { frames++; fpsT += dt; if (fpsT > 0.5) { fpsEl.textContent = (frames / fpsT).toFixed(0) + ' FPS'; frames = 0; fpsT = 0; } }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
window.__aq = { fishes, feed, foods };
