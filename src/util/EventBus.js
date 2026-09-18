/**
 * EventBus — the tiny pub/sub every system in the game inherits from or owns.
 *
 * Deliberately minimal: handlers are stored in a Map of Sets so unsubscribing
 * is O(1) and a handler can never be registered twice for the same event.
 */
export class EventBus {
  constructor() {
    this._handlers = new Map();
  }

  /** Subscribe. Returns an unsubscribe function for convenience in effects. */
  on(event, handler) {
    let set = this._handlers.get(event);
    if (!set) {
      set = new Set();
      this._handlers.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  /** Subscribe for exactly one emission. */
  once(event, handler) {
    const wrapped = (...args) => {
      this.off(event, wrapped);
      handler(...args);
    };
    return this.on(event, wrapped);
  }

  off(event, handler) {
    const set = this._handlers.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this._handlers.delete(event);
  }

  emit(event, ...args) {
    const set = this._handlers.get(event);
    if (!set) return;
    // Copy before iterating: a handler is allowed to unsubscribe itself.
    for (const handler of [...set]) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[eventbus] handler for "${event}" threw`, err);
      }
    }
  }

  clear(event) {
    if (event) this._handlers.delete(event);
    else this._handlers.clear();
  }
}
