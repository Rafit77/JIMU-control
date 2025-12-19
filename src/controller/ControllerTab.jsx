import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import nipplejs from 'nipplejs';

import * as controllerState from './controller_state.js';
import { xmlTextToAsyncJs } from '../routines/blockly_mvp.js';
import { createRoutineApi } from '../routines/runtime_api.js';

const ROUTINE_RETRIGGER_COOLDOWN_MS = 300;

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

const defaultWidget = (type, widgets) => {
  const id = newId();
  const base =
    type === 'button'
      ? 'Button'
      : type === 'switch'
        ? 'Switch'
        : type === 'slider'
          ? 'Slider'
          : type === 'joystick'
            ? 'Joystick'
            : type === 'led'
              ? 'LED'
              : 'Display';
  const name = uniqName(widgets, base);
  const w = type === 'joystick' ? 3 : type === 'slider' ? 4 : 3;
  const h = type === 'joystick' ? 3 : 2;
  const widget = {
    id,
    type,
    name,
    layout: { i: id, x: 0, y: Infinity, w, h },
    props:
      type === 'slider'
        ? { orientation: 'h', min: 0, max: 100, step: 1, value: 0 }
        : type === 'switch'
          ? { value: false }
          : type === 'led'
            ? { shape: 'round', color: '#000000' }
            : type === 'display'
              ? { value: 0 }
              : {},
    bindings:
      type === 'button'
        ? { onPress: '', onRelease: '', key: '', gamepad: { index: 0, button: -1 } }
        : type === 'switch'
          ? { onOn: '', onOff: '' }
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
  if (!open || !widget) return null;
  const routineOptions = [{ id: '', name: '(none)' }, ...(Array.isArray(routines) ? routines : [])];

  const setField = (path, value) => {
    const next = JSON.parse(JSON.stringify(widget));
    let cur = next;
    for (let i = 0; i < path.length - 1; i += 1) cur = cur[path[i]];
    cur[path[path.length - 1]] = value;
    onChange(next);
  };

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
              Keyboard shortcut (optional)
              <input
                placeholder="e.g. Space, KeyA"
                value={widget.bindings?.key || ''}
                onChange={(e) => setField(['bindings', 'key'], e.target.value)}
                style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
              />
            </label>
          ) : null}

          {widget.type === 'button' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Gamepad button (optional)
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  title="Gamepad index"
                  value={Number(widget.bindings?.gamepad?.index ?? 0)}
                  onChange={(e) => setField(['bindings', 'gamepad', 'index'], Number(e.target.value))}
                  style={{ width: 90, padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
                />
                <input
                  type="number"
                  title="Button index (-1 = none)"
                  value={Number(widget.bindings?.gamepad?.button ?? -1)}
                  onChange={(e) => setField(['bindings', 'gamepad', 'button'], Number(e.target.value))}
                  style={{ width: 110, padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
                />
              </div>
            </label>
          ) : null}

          {widget.type === 'slider' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Orientation
              <select
                value={widget.props?.orientation || 'h'}
                onChange={(e) => setField(['props', 'orientation'], e.target.value === 'v' ? 'v' : 'h')}
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  title="Gamepad index"
                  value={Number(widget.bindings?.gamepad?.index ?? 0)}
                  onChange={(e) => setField(['bindings', 'gamepad', 'index'], Number(e.target.value))}
                  style={{ width: 90, padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
                />
                <input
                  type="number"
                  title="Axis X (-1 = none)"
                  value={Number(widget.bindings?.gamepad?.axisX ?? -1)}
                  onChange={(e) => setField(['bindings', 'gamepad', 'axisX'], Number(e.target.value))}
                  style={{ width: 110, padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
                />
                <input
                  type="number"
                  title="Axis Y (-1 = none)"
                  value={Number(widget.bindings?.gamepad?.axisY ?? -1)}
                  onChange={(e) => setField(['bindings', 'gamepad', 'axisY'], Number(e.target.value))}
                  style={{ width: 110, padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
                />
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

          {widget.type === 'switch' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                onOn → routine
                <select
                  value={widget.bindings?.onOn || ''}
                  onChange={(e) => setField(['bindings', 'onOn'], e.target.value)}
                  style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
                >
                  {routineOptions.map((r) => (
                    <option key={`so-${r.id}`} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                onOff → routine
                <select
                  value={widget.bindings?.onOff || ''}
                  onChange={(e) => setField(['bindings', 'onOff'], e.target.value)}
                  style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
                >
                  {routineOptions.map((r) => (
                    <option key={`sf-${r.id}`} value={r.id}>
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
            onClick={() => {
              const ok = window.confirm(`Delete widget "${widget.name}"?`);
              if (!ok) return;
              onDelete?.(widget.id);
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
  const hostRef = useRef(null);
  useEffect(() => {
    if (!runMode) return;
    if (!hostRef.current) return;
    const manager = nipplejs.create({
      zone: hostRef.current,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: '#0b3d91',
      size: 110,
    });
    const handleMove = (_e, data) => {
      const x = clamp(Number(data?.vector?.x ?? 0), -1, 1);
      const y = clamp(Number(data?.vector?.y ?? 0), -1, 1);
      onChange?.({ x, y });
    };
    const handleEnd = () => onChange?.({ x: 0, y: 0 });
    manager.on('move', handleMove);
    manager.on('end', handleEnd);
    return () => {
      try {
        manager.off('move', handleMove);
        manager.off('end', handleEnd);
        manager.destroy();
      } catch (_) {
        // ignore
      }
    };
  }, [runMode]);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 8, top: 6, fontSize: 12, fontWeight: 600 }}>{name}</div>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
    </div>
  );
};

const ControllerTab = forwardRef(function ControllerTab(
  { ipc, projectId, status, calibration, projectModules, battery, routines, controllerData, onUpdateControllerData, addLog },
  ref,
) {
  const widgets = Array.isArray(controllerData?.widgets) ? controllerData.widgets : [];
  const [runMode, setRunMode] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const { width: gridWidth, mounted: gridMounted, containerRef: gridHostRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 1200,
  });

  const runningRef = useRef(new Map()); // routineId -> { cancelRef }
  const lastStartRef = useRef(new Map()); // routineId -> ts

  const getWidget = (id) => widgets.find((w) => String(w?.id) === String(id)) || null;
  const selectedWidget = getWidget(selectedId);

  const updateWidgets = (nextWidgets) => {
    onUpdateControllerData?.((prev) => ({ ...(prev || {}), widgets: nextWidgets }));
  };

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
        const res = await ipc.invoke('routine:loadXml', { projectId, routineId: rid });
        const xml = String(res?.xml || '');
        const src = xmlTextToAsyncJs(xml, { debug: true });
        // eslint-disable-next-line no-new-func
        const fn = new Function('api', src);
        const api = createRoutineApi({
          ipc,
          calibration,
          projectModules,
          battery,
          addLog,
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
    [ipc, projectId, calibration, projectModules, battery, addLog],
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
    for (const w of widgets) {
      if (w.type === 'switch') controllerState.switchSet(w.name, Boolean(w.props?.value));
      if (w.type === 'slider') controllerState.sliderSet(w.name, Number(w.props?.value ?? 0));
      if (w.type === 'joystick') controllerState.joystickSet(w.name, { x: 0, y: 0 });
      if (w.type === 'led') controllerState.indicatorSet(w.name, controllerState.indicatorGet(w.name));
      if (w.type === 'display') controllerState.displaySet(w.name, controllerState.displayGet(w.name));
    }
  }, [runMode]);

  // Keyboard triggers (buttons only, for now)
  useEffect(() => {
    if (!runMode) return;
    const handler = (e) => {
      const code = String(e.code || '');
      if (!code) return;
      for (const w of widgets) {
        if (w.type !== 'button') continue;
        if (!w.bindings?.key) continue;
        if (String(w.bindings.key) === code) {
          const rid = String(w.bindings?.onPress || '');
          if (rid) startRoutine(rid).catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [runMode, widgets, startRoutine]);

  // Gamepad triggers (buttons + joystick axes)
  useEffect(() => {
    if (!runMode) return;
    if (typeof navigator?.getGamepads !== 'function') return;

    const prevButtons = new Map(); // widgetId -> bool
    const prevJoy = new Map(); // widgetId -> {x,y}
    const tick = () => {
      const pads = navigator.getGamepads?.() || [];
      for (const w of widgets) {
        if (w.type === 'button') {
          const idx = Number(w.bindings?.gamepad?.index ?? 0);
          const btn = Number(w.bindings?.gamepad?.button ?? -1);
          if (btn < 0) continue;
          const pad = pads[idx];
          const pressed = Boolean(pad?.buttons?.[btn]?.pressed);
          const prev = Boolean(prevButtons.get(w.id) ?? false);
          if (!prev && pressed) {
            const rid = String(w.bindings?.onPress || '');
            if (rid) startRoutine(rid).catch(() => {});
          }
          if (prev && !pressed) {
            const rid = String(w.bindings?.onRelease || '');
            if (rid) startRoutine(rid).catch(() => {});
          }
          prevButtons.set(w.id, pressed);
        }

        if (w.type === 'joystick') {
          const idx = Number(w.bindings?.gamepad?.index ?? 0);
          const ax = Number(w.bindings?.gamepad?.axisX ?? -1);
          const ay = Number(w.bindings?.gamepad?.axisY ?? -1);
          if (ax < 0 && ay < 0) continue;
          const pad = pads[idx];
          const x = ax >= 0 ? clamp(Number(pad?.axes?.[ax] ?? 0), -1, 1) : 0;
          const y = ay >= 0 ? clamp(Number(pad?.axes?.[ay] ?? 0), -1, 1) : 0;
          const prev = prevJoy.get(w.id) || { x: 0, y: 0 };
          const changed = Math.abs(x - prev.x) > 0.01 || Math.abs(y - prev.y) > 0.01;
          if (changed) {
            controllerState.joystickSet(w.name, { x, y });
            const rid = String(w.bindings?.onChange || '');
            if (rid) startRoutine(rid).catch(() => {});
            prevJoy.set(w.id, { x, y });
          }
        }
      }
    };

    const t = setInterval(tick, 50);
    return () => clearInterval(t);
  }, [runMode, widgets, startRoutine]);

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
                const w = defaultWidget('switch', widgets);
                updateWidgets([...widgets, w]);
                setSelectedId(w.id);
              }}
            >
              + Switch
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
                w.layout = { i: w.id, x: 0, y: Infinity, w: 3, h: 2 };
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
        style={{ flex: 1, minHeight: 0, border: '1px solid #ddd', borderRadius: 8, background: '#fff', overflow: 'hidden' }}
        ref={gridHostRef}
      >
        {gridMounted ? (
          <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={60}
          width={gridWidth}
          isDraggable={!runMode}
          isResizable={!runMode}
          onLayoutChange={(next) => {
            if (runMode) return;
            const byId = new Map(next.map((l) => [String(l.i), l]));
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
              padding: 6,
              overflow: 'hidden',
              cursor: runMode ? 'default' : 'pointer',
            };

            if (w.type === 'button') {
              return (
                <div key={w.id} style={commonStyle} onMouseDown={() => !runMode && setSelectedId(w.id)}>
                  <button
                    style={{ width: '100%', height: '100%' }}
                    onMouseDown={() => {
                      if (!runMode) return;
                      const rid = String(w.bindings?.onPress || '');
                      if (rid) startRoutine(rid).catch(() => {});
                    }}
                    onMouseUp={() => {
                      if (!runMode) return;
                      const rid = String(w.bindings?.onRelease || '');
                      if (rid) startRoutine(rid).catch(() => {});
                    }}
                  >
                    {w.name}
                  </button>
                </div>
              );
            }

            if (w.type === 'switch') {
              return (
                <div key={w.id} style={commonStyle} onMouseDown={() => !runMode && setSelectedId(w.id)}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', height: '100%' }}>
                    <input
                      type="checkbox"
                      disabled={!runMode}
                      checked={Boolean(w.props?.value)}
                      onChange={(e) => {
                        const val = Boolean(e.target.checked);
                        controllerState.switchSet(w.name, val);
                        const rid = val ? String(w.bindings?.onOn || '') : String(w.bindings?.onOff || '');
                        if (rid) startRoutine(rid).catch(() => {});
                        updateWidgets(widgets.map((x) => (x.id === w.id ? { ...x, props: { ...(x.props || {}), value: val } } : x)));
                      }}
                    />
                    <span>{w.name}</span>
                  </label>
                </div>
              );
            }

            if (w.type === 'slider') {
              return (
                <div key={w.id} style={commonStyle} onMouseDown={() => !runMode && setSelectedId(w.id)}>
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{w.name}</div>
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
                      style={{ flex: 1, width: '100%' }}
                    />
                  </div>
                </div>
              );
            }

            if (w.type === 'joystick') {
              return (
                <div key={w.id} style={commonStyle} onMouseDown={() => !runMode && setSelectedId(w.id)}>
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
              );
            }

            if (w.type === 'led') {
              return (
                <div key={w.id} style={commonStyle} onMouseDown={() => !runMode && setSelectedId(w.id)}>
                  <LedWidget name={w.name} shape={w.props?.shape || 'round'} liveColor={controllerState.indicatorGet(w.name)} />
                </div>
              );
            }

            if (w.type === 'display') {
              return (
                <div key={w.id} style={commonStyle} onMouseDown={() => !runMode && setSelectedId(w.id)}>
                  <DisplayWidget name={w.name} value={controllerState.displayGet(w.name)} />
                </div>
              );
            }

            if (w.type === 'timer') {
              return (
                <div key={w.id} style={commonStyle} onMouseDown={() => !runMode && setSelectedId(w.id)}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{w.name}</div>
                    <div style={{ color: '#777', fontSize: 12 }}>every {Number(w.bindings?.everyMs ?? 1000)} ms</div>
                    <div style={{ color: '#777', fontSize: 12 }}>{w.bindings?.onTick ? 'trigger: yes' : 'trigger: (none)'}</div>
                  </div>
                </div>
              );
            }

            return (
              <div key={w.id} style={commonStyle} onMouseDown={() => !runMode && setSelectedId(w.id)}>
                {w.name}
              </div>
            );
          })}
          </GridLayout>
        ) : null}
      </div>

      <WidgetConfig
        open={!runMode && Boolean(selectedWidget)}
        widget={selectedWidget}
        routines={routines}
        onClose={() => setSelectedId('')}
        onDelete={(id) => {
          updateWidgets(widgets.filter((w) => String(w.id) !== String(id)));
        }}
        onChange={(next) => {
          updateWidgets(widgets.map((w) => (w.id === next.id ? next : w)));
        }}
      />
    </div>
  );
});

export default ControllerTab;
