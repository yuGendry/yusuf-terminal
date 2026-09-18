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
import { clamp, lerp } from '../util/MathUtil.js';

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
} = {}) {
  const P = PUPPET_PRESETS[preset] ?? PUPPET_PRESETS.marionette;

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

  addFace(head, P, faceStyle, mats);

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

  return {
    root,
    joints,
    proportions: P,
    stringSystem,
    /** Convenience: total standing height in world units. */
    height:
      (P.upperLeg + P.lowerLeg + P.pelvisHeight + P.torsoHeight + P.neckLength + P.headRadius * 2) * scale,
  };
}

/**
 * Faces are painted with geometry rather than textures so they read clearly at
 * any distance and can be lit dramatically from below.
 */
function addFace(head, P, style, mats) {
  const r = P.headRadius;
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x0a0806, roughness: 0.25, metalness: 0,
  });

  for (const side of [-1, 1]) {
    // Recessed socket, then a glossy bead inside it. The recess is what makes
    // the eyes read as sunken and dead rather than as painted dots.
    const socket = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.245, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.9 })
    );
    socket.position.set(side * r * 0.36, r * 0.12, -r * 0.80);
    socket.scale.set(1, 0.86, 0.6);
    head.add(socket);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.15, 12, 10), eyeMat);
    eye.position.set(side * r * 0.36, r * 0.12, -r * 0.86);
    head.add(eye);

    // A tiny specular bead. Catching a highlight is what makes a dead eye
    // look like it might be watching.
    const glint = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.045, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    glint.position.set(side * r * 0.36 - r * 0.04, r * 0.18, -r * 0.94);
    head.add(glint);

    // Rosy circle on each cheek — the "cute" that curdles under bad lighting.
    const cheek = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.2, 14),
      new THREE.MeshStandardMaterial({
        color: 0xa2453f, roughness: 0.75, transparent: true, opacity: 0.55,
      })
    );
    cheek.position.set(side * r * 0.52, -r * 0.22, -r * 0.80);
    cheek.rotation.y = side * 0.5;
    cheek.lookAt(side * r * 2, -r * 0.22, -r * 4);
    head.add(cheek);
  }

  // Hinged jaw. Kept as a joint so it can drop open.
  const jaw = new THREE.Group();
  jaw.position.set(0, -r * 0.34, -r * 0.2);
  head.add(jaw);
  head.userData.jaw = jaw;

  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x140a08, roughness: 0.95 });

  if (style === 'smile') {
    // A carved grin: a shallow torus arc cut into the lower face.
    const grin = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.34, r * 0.035, 8, 20, Math.PI),
      mouthMat
    );
    grin.rotation.set(Math.PI, 0, Math.PI);
    grin.position.set(0, -r * 0.05, -r * 0.72);
    jaw.add(grin);
  } else if (style === 'open') {
    const hole = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mouthMat
    );
    hole.position.set(0, -r * 0.08, -r * 0.66);
    hole.rotation.x = -Math.PI / 2;
    hole.scale.set(1, 1, 0.6);
    jaw.add(hole);
  } else {
    // 'stitched' — the Understudy and the Choir wear this.
    for (let i = 0; i < 7; i++) {
      const t = (i / 6 - 0.5) * 2;
      const stitch = new THREE.Mesh(
        new THREE.BoxGeometry(r * 0.02, r * 0.14, r * 0.02),
        mouthMat
      );
      stitch.position.set(t * r * 0.34, -r * 0.06 - Math.abs(t) * r * 0.05, -r * 0.76);
      stitch.rotation.z = t * 0.35;
      jaw.add(stitch);
    }
  }

  // Nose: a small cone, which catches light and gives the face a readable profile.
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(r * 0.1, r * 0.22, 8),
    mats.face
  );
  nose.position.set(0, -r * 0.03, -r * 0.92);
  nose.rotation.x = -Math.PI / 2;
  head.add(nose);
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
