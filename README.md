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

**Build a block** joins the two. Draw a box around the ground you have mapped
and the app cuts a block from it: the real topography as its lid, your readings
standing on it, and a geologic history fitted to what you actually measured —
then draws the map that history predicts, over the one you walked, so you can
see where the two disagree.

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

**On a block cut from a field area the net carries two sets of poles**, and the
difference between them is the point. The round ones are the block's, read out
of the geology under each marker; the green crosses are the readings themselves,
straight from the notebook and untouched by the fit. Both are fitted and both
verdicts are printed, the measurements first.

This matters more than it sounds. A marker holds only its position and recovers
its attitude from the rock beneath it, which is exactly right on a block you
built — the block is the ground, and a marker is you going and looking at it.
On a block that was *fitted to a notebook* it is circular: the poles are the
fit's own answer handed back to it, and they will land on a flawless girdle
whatever the outcrop did, because the thing they were read off is one
cylindrical fold by construction. A misfit of zero there is a tautology, not a
result, and the readout says so in those words. **Check the whole map** has the
same shape — both sides of that comparison come out of the block — so on a
fitted block it tells you whether your stations sampled it fairly, not whether
the block is right. The measured poles are the only marks on the net that can
disagree with the model, which is the reason they are there.

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

## Projects

Two field areas have nothing to say to each other, and a notebook that mixes
them is one nobody can hand in. **Setup → Project** keeps them apart: each
project holds its own stations, lines, units, downloaded map areas, declination
and remembered map view, and nothing crosses between them.

Switching is one tap, and the map comes back where that project left it. A new
project inherits the declination, the accuracy limit and the base layer —
which describe the phone and roughly where on Earth it is — and nothing else.

Deleting a project deletes the map tiles only it was using: the areas of every
other project are gathered first and anything they still need is kept, because
two field areas can overlap and a download is a fact about the device rather
than about the work. The last project cannot be deleted.

A notebook from before projects existed is carried into the first one rather
than stranded.

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
tap and it keeps a joint from quietly joining a fold-axis fit. Two of the names
do more than that: **a fault plane and a slickenline are evidence about the
fault**, and the block fit reads them there. A plane measured on the surface
itself outranks anything derived from the trace, and a slickenline is the rake
— the direction of slip, and the one fault parameter nothing else on a map can
supply. Which is why the single phone placement above is worth taking: back on
the fault and edge along the striae records both at once. Name the unit by
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
you.

## Drawing contacts and faults

A geologic map is mostly lines. The stations say what the rock is doing; the
lines say where one thing stops and another starts.

**Lines** → pick a kind — contact, fault, unconformity, dike, traverse — and
put points down two ways. **Tap the map** where you can see the trace going, or
press **Here** to drop a point where you are standing, which is what you do
when the contact is under your feet and invisible from any distance. Undo takes
back the last point; Done keeps the line; the × throws it away. **Keep drawing**
picks an existing line back up and adds to its end.

**A fault carries three things a trace cannot give you**, and they are asked
for on the line itself: its **dip direction** (not measured, vertical, or one
of the two bearings its own trace allows, given as a three-digit azimuth —
`117°`, the compass direction the plane leans toward — with a separate
protractor for the **dip angle**, how far it leans below horizontal), **which
way it moved** — thrust, normal, dextral, sinistral, or not sure — and the
**unit either side**, hanging wall and footwall, offered once there is a dip
direction for those words to mean anything.

Those two numbers are the pair a notebook writes as `117/30`, and they are kept
visibly apart because running them together is the easiest mistake in the
control: one is measured on the map with a compass, the other in the vertical
plane with a clinometer. The two bearings offered are ninety degrees either
side of the trace and no others, because the line already fixes the strike —
the only thing left to say is which side the plane leans to, and the fit takes
it that way round, so the strike keeps following the line if a point is dragged
later. None of the three is guessed and
none is required. What they buy is in [Building a block from what you
mapped](#building-a-block-from-what-you-mapped): a dip where the ground was too flat
to give one, a slip search narrowed from every direction to one, and a measure
of the throw that does not need the same contact mapped twice.

**Points can be dragged**, while the line is being drawn and afterwards. A
selected line shows a handle on every point; take one and move it. A whole drag
is one undo step, not sixty. Handles appear only on the line being drawn and
the line selected — every line on the map offering them would make a busy sheet
impossible to pan across. Undo takes back the last point while drawing, and a
stray point on a finished line can be removed outright, down to the two a line
needs to exist.

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
prints them, and a contact records the unit above it and the unit below it.

Deleting a line asks first, and says what it is about to lose — its name, how
many points, how far it runs. So do deleting a station and removing a unit.

## Building a block from what you mapped

**Block** is the tab that joins the two halves. Draw a box round the ground you
have mapped — the same box the Areas tab downloads with, corners and all — and
the app cuts a 3D block out of it.

The block is capped with the **real topography**, from the elevation tiles the
area already downloaded, so it works on a ridge with no signal. Your stations
stand on it as ordinary map symbols. And the geologic history is **fitted to
what you measured**, then handed over as ordinary events on the History tab —
tap one and change it, because the fit is a first draft and arguing with it is
the exercise.

### What it does, in the order it does it

The order is not an implementation detail, it is the argument.

1. **The stereonet decides the shape of the answer**, from the readings alone
   and with the map not consulted. Poles in a cluster are one attitude and
   admit no fold; poles on a girdle are a cylindrical fold and its hinge is
   already known; poles on a small circle are a dome, which has no hinge line
   at all. Fitting a fold to a homocline would always "succeed", at some
   enormous wavelength, and mean nothing.
2. **The structure's numbers are fitted to those readings**, with the faults
   not yet in place. A fault translates a block without rotating it, so the
   beds it carries keep their attitude.
3. **Each fault plane comes from what was measured on it** — a plane read at an
   exposure first, then whatever you set on the line, and only failing both
   from its drawn trace against the terrain, by geometry rather than by search.
   A fault trace on the map is the intersection of the fault with the ground,
   so the traced points lie in the plane and the plane is the one that best
   contains them. Where a measurement and the trace both have something to say
   they are held against each other, because they describe the same surface and
   twenty degrees apart means one of them is in the wrong place.
4. **Only then is slip fitted** — against contacts mapped on both sides, the
   units named either side, the sense you observed, and any slickenlines
   measured on the plane.
5. **Then the fold and the slip are refitted against each other**, once each
   way. Step 2's claim is only half true and it is worth saying which half: the
   beds a fault carries keep their attitude, but the attitude you *see* at a
   station is the fold's attitude at wherever that rock came from, and sliding
   the hanging wall changes that. So the offset was just fitted to a fold that
   was fitted assuming no offset, and one pass back and forth lets each answer
   for the other.
6. **Both sides of every fault are put on the stereonet separately.** A block
   here is one structure with a piece of it slid along a plane, which is the
   right model for a fault that cuts a fold and the wrong one for a thrust that
   carries a differently folded sheet in over the top of another. When the
   whole set of readings is a mess and each half of it is clean, that is not
   noise in the data — it is the fault on the map, no offset will fix it, and
   being told so beats an afternoon spent adjusting a fold to fit readings from
   the other side of a thrust.

### The contact trick

A contact is a surface of constant stratigraphic depth. So the **spread of that
depth along a line you walked is the error, in metres** — with no fitting, and
with no assumption about which units it separates. That one fact is what makes
the whole thing work: the contacts can be used before the column is known, and
once a fault is in the history the same number scores its slip too, because
undoing a fault correctly brings the two halves of a displaced contact back to
the same depth.

It also means the **column falls out of the contacts for free**. Two contacts at
a known structure differ by the thickness of what lies between them, so the
thicknesses are read off the map rather than measured with a tape.

The units at the top and bottom are open-ended: nothing in the box says how
thick they are, so both are **lower bounds** rather than measurements. The
oldest one is grown until it reaches the oldest rock the ground actually
exposes. Left as a placeholder the width of its neighbours, a fold core that
exhumes deeper than the guess runs the column out and the block answers
*basement* — a nose of crystalline rock in the middle of an anticline that no
reading, no contact and no shaded unit ever suggested. That is the placeholder
showing through rather than a finding, and basement is far too strong a claim
to make by accident. The youngest unit needs no such help: the block already
extends it upward above the top of the column.

### Naming the units is a measurement

A fault cuts a contact into two traces with a gap between them, and unless
something says those two traces are the *same* contact, each is internally
consistent whatever the fault did — so the offset is unconstrained and the fit
will happily report a confident wrong number.

What says so is already in the notebook: **the upper unit and the lower unit**.
A contact with sandstone above and shale below is that contact wherever it crops
out, on either side of any fault. So naming the two is not paperwork, it is the
measurement that makes the throw solvable — and the app says so when it has to
refuse.

They are recorded as **upper** and **lower** rather than as one side and the
other, because a pair with no order in it cannot be used for anything. The
order is what gives a thickness between two contacts, what recognises the same
contact again across a fault, and what tells "A over B" from "B over A" on an
overturned limb. Upper means higher in the column — the younger of the two
where the beds are the right way up — whatever the ground happens to do.

**The same two names on the fault itself measure the throw a second way**, and
it is the way a thrust usually needs. A fault that carries older rock over
younger repeats section, and repeated section is only visible to the contact
term if you happened to map the same contact twice, once in each block. Not
everybody does. Almost everybody writes down what the rock is on each side of a
fault — and unit 5 against the Campito across the plane is a statement about
the stratigraphic separation, in the column's own metres, with a sign on it.
Younger-on-older and older-on-younger are the difference between a normal fault
and a thrust.

A contact drawn up to a fault and a stride past it is **not** that contact found
again on the far side, and it is not allowed to act like one. Two stray points
across the line will otherwise forbid the fault from having moved at all: any
slip drags them tens of metres from the fifteen points they were drawn with,
and the spread that costs is larger than anything the offset can win back. The
fault then comes back with a confident offset of about a metre, on the
authority of the end of somebody's pencil line. A side has to be genuinely
mapped — several points and a real share of the surface — before it counts as
the other half of a cut contact, and where the test fails the fit says which of
the two things happened.

It also lets the column be checked. The unit beneath one contact is the unit
above the next one down, so the two names have to agree; when they do not, the
mapping does not join up and the app says which pair disagrees.

### A shaded unit is evidence, not decoration

A contact constrains the model along a **line**. A shaded unit constrains it
over an **area**: every point inside the patch has to have a stratigraphic
depth between the two contacts that bound that unit. That is far more
information than the boundary alone, and it is what pins where the column sits
— the thing a handful of contact depths leaves loose.

The three terms are independent, and that is the point of having them. On a
real notebook, halving the fitted fold's amplitude *improves* how tightly the
contacts hold to one surface and makes the shaded units markedly worse: the
contacts alone would have preferred the wrong answer.

The patches are flooded again in block metres rather than carried over from the
map, because a region is only as good as the lines that bounded it, and the fit
works in the block's frame. A fill with no boundary around it constrains
nothing and is left out rather than allowed to dominate.

### The units you logged are a second opinion

The column is built from the contacts and nothing else — how far apart the
surfaces are is all the contacts can say. The unit you name while standing on
an outcrop is never consulted in building it, which makes it a genuinely
independent check, and **Field → Units you logged** runs it: at every station
that carries a unit name, which unit does the block think crops out there?

It is a check and never a correction. A disagreement can mean the column is
hung at the wrong level or that a station was logged in the wrong unit, and
only the person who walked it can say which. The shape of the disagreement
tells you which to suspect: the same offset running through every station is a
column hung wrong, and one station disagreeing on its own is that station.

Where the ground sits in the column is a real parameter and it is fitted, not
assumed. Stratigraphic depth is measured down from the top of the column, so a
contact can perfectly well come out *above* that zero — at a negative depth —
and there is no way to express that by adjusting the top unit's thickness,
because a thickness cannot be negative. The ground is what moves instead:
lowering the sampled heightfield raises every stratigraphic depth by the same
amount, and adding it back to the datum leaves every reported elevation
untouched.

### Where it says it cannot answer

Which is most of what it is for.

- **Fewer than three bedding readings** fits nothing, and three on one limb
  still only give one attitude.
- **A fault trace across ground with too little relief** constrains no dip at
  all — every plane containing that line fits equally well. It is called
  vertical and flagged as an assumption rather than given a fabricated dip that
  looks measured, and the warning names the two ways you can close the gap.
- **A fault nothing measures the throw of** gets zero slip and says the fault is
  drawn, not solved — telling "you never found this contact again" apart from
  "you stopped drawing it at the fault", since those are different things to go
  and fix.
- **A slip the data barely prefers** is reported as undetermined. After the
  search settles, the offset is walked across its whole range and the fit is
  asked how much it actually minds: when the answer is less than half a degree,
  the number is where the search stopped rather than what the evidence says,
  and it prints identically to one that was measured unless somebody says so.
- **Slickenlines that cannot belong to the fault they were taken on** — a rake
  that is not the sense you observed however the rock moved along it — are
  flagged rather than averaged in. A rake is measured in a plane, so usually
  it is the plane that is wrong.
- **Readings either side of a fault that are two structures, not one**, are
  called that. No offset makes a single fold explain both, so the fit says to
  model one side at a time instead of leaving you to discover it by failing.
- **A history more than about eight degrees from the readings** is reported as
  not an explanation of them. A block quietly twelve degrees from every reading
  it was built from looks exactly as convincing as one that fits, and is the
  single most misleading thing this feature could produce.
- **A box far bigger than the mapping inside it** makes a block that is mostly
  extrapolation, and says so. A big empty block looks more authoritative than a
  small full one.
- **A wavelength far wider than the area mapped** means only part of one limb
  is exposed and the fold is not really constrained.
- Readings with **no bedding beneath them** are counted separately, because
  ninety degrees per reading is also what a data fault looks like, and "your
  block is hopeless" and "these readings never reached it" must not print the
  same number with no way to tell them apart.

### Holding it against the map you walked

**Field → Compare with the map you walked** opens the **Ground map** beside the
block: the hillshade, the contours, the contacts and faults you mapped in the
map's own colours, and in blue the contacts *this block says should crop out*.

Those blue lines are not drawn by hand. The history gives a continuous
stratigraphic depth at every point; sample it on the real ground and contour
the result, and where a contact crops out falls out of the arithmetic. Nobody
codes the rule of Vs — the contour of a dipping surface against a real valley
*is* a V.

Where the model agrees, the walked line sits inside its halo. Where it does not,
there are visibly two lines and the gap between them is the error, on the
ground, where you can go back and look.

One caveat worth knowing: each contact's depth is taken as the **mean** along
the line you walked, so the prediction cannot drift off wholesale. What is being
tested is the **shape and trend** of the trace, not its absolute position.

### How well it fits, live

**Field → How well this block fits your mapping** carries the whole reading:
what the stereonet decided, what was fitted to the map, the column, which
stations were not used and why, and every warning above.

The two numbers at the top — how far the readings are off, and how tightly the
contacts hold to a single surface — are **recomputed from the history you have
now**, not stored from when the block was cut. Change a fold on the History tab
and they answer for the block in front of you. That is the fastest way to find
out whether a correction is an improvement, and it is the same instinct as
leaving the stereonet up beside the block.

The ground map and the stereonet share one slot: opening either closes the
other, because three panes is not a layout a phone has room for.

---

## Shading the units

A geologic map is mostly polygons, and until now this one had only the lines
round them, leaving the units to be held in your head.

**Lines → Units → Shade a unit**, then tap inside an area your contacts
enclose. It fills out to them — and **names itself from the readings standing
inside it**.

That is the point: you already said what the rock was at every station you
stood on. Asking again when you shade the area is asking for the same fact
twice, and giving you a second chance to disagree with yourself. So there is
usually nothing to choose. The chips above are there to overrule the readings,
or to name ground you never took one in.

Two different units named inside one area is reported rather than resolved.
That is a real contradiction — either a contact between them has not been
drawn, or one of those stations is logged in the wrong unit — and quietly
taking the majority would bury the one thing worth seeing. The same check runs
on every shaded area afterwards, so a patch that stops agreeing with the
readings in it says so.

The polygon is **not stored**. A unit patch is a name and a point inside it,
and the area is flooded out to the contacts every time it is drawn — so it
cannot go stale. Drag a contact and the shading follows it, because there is
only ever one copy of that geometry and it belongs to the lines. A whole
geologic map costs a few dozen points of storage.

Contacts, unconformities, faults and dikes stop a fill. A traverse does not:
where you walked is not a boundary.

**The edge of the sheet is a boundary too**, exactly as on a printed map. Real
contacts almost never close on each other — they run off the side of the
ground you walked, and the band between two of them is open at both ends. A
fill that stopped only at contacts would escape from nearly every real map.

Better still, draw one yourself. **Map boundary** is a line kind like any
other: the neat line round the ground you are claiming to have mapped. It
stops a fill the way a contact does, so units can be filled in against it —
and it is deliberately invisible to everything that reasons about geology. It
is never read as a contact or a fault, never counted among the surfaces a
structure is fitted to, and never allowed to stretch the area the fit thinks
you covered. It says where you stopped looking, which is a fact about the
survey rather than about the rock.

**Colours belong to the unit, not the patch.** Tap the swatch on any shaded
area and every outcrop of that unit follows, on the map and in the block's
column — and the unit is created for you if you only ever named it on an
outcrop.

Tapping ground that is already shaded does not add a second patch. The flood
knows which patch owns that cell, so it says which one it is and leaves the
list alone.

One unit crops out in many places, so a patch carries a unit name rather than a
unit owning a polygon, and a unit has as many patches as it has outcrops. A
unit you set up in advance brings its own colour; one that exists only because
you typed it on the outcrop gets a stable colour of its own, so the shading is
useful before any of that is filled in.

A fill that swallows most of the sheet is **not drawn**. It means there is no
boundary round that point yet, and a wash over the whole map would hide the
very contacts you need to see to fix it — so the panel says so in words
instead.

## Getting the work out

Four buttons, on both the Stations and the Lines tab, because they go to
different places:

| | |
|---|---|
| **Google Earth** | KML. Stations as placemarks labelled with their attitude, lines draped over the terrain in their map colors. Double-click it. |
| **GeoJSON** | Stations as points and lines as LineStrings in one file, for QGIS or ArcGIS. Carries strike, dip and dip direction as fields, so a layer can be symbolised on `strike` directly. |
| **CSV** | Stations one per row. The Lines tab exports lines instead, each as a WKT `LINESTRING` — which is what QGIS reads when you add a delimited text layer, so a spreadsheet of contacts comes in as real geometry rather than as a table nobody can map. |
| **Backup** | The whole notebook, and the only one that can be read back in here. |

Attributes go into KML's `ExtendedData` as well as the description bubble, so
the same file opened in QGIS arrives with real fields rather than a blob of
HTML. Lines are `clampToGround` and tessellated, so a contact follows the
ridge it was walked along instead of cutting a straight chord through it.

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
| **Fold** | an upright fold (vertical displacement, a warped and enveloped wave read across the horizontal `perp` axis), then a rigid tilt about `perp` by the plunge | neither step changes the horizontal coordinates the profile is read from, whatever shape that profile has |
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

## Reading a history back out of a map

`js/geo/infer.js` is the same engine pointed the other way, and there is no new
geology in it.

`stratDepth()` already answers "how far below the top of the column is this
point" as a continuous number. Run that over a student's own readings instead
of over the screen and it stops being an answer and becomes a **misfit** — and
a misfit is something that can be minimised.

Two kinds of evidence, and it matters that they are independent. The stations
say which way the beds lean at a point; the contacts say where one single
surface goes across the map. A model can satisfy either alone and still be
wrong: dips alone cannot tell an anticline from the syncline half a wavelength
away, and contacts alone cannot tell a tight fold from a broad one where only
part of a limb is exposed.

The search is a coarse scan to find the right basin, then coordinate descent
with a shrinking step to walk to the bottom of it. Nothing cleverer, because
the objective has long flat valleys and several local minima and this behaves
predictably in both. A whole fit is tens of milliseconds.

**Real ground is a seventh kind of surface.** `demSurface()` in
`geo/surfaces.js` wraps a sampled heightfield, and `surfaceHeight()` answers
from the samples. Everything downstream — the cutaway, vertical exaggeration,
the markers, the identify tool, contours, map view — already went through that
one function, so all of it works on a real landscape unchanged. It is
deliberately given no `KIND_CODE`: the GLSL twin exists to colour *unconformity*
surfaces on the GPU, an unconformity surface is always one of the analytic
kinds, and the land surface never reaches the shader because the block's lid is
meshed from it on the CPU instead.

Two things a heightfield breaks if you are not careful, both fixed:

- **Undo.** `snapshot()` deep-copies the document on every edit, and a
  `Float32Array` through `JSON.stringify` comes back as an object with
  thirty-seven thousand numeric keys — a round trip does not merely cost, it
  destroys the terrain. The samples are immutable, so snapshots share the
  surface by reference instead.
- **Contours.** The shader draws lines where `z / interval` is a whole number,
  and on real ground `z` is metres about the block's own datum. Without
  `uContourDatum` the lines fall at 1806, 1831, 1856 rather than the round
  elevations a map prints, and the labels name the wrong thing. An invented
  landform passes a datum of zero and is unaffected.

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
    dem.js            elevation decode, hillshade, contour tracing
    sensors.js        GPS watch and the compass clinometer
    declination.js    magnetic to true north
    ground.js         the frame the two halves share, and the sampled ground
    cutblock.js       a field area and a box -> a block document
  ui/
    app.js            shell, section switch, tabs, identify tool, files
    panels.js         layers / history / terrain / field / view panels
    stereonet.js      the net, and the readout of what it found
    groundMap.js      the map beside the block: walked vs predicted
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
- **A fold has a shape and a reach, not just a size.** The profile is a cosine
  warped by two numbers and multiplied by an envelope, all of them functions of
  one coordinate — how far across the axis a point lies. That is the property
  the model rests on: moving in z does not change that coordinate, so the
  inverse of a fold stays exact and closed-form whatever the profile does, and
  `beddingAt` finite-differences the result so nothing needs an analytic
  derivative either. Real fold geometry, for the price of arithmetic.
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
  - **Reach**, along the axis and across it, fades the fold to nothing beyond
    it with the same bounded cosine taper a dome or basin already uses. Left at
    zero the fold runs at full amplitude to every edge of the block, which is
    what it always used to do. Setting it is what lets one block hold an open
    limb in one corner and a tight train in another — two fold events with
    their own shapes rather than one sinusoid asked to serve both.
  - The pair `|vergence| + |hinge|` is held under 0.9 so the warp stays
    monotonic. Past one it runs backwards over part of the cycle and grows
    parasitic crests; the inverse survives that, the geology does not.
- Folds are similar folds (Class 2): layer thickness is preserved parallel to
  the axial surface, not perpendicular to bedding. **The profile does not vary
  with depth at all** — the fold at 800 m down is identical to the one at the
  surface, and persists forever. Real folds usually die out downward. That is
  the one extension here that is not free: the moment the displacement depends
  on z the inverse goes implicit, and the exact cheap inverse is what the whole
  engine rests on.
- A plunging fold is built as an upright fold plus a rigid tilt about the
  horizontal axis perpendicular to its trend, so the whole fold train tilts —
  which is what puts the nose in the map view. Merely leaning the displacement
  direction over does not plunge anything; it shears the fold and leaves the
  hinge of a flat bed horizontal.
- Both of the envelope's coordinates are read off the **unrotated** offset from
  the fold's centre, and both basis vectors are horizontal, so neither can see
  a point's height. Taking them after the plunge tilt instead gives an
  identical wave — the tilt is about the across-axis vector, which it leaves
  alone — but it tips the along-axis vector out of horizontal, and the envelope
  of a plunging fold would then fade with depth rather than along strike. It
  would also stop being an exact inverse, silently.
- A fold event can also be made asymmetric **without** any of this, by putting
  a tilt after it: an upright fold with 31° limbs plus a 15° tilt about its own
  axis reads 16° on one limb and 46° on the other, and past 31° the shallow
  limb overturns. That changes limb dips but not limb widths, and it tilts the
  axial surfaces with it. Vergence is the other kind of asymmetry — unequal
  limb *widths*, upright axial surface — and the two compose.
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
### Building a block

- **One structure at a time.** The fit puts a single tilt, fold or dome in the
  history, plus a fault for each fault you drew. Two folds overprinting, or a
  fold refolded, comes out as a poor fit and says so rather than being
  decomposed.
- **The predicted contacts are anchored to your own lines.** Each contact's
  depth is the mean along the trace you walked, so the prediction cannot drift
  off wholesale — it tests the shape and trend of the trace rather than its
  absolute position. Hanging the levels off the column instead would be a
  harder test and is the obvious next thing.
- **Faults are planar and their slip is uniform**, the same limit the block has
  everywhere, and an infinite plane besides — a fault that dies out along
  strike is not represented.
- **Only bedding is fitted.** Joints, foliation and lineations are carried into
  the block as record but say nothing about the shape of the beds.
- **The ground is the DEM's**, so about 10 m, and every thickness read off the
  map inherits that.
- The heightfield travels inside the document, packed as int16 decimetres —
  about 75 kB before base64 for a 193 x 193 lid. A block cut from a field area
  is therefore a much bigger file than an invented one, and that is what lets it
  open on a phone that has never downloaded the area.
- **The block's footprint is fixed** once it is cut. Width and depth are the
  ground the samples were taken over and the readings are pinned to it; only
  how deep the block is cut stays adjustable.
- Field readings reach the stereonet only by way of **Build a block** — the
  fit runs on the Map section's bedding, but the net itself is still a block
  instrument. Plotting a project's readings without cutting a block is the
  obvious next step and `geo/stereonet.js` already takes any bag of readings.
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

⚠️ **The service worker will serve you yesterday's code.** It is cache-first by
design, and that design does not care that you are the one editing the files.
The dev server's no-cache headers do not help, because the request never
reaches it. Symptoms are edits that appear to do nothing, or a fix that works
in one file and not the next.

Before an editing session, in the console:

```js
for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
for (const k of await caches.keys()) if (k !== 'field-tiles') await caches.delete(k);
location.reload();
```

Keep `field-tiles` unless you want to download your test area again — it is the
one cache that is expensive to rebuild, and it is deliberately not versioned.
The worker re-registers on the next load, so this is a per-session ritual, not
a one-off.

## Testing without a browser

There is no Node here, so the checks run under JavaScriptCore via `osascript`.
The orientation maths in particular is worth testing that way rather than by
holding a phone: the compass bug that put every strike out by the local
declination, and the one that made the strike swing as the phone was turned on
the rock, were both found and fixed against a numerical model of what the
sensors report, before either was seen on a device.

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
