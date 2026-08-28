// Scene assembly: renderer, camera, the block itself, and the translucent
// helper geometry that shows where the selected event acts.

import * as THREE from '../../vendor/three.module.js';
import { OrbitControls } from './controls.js';
import { BlockMaterial } from './material.js';
import { buildBlockGeometry, buildEdgeLines, footprint } from './block.js';
import { planeFrame, axisFrame, rotateAbout, foldWarpInverse, foldEnvelope, DEG } from '../geo/math.js';
import { surfaceHeight, surfaceRange, isDemSurface } from '../geo/surfaces.js';
import { unconformityDatums } from '../geo/model.js';
import { buildContourLabels, buildLabelMeshes, MAX_LABELS } from './contours.js';
import { buildMarkers } from './markers.js';

export class BlockScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x0f1418, 1);

    this.scene = new THREE.Scene();
    // Two cameras, one at a time. Map view has to be orthographic or it is not
    // a map: under perspective, a symbol near the edge of the sheet is seen
    // obliquely and a student would be reading a foreshortened one.
    this.perspCamera = new THREE.PerspectiveCamera(42, 1, 1, 200000);
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200000);
    this.perspCamera.up.set(0, 0, 1);
    this.orthoCamera.up.set(0, 0, 1);
    this.camera = this.perspCamera;

    this.controls = new OrbitControls(this.camera, canvas);

    this.blockMat = new BlockMaterial();
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.blockMat.material);
    this.scene.add(this.mesh);

    this.edges = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x0b0f12, transparent: true, opacity: 0.55 }),
    );
    this.scene.add(this.edges);

    this.helpers = new THREE.Group();
    this.scene.add(this.helpers);

    this.labels = new THREE.Group();
    this.scene.add(this.labels);
    this._labelKey = null;

    // Markers carry their own vertical exaggeration, so this group is never
    // scaled — see buildMarkers.
    this.markers = new THREE.Group();
    this.scene.add(this.markers);
    // The pick targets are a separate group so raycasting a tap does not have
    // to walk the symbol geometry.
    this.markerHits = new THREE.Group();
    this.scene.add(this.markerHits);

    this.raycaster = new THREE.Raycaster();
    this._geomKey = null;
    this._needsRender = true;

    // Watch the canvas box rather than the window: the bottom sheet animates
    // its height, and a window-resize listener alone can sample the layout
    // mid-transition and leave the renderer stuck at the wrong size.
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas);
    }

    // Frame-time watchdog for the automatic quality setting.
    this._frameMs = 16;
    this._lastFrame = performance.now();
    this._autoSamples = 4;
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // A collapsed box means the layout is mid-flight; a later observation
    // will bring the real size.
    if (w < 2 || h < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.perspCamera.aspect = w / h;
    this.perspCamera.updateProjectionMatrix();
    // The orthographic frustum is rebuilt from this every frame by the controls.
    this.controls.aspect = w / h;
    this.controls.changed = true;
    this._needsRender = true;
  }

  /** Rebuild block geometry only when its shape actually changed. */
  syncGeometry(doc, force = false) {
    const t = doc.topo;
    const key = JSON.stringify([doc.block, surfaceKey(t)]);
    if (!force && key === this._geomKey) return;
    this._geomKey = key;

    const res = 96;
    this.mesh.geometry.dispose();
    this.mesh.geometry = buildBlockGeometry(doc.block, t, res);
    this.edges.geometry.dispose();
    this.edges.geometry = buildEdgeLines(doc.block, t, res);
    this._needsRender = true;
  }

  syncDocument(doc) {
    this.blockMat.syncStructure(doc);
    this.blockMat.syncUniforms(doc);
    this.syncGeometry(doc);
    this.syncLabels(doc);

    const ex = doc.settings.exaggeration || 1;
    this.mesh.scale.z = ex;
    this.edges.scale.z = ex;
    this.helpers.scale.z = ex;
    this.labels.scale.z = ex;
    this.blockMat.uniforms.uExag.value = ex;

    const q = doc.settings.quality;
    this.blockMat.uniforms.uSamples.value =
      q === 'low' ? 1 : q === 'high' ? 4 : this._autoSamples;

    this._needsRender = true;
  }

  /**
   * Rebuild the contour labels, and tell the shader where to break the line.
   * Tracing is CPU work, so it only reruns when the terrain, the block or the
   * contour interval actually change — not on every camera nudge.
   */
  syncLabels(doc) {
    const interval = this.blockMat.uniforms.uContourInterval.value;
    const every = this.blockMat.uniforms.uContourIndexEvery.value;
    const key = JSON.stringify([surfaceKey(doc.topo), doc.block, interval, every]);
    if (key === this._labelKey) return;
    this._labelKey = key;

    this.labels.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();   // the text texture itself is cached
    });
    this.labels.clear();

    const u = this.blockMat.uniforms;
    if (!(interval > 0)) {
      u.uLabelCount.value = 0;
      this._needsRender = true;
      return;
    }

    const { lo, hi } = surfaceRange(doc.topo, doc.block.width, doc.block.depth);
    const fp = footprint(doc.block);
    const box = { ...fp, z0: lo - doc.block.height, z1: hi };
    const { labels, spots, labelW } = buildContourLabels(doc, interval, every, box);

    for (let i = 0; i < MAX_LABELS; i++) {
      u.uLabelSpots.value[i].set(spots[i * 4], spots[i * 4 + 1], spots[i * 4 + 2], 0);
    }
    u.uLabelCount.value = labels.length;

    if (labels.length) this.labels.add(buildLabelMeshes(labels, labelW));
    this._needsRender = true;
  }

  /**
   * Switch between the block and the flat map. The document says which; this
   * just makes the scene match it.
   */
  setMapView(on) {
    this.camera = on ? this.orthoCamera : this.perspCamera;
    this.controls.setCamera(this.camera);
    this.controls.setMapView(on);
    this._needsRender = true;
  }

  /**
   * Rebuild the strike-and-dip symbols. Cheap enough to run on every pointer
   * move while one is being dragged: a marker is a couple of dozen triangles,
   * and its dip number comes from a cache keyed on the number itself.
   */
  syncMarkers(doc, readings, selectedId = null) {
    disposeGroup(this.markers);
    disposeGroup(this.markerHits);
    this.markers.clear();
    this.markerHits.clear();

    const { group, hits } = buildMarkers(doc, readings || [], selectedId);
    this.markers.add(group);
    this.markerHits.add(hits);
    this._needsRender = true;
  }

  frame(doc) {
    const { lo, hi } = surfaceRange(doc.topo, doc.block.width, doc.block.depth);
    const { x0, x1, y0, y1 } = footprint(doc.block);
    const ex = doc.settings.exaggeration || 1;
    this.controls.frame({
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      w: x1 - x0,
      d: y1 - y0,
      zTop: hi * ex,
      zBot: (lo - doc.block.height) * ex,
    });
    this._needsRender = true;
  }

  /**
   * Draw the geometry of one event so students can see what they are editing:
   * fault and dike planes, fold axial traces, dome outlines, erosion surfaces.
   */
  showHelper(doc, event) {
    this.helpers.clear();
    this._needsRender = true;
    if (!event || doc.settings.showEventGuides === false) return;

    const B = doc.block;
    const span = Math.hypot(B.width, B.depth) * 0.75;
    const accent = 0xffd166;

    const { lo, hi } = surfaceRange(doc.topo, B.width, B.depth);
    const fp = footprint(B);
    const box = {
      x0: fp.x0, x1: fp.x1, y0: fp.y0, y1: fp.y1, z0: lo - B.height, z1: hi,
    };

    /**
     * Draw the part of a plane that lies inside the block, by clipping a
     * generous quad against the block's six faces.
     *
     * Sizing a fixed rectangle and sliding it to frame the block does not
     * work: bringing the patch to the block's mid-height means moving along
     * dip by dz / sin(dip), which runs away as the dip shallows and walks the
     * patch off the side of the model. Clipping has no such term — the drawn
     * patch is the plane's actual trace through the block, so it pivots in
     * place as the dip changes and can never drift.
     */
    const planeAt = (strike, dip, center, color, opacity) => {
      const { strikeVec, normal } = planeFrame(strike, dip);
      const X = new THREE.Vector3(...strikeVec);
      const Z = new THREE.Vector3(...normal);
      const Y = new THREE.Vector3().crossVectors(Z, X);

      const poly = clipPlaneToBox(new THREE.Vector3(...center), X, Y, box);
      if (poly.length < 3) return;   // this plane misses the block entirely

      const pos = [];
      for (let i = 1; i < poly.length - 1; i++) {
        pos.push(poly[0].x, poly[0].y, poly[0].z);
        pos.push(poly[i].x, poly[i].y, poly[i].z);
        pos.push(poly[i + 1].x, poly[i + 1].y, poly[i + 1].z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      this.helpers.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
      })));

      const ring = [];
      for (const p of poly) ring.push(p.x, p.y, p.z);
      ring.push(poly[0].x, poly[0].y, poly[0].z);
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
      this.helpers.add(new THREE.Line(rg, new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.95,
      })));
    };

    switch (event.type) {
      case 'tilt':
        planeAt(event.strike, event.dip,
          [event.centerX || 0, event.centerY || 0, event.centerZ || 0], accent, 0.14);
        break;

      case 'fault':
        planeAt(event.strike, event.dip,
          [event.centerX, event.centerY, event.centerZ], 0xff6b6b, 0.18);
        break;

      case 'dike': {
        const half = Math.max(1, event.thickness) * 0.5;
        const { normal } = planeFrame(event.strike, event.dip);
        for (const s of [-half, half]) {
          planeAt(event.strike, event.dip, [
            event.centerX + normal[0] * s,
            event.centerY + normal[1] * s,
            normal[2] * s,
          ], 0x8ecae6, 0.16);
        }
        break;
      }

      case 'fold': {
        // Axial traces: the hinge lines where the fold crests and troughs sit.
        // Built the same way the geology is — place the hinge in the upright
        // fold, then carry it through the plunge tilt — so the drawn lines and
        // the shaded rock cannot drift apart.
        //
        // That promise is why the warp has to be inverted here rather than
        // ignored. A verging fold's troughs are no longer half a wavelength
        // from its crests, so drawing them at even spacing would put the one
        // line a student uses to read the structure in the wrong place.
        const { perp, axis } = axisFrame(event.trend, event.plunge);
        const pts = [];
        const lam = Math.max(1, event.wavelength);
        const phase = (event.phase || 0) * DEG;
        const cx = event.centerX || 0;
        const cy = event.centerY || 0;
        for (let k = -3; k <= 3; k++) {
          // cos(psi) is extreme where psi = k*pi, and psi is the warped phase.
          const t = foldWarpInverse(k * Math.PI, event.vergence, event.hinge);
          const u = (t - phase) * lam / (2 * Math.PI);
          // A hinge outside the fold's reach is not a hinge. Taken at the
          // centre of the axis, which is where the drawn line is anchored.
          const fade = foldEnvelope(0, u, event.reachAlong, event.reachAcross);
          if (fade <= 0) continue;
          const crest = event.amplitude * fade * Math.cos(k * Math.PI);
          const tilted = rotateAbout(
            [perp[0] * u, perp[1] * u, crest], perp, -(event.plunge || 0),
          );
          const base = [tilted[0] + cx, tilted[1] + cy, tilted[2]];
          // A fold that dies out along strike gets a trace that stops with it.
          const half = event.reachAlong > 0 ? Math.min(span, event.reachAlong) : span;
          pts.push(
            base[0] - axis[0] * half, base[1] - axis[1] * half, base[2] - axis[2] * half,
            base[0] + axis[0] * half, base[1] + axis[1] * half, base[2] + axis[2] * half,
          );
        }
        if (!pts.length) break;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        this.helpers.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({
          color: accent, transparent: true, opacity: 0.85,
        })));
        break;
      }

      case 'domebasin': {
        const pts = [];
        for (let i = 0; i <= 64; i++) {
          const a = (i / 64) * Math.PI * 2;
          const az = (event.azimuth || 0) * DEG;
          const ex = Math.cos(a) * event.radiusA;
          const ey = Math.sin(a) * event.radiusB;
          const x = event.centerX + ex * Math.cos(az) + ey * Math.sin(az);
          const y = event.centerY - ex * Math.sin(az) + ey * Math.cos(az);
          pts.push(x, y, surfaceHeight(doc.topo, x, y) + 8);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        this.helpers.add(new THREE.Line(g, new THREE.LineBasicMaterial({
          color: accent, transparent: true, opacity: 0.9,
        })));
        break;
      }

      case 'pluton': {
        const g = new THREE.SphereGeometry(1, 24, 16);
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
          color: 0xf4a261, wireframe: true, transparent: true, opacity: 0.5,
        }));
        mesh.scale.set(event.radiusX, event.radiusY, event.radiusZ);
        mesh.position.set(event.centerX, event.centerY, event.centerZ);
        mesh.rotation.z = -(event.azimuth || 0) * DEG;
        this.helpers.add(mesh);
        break;
      }

      case 'unconformity': {
        const n = 48;
        const pos = [];
        const idx = [];
        // The datum is derived from the unit count, not stored on the surface,
        // so the guide has to be drawn at the same level the shader uses.
        const d = unconformityDatums(doc).get(event.id);
        const surf = d ? { ...event.surface, base: d.base } : event.surface;
        for (let j = 0; j <= n; j++) {
          for (let i = 0; i <= n; i++) {
            const x = (i / n - 0.5) * B.width;
            const y = (j / n - 0.5) * B.depth;
            pos.push(x, y, surfaceHeight(surf, x, y));
          }
        }
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const a = j * (n + 1) + i;
            idx.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        this.helpers.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({
          color: 0x90e0a0, transparent: true, opacity: 0.28,
          side: THREE.DoubleSide, depthWrite: false,
        })));
        break;
      }
    }

    // Helper geometry sits inside the solid block, so it has to draw over it
    // to be visible at all. Clipped to the block and drawn on top, a plane
    // reads as a highlighted slice through the model.
    this.helpers.traverse((o) => {
      if (o.material) {
        o.material.depthTest = false;
        o.material.transparent = true;
      }
      o.renderOrder = 2;
    });
  }

  /** World-space point under a screen coordinate, in true geologic metres. */
  pick(clientX, clientY) {
    this.raycaster.setFromCamera(this._ndc(clientX, clientY), this.camera);
    const hits = this.raycaster.intersectObject(this.mesh, false);
    if (!hits.length) return null;
    const local = this.mesh.worldToLocal(hits[0].point.clone());
    return { point: [local.x, local.y, local.z], screen: [clientX, clientY] };
  }

  /**
   * The marker under a screen coordinate, if any. Markers win over the rock
   * beneath them: a tap that lands on one is meant for it.
   */
  pickMarker(clientX, clientY) {
    if (!this.markerHits.children.length) return null;
    this.raycaster.setFromCamera(this._ndc(clientX, clientY), this.camera);
    const hits = this.raycaster.intersectObjects(this.markerHits.children, true);
    if (!hits.length) return null;
    // A marker hidden behind a hill is not grabbable — the block is solid, and
    // reaching through it would move a symbol the student cannot see.
    const rock = this.raycaster.intersectObject(this.mesh, false);
    if (rock.length && rock[0].distance < hits[0].distance) return null;
    return hits[0].object.userData.markerId || null;
  }

  /**
   * Map position under a screen coordinate, clamped into the block's
   * footprint. This is where a dragged marker wants to go: the ray may leave
   * the block or graze a wall, and a station has to stay on the map either
   * way. Returns null when the ray misses the block entirely, which leaves the
   * marker where it was rather than throwing it to a corner.
   */
  pickSurface(clientX, clientY, doc) {
    const hit = this.pick(clientX, clientY);
    if (!hit) return null;
    const fp = footprint(doc.block);
    const m = Math.min(fp.x1 - fp.x0, fp.y1 - fp.y0) * 0.005;
    return [
      Math.min(fp.x1 - m, Math.max(fp.x0 + m, hit.point[0])),
      Math.min(fp.y1 - m, Math.max(fp.y0 + m, hit.point[1])),
    ];
  }

  _ndc(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  requestRender() { this._needsRender = true; }

  render() {
    const moved = this.controls.update();
    if (!moved && !this._needsRender) return false;
    this._needsRender = false;

    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    const dt = performance.now() - t0;
    this._frameMs = this._frameMs * 0.9 + dt * 0.1;

    // Back off supersampling on devices that cannot keep up, and creep back
    // up when they can. Only takes effect when quality is set to 'auto'.
    if (this._frameMs > 22 && this._autoSamples === 4) this._autoSamples = 1;
    else if (this._frameMs < 9 && this._autoSamples === 1) this._autoSamples = 4;
    return true;
  }
}

/**
 * The polygon where an infinite plane meets the block, found by clipping a
 * generous quad against the block's six faces (Sutherland-Hodgman in 3D).
 * Returns [] when the plane misses the block.
 *
 * @param {THREE.Vector3} point  any point on the plane
 * @param {THREE.Vector3} X,Y    orthonormal in-plane axes
 * @param {object} box           { x0, x1, y0, y1, z0, z1 }
 */
function clipPlaneToBox(point, X, Y, box) {
  const mid = new THREE.Vector3(
    (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2,
  );
  // Seed the quad at the plane point nearest the block centre, so a generous
  // radius is guaranteed to cover the block from any starting point.
  const toMid = mid.clone().sub(point);
  const seed = point.clone()
    .addScaledVector(X, toMid.dot(X))
    .addScaledVector(Y, toMid.dot(Y));
  const r = Math.hypot(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0);

  let poly = [
    seed.clone().addScaledVector(X, -r).addScaledVector(Y, -r),
    seed.clone().addScaledVector(X, r).addScaledVector(Y, -r),
    seed.clone().addScaledVector(X, r).addScaledVector(Y, r),
    seed.clone().addScaledVector(X, -r).addScaledVector(Y, r),
  ];

  const faces = [
    [new THREE.Vector3(1, 0, 0), box.x1], [new THREE.Vector3(-1, 0, 0), -box.x0],
    [new THREE.Vector3(0, 1, 0), box.y1], [new THREE.Vector3(0, -1, 0), -box.y0],
    [new THREE.Vector3(0, 0, 1), box.z1], [new THREE.Vector3(0, 0, -1), -box.z0],
  ];
  for (const [n, d] of faces) {
    poly = clipPolyByHalfSpace(poly, n, d);
    if (poly.length < 3) return [];
  }
  return poly;
}

/** Keep the part of a convex polygon with dot(p, n) <= d. */
function clipPolyByHalfSpace(poly, n, d) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = a.dot(n) - d;
    const db = b.dot(n) - d;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      out.push(a.clone().lerp(b, da / (da - db)));
    }
  }
  return out;
}

/**
 * Free the GPU resources under a group before it is thrown away and rebuilt.
 * Anything the builder flagged as shared is left alone — it is reused by the
 * next build, and disposing it would leave that one drawing nothing.
 */
function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
    // Materials are dropped, but their texture maps come from a cache and must
    // outlive them.
    if (o.material && !o.userData.sharedMaterial) o.material.dispose();
  });
}

/**
 * A cheap identity for a surface, for the caches that ask "has the terrain
 * changed?" every sync. Measured ground carries a hundred thousand samples,
 * and stringifying them to answer that question costs more than rebuilding
 * the geometry would have — so a heightfield answers with its id, which
 * changes exactly when the samples do.
 */
function surfaceKey(s) {
  return isDemSurface(s) ? `dem:${s.id}` : s;
}
