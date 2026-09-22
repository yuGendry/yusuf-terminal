# STITCHWORK — walkthrough

Full solutions. If you would rather be nudged than told, press **H** in game:
the hint system gives three tiers per puzzle, vague first, and only hands over
the answer once you have been stuck a while.

---

## Before anything else

A new game opens on the drive out — forty-eight seconds in a car, arriving at
the factory. Then each chapter shows a title page; **press any key** when it
says so. Then a camera move through the room you are about to be standing in,
which hands the camera to you at the end of it.

You can **hold `Space`** to skip any cinematic, and skipping never costs you
anything: every beat still fires, so a cutscene that unlocks a door still
unlocks it. If you would rather never see them, turn them off in
**Settings → Accessibility → Play cutscenes**.

If a chapter starts and the mouse does not turn the camera, the browser has
refused pointer lock because too long passed since your last click — the game
puts up **"Click to take control"**; click anywhere.

---

## Controls

| Action | Key | Controller |
| --- | --- | --- |
| Move | `W` `A` `S` `D` | Left stick |
| Sprint | `Left Shift` | `L3` |
| Crouch | `Left Ctrl` | `◯` |
| Jump | `Space` | `✕` |
| Interact | `E` | `▢` |
| Veilmask on / off | `F` | `△` |
| Swap lens | `Q` / `R`, or scroll | `L1` / `R1` |
| Flashlight | `L` | `R3` |
| Hint | `H` | D-pad up |
| Pause | `Escape` | `Options` |

A DualSense or any standard gamepad works with nothing to set up — plug it in
and press something. The prompts change to match whichever you last touched.

---

## Chapter 1 — Curtain Call

### 1. The ticket office

From the spawn, head **right (east)** to the ticket window. The office door is
bolted, but the window is brass bars rather than glass, and **one bar has been
bent aside**. Look at the grille and press `E` to reach through.

The torch rolls out of the drawer onto the counter. **Look down at the counter**
and press `E` to take it. `L` turns it on.

### 2. The Veilmask

Back in the lobby, **west side**, a single light is still burning over the
box-office counter. Nothing else in the building is lit on purpose.

Take the mask, read the note, then press **`F`** to wear it.

### 3. The Cloakroom

Go **west** out of the lobby, through the doors marked SALOON BAR. On the bar
counter there is a cloakroom ticket — read **both sides** of it. The front says
**No. 14**. The back says the numbers go *down*, not across.

Behind the bar is the cloakroom: twenty-four pegs on the far wall, three rows
of eight. Almost every number plate has fallen off; only **3**, **11** and
**19** are left, and those three only make sense if the numbering runs down
each column of three:

```
 1  4  7 10 13 16 19 22
 2  5  8 11 14 17 20 23
 3  6  9 12 15 18 21 24
```

> **Answer:** peg **14** is the **fifth column along, middle row** — the coat
> hanging immediately to the right of the plate marked 11.

Search that coat. The key is the cellar key. (Threadlight confirms the
numbering: the little brass chains linking the plates run vertically.)

### 4. The Breaker Run

The lighting board on the stage is dead. Three breaker boxes feed it, and the
one you need is **not in the theatre** — it is on the cellar wall, through the
bar and the cloakroom, behind the door you just unlocked.

Wear the mask. Each box shows a glowing cable running to whatever it actually
feeds. Only one runs **forward toward the stage**.

> **Answer:** the breaker in the **cellar**.

The two in the house are not failure states. One is dead. One brings the house
lights up, which wakes something in the rigging early — you can switch it back
off.

### 5. The Lighting Board

Walk up the **treads at the front of the stage** (there is a set on each side)
and cross to the lighting desk on the stage-right end.

Behind the stage is a **torn rehearsal poster** — a lighting plan. It shows
which chalk marks on the stage floor must be lit: **marks 1, 3 and 5**.

The faders are **not wired in order**. Wear the mask at the desk and follow each
fader's thread up to the lamp it actually reaches:

| Fader | Controls lamp |
| --- | --- |
| 1 | 4 |
| **2** | **1** |
| 3 | 6 |
| 4 | 2 |
| **5** | **5** |
| **6** | **3** |

> **Answer:** push faders **2, 5 and 6** to full. Leave 1, 3 and 4 out.

A bolt draws back behind the stage.

### 6. The Rigging Run

Go through the door behind the stage. You are in a backstage passage; the
**staircase is straight ahead and slightly to your left**, running away from
the stage. Climb it to the top, cross the landing to the **right**, and follow
the catwalk back out over the house.

A checkpoint sets as you come out, then the lights snap on and **Mister Tangle**
drops from the fly loft.

**He can only travel along the ceiling rails.** Wear the mask and the rails
glow — that is the whole trick. Where a rail does not reach, he cannot. Step out
from under a rail and his swipe misses.

Run the catwalks and head for the **green exit sign**. One deck gives way behind
you; keep going. There is a dead-end branch part way along — if you take it,
double back, you have time.

---

## Chapter 2 — The Workshop

### 1. The Ember lens

On the **centre bench** of the carving room, in a felt case. It is the only
thing in the room giving off light.

### 2. Warm Hands

Forty carved hands on a rack on the **east wall**. Thirty-nine hang at whatever
angle they were left at; one hangs perfectly straight, because something was
holding it recently.

Wear the mask with **Ember** and it is the only warm thing in the room.

> **Answer:** third row up, eighth across — the one hanging straight. Take it;
> the corridor key is on the peg behind it.

### 3. The Paint Shop Keypad

Four of the nine keys are still warm. Heat fades, so they are not equally warm:
the **faintest was pressed first**, the **brightest last**.

> **Answer:** `4 — 1 — 9 — 7`

### 4. The Glaze

The kiln room door is padlocked, and the key is in the drying cabinet, which is
shut. Go to the **mixing bench in the paint shop's east bay**.

Pinned beside it is Works Order 4471 — **HOLLOWHART FLESH No. 3** — with the
target colour painted on it and the recipe in parts:

> 5 × LEAD WHITE  ·  3 × IRON RED  ·  2 × CHROME YELLOW

The trap is at the bottom of the card: *"Bench was re-plumbed Feb. Nobody re-did
the handles."* Two of the four taps draw from each other's drums. Put the mask
on with **Threadlight** and you can see the pipes crossing: the handle marked
**CHROME YELLOW** draws cobalt, and the handle marked **COBALT BLUE** draws
chrome.

> **Answer:** pull **LEAD WHITE ×5**, **IRON RED ×3**, **COBALT BLUE ×2**.
> Do not touch the handle marked CHROME YELLOW.

Watch the pot as you go — it shows you the colour you are actually making. If
it goes wrong, the lever beside it tips the pot out and you start again.

Solving it springs the cabinet catch. Take the key, unlock the kiln room door.

### 5. The Kiln

A kiln is a brick oven for baking clay — the workshop uses it to harden the
porcelain heads. It is the big steel-fronted box on the west side of the room,
with **KILN No. 2** stencilled on its door. The **gas valve** is the brass
wheel on the front of it.

Read the **kiln log** on the bench: it gives a firing schedule in cones. The
**chart on the south wall**, under its own lamp, explains that a cone is a
temperature, and that cone 6 is 1222 °C.

**The gauge is wrong.** It was last calibrated in 1984 and reads about 300 °C
low. Trusting it means firing to roughly 1530 °C and cracking the load.

Potters fire to a cone, not to a dial, because dials drift. The three
pyrometric cones are **inside** the kiln, so Ember is the only way to see them
— with the lens up the steel goes transparent and you are looking straight into
the chamber.

> **Answer:** interact with the brass valve to open the gas. Stand in front of
> the kiln door, put the mask on with **Ember**, and look into the box: three
> small cones stand on a shelf inside, numbered **4**, **5** and **6** from the
> right. They bend over one after another as the heat climbs. Close the valve
> the moment **cone 6 — the one on the left — goes over**. The climb slows
> right down near temperature, so there are several seconds between cone 6
> going and cone 7 (which is not shown) ruining the load. Overfiring is
> recoverable anyway: the kiln cools and you can fire again.

If you would rather read the dial than the cones: the gauge under-reads by 305,
so cone 6 is **917 on the gauge**, and anything past **935** cracks the load.
Do not wait for it to say 1222.

### 6. The Conveyor Run

Every belt starts at once and Tangle comes in over the packing line. Same rule
as before: read the rails. Head for the **north door**.

---

## Chapter 3 — Rehearsal

### 1. The Echo lens

On the **prompt desk**, the small desk in the south-west corner of the rehearsal
hall.

### 2. The Magic Lantern

Optional, and it holds a ticket stub. Go **east** out of the rehearsal hall,
into the green room.

On the table is a three-disc magic lantern, still projecting onto the north
wall. The photograph is broken across the three discs and none of the bands
line up. Each brass ring turns a quarter at a time, and turning one **slides
that band of the picture sideways**.

> **Answer:** from where they start, turn the **first ring three times**, the
> **second once**, and the **third twice** — all three index marks straight up.

The picture is the company on stage the night of the dress rehearsal. Count the
people in it.

### 3. The Blocking

Three chalk marks on the floor, and a rehearsal that never finished. Wear the
mask with **Echo** and watch: she enters from the prompt corner and walks all
three in a fixed order, pausing on each. The mark she is standing on brightens.

Stand on them yourself in the same order. A wrong mark resets you — no other
penalty.

> **Answer:** the mark on the **west** side, then the one in the **far north
> corner**, then the one on the **east** side.

### 4. The Long Dark — Gloam

Down the stair into costume storage. **Gloam is blind.** It never checks line of
sight. Light does not give you away and darkness does not protect you — only
noise does.

- **Crouch** (`Ctrl`) the whole way. Crouched footsteps are near-silent.
- **Take the mask off.** It hums, and the hum is a continuous sound source at
  your exact position.
- It goes to where a noise **happened**, not where you are. If it starts coming,
  stop dead and wait — it will arrive at an empty aisle and cast about.
- Keep the costume racks between you and it. They are solid cover.

The way on is **west**, through the doorway in the middle of the far wall.
(The music box on the east side has no cylinder in it; what it needs is through
here.)

### 5. The Crossover

Forty feet of stacked flats, stage weights and dead hampers. **Everything
except the middle of the floor is loud to walk on** — a step off the boards
lands on somebody's discarded scenery and Gloam hears it from anywhere in the
room.

Put the mask on with **Echo** and you can see the path the crew wore down the
centre of the boards. But the mask hums, and the hum is what Gloam listens for
before anything else.

> **Answer:** look with Echo, memorise the line, **take the mask off**, and
> walk it. When you lose the line, stop moving, put the mask back on, look, and
> take it off again. Never walk and wear it at the same time.

### 6. The Dressing Rooms and the Calls Panel

Five dressing rooms off a corridor. **Room 3** is opposite the way in, its
bulbs are dead, and the **music-box cylinder** is on the table inside it. Take
it — and read the note beside it.

The **calls panel** is at the far (south) end of the corridor. Five buttons,
one per room. The note pinned above it says which room is never called; the
**Echo ghost** still standing at the panel shows you the same thing, reaching
for 3, stopping, and going on.

> **Answer:** press **5, 2, 4, 1**. Never 3 — pressing it resets the call and
> makes a great deal of noise.

The call then goes out over the horn at the **north** dead end of the corridor,
and Gloam goes to answer it. That is your window to get back east across the
crossover, and it is about **twenty-five seconds**. Go as soon as you hear the
announcement — do not wait to watch it pass.

### 7. The Music Box

Six brass tines. The cylinder is the lock and the tune is the key.

An **Echo operator** is still sitting at that bench playing it on a loop — the
tine she strikes lights up. Watch her and you can read the sequence by eye.

Left to right the tines are **D, E, F, G, A, B♭**. The phrase is **D – F – A –
G – F – E**.

> **Answer:** fit the cylinder you took from dressing room 3 (hold `E` on the
> box), then strike tines **1, 3, 5, 4, 3, 2** in that order.

Every strike is loud. Do it when nothing is nearby.

### 8. The Practice Room — the Choir

Porcelain dolls that move **only when nobody is looking at them**. Not "when
your back is turned" — a doll you are actually looking at, that is not hidden
behind something, cannot move at all.

The **gramophone** by the door holds them all still while it plays, for about
twenty-five seconds. You can hear it winding down.

> **Answer:** wind the gramophone fully (hold `E`), then **walk** — do not
> sprint, you need to be able to sweep the room with your eyes. Turn as you go
> so your view crosses as many of them as possible. If the music runs out and
> you are not across, get back to the gramophone and wind it again.

The exit is the door in the **east wall**.

---

## Chapter 4 — Backstage

The flooded sub-levels. **Wading is slow and loud**, and crouching does not
help — the Chapter 3 rules stop working, and getting *out* of the water is the
only answer.

### 1. The Pumps

The wheel that fits the pump stems is hanging on a bracket on the **west wall
of the flooded hall**, down the stairs. Gloam is in that water; go straight
there and straight back.

The card wired to the pump room door gives the order, and the valves are not
mounted in it. Left to right the wall reads **SLUICE · INTAKE · RETURN**.

> **Answer:** intake, then return, then sluice — so **middle, right, left**.

The hall drains to ankle depth. It is quiet enough to think in now.

### 2. The Hollow lens

Through the **east** door out of the flooded hall, into Odile's laboratory. The
case is on her desk.

### 3. The Dip Tank

Through the **west** door out of the flooded hall into the dye house. The
loom later on needs a **green spool**, and it is in a crate on the bottom of
the dip tank. There is no reaching down that far.

The only tool in the room is the tank itself: the **cock on the west wall**
fills and empties it, as often as you like. A crate floats — this one does not,
for two reasons, and both of them can only be got at while the tank is empty.
The standing orders screwed to the wall list them.

> **Answer:** with the tank empty, go down the steps inside it. **Throw the
> clamp off the crate**, then **shut its lid**. Climb out, and **fill the tank**
> from the cock on the wall. The crate comes up to the rim, where you can reach
> the spool from the walkway.

Get it wrong and you can see which half you got wrong: flood it with the lid
open and the crate fills and sits on the bottom; flood it with the clamp still
on and it lifts a hand's breadth and stops. Drain it and start again.

### 4. The Cut Stair

There is a doorway four metres up the hall's **north** wall with nothing under
it. The staircase was removed in 1989 and left exactly where it was.

> **Answer:** wear the mask with **Hollow**. The stair is there, and it is
> solid *only while you are wearing it*. Hollow burns Strain about four times
> faster than the other lenses, so do not stop halfway to look — if the mask
> tears off while you are up there, you fall.

### 5. The Warp — and the long walk

Down the steel stair from the gallery into the Threadworks. First, **set the
green spool in the cradle** at the end of the bench: nothing on the loom runs
without it.

Doing that brings **the Understudy** down onto the floor. It is not hunting
you yet — it walks a fixed loop of the room at its one unvarying pace and never
looks up. It will still kill you if it walks into you.

Four threading heads on the loom, each with a tag wired to it. The number on
the tag is its **position in the warp**, not its position on the bench.

> **Answer:** watch one full circuit before you commit to anything, then
> thread **amber, red, violet, green**, always working the head on the far
> side of the bench from wherever it is. Each head takes about a second to
> thread, which is time you have to have already bought.

Finishing the warp is what makes it start hunting.

### 6. The Counterweight

The lift gate will not rise because the counterweight is sitting on the bottom
of an empty tank. It is not a weight, it is a **float** — and you emptied the
tank yourself.

> **Answer:** go back up to the **gallery** and close the sluice. The floor
> floods again and the gate lifts.

### 7. The Understudy

Closing the sluice sends it after you in earnest. It walks, slightly slower than you walk, and it
never stops — and it wades, so water slows it exactly as much as it slows you.
You cannot lose it and you do not need to. Go down through the Threadworks and
into the **lift** at the north end, and do not go back for anything.

---

## Ticket stubs

Twelve across the game, and all twelve now exist. Finding all twelve changes the
ending. They glow faintly through the **Threadlight** lens — Wren handled every
one of them.

| Chapter | Where |
| --- | --- |
| 1 | The cellar, behind the cloakroom · east wall of the house, in the seating · the catwalk above the stage |
| 2 | Carving room floor, west end · kiln room floor · on the first conveyor belt |
| 3 | On the piano in the rehearsal hall · costume basement, south end · dressing room 3 |
| 4 | The gallery, above the flooded hall · Odile's desk in the laboratory · the dye house floor, east end |
