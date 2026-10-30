import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BRAND, SKO, lavSko } from "./sko.js";

const $ = (s) => document.querySelector(s);
const ACCENT = 0xd4ff00;

document.querySelectorAll("[data-brand]").forEach((el) => (el.textContent = BRAND.navn));
document.querySelectorAll("[data-disclaimer]").forEach((el) => (el.textContent = BRAND.disclaimer));

/* ------------------------------------------------------------------ */
/* Tilstand                                                             */
/* ------------------------------------------------------------------ */
let index = 0;
let modus = null;          // "ar" | "3d"
let renderer, scene, camera, mindar, ur;
let scenen;                // Group: podie + drejeskive (placeres på plakaten eller frit i 3D)
let drejeskive;            // Group der drejes med fingeren
let plads;                 // Group der holder den aktuelle sko
let ring, partikler;
let synlig = false;        // er plakaten fundet (AR) / er scenen vist (3D)
let tilt = 0.5;            // 0 = plakat på bordet, 1 = plakat på væg/skærm
const skoCache = new Map();
const animationer = [];

/* ------------------------------------------------------------------ */
/* Små animationshjælpere                                               */
/* ------------------------------------------------------------------ */
const easeOutBack = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
const easeInCubic = (t) => t * t * t;

function tween(varighed, opdater, ease = (t) => t) {
  return new Promise((ok) => animationer.push({ start: performance.now(), varighed, opdater, ease, ok }));
}

function koerAnimationer(nu) {
  for (let i = animationer.length - 1; i >= 0; i--) {
    const a = animationer[i];
    const t = Math.min(1, (nu - a.start) / a.varighed);
    a.opdater(a.ease(t));
    if (t >= 1) {
      animationer.splice(i, 1);
      a.ok();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Scene-indhold (fælles for AR og 3D)                                  */
/* ------------------------------------------------------------------ */
function byggScene() {
  scenen = new THREE.Group();

  // Podie: mørk glasskive + lysende ring
  const skive = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.66, 0.035, 64),
    new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.25, metalness: 0.2, clearcoat: 1 })
  );
  skive.position.y = -0.02;
  scenen.add(skive);

  ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.64, 0.012, 16, 96),
    new THREE.MeshBasicMaterial({ color: ACCENT })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.0;
  scenen.add(ring);

  // Blød kontaktskygge under skoen
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const skygge = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
  );
  skygge.rotation.x = -Math.PI / 2;
  skygge.position.y = 0.0;
  scenen.add(skygge);

  // Svævende lyspartikler omkring skoen
  const antal = 60;
  const pos = new Float32Array(antal * 3);
  for (let i = 0; i < antal; i++) {
    const v = Math.random() * Math.PI * 2;
    const r = 0.35 + Math.random() * 0.45;
    pos.set([Math.cos(v) * r, Math.random() * 0.9, Math.sin(v) * r], i * 3);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  partikler = new THREE.Points(
    pg,
    new THREE.PointsMaterial({ color: ACCENT, size: 0.018, transparent: true, opacity: 0.8, depthWrite: false })
  );
  scenen.add(partikler);

  drejeskive = new THREE.Group();
  drejeskive.position.y = 0.06;
  scenen.add(drejeskive);
  plads = new THREE.Group();
  drejeskive.add(plads);

  return scenen;
}

function lys(sc, r) {
  const pmrem = new THREE.PMREMGenerator(r);
  sc.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(1, 2, 1.5);
  sc.add(sol);
  const kant = new THREE.DirectionalLight(0xd4ff00, 0.6);
  kant.position.set(-1.5, 0.5, -1);
  sc.add(kant);
}

function opsaetRenderer(r) {
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

/* ------------------------------------------------------------------ */
/* Sko: hent, vis og skift                                              */
/* ------------------------------------------------------------------ */
async function hentSko(i) {
  if (!skoCache.has(i)) skoCache.set(i, lavSko(SKO[i]));
  return skoCache.get(i);
}

let skifter = false;
async function visSko(ny, retning = 1) {
  if (skifter) return;
  skifter = true;
  const gammel = plads.children[0];
  index = (ny + SKO.length) % SKO.length;
  opdaterInfo();

  if (gammel) {
    await tween(260, (t) => {
      gammel.scale.setScalar(1 - t);
      gammel.position.x = -retning * 0.5 * t;
      gammel.rotation.y = -retning * t * 1.2;
    }, easeInCubic);
    plads.remove(gammel);
  }

  const sko = await hentSko(index);
  sko.scale.setScalar(0.001);
  sko.position.set(retning * 0.5, 0, 0);
  sko.rotation.set(0, retning * 1.5, 0);
  plads.add(sko);
  pulsRing();
  await tween(650, (t) => {
    sko.scale.setScalar(Math.max(0.001, t));
    sko.position.x = retning * 0.5 * (1 - Math.min(1, t));
    sko.rotation.y = retning * 1.5 * (1 - Math.min(1, t));
  }, easeOutBack);
  skifter = false;
}

function pulsRing() {
  tween(700, (t) => {
    const s = 1 + Math.sin(t * Math.PI) * 0.12;
    ring.scale.set(s, s, s);
  });
}

function opdaterInfo() {
  const d = SKO[index];
  const info = $(".info");
  info.classList.add("skift");
  setTimeout(() => {
    $("#navn").textContent = d.navn;
    $("#farve").textContent = d.farve;
    $("#pris").textContent = d.pris;
    info.classList.remove("skift");
  }, 180);
  document.querySelectorAll("#prikker span").forEach((p, i) => p.classList.toggle("aktiv", i === index));
}

$("#prikker").innerHTML = SKO.map(() => "<span></span>").join("");
$("#naeste").addEventListener("click", () => visSko(index + 1, 1));
$("#forrige").addEventListener("click", () => visSko(index - 1, -1));
$("#koeb").addEventListener("click", () =>
  toast(`Demo: ${SKO[index].navn} lagt i kurven`)
);

function toast(tekst) {
  const t = $("#toast");
  t.textContent = tekst;
  t.classList.add("vis");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("vis"), 2200);
}

/* ------------------------------------------------------------------ */
/* Fingerstyring: træk = drej, hurtigt swipe = næste/forrige            */
/* ------------------------------------------------------------------ */
let fart = 0;           // drejehastighed fra fingeren (rad pr. frame)
let sidstRoert = 0;
(() => {
  const flade = $("#oplevelse");
  let ned = null;
  flade.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".kort, .topbar")) return;
    ned = { x: e.clientX, sx: e.clientX, t: performance.now() };
  });
  flade.addEventListener("pointermove", (e) => {
    if (!ned) return;
    const dx = e.clientX - ned.x;
    ned.x = e.clientX;
    drejeskive.rotation.y += dx * 0.012;
    fart = dx * 0.012;
    sidstRoert = performance.now();
  });
  const slip = (e) => {
    if (!ned) return;
    const dx = e.clientX - ned.sx;
    const dt = performance.now() - ned.t;
    if (Math.abs(dx) > 70 && dt < 300) {
      fart = 0;
      visSko(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    }
    ned = null;
  };
  flade.addEventListener("pointerup", slip);
  flade.addEventListener("pointercancel", () => (ned = null));
})();

/* ------------------------------------------------------------------ */
/* Plakatens orientering (bord vs. væg) ud fra telefonens hældning      */
/* ------------------------------------------------------------------ */
let beta = 60;
window.addEventListener("deviceorientation", (e) => {
  if (e.beta != null) beta = Math.abs(e.beta);
});
async function spoergOmBevaegelse() {
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) {
      await DeviceOrientationEvent.requestPermission();
    }
  } catch (_) { /* uden tilladelse antager vi væg/skærm */ }
}
const QBORD = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const QVAEG = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, 0));
const PBORD = new THREE.Vector3(0, -0.08, 0.02);
const PVAEG = new THREE.Vector3(0, -0.42, 0.3);

/* ------------------------------------------------------------------ */
/* Fælles render-loop                                                   */
/* ------------------------------------------------------------------ */
function frame() {
  const nu = performance.now();
  const dt = Math.min(0.05, ur.getDelta());
  koerAnimationer(nu);

  // Drej selv langsomt, når fingeren ikke rører
  if (nu - sidstRoert > 1200) {
    drejeskive.rotation.y += 0.45 * dt;
  } else {
    drejeskive.rotation.y += fart;
    fart *= 0.92;
  }
  const svaev = Math.sin(nu * 0.0016) * 0.025;
  plads.position.y = 0.03 + svaev;

  const p = partikler.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i) + dt * 0.08;
    if (y > 0.95) y = 0;
    p.setY(i, y);
  }
  p.needsUpdate = true;
  partikler.rotation.y += dt * 0.15;

  if (modus === "ar") {
    // Telefon holdt fladt (lille beta) => plakaten ligger på bordet
    const maal = THREE.MathUtils.clamp((beta - 35) / 30, 0, 1);
    tilt += (maal - tilt) * 0.05;
    scenen.quaternion.slerpQuaternions(QBORD, QVAEG, tilt);
    scenen.position.lerpVectors(PBORD, PVAEG, tilt);
  }
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ */
/* AR-tilstand (MindAR billedgenkendelse)                               */
/* ------------------------------------------------------------------ */
async function startAR() {
  modus = "ar";
  visSkaerm("oplevelse");
  $("#oplevelse").classList.remove("tredje");
  $("#tilstand").textContent = "AR";
  $("#loader").classList.add("vis");
  $("#kort").classList.add("skjult");
  $("#scan").classList.remove("skjult");

  try {
    const { MindARThree } = await import("mindar-image-three");
    mindar = new MindARThree({
      container: $("#scene"),
      imageTargetSrc: "assets/plakat.mind",
      uiLoading: "no",
      uiScanning: "no",
      uiError: "no",
      filterMinCF: 0.0001,
      filterBeta: 0.004,
    });
    ({ renderer, scene, camera } = mindar);
    opsaetRenderer(renderer);
    lys(scene, renderer);

    const anker = mindar.addAnchor(0);
    const s = byggScene();
    s.scale.setScalar(0.7);
    anker.group.add(s);

    anker.onTargetFound = () => {
      synlig = true;
      $("#scan").classList.add("skjult");
      $("#kort").classList.remove("skjult");
      if (!plads.children.length) visSko(index, 1);
      else pulsRing();
    };
    anker.onTargetLost = () => {
      synlig = false;
      $("#scan").classList.remove("skjult");
      $("#kort").classList.add("skjult");
    };

    hentSko(index);
    await mindar.start();
    ur = new THREE.Clock();
    renderer.setAnimationLoop(frame);
  } catch (err) {
    console.error(err);
    stopAlt();
    visSkaerm("start");
    toast("Kameraet kunne ikke starte – prøv 3D-visning");
  } finally {
    $("#loader").classList.remove("vis");
  }
}

/* ------------------------------------------------------------------ */
/* 3D-tilstand (uden kamera og plakat)                                  */
/* ------------------------------------------------------------------ */
async function start3D() {
  modus = "3d";
  visSkaerm("oplevelse");
  $("#oplevelse").classList.add("tredje");
  $("#tilstand").textContent = "3D";
  $("#scan").classList.add("skjult");
  $("#kort").classList.remove("skjult");

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  opsaetRenderer(renderer);
  $("#scene").appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
  lys(scene, renderer);

  const s = byggScene();
  scene.add(s);
  tilpasStoerrelse();
  window.addEventListener("resize", tilpasStoerrelse);

  ur = new THREE.Clock();
  renderer.setAnimationLoop(frame);
  synlig = true;
  visSko(index, 1);
}

function tilpasStoerrelse() {
  if (modus !== "3d") return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // Skoen fylder bredden på mobil og lidt mindre på store skærme
  const afstand = w < h ? 4.6 : 3.0;
  camera.position.set(0, afstand * 0.3, afstand);
  camera.lookAt(0, w < h ? 0.05 : 0.2, 0);
  camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------------ */
/* Navigation                                                           */
/* ------------------------------------------------------------------ */
function visSkaerm(id) {
  document.querySelectorAll(".skaerm").forEach((s) => s.classList.toggle("aktiv", s.id === id));
}

function stopAlt() {
  if (renderer) renderer.setAnimationLoop(null);
  if (mindar) {
    try { mindar.stop(); } catch (_) {}
    mindar = null;
  }
  if (renderer) renderer.dispose();
  $("#scene").innerHTML = "";
  plads?.clear();
  animationer.length = 0;
  skifter = false;
  synlig = false;
  modus = null;
}

$("#startAR").addEventListener("click", async () => {
  await spoergOmBevaegelse();
  startAR();
});
$("#start3D").addEventListener("click", start3D);
$("#tilbage").addEventListener("click", () => {
  stopAlt();
  visSkaerm("start");
});

// Direkte link til 3D-tilstand: index.html#3d
if (location.hash === "#3d") start3D();
