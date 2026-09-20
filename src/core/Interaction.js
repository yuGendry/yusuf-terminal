/**
 * Interaction.js — what the player can look at and use.
 *
 * Registered objects are raycast against from the camera each frame. The
 * closest one within reach that is not occluded becomes the focus, which
 * drives the prompt, the crosshair state, and what the interact key does.
 *
 * Interactables are plain objects rather than a class hierarchy, so a level can
 * declare one inline:
 *
 *   interaction.register({
 *     object: leverMesh,
 *     label: () => lever.on ? 'Pull down' : 'Pull up',
 *     onUse: () => lever.toggle(),
 *   });
 */

import * as THREE from 'three';
import { EventBus } from '../util/EventBus.js';
import { GROUP, collisionGroups } from './Physics.js';

const DEFAULT_REACH = 2.6;

export class Interaction extends EventBus {
  constructor({ engine, input, physics, hud, audio }) {
    super();
    this.engine = engine;
    this.input = input;
    this.physics = physics;
    this.hud = hud;
    this.audio = audio;

    this.enabled = true;
    this.items = new Map();        // Object3D -> descriptor
    this.focus = null;

    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = DEFAULT_REACH + 1;
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._targets = [];
    this._dirty = true;

    /** Set while a held interaction is in progress (a valve, a stuck door). */
    this.holdProgress = 0;
    this._holding = null;
  }

  /**
   * @param {object} desc
   * @param {THREE.Object3D} desc.object        what to raycast against
   * @param {string|function} desc.label        prompt text, or a function returning it
   * @param {function} desc.onUse               called on press (or on hold completion)
   * @param {number}  [desc.reach]              metres; default 2.6
   * @param {number}  [desc.holdTime]           seconds; 0 = instant
   * @param {function}[desc.enabled]            predicate; false greys the prompt out
   * @param {string}  [desc.key]                prompt key glyph, default the interact bind
   * @param {string}  [desc.disabledLabel]      shown when `enabled` returns false
   * @param {boolean} [desc.requiresLens]       lens id needed to interact
   */
  register(desc) {
    if (!desc?.object) throw new Error('interactable needs an object');
    this.items.set(desc.object, { reach: DEFAULT_REACH, holdTime: 0, ...desc });
    this._dirty = true;
    return () => this.unregister(desc.object);
  }

  unregister(object) {
    this.items.delete(object);
    if (this.focus?.object === object) this.focus = null;
    this._dirty = true;
  }

  clear() {
    this.items.clear();
    this.focus = null;
    this._dirty = true;
  }

  _rebuildTargets() {
    this._targets = [...this.items.keys()];
    this._dirty = false;
  }

  update(dt, mask) {
    if (!this.enabled) {
      this._setFocus(null);
      return;
    }
    if (this._dirty) this._rebuildTargets();

    const cam = this.engine.camera;
    cam.getWorldPosition(this._origin);
    cam.getWorldDirection(this._dir);
    this._raycaster.set(this._origin, this._dir);

    let best = null;
    let bestDist = Infinity;

    const hits = this._raycaster.intersectObjects(this._targets, true);
    for (const hit of hits) {
      // Walk up to the registered ancestor: levels often register a group.
      let node = hit.object;
      let desc = null;
      while (node) {
        desc = this.items.get(node);
        if (desc) break;
        node = node.parent;
      }
      if (!desc) continue;
      if (!hit.object.visible) continue;
      if (hit.distance > (desc.reach ?? DEFAULT_REACH)) continue;

      // Something solid between the player and the object blocks it — you
      // cannot pull a lever through a door.
      if (!this._hasClearPath(hit.point, hit.distance)) continue;

      if (hit.distance < bestDist) {
        bestDist = hit.distance;
        best = { ...desc, distance: hit.distance, point: hit.point.clone() };
      }
      break;
    }

    this._setFocus(best);
    this._handleUse(dt, mask);
  }

  _hasClearPath(point, distance) {
    // Stop just short of the target so the object's own collider, if it has
    // one, does not count as blocking it.
    const probe = this.physics.raycast(
      this._origin,
      this._dir,
      Math.max(0.05, distance - 0.12),
      collisionGroups(0xffff, GROUP.WORLD)
    );
    return probe === null;
  }

  _setFocus(next) {
    const changed = (next?.object ?? null) !== (this.focus?.object ?? null);
    if (changed) {
      this.holdProgress = 0;
      this._holding = null;
    }
    this.focus = next;

    if (!next) {
      this.hud?.setPrompt(null);
      if (changed) this.emit('focusChanged', null);
      return;
    }

    const usable = next.enabled ? !!next.enabled() : true;
    const label = usable
      ? (typeof next.label === 'function' ? next.label() : next.label)
      : (next.disabledLabel ?? (typeof next.label === 'function' ? next.label() : next.label));

    this.hud?.setPrompt(label, next.key ?? 'E', { disabled: !usable, hold: next.holdTime > 0 });
    if (changed) this.emit('focusChanged', next);
  }

  _handleUse(dt, mask) {
    const f = this.focus;
    if (!f) return;

    const usable = f.enabled ? !!f.enabled() : true;

    // Some interactions are only possible while the right lens is up.
    if (usable && f.requiresLens && mask?.lens !== f.requiresLens) {
      if (this.input.pressed('interact')) {
        this.audio?.uiDenied();
        this.hud?.say(f.lensHint ?? 'You cannot see well enough to do this.', { duration: 2.6 });
      }
      return;
    }

    if (!usable) {
      if (this.input.pressed('interact')) {
        this.audio?.uiDenied();
        if (f.deniedMessage) this.hud?.say(f.deniedMessage, { duration: 2.8 });
      }
      return;
    }

    if (f.holdTime > 0) {
      if (this.input.isDown('interact')) {
        this._holding = f.object;
        this.holdProgress += dt / f.holdTime;
        this.hud?.setHoldProgress?.(Math.min(this.holdProgress, 1));
        if (this.holdProgress >= 1) {
          this.holdProgress = 0;
          this._holding = null;
          this.hud?.setHoldProgress?.(0);
          this._fire(f);
        }
      } else if (this.holdProgress > 0) {
        // Let go early and it slides back rather than resetting instantly.
        this.holdProgress = Math.max(0, this.holdProgress - dt * 1.8);
        this.hud?.setHoldProgress?.(this.holdProgress);
      }
      return;
    }

    if (this.input.pressed('interact')) this._fire(f);
  }

  _fire(desc) {
    try {
      desc.onUse?.(desc);
    } catch (err) {
      console.error('[interaction] handler threw', err);
    }
    this.emit('used', desc);
    // Labels commonly change after use (a lever's direction, a door's state).
    this._setFocus(this.focus);
  }
}
