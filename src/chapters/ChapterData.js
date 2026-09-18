/**
 * ChapterData.js — the table of contents.
 *
 * Titles, blurbs and collectible counts live here so the main menu, chapter
 * select, save system and archive all agree without importing level code
 * (which is heavy and only loads when a chapter actually starts).
 */

export const CHAPTERS = [
  {
    id: 1,
    title: 'Curtain Call',
    subtitle: 'The lobby, the ticket office, the house',
    blurb:
      'The doors were chained from the inside. Ten years of dust on the carpet, and someone has walked through it recently.',
    lens: 'threadlight',
    lensName: 'Threadlight',
    stubs: 3,
    notes: 4,
    tapes: 1,
    estimatedMinutes: 14,
  },
  {
    id: 2,
    title: 'The Workshop',
    subtitle: 'Carving room, paint shop, kiln',
    blurb:
      'Forty-one unfinished bodies on the racks. The kiln is still warm, and nobody has paid the electricity bill since 1986.',
    lens: 'ember',
    lensName: 'Ember',
    stubs: 3,
    notes: 4,
    tapes: 1,
    estimatedMinutes: 13,
  },
  {
    id: 3,
    title: 'Rehearsal',
    subtitle: 'Rehearsal halls, costume storage, the practice room',
    blurb:
      'They are still rehearsing. You can hear the lullaby through two walls, and it stops whenever you do.',
    lens: 'echo',
    lensName: 'Echo',
    stubs: 2,
    notes: 5,
    tapes: 1,
    estimatedMinutes: 15,
  },
  {
    id: 4,
    title: 'Backstage',
    subtitle: 'The flooded basement, the Threadworks',
    blurb:
      'Odile built her laboratory below the water table. Something down there learned to hold its breath.',
    lens: 'hollow',
    lensName: 'Hollow',
    stubs: 2,
    notes: 4,
    tapes: 1,
    estimatedMinutes: 14,
  },
  {
    id: 5,
    title: 'The Grand Premiere',
    subtitle: 'The stage, at last',
    blurb:
      'Forty-three performers. One seat left in the wings, and it has your name on the back of it.',
    lens: null,
    lensName: null,
    stubs: 2,
    notes: 3,
    tapes: 1,
    estimatedMinutes: 16,
  },
];

export const TOTAL_STUBS = CHAPTERS.reduce((n, c) => n + c.stubs, 0);   // 12

export const getChapter = (id) => CHAPTERS.find((c) => c.id === id) ?? null;

export const LENSES = {
  threadlight: {
    name: 'Threadlight',
    chapter: 1,
    tint: 0x6fe3d4,
    strainRate: 0.055,
    description: 'Shows the threads. Which lever moves which door, where the power runs, and what is still attached to a string.',
  },
  ember: {
    name: 'Ember',
    chapter: 2,
    tint: 0xff7a3d,
    strainRate: 0.075,
    description: 'Shows what is warm. Handprints on a keypad, a body in a vent, the path someone took ten minutes ago.',
  },
  echo: {
    name: 'Echo',
    chapter: 3,
    tint: 0xa98fd6,
    strainRate: 0.095,
    description: 'Shows what happened here. The dead go about their work, and if you stand close enough you can hear them.',
  },
  hollow: {
    name: 'Hollow',
    chapter: 4,
    tint: 0x2a3140,
    strainRate: 0.21,
    description: 'Shows the other side. Doors that were never built, floors that were taken away. It costs more than the rest combined.',
  },
};

export const LENS_ORDER = ['threadlight', 'ember', 'echo', 'hollow'];
