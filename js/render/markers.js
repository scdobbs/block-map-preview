// Strike-and-dip markers: field measurements a student drops onto the land
// surface.
//
// A marker stores only where it sits on the map — { x, y }. Its height is the
// terrain height there, and its reading is whatever the bedding is doing
// underneath it, recovered the same way the identify tool recovers it. Nothing
// about the attitude is stored, so a marker can never disagree with the rock
// it is standing on: change the geology, or slide the marker across a fold,
// and the symbol swings round to match.
//
// On the block, the symbol is drawn IN the bedding plane rather than flat on
// the map. Seen from directly above it is the ordinary map symbol; seen
// obliquely it tilts with the bed, which is the whole point of a block diagram.
//
// In map view it lies flat instead, because there the symbol is not a piece of
// a bed any more — it is a printed mark on a sheet of paper, and reading those
// is the skill the tool exists to teach.

import * as THREE from '../../vendor/three.module.js';
import { surfaceHeight } from '../geo/surfaces.js';
import { beddingAt } from '../geo/unmake.js';
import { azimuthVec, planeFrame, normalize, FLAT_DIP, VERTICAL_DIP } from '../geo/math.js';
import { sliceCut } from '../geo/model.js';

// Below this the strike of a bed is not meaningfully defined, and above it the
// two dip directions are indistinguishable — both get their own map symbol.
// Exported because the panel list and the tab-bar mark have to agree with what
// is actually drawn on the block.
// Defined in geo/math.js so the 2D field map shares them. Re-exported here
// because this is where the rest of the app has always imported them from.
export { FLAT_DIP, VERTICAL_DIP };

const INK = 0x14181b;
const HALO = 0xf3f1ea;
const SELECT = 0xffc857;

// Every marker is rebuilt on every pointer move while one is dragged, so the
// pieces that never differ between markers are made once and shared. Anything
// flagged `shared` must survive the disposal that precedes each rebuild.
const UNIT_SPHERE = new THREE.SphereGeometry(1, 10, 8);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const HIT_MATERIAL = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

/** Where one marker sits, and what the rock beneath it is doing. */
export function readMarker(doc, history, m) {
  const z = surfaceHeight(doc.topo, m.x, m.y);
  // Sample a hair below the ground: that is the outcrop, and it keeps the
  // "am I inside an intrusion" test on the right side of the contact.
  const bed = beddingAt(history, [m.x, m.y, z - 0.5]);
  return {
    id: m.id,
    x: m.x,
    y: m.y,
    z,
    strike: bed ? bed.strike : null,
    dip: bed ? bed.dip : null,
    overturned: bed ? bed.overturned === true : false,
  };
}

export function readMarkers(doc, history) {
  return (doc.markers || []).map((m) => readMarker(doc, history, m));
}

/** How a reading is written in a notebook: 042/30, or a word when it has no attitude. */
export function formatReading(r) {
  if (r.dip == null) return 'no bedding';
  if (r.dip < FLAT_DIP) return 'horizontal';
  // Past vertical the two dip directions are indistinguishable, and so is
  // which way up the beds are: a vertical bed is its own overturned twin.
  if (r.dip > VERTICAL_DIP) return `${pad3(r.strike)} vertical`;
  const a = `${pad3(r.strike)}/${Math.round(r.dip)}`;
  return r.overturned ? `${a} overturned` : a;
}

export function pad3(v) { return String(Math.round(v) % 360).padStart(3, '0'); }

/** Symbol size in metres, so one setting reads the same on any size of block. */
export function markerSize(doc) {
  const span = Math.hypot(doc.block.width, doc.block.depth);
  // Map view fills the screen with the map alone, so the same symbol lands
  // bigger on it than on the block. Trimmed back so a dense set of readings
  // stays legible rather than overlapping.
  const forMap = doc.settings.mapView === true ? 0.8 : 1;
  return span * 0.042 * (doc.settings.markerSize || 1) * forMap;
}

/**
 * Build every marker symbol, plus the invisible spheres the pointer picks
 * against.
 *
 * Vertical exaggeration is applied here rather than by scaling the group:
 * scaling would stretch the symbol's own strokes and its dip number along
 * with it. Instead the marker is placed at the exaggerated height and its
 * plane is tilted to the exaggerated attitude — the bed's normal with its
 * vertical component divided by the stretch — so the symbol keeps lying flat
 * on the beds the shader draws while staying a clean, undistorted mark.
 */
export function buildMarkers(doc, readings, selectedId) {
  const group = new THREE.Group();
  const hits = new THREE.Group();
  if (doc.settings.showMarkers === false) return { group, hits };

  const S = markerSize(doc);
  const ex = doc.settings.exaggeration || 1;
  const map = doc.settings.mapView === true;
  // A station stands on the ground. Slice the ground away from under one and
  // it must go too, rather than hovering over the cut face pointing at rock
  // hundreds of metres below the outcrop it was read on.
  const cut = sliceCut(doc);

  for (const r of readings) {
    if (cut != null && r.z > cut) continue;
    const selected = r.id === selectedId;
    const basis = map ? flatBasis(r) : displayBasis(r, ex);
    const center = [r.x, r.y, liftedZ(doc, r, S, basis, ex)];

    const ink = [];
    const halo = [];
    const w = S * 0.08;

    if (r.dip == null) {
      // No bedding to measure — a bare station dot, not a false reading.
      ring(ink, center, basis, S * 0.30, w);
      ring(halo, center, basis, S * 0.30, w * 1.9);
    } else if (r.dip < FLAT_DIP) {
      // Horizontal beds: a cross in a circle, with no strike to point along.
      horizontalMark(ink, center, basis, S, w);
      horizontalMark(halo, center, basis, S, w * 1.9);
    } else if (r.dip > VERTICAL_DIP) {
      // Vertical beds: strike line with a tick to either side of it.
      verticalMark(ink, center, basis, S, w);
      verticalMark(halo, center, basis, S, w * 1.9);
    } else {
      inclinedMark(ink, center, basis, S, w, r.overturned);
      inclinedMark(halo, center, basis, S, w * 1.9, r.overturned);
    }

    if (selected) {
      // A translucent patch of the bedding plane itself, so the marker being
      // dragged reads as an attitude and not just as an icon. Kept inside the
      // footprint the lift already clears, so selecting one cannot make it
      // hop up off the ground.
      group.add(disc(center, basis, S * 1.0, SELECT, 0.22, 3));
    }
    // Selection lights up the halo rather than the ink: an accent-colored
    // symbol on pale sandstone is a symbol you cannot read.
    group.add(strokes(halo, selected ? SELECT : HALO, 0.95, 4));
    group.add(strokes(ink, INK, 1, 5));

    // Only an inclined bed gets a number. Horizontal and vertical beds are
    // fully described by their own symbols, and a number lettered in a
    // vertical plane is unreadable from anywhere but the side.
    if (r.dip != null && r.dip >= FLAT_DIP && r.dip <= VERTICAL_DIP) {
      group.add(dipNumber(r, center, basis, S));
    }

    hits.add(hitSphere(center, S * 1.15, r.id));
  }

  // A map symbol is printed over the map, never buried in it. Nothing in a
  // plan view has a depth for it to lose against anyway.
  if (map) {
    group.traverse((o) => { if (o.material) o.material.depthTest = false; });
  }

  return { group, hits };
}

// ---------------------------------------------------------------------------
// Orientation
// ---------------------------------------------------------------------------

/**
 * Orthonormal frame the symbol is drawn in:
 *   X  along strike
 *   Y  up dip (so -Y is the way the dip tick points)
 *   Z  the bed normal, as the eye sees it under vertical exaggeration
 */
function displayBasis(r, ex) {
  if (r.dip == null) return { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
  const { normal } = planeFrame(r.strike, r.dip);
  // Stretching the world vertically by `ex` tilts a plane's normal by
  // dividing its vertical part — the inverse-transpose of that stretch.
  const Z = normalize([normal[0], normal[1], normal[2] / ex]);
  // Strike is horizontal, and a vertical stretch leaves horizontal directions
  // alone, so it is still exactly perpendicular to the tilted normal.
  const X = azimuthVec(r.strike);
  const Y = [
    Z[1] * X[2] - Z[2] * X[1],
    Z[2] * X[0] - Z[0] * X[2],
    Z[0] * X[1] - Z[1] * X[0],
  ];
  return { X, Y, Z };
}

/**
 * The same frame drawn flat on the map: strike along X, the dip tick pointing
 * down the dip azimuth, and the sheet of paper for a plane.
 */
function flatBasis(r) {
  if (r.dip == null) return { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
  const X = azimuthVec(r.strike);
  // Dip azimuth is 90 degrees clockwise from strike, and Y is up-dip, so Y is
  // 90 degrees counter-clockwise from strike.
  return { X, Y: [-X[1], X[0], 0], Z: [0, 0, 1] };
}

// How far from its center the symbol actually reaches, in units of S: the
// strike bar ends at 0.75, and the dip number's far corner a little past 1.
const REACH = 1.1;

/**
 * Height to hang the symbol at.
 *
 * The naive version — clear the highest ground nearby, then add a fudge for
 * the tilt — gets it wrong in both directions: too low, so the down-dip end of
 * a steep symbol and its number sink into the hill, and too high on the
 * up-dip side, where nothing needed clearing. So instead ask the question the
 * symbol actually poses. Every point of it sits a known height `dz` above its
 * own center, fixed by the plane it lies in; for that point to clear the
 * ground under it the center must be at least `terrain + clearance - dz`.
 * Take the largest such demand over the whole footprint and you have the
 * lowest the symbol can hang without any part of it going under.
 *
 * The result is a symbol that touches the ground along its lowest edge and
 * leans on the slope, rather than one that floats or one that is half buried.
 */
function liftedZ(doc, r, S, basis, ex) {
  const clearance = Math.max(2, S * 0.06);
  const R = S * REACH;
  let need = -Infinity;

  // Center, plus two rings — the terrain here is built from sinusoids hundreds
  // of metres long, so it cannot hide a spike between samples.
  for (const [u, v] of footprintSamples(R)) {
    const x = r.x + basis.X[0] * u + basis.Y[0] * v;
    const y = r.y + basis.X[1] * u + basis.Y[1] * v;
    const dz = basis.X[2] * u + basis.Y[2] * v;
    need = Math.max(need, surfaceHeight(doc.topo, x, y) * ex + clearance - dz);
  }
  return need;
}

const SAMPLE_CACHE = new Map();

/** Offsets covering the symbol's footprint, in its own plane coordinates. */
function footprintSamples(R) {
  const hit = SAMPLE_CACHE.get(R);
  if (hit) return hit;
  const out = [[0, 0]];
  for (const rad of [R * 0.55, R]) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      out.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
  }
  // One radius per block size and symbol setting, so this stays tiny.
  if (SAMPLE_CACHE.size > 8) SAMPLE_CACHE.clear();
  SAMPLE_CACHE.set(R, out);
  return out;
}

// ---------------------------------------------------------------------------
// Symbol shapes, in plane coordinates (u along strike, v up dip)
// ---------------------------------------------------------------------------

/**
 * Strike bar and dip tick, with the tick recurved when the beds are
 * overturned — the hook a geologic map prints to say the succession in them
 * runs the wrong way up.
 *
 * The hook turns sideways and comes back UP-dip rather than continuing past
 * the end of the tick, which is not only how the printed symbol is drawn but
 * is what keeps it free: the symbol's reach is unchanged, so the dip number
 * still sits where it always did and `liftedZ` still clears the same
 * footprint.
 */
function inclinedMark(out, C, B, S, w, overturned = false) {
  const tip = -S * 0.48;
  bar(out, C, B, [-S * 0.75, 0], [S * 0.75, 0], w);         // strike
  bar(out, C, B, [0, 0], [0, tip], w);                       // dip tick
  if (!overturned) return;
  bar(out, C, B, [0, tip], [S * 0.22, tip], w);              // across
  bar(out, C, B, [S * 0.22, tip], [S * 0.22, tip + S * 0.30], w);   // and back
}

function verticalMark(out, C, B, S, w) {
  bar(out, C, B, [-S * 0.75, 0], [S * 0.75, 0], w);
  bar(out, C, B, [0, -S * 0.30], [0, S * 0.30], w);
}

function horizontalMark(out, C, B, S, w) {
  bar(out, C, B, [-S * 0.62, 0], [S * 0.62, 0], w);
  bar(out, C, B, [0, -S * 0.62], [0, S * 0.62], w);
  ring(out, C, B, S * 0.26, w);
}

/** A rectangle from a to b in plane coordinates, `w` to either side. */
function bar(out, C, B, a, b, w) {
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  dx /= L; dy /= L;
  // Square caps stretched by half a width, so corners meet cleanly.
  const a0 = [a[0] - dx * w, a[1] - dy * w];
  const b0 = [b[0] + dx * w, b[1] + dy * w];
  const nx = -dy * w, ny = dx * w;
  quad(out, C, B,
    [a0[0] + nx, a0[1] + ny], [b0[0] + nx, b0[1] + ny],
    [b0[0] - nx, b0[1] - ny], [a0[0] - nx, a0[1] - ny]);
}

function ring(out, C, B, radius, w, seg = 24) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const ri = radius - w, ro = radius + w;
    quad(out, C, B,
      [Math.cos(a0) * ri, Math.sin(a0) * ri],
      [Math.cos(a1) * ri, Math.sin(a1) * ri],
      [Math.cos(a1) * ro, Math.sin(a1) * ro],
      [Math.cos(a0) * ro, Math.sin(a0) * ro]);
  }
}

function quad(out, C, B, p0, p1, p2, p3) {
  const w = (p) => [
    C[0] + B.X[0] * p[0] + B.Y[0] * p[1],
    C[1] + B.X[1] * p[0] + B.Y[1] * p[1],
    C[2] + B.X[2] * p[0] + B.Y[2] * p[1],
  ];
  const [a, b, c, d] = [w(p0), w(p1), w(p2), w(p3)];
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
}

// ---------------------------------------------------------------------------
// Meshes
// ---------------------------------------------------------------------------

/**
 * Symbol ink and its halo are exactly coplanar, so they are ordered by
 * `renderOrder` with depth writing off rather than by nudging one of them
 * along the normal — a nudge big enough to beat depth precision at block scale
 * is big enough to see.
 */
function strokes(positions, color, opacity, order) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
  }));
  mesh.renderOrder = order;
  return mesh;
}

function disc(C, B, radius, color, opacity, order) {
  const pos = [];
  const seg = 32;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    quad(pos, C, B, [0, 0],
      [Math.cos(a0) * radius, Math.sin(a0) * radius],
      [Math.cos(a1) * radius, Math.sin(a1) * radius],
      [0, 0]);
  }
  return strokes(pos, color, opacity, order);
}

/**
 * The dip amount, lying in the bedding plane just past the tick, the way it is
 * lettered on a map.
 *
 * It stays in the bedding plane, but its rotation WITHIN that plane is not the
 * strike — it is whichever in-plane direction points most nearly due east.
 * That is the one that reads left to right on a north-up map, so the number
 * stays upright however the bed happens to be turned.
 */
function dipNumber(r, C, B, S) {
  const text = String(Math.round(r.dip));
  const h = S * 0.55;
  const mat = new THREE.MeshBasicMaterial({
    map: numberTexture(text), transparent: true, depthWrite: false,
  });
  // A shared 1x1 plane, sized by the basis rather than by its own geometry.
  const mesh = new THREE.Mesh(UNIT_PLANE, mat);
  mesh.userData.sharedGeometry = true;

  // Maximize the eastward component of cos(t)X + sin(t)Y.
  const t = Math.atan2(B.Y[0], B.X[0]);
  const ct = Math.cos(t), st = Math.sin(t);
  const across = new THREE.Vector3(
    B.X[0] * ct + B.Y[0] * st,
    B.X[1] * ct + B.Y[1] * st,
    B.X[2] * ct + B.Y[2] * st,
  ).multiplyScalar(h * 1.7);
  const Z = new THREE.Vector3(...B.Z);
  const up = new THREE.Vector3(...B.Z).cross(across).setLength(h);

  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeBasis(across, up, Z);
  // Sits past the end of the dip tick, on the down-dip side.
  const d = -S * 0.48 - h * 0.62;
  mesh.matrix.setPosition(
    C[0] + B.Y[0] * d, C[1] + B.Y[1] * d, C[2] + B.Y[2] * d,
  );
  mesh.renderOrder = 6;
  return mesh;
}

// Keyed on the number itself, so dragging a marker through the same dip twice
// costs nothing. The key space is small and fixed — the integers a dip can be —
// so the cache cannot grow without bound and never needs evicting.
const textureCache = new Map();

function numberTexture(text) {
  if (textureCache.has(text)) return textureCache.get(text);
  const W = 176, H = 104;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.font = 'bold 78px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(243, 241, 234, 0.95)';
  g.lineWidth = 12;
  g.strokeText(text, W / 2, H / 2 + 3);
  g.fillStyle = '#14181b';
  g.fillText(text, W / 2, H / 2 + 3);

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  textureCache.set(text, tex);
  return tex;
}

/**
 * The pick target. It has to render to keep three.js raycasting it, but it
 * writes neither color nor depth, so nothing of it reaches the screen.
 */
function hitSphere(center, radius, id) {
  const mesh = new THREE.Mesh(UNIT_SPHERE, HIT_MATERIAL);
  mesh.position.set(center[0], center[1], center[2]);
  mesh.scale.setScalar(radius);
  mesh.renderOrder = -1;
  mesh.userData.markerId = id;
  mesh.userData.sharedGeometry = true;
  mesh.userData.sharedMaterial = true;
  return mesh;
}
