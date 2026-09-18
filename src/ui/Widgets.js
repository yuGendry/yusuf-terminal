/**
 * Widgets.js — the settings-menu control set.
 *
 * Every builder returns a row element and wires itself to the Settings store,
 * so adding an option is one line in SettingsMenu rather than a block of DOM
 * plumbing. Controls also listen back to the store, which means a preset change
 * visibly moves every slider it touches.
 */

import { Settings } from '../core/Settings.js';
import { Audio } from '../audio/AudioEngine.js';
import { keyLabel } from '../core/Input.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function row(label, description) {
  const r = el('div', 'opt-row');
  const labelWrap = el('div', 'opt-label');
  labelWrap.appendChild(el('span', 'opt-name', label));
  if (description) labelWrap.appendChild(el('span', 'opt-desc', description));
  r.appendChild(labelWrap);
  const control = el('div', 'opt-control');
  r.appendChild(control);
  r._control = control;
  return r;
}

/* -------------------------------------------------------------------------- */

export function makeSlider({
  label, description, key, min = 0, max = 1, step = 0.01,
  format = (v) => `${Math.round(v * 100)}%`,
  onChange = null,
}) {
  const r = row(label, description);

  const input = el('input', 'opt-slider');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(Settings.get(key));
  input.setAttribute('aria-label', label);

  const readout = el('span', 'opt-value', format(Settings.get(key)));

  const paint = () => {
    // Fill the track up to the thumb; a plain range input looks like a form.
    const pct = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  };
  paint();

  input.addEventListener('input', () => {
    const v = Number(input.value);
    Settings.set(key, v);
    readout.textContent = format(v);
    paint();
    onChange?.(v);
  });
  input.addEventListener('change', () => Audio.uiClick());

  // Reflect external changes (a preset moved this value).
  Settings.on(`change:${key}`, (v) => {
    if (Number(input.value) === v) return;
    input.value = String(v);
    readout.textContent = format(v);
    paint();
  });

  r._control.append(input, readout);
  return r;
}

export function makeToggle({ label, description, key, onChange = null }) {
  const r = row(label, description);

  const btn = el('button', 'opt-toggle');
  btn.type = 'button';
  btn.setAttribute('role', 'switch');

  const paint = () => {
    const on = !!Settings.get(key);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', String(on));
    btn.textContent = on ? 'ON' : 'OFF';
  };
  paint();

  btn.addEventListener('click', () => {
    Settings.set(key, !Settings.get(key));
    Audio.uiClick();
    onChange?.(Settings.get(key));
  });
  btn.addEventListener('mouseenter', () => Audio.uiHover());
  Settings.on(`change:${key}`, paint);

  r._control.appendChild(btn);
  return r;
}

export function makeSelect({ label, description, key, options, onChange = null }) {
  const r = row(label, description);
  const group = el('div', 'opt-segmented');

  const buttons = options.map(({ value, label: optLabel }) => {
    const b = el('button', 'seg-btn', optLabel);
    b.type = 'button';
    b.dataset.value = String(value);
    b.addEventListener('click', () => {
      Settings.set(key, value);
      Audio.uiClick();
      onChange?.(value);
    });
    b.addEventListener('mouseenter', () => Audio.uiHover());
    group.appendChild(b);
    return b;
  });

  const paint = () => {
    const current = String(Settings.get(key));
    for (const b of buttons) b.classList.toggle('active', b.dataset.value === current);
  };
  paint();
  Settings.on(`change:${key}`, paint);

  r._control.appendChild(group);
  return r;
}

/**
 * A key-rebinding row. Clicking arms the capture; the next key pressed is
 * bound, and Escape cancels. Input.captureNextKey intercepts before the game
 * sees the event, so rebinding pause to Escape is still possible.
 */
export function makeKeybind({ label, action, input }) {
  const r = row(label);

  const btn = el('button', 'opt-keybind');
  btn.type = 'button';

  const paint = () => {
    btn.textContent = keyLabel(Settings.get('keybinds')[action]);
    btn.classList.remove('listening');
  };
  paint();

  btn.addEventListener('click', () => {
    if (btn.classList.contains('listening')) return;
    btn.classList.add('listening');
    btn.textContent = 'PRESS A KEY';
    Audio.uiClick();

    input.captureNextKey = (code) => {
      if (code) {
        Settings.setKeybind(action, code);
        Audio.uiClick();
      } else {
        Audio.uiBack();
      }
      paint();
    };
  });
  btn.addEventListener('mouseenter', () => Audio.uiHover());
  Settings.on('change:keybinds', paint);

  r._control.appendChild(btn);
  return r;
}

export function makeButton({ label, description, text, onClick, danger = false }) {
  const r = row(label, description);
  const btn = el('button', `opt-action${danger ? ' danger' : ''}`, text);
  btn.type = 'button';
  btn.addEventListener('click', () => {
    Audio.uiClick();
    onClick();
  });
  btn.addEventListener('mouseenter', () => Audio.uiHover());
  r._control.appendChild(btn);
  return r;
}

export function makeSectionHeader(text) {
  return el('div', 'opt-section', text);
}

export { el };
