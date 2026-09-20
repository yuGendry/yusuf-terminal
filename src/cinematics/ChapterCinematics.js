/**
 * ChapterCinematics.js — the camera moves that open and close each chapter.
 *
 * These play inside the loaded level rather than in a set built for them, so
 * every one of them is a shot of the actual room the player is about to walk
 * into. That costs nothing to build and it means the opening can never show
 * the player somewhere the game does not go.
 *
 * All poses are authored as offsets from the chapter's spawn point and are
 * rotated into the spawn's facing, so a shot written as "four metres behind
 * and three up, looking ahead" stays correct no matter which way a chapter
 * happens to start you off. That also keeps every path inside the spawn room,
 * which is the only room guaranteed to exist and be empty.
 */

import * as THREE from 'three';
import { Cinematic } from './Cinematic.js';
import { getChapter } from '../chapters/ChapterData.js';

/**
 * Per-chapter script.
 *
 * `open` and `close` each give captions and a mood. The camera paths are
 * shared, because what makes these read as different chapters is the room
 * they are shot in and what is said over them — not a different dolly move.
 */
const SCRIPT = {
  1: {
    open: {
      mood: 'unease',
      lines: [
        [2.6, 'The chain on the front doors had been cut. From the inside.'],
        [8.2, 'Ten years of dust, and one set of footprints through it.'],
        [14.0, 'Small ones.'],
      ],
    },
    close: {
      lines: [
        [1.2, 'The stage door gives. Behind it, the smell of sawdust and hot varnish.'],
        [6.4, 'Something in the dark above the catwalk stopped moving when I did.'],
      ],
    },
  },
  2: {
    open: {
      mood: 'unease',
      lines: [
        [2.6, 'Forty-one bodies on the racks, and not one of them finished.'],
        [8.2, 'The kiln is warm. Nobody has paid this building’s electricity since 1986.'],
        [14.0, 'So something else is keeping it lit.'],
      ],
    },
    close: {
      lines: [
        [1.2, 'The firing finished. Whatever was inside the kiln is not in there now.'],
        [6.4, 'Down the corridor, through two walls, somebody is singing.'],
      ],
    },
  },
  3: {
    open: {
      mood: 'tension',
      lines: [
        [2.6, 'Rehearsal room four. The chairs are set out in a half circle, facing the door.'],
        [8.2, 'They have had ten years to learn the song.'],
        [14.0, 'They are note-perfect now.'],
      ],
    },
    close: {
      lines: [
        [1.2, 'The singing stops. All of it, at once, mid-word.'],
        [6.4, 'The stairs to the basement are already open. They were not, an hour ago.'],
      ],
    },
  },
  4: {
    open: {
      mood: 'tension',
      lines: [
        [2.6, 'Water to the knee, and it is not cold.'],
        [8.2, 'Odile built her workshop below the water table on purpose.'],
      ],
    },
    close: {
      lines: [[1.2, 'The Threadworks goes quiet. Above me, the house lights come up.']],
    },
  },
  5: {
    open: {
      mood: 'tension',
      lines: [
        [2.6, 'Forty-three performers, and the house is full.'],
        [8.2, 'There is one seat left in the wings. It has my name on the back of it.'],
      ],
    },
    close: {
      lines: [[1.2, 'Curtain.']],
    },
  },
};

/** Fallback for a chapter with no script written yet. */
const DEFAULT_SCRIPT = {
  open: { mood: 'unease', lines: [] },
  close: { lines: [] },
};

/**
 * Turn an offset written in "spawn space" (x = right, y = up, z = forward)
 * into a world position.
 *
 * spawnYaw is the yaw the player starts at, and the player's forward is -Z
 * rotated by that yaw — the same convention PlayerController uses — so a
 * positive `forward` here is genuinely in front of them.
 */
function place(spawn, yaw, [right, up, forward]) {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // forward = (-sin, 0, -cos); right = (cos, 0, -sin)
  return [
    spawn.x + right * cos + forward * -sin,
    spawn.y + up,
    spawn.z + right * -sin + forward * -cos,
  ];
}

/**
 * How far a camera can actually travel from `from` along `dir` before it is
 * inside something.
 *
 * Camera moves in these openings and endings are written as offsets — "three
 * metres up and four back" — and a chapter that starts the player against a
 * wall, or ends them in a stairwell, will happily put that camera inside the
 * geometry. The result is a shot of the inside of a wall, or worse, a shot
 * through it of the level's unlit back faces.
 *
 * So every offset is cast first and clipped to what is actually clear, with a
 * margin so the near plane does not graze the surface either.
 */
const _ray = new THREE.Raycaster();

function clearDistance(scene, from, dir, want, margin = 0.45) {
  _ray.set(from, dir.clone().normalize());
  _ray.far = want + margin;

  const hits = _ray.intersectObjects(scene.children, true);
  for (const hit of hits) {
    // Ignore things that are not solid: glows, threads, lens-only markers and
    // anything currently hidden.
    if (!hit.object.visible) continue;
    if (hit.object.userData?.lensOnly || hit.object.userData?.maskOnly) continue;
    if (hit.object.material?.transparent && (hit.object.material.opacity ?? 1) < 0.6) continue;
    return Math.max(0, hit.distance - margin);
  }
  return want;
}

/** Offset `from` by `dir * want`, clipped to whatever is clear. */
function clearOffset(scene, from, dir, want) {
  const d = clearDistance(scene, from, dir, want);
  return from.clone().addScaledVector(dir.clone().normalize(), d);
}

/**
 * A temporary key light for a cinematic.
 *
 * Chapters are lit for a player carrying a torch, and during a cinematic the
 * torch is not being carried — so without this every opening would be a
 * beautifully composed shot of total darkness. The fill is deliberately cold
 * and weak: it is there to make shapes legible, not to light the room. It
 * fades out as the shot lands so the last second of the cinematic is already
 * lit exactly the way gameplay will be.
 */
function addCinemaFill(scene, at, { colour = 0x8fa8d0, strength = 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'cinematic-fill';

  const hemi = new THREE.HemisphereLight(colour, 0x101018, 0.55 * strength);
  group.add(hemi);

  const key = new THREE.DirectionalLight(colour, 0.9 * strength);
  key.position.set(at.x - 6, at.y + 9, at.z - 5);
  key.target.position.copy(at);
  group.add(key, key.target);

  scene.add(group);

  return {
    group,
    /** @param {number} k 0..1 */
    setStrength(k) {
      hemi.intensity = 0.55 * strength * k;
      key.intensity = 0.9 * strength * k;
    },
    remove() { scene.remove(group); },
  };
}

/**
 * The chapter opening: a slow descent that ends exactly at the player's eye.
 *
 * The last keyframe is the gameplay camera pose, so the cinematic does not cut
 * to gameplay — it arrives at it. The player never sees the camera jump, which
 * is the whole difference between an opening shot and a loading screen with a
 * camera on it.
 */
export function buildChapterOpening({ engine, input, audio, music, level, player, chapterId }) {
  const ch = getChapter(chapterId);
  const script = SCRIPT[chapterId] ?? DEFAULT_SCRIPT;
  const spawn = level.spawn.clone();
  const yaw = level.spawnYaw ?? 0;

  // The eye the player will actually be looking through a moment from now.
  // `player.eyePosition` returns a scratch vector, so it is copied rather
  // than held — the next caller will overwrite it.
  const eye = player ? new THREE.Vector3().copy(player.eyePosition) : spawn.clone();
  const eyePos = [eye.x, eye.y, eye.z];
  const eyeLook = place(spawn, yaw, [0, 0.0, 9]);

  const DURATION = 19;

  // Each authored pose is clipped back toward the player until it is in clear
  // air, so a chapter that spawns the player in a corridor gets a tighter
  // version of the same move rather than a camera embedded in the ceiling.
  const clipped = (offset) => {
    const target = new THREE.Vector3(...place(spawn, yaw, offset));
    const dir = target.clone().sub(eye);
    const want = dir.length();
    if (want < 0.01) return [eye.x, eye.y, eye.z];
    const p = clearOffset(level.scene, eye, dir, want);
    return [p.x, p.y, p.z];
  };

  const shots = [
    // High and behind, looking down at where the player is standing.
    { t: 0,    pos: clipped([-1.4, 3.1, -3.4]), look: place(spawn, yaw, [0, 0.4, 1.2]), fov: 40, ease: 'creep', shake: 0.25 },
    // Drift around and forward, the room opening up ahead.
    { t: 6.5,  pos: clipped([1.5, 2.2, -0.8]),  look: place(spawn, yaw, [0, 0.9, 5.0]), fov: 46, ease: 'inOut', shake: 0.35 },
    // Down toward standing height, still ahead of the player.
    { t: 12.5, pos: clipped([0.55, 1.55, 0.6]), look: place(spawn, yaw, [0, 1.2, 7.0]), fov: 50, ease: 'inOut', shake: 0.45 },
    // Settle onto the gameplay camera.
    { t: 17.5, pos: eyePos, look: eyeLook, fov: 52, ease: 'out', shake: 0.5 },
    { t: 19,   pos: eyePos, look: eyeLook, fov: 52, ease: 'linear', shake: 0.5 },
  ];

  const beats = [
    { t: 0,   fade: 1 },
    { t: 0.6, fade: 0 },
    { t: 0.9, title: `Chapter ${chapterId}`, subtitle: ch?.title ?? '' },
    { t: 5.5, onFire: (c) => c.showTitle('') },
    ...script.open.lines.map(([t, text]) => ({ t, caption: text, captionFor: 5.2 })),
    { t: 1.0, onFire: () => music?.setMood?.(script.open.mood ?? 'unease') },
  ];

  const cine = new Cinematic({
    engine, scene: level.scene, shots, beats,
    duration: DURATION, input, audio,
    letterbox: true, skippable: true,
    onUpdate: (dt, t) => {
      // Hold full fill for the first two thirds, then hand the room back to
      // its own lighting before the shot reaches the player's eye.
      const k = t < DURATION * 0.62
        ? 1
        : Math.max(0, 1 - (t - DURATION * 0.62) / (DURATION * 0.3));
      fill.setStrength(k);
    },
  });

  const fill = addCinemaFill(level.scene, spawn);
  cine.on('finished', () => fill.remove());

  return cine;
}

/**
 * The chapter close: pull up and away from where the player is standing, and
 * take the light with you.
 *
 * Unlike the opening this starts at the live camera pose, so the handover out
 * of gameplay is as seamless as the handover into it.
 */
export function buildChapterEnding({ engine, input, audio, music, level, player, chapterId }) {
  const script = SCRIPT[chapterId] ?? DEFAULT_SCRIPT;

  const cam = engine.camera;
  const from = [cam.position.x, cam.position.y, cam.position.z];

  // Where the camera is currently looking, projected a few metres out, so the
  // first keyframe reproduces the player's exact view.
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const at = cam.position.clone().addScaledVector(dir, 8);
  const atArr = [at.x, at.y, at.z];

  // Rise and drift back, keeping the same point in frame — the shot the
  // credits of every chapter want. Clipped, because a chapter can end
  // anywhere, including with the player's back to a wall.
  const back = new THREE.Vector3(-dir.x, 0, -dir.z).normalize();
  const retreat = new THREE.Vector3(back.x, 0.62, back.z).normalize();
  const reach = clearDistance(level.scene, cam.position, retreat, 5.8);

  const at1 = cam.position.clone().addScaledVector(retreat, Math.min(reach, 2.1));
  const at2 = cam.position.clone().addScaledVector(retreat, reach);

  const up1 = [at1.x, at1.y, at1.z];
  const up2 = [at2.x, at2.y, at2.z];

  const DURATION = 12;

  const shots = [
    { t: 0,    pos: from, look: atArr, fov: 52, ease: 'creep', shake: 0.4 },
    { t: 5,    pos: up1,  look: atArr, fov: 48, ease: 'inOut', shake: 0.3 },
    { t: 10.5, pos: up2,  look: atArr, fov: 42, ease: 'inOut', shake: 0.18 },
    { t: 12,   pos: up2,  look: atArr, fov: 42, ease: 'linear', shake: 0.18 },
  ];

  const beats = [
    { t: 0,    onFire: () => music?.setMood?.('unease') },
    ...script.close.lines.map(([t, text]) => ({ t, caption: text, captionFor: 5.4 })),
    { t: 9.0,  onFire: () => music?.setMood?.('silent') },
    { t: 10.0, fade: 1 },
  ];

  const cine = new Cinematic({
    engine, scene: level.scene, shots, beats,
    duration: DURATION, input, audio,
    letterbox: true, skippable: true,
    onUpdate: (dt, t) => {
      // The reverse of the opening: gameplay lighting for the first beat, then
      // the fill comes up as the camera leaves the player behind.
      fill.setStrength(Math.min(1, Math.max(0, (t - 1.2) / 3.5)));
    },
  });

  const fill = addCinemaFill(level.scene, cam.position.clone(), { strength: 1.3 });
  fill.setStrength(0);
  cine.on('finished', () => fill.remove());

  return cine;
}
