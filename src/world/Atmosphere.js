/**
 * Atmosphere.js — dust, god rays and flickering practical lights.
 *
 * These three effects do most of the work of making an empty room feel like a
 * photographed space rather than a box of triangles.
 */

import * as THREE from 'three';
import { Settings } from '../core/Settings.js';
import { makeRng, clamp, lerp } from '../util/MathUtil.js';

/* ==========================================================================
   Dust motes
   ========================================================================== */

const MAX_DUST_LIGHTS = 8;

const DUST_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform vec4  uLights[${MAX_DUST_LIGHTS}];   // xyz = world position, w = range
  uniform vec3  uLightColors[${MAX_DUST_LIGHTS}];
  uniform int   uLightCount;
  uniform float uAmbient;

  attribute float aPhase;
  attribute float aScale;
  attribute vec3  aDrift;

  varying float vAlpha;
  varying vec3  vTint;

  void main() {
    vec3 p = position;

    // Each mote follows its own slow, looping drift. Using sin on three
    // different frequencies keeps them from ever forming a visible pattern.
    float t = uTime * 0.12 + aPhase;
    p.x += sin(t * 1.7) * aDrift.x;
    p.y += sin(t * 0.9 + 1.3) * aDrift.y;
    p.z += cos(t * 1.3 + 2.1) * aDrift.z;

    vec4 world = modelMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * world;

    // --- how much light is actually falling on this mote --------------------
    //
    // Dust is not self-luminous. Drawing it at a constant brightness makes a
    // pitch-black room look like a starfield, which is the single most common
    // way this effect goes wrong. Instead each mote is lit by the same
    // practical lights that light the room, with inverse-square falloff, so
    // motes only appear where a beam actually catches them.
    vec3 lit = vec3(uAmbient);
    for (int i = 0; i < ${MAX_DUST_LIGHTS}; i++) {
      if (i >= uLightCount) break;
      vec3 toLight = uLights[i].xyz - world.xyz;
      float d2 = dot(toLight, toLight);
      float range = uLights[i].w;
      float atten = 1.0 / (1.0 + d2 * 0.08);
      // Hard cut at the light's range so a mote never picks up a light the
      // renderer itself has already culled.
      atten *= 1.0 - smoothstep(range * 0.55, range, sqrt(d2));
      lit += uLightColors[i] * atten;
    }
    vTint = clamp(lit, 0.0, 1.6);

    // Fade motes very close to the camera, otherwise they flare into huge
    // blobs across the whole screen.
    float dist = -mv.z;
    vAlpha = smoothstep(0.35, 1.4, dist) * (1.0 - smoothstep(12.0, 22.0, dist));

    // A slow twinkle as each mote turns in the air.
    vAlpha *= 0.55 + 0.45 * sin(t * 2.3);

    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aScale * uPixelRatio / max(dist, 0.1);
  }
`;

const DUST_FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3  vTint;

  void main() {
    // Soft round sprite, generated rather than textured.
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float a = 1.0 - d * 4.0;

    float brightness = dot(vTint, vec3(0.333));
    if (brightness < 0.004) discard;

    gl_FragColor = vec4(vTint * vec3(1.0, 0.96, 0.88), a * a * vAlpha * brightness * 0.34);
  }
`;

/**
 * A volume of floating dust. Additive, depth-tested but not depth-writing, so
 * motes glow where a light catches them and vanish behind geometry.
 *
 * The returned Points carries an `update(time, scene, camera)` that re-gathers
 * the nearest practical lights each frame, so dust automatically responds to
 * flickering bulbs and to lights the level turns on and off.
 */
export function createDust({
  count = 900,
  bounds = new THREE.Vector3(14, 6, 14),
  center = new THREE.Vector3(0, 3, 0),
  size = 9,
  seed = 1,
  ambient = 0.012,
} = {}) {
  const density = Settings.get('particleDensity');
  const n = Math.max(24, Math.floor(count * density));
  const rng = makeRng(seed);

  const positions = new Float32Array(n * 3);
  const phases = new Float32Array(n);
  const scales = new Float32Array(n);
  const drift = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) {
    positions[i * 3] = center.x + (rng() - 0.5) * bounds.x;
    positions[i * 3 + 1] = center.y + (rng() - 0.5) * bounds.y;
    positions[i * 3 + 2] = center.z + (rng() - 0.5) * bounds.z;
    phases[i] = rng() * Math.PI * 2;
    // Heavily skewed toward small motes: a few big ones catch the eye, but a
    // field of uniformly sized dots looks like snow.
    scales[i] = 0.25 + Math.pow(rng(), 3) * 1.6;
    drift[i * 3] = 0.1 + rng() * 0.45;
    drift[i * 3 + 1] = 0.05 + rng() * 0.22;
    drift[i * 3 + 2] = 0.1 + rng() * 0.45;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geo.setAttribute('aDrift', new THREE.BufferAttribute(drift, 3));
  geo.boundingSphere = new THREE.Sphere(center.clone(), Math.max(bounds.x, bounds.y, bounds.z));

  const lightVecs = Array.from({ length: MAX_DUST_LIGHTS }, () => new THREE.Vector4());
  const lightCols = Array.from({ length: MAX_DUST_LIGHTS }, () => new THREE.Vector3());

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uSize: { value: size },
      uLights: { value: lightVecs },
      uLightColors: { value: lightCols },
      uLightCount: { value: 0 },
      uAmbient: { value: ambient },
    },
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'dust';

  const _p = new THREE.Vector3();
  const candidates = [];

  points.userData.update = (time, scene, camera) => {
    mat.uniforms.uTime.value = time;
    if (!scene) return;

    // Gather the strongest nearby punctual lights. Rebuilt each frame because
    // intensities flicker and levels switch lights on and off.
    candidates.length = 0;
    scene.traverse((o) => {
      if (!o.isLight) return;
      if (!o.isPointLight && !o.isSpotLight) return;
      if (o.intensity <= 0.001) return;
      o.getWorldPosition(_p);
      const dist = camera ? _p.distanceTo(camera.position) : 0;
      // Rank by how much of this light is likely to reach the camera's area.
      candidates.push({ pos: _p.clone(), light: o, score: o.intensity / (1 + dist * dist * 0.05) });
    });
    candidates.sort((a, b) => b.score - a.score);

    const used = Math.min(candidates.length, MAX_DUST_LIGHTS);
    for (let i = 0; i < used; i++) {
      const { pos, light } = candidates[i];
      const range = light.distance > 0 ? light.distance : 14;
      lightVecs[i].set(pos.x, pos.y, pos.z, range);
      // Normalise out the inverse-square magnitude the renderer applies, so a
      // bright far light and a dim near one contribute comparably here.
      const scale = Math.min(light.intensity / 12, 1.5);
      lightCols[i].set(light.color.r * scale, light.color.g * scale, light.color.b * scale);
    }
    mat.uniforms.uLightCount.value = used;
  };

  return points;
}

/* ==========================================================================
   God rays
   ========================================================================== */

const RAY_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewDir;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const RAY_FRAG = /* glsl */ `
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uNoiseAmount;
  varying vec2 vUv;
  varying vec3 vViewDir;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    // Fade along the length of the cone: bright at the window, gone by the floor.
    float lengthFade = 1.0 - vUv.y;
    lengthFade = pow(lengthFade, 1.6);

    // Approximate how much of the beam the view ray travels through.
    //
    // For a cone or cylinder that path is LONGEST through the middle of the
    // silhouette (where the surface normal points back at the camera) and
    // shortest at the edges (where the normal is perpendicular to the view).
    // So thickness tracks |N·V| directly — inverting it, which is the usual
    // reflex for a rim-light style falloff, makes the shaft read as a hard
    // hollow cone instead of as light in the air.
    float thickness = abs(dot(normalize(vNormal), normalize(vViewDir)));
    thickness = pow(thickness, 1.5);

    // Soften the very edge so the silhouette never shows a hard line.
    float edge = smoothstep(0.0, 0.22, thickness);
    float facing = thickness * edge;

    // Slowly churning dust inside the beam.
    float n = noise(vec2(vUv.x * 5.0, vUv.y * 2.5 - uTime * 0.05));
    n = mix(1.0, n, uNoiseAmount);

    float a = lengthFade * facing * n * uIntensity;
    gl_FragColor = vec4(uColor, a);
  }
`;

/**
 * A shaft of light. Cheap: one open-ended cone with an additive shader that
 * fades at grazing angles. Convincing at a fraction of the cost of real
 * volumetric marching, which is why nearly every game of this era used it.
 */
export function createGodRay({
  radiusTop = 0.25,
  radiusBottom = 1.6,
  length = 7,
  color = 0xffe2b0,
  intensity = 0.16,
  noiseAmount = 0.55,
} = {}) {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 18, 6, true);
  // Move the origin to the top so positioning it at a window is intuitive.
  geo.translate(0, -length / 2, 0);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uTime: { value: 0 },
      uNoiseAmount: { value: noiseAmount },
    },
    vertexShader: RAY_VERT,
    fragmentShader: RAY_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'godray';
  mesh.renderOrder = 5;
  mesh.userData.update = (time) => {
    mat.uniforms.uTime.value = time;
  };
  mesh.userData.setIntensity = (v) => {
    mat.uniforms.uIntensity.value = v;
  };
  return mesh;
}

/* ==========================================================================
   Flickering practical lights
   ========================================================================== */

/**
 * Wraps a light in a failing-fluorescent / dying-bulb flicker.
 *
 * The pattern matters: real failing lights don't flicker at a steady rate, they
 * sit stable for a while and then stutter in a burst. `chance` controls how
 * often a burst starts; `severity` how dark it gets.
 */
export class Flicker {
  constructor(light, {
    baseIntensity = light.intensity,
    chance = 0.4,
    severity = 0.85,
    burstLength = [0.05, 0.42],
    hum = true,
    seed = Math.random() * 1000,
  } = {}) {
    this.light = light;
    this.base = baseIntensity;
    this.chance = chance;
    this.severity = severity;
    this.burstLength = burstLength;
    this.hum = hum;
    this.rng = makeRng(Math.floor(seed));

    this._burstTime = 0;
    this._nextCheck = this.rng() * 3;
    this._current = 1;
    this.enabled = true;

    // Emissive bulb meshes registered here get dimmed in step with the light.
    this.bulbs = [];
    // Additional lights (fills) that should flicker together with the main one.
    this.linked = [];
  }

  /** Dim another light in lockstep — used for a practical's unshadowed fill. */
  linkLight(light) {
    light.userData.flickerBase = light.intensity;
    this.linked.push(light);
    return this;
  }

  attachBulb(mesh, emissiveBase = 6) {
    this.bulbs.push({ mesh, base: emissiveBase });
    return this;
  }

  update(dt, time) {
    if (!this.enabled) {
      this._current = 1;
      this.light.intensity = this.base;
      return;
    }

    // Reduced-flashing accessibility mode keeps a gentle hum but removes the
    // hard on/off stutter that can be genuinely unpleasant.
    const reduced = Settings.get('reduceFlashing');

    this._nextCheck -= dt;
    if (this._nextCheck <= 0) {
      this._nextCheck = 0.6 + this.rng() * 4.5;
      if (this.rng() < this.chance) {
        this._burstTime = lerp(this.burstLength[0], this.burstLength[1], this.rng());
      }
    }

    let target = 1;
    if (this._burstTime > 0 && !reduced) {
      this._burstTime -= dt;
      // Within a burst, the bulb strobes irregularly.
      const s = Math.sin(time * 47) * Math.sin(time * 31.3) * Math.sin(time * 71.7);
      target = 1 - this.severity * clamp(0.5 + s * 0.8, 0, 1);
    }

    // 50Hz mains hum — a tiny always-on wobble that reads as "electric".
    if (this.hum) {
      target *= 1 + Math.sin(time * 100) * (reduced ? 0.004 : 0.012);
    }

    // Snap down fast, recover slower: that asymmetry is what a real filament does.
    const rate = target < this._current ? 45 : 9;
    this._current = lerp(this._current, target, clamp(rate * dt, 0, 1));

    this.light.intensity = this.base * this._current;
    for (const l of this.linked) l.intensity = l.userData.flickerBase * this._current;
    for (const { mesh, base } of this.bulbs) {
      mesh.material.emissiveIntensity = base * this._current;
    }
  }
}

/**
 * Builds a hanging practical: cage, bulb, cord, light and flicker in one call.
 * Returns the group plus the pieces, so level code stays readable.
 */
export function createHangingLight({
  color = 0xffc98a,
  intensity = 3.2,
  distance = 9,
  cordLength = 0.8,
  castShadow = true,
  flicker = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'practical';

  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, cordLength, 5),
    new THREE.MeshStandardMaterial({ color: 0x1a1613, roughness: 0.9 })
  );
  cord.position.y = -cordLength / 2;
  group.add(cord);

  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.03, 0.06, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.6, metalness: 0.4 })
  );
  socket.position.y = -cordLength - 0.03;
  socket.castShadow = true;
  group.add(socket);

  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0x0e0a06,
    emissive: new THREE.Color(color),
    emissiveIntensity: 6,
    roughness: 0.35,
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), bulbMat);
  bulb.position.y = -cordLength - 0.09;
  bulb.scale.y = 1.25;
  group.add(bulb);

  // A SpotLight rather than a PointLight, deliberately: a shadow-casting point
  // light renders the scene into all six faces of a cube map, so one bulb costs
  // six extra passes. A wide downward spot is visually near-identical for a
  // bulb on a cord and costs one. The bounce a point light would give upward is
  // replaced by the unshadowed fill below.
  const light = new THREE.SpotLight(color, intensity * 2.2, distance, Math.PI * 0.46, 0.85, 2);
  light.position.y = -cordLength - 0.09;
  light.target.position.set(0, -cordLength - 3, 0);
  light.castShadow = castShadow;
  if (castShadow) {
    light.shadow.mapSize.setScalar(1024);
    light.shadow.bias = -0.0025;
    light.shadow.normalBias = 0.022;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = distance;
    light.userData.maxShadowSize = 1024;
  }
  group.add(light, light.target);

  // Unshadowed, short-range fill so the ceiling and the top of the cord are not
  // pitch black the way a bare spot would leave them.
  const fill = new THREE.PointLight(color, intensity * 0.28, distance * 0.45, 2);
  fill.position.y = -cordLength - 0.09;
  fill.castShadow = false;
  group.add(fill);

  const fl = flicker
    ? new Flicker(light, { baseIntensity: light.intensity, ...flicker })
        .attachBulb(bulb, 6)
        .linkLight(fill)
    : null;

  group.userData.light = light;
  group.userData.bulb = bulb;
  group.userData.flicker = fl;
  group.userData.update = (dt, time) => fl?.update(dt, time);

  return group;
}
