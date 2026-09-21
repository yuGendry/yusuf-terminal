/**
 * Puppet.js — procedural marionette construction.
 *
 * Everything in Hollowhart is a puppet of some kind, so this builds one from
 * primitives with a real joint hierarchy that animation and IK can drive. The
 * same builder produces the menu marionette, the shop-window dolls and (scaled
 * up, with different proportions) Mister Tangle himself.
 *
 * Returned object exposes named joints so callers can pose it directly:
 *   puppet.joints.head.rotation.y = 0.4;
 */

import * as THREE from 'three';
import { material } from './Materials.js';
import { clamp, lerp, randRange, makeRng } from '../util/MathUtil.js';

/** Proportion sets. Lengths are in metres for a 1.0-scale puppet. */
export const PUPPET_PRESETS = {
  /** Doll-like, big head, short limbs — the theatre marionette. */
  marionette: {
    headRadius: 0.115,
    neckLength: 0.05,
    torsoHeight: 0.30,
    torsoWidth: 0.20,
    torsoDepth: 0.12,
    pelvisHeight: 0.10,
    upperArm: 0.17,
    lowerArm: 0.16,
    upperLeg: 0.22,
    lowerLeg: 0.21,
    limbRadius: 0.030,
    jointRadius: 0.038,
    handSize: 0.052,
    footLength: 0.11,
  },
  /** Stretched, spider-like — Mister Tangle. Scale this to ~3m tall. */
  ringmaster: {
    headRadius: 0.105,
    neckLength: 0.14,
    torsoHeight: 0.34,
    torsoWidth: 0.19,
    torsoDepth: 0.11,
    pelvisHeight: 0.09,
    upperArm: 0.34,
    lowerArm: 0.38,
    upperLeg: 0.40,
    lowerLeg: 0.44,
    limbRadius: 0.022,
    jointRadius: 0.031,
    handSize: 0.070,
    footLength: 0.15,
  },
  /** Small, round, uniform — a Choir doll. */
  choir: {
    headRadius: 0.10,
    neckLength: 0.02,
    torsoHeight: 0.17,
    torsoWidth: 0.16,
    torsoDepth: 0.11,
    pelvisHeight: 0.06,
    upperArm: 0.10,
    lowerArm: 0.09,
    upperLeg: 0.11,
    lowerLeg: 0.10,
    limbRadius: 0.028,
    jointRadius: 0.032,
    handSize: 0.042,
    footLength: 0.08,
  },
};

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Build a limb segment pointing down its parent's -Y axis, with a ball joint
 * at the top. Returns the pivot; the mesh hangs below it so rotating the pivot
 * swings the limb the way a real joint would.
 */
function makeSegment(length, radius, jointRadius, mats, { tapered = false } = {}) {
  const pivot = new THREE.Group();

  const joint = new THREE.Mesh(
    new THREE.SphereGeometry(jointRadius, 12, 10),
    mats.joint
  );
  joint.castShadow = true;
  pivot.add(joint);

  const geo = tapered
    ? new THREE.CylinderGeometry(radius * 0.72, radius, length, 10, 1)
    : new THREE.CylinderGeometry(radius, radius, length, 10, 1);
  const limb = new THREE.Mesh(geo, mats.limb);
  limb.position.y = -length / 2;
  limb.castShadow = true;
  limb.receiveShadow = true;
  pivot.add(limb);

  // The "end" marker is where the next segment attaches.
  const end = new THREE.Group();
  end.position.y = -length;
  pivot.add(end);
  pivot.userData.end = end;

  return pivot;
}

/**
 * Build a complete marionette.
 *
 * @param {object} options
 * @param {string} options.preset       key of PUPPET_PRESETS
 * @param {number} options.scale        overall size multiplier
 * @param {boolean} options.strings     draw the control strings and bar
 * @param {number} options.stringHeight how far above the head the bar hangs
 */
export function buildPuppet({
  preset = 'marionette',
  scale = 1,
  strings = true,
  stringHeight = 2.2,
  faceStyle = 'smile',
  clothColor = 0x3a1f26,
  /**
   * 0..1. How badly the porcelain has gone.
   *
   * Drives crack density, how far off true the features sit, and how much of
   * the paint has chipped away. A doll in a shop window gets a little; one
   * that has been hanging in a flooded basement for ten years gets most of it.
   */
  damage = 0.45,
  /** Deterministic, so the same doll is the same doll every time it loads. */
  seed = 1,
} = {}) {
  const P = PUPPET_PRESETS[preset] ?? PUPPET_PRESETS.marionette;
  const rng = makeRng(seed * 7919 + 13);

  const root = new THREE.Group();
  root.name = `puppet:${preset}`;
  root.scale.setScalar(scale);

  const mats = {
    // Lighter than the set dressing on purpose: a puppet has to hold its
    // silhouette in a room lit by one weak practical.
    limb: material('paintedWood', { color: 0x8a6d4f }),
    joint: material('porcelain'),
    cloth: material('feltDark', { color: clothColor }),
    face: material('porcelain'),
    dark: material('feltDark'),
  };

  const joints = {};

  // ---- pelvis (the root of the body) --------------------------------------
  const pelvis = new THREE.Group();
  pelvis.position.y = P.upperLeg + P.lowerLeg + P.footLength * 0.25;
  root.add(pelvis);
  joints.pelvis = pelvis;

  const pelvisMesh = new THREE.Mesh(
    new THREE.BoxGeometry(P.torsoWidth * 0.86, P.pelvisHeight, P.torsoDepth),
    mats.cloth
  );
  pelvisMesh.castShadow = true;
  pelvis.add(pelvisMesh);

  // ---- torso ---------------------------------------------------------------
  // A separate spine pivot lets the whole upper body sway independently, which
  // is most of what makes a hanging puppet read as "suspended".
  const spine = new THREE.Group();
  spine.position.y = P.pelvisHeight / 2;
  pelvis.add(spine);
  joints.spine = spine;

  const torsoMesh = new THREE.Mesh(
    new THREE.BoxGeometry(P.torsoWidth, P.torsoHeight, P.torsoDepth),
    mats.cloth
  );
  torsoMesh.position.y = P.torsoHeight / 2;
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  spine.add(torsoMesh);

  // Collar / ruff — a thin flared cone, the one flourish that says "theatre".
  const ruff = new THREE.Mesh(
    new THREE.ConeGeometry(P.torsoWidth * 0.62, P.neckLength * 1.6, 14, 1, true),
    material('curtain')
  );
  ruff.position.y = P.torsoHeight + P.neckLength * 0.2;
  ruff.rotation.x = Math.PI;
  ruff.castShadow = true;
  spine.add(ruff);

  // ---- neck + head ---------------------------------------------------------
  const neck = new THREE.Group();
  neck.position.y = P.torsoHeight;
  spine.add(neck);
  joints.neck = neck;

  const neckMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(P.limbRadius * 0.9, P.limbRadius, P.neckLength, 8),
    mats.limb
  );
  neckMesh.position.y = P.neckLength / 2;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.y = P.neckLength + P.headRadius * 0.82;
  neck.add(head);
  joints.head = head;

  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(P.headRadius, 20, 16),
    mats.face
  );
  // Slightly squashed and pushed forward: a perfect sphere reads as a ball,
  // not a face.
  skull.scale.set(1, 1.08, 0.94);
  skull.castShadow = true;
  skull.receiveShadow = true;
  head.add(skull);

  addFace(head, P, faceStyle, mats, { damage, rng });

  // ---- arms ---------------------------------------------------------------
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'L' : 'R';

    const shoulder = makeSegment(P.upperArm, P.limbRadius, P.jointRadius, mats, { tapered: true });
    shoulder.position.set(side * P.torsoWidth * 0.55, P.torsoHeight * 0.92, 0);
    spine.add(shoulder);
    joints[`shoulder${name}`] = shoulder;

    const elbow = makeSegment(P.lowerArm, P.limbRadius * 0.88, P.jointRadius * 0.82, mats, { tapered: true });
    shoulder.userData.end.add(elbow);
    joints[`elbow${name}`] = elbow;

    // Hand: a flattened box with four stubby carved fingers.
    const hand = new THREE.Group();
    elbow.userData.end.add(hand);
    joints[`hand${name}`] = hand;

    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(P.handSize * 0.8, P.handSize, P.handSize * 0.34),
      mats.limb
    );
    palm.position.y = -P.handSize / 2;
    palm.castShadow = true;
    hand.add(palm);

    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(
        new THREE.CylinderGeometry(P.handSize * 0.07, P.handSize * 0.06, P.handSize * 0.62, 5),
        mats.limb
      );
      finger.position.set(
        (f - 1.5) * P.handSize * 0.2,
        -P.handSize - P.handSize * 0.28,
        0
      );
      finger.castShadow = true;
      hand.add(finger);
    }
  }

  // ---- legs ---------------------------------------------------------------
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'L' : 'R';

    const hip = makeSegment(P.upperLeg, P.limbRadius * 1.1, P.jointRadius, mats, { tapered: true });
    hip.position.set(side * P.torsoWidth * 0.26, -P.pelvisHeight / 2, 0);
    pelvis.add(hip);
    joints[`hip${name}`] = hip;

    const knee = makeSegment(P.lowerLeg, P.limbRadius, P.jointRadius * 0.85, mats, { tapered: true });
    hip.userData.end.add(knee);
    joints[`knee${name}`] = knee;

    const foot = new THREE.Group();
    knee.userData.end.add(foot);
    joints[`foot${name}`] = foot;

    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(P.limbRadius * 2.1, P.footLength * 0.42, P.footLength),
      mats.dark
    );
    shoe.position.set(0, -P.footLength * 0.2, P.footLength * 0.26);
    shoe.castShadow = true;
    foot.add(shoe);
  }

  // ---- control bar and strings --------------------------------------------
  let stringSystem = null;
  if (strings) {
    stringSystem = addStrings(root, joints, P, stringHeight);
  }

  root.userData.puppet = { joints, preset: P, stringSystem };

  const _gazeTmp = new THREE.Vector3();
  const _gazeLocal = new THREE.Vector3();

  return {
    root,
    joints,
    proportions: P,
    stringSystem,

    /**
     * Point the eyes at a world position.
     *
     * The single cheapest frightening thing a doll can do. Only the eyes turn
     * — the head does not — because a head that tracks you reads as a
     * character looking at you, and eyes that track you inside a face that
     * does not reads as something wearing the face.
     *
     * The rotation is clamped: an eye that can swivel all the way round is
     * comic. Past the limit it simply stares ahead, which is worse.
     *
     * @param {THREE.Vector3} target
     * @param {number} [amount] 0..1, how much of the way to look
     */
    gaze(target, amount = 1) {
      const eyes = joints.head?.userData?.eyes;
      if (!eyes?.length || !target) return;

      const LIMIT = 0.42;   // radians, about 24 degrees
      for (const eye of eyes) {
        eye.getWorldPosition(_gazeTmp);
        _gazeLocal.copy(target).sub(_gazeTmp);
        // Into the eye's parent space, so the clamp is about the socket.
        eye.parent.worldToLocal(_gazeLocal.add(_gazeTmp));
        _gazeLocal.sub(eye.position);

        const yaw = Math.atan2(_gazeLocal.x, -_gazeLocal.z);
        const pitch = Math.atan2(_gazeLocal.y, Math.hypot(_gazeLocal.x, _gazeLocal.z));

        eye.rotation.y = clamp(yaw, -LIMIT, LIMIT) * amount;
        eye.rotation.x = clamp(-pitch, -LIMIT * 0.7, LIMIT * 0.7) * amount;
      }
    },

    /** Drop the jaw. 0 is shut, 1 is as wide as the hinge goes. */
    setJaw(open) {
      const jaw = joints.head?.userData?.jaw;
      if (jaw) jaw.rotation.x = clamp(open, 0, 1) * 0.55;
    },

    /** Convenience: total standing height in world units. */
    height:
      (P.upperLeg + P.lowerLeg + P.pelvisHeight + P.torsoHeight + P.neckLength + P.headRadius * 2) * scale,
  };
}

/**
 * Faces are painted with geometry rather than textures so they read clearly at
 * any distance and can be lit dramatically from below.
 */
function addFace(head, P, style, mats, { damage = 0.45, rng = Math.random } = {}) {
  const r = P.headRadius;
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x090707, roughness: 0.14, metalness: 0,
  });

  /** Where the eyes live, exposed so they can be made to follow the player. */
  const eyes = [];

  for (const side of [-1, 1]) {
    // ASYMMETRY.
    //
    // A face whose two halves match reads as a toy. The same face with one eye
    // four millimetres lower and a per-cent bigger reads as wrong, and the
    // viewer cannot say why — which is the entire effect being aimed for here.
    // It scales with damage because a cracked head is a warped head.
    const drop = side < 0 ? 0 : -r * 0.075 * damage;
    const swell = side < 0 ? 1 : 1 + 0.1 * damage;
    const splay = side * r * (0.36 + 0.03 * damage * (side < 0 ? -1 : 1));

    // Recessed socket, then the eye inside it. The recess is what makes the
    // eyes read as sunken and dead rather than as painted dots.
    const socket = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.27 * swell, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x120d0a, roughness: 0.95 })
    );
    socket.position.set(splay, r * 0.12 + drop, -r * 0.78);
    socket.scale.set(1, 0.84, 0.62);
    head.add(socket);

    // The eye is on its own pivot so it can turn in the socket.
    const pivot = new THREE.Group();
    pivot.position.set(splay, r * 0.12 + drop, -r * 0.80);
    head.add(pivot);
    eyes.push(pivot);

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.16 * swell, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.22 })
    );
    pivot.add(ball);

    // A pale iris ring around a black pupil. Without the ring the eye is a
    // hole; with it, it is an eye, and an eye can be looking at you.
    const iris = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.095 * swell, 16),
      new THREE.MeshStandardMaterial({
        color: 0x5d6b63, roughness: 0.3, emissive: 0x11160f, emissiveIntensity: 0.4,
      })
    );
    iris.position.z = -r * 0.155 * swell;
    pivot.add(iris);

    const pupil = new THREE.Mesh(new THREE.CircleGeometry(r * 0.05 * swell, 14), eyeMat);
    pupil.position.z = -r * 0.162 * swell;
    pivot.add(pupil);

    // A specular bead. Catching a highlight is what makes a dead eye look
    // like it might be watching.
    const glint = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.032, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    glint.position.set(-r * 0.05 * side, r * 0.05, -r * 0.17);
    pivot.add(glint);

    // Rosy circle on each cheek — the "cute" that curdles under bad lighting.
    const cheek = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.2, 14),
      new THREE.MeshStandardMaterial({
        color: 0xa2453f, roughness: 0.75, transparent: true,
        opacity: 0.55 * (1 - damage * 0.5),
      })
    );
    cheek.position.set(side * r * 0.52, -r * 0.22 + drop, -r * 0.80);
    cheek.rotation.y = side * 0.5;
    cheek.lookAt(side * r * 2, -r * 0.22, -r * 4);
    head.add(cheek);
  }

  head.userData.eyes = eyes;

  // Hinged jaw. Kept as a joint so it can drop open.
  const jaw = new THREE.Group();
  jaw.position.set(0, -r * 0.34, -r * 0.2);
  head.add(jaw);
  head.userData.jaw = jaw;

  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x0c0605, roughness: 0.97 });

  if (style === 'smile') {
    // A carved grin: a shallow torus arc cut into the lower face.
    const grin = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.34, r * 0.035, 8, 20, Math.PI),
      mouthMat
    );
    grin.rotation.set(Math.PI, 0, Math.PI);
    grin.position.set(0, -r * 0.05, -r * 0.72);
    jaw.add(grin);

    // Teeth behind the grin. Two millimetres of them, barely visible until a
    // torch catches the face — which is exactly when it matters.
    for (let i = 0; i < 9; i++) {
      const t = (i / 8 - 0.5) * 2;
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(r * 0.05, r * 0.07, r * 0.03),
        new THREE.MeshStandardMaterial({ color: 0xcfc4ac, roughness: 0.45 })
      );
      tooth.position.set(t * r * 0.3, -r * 0.02 - Math.abs(t) * r * 0.05, -r * 0.7);
      tooth.rotation.z = t * 0.3;
      jaw.add(tooth);
    }
  } else if (style === 'open') {
    const hole = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.3, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mouthMat
    );
    hole.position.set(0, -r * 0.08, -r * 0.64);
    hole.rotation.x = -Math.PI / 2;
    hole.scale.set(1, 1.25, 0.65);
    jaw.add(hole);

    // A ring of small pegs around the opening. A mouth with nothing in it is
    // a hole; a mouth with teeth in it is a mouth.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tooth = new THREE.Mesh(
        new THREE.ConeGeometry(r * 0.028, r * 0.09, 5),
        new THREE.MeshStandardMaterial({ color: 0xc8bda4, roughness: 0.5 })
      );
      tooth.position.set(
        Math.cos(a) * r * 0.22,
        -r * 0.08 + Math.sin(a) * r * 0.22 * 0.8,
        -r * 0.72
      );
      tooth.rotation.x = Math.PI / 2;
      tooth.rotation.z = a;
      jaw.add(tooth);
    }
  } else {
    // 'stitched' — the Understudy and the Choir wear this.
    for (let i = 0; i < 7; i++) {
      const t = (i / 6 - 0.5) * 2;
      const stitch = new THREE.Mesh(
        new THREE.BoxGeometry(r * 0.02, r * 0.16, r * 0.02),
        mouthMat
      );
      stitch.position.set(t * r * 0.34, -r * 0.06 - Math.abs(t) * r * 0.05, -r * 0.76);
      stitch.rotation.z = t * 0.35 + (rng() - 0.5) * 0.3 * damage;
      jaw.add(stitch);
    }
    // The seam the stitches are holding shut.
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(r * 0.7, r * 0.022, r * 0.02),
      mouthMat
    );
    seam.position.set(0, -r * 0.06, -r * 0.78);
    jaw.add(seam);
  }

  // Nose: a small cone, which catches light and gives the face a readable
  // profile. Knocked off centre by damage, because they always are.
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(r * 0.1, r * 0.22, 8),
    mats.face
  );
  nose.position.set(r * 0.03 * damage, -r * 0.03, -r * 0.92);
  nose.rotation.x = -Math.PI / 2;
  nose.rotation.z = (rng() - 0.5) * 0.4 * damage;
  head.add(nose);

  addCrazing(head, r, damage, rng, mouthMat);
}

/**
 * Crazing — the web of fine cracks that runs through old glazed porcelain.
 *
 * Built as thin boxes laid on the surface of the skull rather than as a
 * texture, because the head is barely a hundred triangles and a normal map on
 * it would be read as noise. Cracks that follow the curve catch the torch
 * edge-on and disappear when the light moves, which is exactly how they behave
 * on a real doll and is most of why they are unsettling.
 *
 * One long crack is always drawn down from the crown, whatever the damage: a
 * face with no history is a toy, and this is the cheapest possible history.
 */
function addCrazing(head, r, damage, rng, darkMat) {
  const count = Math.round(3 + damage * 14);
  const crackMat = new THREE.MeshStandardMaterial({
    color: 0x2a211b, roughness: 1, metalness: 0,
  });

  const place = (theta, phi, length, width, tilt) => {
    // Spherical position on the skull, then oriented to lie along the surface.
    const x = Math.sin(phi) * Math.sin(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.cos(theta);

    const crack = new THREE.Mesh(
      new THREE.BoxGeometry(width, length, width * 0.5),
      crackMat
    );
    crack.position.set(x * r * 1.005, y * r * 1.005, z * r * 1.005);
    crack.lookAt(0, 0, 0);
    crack.rotateZ(tilt);
    head.add(crack);
    return crack;
  };

  // The main fracture: crown to brow, in four jointed segments so it wanders.
  let theta = Math.PI + (rng() - 0.5) * 0.7;
  let phi = 0.25;
  for (let i = 0; i < 4; i++) {
    place(theta, phi, r * 0.34, r * 0.017, (rng() - 0.5) * 0.9);
    phi += 0.28;
    theta += (rng() - 0.5) * 0.45;
  }

  // And the crazing around it.
  for (let i = 0; i < count; i++) {
    place(
      rng() * Math.PI * 2,
      0.25 + rng() * 2.2,
      r * (0.1 + rng() * 0.26),
      r * (0.008 + rng() * 0.008),
      rng() * Math.PI
    );
  }

  // Chips: shallow dark discs where the glaze has come away entirely.
  const chips = Math.round(damage * 5);
  for (let i = 0; i < chips; i++) {
    const t = rng() * Math.PI * 2;
    const p = 0.5 + rng() * 1.6;
    const chip = new THREE.Mesh(
      new THREE.CircleGeometry(r * (0.05 + rng() * 0.08), 8),
      darkMat
    );
    chip.position.set(
      Math.sin(p) * Math.sin(t) * r * 1.002,
      Math.cos(p) * r * 1.002,
      Math.sin(p) * Math.cos(t) * r * 1.002
    );
    chip.lookAt(0, 0, 0);
    chip.rotateY(Math.PI);
    head.add(chip);
  }
}

/**
 * The control bar and its strings. The strings are real line geometry that gets
 * re-pointed every frame, so they stay attached as the puppet moves — this is
 * what the Threadlight lens will later highlight.
 */
function addStrings(root, joints, P, stringHeight) {
  const bar = new THREE.Group();
  bar.position.y = stringHeight;
  root.add(bar);

  const barMat = material('paintedWood');
  const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.018, 0.018), barMat);
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.30), barMat);
  cross1.castShadow = true;
  cross2.castShadow = true;
  bar.add(cross1, cross2);

  // Each string runs from a point on the bar to a point on the body.
  const attachments = [
    { barOffset: new THREE.Vector3(-0.19, 0, 0), joint: joints.shoulderL, local: new THREE.Vector3(0, 0, 0) },
    { barOffset: new THREE.Vector3(0.19, 0, 0), joint: joints.shoulderR, local: new THREE.Vector3(0, 0, 0) },
    { barOffset: new THREE.Vector3(-0.06, 0, -0.13), joint: joints.head, local: new THREE.Vector3(-P.headRadius * 0.5, P.headRadius * 0.7, 0) },
    { barOffset: new THREE.Vector3(0.06, 0, -0.13), joint: joints.head, local: new THREE.Vector3(P.headRadius * 0.5, P.headRadius * 0.7, 0) },
    { barOffset: new THREE.Vector3(-0.1, 0, 0.13), joint: joints.handL, local: new THREE.Vector3(0, 0, 0) },
    { barOffset: new THREE.Vector3(0.1, 0, 0.13), joint: joints.handR, local: new THREE.Vector3(0, 0, 0) },
    { barOffset: new THREE.Vector3(-0.05, 0, 0.05), joint: joints.kneeL, local: new THREE.Vector3(0, 0, 0) },
    { barOffset: new THREE.Vector3(0.05, 0, 0.05), joint: joints.kneeR, local: new THREE.Vector3(0, 0, 0) },
  ];

  const positions = new Float32Array(attachments.length * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const lineMat = new THREE.LineBasicMaterial({
    color: 0x6a6252, transparent: true, opacity: 0.38,
  });
  const lines = new THREE.LineSegments(geo, lineMat);
  lines.frustumCulled = false;
  root.add(lines);

  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();

  /** Call once per frame after posing the puppet. */
  function update() {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();

    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];

      _a.copy(att.barOffset).applyMatrix4(bar.matrixWorld).applyMatrix4(inv);
      _b.copy(att.local).applyMatrix4(att.joint.matrixWorld).applyMatrix4(inv);

      positions[i * 6 + 0] = _a.x;
      positions[i * 6 + 1] = _a.y;
      positions[i * 6 + 2] = _a.z;
      positions[i * 6 + 3] = _b.x;
      positions[i * 6 + 4] = _b.y;
      positions[i * 6 + 5] = _b.z;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();
  }

  update();
  return { bar, lines, update, attachments, material: lineMat };
}

/**
 * Idle animation: the slow, sickening sway of something hanging from strings.
 * Layered sines at incommensurate frequencies so it never visibly loops.
 */
export function animateHang(puppet, time, { amount = 1, breathing = 0 } = {}) {
  const j = puppet.joints;
  const a = amount;

  j.pelvis.rotation.z = Math.sin(time * 0.37) * 0.035 * a;
  j.pelvis.rotation.x = Math.sin(time * 0.29 + 1.1) * 0.03 * a;
  j.pelvis.position.y +=
    (Math.sin(time * 0.61) * 0.004 * a) - (puppet._lastBob ?? 0);
  puppet._lastBob = Math.sin(time * 0.61) * 0.004 * a;

  j.spine.rotation.z = Math.sin(time * 0.43 + 0.6) * 0.05 * a;
  j.spine.rotation.x = Math.sin(time * 0.31 + 2.2) * 0.04 * a + breathing * 0.02;

  j.neck.rotation.z = Math.sin(time * 0.53 + 1.7) * 0.06 * a;

  for (const side of ['L', 'R']) {
    const phase = side === 'L' ? 0 : 1.9;
    // Splay the arms clear of the torso and hang them slightly forward.
    // At a narrower angle they sit flush against the body and the silhouette
    // loses them entirely, which reads as a limbless bundle rather than as a
    // puppet with arms.
    j[`shoulder${side}`].rotation.z = (side === 'L' ? 1 : -1) * (0.34 + Math.sin(time * 0.41 + phase) * 0.10 * a);
    j[`shoulder${side}`].rotation.x = 0.22 + Math.sin(time * 0.33 + phase) * 0.14 * a;
    j[`elbow${side}`].rotation.x = -0.42 + Math.sin(time * 0.47 + phase + 0.8) * 0.18 * a;

    j[`hip${side}`].rotation.x = Math.sin(time * 0.27 + phase * 1.3) * 0.07 * a;
    j[`knee${side}`].rotation.x = 0.1 + Math.sin(time * 0.39 + phase) * 0.06 * a;
  }

  puppet.stringSystem?.update();
}

/** Point the head at a world-space target, with a believable neck limit. */
export function lookAtTarget(puppet, worldTarget, weight = 1) {
  const head = puppet.joints.head;
  const parent = head.parent;
  parent.updateMatrixWorld(true);

  const local = parent.worldToLocal(worldTarget.clone());
  // The head model faces -Z.
  const yaw = Math.atan2(-local.x, -local.z);
  const pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));

  const maxYaw = 1.15;
  const maxPitch = 0.55;

  head.rotation.y = lerp(head.rotation.y, clamp(yaw, -maxYaw, maxYaw) * weight, 0.14);
  head.rotation.x = lerp(head.rotation.x, clamp(-pitch, -maxPitch, maxPitch) * weight, 0.14);
}
