# Block — 3D geologic block diagrams

By **Stephen Dobbs** · [AGPL-3.0](LICENSE)

An offline-first phone app for geology students, in three sections.

**Block** builds 3D geologic block diagrams and lets you interrogate them.
Rotate the block, stack a stratigraphic column, apply a history of tilts,
folds, faults, intrusions and unconformities, drape a landscape over the top,
and tap anywhere to identify the unit and read its strike and dip. Wind the
history back and watch it built from flat-lying beds one event at a time. Draw
a line across the map and it cuts the cross-section along it; drag the slicer
and it shaves the block down level by level, so each new flat top is the map
you would get at that depth.

**Map** is a field notebook for the outcrop you are standing on. Download US
topographic and aerial maps before you leave, take your position from GPS,
measure strike and dip by laying the phone on the bedding, and record what
each reading was taken in.

**Strata** is the measured section. Units in order, grain size across the
page, fossils and sedimentary structures in the margin, formations bracketed
beside their members. Units you name here are the ones you tap on the map and
the ones the block is built from.

**Build a block** joins the three. Draw a box around ground you have mapped
and the app cuts a block out of it: real topography as the lid, your stations
standing on it, and a geologic history fitted to your measurements. It then
draws the map that history predicts over the one you walked, so you can see
where the two disagree. Thicknesses it reads off your contacts come back to
the column and sit beside your own; where they disagree it says so instead of
picking a winner.

All of it runs with no signal.

---

# Open it

## 🔗 [scdobbs.github.io/block-map-preview](https://scdobbs.github.io/block-map-preview/)

## On a computer

Open the link. Chrome, Safari, Firefox and Edge all work, and there is nothing
to install.

- **Left-drag** turns the block
- **Scroll** zooms; **right-drag** or **shift-drag** pans
- **Click the block** to identify the unit and read its strike and dip
- **History → Wind it back** runs the block from flat beds to what it is now
- **View → Cut a cross section** draws it along a line you drag across the map
- **View → Slice down through it** lowers the top of the block one contact at a time

Start on the **View** tab, load an example like *Anticline & syncline* or
*Horst & graben*, then take it apart on the **History** tab.

## On a phone

The link works straight away in the browser. To have the app **in the field
with no signal**, add it to your home screen.

### iPhone / iPad

1. Open the link in **Safari**. Chrome on iOS cannot install it properly.
2. **Wait for the block to appear**, then wait about 5 seconds more. This is
   when the app stores itself for offline use.
3. Tap **Share** (the square with the arrow, bottom centre).
4. **Scroll down** the share sheet and tap **Add to Home Screen**.
5. Tap **Add**.
6. **Open it from the new icon while you still have signal** and let it load
   once. iOS gives a home-screen app its own storage, separate from Safari's,
   so this is when that copy gets stored.

### Android

1. Open the link in **Chrome**.
2. **Wait for the block to appear**, then about 5 seconds more.
3. Tap the **Install** prompt if one appears. Otherwise **⋮** (top right) →
   **Add to Home screen** / **Install app**.
4. Confirm, then open it from the new icon.

### Check it before you rely on it

Turn on **Airplane mode** and open the app from the home screen icon. It
should load normally.

If you get an error page, turn airplane mode off, open the app again, let it
sit ten seconds, close it fully and retest. An error only means the download
in step 2 was cut short.

### Once it is installed

- Opens **full screen**, no browser bars
- **Saves your work automatically.** Close it mid-block and it comes back as
  you left it
- **One finger** turns, **two fingers** pinch to zoom and drag to pan, **tap**
  identifies the unit under your finger
- The panel has a **drag handle**. Pull up for more panel, push down for more
  block

When a new version ships you will see a **"A newer version is ready —
Reload"** banner the next time you open the app *with* a connection. Tap it.
Offline, the app keeps running the copy you already have.

---

# Using it

## Layers

Build the column. Tap a unit to set rock type, thickness and colour, or to
delete it. **Drag a unit by its grip** to move it through the column; the
Younger/Older buttons in the editor do the same thing.

Lithology patterns follow the usual map conventions and are drawn
procedurally, so they stay crisp at any scale.

## History

The geologic timeline, newest at the top. Add events, then tap one to edit it.
Strike and trend get a compass you can drag, dip and plunge get a protractor,
and both accept typed numbers.

**Drag an event by its grip to move it through time** (the arrow buttons in
the editor do the same). You can also disable an event without deleting it,
which is the quickest way to see what it was doing.

### Wind it back

A slider above the timeline runs the history: at the far left the block is the
flat-lying beds it started as, and every step to the right is one more event
happening. **▶** plays it through and stops at the present.

Everything the block shows is wound back with it. The map face, a tap on it,
the stereonet, the cross section, the ground map and the contacts the slicer
clicks on to are all the block *as it stood at that moment* — because they all
read the history through one function rather than each keeping their own idea
of it. Events the slider has not reached yet are greyed on the list, and a
chip over the block says how far back you are and takes you home.

Winding time is not an edit. It does not go on the undo stack — playing a
history through would otherwise bury the last real change under a dozen
viewpoints — and a saved file always reopens in the present.

### What an unconformity does to the slider

This is the case worth understanding, and the reason the slider is not simply
"apply the first N events".

An unconformity does two things: it erodes down to a surface, and it says that
the youngest *n* units of the column were deposited **on** that surface. So
before it happened, those units did not exist. Wind back past one and they
have to go — leave them in and you would be looking at cover sitting
conformably on beds it postdates by an era, which is the exact opposite of
what an unconformity is.

So every unconformity still in the future takes its own units out of the
column with it, and the control names them underneath: *not yet deposited:
Sandstone, Shale*. The units already gone from the column also drop out of the
cross-section legend and off the slicer's list of contacts, because there is
no contact there yet.

What fills the space where the cover will be is the topmost surviving unit,
carried on upward. That is the block's ordinary rule for ground above the
column, and here it happens to be exactly right: that is the rock the
unconformity is about to erode away. Step forward one and you watch it be
removed and the cover arrive in the same beat.

## Terrain

The land surface: flat, slope, hills, valley, ridge or mountain, with
roughness on top. A valley with an axial gradient is the one to use for
demonstrating the rule of Vs.

**Contour lines** are drawn on the map face, every fifth one heavier and
labelled with its elevation. The interval is picked from the terrain's own
relief so you get about a dozen lines whatever the landform, and you can pin
it to a fixed value instead.

This tab also holds block size, vertical exaggeration (display only — strikes
and dips are unaffected), and the **cutaway**, which slides the east and north
walls into the block to expose fresh cross-sections. The cutaway is the only
way to see a pluton that sits entirely inside the block.

## Field

Strike-and-dip readings you place yourself. Tap **Add strike & dip**, then tap
the block. Keep tapping to leave as many as you like.

**Drag a marker** and it slides across the ground with your finger, re-reading
the bedding as it goes. Over a fold hinge you can watch the dip roll through
horizontal and come back the other way.

A marker stores only its map position. Its height comes from the terrain and
its attitude from whatever the rock beneath it is doing, so it can never
report something the block does not contain. The symbol is drawn *in* the
bedding plane: from map view it is the ordinary map symbol, and from an
oblique view it lies on the beds. Flat-lying beds get the cross-in-circle,
beds on end the double tick, and a station with no bedding under it (inside a
pluton, say) an open circle rather than an invented number.

### The stereonet

**Plot on a stereonet** opens the net *beside* the block rather than over it,
and leaves it there. It is a second view of the same geology, not a page you
visit.

On a phone, where the two are stacked, drag the pill between them to give
either one the whole screen, or tap it to cycle. The **ground map** shares
that slot and that pill. Opening either on a stacked screen drops the panel to
its handle, and the full-screen button over the block hides the panel
outright.

Every reading goes on as a pole to bedding, and a girdle is fitted through
them. That fit is the exercise: on a cylindrically folded surface the poles
all lie in the plane perpendicular to the hinge, so the pole of the fitted
girdle *is* the fold axis. It is recoverable from readings taken anywhere,
whether or not the fold closes inside the block. Turn on **Great circles** to
get the same answer the other way round, as the point every bed's great circle
passes through.

**Check the whole map** reads bedding on a grid across the block and fits the
same girdle to it, so you can see how close your handful of stations got
without being told what the fold was set to.

**Two sets of poles on a block cut from a field area.** The round poles are
the block's, read out of the geology under each marker. The green crosses are
your notebook readings, untouched by the fit. Both are fitted and both
verdicts are printed, measurements first.

The difference matters. On a block you built by hand, a marker recovering its
attitude from the rock beneath it is exactly right — the block is the ground,
and a marker is you going and looking at it. On a block *fitted to a notebook*
that is circular: the poles are the fit's own answer handed back to it, and
they will land on a flawless girdle whatever the outcrop did, because what
they were read off is one cylindrical fold by construction. A misfit of zero
there is a tautology, and the readout says so. **Check the whole map** has the
same problem, since both sides of that comparison come out of the block, so on
a fitted block it tells you whether your stations sampled it fairly rather
than whether the block is right. The measured poles are the only marks on the
net that can disagree with the model.

Because the net stays up, it works as an instrument rather than a lookup. Open
a fold in **History** with the net beside it and drag the plunge: the block
re-folds, every marker re-reads the bedding under it, the poles slide round
the net and the girdle swings with them, in the same frame. Nothing in that
chain consults the fold event — the answer is re-derived from the geometry
each time, which is why it stays right when the fold is one of several events.
Dragging a station does the same thing from the other end: walk three readings
across a hinge and watch them stop being one attitude and become a fold axis.

The numbers land in three places: lettered beside the mark on the net, spelled
out in the readout next to it, and carried back to the **Field** tab as a
one-line finding that survives hiding the net. Lines are written **trend /
plunge** and always labelled, the same way the History tab states a fold axis,
because `020/15` on its own reads exactly like the strike and dip of a plane.

The net also says when it cannot answer:

- Readings from one limb are one attitude and define no axis.
- Poles on a small circle rather than a great one are a dome or a basin, which
  has no hinge line at all.
- Poles on neither are not one structure.

Tap a pole to select that reading. Equal-area (Schmidt) is the default;
equal-angle (Wulff) is a tap away.

## View

Worked examples to load and take apart, **Read it as a map (2D)**, canned
viewpoints, display toggles, and save/open/export.

**Event guides** turns off the translucent plane drawn for whichever event is
open in History. That plane is drawn over the block so you can see where the
structure sits, which is exactly what you do not want when reading the map.

**Read it as a map (2D)** drops the 3D altogether: an orthographic camera
straight down, north up, no perspective and no rotation, with the
strike-and-dip symbols lying flat the way they are printed. This is not the
same as pointing the camera downward. Under perspective, a symbol at the edge
of the sheet is seen obliquely and you would be reading a foreshortened one.
Orthographic means every symbol is seen exactly as it is.

One finger pans, pinch or scroll zooms, and tapping still identifies units and
places readings. A **Map view** chip sits beside undo/redo to get back out,
because the gesture that would normally do it — turning the block — is gone.

## Cross section

**View → Cut a cross section** opens a section pane beside the block, in the
same slot the stereonet and the ground map use. Only one of the three is up at
a time; a phone does not have room for three views of one block.

The pane has a small map at the top with **A–A′** drawn on it. Drag either
lettered knob to move an end, or press anywhere else on the map and drag to
start a fresh line from that point. **W–E** and **S–N** put it back across the
middle, and **Flip** swaps which end is A. The heading beside the title gives
the bearing of the line and its length.

Below it is the section itself. It is not a picture of the block's cut face —
it is the block asked what rock sits at every point of the vertical plane
through that line, so it is a genuine section along any bearing, not only along
the four walls. On it:

- **the ground profile**, in white, is the land surface along the line
- **contacts** are inked wherever two different units meet, which includes the
  ones a fault makes by putting one unit against another — that is what makes
  an offset visible even where the same unit sits on both sides
- **faults** are drawn in red and **dike walls** in blue, folded and offset by
  whatever happened to them after they formed — and stopping at whatever came
  later still, so a fault buried under an unconformity ends at it rather than
  running on through cover it never cut
- **unconformities** are the dashed green line, with the older beds visibly
  truncated against it
- **stations** near the line are projected on to it and drawn at their
  **apparent** dip, dimmed when they had to be carried far to get there

**Tap the section** to name the unit under your finger and read how far along
the line and at what elevation it is.

**VE** sets the vertical exaggeration. **Fit** is the default and fills the
pane, because a phone-sized pane at true scale is a hairline — but a fitted
section redraws at a different vertical scale every time the pane is resized or
the line is moved, and two drawings like that cannot be compared with each
other. Pin it to ×0.5 through ×5 and the scale holds.

A pinned section keeps the **whole of A–A′** on the page and gives up depth
instead: it shows the ground down as far as that scale reaches, marks the
bottom edge with a dashed rule rather than a solid one, and names the
elevation it stopped at under the plot. Drag the pane taller and it reaches
further down. The exaggeration is stated either way, so the drawing never
quietly overstates a dip.

**Stations** turns the projected readings off.

### Apparent dip is the point

A bed measured at 60° does not look like 60° in a section cut oblique to its
strike, and drawing it that way is one of the commonest things to get wrong by
hand. The section foreshortens each reading by how obliquely the line crosses
strike — cut exactly along strike and the beds are drawn flat, however steep
they are — so the tick you see is the one that belongs in this picture rather
than the number in the notebook.

## Slicing down through it

**View → Slice down through it** puts a slider at the foot of the block. It
lowers the top of the block, so the fresh flat face is the geologic map you
would get at that depth: dragging it down is walking down through the
structure one level at a time, watching the map pattern change.

It does not cut the model open. The lid becomes `min(terrain, slice level)`,
which keeps the solid closed, so the new face is a real face — it is coloured
by the same walk through the history as everything else, and **tapping it
identifies the rock at depth** with no special handling. Contours and stations
above the cut go with the ground they were on.

The slider clicks on to the base of each unit in the column, marked as ticks
under the track, and **▲ ▼** step contact to contact. The readout names the
one it has landed on.

### What the stops actually are

They are where the contacts sit in the column **as deposited**, before the
history bent them. A tilted contact is not at one elevation, so there is no
single number that could be its own — which is why the readout says *level
with the base of the Limestone* rather than *at* it.

That is not a defect of the stops, it is the thing worth watching. Slice
flat-lying strata at the base of a unit and the whole map goes one colour. The
more the same stop refuses to do that, the more the beds have been deformed,
and the pattern left on the cut face is the map of that deformation.

## Identify

**Tap the block** anywhere to identify the unit under your finger and read the
strike and dip of bedding at that point, recovered the same way a field
measurement is: from the orientation of the bedding surface itself.

---

# The Map section

Reached by the **Block / Map** switch above the diagram. It keeps its own
notes, its own storage and its own downloaded maps. The two halves share the
rock list and the conventions for strike and dip, and nothing else. A block is
something you invent to understand a structure; this is a record of a place
that exists.

## Projects

Two field areas have nothing to say to each other, and a notebook that mixes
them is one nobody can hand in. **Setup → Project** keeps them apart. Each
project holds its own stations, lines, units, downloaded map areas,
declination and remembered map view.

Switching is one tap and the map comes back where that project left it. A new
project inherits the declination, the accuracy limit and the base layer, which
describe the phone and roughly where on Earth it is, and nothing else.

Deleting a project deletes only the map tiles no other project is using. Areas
belonging to every other project are gathered first and anything they still
need is kept, since two field areas can overlap and a download is a fact about
the device rather than about the work. The last project cannot be deleted.

A notebook from before projects existed is carried into the first project
rather than stranded.

## Before you leave, while you still have signal

Everything in this section lives on the **EPS 105** tab, in the block's own tab
bar. It is there rather than in the Map section because it all has to be
reachable on day one, when the Map section may still be locked.

**Field ready** answers the only question anybody actually asks in a parking
lot: can this phone be walked away from a connection right now. It counts what
is in the cache rather than trusting a flag set when a download returned, so an
area the browser has quietly evicted since shows up here rather than on a
ridge. Red means turn around. Amber is worth fixing and will not stop you.

If the build ships a **course pack** covering your area, install that and you
are done. One button, a few large downloads instead of a couple of thousand
small ones, and byte-for-byte the same map everybody else on the course has.
It does not have to be done anywhere near the field area — a dorm or an
airport is fine, and a week early is better than the morning of.

Otherwise, on **Map → Areas**, draw the box yourself:

1. **Areas → Choose an area to download.** The box starts on whatever is on
   screen and its corners drag. The panel counts the tiles and the megabytes
   as you size it.
2. Pick **Topo**, **Imagery**, or both. Keep **Elevation** — it is small, and
   it is what draws the hillshade, the contour lines and every station's
   height.
3. **Check it.** An area is marked complete when every tile it needs has been
   counted in the cache afterwards, not when the download returns. **Check**
   re-counts at any time and **Repair** fetches whatever is missing. An area
   short of tiles says so, in the list and on the map.
4. **Declination sets itself.** The field-ready check asks NOAA for the value
   at the centre of your field area and applies it — at the area, not at
   wherever the phone happens to be, which is the whole point: doing this at
   home on wifi is hundreds of miles from the field, and the declination there
   is not the one that corrects your readings. It needs a connection once.

   It does not wait for the download. A downloaded area is used when there is
   one, but the shipped course pack already says where the field area is, so a
   phone opened for the first time gets the right number before a single tile
   has been fetched.

   It will **replace** a value that is already there, and say so on the line.
   A phone carrying a declination from somewhere else is the case worth
   catching: the check would otherwise show a green line the student believes,
   and every strike would be out by the difference without ever looking wrong.
   Once the number came from your own area's centre it is left alone, so this
   costs one lookup and not one per visit.

## On the outcrop

The buttons down the right edge are **centre on me**, **change layer**, **full
screen**, and **place a station by hand**. Full screen hides the panel
entirely, the same way the clinometer hides the map: reading a map and filling
in a form are different jobs, and a phone has room for one at a time.

The map **follows you until you touch it**. The first fix centres on you and
the crosshair button lights up. The moment you drag the map it lets go, so you
can look somewhere you are not standing, which is most of what the Areas tab
is for. The crosshair brings you back and starts following again. Panning is
not an edit and does not land on the undo stack.

**Measure** is the working screen. It shows the fix, its accuracy radius, how
old it is, and the ground elevation read from the cached terrain. A station
cannot be recorded on a fix worse than the limit you set, and when the button
is disabled it says why.

**Open the compass** goes full screen. A reading is taken with the phone flat
on rock and read at arm's length, and at that moment nothing else on the
screen is any use.

The dial is a fixed 0–360 card with the strike-and-dip symbol turning inside
it, rather than a compass card spinning under a fixed mark. A turning card is
right for walking a bearing; for reading a structure you want to see the
symbol in the orientation it will have on the map, so you can check at a
glance that the app is describing the surface actually under the phone. Beside
the numbers is a small side elevation showing how far the surface leans off
horizontal, because a plan view cannot show a dip.

Or **Type it**, using the same compass dial and protractor the History tab
uses. Neither input is the fallback. A phone magnetometer is worth a few
degrees at best and worse beside a truck, so a Brunton reading typed in is the
better measurement and the app treats it that way.

The compass averages a second of samples and reports how far they disagreed.
That **scatter** is the number to watch. A phone resting on rock settles to a
few tenths of a degree, and a bar fills as it settles so you can watch it
happen. The scatter is stored with the reading, so a bad one stays visibly bad
in the notebook weeks later.

## Planes and lines

Not every structure is a plane. Switch the instrument to **Line** and it reads
**trend and plunge**: lay the long edge of the phone along a lineation, a fold
hinge or a set of slickenlines, point it down-plunge, and read it off.

Both come from the same instant of the same sensors. The phone's back lies on
the surface while its long edge lies *in* that surface, so one reading
captures both. On a slickensided fault, one placement of the phone records the
fault plane and the slip line together, and flipping between Plane and Line
afterwards shows two real measurements rather than blanking one of them.

With the phone's long edge laid straight down the dip, the two readings are
the same measurement: the trend comes out exactly strike plus ninety and the
plunge exactly the dip. Lay the edge anywhere else on the surface and the line
is a different line in the same plane, which is what records a slickenline.
Both forms are shown at once, so neither has to be worked out on paper.

A station stores one pair or the other, never both, and the feature type says
which. A line is written **trend / plunge** and always labelled, because
`020/15` on its own reads exactly like the strike and dip of a plane. On the
map a line is drawn as an arrow pointing down-plunge, so the two families of
symbol never have to be told apart by their numbers.

**Name the feature** — bedding, foliation, joint, fault plane, contact. It
costs a tap and it keeps a joint from quietly joining a fold-axis fit. Two of
the names do more: **a fault plane and a slickenline are evidence about the
fault**, and the block fit reads them there. A plane measured on the surface
itself outranks anything derived from the trace, and a slickenline gives the
rake — the direction of slip, and the one fault parameter nothing else on a
map can supply.

**Name the unit** by tapping one you have used before or typing a new one. A
name typed once becomes a tap thereafter, and a course can set its units up in
advance on Setup.

### Stations you could not finish

A station recorded **without an attitude is not finished, and is not a dead
end**. Plenty are deliberate — a covered contact, float, a surface you could
not reach — and plenty become measurable later, from the far side or on the
way back down.

Open one in **Stations** and it offers *Type one in* or *Read it now*. The
second opens the clinometer pointed at that station, so holding a reading
updates it instead of making a new one. Until there is a reading it is free to
become either a plane or a line, and the symbol on the map changes from a bare
ring to a strike-and-dip mark or an arrow as soon as there is one. Filling one
in needs no GPS fix: the place was recorded when you were standing there, and
only the reading is outstanding.

**Stations** lists what you have, nearest reading first, with its distance
from you.

## Drawing contacts and faults

A geologic map is mostly lines. The stations say what the rock is doing; the
lines say where one thing stops and another starts.

**Lines** → pick a kind (contact, fault, unconformity, dike, traverse), then
put points down two ways:

- **Tap the map** where you can see the trace going.
- Press **Here** to drop a point where you are standing, which is what you do
  when the contact is under your feet and invisible from any distance.

Undo takes back the last point, Done keeps the line, and the × throws it away.
**Keep drawing** picks an existing line back up and adds to its end.

**Points can be dragged**, while the line is being drawn and afterwards. A
selected line shows a handle on every point. A whole drag is one undo step,
not sixty. Handles appear only on the line being drawn and the line selected,
because every line on the map offering them would make a busy sheet impossible
to pan across. A stray point on a finished line can be removed outright, down
to the two a line needs to exist.

### What a fault carries

Three things a trace alone cannot give you, asked for on the line itself:

| | |
|---|---|
| **Dip direction** | Not measured, vertical, or one of the two bearings its own trace allows, given as a three-digit azimuth (`117°` — the compass direction the plane leans toward). A separate protractor sets the **dip angle**. |
| **Which way it moved** | Thrust, normal, dextral, sinistral, or not sure. |
| **The unit either side** | Hanging wall and footwall, offered once there is a dip direction for those words to mean anything. |

Dip direction and dip angle are the pair a notebook writes as `117/30`, and
they are kept visibly apart because running them together is the easiest
mistake in the control: one is measured on the map with a compass, the other
in the vertical plane with a clinometer.

The two bearings offered are ninety degrees either side of the trace and no
others, because the line already fixes the strike. The only thing left to say
is which side the plane leans to, and the fit takes it that way round, so the
strike keeps following the line if a point is dragged later.

None of the three is guessed and none is required. What they buy is described
in [Build a block from what you
mapped](#build-a-block-from-what-you-mapped): a dip where the ground was too
flat to give one, a slip search narrowed from every direction to one, and a
measure of the throw that does not need the same contact mapped twice.

### How well you know a line

Every line carries a confidence, and is drawn the way a published map draws
it:

| | |
|---|---|
| **Certain** | solid — walked, or clearly exposed |
| **Approximate** | dashed — located to within a stride or two |
| **Inferred** | long-dashed — interpolated between exposures |
| **Concealed** | dotted — under soil, scree or alluvium |

That distinction is most of what makes a map honest. A student who cannot draw
an inferred contact will either not draw it or draw it as fact, and both are
worse than a dashed line.

Faults are drawn heavier and in red, the way a map prints them, and a contact
records the unit above it and the unit below it.

Deleting a line asks first, and says what it is about to lose: its name, how
many points, how far it runs. So does deleting a station or removing a unit.

---

## Shading the units

A geologic map is mostly polygons. Until now this one had only the lines round
them, leaving the units to be held in your head.

**Lines → Units → Shade a unit**, then tap inside an area your contacts
enclose. It fills out to them, and **names itself from the readings standing
inside it**.

You already said what the rock was at every station you stood on. Asking again
when you shade the area is asking for the same fact twice and giving you a
second chance to disagree with yourself, so there is usually nothing to
choose. The chips above are there to overrule the readings, or to name ground
you never took one in.

**Two different units named inside one area is reported, not resolved.** That
is a real contradiction: either a contact between them has not been drawn, or
one of those stations is logged in the wrong unit. Quietly taking the majority
would bury the one thing worth seeing. The same check runs on every shaded
area afterwards, so a patch that stops agreeing with the readings in it says
so.

**The polygon is not stored.** A unit patch is a name and a point inside it,
and the area is flooded out to the contacts every time it is drawn, so it
cannot go stale. Drag a contact and the shading follows it, because there is
only one copy of that geometry and it belongs to the lines. A whole geologic
map costs a few dozen points of storage.

Contacts, unconformities, faults and dikes stop a fill. A traverse does not:
where you walked is not a boundary.

**A barrier is one cell wide**, which is what lets a narrow unit be filled at
all. A dike fifteen metres across on a sheet a kilometre wide is only a few
cells of band, so a barrier three cells thick — which is what a thickened line
comes to — eats the unit from both sides and the fill comes out as broken
slivers, or escapes into the rock next door. One cell holds because the flood
walks the four neighbours while the line is laid down eight-connected, and a
4-connected path cannot cross an 8-connected one. Only the *ends* of a line are
thickened, because a junction is the one place a hand-drawn map really does
fall a metre short.

**The edge of the sheet is a boundary too**, exactly as on a printed map. Real
contacts almost never close on each other. They run off the side of the ground
you walked, and the band between two of them is open at both ends. A fill that
stopped only at contacts would escape from nearly every real map.

Better, draw the edge yourself. **Map boundary** is a line kind like any
other: the neat line round the ground you are claiming to have mapped. It
stops a fill the way a contact does, so units can be filled in against it, and
it is deliberately invisible to everything that reasons about geology. It is
never read as a contact or a fault, never counted among the surfaces a
structure is fitted to, and never allowed to stretch the area the fit thinks
you covered. It says where you stopped looking, which is a fact about the
survey rather than about the rock.

**Colours belong to the unit, not the patch.** Tap the swatch on any shaded
area and every outcrop of that unit follows, on the map and in the block's
column. The unit is created for you if you only ever named it on an outcrop.

Tapping ground that is already shaded does not add a second patch. The flood
knows which patch owns that cell, so it tells you which one it is and leaves
the list alone.

One unit crops out in many places, so a patch carries a unit name rather than
a unit owning a polygon, and a unit has as many patches as it has outcrops. A
unit you set up in advance brings its own colour; one that exists only because
you typed it on the outcrop gets a stable colour of its own, so the shading is
useful before any of that is filled in.

**A fill that would swallow most of the sheet is not drawn.** It means there
is no boundary round that point yet, and a wash over the whole map would hide
the very contacts you need to see to fix it, so the panel says so in words
instead.

## Getting the work out

Four buttons, on both the Stations and the Lines tab, because they go to
different places:

| | |
|---|---|
| **Google Earth** | KML. Stations as placemarks labelled with their attitude, lines draped over the terrain in their map colours. Double-click it. |
| **GeoJSON** | Stations as points and lines as LineStrings in one file, for QGIS or ArcGIS. Carries strike, dip and dip direction as fields, so a layer can be symbolised on `strike` directly. |
| **CSV** | Stations one per row. The Lines tab exports lines instead, each as a WKT `LINESTRING`, which is what QGIS reads when you add a delimited text layer — so a spreadsheet of contacts comes in as real geometry rather than as a table nobody can map. |
| **Backup** | The whole notebook, and the only one that can be read back in here. |

Attributes go into KML's `ExtendedData` as well as the description bubble, so
the same file opened in QGIS arrives with real fields rather than a blob of
HTML. Lines are `clampToGround` and tessellated, so a contact follows the
ridge it was walked along instead of cutting a straight chord through it.

## What the map is made of

Every layer is US federal, public domain, and free of any restriction on
caching it for offline use. That is why the map is US-only: every commercial
basemap worth having forbids the bulk pre-caching this feature exists to do.

| Layer | Source | Best zoom |
|---|---|---|
| **Topo** | USGS 7.5-minute quad | 16 (~1.8 m/px) |
| **Aerial** | USGS orthoimagery | 16 |
| **Aerial + topo** | the same imagery with contours and names over it | 16 |
| **Elevation** | Terrain Tiles on AWS (USGS 3DEP) | 15 (~10 m) |

**Aerial + topo is the prettier layer and the gappier one.** USGS has not
cached the combined layer everywhere it has cached the two it is made from.
Around the Poleta folds in the White-Inyo Mountains a whole column of it is
absent, while plain Aerial and Topo both cover the same ground completely. If
an area reports tiles that are not published, try Aerial.

A tile the server does not have is recorded as such rather than counted as a
failed download. Otherwise an area containing one could never be marked
complete and Repair would retry it forever. The map fills those squares from
the next zoom out, so a hole in the source shows as a softer patch rather than
as nothing at all.

**The imagery stops at zoom 16** and there is no public-domain way past it.
Past that the photograph goes soft. Elevation is numbers rather than a
picture, so the **hillshade and contours are worked out on the phone** and
stay as sharp as the screen can draw them: zoom in on an outcrop and the
contours hold while the imagery blurs. Elevation is also where a station's
height comes from, since a phone's GPS altitude is routinely tens of metres
out and the terrain under a known latitude and longitude is not.

Roughly, a 10 × 10 km area is about 12 MB of topo, 21 MB of imagery and 8 MB
of elevation, across every zoom from 10 to the layer's best. Storage starts at
about a gigabyte, so a dozen field areas fit comfortably.

---

# Build a block from what you mapped

**Block** is the tab that joins the two halves. It turns your field notebook
into a 3D block: real topography, your stations standing on it, and a geologic
history fitted to what you measured.

## What you do

1. Open the **Block** tab in the Map section.
2. Under *Choose the area to model*, **draw a box** around the ground you have
   mapped. It works like the box on the Areas tab: drag the corners.
3. Press **Build the block**.

You get a block whose lid is the **real topography**, taken from elevation
tiles the area already downloaded, so this works on a ridge with no signal.
Your stations stand on it as ordinary map symbols. The fitted history arrives
as ordinary events on the **History** tab, so you can tap one and change it.

Treat the fit as a first draft. Arguing with it is the exercise.

## What the fit reads

Everything below comes out of your notebook. None of it is required, and the
fit tells you what it had to do without.

| Evidence | What it constrains |
|---|---|
| **Bedding readings** | The shape of the structure: fold, dome or single tilt, and its orientation |
| **Contacts you drew** | How the same surface runs across the map, and the thickness between one contact and the next |
| **Upper and lower unit on each contact** | Which traces are the same contact, which is what makes a fault's throw solvable |
| **Shaded units** | Where the column sits, over an area rather than along a line |
| **A fault plane measured at an exposure** | The fault's dip and strike directly |
| **Dip direction and angle set on a fault line** | The same, where you did not measure the plane itself |
| **Slickenlines on a fault** | The rake — the direction of slip |
| **Sense of movement on a fault** | Which way along that direction |
| **Units either side of a fault** | The stratigraphic separation, with a sign |
| **Unit names on stations** | Nothing. These are held back as an independent check (see below) |

## How the fit runs, in order

The order is the argument, not an implementation detail.

**1. The stereonet decides the shape of the answer.** From the readings alone,
with the map not consulted. Poles in a cluster are one attitude and admit no
fold. Poles on a girdle are a cylindrical fold, and its hinge is already
known. Poles on a small circle are a dome, which has no hinge line at all.
Fitting a fold to a homocline would always "succeed", at some enormous
wavelength, and mean nothing.

**2. The structure's numbers are fitted to those readings**, with the faults
not yet in place. A fault translates a block without rotating it, so the beds
it carries keep their attitude.

For a fold this happens twice, in two different ways. First as the plain
cosine every fold in the app has always been, by a coarse scan and a descent.
Then with the **shape of the fold set free**: once the net has fixed the
hinge, the cross-section is a *linear* problem. A station's dip is the slope
of the profile at that point; a contact's points all sit at one level of it;
a shaded unit's points sit between two levels. Written as a series of eight
harmonics, all of that is one solve with no scan, no descent and no local
minimum — the best shape for that hinge, outright — and the only search left
is over the two numbers the net already measured. A prior on curvature keeps
the high harmonics quiet unless the mapping insists on them.

The free shape then has to **earn its place**. It is held against the cosine
on the whole of the evidence, and kept only if it fits better by more than
its extra freedom is worth, in both absolute and relative terms. A fold that
really is a cosine comes back as one, with a note saying the profile was
tried. A verging or box fold comes back as a profile, with the cosine's
misfit quoted beside it. Readings the net calls *not one structure* are never
given a free shape at all, because a profile can always bend closer to a
contradiction, and the honest answer to one is the warning, not a wigglier
fold. With faults on the map the comparison waits until the faults are in
place (step 5), or a free shape would explain a displaced contact as a kink
and leave the slip nothing to measure.

**3. Each fault plane is established** from a plane read at an exposure first,
then from whatever you set on the line, and only failing both from its drawn
trace against the terrain, by geometry rather than by search. A fault trace is
the intersection of the fault with the ground, so the traced points lie in the
plane, and the plane is the one that best contains them. Where a measurement
and the trace both have something to say, they are held against each other:
they describe the same surface, and twenty degrees apart means one of them is
in the wrong place.

**4. Only then is slip fitted**, against contacts mapped on both sides, the
units named either side, the sense you observed, and any slickenlines measured
on the plane.

**5. The fold and the slip are refitted against each other**, once each way.
Step 2 is only half true, and it is worth saying which half: the beds a fault
carries keep their attitude, but the attitude you *see* at a station is the
fold's attitude at wherever that rock came from, and sliding the hanging wall
changes that. So the offset was just fitted to a fold that was fitted assuming
no offset. One pass back and forth lets each answer for the other.

**6. Both sides of every fault go on the stereonet separately.** A block here
is one structure with a piece of it slid along a plane. That is the right
model for a fault cutting a fold and the wrong one for a thrust carrying a
differently folded sheet in over another. If the whole set of readings is a
mess and each half of it is clean, that is not noise in the data — it is the
fault on the map, no offset will fix it, and being told so beats an afternoon
spent adjusting a fold to fit readings from the other side of a thrust.

**7. The dikes go on last**, and last means youngest, so a dike cuts
everything under it. Nothing on the map is read to decide that — the
cross-cutting relations that would settle it are not inferred — so the report
says it in words and the block's History tab is where it gets moved. Drag a
dike below the fold and it is folded with the beds, which after *A folded
dike* above is a change you can see rather than one you take on trust.

A dike is drawn as **one line**, a centreline, because at any scale where a map
is readable a sheet a few metres across *is* a line. It is *drawn* at the width
you gave it, though: a line symbol's weight is a minimum and not a width, so
where the sheet is wider on the ground than the symbol is on the screen the
ground wins, and dragging the thickness slider widens the band on the map under
your finger. Zoom out far enough and the symbol takes over again, which is what
stops a four-metre dike disappearing from a map of a whole valley.

Once it is wide enough to have an inside it stops being drawn as a boundary and
is drawn as a body: **a translucent wash, cased in white, walled in its own
colour, with chevrons marching along it** — the same mark the block draws on
volcanic rock, so a basalt dike carries the same ornament in plan that it does
on the face of the block it builds. Translucent because a solid bar over aerial
photography hides the ground the dike was mapped from, which is the one thing
you are holding the map up to compare it against.

The chevrons follow the trace rather than tiling the screen. A screen-space
pattern knows nothing about the band it is filling: in something twenty pixels
across it lands a grid of fragments that reads as a mesh, and turning the tile
up large enough to read simply clips it away. Walking the centreline puts one
chevron across the sheet however wide it is, pointing the way the dike runs. So the trace gives the
strike always and the dip wherever the ground has the relief to say — the same
`faultFromTrace` a fault uses, because it is the same question — and the line
card gives the two things no trace can: how wide the sheet is, and what it is
made of. Neither is guessed silently; the report says twenty metres of basalt
was assumed, and where.

A dike is placed and not fitted. It is a body you drew, carried across, and it
must not move while the structure is still settling — so it is added after the
fold and the slip have finished arguing, and nothing scores it.

## Why contacts do so much of the work

A contact is a surface of constant stratigraphic depth. So the **spread of
that depth along a line you walked is the error, in metres** — with no
fitting, and with no assumption about which units it separates.

**How hard each observation pulls is set by how well it is known**, and by
nothing else. Every residual is divided by the uncertainty of what it
measures and squared, so there is no exchange rate between degrees and
metres: a reading two sigma off costs the same whichever unit the sigma was
in. A bedding reading is taken as good to 4°, the ground to the DEM's 10 m,
and a drawn line to a distance across the map that follows the confidence you
gave it — 8 m for *certain*, 20 for *approximate*, 50 for *inferred*, 100 for
*concealed*. What a position error is worth in stratigraphic depth depends on
the dip, so it is carried through the local slope of the model: a hundred
metres sideways on flat beds costs nothing, and on beds at sixty degrees it is
most of a unit. A concealed contact therefore pulls less on where a surface
sits than the stretch of it you walked, and on flat ground barely at all.

A line digitised every ten metres is not fifty independent measurements of
where the contact is, and letting every vertex vote would let one long contact
outweigh every station on the map. Each point counts for its spacing over
about fifty metres, so a line is worth roughly its length in fifties. Points
sampled inside a shaded unit are treated the same way by area.

Two things follow.

**Contacts can be used before the column is known**, and once a fault is in
the history the same number scores its slip, because undoing a fault correctly
brings the two halves of a displaced contact back to the same depth.

**The column falls out of the contacts for free.** Two contacts at a known
structure differ by the thickness of what lies between them, so thicknesses
are read off the map rather than measured with a tape. Those numbers go back
to the Strata section (see [Out of the block](#out-of-the-block)).

### The top and bottom units are lower bounds

Nothing in the box says how thick the youngest and oldest units are, so
neither is a measurement.

The oldest unit is grown until it reaches the oldest rock the ground actually
exposes. Left as a placeholder the width of its neighbours, a fold core that
exhumes deeper than the guess runs the column out and the block answers
*basement* — a nose of crystalline rock in the middle of an anticline that no
reading, no contact and no shaded unit ever suggested. That is the placeholder
showing through, and basement is far too strong a claim to make by accident.

The youngest unit needs no such help, since the block already extends it
upward above the top of the column.

## Why naming the units on a contact matters

A fault cuts a contact into two traces with a gap between them. Unless
something says those two traces are the *same* contact, each is internally
consistent whatever the fault did, the offset is unconstrained, and the fit
will report a confident wrong number.

What says so is already in your notebook: **the upper unit and the lower
unit**. A contact with sandstone above and shale below is that contact
wherever it crops out, on either side of any fault. Naming the two is not
paperwork; it is the measurement that makes the throw solvable. The app says
so when it has to refuse.

**They are recorded as upper and lower**, not as one side and the other,
because a pair with no order in it cannot be used for anything. The order is
what gives a thickness between two contacts, what recognises the same contact
again across a fault, and what tells "A over B" from "B over A" on an
overturned limb. Upper means higher in the column — the younger of the two
where the beds are the right way up — whatever the ground happens to do.

**The same two names on the fault itself measure the throw a second way**, and
that is the way a thrust usually needs. A fault carrying older rock over
younger repeats section, and repeated section is only visible to the contact
term if you happened to map the same contact twice, once in each block. Not
everybody does. Almost everybody writes down what the rock is on each side of
a fault, and unit 5 against the Campito across the plane is a statement about
stratigraphic separation, in the column's own metres, with a sign on it.
Younger-on-older and older-on-younger are the difference between a normal
fault and a thrust.

**A contact drawn up to a fault and a stride past it is not that contact found
again on the far side**, and it is not allowed to act like one. Two stray
points across the line would otherwise forbid the fault from having moved at
all: any slip drags them tens of metres from the fifteen points they were
drawn with, and the spread that costs is larger than anything the offset can
win back. The fault would come back with a confident offset of about a metre,
on the authority of the end of somebody's pencil line. A side has to be
genuinely mapped — several points and a real share of the surface — before it
counts as the other half of a cut contact, and where the test fails the fit
says which of the two things happened.

The names also let the column be checked. The unit beneath one contact is the
unit above the next one down, so the two names have to agree. When they do
not, the mapping does not join up and the app says which pair disagrees.

## Shaded units are evidence

A contact constrains the model along a **line**. A shaded unit constrains it
over an **area**: every point inside the patch has to have a stratigraphic
depth between the two contacts that bound that unit. That is far more
information than the boundary alone, and it is what pins where the column
sits, which a handful of contact depths leaves loose.

The three terms — readings, contacts, shaded units — are independent, and that
is the point of having them. On a real notebook, halving the fitted fold's
amplitude *improves* how tightly the contacts hold to one surface and makes
the shaded units markedly worse. The contacts alone would have preferred the
wrong answer.

Patches are flooded again in block metres rather than carried over from the
map, because a region is only as good as the lines that bounded it and the fit
works in the block's frame. A fill with no boundary around it constrains
nothing and is left out rather than allowed to dominate.

## Checking the result

Three checks, all on the **Field** tab. Each answers a different question.

### Units you logged

*Does the block agree with what you wrote down at each outcrop?*

The column is built from the contacts and nothing else. The unit you named
while standing on an outcrop is never consulted, which makes it a genuinely
independent check. **Field → Units you logged** runs it: at every station
carrying a unit name, which unit does the block think crops out there?

It is a check, never a correction. A disagreement can mean the column is hung
at the wrong level or that a station was logged in the wrong unit, and only
the person who walked it can say which. The shape of the disagreement points
you at one or the other: the same offset running through every station is a
column hung wrong; one station disagreeing on its own is that station.

Where the ground sits in the column is a real parameter and it is fitted, not
assumed. Stratigraphic depth is measured down from the top of the column, so a
contact can come out *above* that zero, at a negative depth, and there is no
way to express that by adjusting the top unit's thickness because a thickness
cannot be negative. The ground moves instead: lowering the sampled heightfield
raises every stratigraphic depth by the same amount, and adding it back to the
datum leaves every reported elevation untouched.

### Compare with the map you walked

*Does the block predict the map you drew?*

**Field → Compare with the map you walked** opens the **Ground map** beside
the block: hillshade, contours, and the contacts and faults you mapped in the
map's own colours, with the contacts *this block says should crop out* drawn
over them in blue.

The blue lines are not drawn by hand. The history gives a continuous
stratigraphic depth at every point; sample it on the real ground, contour the
result, and where a contact crops out falls out of the arithmetic. Nobody
codes the rule of Vs — the contour of a dipping surface against a real valley
*is* a V.

Where the model agrees, the walked line sits inside its halo. Where it does
not, there are visibly two lines, and the gap between them is the error on the
ground, where you can go back and look.

One caveat: each contact's depth is taken as the **mean** along the line you
walked, so the prediction cannot drift off wholesale. What is being tested is
the **shape and trend** of the trace, not its absolute position.

### How well this block fits your mapping

*What did the fit actually do, and what did it have to leave out?*

**Field → How well this block fits your mapping** carries the whole reading:
what the stereonet decided, what was fitted to the map, the column, which
stations were not used and why, and every warning below.

The two numbers at the top — how far the readings are off, and how tightly the
contacts hold to a single surface — are **recomputed from the history you have
now**, not stored from when the block was cut. Change a fold on the History
tab and they answer for the block in front of you. That is the fastest way to
find out whether a correction is an improvement.

The ground map and the stereonet share one slot, so opening either closes the
other. Three panes is not a layout a phone has room for.

## When it says it cannot answer

Refusing is most of what this feature is for. Each case below names what
was missing and what would close the gap.

**Not enough readings.** Fewer than three bedding readings fits nothing, and
three on one limb still only give one attitude.

**A fault trace that does not turn constrains no dip at all.** There are two
ways to get one: ground with too little relief, and — less obviously — a trace
that runs straight even across plenty of relief, which is what a fault
crossing a uniform hillside draws. Either way the points lie along a *line*,
and every plane through a line contains it equally well, whatever its dip. The
fault is called vertical and flagged as an assumption rather than given a
fabricated dip that looks measured, and the warning names which of the two
cases it was and the two ways to close the gap.

> The test is whether the trace **spreads sideways** by a real fraction of its
> own length — the V a trace makes where it crosses a valley. Asking only
> whether the points are flat, which is the obvious test, does not work:
> collinear points are perfectly flat in *every* plane through their line, and
> three points are perfectly flat by construction. Getting that wrong is what
> once made a vertical fault trending 152 come back striking 358.

**A dip you supply makes the strike solvable again.** Once the dip is fixed
the strike is no longer free — it is whichever strike puts a plane of that dip
through the trace — so it is solved for rather than borrowed from an
unconstrained fit that assumed some other dip. At 90° that reduces to the
trace's own bearing across the map, which is what a vertical fault's strike
is. At lower dips it correctly comes out a few degrees off the trace bearing,
because a dipping plane's trace does not run along its strike.

**A fault nothing measures the throw of** gets zero slip, and is reported as
drawn rather than solved. The wording tells "you never found this contact
again" apart from "you stopped drawing it at the fault", since those are
different things to go and fix. It **keeps the sense you observed and any rake
your slickenlines give**, because those are observations and only the distance
is missing. A thrust whose throw nobody measured is a thrust with an unknown
offset, and it must never come back reported as a normal fault.

**A slip the data barely prefers** is reported as undetermined. After the
search settles, the offset is walked across its whole range and the fit is
asked how much it minds. When the answer is less than the errors on the
observations themselves — a chi-squared that moves by less than about one —
the number is where the search stopped rather than what the evidence says,
and it would print identically to a measured one unless somebody said so.

**Slickenlines that cannot belong to the fault they were taken on** — a rake
that is not the sense you observed, however the rock moved along it — are
flagged rather than averaged in. A rake is measured in a plane, so usually it
is the plane that is wrong.

**Readings either side of a fault that are two structures, not one**, are
called that. No offset makes a single fold explain both, so the fit says to
model one side at a time instead of leaving you to discover it by failing.

**A history more than about eight degrees from the readings** is reported as
not an explanation of them. A block quietly twelve degrees from every reading
it was built from looks exactly as convincing as one that fits.

**A box far bigger than the mapping inside it** makes a block that is mostly
extrapolation, and says so. A big empty block looks more authoritative than a
small full one.

**A wavelength far wider than the area mapped** means only part of one limb is
exposed and the fold is not really constrained.

**Readings with no bedding beneath them** are counted separately, because
ninety degrees per reading is also what a data fault looks like. "Your block
is hopeless" and "these readings never reached it" must not print the same
number with no way to tell them apart.

---

# Conventions

- **X = East, Y = North, Z = Up.** Metres throughout.
- **Strike** follows the right-hand rule: with the strike direction ahead of
  you, the beds dip down to your right. Recorded as an azimuth, 0–360° from
  north.
- **Dip** and **plunge** are measured down from horizontal.
- **Faults** are described the way a student describes them. Pick a type —
  normal, reverse/thrust, dextral or sinistral — then dial **oblique slip**
  from −90° to +90° to mix in the other component. Zero is the pure form of
  the type you chose; the ends are the pure opposite. The editor reports the
  resulting **rake**, measured in the fault plane from the strike direction
  and rotating toward down-dip (`90°` normal, `270°` reverse, `0°` sinistral,
  `180°` dextral), because that is what the literature uses. Rake is derived
  and never stored, so there is one source of truth; older files that saved a
  bare rake are converted on load without changing their geometry.
- **The stratigraphic column** is listed youngest at the top, as you would
  draw it. Below the deepest unit is undifferentiated basement.
- **Above the top of the column, the youngest unit is extended upward.** The
  block has to be made of something everywhere, and repeating the top unit is
  the reading a geologist expects.
- **Younger beds lying flat across an unconformity onlap the buried relief.**
  The deepest of them thickens downward to fill every low in the erosion
  surface and abut the older rock, so that unit is thicker in the paleovalleys
  than on the paleohighs — which is what onlap looks like in the field.
- **An unconformity is a boundary in the column, not an extra unit.** The
  column holds a fixed set of units, so moving the surface down hands one of
  them from the eroded side to the younger side rather than adding a new one.
  That is why the older sequence gets shorter as the cover gets thicker. Drag
  the divider in the Layers tab to move it, or pick the unit it sits beneath.
- **An unconformity's depth is derived, not set.** It buries its erosion
  surface under the units deposited on it, so the surface sits at the base of
  exactly those units. Only the surface's relief is yours to choose, and that
  is the part that does the geological work: truncating the older beds, and
  giving the younger ones a shape to onlap.

---

# The Strata section

The third section, reached by the same switch. The map is a record of an
outcrop that exists and the block is an invention meant to explain it. This is
the **succession**: the one of the three you can write down before leaving the
room, and the one the other two refer to.

It shares the map's project. Every unit here is a unit on the map — name the
Poleta once and it is in both, tappable when you log a station and offerable
when you name the two sides of a contact. There is nothing to import.

## Start a column before you have measured anything

Add units in order, youngest at the top, and give them nothing but names. That
is a real column: it is what you have after reading the field guide and before
walking anywhere.

The section draws it. A unit with no thickness gets a box the size of the
median of the ones you *have* measured, drawn dashed, labelled **thickness?**,
and counted in the panel as outstanding. Nothing here will make you invent a
number to get past a form.

**Drag a unit by its grip** to move it through the column. It is the same
handle, drop line and gesture as the block's layers and its timeline, because
they are the same act on three lists.

Where a unit lands decides more than the order:

- **Pull a member clear of its formation** and it comes out as a formation in
  its own right, which is what a unit that is part of nothing is.
- **Drop one between two members** and it joins them.
- **Nudging the top or bottom member** of a formation leaves it where it is,
  so tidying the order inside a formation never ejects anything by accident.
- **A formation's card is a label for its bracket**, so dragging it takes its
  members with it.

## Rank

Rank is what makes "the Poleta has eight units" drawable. Set a unit's *Part
of* to a formation and it becomes a member: the formation stops drawing a box
of its own and becomes the bracket down the side of its members, with their
total on it. That total is not stored — it is their sum, and storing it twice
means storing it wrong.

Members are pulled next to each other when you assign them, because a bracket
spanning something that is not part of the formation is a bracket claiming
rock it does not have. If you separate them afterwards, the bracket goes
dashed and the Legend tab says so.

**The column is two tiers and no more.** A member cannot hold members. *Add a
member* is only offered on something that can hold them, the *Part of* list
only offers units that can, and the rank dropdown only offers ranks consistent
with what a unit holds and what holds it. A member of a member of a member is
not deeper stratigraphy, it is a data structure, and there is nowhere to draw
it — the bracket column has room for exactly one nesting. A group gets
formations; a formation gets members. An older notebook carrying a deeper
chain is re-hung on the top of it rather than having units dropped.

## Grain size is the x axis

The horizontal axis is grain size, and the ragged right edge that produces is
the reason a section is drawn rather than tabulated. A coarsening-up cycle is
a shape you see across a metre of paper and never see in a list of numbers.

**Grain size → Draw on the section**, then drag inside a unit. Left is fine,
right is coarse. The stroke is quantised to a point every twentieth of the
unit, so a drag leaves a profile rather than a thousand vertices, and the
whole drag is one undo step. The same points are listed in the panel with a
height and a size you can type, for when a drag is not precise enough.

Heights are stored as a **fraction of the unit**, not as metres, so a
thickness corrected later keeps the shape you drew instead of stretching it
off the end. Two points at the same height are a sharp break rather than a
ramp, which is what the base of a channel looks like and what a ramp could
never say.

Drawing is armed rather than always on, because the section is taller than the
screen and dragging it is normally how you scroll.

Two axes, because two kinds of rock are logged two different ways:
**Wentworth** for siliciclastics and **Dunham** for carbonates. One per
section — a drawing with two x axes on it is not a section — and switching
between them keeps the profiles you have drawn.

## Fossils, traces and structures

A column with no symbols on it is a bar chart of thicknesses. The **Marks**
tab holds about fifty conventional marks in three groups: body fossils, trace
fossils, and sedimentary structures. They are drawn rather than borrowed from
a font, because a symbol that merely gestures at a fossil is worse than none —
the reader will believe it.

Pick one, then tap the section at the height you saw it. Symbols are laid out
in lanes in their own gutter, so four things recorded in one shelly bed do not
land on top of each other. A symbol never moves up or down the section to make
room, because its height is the observation.

**The base of each unit** is drawn as the kind of contact you said it is:
conformable, sharp, gradational, erosional, unconformable, faulted or covered.
That line is where a column carries its sequence stratigraphy, and one that
draws every contact the same way has thrown that away.

## Into the block

**Sheet → Send to the block** replaces the block's layers with your column and
leaves its history — every fold and fault you built — exactly as it is. The
point is to deform your own succession rather than the default one.

Units with no thickness go in at the nominal one and the panel says how many.
Over the block's twenty-layer cap the *lowest* units are merged rather than
dropped, since the top of a column is what a map is drawn on.

## Out of the block

When you build a block from a mapped area, the fit reads a thickness for every
unit between two contacts — off the map, the way a student is otherwise asked
to do it by hand off a structure section. Those thicknesses come back here.

What happens to each one depends on what you already had:

| You had | What happens |
|---|---|
| **No thickness** | The block's number is adopted, stamped as coming from a model, and marked with a small green dot. "I do not know" and "the block says 180 m" are not in conflict. Type over it the moment you measure it for real. |
| **A thickness that agrees** | The block's number is filed beside yours and nothing changes. Agreement is to within a tenth, because a block's thickness comes from contacts traced across ten-metre elevation data and that is as close as the two can be expected to get. |
| **A thickness that does not agree** | Both are kept. The unit gets a ring in the drawing, and the panel puts the two numbers side by side with the difference, and offers you *take the block's* or *keep mine*. |

The third case is the one that matters. A disagreement is a **finding**, not an error to
be resolved by overwriting one number with the other. Either the contacts are
drawn in the wrong place, or the structure the block fitted is repeating or
cutting out section, or the thickness you were given is not the thickness
here. Nothing in the app will decide it for you, and nothing will quietly pick
a winner while you are not looking.

**The roof and floor of a cut block are exempt.** Those are open-ended by
construction — the map says nothing about how thick the youngest and oldest
units are — so they are never written back as measurements. It works the other
way instead: if your column has a thickness for them, the block *uses* it, and
labels it **(your column)** rather than **(guessed)**.

Names are matched loosely. "Poleta Fm" and "Poleta Formation" are the same
rock.

## Getting it out

**Save section** on the Sheet tab: pick a format, then press it. Choosing and
doing are separate steps, because four buttons that each fire the moment they
are touched read as four choices but behave as four triggers, with no way to
look at them, decide, and then commit. The sentence under the chips says what
you would get before you get it.

| | |
|---|---|
| **PDF** | The sheet as it is meant to be handed in: section, explanation and scale caption on one page, in vector. It opens the print dialog — choose *Save as PDF* there. The page is as wide as A4 and as tall as the column needs, so nothing is shrunk to fit a shape the section is not. |
| **SVG** | The same drawing as a file to edit in Illustrator or Inkscape, at whatever size a report wants. |
| **PNG** | The same sheet as a bitmap at 3×, for a document that will not take vector. |
| **CSV** | The numbers: one row per unit, with both thicknesses, the grain-size range, the contact style and every symbol placed in it. |

There is no PDF library in here, deliberately. Writing one would mean writing
an SVG-to-PDF converter, and every browser already contains a better one. The
sheet goes into an offscreen frame with a page sized to it and the browser's
own print path does the rest, which is also why the result is real vector with
selectable text rather than a screenshot at some guessed resolution.

The legend is built from what is actually on the sheet and nothing else. A
legend listing forty symbols of which six are used is a catalogue, and it
teaches that a legend is boilerplate rather than a promise.

---

# Under the hood

## How the geology works

The block is never meshed into layers. Every fragment on screen asks one
question — *what rock is at this point?* — and answers it by running the
geologic history **backwards**.

Undo the youngest event, then the next, and so on, until the point lands back
in the flat layer cake it was deposited in. Then it is a matter of which layer
that depth falls in.

Every deformation is exactly invertible, which is what makes this work:

| Event | Forward | Why the inverse is exact |
|---|---|---|
| **Tilt** | rigid rotation about the strike line | rotations invert |
| **Fold** | an upright fold (vertical displacement, a warped and enveloped wave — or a fitted series of harmonics — read across the horizontal `perp` axis), then a rigid tilt about `perp` by the plunge | neither step changes the horizontal coordinates the profile is read from, whatever shape that profile has |
| **Dome / basin** | vertical displacement depending only on map position | map position is unchanged by vertical motion |
| **Fault** | rigid translation of the hanging wall, parallel to the fault plane | slip lies in the plane, so the hanging-wall test gives the same answer before and after |
| **Unconformity** | splits the column: units above the erosion surface skip all older history | a branch, not a transform |
| **Dike / pluton** | paints rock inside a region, at its own point in the history | a test, not a transform — but see *A folded dike* below |

Two consequences worth knowing:

- **Contacts are pin-sharp at any zoom.** Nothing is tessellated, so there are
  no stair-steps at layer boundaries however far you zoom in.
- **Order matters, exactly as it does in the field.** Move a fault later in
  the history and it starts cutting the fold instead of being folded by it.

### The fault trace, in red

A fault is a surface and not a unit, so nothing about the rock either side of
it says where it runs — a block with an offset in it and no line to read the
offset against is a puzzle with its own answer left out. So the walk remembers
how close it passed to each fault plane it reached, and the trace is inked from
that: red, on the cut faces and across the ground, at a constant weight in
pixels however far the block is zoomed.

Inked *over* the rock rather than replacing it, the same relation the contour
lines already have to the ground they are drawn on. The block still says
limestone under the line and the identify tool still answers limestone, which
is right: the fault is a surface through the limestone, not a rock of its own.

Taking the distance inside the walk is what makes the trace stop in the right
places for nothing. `rockSample` has already returned if the point is inside a
younger intrusion or above a younger unconformity, so a fault buried under
cover it never cut is never reached and never inked — the rule `reachEvent`
implements for the cross-section, arrived at here by not doing anything rather
than by checking.

Two guards, and both are load-bearing. A younger fault **tears** this field: it
carried one wall of the older structure away from the other, so the distance
genuinely jumps across it. The screen-space measure reads that jump as an
enormous gradient and would happily ink a line lying along the younger fault,
saying the two are the same surface — which is the marching-squares bridging
problem from the cross-section wearing a different hat. A cap in metres kills
it, because the far side of a tear is nowhere near the plane. The other guard
is for a face seen edge-on, which has no gradient to divide by.

### A folded dike

Vertical displacement is what keeps a fold and a dome exactly invertible, and
for a bedded pile it is the right picture — it is a similar fold, and the beds
come out with the same thickness on the limbs as at the hinge.

It is the wrong picture for a body that *cuts* the pile, because moving rock
straight up and down cannot turn a vertical line. A dike emplaced before a fold
therefore came back out of the walk standing exactly as it went in: a pre-fold
dike and a post-fold dike drew the same straight wall, and the one
cross-cutting relation the picture exists to teach was unreadable.

What a geologist reads off the outcrop is that a body carried through a fold
keeps its angle to bedding. So an intrusion is carried through by the **turn**
the fold gave the beds where it sits, rather than by the shear that made them —
a vertical dike comes out square to the beds it cuts, and winding the History
tab back across the fold stands it up again. `js/geo/warp.js` has the
arithmetic; three things about it are worth knowing:

- **One turn for the whole body, read at its own centre.** Reading the dip
  afresh at every query point is the exact *everywhere square to bedding*
  surface, and it is not usable: the orthogonal trajectories of a similar fold
  converge on its axial plane, so past a certain depth the map stops being
  one-to-one and a single dike comes out as two, or as a sliver. A rigid turn
  is affine, so a dike stays one dike of the right thickness.
- **A concordant sill stays concordant**, however far along the fold it runs —
  the vertical part of the turn has no along-strike term in it at all. What
  changes is that the sill keeps its *true* thickness rather than its vertical
  one, so it reads `1/cos(dip)` thicker in a section across a steep limb.
- **It costs nothing per query.** The turn depends only on where the body is,
  so it is folded into the body's own geometry once, in `compileHistory` — the
  dike's plane normal pulled back through it, the pluton's azimuth, radii and
  turn rolled into one matrix. The shader is handed those same numbers as
  uniforms, so the two walks are not merely equivalent, they are identical
  arithmetic.

The history's *shape* — how many events, of which types, in what order — is
compiled into generated GLSL. Its *numbers* are uniforms. So dragging a dip
slider is a uniform upload, and only adding, deleting, reordering or disabling
an event triggers a recompile.

`js/geo/unmake.js` is a CPU implementation of the same walk. It powers the
identify tool and it is the reference the shader must agree with. **If you
change one, change the other.** `js/geo/warp.js` is the piece both of them
read, so that the one thing they cannot afford to disagree about has a single
implementation rather than two.

## Reading a history back out of a map

`js/geo/infer.js` is the same engine pointed the other way. There is no new
geology in it.

`stratDepth()` already answers "how far below the top of the column is this
point" as a continuous number. Run that over a student's own readings instead
of over the screen and it stops being an answer and becomes a **misfit**, and
a misfit can be minimised.

Two kinds of evidence, and it matters that they are independent. The stations
say which way the beds lean at a point; the contacts say where one single
surface goes across the map. A model can satisfy either alone and still be
wrong: dips alone cannot tell an anticline from the syncline half a wavelength
away, and contacts alone cannot tell a tight fold from a broad one where only
part of a limb is exposed.

The search is a coarse scan to find the right basin, then coordinate descent
with a shrinking step to walk to the bottom of it. Nothing cleverer, because
the objective has long flat valleys and several local minima and this behaves
predictably in both. The one exception is the fold's profile, which for a
fixed hinge is linear in its coefficients and is solved by weighted least
squares rather than searched (see *How the fit runs*). A whole fit is a few
hundred milliseconds on a real notebook.

The misfit is a chi-squared: each residual over the sigma of its observation,
squared and summed, with `total` that sum per independent observation. The
sigmas live in `SIGMA` at the top of `geo/infer.js`, and they are the only
place the relative weight of readings, contacts and shaded units is decided.

**Real ground is a seventh kind of surface.** `demSurface()` in
`geo/surfaces.js` wraps a sampled heightfield and `surfaceHeight()` answers
from the samples. Everything downstream — the cutaway, vertical exaggeration,
the markers, the identify tool, contours, map view — already went through that
one function, so all of it works on a real landscape unchanged.

It is deliberately given no `KIND_CODE`. The GLSL twin exists to colour
*unconformity* surfaces on the GPU, an unconformity surface is always one of
the analytic kinds, and the land surface never reaches the shader because the
block's lid is meshed from it on the CPU instead.

Two things a heightfield breaks if you are not careful, both fixed:

- **Undo.** `snapshot()` deep-copies the document on every edit, and a
  `Float32Array` through `JSON.stringify` comes back as an object with
  thirty-seven thousand numeric keys. A round trip does not merely cost, it
  destroys the terrain. The samples are immutable, so snapshots share the
  surface by reference instead.
- **Contours.** The shader draws lines where `z / interval` is a whole number,
  and on real ground `z` is metres about the block's own datum. Without
  `uContourDatum` the lines fall at 1806, 1831, 1856 rather than the round
  elevations a map prints, and the labels name the wrong thing. An invented
  landform passes a datum of zero and is unaffected.

## How offline actually holds

Three things break an offline map, and the Map section is built around not
doing them.

**The cache gets swept.** `sw.js` deletes every cache that is not the current
version whenever the app updates. That is right for code and catastrophic for
tiles: bumping the version to fix a typo would silently throw away every
student's field area, and they would find out standing in it. So tiles live in
a cache called `field-tiles`, with **no version in the name**, listed in
`KEEP` in `sw.js` and skipped by the sweep. Change that name and you have
deleted everyone's maps.

**"Downloaded" was never true.** A download that half-finished looks finished
if nobody counts. Every area derives the exact list of tiles it needs from its
own bounds, and `verifyArea` counts them against real cache entries. Complete
means counted, not returned.

**It quietly falls back to the network.** On a desk that hides the problem; in
the field it *is* the problem. Reads are cache-first, and when the browser
says offline they do not attempt a fetch at all — a miss comes back as a miss.
The map draws the best ancestor tile it holds rather than a grey square, so a
partly downloaded area degrades into a blurry map instead of a broken one, and
says how many tiles are missing.

Two things that are not in the app's hands. Safari clears script-created
storage for a site with no interaction in seven days of browsing, but **a web
app opened from the home screen keeps its own counter and is not swept that
way**, which is why the install instructions above matter more for the map
than for the block. The app also calls `navigator.storage.persist()` — from the
field-ready check as well as when the map is opened, because the map is behind
the first course stage and a student on day one would otherwise never be asked.

Both are reported as one line, and it takes either. Chrome grants persistence
and says so; Safari does not report a grant, but an installed app is not swept
for disuse whether or not the API will admit it. Reporting "not protected" to
somebody who has already added the app to their home screen would be both wrong
and discouraging, so the line reads from `persisted || isInstalled()`.

## The course gate

`js/unlock.js` releases the app in stages for a field course: the block alone
to start with, so a hypothesis has to be argued from the rock rather than
looked up; then the map and the column; then the block cut from the mapped
area. A password from the instructor opens each one, entered on the **EPS 105**
tab and remembered on that phone.

Two things about it are worth saying plainly.

**It is a latch, not a lock.** The app is a static page served from a public
repository. The passwords are in `js/unlock.js`, that file is readable by
anyone, and a student who wants past a stage can get there. That is the right
target: the gate exists so nobody wanders into stage three by tapping around on
day one, not to defeat somebody who has decided to cheat — who could equally
use any other app on the phone. Nothing here is worth defending harder than
that, which is also why an unlocked stage shows its own password back: it was
read aloud to a group standing outdoors, and the alternative to showing it is a
student walking back across a hillside to ask.

**It is temporary.** The stages belong to one course. A later build for a
general audience deletes `js/unlock.js`, the `course` entry in the block's
`TABS`, `coursePanel`, and the three call sites that read the gate — the mode
switch in `js/ui/app.js`, the `tabs` getter in `js/ui/map/section.js`, and the
panel itself. Nothing else knows about it.

One thing the gate did force. Declination lives on Map → Setup, behind the
first stage, so a student on day one would have been told to set a number they
could not reach — a readiness check reporting a problem with no available
remedy, which is worse than not reporting it. The check now fills it in itself
from the field area's centre, so the card can reach fully green with both
stages still locked. `_ensureDeclination` in `js/ui/map/section.js`.

It does not wait for a downloaded area either. `_declinationPoint` takes one
when the notebook has it and otherwise falls back to the shipped pack index,
which is precached and carries every pack's bounds — so the very first thing a
new phone does can be right. Requiring the 22 MB download first meant a student
pressing **Check again** on a new phone and watching nothing happen, which is
what this originally did.

It overwrites, which a settings field normally must not, and the reason is the
same one: with the control locked away, a wrong number is not something the
student can correct. A phone already carrying 12.7° E for somewhere else is
worse than one carrying nothing, because the check passes it. So the value is
brought in line with the area and the line says what changed — the one case
where a passing row still explains itself.

The gate is deliberately not wired into the record. Nothing a student collects
is tagged with the stage that was open when they collected it, and none of the
geology behaves differently. Locking is a matter of which controls are on
screen, and that is all it is.

## Course packs

A pack is a field area the build ships with: the same tiles, fetched once by
whoever set up the course, stored in this repository and served from the app's
own origin.

The problem it solves is logistics rather than code. Downloading an area the
ordinary way is a couple of thousand requests to a USGS server, from a phone,
on whatever connection is available — and the connection near a good field
area is usually none. The alternative is driving everyone somewhere with
service and having twenty students download at once, which is slow when it
works and a lost morning when it does not.

Two decisions in `js/field/packs.js` are worth knowing about:

**Packed tiles land under the canonical source URLs.** Once installed, nothing
downstream can tell a packed tile from a hand-downloaded one — the same
`verifyArea` counts it, the same **Repair** fixes it, the same reader draws
it. A second lookup path for packed tiles would have meant a second set of
bugs in the one part of the app that has to work on a ridge.

**Tiles are concatenated into a few large chunks, not left as files.** Two
thousand small requests is slow even on good wifi and hostile to a bad one.
The chunk is also the resume unit: an install that was interrupted, or an area
half-lost to eviction, re-fetches only the chunks that are actually short. An
area missing three quarters of its tiles costs three quarters of a download,
not a whole one.

An installed pack becomes an ordinary entry in `doc.areas`, tagged with
`packId` so re-installing repairs the area that is there instead of stacking
up a second one.

The pack payloads are the one same-origin thing `sw.js` deliberately does
**not** cache. They are tens of megabytes and are being fetched precisely in
order to be unpacked into the tile cache; storing them again under the shell
would double the cost and then throw the copy away on the next version bump.
`packs/index.json` is small, changes only when a pack is added, and has to be
readable with no signal — so that one stays precached.

## Layout

```
index.html            shell
app.webmanifest       install metadata
sw.js                 offline cache  (bump CACHE when you change files)
dev-server.py         no-cache static server for development
packs/                course packs — index.json, plus one directory per pack
tools/build-pack.py   builds a course pack from the live tile sources
css/app.css
vendor/three.module.js
js/
  main.js             bootstrap, service worker, update prompt
  store.js            document state, undo/redo, autosave, import/export
  unlock.js           the course gate — temporary, see "The course gate"
  geo/
    math.js           strike/dip/rake vectors and frames
    model.js          rock types, event definitions, defaults, presets
    surfaces.js       topography and erosion-surface generator
    unmake.js         the inverse history, on the CPU
    section.js        vertical and horizontal slices through the block
    stereonet.js      lower-hemisphere projection and the girdle fit
    glsl.js           the inverse history, generated as GLSL
    marching.js       marching squares, on any grid of numbers
    infer.js          reading a history back out of a map
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
    packs.js          course packs: a shipped field area, unpacked into the cache
    ready.js          the field-ready check — can this phone leave signal now
    dem.js            elevation decode, hillshade, contour tracing
    sensors.js        GPS watch and the compass clinometer
    declination.js    magnetic to true north
    ground.js         the frame the two halves share, and the sampled ground
    cutblock.js       a field area and a box -> a block document
  strat/              the stratigraphic column's model — no DOM
    model.js          rank, grain-size scales, layout, thicknesses and their argument
  ui/
    app.js            shell, section switch, tabs, identify tool, time machine, files
    panels.js         layers / history / terrain / field / view / EPS 105 panels
    stereonet.js      the net, and the readout of what it found
    groundMap.js      the map beside the block: walked vs predicted
    crossSection.js   the section beside the block: A–A′ and the plot
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
      blockPanel.js   the Block tab: cut a block out of the mapped area
    strat/
      section.js      the Strata section: the sheet, and what a tap on it means
      column.js       the section as SVG, for the screen and for a saved file
      panels.js       column / marks / legend / sheet panels
      symbols.js      fossils, trace fossils and sedimentary structures
```

Caps: 20 layers, 16 events. Both exist to keep the generated shader inside the
fragment uniform budget of older mobile GPUs.

---

# Notes and limits

## The block

**Faults are planar and slip is uniform.** Listric and bend faults, and blind
thrusts whose slip tapers to a tip line, break the exactly-invertible property
the whole model rests on, so they need a different, iterative approach. The
fault code is written around a signed distance to the fault surface, so a
curved surface can be slotted in later.

**A fold has a shape and a reach, not just a size.** The profile is a cosine
warped by two numbers and multiplied by an envelope, all of them functions of
one coordinate: how far across the axis a point lies. That is the property the
model rests on. Moving in z does not change that coordinate, so the inverse of
a fold stays exact and closed-form whatever the profile does, and `beddingAt`
finite-differences the result so nothing needs an analytic derivative either.

- **Vergence** moves the troughs off centre, so one limb is short and steep
  and the other long and gentle. Zero is a symmetric fold. It is the odd term
  `vergence * (1 - cos t)`; the crests keep their full height, only the
  spacing between them changes.
- **Hinge shape** moves the steepest part of each limb. Negative opens the
  crests and troughs into a genuine box fold, flat on top with steep sides;
  positive tightens both hinges at the cost of flattening the middle of each
  limb. It is the even term `hinge * sin(2t) / 2`, so it treats both hinges
  alike and is never vergence. A true **chevron** — straight limbs, angular
  hinge — is not in this family, because the derivative of a triangle wave is
  a square wave and a square wave is not a couple of harmonics.
- **Reach**, along the axis and across it, fades the fold to nothing beyond it
  with the same bounded cosine taper a dome or basin uses. Left at zero the
  fold runs at full amplitude to every edge of the block. Setting it is what
  lets one block hold an open limb in one corner and a tight train in another:
  two fold events with their own shapes, rather than one sinusoid asked to
  serve both.
- **The fit leaves vergence and hinge shape at zero always.** It will fit
  **reach along the axis**, but only when asked (*Build a block → Advanced →
  let a fold stop where the mapping stops*) and only from a seed, never from
  nothing. The seed is how far the stations and contacts actually reach along
  the axis; a free reach has a degenerate direction, since shrinking it
  switches the fold off and "explains" any scatter at all. Across the axis is
  never seeded — that is where the wave lives, and fading it there deletes the
  structure rather than stopping the block over-claiming. A fitted reach wider
  than the block is recorded as no limit, so the document reads as the ordinary
  fold it has become.
- **`|vergence| + |hinge|` is held under 0.9** so the warp stays monotonic.
  Past one it runs backwards over part of the cycle and grows parasitic
  crests. The inverse survives that; the geology does not.

**Folds are similar folds (Class 2):** layer thickness is preserved parallel
to the axial surface, not perpendicular to bedding. **The profile does not
vary with depth at all** — the fold 800 m down is identical to the one at the
surface, and persists forever. Real folds usually die out downward. This is
the one extension here that is not free: the moment the displacement depends
on z the inverse goes implicit, and the exact cheap inverse is what the whole
engine rests on.

**A plunging fold is an upright fold plus a rigid tilt** about the horizontal
axis perpendicular to its trend, so the whole fold train tilts, which is what
puts the nose in the map view. Merely leaning the displacement direction over
does not plunge anything: it shears the fold and leaves the hinge of a flat
bed horizontal.

**The envelope is read off the unrotated offset** from the fold's centre, and
both basis vectors are horizontal, so neither can see a point's height. Taking
them after the plunge tilt instead gives an identical wave — the tilt is about
the across-axis vector, which it leaves alone — but it tips the along-axis
vector out of horizontal, and the envelope of a plunging fold would then fade
with depth rather than along strike. It would also stop being an exact
inverse, silently.

**A fold can be made asymmetric without any of that**, by putting a tilt after
it. An upright fold with 31° limbs plus a 15° tilt about its own axis reads
16° on one limb and 46° on the other, and past 31° the shallow limb overturns.
That changes limb dips but not limb widths, and it tilts the axial surfaces
with it. Vergence is the other kind of asymmetry — unequal limb *widths*,
upright axial surface — and the two compose.

**Intrusions** cut everything older than themselves and are deformed by
everything younger, which is correct, but they have no chilled margins or
contact aureoles.

**Erosion** is applied at unconformities and at the land surface. There is no
separate erosion event.

**Roughness** is remembered per surface but is not applied to the **Flat**
landform, so switching back to Flat always gives a level plain.

**Strike-and-dip markers are not capped**, but each one is a full
inverse-history query per rebuild, and every marker is rebuilt whenever the
document changes. A few dozen is nothing; a few thousand would not be.

### The stereonet

- The girdle is fitted by the **orientation tensor**: build the mean of the
  poles' outer products and take its eigenvectors. The smallest eigenvalue
  belongs to the girdle's own pole, which is the fold axis. Outer products are
  sign-blind, which is what makes this the right tool for poles — a pole and
  its opposite are the same measurement.
- **The verdict is not read off the eigenvalues** but off two numbers in
  degrees: how far the poles sit off the fitted circle, and how much of that
  circle they cover. Woodcock's K and C are shown for anyone who wants them,
  but "your readings span 14 degrees of the girdle" is something a student can
  act on and "K = 0.7" is not.
- **A dome is not a gentle fold**, and the fit has to know it. Poles over a
  dome lie on a small circle, and a cone is fitted very nearly as well by one
  great circle as by any other, so the two smallest eigenvalues come out equal
  and the "axis" is whichever way the rounding error fell. The net only
  reports a fold axis when the smallest eigenvalue stands clearly below the
  middle one; otherwise it fits a cone and says so.
- **The pane splits the stage by the shape of the screen, not its size.**
  Anything wider than it is tall puts the net beside the block; a phone in
  portrait stacks them. Either way, panels that quote numbers refresh on the
  cheap text-only path while a slider is moving, so a stale reading never sits
  next to a live one.
- **Stacked, the divider is draggable** and can be pulled all the way to
  either end: all block while placing readings, all net while reading one off
  it, anywhere between while dragging a fold and watching both. Tapping the
  grip cycles the same three, because a pill you can drag is a pill people
  will tap. The block pane is clipped, so pulling the net over the whole stage
  takes the compass and the undo buttons with it instead of leaving them
  floating on the net.
- **Check the whole map** samples bedding on a grid and runs the identical
  fit. It deliberately does not read the fold event's own trend and plunge:
  later tilts would make that answer wrong, and the point is to compare like
  with like — a dense set of readings against a sparse one.

### The time machine

- **One function, `atTime`, and everything else is unchanged.** It hands back
  a smaller document — fewer events, a shorter column — and `compileHistory`
  and the shader answer it exactly as they always did. Winding time back is
  therefore not a mode anything has to know about, and nothing can be left out
  of it by forgetting to check a flag.
- **At the present it returns the object it was given**, so the ordinary path
  costs one filter and changes nothing.
- **Truncating the layer array is the same thing as starting the walk lower in
  the column.** `layerAt` measures depth from the top of the sub-column it is
  given, so `layers.slice(n)` reproduces exactly the geometry `lo = n` would
  have. That is what lets the whole of it be a document transformation rather
  than a new parameter threaded through the CPU walk and the generated GLSL
  twin separately.
- **The unit counts on the surviving unconformities are shifted with the
  column.** They come from `unconformityDatums`' clamped walk, which only ever
  grows with age, so an unconformity that has already happened always claims at
  least as many units as the oldest one still to come — the shift cannot go
  negative.
- **It is not undoable.** See `Store.view`. The test is not "is it in
  settings", it is whether taking the change back is something a student could
  want.

### The cross section and the slicer

- **Neither one models anything.** Both walk the same `rockAt` the identify
  tool walks — the section over a vertical grid, the slicer by lowering the
  block's lid — so neither can drift out of agreement with the block it was
  cut from. If the section and the block face ever disagreed, the bug would be
  in the history, not in the drawing.
- **A structure is not where it was made.** A fault plane is planar in the
  frame it cut and an erosion surface is a heightfield in the frame it eroded,
  and every event *younger* than either has moved it since. Fold a faulted
  block and the fault folds with it. Drawing a fault as the plane it started as
  puts a straight red line through rock that is offset along a curve, and says
  the deformation politely stopped at the fault.
- **They are found with the same inverse the rest of the model is built on.**
  There is no forward map here, and there is not meant to be — the point of
  unmaking is that each event only ever has to be undone. But an inverse is
  all this needs: a structure is the set of points that land *on* it once the
  younger events are undone, so sampling `undoAfter` over the section and
  contouring at zero gives the trace, in exactly the frame `rockAt` asked its
  own question in. Measured against the field it contours, the drawn lines are
  within 0.03 m — a fault carried through a plunging fold and a tilt, and a
  dike carried through a fold and a fault.
- **A younger fault tears the field, and the tear must not be contoured.** The
  fault carries one wall of an older structure away from the other, so the
  field really is discontinuous across it — which is the whole content of "the
  fault cuts the unconformity". Marching squares cannot know that: it sees the
  two halves at very different values, finds a sign change between them, and
  bridges the gap with a green dashed line lying exactly along the fault,
  saying the fault is an unconformity. So a cell whose corners are not all in
  the same fault block is not contoured, and the trace comes out as the two
  pieces the fault actually left it in.
- **A trace also has to stop at rock younger than itself.** `rockAt`'s walk
  returns the moment it lands above a younger unconformity or inside a younger
  intrusion, and never reaches the events below — rock deposited on an
  unconformity postdates every fault beneath it, so no fault beneath it cuts
  it. Contouring the field regardless drew the fault straight on up through
  that cover, which says the fault is the younger of the two: the
  cross-cutting relation answered backwards, by the one drawing a student
  would read it off. `reachEvent` is the same walk, minus the layer lookup,
  and it stops in the same places; cells it does not reach are not contoured.
  Where a fault trace ends IS the relative age, so ending it in the right
  place is the drawing's whole job.
- **Traces stop at the land surface.** Nothing is a fault where there is no
  rock, so a trace is cut back at the skyline rather than carrying on into the
  air above it.
- **The section's roof comes from the ground along that line**, not from the
  highest point in the block. A section down a valley should not spend half
  its height on the sky over a summit two kilometres away.
- **Dragging an endpoint redraws coarsely, then properly on release.** A
  full-resolution walk of the history per pixel is not something to do sixty
  times a second; the coarse pass is about a tenth of the work and the finger
  never waits for the fine one.
- **The exaggeration is stated, always.** Filling the pane is the default
  because a phone-sized pane at true scale is a hairline, and a section that
  fills its box without saying by how much is a section that overstates every
  dip in it.
- **A pinned exaggeration spends depth, not width.** The alternative — letting
  the drawing shrink sideways until the full depth fits — turns ×5 into a
  hundred-pixel sliver of a line the student drew across two kilometres of
  map. Keeping the width and stopping the section where the scale runs out
  leaves a drawing that is still worth reading, and the dashed bottom edge and
  the elevation under it are what stop that from being a quiet omission.
- **Slicing lowers the lid; it does not clip the render.** `min(terrain, cut)`
  keeps the solid closed, which is why the new face lights correctly, gets
  coloured by the ordinary shader walk, and can be tapped. A clipping plane
  would have left the block hollow and the cut face would have had to be
  faked.
- **The slider's stops are pre-deformation datums**, and the readout says
  *level with* rather than *at* for that reason. See "What the stops actually
  are".

### Markers and contours

- **A marker hangs at the lowest height that keeps every part of it** — bar,
  tick and dip number — clear of the ground beneath *that part*. Clearing only
  the highest nearby ground and adding a fudge for the tilt is what buries the
  down-dip end of a steep symbol in a hillside; asking the question per point
  and taking the worst case does not. On a steep bed the symbol necessarily
  stands off the ground and touches along its lowest edge, which is what a card
  leaning on a slope does.
- **A marker reads the bedding a half metre below the ground**, which is the
  outcrop. Inside an intrusion there is no bedding to read, and the marker says
  so instead of guessing.
- **Under vertical exaggeration** a marker tilts with the beds as they are
  *drawn*, so it stays lying on them, but the number it reports is the true
  dip. The scale chip says when exaggeration is on.
- **Contours are shaded per fragment from elevation**, not traced as
  polylines, so they cost nothing to redraw and stay sharp at any zoom. The
  index contours *are* traced on the CPU, but only to decide where their
  elevation labels go; each label then tells the shader to break the line
  around it, the way a map puts the number in a gap rather than on top of the
  contour. They fade out before they can alias into a solid wash, and switch to
  a light line on dark rock so they stay visible over coal and basement.

## The Map section

**US only.** Every layer is US federal public domain, because that is the only
imagery that can legally be bulk-cached for offline use. Outside the United
States the map is blank; the compass, the GPS and the notebook still work, and
a reading taken on a blank map is still a reading.

**Imagery and topo stop at zoom 16**, about 1.8 m per pixel at 40°N. USGS
advertises tiles to zoom 23 in its metadata and serves none past 16 — this was
found by asking the servers, not by reading the documentation. Past that the
raster is stretched and only the derived contours stay sharp.

**Elevation is about 10 m** (3DEP via the AWS terrain tiles), so a station's
height is good to a metre or so at best and contour lines are smooth rather
than faithful in detail. It is still much better than GPS altitude.

**A phone is not a Brunton.** Expect a few degrees on a good reading, more
near a vehicle, a fence or magnetite-bearing rock. The clinometer reports the
scatter within its own sample window, which catches an unsteady hand but
cannot catch a steady one being deflected by a steel gate. Typing a reading in
is a first-class input, not a fallback.

**Declination is the app's one un-checkable number.** Get it wrong and every
strike is rotated by the same amount without ever looking wrong. It is stored
with each reading, so a wrong setting can be corrected afterwards in a
spreadsheet without retaking anything.

**Every phone browser reports a magnetic bearing, iOS included.** Safari
exposes `webkitCompassHeading`, which reads as though it must already be true
north. It is not: WebKit fills it from CoreLocation's `magneticHeading` and
never from `trueHeading`, because `trueHeading` is only valid while location
updates are running and a web page cannot guarantee that. So the declination
correction is applied here, on every platform, and the setting is the only
thing that makes a strike true. Trusting the property name instead puts every
reading out by the local declination while the app looks like it is working.

**Some browsers give tilt with no compass reference at all.** There the dip is
real and the strike is withheld rather than invented.

**A compass heading is not an Euler angle.** There are two defensible ways to
give a tilted phone a bearing: drop its long axis straight down onto the
horizontal plane, which is what the Euler `alpha` encodes, or stand the phone
level first and then read the azimuth, which is what a compass does and what
CoreLocation returns. They agree only when the tilt is square to the phone —
dipping away from you, or off to the side — and diverge at anything oblique,
by 4° on a 30° dip and 20° on a 60° one. Substituting the heading into `alpha`
therefore made the strike swing as the phone was turned on the rock. The frame
is now rebuilt by levelling instead, which makes the answer depend on the
surface and not on how the phone was laid on it.

**Lines are measured with the phone's long edge**, which is a coarser gesture
than laying its whole back on a surface: there is less of the phone touching
less of the rock. Expect a linear reading to be the less trustworthy of the
two, and check the scatter.

## Building a block

**One structure at a time.** The fit puts a single tilt, fold or dome in the
history, plus a fault for each fault you drew. Two folds overprinting, or a
fold refolded, comes out as a poor fit and says so rather than being
decomposed.

**A fitted fold profile is a Fourier series in the fold's phase**, eight
harmonics of a fundamental twice the block wide, so it resolves nothing finer
than a quarter of the block and repeats beyond the edge where nothing was
mapped. The event keeps the ordinary controls: wavelength is the fundamental
the series is built on, amplitude its peak inside the block, and vergence and
hinge shape still warp it. The History tab names it *fitted profile* and
offers to replace it with a plain cosine.

**The predicted contacts are anchored to your own lines.** Each contact's
depth is the mean along the trace you walked, so the prediction cannot drift
off wholesale — it tests the shape and trend of the trace rather than its
absolute position. Hanging the levels off the column instead would be a harder
test, and is the obvious next thing.

**Faults are planar, their slip is uniform, and the plane is infinite.** A
fault that dies out along strike is not represented.

**A fault trace clipped by the box is a different trace.** Only the part
inside the box is evidence, so a box edge that cuts an end off a trace can take
away the bend that was determining the plane. The fit says so rather than
reporting a dip it no longer has grounds for, but it is worth knowing that
moving the box can legitimately change what a fault is reported as.

**Three points on a trace determine a plane exactly**, which means they leave
no residual to check it against. The sideways-spread test still applies, so a
degenerate three-point trace is rejected; a non-degenerate one is accepted on
the same terms as the classic three-point problem, and inherits its sensitivity
to one badly placed point.

**Only bedding is fitted.** Joints, foliation and lineations are carried into
the block as record but say nothing about the shape of the beds.

**The ground is the DEM's**, so about 10 m, and every thickness read off the
map inherits that.

**The heightfield travels inside the document**, packed as int16 decimetres —
about 75 kB before base64 for a 193 × 193 lid. A block cut from a field area is
therefore a much bigger file than an invented one, and that is what lets it
open on a phone that has never downloaded the area.

**The block's footprint is fixed** once it is cut. Width and depth are the
ground the samples were taken over and the readings are pinned to it. Only how
deep the block is cut stays adjustable.

**Field readings reach the stereonet only by way of Build a block.** The fit
runs on the Map section's bedding, but the net itself is still a block
instrument. Plotting a project's readings without cutting a block is the
obvious next step, and `geo/stereonet.js` already takes any bag of readings.

**A station's elevation is filled in from the terrain** a moment after it is
recorded, and stays null if that area's elevation tiles were never downloaded.
Null rather than zero: a station recorded at sea level because the terrain was
missing is worse than one with no height at all.

**Deleting an area keeps any tile another area also needs**, because
overlapping field areas are normal and deleting one should not punch a hole in
another.

## The Strata section

**One level of nesting**, enforced rather than merely advised: a member cannot
hold members, and the editor does not offer to give it any. A group containing
formations containing members would need the bracket column to nest, and
nothing so far has wanted it.

**The PDF goes through the print dialog**, so it inherits whatever that dialog
can do. A browser that ignores an explicit `@page` size prints the sheet scaled
onto its own default paper instead. It still fits, it is just smaller.

**The column is drawn to one scale throughout.** There are no scale breaks, so
an eight-member formation of metre beds sitting under a 400 m quartzite comes
out as eight slivers — honestly, but not usefully. Set a fixed vertical scale
and scroll, which is what a paper log does about the same problem.

**A thickness is a single number, not a range.** "40 to 60 m, thickening
north" has to go in the description.

**The grain-size profile is stored as a step index**, so switching between the
Wentworth and Dunham axes keeps the shape and reinterprets it. That is fine
when a section is logged on one axis, which is the normal case; a mixed
carbonate-siliciclastic succession has to pick one.

**Marks carry no size or abundance.** A symbol says the thing is there at that
height, not how much of it. No bioturbation index, no abundance qualifier.

**Nothing here reaches the map's geometry.** The column orders the unit pickers
and offers the pairs a contact can have, and that is the whole of its
influence. It cannot move a line, and drawing a contact between two units the
column says do not touch is allowed, because the column may be the thing that
is wrong.

**Thicknesses come back from a block only for units between two mapped
contacts.** A unit you never bracketed with contacts is invisible to the fit,
however many stations stand in it.

---

# Working on the code

Only needed if you want to change the app. There is no build step and no
`node_modules` — plain ES modules plus a locally vendored copy of three.js.

```
python3 dev-server.py 8777
```

Then open <http://127.0.0.1:8777/>. Any static file server works; the included
one just disables caching so edits show up on reload.

### ⚠️ The service worker will serve you yesterday's code

It is cache-first by design, and that design does not care that you are the
one editing the files. The dev server's no-cache headers do not help, because
the request never reaches it. Symptoms are edits that appear to do nothing, or
a fix that works in one file and not the next.

Before an editing session, run this in the console:

```js
for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
for (const k of await caches.keys()) if (k !== 'field-tiles') await caches.delete(k);
location.reload();
```

Keep `field-tiles` unless you want to download your test area again. It is the
one cache that is expensive to rebuild, and it is deliberately not versioned.
The worker re-registers on the next load, so this is a per-session ritual, not
a one-off.

## Building a course pack

Run once, from anywhere with a decent connection, and commit what it writes:

```sh
tools/build-pack.py --id poleta --name "Poleta folds" \
    --detail "The mapping area for the whole course." \
    --center 37.36,-118.06 --size 8 \
    --sources topo,aerial,dem --min-zoom 10
```

`--bbox=W,S,E,N` takes explicit bounds instead of `--center`/`--size` — write
it with the equals sign, because a western longitude starts with a minus and
argparse reads a bare one as a flag.
`--chunk-mb` tunes the resume granularity; smaller chunks recover better on a
bad connection and cost more requests.

It writes `packs/<id>/pack.json` and `packs/<id>/tiles-NNN.bin`, and adds the
pack to `packs/index.json`. Re-running the same `--id` replaces that entry.
Tiles the source does not publish are recorded as holes rather than retried
forever, exactly as a live download records them.

The source table in the builder **must** agree with `SOURCES` in
`js/field/tiles.js` — the app rebuilds those URLs itself when it verifies an
installed area, so a mismatch shows up as a pack that installs and then
reports every tile missing. Note that the USGS services are addressed `z/y/x`
and the terrain tiles `z/x/y`.

A realistic area is smaller than it sounds. At Poleta's latitude, with topo,
aerial and elevation from zoom 10:

| Area | Tiles | Size |
|---|---|---|
| 6 × 6 km | 894 | 32 MB |
| 10 × 10 km | 2,118 | 75 MB |
| 15 × 15 km | 4,544 | 159 MB |

## Testing without a browser

There is no Node here, so the checks run under JavaScriptCore via `osascript`.
The orientation maths in particular is worth testing that way rather than by
holding a phone. The compass bug that put every strike out by the local
declination, and the one that made the strike swing as the phone was turned on
the rock, were both found and fixed against a numerical model of what the
sensors report, before either was seen on a device.

## Deploying

GitHub Pages serves `main` from the repository root, so **pushing to `main`
deploys**. It goes live a minute or two later.

**⚠️ Bump `CACHE` in `sw.js` whenever you change any precached file.** The
service worker is cache-first, so a browser that already has the app keeps
serving the old copy until that name changes. There is no error — it silently
stays old.

**⚠️ Never rename `TILE_CACHE`, and never drop it from `KEEP`.** That is the
cache holding every downloaded map area. It deliberately carries no version,
so that bumping `CACHE` cannot take students' field maps with it. Renaming it
deletes them, offline, with no warning and no way back.

Two things that will fool you when checking a deploy:

- GitHub Pages sends `max-age=600`, so for about 10 minutes your browser may
  hand you the old files even though the deploy is live. Reload a second time.
- The first load after an update runs the *old* cached copy by design and
  shows the "newer version is ready" banner. That is correct behaviour, not a
  failure.

Any static host works, as long as it serves over **HTTPS**. That is what the
service worker requires, and the service worker is what makes the app work
offline.

## Wrapping it as a store app

The code is a plain static site with no build step, so it drops into
[Capacitor](https://capacitorjs.com) unchanged when you want App Store and
Play Store binaries: `npx cap add ios`, then point `webDir` at this folder.
That route needs Node and Xcode; the PWA route above does not.

---

# License and attribution

Copyright © 2026 **Stephen Dobbs**.

Licensed under the [GNU Affero General Public License v3.0](LICENSE).

In short: you are free to use it, study it, share it and build on it. If you
modify it and make it available to anyone — **including by hosting it on a
website** — you have to publish your modified source under the same license
and keep the attribution. That network clause is the point: it is what stops a
modified copy being rebranded and run as someone else's product.

Using the app as-is with your students needs no permission at all.

Bundled third-party code and its license is listed in [NOTICE](NOTICE):
[three.js](https://threejs.org) (MIT).

Not legal advice.
