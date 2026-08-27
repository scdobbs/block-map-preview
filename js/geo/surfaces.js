// Surface generator, used for two different things:
//   1. the topographic land surface that caps the block, and
//   2. the erosion surface beneath an angular unconformity.
//
// Both are just "a height as a function of map position", so they share one
// parameter set and one evaluator. The GLSL twin of `surfaceHeight` lives in
// js/geo/glsl.js and MUST be kept numerically identical -- an unconformity is
// meshed on the CPU but colored on the GPU, and any drift between the two
// shows up as a seam.

export const SURFACE_KINDS = [
  { id: 'flat', code: 0, label: 'Flat', hint: 'Level plain — a clean map view' },
  { id: 'slope', code: 1, label: 'Slope', hint: 'Uniform tilted hillside' },
  { id: 'hills', code: 2, label: 'Hills', hint: 'Rolling low relief' },
  { id: 'valley', code: 3, label: 'Valley', hint: 'Incised stream valley (rule of Vs)' },
  { id: 'ridge', code: 4, label: 'Ridge', hint: 'Linear upland' },
  { id: 'mountain', code: 5, label: 'Mountain', hint: 'Single radial peak' },
];

export const KIND_CODE = Object.fromEntries(SURFACE_KINDS.map((k) => [k.id, k.code]));

// ---------------------------------------------------------------------------
// Measured terrain
// ---------------------------------------------------------------------------
// A seventh kind that is not in SURFACE_KINDS, because it is not something a
// student picks off a list: it is a real landscape, sampled from the DEM tiles
// the Map section already downloads, and it arrives only when a block is cut
// from a mapped field area.
//
// It is deliberately NOT given a KIND_CODE. The GLSL twin of surfaceHeight
// exists to color *unconformity* erosion surfaces on the GPU, and an
// unconformity surface is always one of the analytic kinds; the land surface
// never reaches the shader, because the block's lid is meshed from it on the
// CPU instead. So a heightfield needs no GLSL counterpart, and giving it a
// code would only invite one to be written.

/**
 * Wrap a sampled heightfield as a surface.
 *
 * @param {Float32Array} grid  heights in metres, row-major, row 0 at y = -depth/2
 *                             (south) and column 0 at x = -width/2 (west)
 * @param {number} nx          columns
 * @param {number} ny          rows
 * @param {number} width       block footprint E–W, metres
 * @param {number} depth       block footprint N–S, metres
 * @param {object} over        anything else to carry (id, georeference, ...)
 */
export function demSurface(grid, nx, ny, width, depth, over = {}) {
  return {
    ...defaultSurface(),
    kind: 'dem',
    grid, nx, ny, width, depth,
    // Identity for cache keys. The renderer keys its geometry on the surface,
    // and JSON.stringify of a hundred thousand floats every frame is not a
    // cache, it is a leak with a lookup on the front.
    id: over.id || `dem${Math.random().toString(36).slice(2, 10)}`,
    ...over,
  };
}

export function isDemSurface(s) { return !!(s && s.kind === 'dem' && s.grid); }

/** Bilinear height from the heightfield, clamped at the edges. */
function demHeight(s, x, y) {
  const { grid, nx, ny } = s;
  const fx = ((x / s.width) + 0.5) * (nx - 1);
  const fy = ((y / s.depth) + 0.5) * (ny - 1);
  const i = Math.min(nx - 2, Math.max(0, Math.floor(fx)));
  const j = Math.min(ny - 2, Math.max(0, Math.floor(fy)));
  const tx = Math.min(1, Math.max(0, fx - i));
  const ty = Math.min(1, Math.max(0, fy - j));
  const a = grid[j * nx + i];
  const b = grid[j * nx + i + 1];
  const c = grid[(j + 1) * nx + i];
  const d = grid[(j + 1) * nx + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

export function defaultSurface(over = {}) {
  return {
    kind: 'flat',
    base: 0,          // datum elevation, m
    amplitude: 150,   // relief of the primary landform, m
    wavelength: 900,  // hill spacing, m
    azimuth: 90,      // slope-descent direction / valley trend, deg from N
    centerX: 0,       // map position of peak or valley axis, m
    centerY: 0,
    radius: 600,      // peak radius, or valley/ridge half-width, m
    gradient: 0,      // axial drop along a valley or ridge, m per km
    slopeAngle: 8,    // hillside inclination for kind='slope', deg
    roughness: 0,     // 0..1, adds fine hills over any landform
    ...over,
  };
}

const DEG = Math.PI / 180;

/**
 * Deterministic smooth relief: three rotated sinusoids at increasing
 * frequency. Cheap, seamless, and trivially portable to GLSL. Output is
 * normalized to roughly [-1, 1].
 */
function hillField(x, y, wl) {
  const k = (2 * Math.PI) / Math.max(1e-3, wl);
  const h =
    0.55 * Math.sin(k * (0.90 * x + 0.44 * y)) +
    0.32 * Math.sin(k * 1.7 * (-0.42 * x + 0.91 * y) + 2.1) +
    0.18 * Math.sin(k * 2.9 * (0.74 * x - 0.67 * y) + 4.3);
  return h / 1.05;
}

/** Cosine bell falling from 1 at t=0 to 0 at t=1. */
function bell(t) {
  if (t >= 1) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * t));
}

/** Height of the surface at map position (x, y). */
export function surfaceHeight(s, x, y) {
  // Measured ground answers from the samples and nothing else: no base, no
  // roughness, no landform. It is not a shape with parameters, it is a place.
  if (s.kind === 'dem') return demHeight(s, x, y);

  // Flat means flat. Roughness is remembered so that switching back to a
  // landform restores it, but it must not leak into a level plain.
  if (s.kind === 'flat') return s.base;

  const az = s.azimuth * DEG;
  const ax = Math.sin(az), ay = Math.cos(az);   // along-azimuth
  const px = Math.cos(az), py = -Math.sin(az);  // perpendicular

  const dx = x - s.centerX;
  const dy = y - s.centerY;
  const along = dx * ax + dy * ay;
  const perp = dx * px + dy * py;

  let h = 0;
  switch (s.kind) {
    case 'slope':
      h = -along * Math.tan(s.slopeAngle * DEG);
      break;
    case 'hills':
      h = s.amplitude * hillField(x, y, s.wavelength);
      break;
    case 'valley':
      h = -s.amplitude * Math.max(0, 1 - Math.abs(perp) / Math.max(1e-3, s.radius))
        - s.gradient * (along / 1000);
      break;
    case 'ridge':
      h = s.amplitude * Math.max(0, 1 - Math.abs(perp) / Math.max(1e-3, s.radius))
        - s.gradient * (along / 1000);
      break;
    case 'mountain':
      h = s.amplitude * bell(Math.hypot(dx, dy) / Math.max(1e-3, s.radius));
      break;
    case 'flat':
    default:
      h = 0;
  }

  if (s.roughness > 0) {
    h += s.roughness * s.amplitude * 0.35 * hillField(x, y, Math.max(1e-3, s.wavelength) * 0.45);
  }
  return s.base + h;
}

/** Analytic-free normal, by central difference. Used for mesh lighting. */
export function surfaceNormal(s, x, y, eps = 2) {
  const hx = surfaceHeight(s, x + eps, y) - surfaceHeight(s, x - eps, y);
  const hy = surfaceHeight(s, x, y + eps) - surfaceHeight(s, x, y - eps);
  const nx = -hx / (2 * eps);
  const ny = -hy / (2 * eps);
  const L = Math.hypot(nx, ny, 1) || 1;
  return [nx / L, ny / L, 1 / L];
}

/** Min and max height over a block footprint, sampled on a coarse grid. */
export function surfaceRange(s, width, depth, n = 24) {
  // Measured ground gets its exact range from the samples rather than a 25x25
  // guess at them — a coarse scan of a real landscape walks straight past the
  // summit and the canyon floor, and the block's base is hung off `lo`. The
  // answer is cached on the surface: it is asked for on every document sync,
  // and it cannot change without the grid changing.
  if (isDemSurface(s) && width === s.width && depth === s.depth) {
    if (!s._range) {
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < s.grid.length; k++) {
        const h = s.grid[k];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
      Object.defineProperty(s, '_range', { value: { lo, hi }, enumerable: false, configurable: true, writable: true });
    }
    return s._range;
  }

  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const x = (i / n - 0.5) * width;
      const y = (j / n - 0.5) * depth;
      const h = surfaceHeight(s, x, y);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  return { lo, hi };
}

/**
 * A contour interval that gives roughly `target` lines across the relief,
 * snapped to a value a map would actually use (1, 2, 5, 10, 20, 25, 50 ...).
 * Returns 0 for ground flat enough that contours would be meaningless — on a
 * dead-level surface every point sits on the same contour, which would ink
 * the entire map face.
 */
export function niceContourInterval(relief, target = 12) {
  if (!(relief > 1)) return 0;
  const raw = relief / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  // 2.5 earns its place: 25 m and 250 m are intervals real maps use, and
  // without it the 2-to-5 gap is wide enough to swing the line count by half.
  const step = n <= 1.5 ? 1 : n <= 2.2 ? 2 : n <= 3.5 ? 2.5 : n <= 7.5 ? 5 : 10;
  return step * pow;
}

/** Flat float array in the order the shader's uniform block expects. */
export function surfaceUniform(s) {
  return [
    s.base, s.amplitude, s.wavelength, s.azimuth,
    s.centerX, s.centerY, s.radius, s.gradient,
    s.slopeAngle, s.roughness,
  ];
}
