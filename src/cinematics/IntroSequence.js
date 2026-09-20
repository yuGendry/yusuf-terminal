/**
 * IntroSequence.js — the opening.
 *
 * Forty-eight seconds in a car. The camera never leaves the cabin, because
 * the one thing an opening has to establish is not the factory, it is that
 * you are a person arriving somewhere alone at night — and you can only feel
 * that from inside the car, not from a drone shot of it.
 *
 * The cut is built around the passenger seat. Road, photograph, road, dials,
 * road, and then the building. By the time the factory arrives the audience
 * has already been told who is in the car and why, so the silhouette is
 * allowed to land without a word over it.
 */

import { Cinematic } from './Cinematic.js';
import { buildIntroDrive } from './IntroDrive.js';

/**
 * Driver's eye. Everything else is framed relative to this.
 *
 * Sat lower than a real driver's head, and shot wide. A 44° lens from a
 * realistic eye height puts the wheel and the dashboard about ten degrees
 * below the bottom of the frame, so the "in a car" shot becomes a shot of a
 * road with no car around it. Every driving game solves this the same way:
 * drop the eye, widen the lens, and let the interior into the corners.
 */
const EYE = [-0.36, 1.14, 0.18];

export function buildIntroSequence({ engine, input, audio, music, onFinish }) {
  const drive = buildIntroDrive({ engine, audio });
  const { photo } = drive.props;

  const DURATION = 48;

  const shots = [
    // 1. Black, then the road. A long hold — the player has just pressed New
    //    Game and needs a moment to settle before anything is asked of them.
    { t: 0,  pos: EYE, look: [0, 0.34, -20], fov: 62, ease: 'linear', shake: 0.4 },
    { t: 7,  pos: [-0.33, 1.13, 0.2], look: [0.45, 0.32, -18], fov: 60, ease: 'inOut', shake: 0.4 },

    // 2. Down and across to the passenger seat. The second pose comes in at
    //    about forty-five degrees: straight down reads as an inventory icon,
    //    and from seat height the photograph is edge-on and unreadable.
    { t: 12, pos: [0.14, 1.04, 0.3], look: [photo.position.x, 0.57, photo.position.z], fov: 50, ease: 'inOut', shake: 0.3 },
    { t: 18, pos: [0.3, 0.86, 0.32], look: [photo.position.x, 0.57, photo.position.z], fov: 42, ease: 'creep', shake: 0.25 },

    // 3. Back up to the windscreen.
    { t: 24, pos: [-0.3, 1.13, 0.16], look: [0, 0.34, -20], fov: 60, ease: 'inOut', shake: 0.45 },

    // 4. A glance at the instruments — the one beat that says 1996 out loud.
    //    Held across two keyframes so the shot actually sits there instead of
    //    passing through the pose on its way somewhere else.
    { t: 28, pos: [-0.42, 1.1, -0.04], look: [-0.34, 0.8, -0.46], fov: 42, ease: 'inOut', shake: 0.3 },
    { t: 31, pos: [-0.4, 1.08, -0.08], look: [-0.3, 0.79, -0.46], fov: 40, ease: 'linear', shake: 0.3 },

    // 5. Up, and the building is there. The camera leans in toward the glass:
    //    the windscreen header cuts off everything above about twelve degrees
    //    from a seated position, so the only way to see the top of a
    //    seventy-foot building through it is to duck forward, which is what
    //    anyone would actually do.
    { t: 34, pos: [-0.36, 1.12, -0.06], look: [1.6, 2.4, -34], fov: 62, ease: 'out', shake: 0.5 },
    { t: 41, pos: [-0.34, 1.01, -0.4], look: [2.6, 9.5, -40], fov: 64, ease: 'inOut', shake: 0.35 },

    // 6. Stopped at the gate. The engine is off and nothing moves.
    { t: 46, pos: [-0.35, 1.05, -0.34], look: [2.2, 7.0, -38], fov: 60, ease: 'inOut', shake: 0.1 },
    { t: 48, pos: [-0.35, 1.05, -0.34], look: [2.2, 7.0, -38], fov: 60, ease: 'linear', shake: 0.1 },
  ];

  const beats = [
    { t: 0.0,  fade: 1 },
    { t: 0.8,  fade: 0 },

    { t: 2.0,  title: 'STITCHWORK', subtitle: 'Hollowhart Puppet Works · November 1996' },
    { t: 8.0,  onFire: (c) => c.showTitle('') },

    { t: 4.5,  caption: 'The last letter Wren sent was postmarked here.', captionFor: 4.2 },
    { t: 10.0, caption: 'Six weeks ago. Nobody has worked at this place since 1986.', captionFor: 4.6 },

    { t: 15.0, caption: 'She was eleven in this one. I was supposed to be watching her then, too.', captionFor: 5.2 },

    { t: 25.5, caption: 'Radio went out forty miles back. Just the rain since.', captionFor: 4.0 },

    { t: 35.0, caption: 'There it is.', captionFor: 2.6 },
    { t: 40.0, caption: 'One window lit, on the fourth floor. Somebody is paying that bill.', captionFor: 5.0 },

    // The engine dies with the picture.
    { t: 45.5, onFire: () => music?.setMood?.('unease') },
    { t: 46.6, fade: 1 },
  ];

  const cine = new Cinematic({
    engine,
    scene: drive.scene,
    shots,
    beats,
    duration: DURATION,
    input,
    audio,
    letterbox: true,
    skippable: true,
    onUpdate: (dt, t) => drive.update(dt, t),
  });

  cine.on('finished', () => {
    // Whether it was watched or skipped, the car has arrived: run the world
    // forward to its end state so nothing downstream can see a half-driven car.
    drive.state.distance = 880;
    drive.state.speed = 0;
    drive.state.approach = 1;
    drive.state.arrived = true;
    onFinish?.();
  });

  cine.on('skipped', () => engine.postfx.setFade(1));

  const origDispose = cine.dispose.bind(cine);
  cine.dispose = () => { origDispose(); drive.dispose(); };

  return cine;
}
