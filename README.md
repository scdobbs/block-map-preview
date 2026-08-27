# Block — 3D geologic block diagrams

By **Stephen Dobbs** · [AGPL-3.0](LICENSE)

An offline-first phone app for geology students, in two halves.

**Block** builds and interrogates 3D geologic block diagrams. Rotate the block
in any direction, stack a stratigraphic column, apply a history of tilts,
folds, faults, intrusions and unconformities, drape a landscape over the top,
and tap anywhere to identify the unit and read its strike and dip.

**Map** is a field notebook for the outcrop you are actually standing on: a
US topographic and aerial map downloaded before you leave, your position on
it from the satellites, strike and dip measured by laying the phone on the
bedding, and a record of what each reading was taken in.

Both run with **no signal** — that is the whole point of them.

---

# Open it

## 🔗 [scdobbs.github.io/3D-block-diagrams](https://scdobbs.github.io/3D-block-diagrams/)

## On a computer

Just open the link — Chrome, Safari, Firefox and Edge all work. Nothing to
install.

- **Left-drag** turns the block
- **Scroll** zooms; **right-drag** or **shift-drag** pans
- **Click the block** to identify the unit and read its strike and dip

Start on the **View** tab, load an example like *Anticline & syncline* or
*Horst & graben*, then take it apart on the **History** tab.

## On a phone

Opening the link works straight away. But to have it **available in the field
with no signal**, add it to your home screen.
### iPhone / iPad

1. Open the link in **Safari**. (Chrome on iOS cannot install it properly.)
2. **Wait for the block to appear**, then give it ~5 more seconds. This is when
   the app stores itself for offline use.
3. Tap **Share** — the square with the arrow, bottom center.
4. **Scroll down** the share sheet to the list of actions and tap **Add to Home
   Screen**. 
5. Tap **Add**.
6. **Open it from the new home screen icon while you still have signal** and let
   it load once. iOS gives a home-screen app its own storage, separate from
   Safari's, so this is when *that* copy gets stored.

### Android

1. Open the link in **Chrome**.
2. **Wait for the block to appear**, then ~5 more seconds.
3. Tap the **Install** prompt if one appears — otherwise **⋮** (top right) →
   **Add to Home screen** / **Install app**.
4. Confirm, then open it from the new icon.

### Check it before you rely on it

Turn on **Airplane mode** and open the app from the home screen icon. It should
load completely normally.

If you get an error page instead, turn airplane mode off, open it again, let it
sit ten seconds, close it fully and retest. It only means the download in step 2
got cut short.

### Once it is installed

- Opens **full screen**, no browser bars, like any other app
- **Saves your work by itself** — close it mid-block and it comes back as you left it
- **One finger** turns, **two fingers** pinch to zoom and drag to pan, **tap**
  identifies the unit under your finger
- The panel has a **drag handle** — pull up for more room, push down for more block

When a new version ships you will see a small **"A newer version is ready —
Reload"** banner next time you open it *with* a connection. Tap it. Offline, it
keeps running the copy you already have.

---

# Using it

**Layers** — build the column. Tap a unit to set rock type, thickness and
color, or delete it. **Drag a unit by its grip** to move it through the column
(the Younger/Older buttons in the editor do the same thing). Lithology
patterns follow the usual map conventions and are drawn procedurally, so they
stay crisp at any scale.

**History** — the geologic timeline, newest at the top. Add events, then tap
one to edit it. Strike and trend get a compass you can drag; dip and plunge
get a protractor. Both accept typed numbers too. **Drag an event by its grip
to move it through time** (the arrow buttons in the editor do the same thing),
and disable one without deleting it — the fastest way to see what it was
actually doing.

**Terrain** — the land surface: flat, slope, hills, valley, ridge or mountain,
with roughness on top. A valley with an axial gradient is what you want for
demonstrating the rule of Vs. **Contour lines** are drawn on the map face,
with every fifth one heavier and **labelled with its elevation**; the interval
is chosen from the terrain's own relief so it stays around a dozen lines
whatever the landform, and you can pin it to a fixed value instead.
This tab also holds block size, vertical
exaggeration (display only — strikes and dips are unaffected), and the
**cutaway**, which slides the east and north walls into the block to expose
fresh cross-sections. The cutaway is the only way to see a pluton that sits
entirely inside the block.

**Field** — strike-and-dip readings the student places themselves. Tap **Add
strike & dip**, then tap the block; keep tapping to leave as many as you like.
**Drag one** and it slides across the ground with your finger, re-reading the
bedding as it goes — over a fold hinge you can watch the dip roll through
horizontal and come back the other way. A marker stores only its map position:
its height is the terrain's, and its attitude is whatever the rock beneath it
is doing, so it can never say something the block does not. The symbol is drawn
*in* the bedding plane, so from map view it is the ordinary map symbol and from
an oblique view it lies on the beds. Flat-lying beds get the cross-in-circle,
beds on end the double tick, and a station with no bedding under it — inside a
pluton, say — an open circle rather than an invented number.

**Plot on a stereonet** (in Field) opens the net *beside* the block rather
than over it, and leaves it there — it is a second view of the same geology,
not a page you visit. On a phone, where the two are stacked, drag the pill
between them to give either one the whole screen. Every reading goes on as a pole to bedding, and a girdle
is fitted through them. That fit is the whole exercise: on a cylindrically folded surface the poles all lie in the
plane perpendicular to the hinge, so the pole of the fitted girdle *is* the
fold axis — and it is recoverable from readings taken anywhere, whether or not
the fold closes inside the block. Turn on **Great circles** to see the same
answer arrive the other way round, as the point every bed's great circle passes
through. **Check the whole map** reads bedding on a grid across the block and
fits the same girdle to it, so you can find out how close your handful of
stations got without being told what the fold was set to.

Because it stays up, the net is an instrument rather than a lookup. Open a
fold in **History** with the net beside it and drag the plunge: the block
re-folds, every marker re-reads the bedding under it, the poles slide round the
net and the girdle swings with them, all in the same frame. Nothing in that
chain consults the fold event — the answer is re-derived from the geometry each
time, which is why it stays right when the fold is one of several events.
Dragging a station does the same thing from the other end: walk three readings
apart across a hinge and watch them stop being "one attitude" and become a fold
axis.

The numbers land in three places, because an answer you have to remember is an
answer you will misremember: lettered beside the mark on the net, spelled out
in the readout next to it, and carried back to the **Field** tab as a one-line
finding that survives hiding the net. A line is written **trend / plunge**, the
same way the History tab states a fold's axis, so the two can be held up
against each other; every readout that prints one labels it, because `020/15`
on its own reads exactly like the strike and dip of a plane.

The net says when it cannot answer, which matters more than the answer:
readings from one limb are one attitude and define no axis; poles on a small
circle rather than a great one are a dome or a basin, which has no hinge line
at all; poles on neither are not one structure. Tap a pole to select that
reading; equal-area (Schmidt) is the default, equal-angle (Wulff) is a tap
away.

**View** — worked examples to load and take apart, **Read it as a map (2D)**,
canned viewpoints, display toggles, and save/open/export. **Event guides**
turns off the translucent plane drawn for whichever event is open in History;
it is drawn over the block so you can see where the structure sits, which is
exactly what you do not want when reading the map.

**Read it as a map (2D)** drops the 3D altogether: an orthographic camera
straight down, north up, no perspective and no rotation, and the strike-and-dip
symbols lying flat the way they are printed. It is not the same as pointing the
camera downward. Under perspective a symbol out at the edge of the sheet is
seen obliquely, so a student would be reading a foreshortened one; orthographic
means every symbol is seen exactly as it is, which is the whole premise of a
map. One finger pans, pinch or scroll zooms, and tapping still identifies units
and places readings. A **Map view** chip sits beside undo/redo to get back out,
because the gesture that would normally do it — turning the block — is gone.

**Tap the block** anywhere to identify the unit under your finger and read the
strike and dip of bedding at that point — recovered the same way a field
measurement is, from the orientation of the bedding surface itself.

---

# The Map section

A separate section, reached by the **Block / Map** switch above the diagram. It
keeps its own notes, its own storage and its own downloaded maps; the two
halves share the rock list and the conventions for strike and dip, and nothing
else. A block is a thing you invent to understand a structure. This is a record
of a place that exists.

## Before you leave, while you still have signal

**Areas** → *Choose an area to download*. The box starts on whatever is on
screen and its corners drag; the panel counts the tiles and the megabytes as
you size it. Pick **Topo**, **Imagery**, or both, and keep **Elevation** —
it is small, and it is what draws the hillshade, the contour lines and every
station's height.

Then check it. The area is not marked complete because the download returned;
it is marked complete because every tile it needs was **counted in the cache
afterwards**. **Check** re-counts at any time and **Repair** fetches whatever
is missing. An area that is short of tiles says so, in the list and on the map.

**Set the declination** on Setup before taking a single reading. Downloading an
area also asks NOAA for the declination at its center and offers that as a
starting point, but the number is yours: it is the same one you would dial into
a Brunton, east positive.

## On the outcrop

The buttons down the right edge are **centre on me**, **change layer**, **full
screen**, and **place a station by hand**. Full screen hides the panel entirely,
the same way the clinometer hides the map: reading a map and filling in a form
are different jobs and a phone has room for one of them at a time.

The map **follows you until you touch it**. The first fix centres on you and
the crosshair button lights up; the moment you drag the map it lets go, so you
can look somewhere you are not standing — which is most of what the Areas tab
is for. The crosshair brings you back and starts following again. Panning is
not an edit and does not land on the undo stack.

**Measure** is the working screen. It shows the fix, its accuracy radius, how
old it is, and the ground elevation read from the cached terrain. A station
cannot be recorded on a fix worse than the limit you set, and when the button
is disabled it says why rather than sitting there greyed out.

**Open the compass** goes full screen. A reading is taken with the phone flat
on rock and read at arm's length, and at that moment nothing else on the screen
is any use — least of all half a map. The dial is a fixed 0–360 card with the
strike-and-dip symbol turning inside it, rather than a compass card spinning
under a fixed mark: a card that turns is right for walking a bearing, but for
reading a structure the useful thing is to see the symbol in the orientation it
will have on the map, so you can check at a glance that the app is describing
the surface actually under the phone. Beside the numbers is a small side
elevation showing how far the surface leans off horizontal, because a plan view
cannot show a dip.

Or **Type it** — the same compass dial and protractor the History tab uses.
Neither is the fallback. A phone magnetometer is worth a few degrees at best
and worse beside a truck, so a Brunton reading typed in is the better
measurement and the app treats it that way.

The compass averages a second of samples and reports how far they disagreed.
That **scatter** is the number to watch: a phone resting on rock settles to a
few tenths of a degree, and a bar fills as it settles so holding still is
something you watch happen. The scatter is stored with the reading, so a bad
one stays visibly bad in the notebook weeks later.

## Planes and lines

Not every structure is a plane. Switch the instrument to **Line** and it reads
**trend and plunge** instead: lay the long edge of the phone along a lineation,
a fold hinge or a set of slickenlines, point it down-plunge, and read it off.

The two come from the same instant of the same sensors. The phone's back lies
on the surface while its long edge lies *in* that surface, so holding a reading
captures both — which means that on a slickensided fault one placement of the
phone records the fault plane and the slip line together, and flipping between
Plane and Line afterwards shows two real measurements rather than blanking one
of them.

With the phone's long edge laid straight down the dip, the two readings are
the same measurement: the trend comes out exactly the strike plus ninety and
the plunge exactly the dip. Lay the edge anywhere else on the surface and the
line is a different line in the same plane — which is the point, and is what
records a slickenline. Both forms are shown at once, so neither has to be
worked out on paper.

A station stores one pair or the other, never both, and the feature type says
which. A line is written **trend / plunge** and always labelled, because
`020/15` on its own reads exactly like the strike and dip of a plane — the same
rule the stereonet readout follows. On the map a line is drawn as an arrow
pointing down-plunge, so the two families of symbol never have to be told
apart by their numbers.

Name the feature — bedding, foliation, joint, fault plane, contact. It costs a
tap and it keeps a joint from quietly joining a fold-axis fit. Name the unit by
tapping one you have used before or typing a new one; a name typed once becomes
a tap thereafter, and a course can set its units up in advance on Setup.

A station recorded **without an attitude is not finished, and is not a dead
end**. Plenty are deliberate at the time — a covered contact, float, a surface
you could not reach — and plenty become measurable later, from the far side or
on the way back down. Open one in **Stations** and it offers *Type one in* or
*Read it now*; the second opens the clinometer pointed at that station, so
holding a reading updates it instead of making a new one. Until there is a
reading it is free to become either a plane or a line, and the symbol on the
map changes from a bare ring to a strike-and-dip mark or an arrow as soon as
there is one. Filling one in needs no GPS fix — the place was recorded when you
were standing there, and only the reading is outstanding.

**Stations** lists what you have, nearest reading first with its distance from
you, and exports to **GeoJSON** (opens in QGIS or ArcGIS, carrying strike, dip
and dip direction as fields), **CSV**, or a full **Backup**.

## Drawing contacts and faults

A geologic map is mostly lines. The stations say what the rock is doing; the
lines say where one thing stops and another starts.

**Lines** → pick a kind — contact, fault, unconformity, dike, traverse — and
put points down two ways. **Tap the map** where you can see the trace going, or
press **Here** to drop a point where you are standing, which is what you do
when the contact is under your feet and invisible from any distance. Undo takes
back the last point; Done keeps the line; the × throws it away. **Keep drawing**
picks an existing line back up and adds to its end.

Every line carries **how well you know it**, and is drawn the way a published
map draws it:

| | |
|---|---|
| **Certain** | solid — walked, or clearly exposed |
| **Approximate** | dashed — located to within a stride or two |
| **Inferred** | long-dashed — interpolated between exposures |
| **Concealed** | dotted — under soil, scree or alluvium |

That distinction is most of what makes a map honest. A student who cannot draw
an inferred contact will either not draw it or draw it as fact, and both are
worse than a dashed line. Faults are drawn heavier and in red, the way a map
prints them, and a contact can record the unit on each side.

Lines export as GeoJSON `LineString` features alongside the stations, carrying
kind, certainty, both unit names and their ground length.

## What the map is made of

All of it is US federal, public domain, and free of any restriction on caching
it for offline use — which is exactly why the map is US-only. Every commercial
basemap worth having forbids the bulk pre-caching this feature exists to do.

| Layer | Source | Best zoom |
|---|---|---|
| **Topo** | USGS 7.5-minute quad | 16 (~1.8 m/px) |
| **Aerial** | USGS orthoimagery | 16 |
| **Aerial + topo** | the same imagery with contours and names over it | 16 |
| **Elevation** | Terrain Tiles on AWS (USGS 3DEP) | 15 (~10 m) |

**Aerial + topo is the prettier layer and the gappier one.** USGS has not
cached the combined layer everywhere it has cached the two it is made from:
around the Poleta folds in the White-Inyo Mountains a whole column of it is
absent, while plain Aerial and Topo both cover the same ground completely. If
an area reports tiles that are not published, try Aerial.

A tile the server does not have is recorded as such rather than counted as a
failed download — otherwise an area containing one could never be marked
complete and Repair would retry it forever. The map fills those squares from
the next zoom out, so a hole in the source shows as a softer patch rather than
as nothing at all.

The imagery stops at zoom 16 and there is no public-domain way past it. Past
that the photograph goes soft — but elevation is numbers rather than a picture,
so the **hillshade and contours are worked out on the phone** and stay exactly
as sharp as the screen can draw them. Zoom in on an outcrop and the contours
hold while the imagery blurs. It is also where a station's elevation comes
from: a phone's GPS altitude is routinely tens of meters out, and the terrain
under a known latitude and longitude is not.

Roughly: a 10 × 10 km area is about 12 MB of topo, 21 MB of imagery and 8 MB of
elevation, across every zoom from 10 to the layer's best. Storage starts at
about a gigabyte, so a dozen field areas fit comfortably.

---

## Conventions

- **X = East, Y = North, Z = Up.** Metres throughout.
- **Strike** follows the right-hand rule: with the strike direction ahead of
  you, the beds dip down to your right. Recorded as azimuth, 0–360° from north.
- **Dip** and **plunge** are measured down from horizontal.
- **Faults** are described the way a student describes them: pick a type —
  normal, reverse/thrust, dextral or sinistral — then dial **oblique slip**
  from −90° to +90° to mix in the other component. Zero is the pure form of
  the type you chose; the ends are the pure opposite. The editor reports the
  resulting **rake** (measured in the fault plane from the strike direction,
  rotating toward down-dip: `90°` normal, `270°` reverse, `0°` sinistral,
  `180°` dextral), because that is what the literature uses. Rake is derived,
  never stored, so there is only one source of truth; older files that saved a
  bare rake are converted on load without changing their geometry.
- The **stratigraphic column** is listed youngest at the top, as you would
  draw it. Below the deepest unit is undifferentiated basement.
- Above the top of the column, the youngest unit is extended upward. The block
  has to be made of something everywhere, and repeating the top unit is the
  reading a geologist expects.
- Where younger beds **lie flat** across an unconformity, they onlap the buried
  relief: the deepest of them thickens downward to fill every low in the
  erosion surface and abut the older rock. So that unit is thicker in the
  paleovalleys than on the paleohighs, which is what onlap looks like in the
  field.
- An unconformity is a **boundary in the column**, not an extra unit. The
  column holds a fixed set of units, so moving the surface down hands one of
  them from the eroded side to the younger side rather than adding a new one —
  which is why the older sequence gets shorter as the cover gets thicker. Drag
  the divider in the Layers tab to move it, or pick the unit it sits beneath.
- An unconformity's **depth is derived, not set**. It buries its erosion
  surface under the units deposited on it, so the surface sits at the base of
  exactly those units. Only the surface's relief is yours to choose, and that
  is the part that does the geological work: truncating the older beds, and
  giving the younger ones a shape to onlap.

---

# Under the hood

## How the geology works

The block is never meshed into layers. Instead, every fragment on screen asks
one question: *what rock is at this point?* — and answers it by running the
geologic history **backwards**.

Undo the youngest event, then the next, and so on, until the point lands back
in the flat layer cake it was deposited in. Then it is just a matter of which
layer that depth falls in.

Every deformation is exactly invertible, which is what makes this work:

| Event | Forward | Why the inverse is exact |
|---|---|---|
| **Tilt** | rigid rotation about the strike line | rotations invert |
| **Fold** | an upright fold (vertical displacement, wave read across the horizontal `perp` axis), then a rigid tilt about `perp` by the plunge | neither step changes the `perp` coordinate the wave is read from |
| **Dome / basin** | vertical displacement depending only on map position | map position is unchanged by vertical motion |
| **Fault** | rigid translation of the hanging wall, parallel to the fault plane | slip lies in the plane, so the hanging-wall test gives the same answer before and after |
| **Unconformity** | splits the column: units above the erosion surface skip all older history | a branch, not a transform |
| **Dike / pluton** | paints rock inside a region, at its own point in the history | a test, not a transform |

Two consequences worth knowing:

- **Contacts are pin-sharp at any zoom.** Nothing is tessellated, so there are
  no stair-steps at layer boundaries no matter how far you zoom in.
- **Order matters, exactly as it does in the field.** Move a fault later in
  the history and it starts cutting the fold instead of being folded by it.
  That is the whole point of the timeline.

The history's *shape* (how many events, of which types, in what order) is
compiled into generated GLSL; its *numbers* are uniforms. So dragging a dip
slider is a uniform upload, and only adding, deleting, reordering or disabling
an event triggers a recompile.

`js/geo/unmake.js` is a CPU implementation of the same walk. It powers the
identify tool and it is the reference the shader must agree with — **if you
change one, change the other.**

---

## How offline actually holds

Three things break an offline map, and the Map section is built around not
doing them.

**The cache gets swept.** `sw.js` deletes every cache that is not the current
version whenever the app updates — right for code, catastrophic for tiles.
Bumping the version to fix a typo would silently throw away every student's
field area, and they would find out standing in it. So tiles live in a cache
called `field-tiles`, with **no version in the name**, listed in `KEEP` in
`sw.js` and skipped by the sweep. Change that name and you have deleted
everyone's maps.

**"Downloaded" was never true.** A download that half-finished looks finished
if nobody counts. Every area derives the exact list of tiles it needs from its
own bounds, and `verifyArea` counts them against real cache entries. Complete
means counted, not returned.

**It quietly falls back to the network.** On a desk that hides the problem; in
the field it *is* the problem. Reads are cache-first and, when the browser says
offline, they do not attempt a fetch at all — a miss comes back as a miss. The
map draws the best ancestor tile it holds rather than a grey square, so a partly
downloaded area degrades into a blurry map instead of a broken one, and says
how many tiles are missing.

Two things that are not in the app's hands. Safari clears script-created
storage for a site with no interaction in seven days of browsing — but **a web
app opened from the home screen keeps its own counter and is not swept that
way**, which is why the install instructions above matter more for the map than
for the block. The app also calls `navigator.storage.persist()` the first time
the map is opened, and the Areas panel reports whether it was granted.

---

## Layout

```
index.html            shell
app.webmanifest       install metadata
sw.js                 offline cache  (bump CACHE when you change files)
dev-server.py         no-cache static server for development
css/app.css
vendor/three.module.js
js/
  main.js             bootstrap, service worker, update prompt
  store.js            document state, undo/redo, autosave, import/export
  geo/
    math.js           strike/dip/rake vectors and frames
    model.js          rock types, event definitions, defaults, presets
    surfaces.js       topography and erosion-surface generator
    unmake.js         the inverse history, on the CPU
    stereonet.js      lower-hemisphere projection and the girdle fit
    glsl.js           the inverse history, generated as GLSL
  render/
    block.js          block geometry with a terrain lid and cutaway
    material.js       document → uniforms; decides when to recompile
    controls.js       touch-first orbit controls
    scene.js          renderer, camera, event helper geometry, picking
    contours.js       traces index contours to place elevation labels
    markers.js        strike-and-dip stations: readings and their symbols
  field/              the Map section's model — no DOM, no three.js
    geo.js            Web Mercator, tiles, distance on the globe
    model.js          stations, map units, cached areas, GeoJSON and CSV
    store.js          field notes in IndexedDB, with undo
    tiles.js          tile sources, the offline cache, download and verify
    dem.js            elevation decode, hillshade, contour tracing
    sensors.js        GPS watch and the compass clinometer
    declination.js    magnetic to true north
  ui/
    app.js            shell, section switch, tabs, identify tool, files
    panels.js         layers / history / terrain / field / view panels
    stereonet.js      the net, and the readout of what it found
    widgets.js        controls, compass dial, protractor
    surfaceEditor.js  shared surface parameter editor
    swatch.js         canvas lithology swatches
    icons.js          drawn SVG marks for tabs and event types
    map/
      section.js      the Map section: sensors, recording, areas, files
      canvas.js       the slippy map — tiles, overlays, gestures
      measureView.js  the full-screen clinometer
      panels.js       measure / stations / areas / setup panels
      symbols.js      station symbols and the position marker, on canvas
```

Caps: 20 layers, 16 events. Both exist to keep the generated shader inside the
fragment uniform budget of older mobile GPUs.

---

## Notes and limits

### The block

- **Faults are planar and slip is uniform.** Listric and bend faults, and blind
  thrusts whose slip tapers to a tip line, break the exactly-invertible
  property that the whole model rests on, so they need a different (iterative)
  approach. The fault code is written around a signed distance to the fault
  surface so a curved surface can be slotted in later.
- Folds are similar folds (Class 2): layer thickness is preserved parallel to
  the axial surface, not perpendicular to bedding.
- A plunging fold is built as an upright fold plus a rigid tilt about the
  horizontal axis perpendicular to its trend, so the whole fold train tilts —
  which is what puts the nose in the map view. Merely leaning the displacement
  direction over does not plunge anything; it shears the fold and leaves the
  hinge of a flat bed horizontal.
- Intrusions cut everything older than themselves and are deformed by
  everything younger, which is correct, but they have no chilled margins or
  contact aureoles.
- Erosion is applied at unconformities and at the land surface; there is no
  separate erosion event.
- Roughness is remembered per surface but is not applied to the **Flat**
  landform, so switching back to Flat always gives a level plain.
- Strike-and-dip markers are **not capped**, but each one is a full inverse-
  history query per rebuild, and every marker is rebuilt whenever the document
  changes. A few dozen is nothing; a few thousand would not be.
- The stereonet fits a girdle by the **orientation tensor**: build the mean of
  the poles' outer products and take its eigenvectors. The smallest eigenvalue
  belongs to the girdle's own pole, which is the fold axis. Outer products are
  sign-blind, which is what makes this the right tool for poles — a pole and
  its opposite are the same measurement.
- The verdict is not read off the eigenvalues but off two numbers in degrees:
  how far the poles sit off the fitted circle, and how much of that circle they
  cover. Woodcock's K and C are shown for anyone who wants them, but "your
  readings span 14 degrees of the girdle" is a thing a student can act on and
  "K = 0.7" is not.
- **A dome is not a gentle fold**, and the fit has to know it. Poles over a
  dome lie on a small circle, and a cone is fitted very nearly as well by one
  great circle as by any other — so the two smallest eigenvalues come out equal
  and the "axis" is whichever way the rounding error fell. The net only reports
  a fold axis when the smallest eigenvalue stands clearly below the middle one;
  otherwise it fits a cone instead and says so.
- The stereonet pane splits the stage by the shape of the screen, not its
  size: anything wider than it is tall puts the net beside the block, a phone
  in portrait stacks them. Either way the panels that quote numbers refresh on
  the cheap text-only path while a slider is moving, so a stale reading never
  sits next to a live one.
- Stacked, the divider between them is **draggable**, and can be pulled all the
  way to either end. A phone has no room to show a block and a net at once, and
  rather than pick a split, let the student slide it: all block while placing
  readings, all net while reading one off it, anywhere between while dragging a
  fold and watching both. Tapping the grip cycles the same three, because a
  pill you can drag is a pill people will tap. The block pane is clipped, so
  pulling the net over the whole stage takes the compass and the undo buttons
  with it instead of leaving them floating on the net.
- **Check the whole map** samples bedding on a grid and runs the identical fit.
  It deliberately does not read the fold event's own trend and plunge: later
  tilts would make that answer wrong, and the point is to compare like with
  like — a dense set of readings against a sparse one.
- A marker hangs at the lowest height that keeps every part of it — bar, tick
  and dip number — clear of the ground beneath that part. Clearing only the
  highest nearby ground and adding a fudge for the tilt is what buries the
  down-dip end of a steep symbol in a hillside; asking the question per point
  and taking the worst case does not. On a steep bed the symbol necessarily
  stands off the ground and touches along its lowest edge, which is what a card
  leaning on a slope does.
- A marker reads the bedding a half metre below the ground, which is the
  outcrop. Inside an intrusion there is no bedding to read and the marker says
  so instead of guessing.
- Under vertical exaggeration a marker tilts with the beds as they are *drawn*,
  so it stays lying on them, but the number it reports is the true dip. The
  scale chip says when exaggeration is on.
- Contours are shaded per fragment from elevation, not traced as polylines, so
  they cost nothing to redraw and stay sharp at any zoom. The index contours
  *are* traced on the CPU, but only to decide where their elevation labels go;
  each label then tells the shader to break the line around it, the way a map
  puts the number in a gap rather than on top of the contour. They fade out before
  they can alias into a solid wash, and switch to a light line on dark rock so
  they stay visible over coal and basement.

### The Map section

- **US only.** Every layer is US federal public domain, because that is the
  only imagery that can legally be bulk-cached for offline use. Outside the
  United States the map is blank; the compass, the GPS and the notebook still
  work, and a reading taken on a blank map is still a reading.
- **Imagery and topo stop at zoom 16**, about 1.8 m per pixel at 40°N. USGS
  advertises tiles to zoom 23 in its metadata and serves none past 16 — this
  was found by asking the servers, not by reading the documentation. Past that
  the raster is stretched and only the derived contours stay sharp.
- **Elevation is ~10 m** (3DEP via the AWS terrain tiles), so a station's
  height is good to a meter or so at best and contour lines are smooth rather
  than faithful in detail. It is still much better than GPS altitude.
- **A phone is not a Brunton.** Expect a few degrees on a good reading, more
  near a vehicle, a fence or magnetite-bearing rock. The clinometer reports the
  scatter within its own sample window, which catches an unsteady hand but
  cannot catch a steady one being deflected by a steel gate. Typing a reading
  in is a first-class input, not a fallback.
- **Declination is the app's one un-checkable number.** Get it wrong and every
  strike is rotated by the same amount without ever looking wrong. It is stored
  with each reading, so a wrong setting can be corrected afterwards in a
  spreadsheet without retaking anything.
- **Every phone browser reports a magnetic bearing, iOS included.** Safari
  exposes `webkitCompassHeading`, which reads as though it must already be
  true north; it is not. WebKit fills it from CoreLocation's `magneticHeading`
  and never from `trueHeading`, because `trueHeading` is only valid while
  location updates are running and a web page cannot guarantee that. So the
  declination correction is applied here, on every platform, and the setting is
  the only thing that makes a strike true. Trusting the property name instead
  puts every reading out by the local declination while the app looks like it
  is working.
- Some browsers give tilt with no compass reference at all, and there the dip
  is real and the strike is withheld rather than invented.
- **A compass heading is not an Euler angle.** There are two defensible ways to
  give a tilted phone a bearing: drop its long axis straight down onto the
  horizontal plane, which is what the Euler `alpha` encodes, or stand the phone
  level first and then read the azimuth, which is what a compass does and what
  CoreLocation returns. They agree only when the tilt is square to the phone —
  dipping away from you, or off to the side — and diverge at anything oblique,
  by 4° on a 30° dip and 20° on a 60° one. Substituting the heading into
  `alpha` therefore made the strike swing as the phone was turned on the rock.
  The frame is now rebuilt by levelling instead, which makes the answer depend
  on the surface and not on how the phone was laid on it.
- **Lines are measured with the phone's long edge**, which is a coarser gesture
  than laying its whole back on a surface — there is less of the phone touching
  less of the rock. Expect a linear reading to be the less trustworthy of the
  two, and check the scatter.
- **No line drawing yet.** Contacts, faults and traverses as *mapped* lines
  (as opposed to measured linear structures, which are supported) are the
  obvious next thing; this version records stations only.
- Readings do not yet reach the stereonet. `geo/stereonet.js` fits a girdle to
  any bag of readings and does not care where they came from, so wiring the
  bedding stations into it is small — it is left out of this version rather
  than left impossible.
- A station's elevation is filled in from the terrain a moment after it is
  recorded, and stays null if that area's elevation tiles were never
  downloaded. Null rather than zero: a station recorded at sea level because
  the terrain was missing is worse than one with no height at all.
- Deleting an area keeps any tile another area also needs, because overlapping
  field areas are normal and deleting one should not punch a hole in another.

---

# Working on the code

Only needed if you want to change the app. There is no build step and no
`node_modules` — plain ES modules plus a locally vendored copy of three.js.

```
python3 dev-server.py 8777
```

then open <http://127.0.0.1:8777/>. Any static file server works; the included
one just disables caching so edits show up on reload.

## Deploying

GitHub Pages serves `main` from the repository root, so **pushing to `main`
deploys**. It goes live a minute or two later.

⚠️ **Bump `CACHE` in `sw.js` whenever you change any precached file.** The
service worker is cache-first, so a browser that already has the app keeps
serving the old copy until that name changes. No error — it just silently
stays old.

⚠️ **Never rename `TILE_CACHE`, and never drop it from `KEEP`.** That is the
cache holding every downloaded map area. It deliberately carries no version, so
that bumping `CACHE` cannot take students' field maps with it. Renaming it
deletes them, offline, with no warning and no way back.

Two things that will fool you when checking a deploy:

- GitHub Pages sends `max-age=600`, so for ~10 minutes your browser may hand you
  the old files even though the deploy is live. Reload a second time.
- The first load after an update runs the *old* cached copy by design and shows
  the "newer version is ready" banner. That is correct behavior, not a failure.

Any static host works, as long as it serves over **HTTPS** — that is what the
service worker requires, and the service worker is what makes it work offline.

## Wrapping it as a store app

The code is a plain static site with no build step, so it drops into
[Capacitor](https://capacitorjs.com) unchanged when you want App Store and
Play Store binaries — `npx cap add ios`, point `webDir` at this folder. That
does need Node and Xcode; the PWA route above does not.

---

## License and attribution

Copyright © 2026 **Stephen Dobbs**.

Licensed under the [GNU Affero General Public License v3.0](LICENSE).

In short: you are free to use it, study it, share it and build on it. If you
modify it and make it available to anyone — **including by hosting it on a
website** — you have to publish your modified source under the same license and
keep the attribution. That network clause is the point: it is what stops a
modified copy being rebranded and run as someone else's product.

Using the app as-is with your students needs no permission at all.

Bundled third-party code and its license is listed in [NOTICE](NOTICE):
[three.js](https://threejs.org) (MIT).

Not legal advice.
