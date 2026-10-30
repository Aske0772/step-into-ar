// Skokatalog + procedurale pladsholder-sko.
// Når rigtige modeller er klar, sæt `model: "modeller/xxx.glb"` på en sko, så loades den i stedet.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const BRAND = {
  navn: "NIKE",
  kampagne: "STEP INTO AR",
  disclaimer: "Studieprojekt – ikke tilknyttet eller godkendt af Nike.",
};

export const SKO = [
  {
    navn: "Air Pulse 01",
    farve: "Volt / Sort",
    pris: "1.299 kr.",
    farver: { overdel: 0x111111, saal: 0xf4f4f0, accent: 0xd4ff00, snoere: 0xd4ff00, foer: 0x2a2a2a },
  },
  {
    navn: "Air Pulse Ocean",
    farve: "Dyb blå / Hvid",
    pris: "1.399 kr.",
    farver: { overdel: 0x0b3d91, saal: 0xffffff, accent: 0x3fd0ff, snoere: 0xffffff, foer: 0x061e48 },
  },
  {
    navn: "Air Pulse Ember",
    farve: "Orange / Creme",
    pris: "1.299 kr.",
    farver: { overdel: 0xff5a1f, saal: 0xf3ead9, accent: 0x1a1a1a, snoere: 0xf3ead9, foer: 0x7a2408 },
  },
  {
    navn: "Air Pulse Triple White",
    farve: "Hvid / Grå",
    pris: "1.199 kr.",
    farver: { overdel: 0xf2f2f2, saal: 0xffffff, accent: 0x9a9a9a, snoere: 0xe0e0e0, foer: 0xbdbdbd },
  },
];

const loader = new GLTFLoader();

// Returnerer en THREE.Group med skoen, ca. 1 enhed lang, centreret og stående på y = 0.
export async function lavSko(data) {
  if (data.model) {
    const gltf = await loader.loadAsync(data.model);
    return normaliser(gltf.scene);
  }
  return proceduralSko(data.farver);
}

function normaliser(obj) {
  const boks = new THREE.Box3().setFromObject(obj);
  const str = boks.getSize(new THREE.Vector3());
  const skala = 1 / Math.max(str.x, str.z);
  obj.scale.setScalar(skala);
  boks.setFromObject(obj);
  const midt = boks.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(midt.x, boks.min.y, midt.z));
  const g = new THREE.Group();
  g.add(obj);
  return g;
}

// Smal skoen ind ved hæl, tå og ved anklen, så den ikke ligner en flad "kage"
function form(geo, bredde, top) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = THREE.MathUtils.clamp((v.x + 0.55) / 1.1, 0, 1);
    let f = 0.62 + 0.38 * Math.sin(Math.PI * Math.pow(t, 0.85));
    if (top) f *= 1 - 0.28 * THREE.MathUtils.clamp((v.y - 0.12) / 0.32, 0, 1);
    v.z = (v.z - bredde / 2) * f;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function ekstruder(shape, dybde, bevel) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: dybde,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 8,
    curveSegments: 40,
  });
  return geo;
}

function proceduralSko(c) {
  const g = new THREE.Group();
  const mat = (farve, ruhed = 0.55, ekstra = {}) =>
    new THREE.MeshPhysicalMaterial({ color: farve, roughness: ruhed, clearcoat: 0.25, ...ekstra });

  // Overdel set fra siden (hæl til venstre, tå til højre)
  const o = new THREE.Shape();
  o.moveTo(-0.47, 0.09);
  o.quadraticCurveTo(-0.53, 0.22, -0.47, 0.4);
  o.quadraticCurveTo(-0.42, 0.47, -0.33, 0.42);
  o.quadraticCurveTo(-0.24, 0.37, -0.15, 0.44);
  o.quadraticCurveTo(-0.08, 0.49, -0.02, 0.4);
  o.quadraticCurveTo(0.18, 0.28, 0.36, 0.22);
  o.quadraticCurveTo(0.52, 0.17, 0.5, 0.09);
  o.lineTo(-0.47, 0.09);
  const overdel = new THREE.Mesh(form(ekstruder(o, 0.3, 0.05), 0.3, true), mat(c.overdel, 0.7, { sheen: 0.25, sheenColor: new THREE.Color(c.overdel).lerp(new THREE.Color(0xffffff), 0.3) }));
  g.add(overdel);

  // Sål (bredere, med opbuet tå)
  const s = new THREE.Shape();
  s.moveTo(-0.52, 0.0);
  s.lineTo(0.48, 0.0);
  s.quadraticCurveTo(0.58, 0.02, 0.56, 0.1);
  s.lineTo(-0.5, 0.11);
  s.quadraticCurveTo(-0.56, 0.06, -0.52, 0.0);
  const saal = new THREE.Mesh(form(ekstruder(s, 0.36, 0.035), 0.36, false), mat(c.saal, 0.4));
  g.add(saal);

  // Accent-stribe i mellemsålen ("air"-vindue)
  const a = new THREE.Shape();
  a.moveTo(-0.46, 0.035);
  a.lineTo(-0.12, 0.035);
  a.quadraticCurveTo(-0.08, 0.06, -0.12, 0.085);
  a.lineTo(-0.46, 0.085);
  a.quadraticCurveTo(-0.5, 0.06, -0.46, 0.035);
  const accent = new THREE.Mesh(form(ekstruder(a, 0.37, 0.01), 0.37, false), mat(c.accent, 0.15, { transmission: 0.3, thickness: 0.05 }));
  g.add(accent);

  // Sideswoosh-agtig stribe (generisk kurve, ikke et logo)
  const kurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.38, 0.17, 0),
    new THREE.Vector3(-0.1, 0.15, 0),
    new THREE.Vector3(0.15, 0.2, 0),
    new THREE.Vector3(0.32, 0.27, 0),
  ]);
  for (const side of [1, -1]) {
    const stribe = new THREE.Mesh(new THREE.TubeGeometry(kurve, 40, 0.018, 10, false), mat(c.accent, 0.3));
    stribe.position.z = side * 0.165;
    stribe.scale.z = 0.4;
    g.add(stribe);
  }

  // Snørebånd
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = THREE.MathUtils.lerp(-0.02, 0.26, t);
    const y = THREE.MathUtils.lerp(0.41, 0.27, t) + 0.025;
    const baand = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.2, 4, 10), mat(c.snoere, 0.7));
    baand.rotation.x = Math.PI / 2;
    baand.position.set(x, y, 0);
    baand.rotation.z = -0.55;
    g.add(baand);
  }

  // Skoåbning (mørk foring)
  const aabning = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.04, 32), mat(c.foer, 0.9));
  aabning.scale.set(1.35, 1, 0.85);
  aabning.position.set(-0.3, 0.43, 0);
  aabning.rotation.z = 0.12;
  g.add(aabning);

  // Hælstrop
  const hael = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 10, 24, Math.PI), mat(c.accent, 0.4));
  hael.position.set(-0.5, 0.42, 0);
  hael.rotation.y = Math.PI / 2;
  g.add(hael);

  // Centrer på z (ekstrudering starter i z = 0)
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
    }
  });
  const boks = new THREE.Box3().setFromObject(g);
  const midt = boks.getCenter(new THREE.Vector3());
  g.children.forEach((b) => {
    b.position.x -= midt.x;
    b.position.z -= midt.z;
  });
  return g;
}
