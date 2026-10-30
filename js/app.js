import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BRAND, SKO, lavSko } from "./sko.js";

const $ = (s) => document.querySelector(s);
const VOLT = 0xd4ff00;
const reduceret = matchMedia("(prefers-reduced-motion: reduce)").matches;

document.querySelectorAll("[data-brand]").forEach((el) => (el.textContent = BRAND.navn));
document.querySelectorAll("[data-disclaimer]").forEach((el) => (el.textContent = BRAND.disclaimer));

/* ================================================================== */
/* Små hjælpere                                                         */
/* ================================================================== */
const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const easeIn = (t) => t * t * t;
const daemp = (fart, dt) => 1 - Math.exp(-fart * dt); // billedrate-uafhængig udglatning

const animationer = [];
function tween(varighed, opdater, ease = (t) => t) {
  if (reduceret) varighed = Math.min(varighed, 120);
  return new Promise((ok) => animationer.push({ start: performance.now(), varighed, opdater, ease, ok }));
}
function koerAnimationer(nu) {
  for (let i = animationer.length - 1; i >= 0; i--) {
    const a = animationer[i];
    const t = Math.min(1, (nu - a.start) / a.varighed);
    a.opdater(a.ease(t));
    if (t >= 1) { animationer.splice(i, 1); a.ok(); }
  }
}

function opsaetRenderer(r) {
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

function lys(sc, r, styrke = 1) {
  sc.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
  const nøgle = new THREE.DirectionalLight(0xffffff, 1.4 * styrke);
  nøgle.position.set(1.2, 2.2, 1.6);
  sc.add(nøgle);
  const kant = new THREE.DirectionalLight(0xdff5ff, 0.7 * styrke);
  kant.position.set(-1.6, 0.8, -1.2);
  sc.add(kant);
}

// Blød, rund skygge, der "sætter" skoen på underlaget
function radialTekstur(indre, ydre) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, indre);
  grad.addColorStop(1, ydre);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function kontaktSkygge(bredde = 1.25, dybde = 0.55, styrke = 0.6) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(bredde, dybde),
    new THREE.MeshBasicMaterial({ map: radialTekstur(`rgba(0,0,0,${styrke})`, "rgba(0,0,0,0)"), transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.001;
  m.renderOrder = -1;
  return m;
}

// Placér kameraet, så `bredde` enheder fylder skærmens bredde (eller ~70% af højden på brede skærme)
function kameraTilpas(cam, bredde, maalY) {
  const synligH = Math.max(bredde / cam.aspect, bredde * 0.72);
  const afstand = synligH / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  cam.position.set(0, maalY + afstand * 0.22, afstand);
  cam.lookAt(0, maalY, 0);
  cam.updateProjectionMatrix();
}

function saetOpacitet(obj, a) {
  obj.traverse((o) => {
    if (!o.material || o.userData.egenOpacitet) return;
    for (const m of [].concat(o.material)) {
      if (m.userData.basis === undefined) m.userData.basis = m.opacity;
      m.transparent = a < 1 || m.userData.basis < 1;
      m.opacity = m.userData.basis * a;
    }
  });
}

/* ================================================================== */
/* Hero: skoen på forsiden                                              */
/* ================================================================== */
const hero = { renderer: null, kører: false };

async function startHero() {
  const boks = $("#heroSko");
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  opsaetRenderer(r);
  boks.appendChild(r.domElement);
  const sc = new THREE.Scene();
  lys(sc, r, 1.1);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);

  const holder = new THREE.Group();
  sc.add(holder);
  const skygge = kontaktSkygge(1.3, 0.6, 0.55);
  holder.add(skygge);
  const sko = await lavSko(SKO[0]);
  const drej = new THREE.Group();
  drej.add(sko);
  holder.add(drej);

  function tilpas() {
    const w = boks.clientWidth, h = boks.clientHeight;
    r.setSize(w, h, false);
    cam.aspect = w / h;
    const mobil = w < h;
    // Mobil: skoen i midterfeltet mellem overskrift og knapper. Computer: stor til højre.
    kameraTilpas(cam, mobil ? 1.55 : 1.8, mobil ? 0.32 : 0.24);
  }
  tilpas();
  new ResizeObserver(tilpas).observe(boks);

  // Tilt efter musen / fingeren (lille og blød)
  const tilt = { x: 0, y: 0, mx: 0, my: 0 };
  window.addEventListener("pointermove", (e) => {
    tilt.mx = (e.clientX / innerWidth - 0.5) * 0.5;
    tilt.my = (e.clientY / innerHeight - 0.5) * 0.25;
  });

  // Entré: skoen falder på plads og lander blødt (sidens ene store øjeblik)
  drej.position.y = 0.9;
  drej.rotation.set(0.5, -2.4, 0.3);
  skygge.scale.setScalar(0.3);
  tween(1300, (t) => {
    drej.position.y = 0.9 * (1 - t);
    drej.rotation.set(0.5 * (1 - t), -2.4 + 1.85 * t, 0.3 * (1 - t));
    skygge.scale.setScalar(0.3 + 0.7 * t);
  }, easeOutBack);

  const ur = new THREE.Clock();
  hero.renderer = r;
  hero.loop = () => {
    const dt = Math.min(0.05, ur.getDelta());
    const nu = performance.now();
    koerAnimationer(nu);
    tilt.x += (tilt.my - tilt.x) * daemp(4, dt);
    tilt.y += (tilt.mx - tilt.y) * daemp(4, dt);
    holder.rotation.set(tilt.x, tilt.y + (reduceret ? 0 : nu * 0.00018), 0);
    const svaev = reduceret ? 0 : Math.sin(nu * 0.0013) * 0.02;
    sko.position.y = 0.04 + svaev;
    skygge.material.opacity = 1 - svaev * 8;
    r.render(sc, cam);
  };
  hero.kører = true;
  r.setAnimationLoop(hero.loop);
}

function pauseHero(pause) {
  if (!hero.renderer) return;
  hero.renderer.setAnimationLoop(pause ? null : hero.loop);
}

// QR til telefonen (vises kun på computer)
if (window.qrcode) {
  const q = qrcode(0, "M");
  q.addData(location.href.split("#")[0]);
  q.make();
  $("#qrDesktop").innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

/* ================================================================== */
/* Oplevelse: fælles scene for AR og 3D                                 */
/* ================================================================== */
let modus = null; // "plakat" | "xr" | "kamera" | "3d"
let renderer, scene, camera, mindar, anker, ur;
let foelger;     // følger plakaten med udglatning, eller står på gulvet (markørløs AR)
let scene3d;     // "scenen": skygge + drejeskive + sko
let drejeskive, plads, ring, skygge;
let index = 0;
let zoom = 1;
let tilt = 0.6;  // 0 = plakat på bord, 1 = plakat på væg/skærm
let tilstede = 0; // 0..1: hvor synlig skoen er (fade ind/ud)
let sidstSet = -1e9;
let harPose = false;
let foersteFund = true;
const skoCache = new Map();

function byggScene(studie) {
  scene3d = new THREE.Group();

  if (studie) {
    // Blødt "studiegulv" i stedet for et neon-podie
    const gulv = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 64),
      new THREE.MeshBasicMaterial({ map: radialTekstur("rgba(255,255,255,0.07)", "rgba(255,255,255,0)"), transparent: true, depthWrite: false })
    );
    gulv.rotation.x = -Math.PI / 2;
    scene3d.add(gulv);
  }

  skygge = kontaktSkygge(1.3, 0.6, studie ? 0.75 : 0.55);
  skygge.userData.egenOpacitet = true; // styres i frame()
  scene3d.add(skygge);

  // Ring der breder sig én gang, når skoen lander (feedback: "placeret")
  ring = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 0.5, 96),
    new THREE.MeshBasicMaterial({ color: VOLT, transparent: true, opacity: 0, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  ring.userData.egenOpacitet = true; // styres af ringPuls()
  scene3d.add(ring);

  drejeskive = new THREE.Group();
  scene3d.add(drejeskive);
  plads = new THREE.Group();
  drejeskive.add(plads);
  return scene3d;
}

function ringPuls() {
  tween(900, (t) => {
    const s = 0.6 + t * 0.9;
    ring.scale.set(s, s, s);
    ring.material.opacity = 0.7 * (1 - t);
  }, easeOutExpo);
}

async function hentSko(i) {
  if (!skoCache.has(i)) skoCache.set(i, lavSko(SKO[i]));
  return skoCache.get(i);
}

let skifter = false;
async function visSko(ny, retning = 1, bruger = true) {
  ny = (ny + SKO.length) % SKO.length;
  if (skifter || (ny === index && plads.children.length)) return;
  skifter = true;
  if (bruger) navigator.vibrate?.(8); // lille haptisk "klik" ved skift
  const gammel = plads.children[0];
  index = ny;
  opdaterInfo();
  skjulGuide();

  if (gammel) {
    await tween(260, (t) => {
      gammel.position.x = -retning * 0.55 * t;
      gammel.scale.setScalar(1 - 0.35 * t);
      saetOpacitet(gammel, 1 - t);
    }, easeIn);
    plads.remove(gammel);
    saetOpacitet(gammel, 1);
    gammel.position.x = 0;
    gammel.scale.setScalar(1);
  }

  const sko = await hentSko(index);
  sko.position.set(retning * 0.55, 0, 0);
  sko.rotation.y = retning * 0.6;
  sko.scale.setScalar(0.65);
  saetOpacitet(sko, 0);
  plads.add(sko);
  await tween(620, (t) => {
    sko.position.x = retning * 0.55 * (1 - t);
    sko.rotation.y = retning * 0.6 * (1 - t);
    sko.scale.setScalar(0.65 + 0.35 * t);
    saetOpacitet(sko, Math.min(1, t * 1.6));
  }, easeOutExpo);
  skifter = false;
}

/* ---------------- Produktark ---------------- */
$("#swatches").innerHTML = SKO.map(
  (s, i) => `<button class="swatch" role="tab" aria-label="${s.farve}" style="--c:#${s.farver.overdel.toString(16).padStart(6, "0")}" data-i="${i}"></button>`
).join("");
$("#swatches").addEventListener("click", (e) => {
  const b = e.target.closest(".swatch");
  if (b) visSko(+b.dataset.i, +b.dataset.i > index ? 1 : -1);
});
$("#naeste").addEventListener("click", () => visSko(index + 1, 1));
$("#forrige").addEventListener("click", () => visSko(index - 1, -1));
$("#koeb").addEventListener("click", () => toast(`<i class="ph-bold ph-check"></i>${SKO[index].navn} ligger i kurven`));

function opdaterInfo() {
  const d = SKO[index];
  const info = $(".ark-info");
  info.classList.add("skift");
  setTimeout(() => {
    $("#navn").textContent = d.navn;
    $("#farve").textContent = d.farve;
    $("#pris").textContent = d.pris;
    info.classList.remove("skift");
  }, 160);
  document.querySelectorAll(".swatch").forEach((s, i) => s.setAttribute("aria-selected", i === index));
}

function toast(html) {
  const t = $("#toast");
  t.innerHTML = html;
  t.classList.add("vis");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("vis"), 2200);
}

let guideVist = false;
function visGuide() {
  if (guideVist) return;
  guideVist = true;
  $("#guide").classList.add("vis");
  setTimeout(skjulGuide, 3200);
}
function skjulGuide() { $("#guide").classList.remove("vis"); }

/* ---------------- Fingerstyring ---------------- */
// Træk = drej (med efterløb), hurtigt swipe = næste/forrige, to fingre = zoom
let fart = 0;
let sidstRoert = -1e9;
(() => {
  const flade = $("#scene");
  const fingre = new Map();
  let start = null, pinch = null;

  flade.addEventListener("pointerdown", (e) => {
    flade.setPointerCapture(e.pointerId);
    fingre.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingre.size === 1) start = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (fingre.size === 2) {
      const [a, b] = [...fingre.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      start = null;
    }
  });
  flade.addEventListener("pointermove", (e) => {
    const f = fingre.get(e.pointerId);
    if (!f) return;
    const dx = e.clientX - f.x;
    f.x = e.clientX; f.y = e.clientY;
    if (pinch && fingre.size === 2) {
      const [a, b] = [...fingre.values()];
      zoom = THREE.MathUtils.clamp(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), 0.6, 1.8);
      return;
    }
    if (fingre.size === 1) {
      drejeskive.rotation.y += dx * 0.011;
      fart = dx * 0.011;
      sidstRoert = performance.now();
      skjulGuide();
    }
  });
  const slip = (e) => {
    fingre.delete(e.pointerId);
    if (fingre.size < 2) pinch = null;
    if (!start || fingre.size) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    const dt = performance.now() - start.t;
    if (modus === "kamera" && !placeret && Math.hypot(dx, dy) < 12 && dt < 400) placerVedSigte();
    else if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 280) {
      fart = 0;
      visSko(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    }
    start = null;
  };
  flade.addEventListener("pointerup", slip);
  flade.addEventListener("pointercancel", slip);
})();

/* ---------------- Telefonens orientering ---------------- */
// beta bruges til plakat på bord/væg, hele orienteringen styrer kameraet i kamera-tilstand
let beta = 70;
const gyro = { a: 0, b: 0, g: 0, har: false };
window.addEventListener("deviceorientation", (e) => {
  if (e.beta != null) beta = Math.abs(e.beta);
  if (e.alpha == null) return;
  gyro.a = e.alpha; gyro.b = e.beta; gyro.g = e.gamma; gyro.har = true;
});
async function spoergOmBevaegelse() {
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) {
      await DeviceOrientationEvent.requestPermission();
    }
  } catch (_) { /* uden tilladelse står kameraet stille */ }
}

// Telefonens orientering som kvaternion (kameraet kigger ud af bagsiden af telefonen)
const Q_SKAERM = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const Z_AKSE = new THREE.Vector3(0, 0, 1);
const gEuler = new THREE.Euler(), gQ = new THREE.Quaternion(), gTmp = new THREE.Quaternion();
function gyroRetning() {
  const d = THREE.MathUtils.DEG2RAD;
  gEuler.set(gyro.b * d, gyro.a * d, -gyro.g * d, "YXZ");
  const skaerm = (screen.orientation?.angle ?? window.orientation ?? 0) * d;
  return gQ.setFromEuler(gEuler).multiply(Q_SKAERM).multiply(gTmp.setFromAxisAngle(Z_AKSE, -skaerm));
}

const QBORD = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const QVAEG = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.16, 0, 0));
const PBORD = new THREE.Vector3(0, -0.06, 0.0);
const PVAEG = new THREE.Vector3(0, -0.36, 0.16);

/* ---------------- Markørløs AR: gulv eller bord ---------------- */
const SKO_STR = 0.34; // skoen i naturlig størrelse (scenen er i meter)
const HOEJDE = 0.8;   // kamera-tilstand: antaget afstand fra telefonen ned til underlaget
let placeret = false;
let harSigte = false;
let sigte, video, hitKilde;
const sigtePos = new THREE.Vector3(), hitPos = new THREE.Vector3(), retning = new THREE.Vector3();
const mHit = new THREE.Matrix4();

let xrStoette = false;
navigator.xr?.isSessionSupported?.("immersive-ar").then((ja) => (xrStoette = ja)).catch(() => {});

// Sigtet: en ring på underlaget, der viser hvor skoen lander
function lavSigte() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: VOLT, transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.1, 64), mat);
  const prik = new THREE.Mesh(new THREE.CircleGeometry(0.012, 24), mat);
  for (const m of [ring, prik]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.002; g.add(m); }
  g.add(kontaktSkygge(0.34, 0.34, 0.3));
  g.visible = false;
  return g;
}

function byggMarkoerloes() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(63, innerWidth / innerHeight, 0.01, 30);
  lys(scene, renderer, 1);
  foelger = new THREE.Group();
  foelger.add(byggScene(false));
  foelger.visible = false;
  scene3d.scale.setScalar(SKO_STR);
  saetOpacitet(scene3d, 0);
  scene.add(foelger);
  sigte = lavSigte();
  scene.add(sigte);
}

function visPlacering(tekst) { $("#placerTekst").textContent = tekst; }

function placerVedSigte() {
  if (placeret || !harSigte) return;
  placeret = true;
  // Skoen står på sigtet og vender mod brugeren i en skrå trekvart-vinkel
  const kam = camera.getWorldPosition(new THREE.Vector3());
  foelger.position.copy(sigtePos);
  foelger.rotation.set(0, Math.atan2(kam.x - sigtePos.x, kam.z - sigtePos.z), 0);
  drejeskive.rotation.y = -0.5;
  sigte.visible = false;
  $("#placer").classList.add("skjult");
  $("#ark").classList.remove("skjult");
  $("#flyt").hidden = false;
  navigator.vibrate?.(12);

  drejeskive.position.y = 0.35;
  tween(800, (t) => (drejeskive.position.y = 0.35 * (1 - t)), easeOutBack);
  ringPuls();
  if (foersteFund) {
    foersteFund = false;
    visSko(index, 1, false).then(visGuide);
  }
}

function flyt() {
  placeret = false;
  $("#placer").classList.remove("skjult");
  $("#ark").classList.add("skjult");
  $("#flyt").hidden = true;
}

function opdaterSigte(dt, xrFrame) {
  if (modus === "kamera") {
    if (gyro.har) camera.quaternion.slerp(gyroRetning(), daemp(18, dt));
    camera.updateMatrixWorld();
  }
  if (placeret) return;

  let fundet = false;
  if (modus === "xr" && xrFrame && hitKilde) {
    const pose = xrFrame.getHitTestResults(hitKilde)[0]?.getPose(renderer.xr.getReferenceSpace());
    if (pose) {
      hitPos.setFromMatrixPosition(mHit.fromArray(pose.transform.matrix));
      fundet = true;
    }
  } else if (modus === "kamera") {
    // Uden rigtig gulvgenkendelse: hvor rammer midten af skærmen et antaget gulv?
    camera.getWorldDirection(retning);
    const vandret = Math.max(Math.hypot(retning.x, retning.z), 1e-3);
    const afstand = THREE.MathUtils.clamp((HOEJDE * vandret) / Math.max(-retning.y, 0.05), 0.4, 2.2);
    hitPos.set((retning.x / vandret) * afstand, -HOEJDE, (retning.z / vandret) * afstand);
    fundet = true;
  }

  if (fundet) {
    if (harSigte) sigtePos.lerp(hitPos, daemp(16, dt));
    else sigtePos.copy(hitPos);
    sigte.position.copy(sigtePos);
    sigte.scale.setScalar(reduceret ? 1 : 1 + Math.sin(performance.now() * 0.004) * 0.06);
  }
  sigte.visible = fundet;
  if (modus === "xr" && fundet !== harSigte) {
    visPlacering(fundet ? "Tryk for at stille skoen her" : "Bevæg telefonen langsomt for at finde gulvet");
  }
  harSigte = fundet;
}

/* ---------------- Render-loop ---------------- */
const mPos = new THREE.Vector3(), mQuat = new THREE.Quaternion(), mSkala = new THREE.Vector3();

function frame(tid, xrFrame) {
  const nu = performance.now();
  const dt = Math.min(0.05, ur.getDelta());
  koerAnimationer(nu);

  // Drejning: efterløb fra fingeren, ellers langsom fremvisning
  if (nu - sidstRoert > 1600 && !reduceret) drejeskive.rotation.y += 0.32 * dt;
  else { drejeskive.rotation.y += fart; fart *= Math.pow(0.0025, dt); }

  const svaev = reduceret ? 0 : Math.sin(nu * 0.0014) * 0.012;
  plads.position.y = 0.035 + svaev;

  const zMaal = (modus === "plakat" ? 0.62 : modus === "3d" ? 1 : SKO_STR) * zoom;
  scene3d.scale.setScalar(THREE.MathUtils.lerp(scene3d.scale.x, zMaal, daemp(10, dt)));

  let maal = 1;
  if (modus === "plakat") {
    // Følg plakaten blødt i stedet for at hoppe med hver tracking-måling
    if (anker.group.visible) {
      anker.group.matrix.decompose(mPos, mQuat, mSkala);
      if (!harPose) {
        foelger.position.copy(mPos); foelger.quaternion.copy(mQuat); foelger.scale.copy(mSkala);
        harPose = true;
      } else {
        const k = daemp(14, dt);
        foelger.position.lerp(mPos, k);
        foelger.quaternion.slerp(mQuat, k);
        foelger.scale.lerp(mSkala, k);
      }
      sidstSet = nu;
    }
    // Hold skoen et øjeblik, hvis trackingen kort taber plakaten, og fade så ud
    maal = nu - sidstSet < 500 ? 1 : 0;
  } else if (modus === "xr" || modus === "kamera") {
    opdaterSigte(dt, xrFrame);
    maal = placeret ? 1 : 0;
  }

  if (modus !== "3d") {
    const før = tilstede;
    tilstede += (maal - tilstede) * daemp(maal ? 9 : 6, dt);
    if (Math.abs(tilstede - før) > 0.001) saetOpacitet(scene3d, tilstede);
    foelger.visible = tilstede > 0.01;
  }

  if (modus === "plakat") {
    if (maal === 0 && tilstede < 0.05) harPose = false;
    const tiltMaal = THREE.MathUtils.clamp((beta - 35) / 30, 0, 1);
    tilt += (tiltMaal - tilt) * daemp(3, dt);
    scene3d.quaternion.slerpQuaternions(QBORD, QVAEG, tilt);
    scene3d.position.lerpVectors(PBORD, PVAEG, tilt);
  }

  // Skyggen bliver lysere, når skoen svæver højere, og følger fade'en i AR
  skygge.material.opacity = (1 - svaev * 12) * (modus === "3d" ? 1 : tilstede);
  renderer.render(scene, camera);
}

/* ---------------- AR uden plakat ---------------- */
function forberedMarkoerloes() {
  visSkaerm("oplevelse");
  $("#oplevelse").classList.remove("studie");
  $("#tilstand").textContent = "AR";
  $("#scan").classList.add("skjult");
  $("#ark").classList.add("skjult");
  $("#placer").classList.remove("skjult");
  visPlacering("Peg mod gulvet, og tryk for at stille skoen");
  hentSko(index);
}

// Android (Chrome): WebXR med rigtig gulv- og bordgenkendelse
async function startXR() {
  modus = "xr";
  const session = await navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay"],
    domOverlay: { root: $("#oplevelse") },
  });
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  opsaetRenderer(renderer);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  byggMarkoerloes();
  await renderer.xr.setSession(session);
  hitKilde = await session.requestHitTestSource({ space: await session.requestReferenceSpace("viewer") });
  session.addEventListener("select", placerVedSigte);
  session.addEventListener("end", () => { if (modus === "xr") afslut(); });
  $("#oplevelse").classList.add("xr");
  visPlacering("Bevæg telefonen langsomt for at finde gulvet");
  ur = new THREE.Clock();
  renderer.setAnimationLoop(frame);
}

// iPhone og alt andet: kamerabillede bag skoen, telefonens gyroskop holder den på plads
async function startKamera() {
  modus = "kamera";
  const stroem = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  });
  video = document.createElement("video");
  video.className = "fyld";
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.srcObject = stroem;
  $("#scene").appendChild(video);
  await video.play();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  opsaetRenderer(renderer);
  renderer.domElement.classList.add("fyld");
  $("#scene").appendChild(renderer.domElement);
  byggMarkoerloes();
  if (!gyro.har) camera.rotation.set(-0.62, 0, 0); // uden gyroskop: kig skråt ned
  tilpasKamera();
  window.addEventListener("resize", tilpasKamera);
  ur = new THREE.Clock();
  renderer.setAnimationLoop(frame);
}

function tilpasKamera() {
  if (modus !== "kamera") return;
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

function startAR() {
  pauseHero(true);
  forberedMarkoerloes();
  $("#loader").classList.add("vis");
  // Ingen await før requestSession/requestPermission: begge kræver at kaldet sker direkte fra trykket
  const forsoeg = xrStoette
    ? startXR().catch((err) => {
        console.warn("WebXR startede ikke, bruger kamera-tilstand", err);
        stopOplevelse();
        forberedMarkoerloes();
        return startKamera();
      })
    : spoergOmBevaegelse().then(startKamera);
  forsoeg
    .catch((err) => {
      console.error(err);
      afslut();
      toast(`<i class="ph-bold ph-camera-slash"></i>Kameraet startede ikke. Prøv 3D-visningen`);
    })
    .finally(() => $("#loader").classList.remove("vis"));
}

/* ---------------- AR med plakaten ---------------- */
async function startPlakat() {
  modus = "plakat";
  visSkaerm("oplevelse");
  $("#oplevelse").classList.remove("studie");
  $("#tilstand").textContent = "AR";
  $("#loader").classList.add("vis");
  $("#ark").classList.add("skjult");
  $("#placer").classList.add("skjult");
  $("#scan").classList.remove("skjult");

  try {
    const { MindARThree } = await import("mindar-image-three");
    mindar = new MindARThree({
      container: $("#scene"),
      imageTargetSrc: "assets/plakat.mind",
      uiLoading: "no", uiScanning: "no", uiError: "no",
      filterMinCF: 0.0001, filterBeta: 0.001,
      warmupTolerance: 3, missTolerance: 6,
    });
    ({ renderer, scene, camera } = mindar);
    opsaetRenderer(renderer);
    lys(scene, renderer, 0.9);

    anker = mindar.addAnchor(0);
    foelger = new THREE.Group();
    foelger.matrixAutoUpdate = true;
    scene.add(foelger);
    foelger.add(byggScene(false));
    saetOpacitet(scene3d, 0);
    foelger.visible = false;

    anker.onTargetFound = () => {
      $("#scan").classList.add("skjult");
      $("#ark").classList.remove("skjult");
      if (foersteFund) {
        foersteFund = false;
        visSko(index, 1, false).then(visGuide);
      }
      ringPuls();
    };
    anker.onTargetLost = () => {
      setTimeout(() => {
        if (performance.now() - sidstSet > 450) {
          $("#scan").classList.remove("skjult");
          $("#ark").classList.add("skjult");
        }
      }, 500);
    };

    hentSko(index);
    await mindar.start();
    ur = new THREE.Clock();
    renderer.setAnimationLoop(frame);
  } catch (err) {
    console.error(err);
    afslut();
    toast(`<i class="ph-bold ph-camera-slash"></i>Kameraet startede ikke. Prøv 3D-visningen`);
  } finally {
    $("#loader").classList.remove("vis");
  }
}

/* ---------------- 3D uden kamera ---------------- */
function start3D() {
  modus = "3d";
  visSkaerm("oplevelse");
  $("#oplevelse").classList.add("studie");
  $("#tilstand").textContent = "3D";
  $("#scan").classList.add("skjult");
  $("#placer").classList.add("skjult");
  $("#ark").classList.remove("skjult");

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  opsaetRenderer(renderer);
  $("#scene").appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  lys(scene, renderer, 1.1);
  scene.add(byggScene(true));
  tilpas3D();
  window.addEventListener("resize", tilpas3D);

  ur = new THREE.Clock();
  renderer.setAnimationLoop(frame);
  visSko(index, 1, false).then(visGuide);
  ringPuls();
}

function tilpas3D() {
  if (modus !== "3d") return;
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // Lidt luft over produktarket på mobil
  kameraTilpas(camera, w < h ? 1.5 : 2.2, w < h ? 0.02 : 0.15);
}

/* ---------------- Navigation ---------------- */
function visSkaerm(id) {
  document.querySelectorAll(".skaerm").forEach((s) => s.classList.toggle("aktiv", s.id === id));
}

function stopOplevelse() {
  modus = null; // først, så WebXR's "end" ikke kalder tilbage hertil
  if (renderer) renderer.setAnimationLoop(null);
  const session = renderer?.xr?.getSession?.();
  if (session) session.end().catch(() => {});
  hitKilde?.cancel?.();
  hitKilde = null;
  if (video) { video.srcObject?.getTracks().forEach((t) => t.stop()); video = null; }
  if (mindar) { try { mindar.stop(); } catch (_) {} mindar = null; }
  if (renderer) renderer.dispose();
  window.removeEventListener("resize", tilpas3D);
  window.removeEventListener("resize", tilpasKamera);
  $("#oplevelse").classList.remove("xr");
  $("#scene").innerHTML = "";
  $("#placer").classList.add("skjult");
  $("#flyt").hidden = true;
  plads?.clear();
  animationer.length = 0;
  skifter = false;
  harPose = false;
  placeret = false;
  harSigte = false;
  foersteFund = true;
  tilstede = 0;
  zoom = 1;
}

function afslut() {
  stopOplevelse();
  visSkaerm("start");
  pauseHero(false);
}

// Tryk på knapper i WebXR må ikke også placere skoen
for (const el of [".topbar", "#ark"]) $(el).addEventListener("beforexrselect", (e) => e.preventDefault());

$("#startAR").addEventListener("click", startAR);
$("#startPlakat").addEventListener("click", async () => {
  await spoergOmBevaegelse();
  pauseHero(true);
  startPlakat();
});
$("#start3D").addEventListener("click", () => {
  pauseHero(true);
  start3D();
});
$("#tilbage").addEventListener("click", afslut);
$("#flyt").addEventListener("click", flyt);

/* ---------------- Start ---------------- */
opdaterInfo();
Promise.race([
  Promise.all([document.fonts.ready, startHero()]),
  new Promise((ok) => setTimeout(ok, 2500)),
]).then(() => $("#start").classList.add("klar"));

if (location.hash === "#3d") start3D();
