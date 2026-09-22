/**
 * StoryContent.js — every readable, watchable and findable thing in the game.
 *
 * Kept as data, separate from the levels that place them, so the Archive can
 * list them without loading chapter geometry and so the writing can be read and
 * edited in one place.
 *
 * House style for notes: short, specific, personal. Someone wrote this in a
 * hurry, for a reader who already knew the context. Nothing explains the
 * threadwork; people who understood it had no reason to write it down.
 */

export const NOTES = {
  // ---- Chapter 1 : Curtain Call -----------------------------------------
  'ch1-note-timecard': {
    chapter: 1,
    title: 'Payroll note, clipped to a timecard',
    body: `Odile says no one clocks out until the Premiere.

Marta's been in the costume room three days. I can hear her sewing through the wall. She doesn't answer.

The sewing never stops.

— D.`,
  },
  'ch1-note-boxoffice': {
    chapter: 1,
    title: 'Ticket office ledger, last page',
    body: `Nov 14 — 412 sold. Full house.
Nov 15 — 412 sold. Full house.
Nov 16 — 412 sold. Full house.

We have 388 seats.

I have counted them four times. I counted them again with Ruth and we got 388 both times.

I am not selling any more tickets.`,
  },
  'ch1-note-child': {
    chapter: 1,
    title: "A child's drawing, pinned at knee height",
    body: `Crayon on the back of a programme. A stick family of four outside a tall building.

Above them, six strings come down out of the sky. Each one ends in a small careful knot around a wrist, an ankle, a neck.

At the bottom, in an adult's handwriting:
"Ellie — please stop drawing this one."`,
  },
  'ch1-note-cloakroom': {
    chapter: 1,
    title: 'Cloakroom ticket, still in its envelope',
    body: `HOLLOWHART — CLOAKROOM
No. 14

One coat. Paid.

On the back, in pencil, in a child's hand:

"if you are reading this then she has gone and got it wrong again. the numbers go DOWN not ACROSS. three to a row and then start again. i worked it out when i was nine and nobody has ever checked."`,
  },
  'ch1-note-cellar': {
    chapter: 1,
    title: 'Chalked on the cellar wall',
    body: `BOARD FEED — DO NOT PULL

Whoever keeps switching this off: the board is the only circuit in the building that does not also wake the house.

If you want the stage lit, this is the one. If you want the house lit, pull one of the other two and then run.

— G. HALE`,
  },
  'ch1-note-wren': {
    chapter: 1,
    title: 'Folded into the lining of the mask',
    body: `If you're reading this you put it on, which means you didn't listen, which means you're mine.

Rules, then.

Don't wear it near them. It sings. You won't hear it. They will.

Take it off before the crack reaches your eye.

And when you see me — and you will — I need you to remember that I stopped being able to lie about eleven months ago.

— W.`,
  },

  // ---- Chapter 2 : The Workshop ------------------------------------------
  'ch2-note-quota': {
    chapter: 2,
    title: 'Production quota, taped above the lathe',
    body: `PREMIERE CAST — 43 BODIES

Carved: 43
Painted: 43
Strung: 41
Fitted: 12

Fitting is behind because fitting takes a person and we keep running out.

Send more from the office. Odile says the office can spare them.`,
  },
  'ch2-note-kiln': {
    chapter: 2,
    title: 'Kiln log, in two hands',
    body: `A neat hand:
  Firing 118. Cone 6. 1222°C. Eight hours. Good glaze, no crazing.
  Firing 119. Cone 6. 1222°C. Eight hours. Good.
  Firing 120. Cone 6. 1222°C. Eight hours. Good.

Underneath, in pencil, pressed hard:
  IT IS NOT HOT ENOUGH AT 1222
  SHE WANTS THEM AWAKE NOT HARD
  DO NOT GO ABOVE 900 IF YOU WANT THEM TO STAY ASLEEP`,
  },
  'ch2-note-hands': {
    chapter: 2,
    title: 'Note in the paint shop, under a jar of thinner',
    body: `Whoever keeps painting the eyes open —

Stop it.

We paint them shut. We have always painted them shut. There is a reason we paint them shut and if you have to ask what it is then you have not been here long enough to be doing the eyes.

Paint them SHUT.`,
  },
  'ch2-note-resignation': {
    chapter: 2,
    title: 'Letter of resignation, never sent',
    body: `Madame Hollowhart,

I am leaving at the end of the week. I want to say it is the hours but it is not the hours.

Yesterday I finished a hand. Five fingers, jointed, the thumb a little short the way I always cut them. I set it on the bench and went to lunch.

When I came back it had closed.

Not fallen. Closed. Around the chisel. Tight enough that I had to work it loose.

I have carved for nineteen years. I know what wood does.

— B. Alderhay`,
  },

  // ---- Chapter 3 : Rehearsal ---------------------------------------------
  'ch3-note-blocking': {
    chapter: 3,
    title: 'Blocking notes, Rehearsal Hall B',
    body: `Act III, the Understudy alone.

She enters from the prompt side. Three marks — she must hit all three, in order, and she must hit them exactly.

Odile was very clear about this. Not approximately. Exactly.

I asked what happens if she misses one and Odile said "then it isn't her turn yet", and went back to her notes.`,
  },
  'ch3-note-marta': {
    chapter: 3,
    title: 'Note on the costume-room door, in a shaking hand',
    body: `Marta —

Four days now. I've stopped knocking.

I put your dinner outside the door on Tuesday and it was still there Thursday and the sewing hadn't stopped once, not once, not to eat, not at night.

I don't think you're hungry. I think that's the problem.

— D.`,
  },
  'ch3-note-hearing': {
    chapter: 3,
    title: 'Memo — BASEMENT ACCESS',
    body: `Effective immediately, nobody goes below Level 2 alone, and nobody goes below Level 2 with a light.

A light will not help you. It cannot see the light.

It can hear the light being switched on.

Walk. Don't run. If you hear it stop moving, you stop moving too, and you wait, however long that takes.`,
  },
  'ch3-note-tuning': {
    chapter: 3,
    title: 'Taped inside the music-box lid',
    body: `The cylinder is the lock. It always was.

Six pins, and the tune is the key — the first phrase, nothing more. Anyone who worked here could play it half asleep.

That is exactly why she chose it. She wanted a door that only opens for someone who belongs.

If you are reading this you do not belong, so I have written it down, and I hope she never finds out which of us did it.`,
  },
  'ch3-note-lantern': {
    chapter: 3,
    title: 'Pinned to the lantern case',
    body: `Three discs. The company, on the stage, taken the night of the dress.

Odile had it broken up so nobody could look at it whole. The discs are still in the machine because she never said to destroy them, and nobody here does anything they were not told to do.

Line them up and you will see what the rest of us saw and were told we had not.

Do not tell her you have looked.`,
  },

  'ch3-note-calls': {
    chapter: 3,
    title: 'Pinned above the calls panel',
    body: `Whoever is on the book: the panel is not a doorbell. You are not asking them to come. You are telling them the show has started without them.

Press the rooms in the order on the sheet. One at a time. Wait for the lamp.

Room 3 is not to be called. Not for the half, not for beginners, not ever. If you press 3 the whole call resets and you will start again from the top, and she will hear you do it.

I am aware of how this reads. Press the rooms on the sheet, skip 3, and go home at the end of your shift like the rest of us.`,
  },
  'ch3-note-cylinder': {
    chapter: 3,
    title: 'In dressing room 3, under a cold light',
    body: `I took the cylinder out of the box myself and I am not putting it back.

Marta says the tune is a key. It is not a key. A key opens a door for whoever holds it. This opens a door for whoever the door recognises, and I have watched it refuse people who worked here twenty years.

I am leaving it here because nobody comes to 3 any more, and because I would rather it be lost than be useful.

If you have found it, then you have been where nobody goes, which means you are not looking for a shortcut. You are looking for someone.

Take it. I hope she is still your sister when you get there.`,
  },
  'ch3-note-crossover': {
    chapter: 3,
    title: 'Chalked on a board at the crossover mouth',
    body: `KEEP TO THE BOARDS

The crossover is the only way from one side to the other and it is forty feet of other people's rubbish. Flats, weights, a dead hamper, six years of everything nobody would carry upstairs.

The crew wore a path down the middle of it in the dark, twice a night, for eleven years. That path is still there and it is the only quiet ground in the room.

You cannot see it. Somebody who worked here could walk it blind.`,
  },

  // ---- Chapter 4 : Backstage --------------------------------------------
  'ch4-note-pumps': {
    chapter: 4,
    title: 'Card wired to the pump house door',
    body: `THE PUMPS RUN OR THE THREADWORKS FLOODS.

Three valves. Intake, return, sluice. Open them in that order and only that order or you will send the whole sump back up the return line and into the hall.

I am writing this on the door because the last two men who did it wrong are not available to be told.

— G. HALE, MAINTENANCE`,
  },
  'ch4-note-water': {
    chapter: 4,
    title: 'Folded into a dry boot on the stair',
    body: `It came up in one night. March, 89.

Odile did not evacuate the floor. She had us carry the spools up to the landing and then she sent us home and went back down.

She was down there four days. When she came up she was not wet.

Nobody has asked her about it. Nobody is going to.`,
  },
  'ch4-note-stair': {
    chapter: 4,
    title: 'Works order, unsigned',
    body: `REMOVE: north stair, sub-level 2 to sub-level 1.
REASON: structural.
DISPOSAL: none — see below.

We did not take it anywhere. She said not to. We cut it out and left it exactly where it was and she signed off on that as if it made sense.

You can still hear people using it.`,
  },
  'ch4-note-dye': {
    chapter: 4,
    title: 'Screwed to the dye house wall',
    body: `DIP TANK — STANDING ORDERS

1. The tank is filled and emptied from the cock on the wall. Never from inside the tank. I should not have to write this down and yet here we are.

2. Stock goes in the crate. The crate has a lid and the lid is not decorative: an open crate fills, and a full crate sits on the bottom, and then somebody has to go in after it.

3. The crate is clamped down while the tank is empty so it does not drift into the paddles. Unclamp it before you fill, or it will strain and it will not rise.

Three things, in an order, every time. Marta got it wrong once in eleven years and we were fishing for that spool until four in the morning.`,
  },
  'ch4-note-threadwork': {
    chapter: 4,
    title: 'Loom tag, four of them, wired together',
    body: `WARP ORDER — DO NOT GUESS

The heads take the thread in the order the tags run, not the order the spools sit. A head threaded out of sequence takes what it is given and keeps it.

We lost Petrus that way. He is on the third head and he is still taking thread.

If you are reading this and you do not know what a head is, put the tag down and leave.`,
  },
  'ch3-note-choir': {
    chapter: 3,
    title: "Practice-room schedule, water-damaged",
    body: `MON  —  choir, 9am
TUE  —  choir, 9am
WED  —  choir, 9am
THU  —  choir, 9am
FRI  —  choir, 9am

At the bottom, in a different pen, pressed so hard it has torn through:

they don't need to practise
they are already perfect
we practise so they have a reason to stay in the room`,
  },
};

export const TAPES = {
  'ch1-tape-commercial': {
    chapter: 1,
    title: 'HOLLOWHART — Television Spot, 1983',
    duration: 38,
    // Rendered by the in-world TV as a slideshow with tracking lines and a jingle.
    frames: [
      { t: 0.0, kind: 'title', text: 'HOLLOWHART\nPUPPET WORKS', sub: 'Since 1931' },
      { t: 4.0, kind: 'scene', text: 'A FAMILY BUSINESS', caption: 'Smiling staff wave from the workshop door.' },
      { t: 9.0, kind: 'scene', text: 'EVERY ONE MADE BY HAND', caption: 'A carver holds up a half-finished face.' },
      { t: 14.0, kind: 'scene', text: 'EVERY ONE A PERSON', caption: 'The caption sits a beat too long.' },
      { t: 19.0, kind: 'scene', text: 'THEY NEVER TIRE', caption: 'A row of marionettes dancing in perfect unison.' },
      { t: 24.0, kind: 'scene', text: 'THEY NEVER LEAVE', caption: 'The same row, still dancing. The lighting has changed.' },
      { t: 29.0, kind: 'glitch', text: '', caption: 'Tracking collapses. One frame of a low concrete room: a chair, a drain, a wall of spools.' },
      { t: 30.5, kind: 'title', text: 'COME AND SEE\nTHE GRAND PREMIERE', sub: 'Tickets at the door' },
    ],
    transcript:
      'A cheerful jingle over a slideshow of the factory. The final caption holds too long, and for a single frame the tape shows somewhere that was never in a commercial.',
  },
  'ch2-tape-safety': {
    chapter: 2,
    title: 'WORKSHOP SAFETY — Reel 3: The Kiln',
    duration: 42,
    frames: [
      { t: 0.0, kind: 'title', text: 'WORKSHOP SAFETY', sub: 'Reel 3 — The Kiln' },
      { t: 4.0, kind: 'scene', text: 'RULE ONE', caption: 'Never open a kiln above 400 degrees.' },
      { t: 9.0, kind: 'scene', text: 'RULE TWO', caption: 'Never fire a piece you have not inspected.' },
      { t: 14.0, kind: 'scene', text: 'RULE THREE', caption: 'Never fire a piece that inspects you back.' },
      { t: 19.0, kind: 'scene', text: '', caption: 'The presenter loses his place. He looks off-camera for four seconds.' },
      { t: 24.0, kind: 'scene', text: 'RULE THREE', caption: '"...never fire a piece you have not inspected." He says it again. And again.' },
      { t: 32.0, kind: 'glitch', text: '', caption: 'The tape has been spliced. The join is crude, and done from the inside.' },
      { t: 34.0, kind: 'title', text: 'WORK SAFELY', sub: 'Hollowhart Puppet Works' },
    ],
    transcript:
      'An instructional reel. The third rule is wrong the first time it is said, and the correction is not a correction.',
  },
  'ch4-tape-threadworks': {
    chapter: 4,
    title: 'SUB-LEVEL 2 — Camera 4, 03:11',
    duration: 46,
    frames: [
      { t: 0.0, kind: 'title', text: 'CAMERA 4', sub: 'Sub-level 2 — Threadworks' },
      { t: 4.0, kind: 'scene', text: '', caption: 'A low concrete room. Water to the shin. A wall of spools, all turning.' },
      { t: 9.0, kind: 'scene', text: '03:11', caption: 'Nothing moves for two minutes except the spools.' },
      { t: 14.0, kind: 'scene', text: '03:13', caption: 'The water shifts. Something under it crosses from left to right without surfacing.' },
      { t: 20.0, kind: 'scene', text: '03:14', caption: 'A woman walks into frame. She does not disturb the water at all.' },
      { t: 26.0, kind: 'scene', text: '', caption: 'She stops at the loom, checks a tag, and threads a head by hand.' },
      { t: 32.0, kind: 'scene', text: '03:19', caption: 'She looks directly up at the camera. The timecode stops. The picture does not.' },
      { t: 38.0, kind: 'glitch', text: '', caption: 'Forty seconds of nothing. Then the same two minutes again, from the start.' },
      { t: 42.0, kind: 'title', text: '03:11', sub: 'Camera 4' },
    ],
    transcript:
      'A security loop from the night the basement flooded. The same two minutes, over and over, and one of the two people in it is not wet.',
  },
  'ch3-tape-rehearsal': {
    chapter: 3,
    title: 'REHEARSAL — Act III, take 9',
    duration: 44,
    frames: [
      { t: 0.0, kind: 'title', text: 'REHEARSAL', sub: 'Act III — take 9' },
      { t: 4.0, kind: 'scene', text: '', caption: 'A bare hall. Three chalk marks. A woman waits at the prompt side.' },
      { t: 9.0, kind: 'scene', text: 'FIRST MARK', caption: 'She walks to the mark nearest the door and stops. Exactly on it.' },
      { t: 14.0, kind: 'scene', text: 'SECOND MARK', caption: 'She crosses to the far corner. Stops. Waits four full seconds.' },
      { t: 20.0, kind: 'scene', text: 'THIRD MARK', caption: 'Centre. She turns to face the camera and does not blink.' },
      { t: 26.0, kind: 'scene', text: '', caption: 'Off-camera, a voice: "Again."' },
      { t: 30.0, kind: 'scene', text: 'TAKE 10', caption: 'She walks back to the prompt side. The same three marks. The same four seconds.' },
      { t: 36.0, kind: 'glitch', text: '', caption: 'The tape jumps. It is take 400-something. The chalk has been redrawn so many times the floor is grey.' },
      { t: 40.0, kind: 'title', text: 'AGAIN', sub: '' },
    ],
    transcript:
      'A rehearsal that does not end. The same three marks, in the same order, until the counter stops meaning anything.',
  },
};

/**
 * Wren's ticket stubs. Twelve across the game; finding all of them unlocks the
 * good ending. Each carries a line she wrote on the back, and read in order
 * they are a letter.
 */
export const STUBS = {
  'ch1-stub-1': { chapter: 1, index: 1, back: 'I knew you\'d come in through the coal door. You always did.' },
  'ch1-stub-2': { chapter: 1, index: 2, back: 'Don\'t look at the seats. Count them if you have to, but don\'t look.' },
  'ch1-stub-3': { chapter: 1, index: 3, back: 'The mask was mine first. I\'m sorry about the headaches.' },
  'ch2-stub-1': { chapter: 2, index: 4, back: 'I hid one in every room she left me alone in. She left me alone a lot.' },
  'ch2-stub-2': { chapter: 2, index: 5, back: 'The kiln is the only warm place in the building. I used to sleep against it.' },
  'ch2-stub-3': { chapter: 2, index: 6, back: 'If the hands on the rack are pointing the same way, something moved them.' },
  'ch3-stub-1': { chapter: 3, index: 7, back: 'I learned the tune before I learned to read. So did everyone here.' },
  'ch3-stub-2': { chapter: 3, index: 8, back: "Don't run from the one in the basement. Running is the whole thing it wants." },
  'ch3-stub-3': { chapter: 3, index: 11, back: 'Dressing room 3 was given to nobody for eleven years and the light bill was paid every month.' },
  'ch4-stub-1': { chapter: 4, index: 9, back: 'The water is not the worst thing down here. The water is just how you know.' },
  'ch4-stub-2': { chapter: 4, index: 10, back: 'She kept the fourth lens for herself. I took it back. It is in her desk.' },
  'ch4-stub-3': { chapter: 4, index: 12, back: 'The green thread is the last one and it is the one she used on the understudy.' },
};

/** Radio messages — the voice that turns out to be Wren. */
export const RADIO = {
  'ch1-radio-1': {
    chapter: 1,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: '…hello? Hello. If you can hear this, you are standing in a lobby.' },
      { t: 4.5, text: 'Don\'t turn the main lights on. The breaker is wired to the house, and the house is not empty.' },
      { t: 10, text: 'Find the ticket office. There\'s a torch in the drawer. It was mine.' },
    ],
  },
  'ch1-radio-2': {
    chapter: 1,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'You put it on. I felt that.' },
      { t: 3.5, text: 'Everything you can see now was always there. That should frighten you more than it does.' },
      { t: 9.5, text: 'Follow the threads. They go where the power goes.' },
    ],
  },
  'ch1-radio-3': {
    chapter: 1,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'He\'s on the rails above you. He can\'t leave them — she never gave him feet that work.' },
      { t: 6, text: 'Read the rails, not him. Where the rail stops, he stops.' },
      { t: 11.5, text: 'Go. Go now, and don\'t be clever.' },
    ],
  },
  'ch2-radio-1': {
    chapter: 2,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'The workshop still has power. That isn\'t good news.' },
      { t: 5, text: 'There\'s a second lens in the kiln room. Ember. It shows you what\'s warm.' },
      { t: 10.5, text: 'In a building this cold, anything warm is either working or breathing.' },
    ],
  },
  'ch2-radio-2': {
    chapter: 2,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'You found the log. Then you know she was firing them too cool on purpose.' },
      { t: 6.5, text: 'Hard porcelain is just a cup. She wanted them soft enough to hold someone.' },
      { t: 12, text: 'Fire it properly and whatever is inside it stops being a passenger.' },
    ],
  },
  'ch4-radio-1': {
    chapter: 4,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'You are on the stair. Stop before the water.' },
      { t: 4.5, text: 'It is thigh-deep in the hall and every step you take in it is the loudest thing on this floor.' },
      { t: 10.5, text: 'The pumps still work. Find the pump room before you find anything else.' },
    ],
  },
  'ch4-radio-2': {
    chapter: 4,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'That is the fourth lens. Hollow. She built it and then she never let anyone else wear it.' },
      { t: 6, text: 'It shows you the building the way it was drawn, not the way it was built.' },
      { t: 11.5, text: 'Stairs that were taken out. Doors that were bricked up. It is all still there and you can stand on it.' },
      { t: 18, text: 'It will tear the mask off you in about twenty seconds. Do not be halfway across something when it does.' },
    ],
  },
  'ch4-radio-4': {
    chapter: 4,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'The green spool is in the dye house, west off the hall, and it is at the bottom of a tank.' },
      { t: 7, text: 'There is a cock on the wall that fills and empties it. Read the orders screwed up beside it before you touch anything — they are three lines long and they are all that room is.' },
    ],
  },
  'ch4-radio-5': {
    chapter: 4,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'Stop. Stop moving. There is something on the Threadworks floor with you.' },
      { t: 6, text: 'It is not looking for you. It is doing its rounds, the same as it has done every night for ten years, and it will walk through you without ever noticing it did.' },
      { t: 14, text: 'Thread the loom between its passes. Do not let it reach you and do not, whatever you do, try to talk to it.' },
    ],
  },
  'ch4-radio-3': {
    chapter: 4,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'The sluice is open. The water is going down and it is going to hear that.' },
      { t: 6, text: 'Whatever you do, do not go back for anything.' },
      { t: 10, text: 'The lift is at the north end. Get in it.' },
    ],
  },
  'ch3-radio-1': {
    chapter: 3,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'Rehearsal floor. Be careful here — this is the part of the building that still thinks it has a job.' },
      { t: 6, text: 'The third lens is in the prompt corner. Echo. It shows you what happened in a room.' },
      { t: 12, text: 'Watch what it shows you. Do not talk to it. It cannot hear you and it will be worse if you try.' },
    ],
  },
  'ch3-radio-2': {
    chapter: 3,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'Below this floor there is something with no eyes and a great many arms.' },
      { t: 6, text: 'It cannot see you. It cannot see anything. Crouch, go slowly, and for God\'s sake take the mask off — it sings, and that is all the thing needs.' },
      { t: 14, text: 'If you hear it stop, you stop too.' },
    ],
  },
  'ch3-radio-4': {
    chapter: 3,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'That is the calls panel. Stage management used it to call the company down for beginners.' },
      { t: 6, text: 'Run the call properly and it goes out over every speaker in the building — including the one at the far end of the crossover.' },
      { t: 13, text: 'Think about what that means for the thing in here with you. Think about it before you press anything.' },
    ],
  },
  'ch3-radio-5': {
    chapter: 3,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'It has gone for the speaker. That is your window and it is not a long one.' },
      { t: 5, text: 'Go. Now. Keep to the boards and do not look at what is on the racks.' },
    ],
  },
  'ch3-radio-3': {
    chapter: 3,
    speaker: 'RADIO',
    lines: [
      { t: 0, text: 'The practice room. All right. Listen to me very carefully.' },
      { t: 5, text: 'They only move when nobody is looking at them. Not "when you turn your back" — when nobody is looking.' },
      { t: 12, text: 'The gramophone holds them still while it plays. It does not play for long.' },
    ],
  },
};

export const ALL_NOTES = Object.keys(NOTES);
export const ALL_TAPES = Object.keys(TAPES);
export const ALL_STUBS = Object.keys(STUBS);

export function getNote(id) { return NOTES[id] ?? null; }
export function getTape(id) { return TAPES[id] ?? null; }
export function getStub(id) { return STUBS[id] ?? null; }
