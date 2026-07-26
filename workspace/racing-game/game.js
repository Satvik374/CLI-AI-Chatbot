// =========================================================
//   HORIZON DRIVE — 3D arcade racing game
//   Pure Three.js, all geometry/materials authored in code.
// =========================================================
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// =========================================================
//  RENDERER + SCENE
// =========================================================
const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfd4e8, 200, 900);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 2000);
camera.position.set(0, 8, 18);

// =========================================================
//  SKY + LIGHTING
// =========================================================
const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);
const sun = new THREE.Vector3();
const skyU = sky.material.uniforms;
skyU.turbidity.value = 2;
skyU.rayleigh.value = 0.4;
skyU.mieCoefficient.value = 0.0008;
skyU.mieDirectionalG.value = 0.5;
const phi = THREE.MathUtils.degToRad(90 - 25); // sun elevation
const theta = THREE.MathUtils.degToRad(140);
sun.setFromSphericalCoords(1, phi, theta);
skyU.sunPosition.value.copy(sun);

const hemi = new THREE.HemisphereLight(0xa8d0ff, 0x4a3a2a, 0.6);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xfff2d9, 2.2);
dir.position.copy(sun).multiplyScalar(200);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
const sCam = dir.shadow.camera;
sCam.near = 1; sCam.far = 600;
sCam.left = -120; sCam.right = 120; sCam.top = 120; sCam.bottom = -120;
dir.shadow.bias = -0.0005;
scene.add(dir);
scene.add(dir.target);

// Ambient fill
scene.add(new THREE.AmbientLight(0x404858, 0.4));

// =========================================================
//  POST-PROCESSING (bloom)
// =========================================================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.7, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// =========================================================
//  PROCEDURAL TEXTURES (canvas-based)
// =========================================================
function makeCanvas(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

const grassTex = makeCanvas(512, (g, s) => {
  // base
  g.fillStyle = "#3f8a3a";
  g.fillRect(0, 0, s, s);
  // varied tufts
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const v = 60 + Math.random() * 50;
    const r = 30 + Math.random() * 60;
    const b = 30 + Math.random() * 50;
    g.fillStyle = `rgb(${r},${v},${b})`;
    g.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // soft patches
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const rad = 30 + Math.random() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(120,160,80,0.25)`);
    grd.addColorStop(1, `rgba(120,160,80,0)`);
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
});
grassTex.repeat.set(80, 80);

const asphaltTex = makeCanvas(512, (g, s) => {
  g.fillStyle = "#1f1f24";
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 8000; i++) {
    const v = 30 + Math.random() * 40;
    g.fillStyle = `rgb(${v},${v},${v + Math.random() * 8})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1, 1);
  }
  // subtle cracks
  g.strokeStyle = "rgba(0,0,0,0.4)";
  g.lineWidth = 1;
  for (let i = 0; i < 30; i++) {
    g.beginPath();
    g.moveTo(Math.random() * s, Math.random() * s);
    for (let k = 0; k < 4; k++) g.lineTo(Math.random() * s, Math.random() * s);
    g.stroke();
  }
});
asphaltTex.repeat.set(2, 2);

const sandTex = makeCanvas(256, (g, s) => {
  g.fillStyle = "#d6c089";
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 3000; i++) {
    const v = 180 + Math.random() * 50;
    g.fillStyle = `rgb(${v},${v - 20},${v - 60})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1, 1);
  }
});

// =========================================================
//  TERRAIN — gentle rolling hills
// =========================================================
const TERRAIN_SIZE = 2000;
const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 200, 200);
terrainGeo.rotateX(-Math.PI / 2);
const tPos = terrainGeo.attributes.position;
function terrainHeight(x, z) {
  // Keep area near origin (track) flat
  const distFromCenter = Math.sqrt(x * x + z * z);
  const flatRadius = 220;
  const fade = Math.max(0, Math.min(1, (distFromCenter - flatRadius) / 200));
  const h =
    Math.sin(x * 0.008) * 8 +
    Math.cos(z * 0.011) * 6 +
    Math.sin((x + z) * 0.004) * 12;
  return h * fade;
}
for (let i = 0; i < tPos.count; i++) {
  const x = tPos.getX(i), z = tPos.getZ(i);
  tPos.setY(i, terrainHeight(x, z));
}
terrainGeo.computeVertexNormals();
const terrainMat = new THREE.MeshStandardMaterial({
  map: grassTex,
  roughness: 0.95,
  metalness: 0,
});
const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.receiveShadow = true;
scene.add(terrain);

// =========================================================
//  TRACK — closed loop made of segments (Catmull-Rom)
// =========================================================
const trackPoints = [
  new THREE.Vector3( 0,    0.05,  100),
  new THREE.Vector3( 80,   0.05,  90),
  new THREE.Vector3( 130,  0.05,  40),
  new THREE.Vector3( 140,  0.05, -30),
  new THREE.Vector3( 100,  0.05, -90),
  new THREE.Vector3( 30,   0.05, -120),
  new THREE.Vector3(-50,   0.05, -110),
  new THREE.Vector3(-120,  0.05, -60),
  new THREE.Vector3(-150,  0.05,  20),
  new THREE.Vector3(-110,  0.05,  90),
  new THREE.Vector3(-40,   0.05,  120),
];
const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true, "catmullrom", 0.5);
const TRACK_WIDTH = 14;

// Build track ribbon mesh
function buildTrack(curve, width, segments = 600) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const left = p.clone().addScaledVector(side, -width / 2);
    const right = p.clone().addScaledVector(side, width / 2);
    positions.push(left.x, left.y, left.z);
    positions.push(right.x, right.y, right.z);
    uvs.push(0, t * segments * 0.5);
    uvs.push(1, t * segments * 0.5);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, b);
    indices.push(b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const trackGeo = buildTrack(trackCurve, TRACK_WIDTH);
const trackMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.85, metalness: 0.05 });
const trackMesh = new THREE.Mesh(trackGeo, trackMat);
trackMesh.receiveShadow = true;
scene.add(trackMesh);

// Lane line (white dashes)
const laneGeo = buildTrack(trackCurve, 0.4, 600);
const laneCanvas = makeCanvas(64, (g, s) => {
  g.fillStyle = "rgba(0,0,0,0)"; g.clearRect(0, 0, s, s);
  g.fillStyle = "#fff";
  for (let y = 0; y < s; y += 16) g.fillRect(0, y, s, 8);
});
laneCanvas.repeat.set(1, 1);
const laneMat = new THREE.MeshBasicMaterial({ map: laneCanvas, transparent: true });
const laneMesh = new THREE.Mesh(laneGeo, laneMat);
laneMesh.position.y = 0.06;
scene.add(laneMesh);

// Curbs (red/white) on edges
function buildCurb(curve, width, offset, segments = 600) {
  const positions = [], uvs = [], indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const inner = p.clone().addScaledVector(side, offset);
    const outer = p.clone().addScaledVector(side, offset + width);
    positions.push(inner.x, inner.y + 0.02, inner.z);
    positions.push(outer.x, outer.y + 0.02, outer.z);
    uvs.push(0, t * segments * 2);
    uvs.push(1, t * segments * 2);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, b); indices.push(b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
const curbTex = makeCanvas(64, (g, s) => {
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 === 0 ? "#d11" : "#fff";
    g.fillRect(0, (s / 4) * i, s, s / 4);
  }
});
curbTex.repeat.set(1, 1);
const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.7 });
const curbL = new THREE.Mesh(buildCurb(trackCurve, 1.2, TRACK_WIDTH / 2), curbMat);
const curbR = new THREE.Mesh(buildCurb(trackCurve, 1.2, -TRACK_WIDTH / 2 - 1.2), curbMat);
curbL.receiveShadow = curbR.receiveShadow = true;
scene.add(curbL, curbR);

// Start/finish line
{
  const startT = 0;
  const p = trackCurve.getPointAt(startT);
  const tan = trackCurve.getTangentAt(startT).normalize();
  const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
  const lineGeo = new THREE.PlaneGeometry(TRACK_WIDTH, 2);
  const lineCanvas = makeCanvas(128, (g, s) => {
    const cs = 16;
    for (let y = 0; y < s; y += cs)
      for (let x = 0; x < s; x += cs) {
        g.fillStyle = (x / cs + y / cs) % 2 === 0 ? "#fff" : "#000";
        g.fillRect(x, y, cs, cs);
      }
  });
  const lineMat = new THREE.MeshBasicMaterial({ map: lineCanvas });
  const line = new THREE.Mesh(lineGeo, lineMat);
  line.rotation.x = -Math.PI / 2;
  line.position.copy(p).add(new THREE.Vector3(0, 0.07, 0));
  // align to track tangent
  const angle = Math.atan2(tan.x, tan.z);
  line.rotation.z = -angle;
  scene.add(line);
}

// =========================================================
//  CHECKPOINTS for lap counting
// =========================================================
const NUM_CHECKPOINTS = 12;
const checkpoints = [];
for (let i = 0; i < NUM_CHECKPOINTS; i++) {
  const t = i / NUM_CHECKPOINTS;
  const p = trackCurve.getPointAt(t);
  const tan = trackCurve.getTangentAt(t).normalize();
  checkpoints.push({ pos: p.clone(), tan: tan.clone(), t });
}

// =========================================================
//  CAR — built from primitives, layered detail
// =========================================================
function buildCar(bodyColor = 0xff2a44) {
  const car = new THREE.Group();

  // ----- Chassis (low slung) -----
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: bodyColor, metalness: 0.7, roughness: 0.25,
    clearcoat: 1.0, clearcoatRoughness: 0.05,
  });
  const blackTrim = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6, metalness: 0.3 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1.0, roughness: 0.15 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a1418, metalness: 0.0, roughness: 0.05,
    transmission: 0.7, transparent: true, opacity: 0.55,
    clearcoat: 1.0,
  });

  // Lower body (wide, flat)
  const lower = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 4.4), bodyMat);
  lower.position.y = 0.55;
  lower.castShadow = true;
  car.add(lower);

  // Upper body (sleeker, narrower) — built with shape extrude for slope
  const upperShape = new THREE.Shape();
  upperShape.moveTo(-1.6, -0.85);
  upperShape.lineTo(1.6, -0.85);
  upperShape.lineTo(1.0, 0.85);
  upperShape.lineTo(-1.2, 0.85);
  upperShape.closePath();
  const upperGeo = new THREE.ExtrudeGeometry(upperShape, { depth: 1.7, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 3 });
  upperGeo.rotateX(Math.PI / 2);
  upperGeo.translate(0, 0, -0.85);
  const upper = new THREE.Mesh(upperGeo, bodyMat);
  upper.scale.set(0.55, 0.45, 1.0);
  upper.position.set(0, 0.85, -0.1);
  upper.castShadow = true;
  car.add(upper);

  // Hood scoop
  const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.7), blackTrim);
  scoop.position.set(0, 0.86, 1.2);
  car.add(scoop);

  // Windshield
  const wsGeo = new THREE.BoxGeometry(1.6, 0.7, 0.05);
  const ws = new THREE.Mesh(wsGeo, glassMat);
  ws.position.set(0, 1.05, 0.55);
  ws.rotation.x = -0.5;
  car.add(ws);

  // Rear window
  const rw = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.55, 0.05), glassMat);
  rw.position.set(0, 1.05, -0.95);
  rw.rotation.x = 0.6;
  car.add(rw);

  // Side windows
  for (const sx of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 1.4), glassMat);
    sw.position.set(0.82 * sx, 1.05, -0.2);
    car.add(sw);
  }

  // Headlights
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xfff5d0, emissive: 0xfff0c0, emissiveIntensity: 1.5 })
    );
    hl.position.set(0.65 * sx, 0.6, 2.18);
    hl.scale.set(1, 0.6, 0.4);
    car.add(hl);
  }

  // Taillights
  for (const sx of [-1, 1]) {
    const tl = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.12, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xff0033, emissive: 0xff0033, emissiveIntensity: 1.4 })
    );
    tl.position.set(0.6 * sx, 0.75, -2.18);
    car.add(tl);
  }

  // Front grille
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.06), blackTrim);
  grille.position.set(0, 0.5, 2.21);
  car.add(grille);

  // Rear bumper / diffuser
  const diff = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 0.3), blackTrim);
  diff.position.set(0, 0.32, -2.15);
  car.add(diff);

  // Rear spoiler
  const spoilerStand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.1), blackTrim);
  for (const sx of [-1, 1]) {
    const s = spoilerStand.clone();
    s.position.set(0.7 * sx, 1.05, -1.95);
    car.add(s);
  }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.4), bodyMat);
  wing.position.set(0, 1.2, -1.95);
  car.add(wing);

  // Side mirrors
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.25), bodyMat);
    m.position.set(1.05 * sx, 1.0, 0.7);
    car.add(m);
  }

  // ----- Wheels -----
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 1.0, roughness: 0.25 });
  const wheels = [];
  function buildWheel() {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.32, 24), wheelMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    g.add(tire);
    // Rim disc
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.34, 6), rimMat);
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
    // Spokes
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.05), rimMat);
      sp.rotation.x = (i / 5) * Math.PI * 2;
      g.add(sp);
    }
    // Brake caliper
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0x440000, emissiveIntensity: 0.4 }));
    cal.position.set(0.18, 0.15, 0);
    g.add(cal);
    return g;
  }

  const wheelOffsets = [
    { x:  1.05, z:  1.45, name: "FR", steer: true },
    { x: -1.05, z:  1.45, name: "FL", steer: true },
    { x:  1.05, z: -1.4, name: "RR", steer: false },
    { x: -1.05, z: -1.4, name: "RL", steer: false },
  ];
  for (const off of wheelOffsets) {
    const holder = new THREE.Group(); // for steering rotation
    holder.position.set(off.x, 0.45, off.z);
    const w = buildWheel();
    holder.add(w);
    car.add(holder);
    wheels.push({ holder, mesh: w, steer: off.steer });
  }

  // Headlight spots (when night)
  car.headlightTargets = [];
  for (const sx of [-1, 1]) {
    const sl = new THREE.SpotLight(0xffeec0, 0, 80, Math.PI / 6, 0.4, 1.5);
    sl.position.set(0.6 * sx, 0.7, 2.2);
    const tgt = new THREE.Object3D();
    tgt.position.set(0.6 * sx, 0.4, 12);
    car.add(sl); car.add(tgt);
    sl.target = tgt;
    car.headlightTargets.push(sl);
  }

  car.userData.wheels = wheels;
  return car;
}

const carObj = buildCar(0xe5202a);
scene.add(carObj);

// Place car at start
{
  const p = trackCurve.getPointAt(0);
  const tan = trackCurve.getTangentAt(0);
  carObj.position.copy(p).add(new THREE.Vector3(0, 0.5, 0));
  carObj.rotation.y = Math.atan2(tan.x, tan.z);
}

// =========================================================
//  ENVIRONMENT — trees, rocks, billboards
// =========================================================
function buildTree() {
  const g = new THREE.Group();
  const trunkH = 4 + Math.random() * 2.5;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, trunkH, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.95 })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const leafColor = new THREE.Color().setHSL(0.28 + Math.random() * 0.05, 0.6, 0.3 + Math.random() * 0.1);
  const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.85, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const r = 1.2 + Math.random() * 0.8;
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leafMat);
    ball.position.set(
      (Math.random() - 0.5) * 1.2,
      trunkH + 0.5 + i * 0.6,
      (Math.random() - 0.5) * 1.2
    );
    ball.castShadow = true;
    g.add(ball);
  }
  return g;
}

function buildRock() {
  const r = 0.5 + Math.random() * 1.5;
  const geo = new THREE.IcosahedronGeometry(r, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i,
      pos.getX(i) * (0.8 + Math.random() * 0.4),
      pos.getY(i) * (0.7 + Math.random() * 0.4),
      pos.getZ(i) * (0.8 + Math.random() * 0.4),
    );
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0x808890, roughness: 0.95, flatShading: true
  }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

function buildBuilding() {
  const g = new THREE.Group();
  const w = 8 + Math.random() * 14;
  const d = 8 + Math.random() * 14;
  const h = 12 + Math.random() * 40;
  const colorChoices = [0xa0a8b4, 0xc8b89c, 0x88a0a8, 0xb8a890, 0x6a7a8a];
  const mat = new THREE.MeshStandardMaterial({
    color: colorChoices[Math.floor(Math.random() * colorChoices.length)],
    roughness: 0.85, metalness: 0.05,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // Window glow
  const winTex = makeCanvas(128, (g2, s) => {
    g2.fillStyle = "#1a1a22"; g2.fillRect(0, 0, s, s);
    for (let y = 8; y < s; y += 16)
      for (let x = 8; x < s; x += 12) {
        g2.fillStyle = Math.random() > 0.4
          ? `rgba(255, 220, 120, ${0.3 + Math.random() * 0.6})`
          : "#0a0a10";
        g2.fillRect(x, y, 8, 10);
      }
  });
  winTex.repeat.set(Math.round(w / 2), Math.round(h / 3));
  const winMat = new THREE.MeshStandardMaterial({
    map: winTex, emissiveMap: winTex, emissive: 0xffaa44, emissiveIntensity: 0.4,
    roughness: 0.4, metalness: 0.6,
  });
  // Replace sides with windowed material
  body.material = [mat, mat, mat, mat, winMat, winMat];
  // multi-material requires box geo with groups (default has groups)
  return g;
}

// Scatter trees & rocks (avoiding track)
function distToTrack(x, z) {
  let min = Infinity;
  for (let i = 0; i < 60; i++) {
    const p = trackCurve.getPointAt(i / 60);
    const dx = p.x - x, dz = p.z - z;
    const d = dx * dx + dz * dz;
    if (d < min) min = d;
  }
  return Math.sqrt(min);
}

const decoGroup = new THREE.Group();
scene.add(decoGroup);

for (let i = 0; i < 400; i++) {
  const x = (Math.random() - 0.5) * 1200;
  const z = (Math.random() - 0.5) * 1200;
  if (distToTrack(x, z) < 14) continue;
  const tree = buildTree();
  tree.position.set(x, terrainHeight(x, z) - 0.1, z);
  tree.rotation.y = Math.random() * Math.PI * 2;
  tree.scale.setScalar(0.8 + Math.random() * 0.8);
  decoGroup.add(tree);
}

for (let i = 0; i < 120; i++) {
  const x = (Math.random() - 0.5) * 1000;
  const z = (Math.random() - 0.5) * 1000;
  if (distToTrack(x, z) < 12) continue;
  const r = buildRock();
  r.position.set(x, terrainHeight(x, z), z);
  r.rotation.y = Math.random() * Math.PI * 2;
  decoGroup.add(r);
}

// City cluster on one side
for (let i = 0; i < 30; i++) {
  const angle = Math.random() * Math.PI * 0.4 - Math.PI * 0.2;
  const dist = 280 + Math.random() * 200;
  const x = Math.cos(angle) * dist + 200;
  const z = Math.sin(angle) * dist - 100;
  const b = buildBuilding();
  b.position.set(x, terrainHeight(x, z), z);
  b.rotation.y = Math.random() * Math.PI * 2;
  decoGroup.add(b);
}

// Mountains in distance (giant cones)
for (let i = 0; i < 24; i++) {
  const a = (i / 24) * Math.PI * 2;
  const dist = 700 + Math.random() * 200;
  const x = Math.cos(a) * dist;
  const z = Math.sin(a) * dist;
  const h = 80 + Math.random() * 120;
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(60 + Math.random() * 40, h, 6, 1),
    new THREE.MeshStandardMaterial({ color: 0x6a7280, flatShading: true, roughness: 1.0 })
  );
  m.position.set(x, h / 2 - 5, z);
  m.rotation.y = Math.random() * Math.PI;
  scene.add(m);
}

// Roadside signs
function buildSign(text, color = 0x00b4ff) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x444 })
    );
    post.position.set(sx * 2, 2, 0);
    g.add(post);
  }
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(5, 1.4, 0.15),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 })
  );
  board.position.y = 4;
  g.add(board);
  const tCanvas = makeCanvas(256, (g2, s) => {
    g2.fillStyle = "#fff";
    g2.font = "bold 60px sans-serif";
    g2.textAlign = "center";
    g2.textBaseline = "middle";
    g2.fillText(text, s / 2, s / 2);
  });
  const lbl = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 1.0),
    new THREE.MeshBasicMaterial({ map: tCanvas, transparent: true })
  );
  lbl.position.set(0, 4, 0.09);
  g.add(lbl);
  return g;
}
// Place a couple signs along track
[0.05, 0.3, 0.6, 0.85].forEach((t, i) => {
  const p = trackCurve.getPointAt(t);
  const tan = trackCurve.getTangentAt(t).normalize();
  const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
  const off = p.clone().addScaledVector(side, TRACK_WIDTH / 2 + 5);
  const s = buildSign(["TURN 1", "FAST!", "CAUTION", "GO GO GO"][i], [0x00b4ff, 0xffeb3b, 0xff4444, 0x00ff88][i]);
  s.position.copy(off);
  s.position.y = 0;
  s.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2;
  scene.add(s);
});

// =========================================================
//  CAR PHYSICS — arcade-style
// =========================================================
const car = {
  obj: carObj,
  pos: carObj.position,
  velocity: new THREE.Vector3(),  // world-space linear velocity (m/s)
  heading: carObj.rotation.y,     // yaw in radians
  steerAngle: 0,                   // current visual/steer
  speed: 0,                         // forward speed (m/s, signed)
  wheelSpin: 0,
  drift: 0,
};

const INPUT = { throttle: 0, brake: 0, steer: 0, handbrake: 0, reset: false };

const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "KeyR") respawnCar();
  if (e.code === "KeyC") cycleCamera();
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; });

function readInput() {
  INPUT.throttle = (keys["KeyW"] || keys["ArrowUp"]) ? 1 : 0;
  INPUT.brake    = (keys["KeyS"] || keys["ArrowDown"]) ? 1 : 0;
  INPUT.steer = ((keys["KeyA"] || keys["ArrowLeft"]) ? 1 : 0) - ((keys["KeyD"] || keys["ArrowRight"]) ? 1 : 0);
  INPUT.handbrake = keys["Space"] ? 1 : 0;
}

function respawnCar() {
  // Find nearest point on track curve
  let best = 0, bestD = Infinity;
  for (let i = 0; i < 200; i++) {
    const t = i / 200;
    const p = trackCurve.getPointAt(t);
    const d = p.distanceToSquared(car.pos);
    if (d < bestD) { bestD = d; best = t; }
  }
  const p = trackCurve.getPointAt(best);
  const tan = trackCurve.getTangentAt(best);
  car.pos.copy(p).add(new THREE.Vector3(0, 0.6, 0));
  car.heading = Math.atan2(tan.x, tan.z);
  car.velocity.set(0, 0, 0);
  car.speed = 0;
}

// =========================================================
//  CAMERA — chase + cinematic + hood
// =========================================================
const CAMERA_MODES = ["chase", "far", "hood"];
let cameraMode = 0;
function cycleCamera() { cameraMode = (cameraMode + 1) % CAMERA_MODES.length; }

const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();

function updateCamera(dt) {
  const mode = CAMERA_MODES[cameraMode];
  const carForward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  const carPos = car.pos;

  if (mode === "chase") {
    const speedFactor = Math.min(1, Math.abs(car.speed) / 40);
    const back = 8 + speedFactor * 2;
    const up = 3.5 + speedFactor * 0.6;
    camDesired.copy(carPos)
      .addScaledVector(carForward, -back)
      .add(new THREE.Vector3(0, up, 0));
    camTarget.copy(carPos).addScaledVector(carForward, 4).add(new THREE.Vector3(0, 1.2, 0));
  } else if (mode === "far") {
    camDesired.copy(carPos).addScaledVector(carForward, -16).add(new THREE.Vector3(0, 7, 0));
    camTarget.copy(carPos).add(new THREE.Vector3(0, 1.2, 0));
  } else {
    // hood
    camDesired.copy(carPos).addScaledVector(carForward, 0.5).add(new THREE.Vector3(0, 1.4, 0));
    camTarget.copy(carPos).addScaledVector(carForward, 20).add(new THREE.Vector3(0, 1.4, 0));
  }
  // Smooth
  const lerp = 1 - Math.pow(0.001, dt); // frame-rate independent damping
  camera.position.lerp(camDesired, lerp * 0.9);
  const lookAt = new THREE.Vector3().copy(camTarget);
  // Smoothed look
  camera.lookAt(lookAt);
  // Subtle FOV change with speed for sensation
  const targetFov = 70 + Math.min(20, Math.abs(car.speed) * 0.3);
  camera.fov += (targetFov - camera.fov) * lerp * 0.5;
  camera.updateProjectionMatrix();
}

// =========================================================
//  LAP / TIMER
// =========================================================
const TOTAL_LAPS = 3;
let lap = 1;
let nextCheckpoint = 1; // cars start at checkpoint 0 area; need to hit 1, 2, ... 0 to complete lap
let raceStart = null;
let raceTime = 0;
let raceFinished = false;
let bestTime = parseFloat(localStorage.getItem("horizonBestTime") || "0") || null;

const $lap = document.getElementById("lap");
const $cp = document.getElementById("checkpoint");
const $time = document.getElementById("time");
const $speed = document.getElementById("speed");
const $gear = document.getElementById("gear");
const $needle = document.getElementById("needle");
const $arc = document.getElementById("gaugeArc");
const $finish = document.getElementById("finish");
const $finalTime = document.getElementById("finalTime");
const $bestTime = document.getElementById("bestTime");

document.getElementById("restartBtn").addEventListener("click", () => {
  $finish.classList.add("hidden");
  raceStart = null;
  raceTime = 0;
  raceFinished = false;
  lap = 1;
  nextCheckpoint = 1;
  respawnCar();
});

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
}

// Build initial gauge arc
{
  // Arc from 135° to 405° (270° sweep)
  const cx = 100, cy = 100, r = 78;
  const start = (135 * Math.PI) / 180;
  const end = (405 * Math.PI) / 180;
  const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
  const largeArc = 1;
  $arc.setAttribute("d", `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`);
}

function updateHUD() {
  $lap.textContent = `${Math.min(lap, TOTAL_LAPS)} / ${TOTAL_LAPS}`;
  $cp.textContent = `${nextCheckpoint} / ${NUM_CHECKPOINTS}`;
  $time.textContent = fmtTime(raceTime);

  const kmh = Math.abs(car.speed) * 3.6;
  $speed.textContent = Math.round(kmh);

  // Needle: 0 km/h => 135°, 280 km/h => 405°
  const t = Math.min(1, kmh / 280);
  const angle = 135 + t * 270;
  const rad = (angle * Math.PI) / 180;
  const nx = 100 + 70 * Math.cos(rad);
  const ny = 100 + 70 * Math.sin(rad);
  $needle.setAttribute("x2", nx);
  $needle.setAttribute("y2", ny);

  $gear.textContent = car.speed < -0.5 ? "R" : (kmh < 1 ? "N" : (kmh < 60 ? "1" : kmh < 120 ? "2" : kmh < 180 ? "3" : kmh < 230 ? "4" : "5"));
}

// =========================================================
//  PARTICLES — tire smoke for drift
// =========================================================
const SMOKE_MAX = 200;
const smokeGeo = new THREE.BufferGeometry();
const smokePos = new Float32Array(SMOKE_MAX * 3);
const smokeAlpha = new Float32Array(SMOKE_MAX);
const smokeLife = new Float32Array(SMOKE_MAX);
smokeGeo.setAttribute("position", new THREE.BufferAttribute(smokePos, 3));
const smokeMat = new THREE.PointsMaterial({
  size: 1.2, color: 0xeeeeee, transparent: true, opacity: 0.4,
  depthWrite: false, sizeAttenuation: true,
});
const smoke = new THREE.Points(smokeGeo, smokeMat);
scene.add(smoke);
let smokeIdx = 0;
function emitSmoke(x, y, z) {
  smokePos[smokeIdx * 3 + 0] = x;
  smokePos[smokeIdx * 3 + 1] = y;
  smokePos[smokeIdx * 3 + 2] = z;
  smokeLife[smokeIdx] = 1;
  smokeIdx = (smokeIdx + 1) % SMOKE_MAX;
  smokeGeo.attributes.position.needsUpdate = true;
}
function updateSmoke(dt) {
  for (let i = 0; i < SMOKE_MAX; i++) {
    if (smokeLife[i] > 0) {
      smokeLife[i] -= dt * 0.6;
      smokePos[i * 3 + 1] += dt * 1.0;
    } else {
      // hide by sending far away
      smokePos[i * 3 + 1] = -1000;
    }
  }
  smokeGeo.attributes.position.needsUpdate = true;
}

// =========================================================
//  PHYSICS UPDATE
// =========================================================
function updateCar(dt) {
  if (raceFinished) {
    // Coast slowly
    car.speed *= Math.pow(0.7, dt);
  }

  readInput();

  // --- Engine / brake ---
  const MAX_SPEED = 75;       // m/s ≈ 270 km/h
  const REVERSE_MAX = -10;
  const ACCEL = 22;
  const BRAKE = 40;
  const DRAG = 0.5;           // air drag coefficient
  const ROLL = 1.2;           // rolling resistance

  if (!raceFinished) {
    if (INPUT.throttle > 0) {
      car.speed += ACCEL * dt;
    }
    if (INPUT.brake > 0) {
      if (car.speed > 0.1) {
        car.speed -= BRAKE * dt;
      } else {
        // reverse
        car.speed -= ACCEL * 0.6 * dt;
      }
    }
    // natural decel
    if (INPUT.throttle === 0 && INPUT.brake === 0) {
      car.speed -= Math.sign(car.speed) * ROLL * dt;
      if (Math.abs(car.speed) < 0.05) car.speed = 0;
    }
  }
  // Drag (quadratic)
  car.speed -= Math.sign(car.speed) * DRAG * car.speed * car.speed * 0.001 * dt * 60;

  // Clamp
  if (car.speed > MAX_SPEED) car.speed = MAX_SPEED;
  if (car.speed < REVERSE_MAX) car.speed = REVERSE_MAX;

  // --- Steering ---
  const STEER_MAX = 0.55; // rad
  const targetSteer = INPUT.steer * STEER_MAX;
  const steerLerp = 1 - Math.pow(0.0001, dt);
  car.steerAngle += (targetSteer - car.steerAngle) * steerLerp;

  // Speed-based steering reduction
  const speedSteer = THREE.MathUtils.lerp(1.0, 0.35, Math.min(1, Math.abs(car.speed) / 60));
  const effectiveSteer = car.steerAngle * speedSteer;

  // Yaw rate proportional to forward speed
  const wheelbase = 2.85;
  const yawRate = (car.speed / wheelbase) * Math.tan(effectiveSteer);
  car.heading += yawRate * dt;

  // Handbrake = drift effect (more lateral slide + smoke)
  const handbrake = INPUT.handbrake;
  car.drift = THREE.MathUtils.lerp(car.drift, handbrake * Math.min(1, Math.abs(car.speed) / 15), 1 - Math.pow(0.01, dt));

  // Forward vector from heading
  const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  // Move position
  const moveDist = car.speed * dt;
  car.pos.addScaledVector(forward, moveDist);

  // Off-track: reduce grip / slow car (check distance to track centerline)
  let onTrack = false;
  // Cheap nearest-point search
  let nearestT = 0;
  {
    let bestD = Infinity;
    for (let i = 0; i < 80; i++) {
      const t = i / 80;
      const p = trackCurve.getPointAt(t);
      const dx = p.x - car.pos.x, dz = p.z - car.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; nearestT = t; }
    }
    onTrack = bestD < (TRACK_WIDTH * 0.5 + 1.5) ** 2;
  }
  if (!onTrack) {
    // Grass slow-down
    if (Math.abs(car.speed) > 25) car.speed *= Math.pow(0.55, dt);
  }

  // Stay above terrain
  const groundY = onTrack ? 0.05 : terrainHeight(car.pos.x, car.pos.z);
  car.pos.y = groundY + 0.5;

  // --- Apply transform ---
  carObj.position.copy(car.pos);
  carObj.rotation.y = car.heading;

  // Body roll & pitch from accel/steer
  const rollAmount = -effectiveSteer * 0.15 * Math.min(1, Math.abs(car.speed) / 30);
  const pitchAmount = THREE.MathUtils.clamp(-yawRate * 0.0 + (INPUT.brake - INPUT.throttle) * 0.05, -0.1, 0.1);
  carObj.rotation.z = THREE.MathUtils.lerp(carObj.rotation.z, rollAmount, 1 - Math.pow(0.001, dt));
  carObj.rotation.x = THREE.MathUtils.lerp(carObj.rotation.x, pitchAmount, 1 - Math.pow(0.001, dt));

  // --- Wheels: spin + steer ---
  car.wheelSpin += (car.speed / 0.45) * dt;
  for (const w of carObj.userData.wheels) {
    if (w.steer) w.holder.rotation.y = car.steerAngle;
    w.mesh.rotation.x = car.wheelSpin;
  }

  // --- Smoke when drifting / hard braking ---
  if (car.drift > 0.3 || (INPUT.brake > 0 && Math.abs(car.speed) > 15) || (!onTrack && Math.abs(car.speed) > 15)) {
    if (Math.random() < 0.7) {
      for (const off of [{ x: 1.05, z: -1.4 }, { x: -1.05, z: -1.4 }]) {
        const wx = car.pos.x + Math.cos(car.heading) * off.x + Math.sin(car.heading) * off.z;
        const wz = car.pos.z - Math.sin(car.heading) * off.x + Math.cos(car.heading) * off.z;
        emitSmoke(wx, 0.3, wz);
      }
    }
  }

  // --- Checkpoints ---
  if (!raceFinished) {
    const cp = checkpoints[nextCheckpoint % NUM_CHECKPOINTS];
    if (car.pos.distanceTo(cp.pos) < TRACK_WIDTH) {
      nextCheckpoint++;
      if (nextCheckpoint > NUM_CHECKPOINTS) {
        // Lap complete
        nextCheckpoint = 1;
        lap++;
        if (lap > TOTAL_LAPS) {
          raceFinished = true;
          if (!bestTime || raceTime < bestTime) {
            bestTime = raceTime;
            localStorage.setItem("horizonBestTime", String(bestTime));
          }
          $finalTime.textContent = fmtTime(raceTime);
          $bestTime.textContent = fmtTime(bestTime);
          $finish.classList.remove("hidden");
        }
      }
    }
  }
}

// =========================================================
//  RESIZE
// =========================================================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// =========================================================
//  MAIN LOOP
// =========================================================
let last = performance.now();
function animate(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (raceStart === null && (keys["KeyW"] || keys["ArrowUp"])) {
    raceStart = now;
  }
  if (raceStart !== null && !raceFinished) {
    raceTime = (now - raceStart) / 1000;
  }

  updateCar(dt);
  updateCamera(dt);
  updateSmoke(dt);
  // Keep shadow camera centered on car
  dir.position.copy(car.pos).add(new THREE.Vector3(80, 160, 60));
  dir.target.position.copy(car.pos);

  updateHUD();
  composer.render();
  requestAnimationFrame(animate);
}

// Hide loader, show HUD
window.addEventListener("load", () => {
  setTimeout(() => {
    document.getElementById("loading").classList.add("fade");
    document.getElementById("hud").classList.remove("hidden");
    requestAnimationFrame(animate);
  }, 400);
});
