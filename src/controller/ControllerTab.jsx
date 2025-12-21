import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { GridLayout, noCompactor, useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import * as controllerState from './controller_state.js';
import { setControllerWidgetOptionsProvider, setIdOptionsProvider, xmlTextToAsyncJs } from '../routines/blockly_mvp.js';
import { createRoutineApi } from '../routines/runtime_api.js';
import * as globalVars from '../routines/global_vars.js';

const GRID_PX = 40;
const ROUTINE_RETRIGGER_COOLDOWN_MS = 300;
const BUTTON_MODE_MOMENTARY = 'momentary';
const BUTTON_MODE_TOGGLE = 'toggle';
const overlapNoCompactor = { ...noCompactor, allowOverlap: true };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const newId = () => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_) {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const uniqName = (existing, base) => {
  const set = new Set(existing.map((w) => String(w?.name || '')).filter(Boolean));
  if (!set.has(base)) return base;
  for (let i = 2; i < 9999; i += 1) {
    const n = `${base}${i}`;
    if (!set.has(n)) return n;
  }
  return `${base}-${Date.now()}`;
};

const getNextY = (widgets) => {
  let maxY = 0;
  for (const w of widgets || []) {
    const y = Number(w?.layout?.y ?? 0);
    const h = Number(w?.layout?.h ?? 0);
    if (!Number.isFinite(y) || !Number.isFinite(h)) continue;
    maxY = Math.max(maxY, y + h);
  }
  return maxY;
};

const defaultWidget = (type, widgets) => {
  const id = newId();
  const base =
    type === 'button'
      ? 'Button'
      : type === 'slider'
        ? 'Slider'
        : type === 'joystick'
          ? 'Joystick'
          : type === 'led'
            ? 'LED'
            : 'Display';
  const name = uniqName(widgets, base);
  // Default sizes are in grid units (GRID_PX=32).
  // Requested defaults:
  // - button: 2x1
  // - slider: 5x1 (horizontal) / 1x5 (vertical)
  // - led: 2x2
  // - display: 4x3
  // - joystick: 4x4 (square)
  // - timer: 1x1
  const w =
    type === 'button'
      ? 2
      : type === 'slider'
        ? 5
        : type === 'joystick'
          ? 4
          : type === 'led'
            ? 2
            : type === 'display'
              ? 4
              : type === 'timer'
                ? 1
                : 3;
  const h =
    type === 'button'
      ? 1
      : type === 'slider'
        ? 1
        : type === 'joystick'
          ? 4
          : type === 'led'
            ? 2
            : type === 'display'
              ? 3
              : type === 'timer'
                ? 1
                : 2;
  const widget = {
    id,
    type,
    name,
    layout: { i: id, x: 0, y: getNextY(widgets), w, h },
    props:
      type === 'slider'
        ? { orientation: 'h', min: 0, max: 100, step: 1, value: 0 }
        : type === 'button'
          ? { mode: BUTTON_MODE_MOMENTARY, value: false }
          : type === 'led'
            ? { shape: 'round', color: '#000000' }
            : type === 'display'
              ? { value: 0 }
              : {},
    bindings:
      type === 'button'
        ? { onPress: '', onRelease: '', key: '', gamepad: { index: 0, button: -1 } }
        : type === 'slider'
          ? { onChange: '' }
          : type === 'joystick'
            ? { onChange: '', gamepad: { index: 0, axisX: -1, axisY: -1 } }
            : type === 'timer'
              ? { everyMs: 1000, onTick: '' }
              : {},
  };
  return widget;
};

const WidgetConfig = ({ open, widget, routines, onClose, onChange, onDelete }) => {
  const widgetRef = useRef(widget);
  useEffect(() => {
    widgetRef.current = widget;
  }, [widget]);

  const routineOptions = useMemo(
    () => [{ id: '', name: '(none)' }, ...(Array.isArray(routines) ? routines : [])],
    [routines],
  );

  const setField = useCallback(
    (path, value, mutator) => {
      const current = widgetRef.current;
      if (!current) return;
      const next = JSON.parse(JSON.stringify(current));
      let cur = next;
      for (let i = 0; i < path.length - 1; i += 1) cur = cur[path[i]];
      cur[path[path.length - 1]] = value;
      mutator?.(next);
      onChange(next);
    },
    [onChange],
  );

  const [captureKey, setCaptureKey] = useState(false);
  const [captureGamepad, setCaptureGamepad] = useState(false);
  const [captureJoystickAxes, setCaptureJoystickAxes] = useState(false);

  useEffect(() => {
    if (!open || !widget) {
      setCaptureKey(false);
      setCaptureGamepad(false);
      setCaptureJoystickAxes(false);
    }
  }, [open, widget]);

  useEffect(() => {
    setCaptureKey(false);
    setCaptureGamepad(false);
    setCaptureJoystickAxes(false);
  }, [widget?.id]);

  useEffect(() => {
    if (!widget?.bindings?.key) setCaptureKey(false);
  }, [widget?.bindings?.key]);

  useEffect(() => {
    if (Number(widget?.bindings?.gamepad?.button ?? -1) < 0) setCaptureGamepad(false);
  }, [widget?.bindings?.gamepad?.button]);

  useEffect(() => {
    const ax = Number(widget?.bindings?.gamepad?.axisX ?? -1);
    const ay = Number(widget?.bindings?.gamepad?.axisY ?? -1);
    if (ax < 0 && ay < 0) setCaptureJoystickAxes(false);
  }, [widget?.bindings?.gamepad?.axisX, widget?.bindings?.gamepad?.axisY]);

  useEffect(() => {
    if (!captureKey) return;
    const onDown = (e) => {
      if (String(e.code || '') === 'Escape') {
        e.preventDefault();
        setCaptureKey(false);
        return;
      }
      const code = String(e.code || '');
      if (!code) return;
      e.preventDefault();
      setField(['bindings', 'key'], code);
      setCaptureKey(false);
    };
    window.addEventListener('keydown', onDown, true);
    return () => window.removeEventListener('keydown', onDown, true);
  }, [captureKey, setField]);

  useEffect(() => {
    if (!captureGamepad) return;
    let cancelled = false;

    const onEsc = (e) => {
      if (String(e.code || '') !== 'Escape') return;
      e.preventDefault();
      cancelled = true;
      setCaptureGamepad(false);
    };
    window.addEventListener('keydown', onEsc, true);

    const initialPressed = new Set();
    const readInitial = () => {
      const pads = navigator?.getGamepads?.() || [];
      for (let pi = 0; pi < pads.length; pi += 1) {
        const pad = pads[pi];
        const buttons = Array.isArray(pad?.buttons) ? pad.buttons : [];
        for (let bi = 0; bi < buttons.length; bi += 1) {
          if (buttons[bi]?.pressed) initialPressed.add(`${pi}:${bi}`);
        }
      }
    };
    readInitial();

    const tick = () => {
      if (cancelled) return;
      const pads = navigator?.getGamepads?.() || [];
      for (let pi = 0; pi < pads.length; pi += 1) {
        const pad = pads[pi];
        if (!pad) continue;
        const buttons = Array.isArray(pad.buttons) ? pad.buttons : [];
        for (let bi = 0; bi < buttons.length; bi += 1) {
          const pressed = Boolean(buttons[bi]?.pressed);
          if (!pressed) continue;
          const key = `${pi}:${bi}`;
          if (initialPressed.has(key)) continue;
          setField(['bindings', 'gamepad', 'index'], pi, (next) => {
            if (!next.bindings) next.bindings = {};
            if (!next.bindings.gamepad) next.bindings.gamepad = {};
            next.bindings.gamepad.index = pi;
            next.bindings.gamepad.button = bi;
          });
          setCaptureGamepad(false);
          cancelled = true;
          return;
        }
      }
    };

    const t = setInterval(tick, 50);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener('keydown', onEsc, true);
    };
  }, [captureGamepad, setField]);

  useEffect(() => {
    if (!captureJoystickAxes) return;
    if (typeof navigator?.getGamepads !== 'function') {
      setCaptureJoystickAxes(false);
      return;
    }

    let cancelled = false;
    const onEsc = (e) => {
      if (String(e.code || '') !== 'Escape') return;
      e.preventDefault();
      cancelled = true;
      setCaptureJoystickAxes(false);
    };
    window.addEventListener('keydown', onEsc, true);

    const baselineAxes = new Map(); // padIndex -> number[]
    const readBaseline = () => {
      const pads = navigator?.getGamepads?.() || [];
      for (let pi = 0; pi < pads.length; pi += 1) {
        const pad = pads[pi];
        if (!pad) continue;
        const axes = Array.isArray(pad.axes) ? pad.axes : [];
        baselineAxes.set(pi, axes.map((v) => Number(v ?? 0)));
      }
    };
    readBaseline();

    const chooseSecondAxis = (deltas) => {
      // pick the second-highest delta above a small threshold, if available
      let bestI = -1;
      let bestV = 0;
      for (let i = 0; i < deltas.length; i += 1) {
        const v = Math.abs(deltas[i]);
        if (v > bestV) {
          bestV = v;
          bestI = i;
        }
      }
      if (bestI < 0) return -1;
      // zero-out the best and search again
      const tmp = deltas.slice();
      tmp[bestI] = 0;
      let secondI = -1;
      let secondV = 0;
      for (let i = 0; i < tmp.length; i += 1) {
        const v = Math.abs(tmp[i]);
        if (v > secondV) {
          secondV = v;
          secondI = i;
        }
      }
      return secondV >= 0.2 ? secondI : -1;
    };

    const tick = () => {
      if (cancelled) return;
      const pads = navigator?.getGamepads?.() || [];
      for (let pi = 0; pi < pads.length; pi += 1) {
        const pad = pads[pi];
        if (!pad) continue;
        const axes = Array.isArray(pad.axes) ? pad.axes : [];
        const base = baselineAxes.get(pi) || axes.map(() => 0);
        const deltas = axes.map((v, i) => Number(v ?? 0) - Number(base[i] ?? 0));

        let maxI = -1;
        let maxV = 0;
        for (let i = 0; i < deltas.length; i += 1) {
          const v = Math.abs(deltas[i]);
          if (v > maxV) {
            maxV = v;
            maxI = i;
          }
        }

        // require a clear movement
        if (maxV < 0.35 || maxI < 0) continue;

        // Prefer common stick pairing (0/1, 2/3, ...)
        let a = maxI;
        let b = maxI % 2 === 0 ? maxI + 1 : maxI - 1;
        if (b < 0 || b >= axes.length) b = -1;
        if (b < 0) b = chooseSecondAxis(deltas);
        if (b < 0) continue;

        const axisX = Math.min(a, b) % 2 === 0 ? Math.min(a, b) : Math.max(a, b);
        const axisY = axisX === a ? b : a;

        setField(['bindings', 'gamepad', 'index'], pi, (next) => {
          if (!next.bindings) next.bindings = {};
          if (!next.bindings.gamepad) next.bindings.gamepad = {};
          next.bindings.gamepad.index = pi;
          next.bindings.gamepad.axisX = axisX;
          next.bindings.gamepad.axisY = axisY;
        });
        setCaptureJoystickAxes(false);
        cancelled = true;
        return;
      }
    };

    const t = setInterval(tick, 50);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener('keydown', onEsc, true);
    };
  }, [captureJoystickAxes, setField]);

  if (!open || !widget) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{ background: '#fff', padding: 16, borderRadius: 10, width: 520, maxWidth: '95vw' }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>
          {widget.type} — {widget.name}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Name
            <input
              value={widget.name}
              onChange={(e) => setField(['name'], e.target.value)}
              style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
            />
          </label>

          {widget.type === 'button' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Mode
              <select
                value={widget.props?.mode === BUTTON_MODE_TOGGLE ? BUTTON_MODE_TOGGLE : BUTTON_MODE_MOMENTARY}
                onChange={(e) => {
                  const mode = e.target.value === BUTTON_MODE_TOGGLE ? BUTTON_MODE_TOGGLE : BUTTON_MODE_MOMENTARY;
                  setField(['props', 'mode'], mode, (next) => {
                    if (!next.props) next.props = {};
                    if (mode === BUTTON_MODE_MOMENTARY) next.props.value = false;
                    if (mode === BUTTON_MODE_TOGGLE) next.props.value = Boolean(next.props.value);
                  });
                }}
                style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
              >
                <option value={BUTTON_MODE_MOMENTARY}>Momentary (pressed)</option>
                <option value={BUTTON_MODE_TOGGLE}>Toggle (on/off)</option>
              </select>
            </label>
          ) : null}

          {widget.type === 'button' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Keyboard shortcut (optional)
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCaptureKey((v) => !v);
                    setCaptureGamepad(false);
                    setCaptureJoystickAxes(false);
                  }}
                  disabled={captureGamepad}
                  style={{ padding: '8px 10px' }}
                >
                  {captureKey ? 'Press any key…' : 'Set'}
                </button>
                <div style={{ fontSize: 12, color: '#555' }}>
                  {captureKey ? 'ESC cancels' : widget.bindings?.key ? `Key: ${String(widget.bindings.key)}` : 'Key: (none)'}
                </div>
                {widget.bindings?.key ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        document.activeElement?.blur?.();
                      } catch (_) {
                        // ignore
                      }
                      setCaptureKey(false);
                      setCaptureGamepad(false);
                      setCaptureJoystickAxes(false);
                      setField(['bindings', 'key'], '');
                    }}
                    disabled={captureKey || captureGamepad}
                    style={{ padding: '8px 10px' }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </label>
          ) : null}

          {widget.type === 'button' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Gamepad button (optional)
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCaptureGamepad((v) => !v);
                    setCaptureKey(false);
                    setCaptureJoystickAxes(false);
                  }}
                  disabled={captureKey || typeof navigator?.getGamepads !== 'function'}
                  style={{ padding: '8px 10px' }}
                >
                  {captureGamepad ? 'Press a gamepad button…' : 'Learn'}
                </button>
                <div style={{ fontSize: 12, color: '#555' }}>
                  {typeof navigator?.getGamepads !== 'function'
                    ? 'Gamepad API not available'
                    : captureGamepad
                      ? 'ESC cancels'
                      : Number(widget.bindings?.gamepad?.button ?? -1) >= 0
                        ? `Pad ${Number(widget.bindings?.gamepad?.index ?? 0)} / Btn ${Number(widget.bindings?.gamepad?.button ?? -1)}`
                        : 'Button: (none)'}
                </div>
                {Number(widget.bindings?.gamepad?.button ?? -1) >= 0 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        document.activeElement?.blur?.();
                      } catch (_) {
                        // ignore
                      }
                      setCaptureGamepad(false);
                      setCaptureKey(false);
                      setCaptureJoystickAxes(false);
                      setField(['bindings', 'gamepad', 'button'], -1, (next) => {
                        if (!next.bindings) next.bindings = {};
                        if (!next.bindings.gamepad) next.bindings.gamepad = {};
                        next.bindings.gamepad.button = -1;
                      });
                    }}
                    disabled={captureKey || captureGamepad}
                    style={{ padding: '8px 10px' }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </label>
          ) : null}

          {widget.type === 'slider' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Orientation
              <select
                value={widget.props?.orientation || 'h'}
                onChange={(e) => {
                  const orientation = e.target.value === 'v' ? 'v' : 'h';
                  setField(['props', 'orientation'], orientation, (next) => {
                    if (!next.layout) return;
                    if (orientation === 'h') {
                      next.layout.w = 5;
                      next.layout.h = 1;
                    } else {
                      next.layout.w = 1;
                      next.layout.h = 5;
                    }
                  });
                }}
                style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
              >
                <option value="h">Horizontal</option>
                <option value="v">Vertical</option>
              </select>
            </label>
          ) : null}

          {widget.type === 'timer' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Every (ms)
              <input
                type="number"
                value={Number(widget.bindings?.everyMs ?? 1000)}
                onChange={(e) => setField(['bindings', 'everyMs'], Number(e.target.value))}
                style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
              />
            </label>
          ) : null}

          {widget.type === 'joystick' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Gamepad axes (optional)
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCaptureJoystickAxes((v) => !v);
                    setCaptureKey(false);
                    setCaptureGamepad(false);
                  }}
                  disabled={captureKey || captureGamepad || typeof navigator?.getGamepads !== 'function'}
                  style={{ padding: '8px 10px' }}
                >
                  {captureJoystickAxes ? 'Move a stick…' : 'Set'}
                </button>
                <div style={{ fontSize: 12, color: '#555' }}>
                  {typeof navigator?.getGamepads !== 'function'
                    ? 'Gamepad API not available'
                    : captureJoystickAxes
                      ? 'ESC cancels'
                      : Number(widget.bindings?.gamepad?.axisX ?? -1) >= 0 || Number(widget.bindings?.gamepad?.axisY ?? -1) >= 0
                        ? `Pad ${Number(widget.bindings?.gamepad?.index ?? 0)} / Axes ${Number(
                            widget.bindings?.gamepad?.axisX ?? -1,
                          )},${Number(widget.bindings?.gamepad?.axisY ?? -1)}`
                        : 'Axes: (none)'}
                </div>
                {Number(widget.bindings?.gamepad?.axisX ?? -1) >= 0 || Number(widget.bindings?.gamepad?.axisY ?? -1) >= 0 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCaptureJoystickAxes(false);
                      setField(['bindings', 'gamepad', 'axisX'], -1, (next) => {
                        if (!next.bindings) next.bindings = {};
                        if (!next.bindings.gamepad) next.bindings.gamepad = {};
                        next.bindings.gamepad.axisX = -1;
                        next.bindings.gamepad.axisY = -1;
                      });
                    }}
                    disabled={captureJoystickAxes || captureKey || captureGamepad}
                    style={{ padding: '8px 10px' }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </label>
          ) : null}
        </div>

        <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Bindings</div>

          {widget.type === 'button' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                onPress → routine
                <select
                  value={widget.bindings?.onPress || ''}
                  onChange={(e) => setField(['bindings', 'onPress'], e.target.value)}
                  style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
                >
                  {routineOptions.map((r) => (
                    <option key={`rp-${r.id}`} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                onRelease → routine
                <select
                  value={widget.bindings?.onRelease || ''}
                  onChange={(e) => setField(['bindings', 'onRelease'], e.target.value)}
                  style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
                >
                  {routineOptions.map((r) => (
                    <option key={`rr-${r.id}`} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {widget.type === 'slider' || widget.type === 'joystick' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 260 }}>
              on value change → routine
              <select
                value={widget.bindings?.onChange || ''}
                onChange={(e) => setField(['bindings', 'onChange'], e.target.value)}
                style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
              >
                {routineOptions.map((r) => (
                  <option key={`vc-${r.id}`} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {widget.type === 'timer' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 260 }}>
              on tick → routine
              <select
                value={widget.bindings?.onTick || ''}
                onChange={(e) => setField(['bindings', 'onTick'], e.target.value)}
                style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
              >
                {routineOptions.map((r) => (
                  <option key={`tk-${r.id}`} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
          <button
            onClick={async () => {
              const ok = window.confirm(`Delete widget "${widget.name}"?`);
              if (!ok) return;
              const deleted = await onDelete?.(widget.id);
              if (deleted === false) return;
              onClose();
            }}
            style={{ background: '#fff', border: '1px solid #c62828', color: '#c62828' }}
          >
            Delete widget
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

const LedWidget = ({ name, shape, liveColor }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
    <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, textAlign: 'center' }}>{name}</div>
    <div
      style={{
        width: 24,
        height: 24,
        background: liveColor,
        borderRadius: shape === 'square' ? 6 : 99,
        border: '1px solid rgba(0,0,0,0.25)',
      }}
    />
  </div>
);

const DisplayWidget = ({ name, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
    <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, textAlign: 'center' }}>{name}</div>
    <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{String(value ?? '')}</div>
  </div>
);

const JoystickWidget = ({ name, onChange, runMode }) => {
  const zoneRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 }); // px offset from center

  const knobSize = GRID_PX; // requested 32x32 active part

  const setFromClientXY = useCallback(
    (clientX, clientY) => {
      const el = zoneRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const maxR = Math.max(1, Math.min(r.width, r.height) / 2 - knobSize / 2 - 4);
      const len = Math.hypot(dx, dy);
      const scale = len > maxR ? maxR / len : 1;
      const px = dx * scale;
      const py = dy * scale;
      setKnob({ x: px, y: py });
      const x = clamp(px / maxR, -1, 1);
      const y = clamp(py / maxR, -1, 1); // gamepad-like: down = +1, up = -1
      onChange?.({ x, y });
    },
    [knobSize, onChange],
  );

  const reset = useCallback(() => {
    setKnob({ x: 0, y: 0 });
    onChange?.({ x: 0, y: 0 });
  }, [onChange]);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 8, top: 6, fontSize: 12, fontWeight: 600 }}>{name}</div>
      <div
        ref={zoneRef}
        className={runMode ? 'controller-no-drag' : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: runMode ? 'none' : 'auto',
        }}
        onPointerDown={(e) => {
          if (!runMode) return;
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId);
          } catch (_) {
            // ignore
          }
          setFromClientXY(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!runMode) return;
          if (!(e.buttons & 1)) return;
          setFromClientXY(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          if (!runMode) return;
          reset();
        }}
        onPointerCancel={() => {
          if (!runMode) return;
          reset();
        }}
        onLostPointerCapture={() => {
          if (!runMode) return;
          reset();
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '70%',
              height: '70%',
              borderRadius: 999,
              border: '2px solid rgba(11,61,145,0.25)',
              background: 'radial-gradient(circle, rgba(11,61,145,0.10) 0%, rgba(11,61,145,0.03) 60%, transparent 70%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: knobSize,
              height: knobSize,
              borderRadius: 10,
              background: '#0b3d91',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              transform: `translate(${knob.x}px, ${knob.y}px)`,
              opacity: runMode ? 1 : 0.65,
            }}
          />
        </div>
      </div>
    </div>
  );
};

const ControllerTab = forwardRef(function ControllerTab(
  {
    ipc,
    projectId,
    status,
    calibration,
    projectModules,
    battery,
    routines,
    controllerData,
    routineXmlRamCacheRef,
    onUpdateControllerData,
    addLog,
  },
  ref,
) {
  const widgets = Array.isArray(controllerData?.widgets) ? controllerData.widgets : [];
  const [runMode, setRunMode] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [configWidgetId, setConfigWidgetId] = useState('');
  const { width: gridWidth, mounted: gridMounted, containerRef: gridHostRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 1200,
  });
  const cols = useMemo(() => Math.max(1, Math.floor(Number(gridWidth || 0) / GRID_PX)), [gridWidth]);
  const snappedWidth = useMemo(() => Math.max(GRID_PX, cols * GRID_PX), [cols]);
  const colPx = GRID_PX;

  const runningRef = useRef(new Map()); // routineId -> { cancelRef }
  const lastStartRef = useRef(new Map()); // routineId -> ts
  const widgetsRef = useRef(widgets);
  const prevButtonsRef = useRef(new Map()); // widgetId -> bool
  const prevJoyRef = useRef(new Map()); // widgetId -> {x,y}
  const buttonSourcesRef = useRef(new Map()); // widgetId -> { mouse, key, pad }
  const buttonEffectiveRef = useRef(new Map()); // widgetId -> bool (momentary effective pressed)

  const getWidget = (id) => widgets.find((w) => String(w?.id) === String(id)) || null;
  const selectedWidget = getWidget(selectedId);
  const configWidget = getWidget(configWidgetId);

  useEffect(() => {
    widgetsRef.current = widgets;
  }, [widgets]);

  const updateWidgets = useCallback((nextWidgets) => {
    onUpdateControllerData?.((prev) => ({ ...(prev || {}), widgets: nextWidgets }));
  }, [onUpdateControllerData]);

  const findRoutinesUsingWidget = useCallback(async (widget) => {
    if (!widget?.name) return [];
    const kind = String(widget.type || '');
    const name = String(widget.name || '').trim();
    if (!name) return [];

    const typesByWidgetKind = {
      slider: ['jimu_get_slider'],
      joystick: ['jimu_get_joystick'],
      button: ['jimu_get_button', 'jimu_get_switch'],
      led: ['jimu_indicator_color'],
      display: ['jimu_display_show'],
    };
    const blockTypes = typesByWidgetKind[kind] || [];
    if (!blockTypes.length) return [];

    const parseUses = (xmlText) => {
      try {
        const doc = new DOMParser().parseFromString(String(xmlText || ''), 'text/xml');
        const blocks = Array.from(doc.getElementsByTagNameNS('*', 'block'));
        for (const b of blocks) {
          const t = String(b.getAttribute('type') || '');
          if (!blockTypes.includes(t)) continue;
          const fields = Array.from(b.getElementsByTagNameNS('*', 'field'));
          for (const f of fields) {
            if (String(f.getAttribute('name') || '') !== 'NAME') continue;
            const v = String(f.textContent || '').trim();
            if (v === name) return true;
          }
        }
      } catch (_) {
        // ignore
      }
      return false;
    };

    const list = Array.isArray(routines) ? routines : [];
    const results = [];
    for (const r of list) {
      const rid = String(r?.id || '');
      if (!rid) continue;
      let xml = '';
      try {
        xml = String(routineXmlRamCacheRef?.current?.get?.(rid) ?? '');
      } catch (_) {
        xml = '';
      }
      if (!xml && ipc && projectId) {
        try {
          const res = await ipc.invoke('routine:loadXml', { projectId, routineId: rid });
          xml = String(res?.xml || '');
        } catch (_) {
          xml = '';
        }
      }
      if (!xml) continue;
      if (parseUses(xml)) results.push({ id: rid, name: String(r?.name || rid) });
    }
    return results;
  }, [ipc, projectId, routines, routineXmlRamCacheRef]);

  const setButtonUiValue = useCallback((widgetId, mode, value) => {
    const current = widgetsRef.current || [];
    const next = current.map((x) =>
      x.id === widgetId ? { ...x, props: { ...(x.props || {}), mode, value: Boolean(value) } } : x,
    );
    widgetsRef.current = next;
    updateWidgets(next);
  }, [updateWidgets]);

  useEffect(() => {
    const namesByKind = {
      slider: [],
      joystick: [],
      button: [],
      led: [],
      display: [],
    };
    for (const w of widgets) {
      const type = String(w?.type || '');
      const name = String(w?.name || '').trim();
      if (!name) continue;
      if (type === 'slider') namesByKind.slider.push(name);
      if (type === 'joystick') namesByKind.joystick.push(name);
      if (type === 'button') namesByKind.button.push(name);
      if (type === 'led') namesByKind.led.push(name);
      if (type === 'display') namesByKind.display.push(name);
    }
    setControllerWidgetOptionsProvider((kind) => namesByKind[String(kind || '')] || []);
    return () => setControllerWidgetOptionsProvider(null);
  }, [widgets]);

  useEffect(() => {
    const modules = projectModules || {};
    const servos = Array.isArray(modules.servos) ? modules.servos.map(Number).filter((n) => Number.isFinite(n)) : [];
    const motors = Array.isArray(modules.motors) ? modules.motors.map(Number).filter((n) => Number.isFinite(n)) : [];
    const ir = Array.isArray(modules.ir) ? modules.ir.map(Number).filter((n) => Number.isFinite(n)) : [];
    const ultrasonic = Array.isArray(modules.ultrasonic)
      ? modules.ultrasonic.map(Number).filter((n) => Number.isFinite(n))
      : [];
    const eyes = Array.isArray(modules.eyes) ? modules.eyes.map(Number).filter((n) => Number.isFinite(n)) : [];

    const cfg = calibration || {};
    const servoConfig = cfg.servoConfig || {};
    const servoMode = (id) => {
      const c = servoConfig?.[id] || servoConfig?.[String(id)] || null;
      return String(c?.mode || 'servo');
    };
    const servoAny = servos;
    const servoPosition = servos.filter((id) => {
      const m = servoMode(id);
      return m === 'servo' || m === 'mixed' || !m;
    });
    const servoRotate = servos.filter((id) => {
      const m = servoMode(id);
      return m === 'motor' || m === 'mixed';
    });

    setIdOptionsProvider((kind) => {
      if (kind === 'eyes') return eyes;
      if (kind === 'ultrasonic') return ultrasonic;
      if (kind === 'ir') return ir;
      if (kind === 'motor') return motors;
      if (kind === 'servoAny') return servoAny;
      if (kind === 'servoPosition') return servoPosition;
      if (kind === 'servoRotate') return servoRotate;
      return [];
    });
    return () => setIdOptionsProvider(null);
  }, [projectModules, calibration]);

  // One-time migrations for older controller data.
  useEffect(() => {
    let changed = false;
    const nextWidgets = widgets.map((w) => {
      if (w?.type === 'switch') {
        changed = true;
        return {
          ...w,
          type: 'button',
          props: { mode: BUTTON_MODE_TOGGLE, value: Boolean(w.props?.value) },
          bindings: {
            onPress: String(w.bindings?.onOn || ''),
            onRelease: String(w.bindings?.onOff || ''),
            key: '',
            gamepad: { index: 0, button: -1 },
          },
        };
      }

      if (w?.type === 'slider') {
        const lw = Number(w.layout?.w);
        const lh = Number(w.layout?.h);
        // Old default was 2x6; keep custom sizes as-is.
        if (lw === 2 && lh === 6) {
          changed = true;
          const orientation = w.props?.orientation === 'v' ? 'v' : 'h';
          const nextLayout = {
            ...(w.layout || { i: w.id, x: 0, y: 0, w: 1, h: 1 }),
            w: orientation === 'v' ? 1 : 5,
            h: orientation === 'v' ? 5 : 1,
          };
          return { ...w, layout: nextLayout, props: { ...(w.props || {}), orientation } };
        }
      }

      return w;
    });
    if (changed) updateWidgets(nextWidgets);
  }, [widgets]);

  useEffect(() => {
    if (!runMode) return;
    setConfigWidgetId('');
  }, [runMode]);

  const startRoutine = useCallback(
    async (routineId) => {
      const rid = String(routineId || '');
      if (!rid) return;
      if (runningRef.current.has(rid)) return;
      const now = Date.now();
      const last = Number(lastStartRef.current.get(rid) || 0);
      if (now - last < ROUTINE_RETRIGGER_COOLDOWN_MS) return;
      lastStartRef.current.set(rid, now);

      if (!ipc || !projectId) return;
      const cancelRef = { current: { isCancelled: false, onCancel: null } };
      runningRef.current.set(rid, { cancelRef });

      try {
        let xml = '';
        try {
          xml = String(routineXmlRamCacheRef?.current?.get(rid) ?? '');
        } catch (_) {
          xml = '';
        }
        if (!xml) {
          const res = await ipc.invoke('routine:loadXml', { projectId, routineId: rid });
          xml = String(res?.xml || '');
          try {
            routineXmlRamCacheRef?.current?.set?.(rid, xml);
          } catch (_) {
            // ignore
          }
        }
        const src = xmlTextToAsyncJs(xml, { debug: true });
        // eslint-disable-next-line no-new-func
        const fn = new Function('api', src);
        const api = createRoutineApi({
          ipc,
          calibration,
          projectModules,
          battery,
          // Important: don't pass addLog here, otherwise api.log() writes twice:
          // once via appendTrace and once via addLog.
          addLog: null,
          appendTrace: (t) => addLog?.(`[Controller] ${String(t ?? '')}`),
          cancelRef,
          getWorkspace: () => null,
          stepDelayMs: 0,
        });
        await fn(api);
      } catch (e) {
        addLog?.(`[Controller] Routine error: ${e?.message || String(e)}`);
      } finally {
        runningRef.current.delete(rid);
      }
    },
    [ipc, projectId, calibration, projectModules, battery, addLog, routineXmlRamCacheRef],
  );

  useImperativeHandle(
    ref,
    () => ({
      stopAllRoutines: async () => {
        for (const v of runningRef.current.values()) {
          try {
            v?.cancelRef?.current && (v.cancelRef.current.isCancelled = true);
            v?.cancelRef?.current?.onCancel?.();
          } catch (_) {
            // ignore
          }
        }
        runningRef.current.clear();
      },
    }),
    [],
  );

  // Timer triggers
  useEffect(() => {
    if (!runMode) return;
    const timers = [];
    for (const w of widgets) {
      if (w.type !== 'timer') continue;
      const everyMs = clamp(Number(w.bindings?.everyMs ?? 1000), 10, 60_000);
      const rid = String(w.bindings?.onTick || '');
      if (!rid) continue;
      const t = setInterval(() => startRoutine(rid).catch(() => {}), everyMs);
      timers.push(t);
    }
    return () => timers.forEach((t) => clearInterval(t));
  }, [runMode, widgets, startRoutine]);

  // Publish initial widget values into the controller state store when entering run mode.
  useEffect(() => {
    if (!runMode) return;
    try {
      globalVars.varResetToInit?.();
    } catch (_) {
      // ignore
    }
    for (const w of widgets) {
      if (w.type === 'button') controllerState.switchSet(w.name, Boolean(w.props?.value));
      if (w.type === 'slider') controllerState.sliderSet(w.name, Number(w.props?.value ?? 0));
      if (w.type === 'joystick') controllerState.joystickSet(w.name, { x: 0, y: 0 });
      if (w.type === 'led') controllerState.indicatorSet(w.name, controllerState.indicatorGet(w.name));
      if (w.type === 'display') controllerState.displaySet(w.name, controllerState.displayGet(w.name));
    }
  }, [runMode]);

  useEffect(() => {
    if (!runMode) return;
    buttonSourcesRef.current.clear();
    buttonEffectiveRef.current.clear();
    prevButtonsRef.current.clear();
    prevJoyRef.current.clear();
  }, [runMode]);

  const setMomentaryButtonSource = useCallback((widgetId, source, isPressed) => {
    const ws = widgetsRef.current || [];
    const w = ws.find((x) => String(x?.id) === String(widgetId));
    if (!w || w.type !== 'button') return;

    const mode = w.props?.mode === BUTTON_MODE_TOGGLE ? BUTTON_MODE_TOGGLE : BUTTON_MODE_MOMENTARY;
    if (mode === BUTTON_MODE_TOGGLE) return;

    const key = String(w.id);
    const prevSources = buttonSourcesRef.current.get(key) || { mouse: false, key: false, pad: false };
    const nextSources = { ...prevSources, [source]: Boolean(isPressed) };
    buttonSourcesRef.current.set(key, nextSources);

    const effective = Boolean(nextSources.mouse || nextSources.key || nextSources.pad);
    const prevEffective = Boolean(buttonEffectiveRef.current.get(key) ?? false);
    const currentVal = Boolean(w.props?.value);

    if (effective === prevEffective) {
      if (currentVal !== effective) {
        controllerState.switchSet(w.name, effective);
        setButtonUiValue(w.id, mode, effective);
      }
      return;
    }

    buttonEffectiveRef.current.set(key, effective);
    controllerState.switchSet(w.name, effective);

    const rid = effective ? String(w.bindings?.onPress || '') : String(w.bindings?.onRelease || '');
    if (rid) startRoutine(rid).catch(() => {});
    setButtonUiValue(w.id, mode, effective);
  }, [setButtonUiValue, startRoutine]);

  // Keyboard triggers (buttons only, for now)
  useEffect(() => {
    if (!runMode) return;
    const onDown = (e) => {
      if (e.repeat) return;
      const code = String(e.code || '');
      if (!code) return;
      const ws = widgetsRef.current || [];
      for (const w of ws) {
        if (w.type !== 'button') continue;
        if (!w.bindings?.key) continue;
        if (String(w.bindings.key) === code) {
          const mode = w.props?.mode === BUTTON_MODE_TOGGLE ? BUTTON_MODE_TOGGLE : BUTTON_MODE_MOMENTARY;
          if (mode === BUTTON_MODE_TOGGLE) {
            const nextVal = !Boolean(w.props?.value);
            controllerState.switchSet(w.name, nextVal);
            const rid = nextVal ? String(w.bindings?.onPress || '') : String(w.bindings?.onRelease || '');
            if (rid) startRoutine(rid).catch(() => {});
            setButtonUiValue(w.id, mode, nextVal);
          } else {
            setMomentaryButtonSource(w.id, 'key', true);
          }
        }
      }
    };
    const onUp = (e) => {
      const code = String(e.code || '');
      if (!code) return;
      const ws = widgetsRef.current || [];
      for (const w of ws) {
        if (w.type !== 'button') continue;
        if (!w.bindings?.key) continue;
        if (String(w.bindings.key) !== code) continue;
        const mode = w.props?.mode === BUTTON_MODE_TOGGLE ? BUTTON_MODE_TOGGLE : BUTTON_MODE_MOMENTARY;
        if (mode === BUTTON_MODE_TOGGLE) continue;
        setMomentaryButtonSource(w.id, 'key', false);
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [runMode, startRoutine, setButtonUiValue, setMomentaryButtonSource]);

  // Gamepad triggers (buttons + joystick axes)
  useEffect(() => {
    if (!runMode) return;
    if (typeof navigator?.getGamepads !== 'function') return;

    const setButtonValue = (widgetId, name, mode, value, routineId) => {
      controllerState.switchSet(name, Boolean(value));
      if (routineId) startRoutine(routineId).catch(() => {});
      setButtonUiValue(widgetId, mode, value);
    };

    const tick = () => {
      const pads = navigator.getGamepads?.() || [];
      const ws = widgetsRef.current || [];
      for (const w of ws) {
        if (w.type === 'button') {
          const idx = Number(w.bindings?.gamepad?.index ?? 0);
          const btn = Number(w.bindings?.gamepad?.button ?? -1);
          if (btn < 0) continue;
          const pad = pads[idx];
          const pressed = Boolean(pad?.buttons?.[btn]?.pressed);
          const prev = Boolean(prevButtonsRef.current.get(w.id) ?? false);
          const mode = w.props?.mode === BUTTON_MODE_TOGGLE ? BUTTON_MODE_TOGGLE : BUTTON_MODE_MOMENTARY;
          if (mode === BUTTON_MODE_TOGGLE) {
            if (!prev && pressed) {
              const nextVal = !Boolean(w.props?.value);
              const rid = nextVal ? String(w.bindings?.onPress || '') : String(w.bindings?.onRelease || '');
              setButtonValue(w.id, w.name, mode, nextVal, rid);
            }
          } else {
            setMomentaryButtonSource(w.id, 'pad', pressed);
          }
          prevButtonsRef.current.set(w.id, pressed);
        }

        if (w.type === 'joystick') {
          const idx = Number(w.bindings?.gamepad?.index ?? 0);
          const ax = Number(w.bindings?.gamepad?.axisX ?? -1);
          const ay = Number(w.bindings?.gamepad?.axisY ?? -1);
          if (ax < 0 && ay < 0) continue;
          const pad = pads[idx];
          const x = ax >= 0 ? clamp(Number(pad?.axes?.[ax] ?? 0), -1, 1) : 0;
          const y = ay >= 0 ? clamp(Number(pad?.axes?.[ay] ?? 0), -1, 1) : 0;
          const prev = prevJoyRef.current.get(w.id) || { x: 0, y: 0 };
          const changed = Math.abs(x - prev.x) > 0.01 || Math.abs(y - prev.y) > 0.01;
          if (changed) {
            controllerState.joystickSet(w.name, { x, y });
            const rid = String(w.bindings?.onChange || '');
            if (rid) startRoutine(rid).catch(() => {});
            prevJoyRef.current.set(w.id, { x, y });
          }
        }
      }
    };

    const t = setInterval(tick, 50);
    return () => clearInterval(t);
  }, [runMode, startRoutine, setButtonUiValue, setMomentaryButtonSource]);

  // Live store subscription to re-render LEDs/displays
  const [, bump] = useState(0);
  useEffect(() => controllerState.subscribe(() => bump((x) => x + 1)), []);

  const layout = useMemo(() => widgets.map((w) => w.layout || { i: w.id, x: 0, y: 0, w: 3, h: 2 }), [widgets]);

  if (!projectId) return <div style={{ color: '#777' }}>Open a project first.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          Status:{' '}
          <strong style={{ color: status === 'Connected' ? '#1b5e20' : '#888' }}>
            {status === 'Connected' ? 'Connected' : 'Disconnected'}
          </strong>
        </span>
        <button onClick={() => setRunMode((p) => !p)}>{runMode ? 'Design' : 'Run'}</button>
        <span style={{ color: '#777', fontSize: 12 }}>
          grid {GRID_PX}px | cell {Math.round(colPx * 10) / 10}×{GRID_PX} | cols {cols}
        </span>
        {!runMode ? (
          <>
            <button
              onClick={() => {
                const w = defaultWidget('button', widgets);
                updateWidgets([...widgets, w]);
                setSelectedId(w.id);
              }}
            >
              + Button
            </button>
            <button
              onClick={() => {
                const w = defaultWidget('slider', widgets);
                updateWidgets([...widgets, w]);
                setSelectedId(w.id);
              }}
            >
              + Slider
            </button>
            <button
              onClick={() => {
                const w = defaultWidget('joystick', widgets);
                updateWidgets([...widgets, w]);
                setSelectedId(w.id);
              }}
            >
              + Joystick
            </button>
            <button
              onClick={() => {
                const w = defaultWidget('led', widgets);
                updateWidgets([...widgets, w]);
                setSelectedId(w.id);
              }}
            >
              + LED
            </button>
            <button
              onClick={() => {
                const w = defaultWidget('display', widgets);
                updateWidgets([...widgets, w]);
                setSelectedId(w.id);
              }}
            >
              + Display
            </button>
            <button
              onClick={() => {
                const w = defaultWidget('timer', widgets);
                w.type = 'timer';
                w.name = uniqName(widgets, 'Timer');
                w.layout = { i: w.id, x: 0, y: getNextY(widgets), w: 1, h: 1 };
                w.bindings = { everyMs: 1000, onTick: '' };
                updateWidgets([...widgets, w]);
                setSelectedId(w.id);
              }}
            >
              + Timer
            </button>
          </>
        ) : null}
        <div style={{ marginLeft: 'auto', color: '#777' }}>{widgets.length} widget(s)</div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          border: '1px solid #ddd',
          borderRadius: 8,
          background: '#fff',
          overflow: 'auto',
          position: 'relative',
        }}
        ref={gridHostRef}
      >
        {!runMode ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(11,61,145,0.06) 0 1px, transparent 1px 100%), repeating-linear-gradient(90deg, rgba(11,61,145,0.06) 0 1px, transparent 1px 100%)',
              backgroundSize: `${GRID_PX}px ${GRID_PX}px`,
            }}
          />
        ) : null}
        {gridMounted ? (
          <GridLayout
          className="layout"
          layout={layout}
          width={snappedWidth}
          gridConfig={{
            cols,
             rowHeight: GRID_PX,
             margin: [0, 0],
             containerPadding: [0, 0],
           }}
          compactor={overlapNoCompactor}
          dragConfig={{
            enabled: !runMode,
          }}
          resizeConfig={{
            enabled: !runMode,
          }}
          style={{
            minHeight: '100%',
            position: 'relative',
            zIndex: 1,
          }}
          onLayoutChange={(next) => {
            if (runMode) return;
            const nextFixed = next.map((l) => {
              const w = widgets.find((x) => String(x.id) === String(l.i));
              if (!w || w.type !== 'joystick') return l;
              const size = Math.max(Number(l.w || 1), Number(l.h || 1));
              return { ...l, w: size, h: size };
            });
            const byId = new Map(nextFixed.map((l) => [String(l.i), l]));
            updateWidgets(
              widgets.map((w) => ({
                ...w,
                layout: byId.get(String(w.id)) || w.layout,
              })),
            );
          }}
        >
          {widgets.map((w) => {
            const isSelected = String(w.id) === String(selectedId);
            const commonStyle = {
              border: isSelected ? '2px solid #0b3d91' : '1px solid #ddd',
              borderRadius: 8,
              background: '#fafafa',
              padding: 4,
              overflow: 'hidden',
              cursor: runMode ? 'default' : 'pointer',
              userSelect: 'none',
              boxSizing: 'border-box',
            };

            if (w.type === 'button') {
              const mode = w.props?.mode === BUTTON_MODE_TOGGLE ? BUTTON_MODE_TOGGLE : BUTTON_MODE_MOMENTARY;
              const val = Boolean(w.props?.value);
              return (
                <div
                  key={w.id}
                  style={commonStyle}
                  onPointerDown={() => !runMode && setSelectedId(w.id)}
                  onContextMenu={(e) => {
                    if (runMode) return;
                    e.preventDefault();
                    setSelectedId(w.id);
                    setConfigWidgetId(w.id);
                  }}
                >
                  <button
                    disabled={!runMode}
                    aria-pressed={mode === BUTTON_MODE_TOGGLE ? val : undefined}
                    style={{
                      width: '100%',
                      height: '100%',
                      minWidth: 0,
                      minHeight: 0,
                      touchAction: 'manipulation',
                      background: val ? '#0b3d91' : undefined,
                      color: val ? '#fff' : undefined,
                    }}
                    onClick={() => {
                      if (!runMode) return;
                      if (mode !== BUTTON_MODE_TOGGLE) return;
                      const nextVal = !Boolean(w.props?.value);
                      controllerState.switchSet(w.name, nextVal);
                      const rid = nextVal ? String(w.bindings?.onPress || '') : String(w.bindings?.onRelease || '');
                      if (rid) startRoutine(rid).catch(() => {});
                      updateWidgets(
                        widgets.map((x) => (x.id === w.id ? { ...x, props: { ...(x.props || {}), mode, value: nextVal } } : x)),
                      );
                    }}
                    onPointerDown={(e) => {
                      if (!runMode) return;
                      if (mode === BUTTON_MODE_TOGGLE) return;
                      try {
                        e.currentTarget?.setPointerCapture?.(e.pointerId);
                      } catch (_) {
                        // ignore
                      }
                      setMomentaryButtonSource(w.id, 'mouse', true);
                    }}
                    onPointerUp={() => {
                      if (!runMode) return;
                      if (mode === BUTTON_MODE_TOGGLE) return;
                      setMomentaryButtonSource(w.id, 'mouse', false);
                    }}
                    onPointerCancel={() => {
                      if (!runMode) return;
                      if (mode === BUTTON_MODE_TOGGLE) return;
                      setMomentaryButtonSource(w.id, 'mouse', false);
                    }}
                  >
                    {w.name}
                  </button>
                </div>
              );
            }

            if (w.type === 'slider') {
              const isV = (w.props?.orientation || 'h') === 'v';
              return (
                <div
                  key={w.id}
                  style={commonStyle}
                  title={w.name}
                  onPointerDown={() => !runMode && setSelectedId(w.id)}
                  onContextMenu={(e) => {
                    if (runMode) return;
                    e.preventDefault();
                    setSelectedId(w.id);
                    setConfigWidgetId(w.id);
                  }}
                >
                  <input
                    type="range"
                    disabled={!runMode}
                    min={Number(w.props?.min ?? 0)}
                    max={Number(w.props?.max ?? 100)}
                    step={Number(w.props?.step ?? 1)}
                    value={Number(w.props?.value ?? 0)}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      controllerState.sliderSet(w.name, val);
                      const rid = String(w.bindings?.onChange || '');
                      if (rid) startRoutine(rid).catch(() => {});
                      updateWidgets(widgets.map((x) => (x.id === w.id ? { ...x, props: { ...(x.props || {}), value: val } } : x)));
                    }}
                    style={
                      isV
                        ? {
                            width: '100%',
                            height: '100%',
                            writingMode: 'bt-lr',
                            WebkitAppearance: 'slider-vertical',
                            touchAction: 'none',
                          }
                        : { width: '100%', height: '100%', touchAction: 'none' }
                    }
                  />
                </div>
              );
            }

            if (w.type === 'joystick') {
              return (
                <div
                  key={w.id}
                  style={commonStyle}
                  onPointerDown={() => !runMode && setSelectedId(w.id)}
                  onContextMenu={(e) => {
                    if (runMode) return;
                    e.preventDefault();
                    setSelectedId(w.id);
                    setConfigWidgetId(w.id);
                  }}
                >
                  <div style={{ height: '100%', width: '100%', pointerEvents: runMode ? 'auto' : 'none' }}>
                    <JoystickWidget
                      name={w.name}
                      runMode={runMode}
                      onChange={(xy) => {
                        controllerState.joystickSet(w.name, xy);
                        const rid = String(w.bindings?.onChange || '');
                        if (rid) startRoutine(rid).catch(() => {});
                      }}
                    />
                  </div>
                </div>
              );
            }

            if (w.type === 'led') {
              return (
                <div
                  key={w.id}
                  style={commonStyle}
                  onPointerDown={() => !runMode && setSelectedId(w.id)}
                  onContextMenu={(e) => {
                    if (runMode) return;
                    e.preventDefault();
                    setSelectedId(w.id);
                    setConfigWidgetId(w.id);
                  }}
                >
                  <LedWidget name={w.name} shape={w.props?.shape || 'round'} liveColor={controllerState.indicatorGet(w.name)} />
                </div>
              );
            }

            if (w.type === 'display') {
              return (
                <div
                  key={w.id}
                  style={commonStyle}
                  onPointerDown={() => !runMode && setSelectedId(w.id)}
                  onContextMenu={(e) => {
                    if (runMode) return;
                    e.preventDefault();
                    setSelectedId(w.id);
                    setConfigWidgetId(w.id);
                  }}
                >
                  <DisplayWidget name={w.name} value={controllerState.displayGet(w.name)} />
                </div>
              );
            }

            if (w.type === 'timer') {
              return (
                <div
                  key={w.id}
                  style={commonStyle}
                  onPointerDown={() => !runMode && setSelectedId(w.id)}
                  onContextMenu={(e) => {
                    if (runMode) return;
                    e.preventDefault();
                    setSelectedId(w.id);
                    setConfigWidgetId(w.id);
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{w.name}</div>
                    <div style={{ color: '#777', fontSize: 12 }}>every {Number(w.bindings?.everyMs ?? 1000)} ms</div>
                    <div style={{ color: '#777', fontSize: 12 }}>{w.bindings?.onTick ? 'trigger: yes' : 'trigger: (none)'}</div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={w.id}
                style={commonStyle}
                onPointerDown={() => !runMode && setSelectedId(w.id)}
                onContextMenu={(e) => {
                  if (runMode) return;
                  e.preventDefault();
                  setSelectedId(w.id);
                  setConfigWidgetId(w.id);
                }}
              >
                {w.name}
              </div>
            );
          })}
          </GridLayout>
        ) : null}
      </div>

      <WidgetConfig
        open={!runMode && Boolean(configWidget)}
        widget={configWidget}
        routines={routines}
        onClose={() => setConfigWidgetId('')}
        onDelete={async (id) => {
          const w = widgets.find((x) => String(x?.id) === String(id)) || null;
          if (w) {
            const usedBy = await findRoutinesUsingWidget(w);
            if (usedBy.length) {
              window.alert(
                `Cannot delete "${w.name}" because it is used by routine(s):\n- ${usedBy.map((r) => r.name).join('\n- ')}`,
              );
              return false;
            }
          }
          updateWidgets(widgets.filter((x) => String(x.id) !== String(id)));
          setConfigWidgetId('');
          return true;
        }}
        onChange={(next) => {
          updateWidgets(widgets.map((w) => (w.id === next.id ? next : w)));
        }}
      />
    </div>
  );
});

export default ControllerTab;
