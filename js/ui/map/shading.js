// Turning unit patches into something the map can draw.
//
// The flood itself knows nothing about maps (field/patches.js); this is the
// thin piece that runs it in Web Mercator, paints the result, and decides when
// it is worth doing again.

import { lonToWorld, latToWorld, clampLat } from '../../field/geo.js';
import { floodPatches, extentOf, BARRIER_KINDS } from '../../field/patches.js';
import { unitColor } from '../../field/model.js';

/** Web Mercator is what the canvas draws in, so the flood runs there too. */
function toWorld(lon, lat) {
  return [lonToWorld(lon), latToWorld(clampLat(lat))];
}

/**
 * A cheap identity for "would the shading come out the same?".
 *
 * The geometry of every barrier and every seed, and nothing else — the colours
 * are repainted from it cheaply, and panning must never trigger a re-flood.
 */
export function shadingKey(doc) {
  const lines = (doc.lines || [])
    .filter((l) => BARRIER_KINDS.has(l.kind))
    .map((l) => `${l.id}:${(l.points || []).length}:${hashPts(l.points)}`);
  const seeds = (doc.patches || []).map((p) => `${p.id}:${p.lon.toFixed(6)},${p.lat.toFixed(6)}:${p.unitName}`);
  const units = (doc.units || []).map((u) => `${u.name}:${unitColor(u)}`);
  return `${lines.join('|')}#${seeds.join('|')}#${units.join('|')}`;
}

function hashPts(pts) {
  let h = 0;
  for (const p of pts || []) {
    h = (h * 31 + Math.round(p[0] * 1e5)) | 0;
    h = (h * 31 + Math.round(p[1] * 1e5)) | 0;
  }
  return h;
}

/**
 * Flood the patches and paint them.
 *
 * Returns { canvas, box, wide, counts } for the map to draw, or null when
 * there is nothing to shade.
 */
export function buildShading(doc, { res = 640 } = {}) {
  const patches = (doc.patches || []).filter((p) => Number.isFinite(p.lon));
  if (!patches.length) return null;

  const lines = (doc.lines || [])
    .filter((l) => BARRIER_KINDS.has(l.kind) && (l.points || []).length > 1)
    .map((l) => ({ kind: l.kind, pts: l.points.map(([lon, lat]) => toWorld(lon, lat)) }));
  const seeds = patches.map((p) => {
    const [x, y] = toWorld(p.lon, p.lat);
    return { id: p.id, x, y };
  });

  const box = extentOf(lines, seeds);
  if (!box) return null;

  const flood = floodPatches({ lines, seeds, box, res });

  // Colour by unit name, so a patch matches the same unit named anywhere
  // else. A unit set up in advance brings its own colour; one that only exists
  // because somebody typed it on the outcrop gets a stable colour derived from
  // the name — which is the common case in the field, and every unit coming
  // out the same default sandstone would make the shading useless exactly when
  // it is most wanted.
  const byName = new Map((doc.units || []).map((u) => [String(u.name || '').trim().toLowerCase(), u]));
  const rgb = patches.map((p) => {
    const key = String(p.unitName || '').trim().toLowerCase();
    const u = byName.get(key);
    return u ? hexToRgb(unitColor(u)) : colorFor(key);
  });

  // A fill that took most of the sheet is not shaded. It is drawn nowhere
  // rather than everywhere: a wash over the whole map hides the very lines
  // that would let somebody fix it, and it says nothing that the panel does
  // not say better in words.
  const hidden = new Set();
  patches.forEach((p, i) => { if (flood.wide.has(p.id)) hidden.add(i); });

  const { owner, nx, ny } = flood;
  const img = new ImageData(nx, ny);
  const px = img.data;
  for (let j = 0; j < ny; j++) {
    // No flip. The flood ran in Web Mercator, whose Y already increases
    // southward, so row 0 is the north edge and so is the canvas's — unlike
    // the DEM grids elsewhere, which are built south-up and do need turning.
    const row = j * nx;
    for (let i = 0; i < nx; i++) {
      const o = owner[j * nx + i];
      if (o < 0 || hidden.has(o)) continue;
      const at = (row + i) * 4;
      const c = rgb[o];
      px[at] = c[0]; px[at + 1] = c[1]; px[at + 2] = c[2]; px[at + 3] = 255;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = nx;
  canvas.height = ny;
  canvas.getContext('2d').putImageData(img, 0, 0);

  return {
    canvas, box, wide: flood.wide, counts: flood.counts, cell: flood.cell,
    // Kept so a later tap can be asked which patch, if any, already owns the
    // ground under it — the flood is the only thing that knows, and asking it
    // is exact where a distance test would only be a guess.
    owner: flood.owner, nx: flood.nx, ny: flood.ny,
    ids: patches.map((p) => p.id),
  };
}

/**
 * A stable colour for a unit nobody declared.
 *
 * From the name, so the same unit is the same colour every time and on every
 * device, and spread round the hue circle so neighbouring units in a column do
 * not come out as two shades of the same thing.
 */
export function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  // The golden angle keeps successive hashes far apart on the wheel.
  const hue = ((h >>> 0) * 137.508) % 360;
  return hslToRgb(hue / 360, 0.52, 0.58);
}

function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

function hexToRgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex || ''));
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [154, 167, 178];
}

/** The colour the map paints an undeclared unit, as CSS. */
export function patchColorCss(name) {
  const [r, g, b] = colorFor(String(name || '').trim().toLowerCase());
  return `rgb(${r}, ${g}, ${b})`;
}

/** Which patch already covers this point, if any. */
export function patchAt(shade, lon, lat) {
  if (!shade) return null;
  const [x, y] = toWorld(lon, lat);
  const { box, nx, ny, owner } = shade;
  const i = Math.floor(((x - box.x0) / (box.x1 - box.x0)) * nx);
  const j = Math.floor(((y - box.y0) / (box.y1 - box.y0)) * ny);
  if (i < 0 || j < 0 || i >= nx || j >= ny) return null;
  const o = owner[j * nx + i];
  return o < 0 ? null : shade.ids[o];
}
