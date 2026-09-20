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
