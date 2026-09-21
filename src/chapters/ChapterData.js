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
    notes: 6,
    tapes: 1,
    estimatedMinutes: 14,
    theme: 'lullaby',
    epigraph: 'Every puppet here was somebody once. That is not a metaphor.',
    epigraphSource: 'HOLLOWHART STAFF HANDBOOK, 1994 — PAGE TORN OUT',
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
    theme: 'workshop',
    epigraph: 'Wood remembers the shape it was cut from. So does everything else.',
    epigraphSource: 'O. VANTH, CARVING ROOM NOTES',
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
    theme: 'rehearsal',
    epigraph: 'They have had ten years to learn the song. They are note-perfect now.',
    epigraphSource: 'REHEARSAL LOG — FINAL ENTRY',
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
    theme: 'flood',
    epigraph: 'The water came up in 1989 and nothing was ever brought back out.',
    epigraphSource: 'INSURANCE ASSESSMENT, DENIED',
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
    theme: 'premiere',
    epigraph: 'Places, please. The house is full and it has been full for a decade.',
    epigraphSource: 'STAGE MANAGER — TANNOY, LOOPING',
  },
];

/**
 * Chapters that actually have a level behind them.
 *
 * This, and not the save file, is what chapter select gates on. Locking
 * chapters behind progress made sense when the game was being played once,
 * straight through; it makes no sense for someone who wants to jump back into
 * the workshop to look at something, and it makes testing a later chapter mean
 * beating the earlier ones first. A chapter you have not reached is a spoiler
 * you chose to look at, which is your business.
 */
export const BUILT_CHAPTERS = [1, 2, 3, 4];

export const isChapterBuilt = (id) => BUILT_CHAPTERS.includes(id);

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
