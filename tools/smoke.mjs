// A headless pass over the drawing and the geology, for JavaScriptCore.
//
//   tools/smoke.sh
//
// It exists because of one bug. A range-based edit deleted horizontalMark and
// verticalMark from render/markers.js; nothing referenced them from the code
// being rewritten, so nothing complained, and every check run afterwards drew
// INCLINED bedding — the only one of the four symbols that never calls either.
// The app shipped broken for any block carrying a flat-lying or on-end
// reading, which is most of them.
//
// So this is not a unit test of the arithmetic. It is the cheapest possible
// answer to "does every path still have all its functions": walk each preset,
// build each shader, trace each cross-section, and draw all four bedding
// symbols both ways. A missing function is a throw, and a throw is a failure.
// Numbers are checked only where being wrong would be silent.

globalThis.console = { log: (...a) => print(a.join(' ')) };

// Enough of a DOM and a 2D context to let the drawing code run.
const stubContext = () => new Proxy({}, {
  get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'canvas') return { width: 100, height: 100 };
    if (typeof k === 'string' && /^(font|fillStyle|strokeStyle|lineWidth|textAlign|textBaseline|lineCap|lineJoin|globalAlpha)$/.test(k)) return '';
    return () => {};
  },
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, className: '', getContext: stubContext }),
  createDocumentFragment: () => ({}),
};
globalThis.requestAnimationFrame = (f) => f();

const { defaultDocument, makeEvent, makeMarker, PRESETS } = await import('../js/geo/model.js');
const { compileHistory, describeAt, beddingAt } = await import('../js/geo/unmake.js');
const { buildFragmentShader } = await import('../js/geo/glsl.js');
const { sectionFrame, sectionLine, structureTraces } = await import('../js/geo/section.js');
const { readMarkers, formatReading, buildMarkers } = await import('../js/render/markers.js');
const { drawStation } = await import('../js/ui/map/symbols.js');
const { makeStation } = await import('../js/field/model.js');

let failed = 0;
function check(name, fn) {
  try {
    const note = fn();
    console.log(`  ok    ${name}${note ? ` — ${note}` : ''}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name} — ${e && e.message}`);
  }
}

// --- every preset, all the way through ------------------------------------
console.log('presets');
for (const preset of PRESETS) {
  check(preset.id, () => {
    const d = defaultDocument();
    d.events = preset.build();
    const h = compileHistory(d);
    for (let x = -1000; x <= 1000; x += 125) {
      for (let z = -1300; z <= 100; z += 125) {
        if (!describeAt(h, [x, 0, z])?.label) throw new Error(`no rock at ${x},${z}`);
      }
    }
    buildFragmentShader(d.events);
    const box = { x0: -1000, x1: 1000, y0: -1000, y1: 1000 };
    const traces = structureTraces(h, sectionFrame(d, box, sectionLine(d, box)), 90, 70);
    return `${traces.length} traces`;
  });
}

// --- all four bedding symbols, on the block and on the map ----------------
// The four are not interchangeable: each is drawn by its own function, and it
// was exactly the two that inclined bedding never reaches that went missing.
console.log('block symbols');
const beds = [
  ['flat-lying', [], 'horizontal'],
  ['on end', [makeEvent('tilt', { strike: 30, dip: 90 })], 'vertical'],
  ['inclined', [makeEvent('tilt', { strike: 30, dip: 35 })], '/35'],
  ['overturned', [makeEvent('fold', { wavelength: 1400, amplitude: 300 }),
    makeEvent('tilt', { strike: 0, dip: 70 })], 'overturned'],
  ['no bedding', [makeEvent('pluton', { centerZ: -100, radiusX: 4000, radiusY: 4000, radiusZ: 4000 })], 'no bedding'],
];
for (const [name, events, expect] of beds) {
  check(name, () => {
    const d = defaultDocument();
    d.events = events;
    d.markers = [-600, 0, 600].map((x) => makeMarker(x, 0));
    const h = compileHistory(d);
    const readings = readMarkers(d, h);
    buildMarkers(d, readings, readings[0].id);          // on the block
    d.settings.mapView = true;
    buildMarkers(d, readings, null);                    // and in plan
    const said = readings.map(formatReading).join(' | ');
    if (!said.includes(expect)) throw new Error(`expected ${expect} somewhere in "${said}"`);
    return said;
  });
}

console.log('map symbols');
const ctx = stubContext();
for (const [name, st] of [
  ['flat', makeStation({ feature: 'bedding', strike: 0, dip: 1 })],
  ['vertical', makeStation({ feature: 'bedding', strike: 40, dip: 89 })],
  ['inclined', makeStation({ feature: 'bedding', strike: 40, dip: 35 })],
  ['overturned', makeStation({ feature: 'bedding', strike: 40, dip: 35, overturned: true })],
  ['lineation', makeStation({ feature: 'lineation', trend: 120, plunge: 20 })],
  ['no attitude', makeStation({ feature: 'bedding' })],
]) {
  check(name, () => { drawStation(ctx, 50, 50, st, { size: 15, label: '7', selected: true, scale: 1 }); });
}

// --- the one number that is silent when it is wrong -----------------------
// A plane cannot say which way up it is, so an overturned bed reports the same
// strike and dip as an upright one and only this flag tells them apart.
console.log('way-up');
check('a fold tilted past vertical reads overturned', () => {
  const d = defaultDocument();
  d.events = [makeEvent('fold', { wavelength: 1400, amplitude: 300 }),
    makeEvent('tilt', { strike: 0, dip: 70 })];
  const h = compileHistory(d);
  let n = 0;
  for (let x = -900; x <= 900; x += 100) if (beddingAt(h, [x, 0, -200])?.overturned) n++;
  if (!n) throw new Error('nothing came back overturned');
  return `${n} of 19 stations`;
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
