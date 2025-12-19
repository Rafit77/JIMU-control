import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import { createWorkspace, setIdOptionsProvider, workspaceToAsyncJs, workspaceToXmlText } from './blockly_mvp.js';
import { batteryPercentFromVolts } from '../battery.js';
import * as globalVars from './global_vars.js';

const defaultRoutineXml = '<xml xmlns="https://developers.google.com/blockly/xml"></xml>\n';
const newId = () => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_) {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hexToRgb = (hex) => {
  const s = String(hex || '').trim();
  const m = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
};
const eyeIdToMask = (id) => {
  const n = Math.max(1, Math.min(8, Math.round(Number(id ?? 1))));
  return 1 << (n - 1);
};
// Observed mapping note: "first LED is NE" -> assume bit0=NE, then clockwise.
const eyeSegmentCompassOrder = ['NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
const eyeSegmentMaskForCompass = (pos) => {
  const idx = eyeSegmentCompassOrder.indexOf(pos);
  if (idx < 0) return 0;
  return 1 << idx; // assumption: bit0..bit7 maps to N..NW clockwise
};

const RoutineNameDialog = ({ open, title, initialName, onCancel, onSubmit }) => {
  const [name, setName] = useState(initialName || '');
  useEffect(() => setName(initialName || ''), [initialName, open]);
  if (!open) return null;
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
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div style={{ background: '#fff', padding: 16, borderRadius: 10, width: 440, maxWidth: '92vw' }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label>
            Name
            <input
              style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button onClick={onCancel}>Cancel</button>
          <button
            onClick={() => onSubmit(name)}
            style={{ background: '#0057d8', color: '#fff', border: '1px solid #0b3d91' }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

const VariablesDialog = ({ open, workspace, getVarValue, isVarUsedElsewhere, onClose }) => {
  const [newName, setNewName] = useState('');
  const [varsVersion, bumpVarsVersion] = useState(0);

  useEffect(() => {
    if (!open || !workspace) return;
    const onWsChange = (e) => {
      const t = e?.type;
      if (
        t === Blockly.Events.VAR_CREATE ||
        t === Blockly.Events.VAR_DELETE ||
        t === Blockly.Events.VAR_RENAME
      ) {
        bumpVarsVersion((v) => v + 1);
      }
    };
    workspace.addChangeListener(onWsChange);
    return () => workspace.removeChangeListener(onWsChange);
  }, [open, workspace]);

  const vars = useMemo(() => {
    if (!workspace) return [];
    return workspace.getAllVariables().map((v) => ({ id: v.getId(), name: v.name, type: v.type }));
  }, [workspace, open, varsVersion]);

  if (!open) return null;

  const formatValue = (v) => {
    if (v === undefined) return '—';
    if (v === null) return 'null';
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try {
      const s = JSON.stringify(v);
      return s.length > 60 ? `${s.slice(0, 57)}...` : s;
    } catch (_) {
      const s = String(v);
      return s.length > 60 ? `${s.slice(0, 57)}...` : s;
    }
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
      <div style={{ background: '#fff', padding: 16, borderRadius: 10, width: 560, maxWidth: '94vw' }}>
        <h3 style={{ marginTop: 0 }}>Variables</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="New variable name"
            style={{ flex: 1, padding: 8 }}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            onClick={() => {
              if (!workspace) return;
              const n = String(newName || '').trim();
              if (!n) return;
              if (workspace.getVariable(n)) return;
              workspace.createVariable(n);
              setNewName('');
            }}
          >
            Create
          </button>
        </div>
        <div style={{ marginTop: 12, border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
          {vars.length === 0 ? (
            <div style={{ padding: 12, color: '#777' }}>No variables.</div>
          ) : (
            vars.map((v) => (
              <div
                key={v.id}
                style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, borderTop: '1px solid #eee' }}
              >
                <span style={{ width: 18, textAlign: 'right', color: '#999' }}>•</span>
                <input
                  style={{ flex: 1, padding: 6 }}
                  value={v.name}
                  readOnly
                  title="Variables are global across routines; rename is disabled to keep cross-routine references stable."
                />
                <span
                  style={{
                    minWidth: 220,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    color: '#555',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={formatValue(getVarValue?.(v.name))}
                >
                  = {formatValue(getVarValue?.(v.name))}
                </span>
                <button
                  onClick={async () => {
                    if (!workspace) return;
                    if (isVarUsedElsewhere?.(v.name)) {
                      window.alert(`Cannot delete "${v.name}" because it is used by another routine.`);
                      return;
                    }
                    const ok = window.confirm(`Delete variable "${v.name}"?`);
                    if (!ok) return;
                    try {
                      workspace.deleteVariableById(v.id);
                    } catch (_) {
                      // ignore
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

const RoutinesTab = forwardRef(function RoutinesTab(
  { ipc, projectId, status, selectedBrickId, connectToSelectedBrick, calibration, projectModules, battery, addLog },
  ref,
) {
  const [routines, setRoutines] = useState([]);
  const [editorRoutine, setEditorRoutine] = useState(null); // {id,name}
  const [editorXml, setEditorXml] = useState('');
  const [editorDirty, setEditorDirty] = useState(false);
  const [runState, setRunState] = useState('idle'); // idle|running|stopped|error
  const [runError, setRunError] = useState(null);
  const [trace, setTrace] = useState([]);
  const [stepDelayMs, setStepDelayMs] = useState(0);
  const [workspaceError, setWorkspaceError] = useState(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [nameDialog, setNameDialog] = useState({ open: false, mode: 'create', routineId: null, initialName: '' });
  const [varsOpen, setVarsOpen] = useState(false);
  const [, bumpVarsVersion] = useState(0);
  const [varsUsedElsewhere, setVarsUsedElsewhere] = useState(() => new Set());

  const workspaceRef = useRef(null);
  const hostRef = useRef(null);
  const cancelRef = useRef({ cancel: () => {} });
  const routineXmlCacheRef = useRef(new Map()); // routineId -> xml (RAM-only until project save)
  const editorInitialXmlRef = useRef(''); // xml used for workspace initialization (avoids async setState ordering issues)
  const suppressDirtyRef = useRef(false);

  const refreshList = useCallback(async () => {
    if (!ipc || !projectId) return;
    const list = await ipc.invoke('routine:list', { projectId });
    const safeList = Array.isArray(list) ? list : [];
    setRoutines(safeList);
    // Preload routine XML into RAM cache so opening a routine uses RAM definition (not disk).
    // Best-effort: ignore load failures.
    Promise.all(
      safeList.map(async (r) => {
        if (!r?.id) return;
        const id = String(r.id);
        if (routineXmlCacheRef.current.has(id)) return;
        try {
          const res = await ipc.invoke('routine:loadXml', { projectId, routineId: id });
          routineXmlCacheRef.current.set(id, String(res?.xml || ''));
        } catch (_) {
          // ignore
        }
      }),
    ).catch(() => {});
  }, [ipc, projectId]);

  useEffect(() => {
    routineXmlCacheRef.current.clear();
  }, [projectId]);

  useEffect(() => {
    refreshList().catch(() => {});
  }, [refreshList]);

  useEffect(() => {
    const run = async () => {
      if (!varsOpen || !projectId || !editorRoutine?.id) {
        setVarsUsedElsewhere(new Set());
        return;
      }
      try {
        const used = new Set();
        const currentId = editorRoutine.id;
        const re = /<field[^>]*name="VAR"[^>]*>([\s\S]*?)<\/field>/g;
        for (const r of Array.isArray(routines) ? routines : []) {
          if (!r?.id || r.id === currentId) continue;
          const id = String(r.id);
          let xml = routineXmlCacheRef.current.get(id);
          if (xml === undefined && ipc) {
            try {
              const res = await ipc.invoke('routine:loadXml', { projectId, routineId: id });
              xml = String(res?.xml || '');
              routineXmlCacheRef.current.set(id, xml);
            } catch (_) {
              xml = '';
            }
          }
          xml = String(xml || '');
          let m;
          while ((m = re.exec(xml))) {
            const name = String(m[1] || '').trim();
            if (name) used.add(name);
          }
        }
        setVarsUsedElsewhere(used);
      } catch (_) {
        setVarsUsedElsewhere(new Set());
      }
    };
    run();
  }, [varsOpen, routines, ipc, projectId, editorRoutine?.id]);

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

  const loadRoutine = useCallback(
    async (routine) => {
      if (!ipc || !projectId) return;
      const cached = routineXmlCacheRef.current.get(String(routine.id));
      const res = cached
        ? { ok: true, xml: cached }
        : await ipc.invoke('routine:loadXml', { projectId, routineId: routine.id });
      // Important: set XML before setting routine ID.
      // Some React configs don't batch async setState; the workspace init effect
      // depends on `editorRoutine.id`, so if we set that first it can initialize
      // with stale/empty `editorXml` and never re-load.
      const xmlText = String(res?.xml || '');
      editorInitialXmlRef.current = xmlText;
      setEditorXml(xmlText);
      setEditorRoutine({ id: routine.id, name: routine.name });
      setEditorDirty(false);
      setRunState('idle');
      setRunError(null);
      setTrace([]);
    },
    [ipc, projectId],
  );

  const saveRoutine = useCallback(async () => {
    if (!ipc || !projectId || !editorRoutine) return;
    const ws = workspaceRef.current;
    const xml = ws ? workspaceToXmlText(ws) : editorXml;
    routineXmlCacheRef.current.set(String(editorRoutine.id), String(xml || ''));
    setEditorXml(String(xml || ''));
    setEditorDirty(false);
    setRoutines((prev) =>
      (Array.isArray(prev) ? prev : []).map((r) =>
        String(r?.id) === String(editorRoutine.id) ? { ...(r || {}), updatedAt: new Date().toISOString() } : r,
      ),
    );
    addLog?.(`Routine saved (RAM): ${editorRoutine.name}`);
  }, [ipc, projectId, editorRoutine, editorXml, addLog]);

  const confirmLeaveEditor = useCallback(async () => {
    if (!editorRoutine) return true;
    if (!editorDirty) return true;
    const save = window.confirm('Routine has unsaved changes. Save now?');
    if (save) {
      try {
        await saveRoutine();
        return true;
      } catch (e) {
        addLog?.(`Routine save failed: ${e?.message || String(e)}`);
        return false;
      }
    }
    const discard = window.confirm('Discard changes?');
    return discard;
  }, [editorRoutine, editorDirty, saveRoutine, addLog]);

  useImperativeHandle(
    ref,
    () => ({
      confirmCanLeave: () => confirmLeaveEditor(),
      stopIfRunning: async () => {
        if (runState === 'running') await cancelRef.current.cancel?.();
      },
      exportForSave: async () => {
        const list = Array.isArray(routines) ? routines : [];
        const routineXmlById = {};
        for (const r of list) {
          const id = String(r?.id || '');
          if (!id) continue;
          const xml = routineXmlCacheRef.current.get(id);
          if (xml !== undefined) routineXmlById[id] = String(xml || '');
        }
        return { routines: list, routineXmlById };
      },
    }),
    [confirmLeaveEditor, runState, routines],
  );

  useEffect(() => {
    if (!editorRoutine) return;
    if (!hostRef.current) return;

    setWorkspaceError(null);
    setWorkspaceReady(false);
    hostRef.current.innerHTML = '';
    const div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.position = 'absolute';
    div.style.inset = '0';
    hostRef.current.appendChild(div);

    let ws = null;
    try {
      const initXml = editorInitialXmlRef.current || editorXml;
      suppressDirtyRef.current = true;
      ws = createWorkspace(div, { initialXmlText: initXml });
      workspaceRef.current = ws;
      ws.__jimuOpenVarsDialog = () => setVarsOpen(true);

      // Ensure global (project) variables exist in every routine workspace.
      // Do this before enabling dirty-tracking.
      try {
        for (const n of globalVars.varList()) {
          if (n && !ws.getVariable(n)) ws.createVariable(n);
        }
        const existing = ws.getAllVariables?.() || [];
        for (const v of existing) globalVars.varDefine(v?.name, 0);
      } catch (_) {
        // ignore
      }

      setWorkspaceReady(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            Blockly.svgResize(ws);
          } catch (_) {
            // ignore
          }
        });
      });
    } catch (e) {
      setWorkspaceError(e?.message || String(e));
      setWorkspaceReady(false);
      workspaceRef.current = null;
    }

    if (!ws) return;
    const onChange = (evt) => {
      if (!evt) return;
      if (evt.isUiEvent) return;
      if (evt.type === Blockly.Events.FINISHED_LOADING) return;
      if (evt.type === Blockly.Events.VAR_CREATE) {
        try {
          const v = ws.getVariableById?.(evt.varId);
          if (v?.name) globalVars.varDefine(v.name, 0);
          bumpVarsVersion((x) => x + 1);
        } catch (_) {
          // ignore
        }
      }
      if (evt.type === Blockly.Events.VAR_DELETE || evt.type === Blockly.Events.VAR_RENAME) {
        bumpVarsVersion((x) => x + 1);
      }
      if (suppressDirtyRef.current) return;
      setEditorDirty(true);
    };
    ws.addChangeListener(onChange);
    suppressDirtyRef.current = false;
    setEditorDirty(false);

    return () => {
      try {
        ws?.removeChangeListener?.(onChange);
        ws?.dispose?.();
      } catch (_) {
        // ignore
      }
      workspaceRef.current = null;
      editorInitialXmlRef.current = '';
      suppressDirtyRef.current = false;
    };
  }, [editorRoutine?.id]); // re-create workspace when switching routine

  useEffect(() => {
    if (!editorRoutine) return;
    const host = hostRef.current;
    const ws = workspaceRef.current;
    if (!host || !ws) return;

    const resize = () => {
      try {
        Blockly.svgResize(ws);
      } catch (_) {
        // ignore
      }
    };

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(host);
    return () => ro.disconnect();
  }, [editorRoutine?.id, workspaceReady]);

  useEffect(() => {
    const onResize = () => {
      const ws = workspaceRef.current;
      if (!ws) return;
      try {
        Blockly.svgResize(ws);
      } catch (_) {
        // ignore
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const api = useMemo(() => {
    const appendTrace = (line) =>
      setTrace((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${String(line ?? '')}`].slice(-200));

    const isCancelled = () => Boolean(cancelRef.current?.isCancelled);
    const warnedRef = { appInputs: false, action: false, show: false };

    const wait = async (ms) => {
      const delay = clamp(Number(ms ?? 0), 0, 60_000);
      if (isCancelled()) return;
      await new Promise((resolve) => {
        const t = setTimeout(resolve, delay);
        cancelRef.current.onCancel = () => {
          clearTimeout(t);
          resolve();
        };
      });
    };

    const setServoPosition = async (id, deg) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      const servoId = Number(id ?? 0);
      const c = calibration?.servoConfig?.[servoId] || {};
      const min = typeof c.min === 'number' ? c.min : -120;
      const max = typeof c.max === 'number' ? c.max : 120;
      const reverse = Boolean(c.reverse);
      const ui = clamp(Number(deg ?? 0), min, max);
      const posDeg = reverse ? -ui : ui;
      await ipc.invoke('jimu:setServoPos', { id: servoId, posDeg });
    };

    const servoSpeedByteFromDurationMs = (durationMs) => {
      const ms = clamp(Number(durationMs ?? 400), 0, 60_000);
      // Protocol note (docs/protocol.md): speed/20 = seconds for movement => speed ~= ms/50
      return clamp(Math.round(ms / 50), 0, 0xff);
    };

    const setServoPositionsTimed = async (entries, durationMs = 400) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;

      const ms = clamp(Number(durationMs ?? 400), 0, 60_000);
      const speed = servoSpeedByteFromDurationMs(ms);

      const list = Array.isArray(entries) ? entries : [];
      const servoConfig = calibration?.servoConfig || {};

      // Deduplicate by ID (last wins), then sort ascending (protocol expects positions ordered by ID).
      const byId = new Map();
      for (const e of list) {
        const servoId = Number(e?.id ?? 0);
        if (!Number.isFinite(servoId) || servoId <= 0) continue;
        const c = servoConfig?.[servoId] || servoConfig?.[String(servoId)] || {};
        const min = typeof c.min === 'number' ? c.min : -120;
        const max = typeof c.max === 'number' ? c.max : 120;
        const reverse = Boolean(c.reverse);
        const ui = clamp(Number(e?.deg ?? 0), min, max);
        const posDeg = reverse ? -ui : ui;
        byId.set(servoId, posDeg);
      }

      const ids = Array.from(byId.keys()).sort((a, b) => a - b);
      if (!ids.length) return;
      const degrees = ids.map((id) => byId.get(id));

      await ipc.invoke('jimu:setServoPosMulti', { ids, degrees, speed });
      await wait(ms);
    };

    const setServoPositionTimed = async (id, deg, durationMs = 400) => {
      await setServoPositionsTimed([{ id, deg }], durationMs);
    };

    const rotateServo = async (id, dir, speed) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      const servoId = Number(id ?? 0);
      const c = calibration?.servoConfig?.[servoId] || {};
      const maxSpeed = typeof c.maxSpeed === 'number' ? c.maxSpeed : 1000;
      const reverse = Boolean(c.reverse);
      const cleanDir = String(dir) === 'ccw' ? 'ccw' : 'cw';
      const speedNum = Number(speed ?? 0);
      const baseDir = speedNum < 0 ? (cleanDir === 'cw' ? 'ccw' : 'cw') : cleanDir;
      const baseSpeed = Math.abs(speedNum);
      const finalDir = reverse ? (baseDir === 'cw' ? 'ccw' : 'cw') : baseDir;
      const dirByte = finalDir === 'cw' ? 0x01 : 0x02;
      await ipc.invoke('jimu:rotateServo', { id: servoId, dir: dirByte, speed: baseSpeed, maxSpeed });
    };

    const rotateServoMulti = async (ids, dir, speed) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;

      const list = Array.isArray(ids) ? ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : [];
      if (!list.length) return;

      const cleanDir = String(dir) === 'ccw' ? 'ccw' : 'cw';
      const speedNum = Number(speed ?? 0);
      const baseDir = speedNum < 0 ? (cleanDir === 'cw' ? 'ccw' : 'cw') : cleanDir;
      const baseSpeedRaw = Math.abs(speedNum);
      const cfg = calibration?.servoConfig || {};

      // Clamp speed to the most restrictive maxSpeed among ALL selected servos.
      let globalMax = 1000;
      for (const servoId of list) {
        const c = cfg?.[servoId] || cfg?.[String(servoId)] || {};
        const maxSpeed = typeof c.maxSpeed === 'number' ? c.maxSpeed : 1000;
        globalMax = Math.min(globalMax, maxSpeed);
      }
      const baseSpeed = Math.max(0, Math.min(globalMax, baseSpeedRaw));

      // Partition IDs into cw/ccw after applying per-servo reverse calibration.
      const cwIds = [];
      const ccwIds = [];
      for (const servoId of list) {
        const c = cfg?.[servoId] || cfg?.[String(servoId)] || {};
        const reverse = Boolean(c.reverse);
        const finalDir = reverse ? (baseDir === 'cw' ? 'ccw' : 'cw') : baseDir;
        if (finalDir === 'cw') cwIds.push(servoId);
        else ccwIds.push(servoId);
      }

      const sendGroup = async (groupIds, dirByte) => {
        if (!groupIds.length) return;
        // Protocol observed up to 6 IDs per rotation command; chunk to be safe.
        for (let i = 0; i < groupIds.length; i += 6) {
          const chunk = groupIds.slice(i, i + 6);
          await ipc.invoke('jimu:rotateServoMulti', { ids: chunk, dir: dirByte, speed: baseSpeed, maxSpeed: globalMax });
        }
      };

      await sendGroup(cwIds, 0x01);
      await sendGroup(ccwIds, 0x02);
    };

    const stopServo = async (id) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      const servoId = Number(id ?? 0);
      try {
        await ipc.invoke('jimu:rotateServo', { id: servoId, dir: 0x01, speed: 0, maxSpeed: 1000 });
      } catch (_) {
        // ignore
      }
      try {
        await ipc.invoke('jimu:readServo', servoId);
      } catch (_) {
        // ignore
      }
    };

    const stopServosMulti = async (ids) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      const list = Array.isArray(ids) ? ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : [];
      const unique = Array.from(new Set(list));
      if (!unique.length) return;
      // Speed=0 stop (direction is irrelevant), grouped like rotateServoMulti (respects reverse splitting).
      await rotateServoMulti(unique, 'cw', 0);
      // Best-effort release (reading position releases hold; id=0 reads all servos).
      try {
        await ipc.invoke('jimu:readServo', 0);
      } catch (_) {
        // ignore
      }
    };

    const rotateMotor = async (id, dir, speed, durationMs) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      const motorId = Number(id ?? 0);
      const c = calibration?.motorConfig?.[motorId] || {};
      const maxSpeed = typeof c.maxSpeed === 'number' ? c.maxSpeed : 150;
      const reverse = Boolean(c.reverse);
      const cleanDir = String(dir) === 'ccw' ? 'ccw' : 'cw';
      const finalDir = reverse ? (cleanDir === 'cw' ? 'ccw' : 'cw') : cleanDir;
      await ipc.invoke('jimu:rotateMotor', {
        id: motorId,
        dir: finalDir,
        speed: Number(speed ?? 0),
        maxSpeed,
        durationMs: Number(durationMs ?? 0),
      });
    };

    const rotateMotorsTimed = async (entries, durationMs = 5000) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;

      const ms = clamp(Number(durationMs ?? 5000), 0, 6000);
      const list = Array.isArray(entries) ? entries : [];
      const cfg = calibration?.motorConfig || {};

      // Deduplicate by ID (last wins), sort for stable ordering.
      const byId = new Map();
      for (const e of list) {
        const motorId = Number(e?.id ?? 0);
        if (!Number.isFinite(motorId) || motorId <= 0) continue;
        byId.set(motorId, Number(e?.speed ?? 0));
      }
      const ids = Array.from(byId.keys()).sort((a, b) => a - b);

      for (const motorId of ids) {
        if (isCancelled()) return;
        const c = cfg?.[motorId] || cfg?.[String(motorId)] || {};
        const maxSpeed = typeof c.maxSpeed === 'number' ? c.maxSpeed : 150;
        const reverse = Boolean(c.reverse);
        const raw = Math.round(Number(byId.get(motorId) ?? 0));
        const signed = reverse ? -raw : raw;
        await ipc.invoke('jimu:rotateMotorSigned', { id: motorId, speed: signed, maxSpeed, durationMs: ms });
      }
    };

    const stopMotor = async (id) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      await ipc.invoke('jimu:stopMotor', Number(id ?? 0));
    };

    const stopMotorsMulti = async (ids) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      const list = Array.isArray(ids) ? ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : [];
      const unique = Array.from(new Set(list)).sort((a, b) => a - b);
      for (const id of unique) {
        if (isCancelled()) return;
        try {
          await ipc.invoke('jimu:stopMotor', id);
        } catch (_) {
          // ignore best effort
        }
      }
    };

    const readIR = async (id) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return 0;
      const res = await ipc.invoke('jimu:readSensorIR', Number(id ?? 1));
      if (res?.error) throw new Error(res.message || 'IR read failed');
      return typeof res?.raw === 'number' ? res.raw : Number(res?.value ?? 0);
    };

    const readUltrasonicCm = async (id) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return 0;
      const res = await ipc.invoke('jimu:readSensorUS', Number(id ?? 1));
      if (res?.error) throw new Error(res.message || 'US read failed');
      if (typeof res?.cm === 'number') return res.cm;
      if (typeof res?.raw === 'number') return res.raw === 0 ? 301.0 : Number(res.raw);
      return 0;
    };

    const readServoDeg = async (id) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return 0;
      const servoId = Number(id ?? 1);
      const res = await ipc.invoke('jimu:readServo', servoId);
      const deg = typeof res?.deg === 'number' ? res.deg : 0;
      const c = calibration?.servoConfig?.[servoId] || {};
      const reverse = Boolean(c.reverse);
      return reverse ? -deg : deg;
    };

    const getSlider = (name) => {
      if (!warnedRef.appInputs) {
        warnedRef.appInputs = true;
        appendTrace('Note: UI inputs (slider/joystick/switch) are not implemented yet; returning 0/false.');
      }
      return 0;
    };
    const getJoystick = (name, axis) => {
      if (!warnedRef.appInputs) {
        warnedRef.appInputs = true;
        appendTrace('Note: UI inputs (slider/joystick/switch) are not implemented yet; returning 0/false.');
      }
      return 0;
    };
    const getSwitch = (name) => {
      if (!warnedRef.appInputs) {
        warnedRef.appInputs = true;
        appendTrace('Note: UI inputs (slider/joystick/switch) are not implemented yet; returning 0/false.');
      }
      return false;
    };

    const selectAction = (name) => {
      if (!warnedRef.action) {
        warnedRef.action = true;
        appendTrace('Note: select action is a placeholder (Actions playback not implemented yet).');
      }
      appendTrace(`Selected action: ${String(name || '')}`);
    };

    const eyeColorMask = async (eyesMask, hex) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      const { r, g, b } = hexToRgb(hex);
      const mask = clamp(Number(eyesMask ?? 0), 0, 0xff);
      if (!mask) return;
      await ipc.invoke('jimu:setEyeColor', { eyesMask: mask, time: 0xff, r, g, b });
    };

    const eyeOffMask = async (eyesMask) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      const mask = clamp(Number(eyesMask ?? 0), 0, 0xff);
      if (!mask) return;
      await ipc.invoke('jimu:setEyeOff', { eyesMask: mask });
    };

    const eyeColorForMask = async (eyesMask, hex, durationMs = 400) => {
      await eyeColorMask(eyesMask, hex);
      await wait(clamp(Number(durationMs ?? 400), 0, 60_000));
      await eyeOffMask(eyesMask);
    };

    const eyeCustom = async (id, segMask, hex) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      const { r, g, b } = hexToRgb(hex);
      const eyesMask = eyeIdToMask(id);
      const mask = clamp(Number(segMask ?? 0xff), 0, 0xff);
      await ipc.invoke('jimu:setEyeSegments', { eyesMask, time: 0xff, entries: [{ r, g, b, mask }] });
    };

    const eyeCustomFor = async (id, segMask, hex, durationMs = 400) => {
      await eyeCustom(id, segMask, hex);
      await wait(clamp(Number(durationMs ?? 400), 0, 60_000));
      await eyeOffMask(eyeIdToMask(id));
    };

    const eyeSceneMask = async (eyesMask, scene, repeat, waitFor, hex) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      const { r, g, b } = hexToRgb(hex);
      const mask = clamp(Number(eyesMask ?? 0), 0, 0xff);
      if (!mask) return;
      await ipc.invoke('jimu:setEyeAnimation', {
        eyesMask: mask,
        animationId: clamp(Number(scene ?? 1), 1, 15),
        repetitions: clamp(Number(repeat ?? 1), 1, 255),
        r,
        g,
        b,
      });
      if (waitFor) {
        if (!warnedRef.show) {
          warnedRef.show = true;
          appendTrace('Note: eye scene wait is best-effort (no completion signal from the brick yet).');
        }
        await wait(clamp(Number(repeat ?? 1), 1, 255) * 400);
      }
    };

    const usLedColor = async (id, hex) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      const { r, g, b } = hexToRgb(hex);
      await ipc.invoke('jimu:setUltrasonicLed', { id: Number(id ?? 1), r, g, b });
    };

    const usLedOff = async (id) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      await ipc.invoke('jimu:setUltrasonicLedOff', { id: Number(id ?? 1) });
    };

    const indicatorColor = (name, hex) => {
      if (!warnedRef.appInputs) {
        warnedRef.appInputs = true;
        appendTrace('Note: Controller widgets are not implemented yet; indicator/display are placeholders.');
      }
      appendTrace(`Indicator "${String(name || '')}" color ${String(hex || '')}`);
    };

    const displayShow = (name, value) => {
      if (!warnedRef.appInputs) {
        warnedRef.appInputs = true;
        appendTrace('Note: Controller widgets are not implemented yet; indicator/display are placeholders.');
      }
      appendTrace(`Display "${String(name || '')}": ${String(value)}`);
    };

    const eyeCustom8Mask = async (eyesMask, colorsByPos) => {
      if (!ipc) throw new Error('IPC unavailable');
      if (isCancelled()) return;
      const maskAll = clamp(Number(eyesMask ?? 0), 0, 0xff);
      if (!maskAll) return;
      const entries = eyeSegmentCompassOrder.map((pos) => {
        const hex = colorsByPos?.[pos] || '#000000';
        const { r, g, b } = hexToRgb(hex);
        const mask = eyeSegmentMaskForCompass(pos);
        return { r, g, b, mask };
      });
      await ipc.invoke('jimu:setEyeSegments', { eyesMask: maskAll, time: 0xff, entries });
    };

    const eyeCustom8ForMask = async (eyesMask, colorsByPos, durationMs = 400) => {
      await eyeCustom8Mask(eyesMask, colorsByPos);
      await wait(clamp(Number(durationMs ?? 400), 0, 60_000));
      await eyeOffMask(eyesMask);
    };

    const allStop = async () => {
      if (!ipc) throw new Error('IPC unavailable');
      // Stop motion and release holds (best effort)
      try {
        await ipc.invoke('jimu:emergencyStop');
      } catch (_) {
        // ignore
      }
      // Also force LEDs off based on project snapshot (even if not detected)
      const modules = projectModules || {};
      const eyes = Array.isArray(modules.eyes) ? modules.eyes : [];
      const us = Array.isArray(modules.ultrasonic) ? modules.ultrasonic : [];
      for (const id of eyes) {
        try {
          await ipc.invoke('jimu:setEyeOff', { eyesMask: eyeIdToMask(id) });
        } catch (_) {
          // ignore
        }
      }
      for (const id of us) {
        try {
          await ipc.invoke('jimu:setUltrasonicLedOff', { id: Number(id ?? 1) });
        } catch (_) {
          // ignore
        }
      }
    };

    const emergencyStop = async () => {
      if (!ipc) throw new Error('IPC unavailable');
      cancelRef.current.isCancelled = true;
      try {
        await allStop();
      } catch (_) {
        // ignore best effort
      }
    };

    const batteryPercent = () => {
      const pct = batteryPercentFromVolts(battery?.volts);
      if (pct == null) return 0;
      return Math.round(pct * 100);
    };

    const batteryCharging = () => Boolean(battery?.charging);

    return {
      __step: async (blockId) => {
        const ws = workspaceRef.current;
        try {
          ws?.highlightBlock?.(blockId || null);
        } catch (_) {
          // ignore
        }
        if (isCancelled()) throw new Error('Cancelled');
        const extra = clamp(Number(stepDelayMs ?? 0), 0, 60_000);
        if (extra <= 0) return;
        const b = ws?.getBlockById ? ws.getBlockById(blockId) : null;
        const t = String(b?.type || '');
        if (t === 'jimu_wait' || t === 'jimu_wait_until') return;
        await wait(extra);
      },
      varGet: (varId) => {
        return globalVars.varGet(varId);
      },
      varSet: (varId, value) => {
        globalVars.varSet(varId, value);
        bumpVarsVersion((v) => v + 1);
      },
      wait,
      setServoPosition,
      setServoPositionsTimed,
      setServoPositionTimed,
      rotateServo,
      rotateServoMulti,
      stopServo,
      stopServosMulti,
      rotateMotor,
      rotateMotorsTimed,
      stopMotor,
      stopMotorsMulti,
      readIR,
      readUltrasonicCm,
      readServoDeg,
      getSlider,
      getJoystick,
      getSwitch,
      selectAction,
      eyeColorMask,
      eyeColorForMask,
      eyeSceneMask,
      eyeCustom,
      eyeCustomFor,
      eyeCustom8Mask,
      eyeCustom8ForMask,
      eyeOffMask,
      usLedColor,
      usLedOff,
      indicatorColor,
      displayShow,
      allStop,
      emergencyStop,
      batteryPercent,
      batteryCharging,
      log: (t) => {
        appendTrace(t);
        addLog?.(`[Routine] ${String(t ?? '')}`);
      },
    };
  }, [ipc, calibration, projectModules, battery, addLog, stepDelayMs]);

  const runRoutine = useCallback(async () => {
    if (!editorRoutine) return;
    const ws = workspaceRef.current;
    if (!ws) return;
    bumpVarsVersion((v) => v + 1);
    try {
      ws.highlightBlock?.(null);
    } catch (_) {
      // ignore
    }
    setRunError(null);
    setRunState('running');
    setTrace([]);

    const cancelState = { isCancelled: false, onCancel: null };
    cancelRef.current = {
      ...cancelState,
      cancel: async () => {
        cancelState.isCancelled = true;
        try {
          await api.allStop?.();
        } catch (_) {
          // ignore
        }
        try {
          cancelState.onCancel?.();
        } catch (_) {
          // ignore
        }
      },
    };

    try {
      const src = workspaceToAsyncJs(ws, { debug: true });
      // eslint-disable-next-line no-new-func
      const fn = new Function('api', src);
      await fn(api);
      setRunState(cancelState.isCancelled ? 'stopped' : 'idle');
    } catch (e) {
      if (cancelState.isCancelled || String(e?.message || '').toLowerCase() === 'cancelled') {
        setRunState('stopped');
      } else {
        setRunState('error');
        setRunError(e?.message || String(e));
      }
    } finally {
      try {
        ws.highlightBlock?.(null);
      } catch (_) {
        // ignore
      }
    }
  }, [editorRoutine, api, ipc]);

  const stopRoutine = useCallback(async () => {
    await cancelRef.current.cancel?.();
    setRunState('stopped');
    try {
      workspaceRef.current?.highlightBlock?.(null);
    } catch (_) {
      // ignore
    }
  }, []);

  const editorHeader = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        onClick={async () => {
          const ok = await confirmLeaveEditor();
          if (!ok) return;
          setEditorRoutine(null);
          setEditorXml('');
          setEditorDirty(false);
          setRunState('idle');
          setRunError(null);
          setTrace([]);
          bumpVarsVersion((v) => v + 1);
        }}
      >
        Back
      </button>
      <div style={{ fontWeight: 600, marginLeft: 4 }}>{editorRoutine?.name}</div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          Status:{' '}
          <strong style={{ color: status === 'Connected' ? '#1b5e20' : '#888' }}>
            {status === 'Connected' ? 'Connected' : 'Disconnected'}
          </strong>
        </span>
        <span>
          Run:{' '}
          <strong style={{ color: runState === 'error' ? '#b71c1c' : runState === 'running' ? '#0b3d91' : '#333' }}>
            {runState}
          </strong>
        </span>
        {editorDirty ? <span style={{ color: '#b26a00' }}>… unsaved</span> : null}
        <button onClick={() => setVarsOpen(true)}>Variables</button>
        <button
          onClick={() => setNameDialog({ open: true, mode: 'rename', routineId: editorRoutine.id, initialName: editorRoutine.name })}
        >
          Rename
        </button>
        <button
          onClick={async () => {
            const ok = window.confirm(`Delete routine "${editorRoutine.name}"?`);
            if (!ok) return;
            await stopRoutine();
            routineXmlCacheRef.current.delete(String(editorRoutine.id));
            setRoutines((prev) =>
              (Array.isArray(prev) ? prev : []).filter((r) => String(r?.id) !== String(editorRoutine.id)),
            );
            setEditorRoutine(null);
            setEditorXml('');
            setEditorDirty(false);
          }}
        >
          Delete
        </button>
        <button onClick={saveRoutine}>Save</button>
        <button
          onClick={runRoutine}
          disabled={runState === 'running'}
          style={{ background: '#1b5e20', color: '#fff', border: '1px solid #0f3d15' }}
        >
          Run
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Slow
          <select
            value={String(stepDelayMs)}
            onChange={(e) => setStepDelayMs(Number(e.target.value))}
            disabled={runState === 'running'}
          >
            <option value="0">0ms</option>
            <option value="100">100ms</option>
            <option value="500">500ms</option>
            <option value="1000">1000ms</option>
          </select>
        </label>
        <button
          onClick={stopRoutine}
          style={{ background: '#c62828', color: '#fff', border: '1px solid #8e0000' }}
          disabled={runState !== 'running'}
        >
          Stop
        </button>
      </div>
    </div>
  );

  if (!projectId) return <div style={{ color: '#777' }}>Open a project first.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {!editorRoutine ? (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <button onClick={() => setNameDialog({ open: true, mode: 'create', routineId: null, initialName: '' })}>
              Create routine
            </button>
            <button onClick={refreshList}>Refresh</button>
            <div style={{ marginLeft: 'auto', color: '#777' }}>{routines.length} routine(s)</div>
          </div>
          <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
            {routines.length === 0 ? (
              <div style={{ padding: 12, color: '#777' }}>No routines yet.</div>
            ) : (
              routines.map((r) => (
                <div
                  key={r.id}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, borderTop: '1px solid #eee' }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ color: '#777', fontSize: 12 }}>
                      {r.updatedAt ? `Updated: ${r.updatedAt}` : ''}
                    </div>
                  </div>
                  <button onClick={() => loadRoutine(r)}>Open</button>
                  <button onClick={() => setNameDialog({ open: true, mode: 'rename', routineId: r.id, initialName: r.name })}>
                    Rename
                  </button>
                  <button
                    onClick={async () => {
                      const ok = window.confirm(`Delete routine "${r.name}"?`);
                      if (!ok) return;
                      routineXmlCacheRef.current.delete(String(r.id));
                      setRoutines((prev) => (Array.isArray(prev) ? prev : []).filter((x) => String(x?.id) !== String(r.id)));
                      if (editorRoutine?.id === r.id) {
                        await stopRoutine();
                        setEditorRoutine(null);
                        setEditorXml('');
                        setEditorDirty(false);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {editorHeader}
          {runError ? <div style={{ marginTop: 8, color: '#b71c1c' }}>Error: {runError}</div> : null}
          {workspaceError ? (
            <div style={{ marginTop: 8, color: '#b71c1c' }}>
              Blockly failed to initialize: {workspaceError}
            </div>
          ) : null}
          {!workspaceReady && !workspaceError ? (
            <div style={{ marginTop: 8, color: '#777' }}>Loading Blockly…</div>
          ) : null}
          <div
            ref={hostRef}
            style={{
              marginTop: 10,
              flex: 1,
              minHeight: 420,
              border: '1px solid #ddd',
              borderRadius: 8,
              background: '#fff',
              overflow: 'hidden',
              position: 'relative',
            }}
          />
          <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 340 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Trace</div>
              <div style={{ maxHeight: 220, overflow: 'auto', background: '#f7f7f7', padding: 8, borderRadius: 6 }}>
                {trace.length === 0 ? <div style={{ color: '#888' }}>No output yet.</div> : trace.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
          </div>
          <VariablesDialog
            open={varsOpen}
            workspace={workspaceRef.current}
            getVarValue={(varName) => globalVars.varGet(String(varName ?? ''))}
            isVarUsedElsewhere={(varName) => varsUsedElsewhere.has(String(varName ?? '').trim())}
            onClose={() => setVarsOpen(false)}
          />
        </div>
      )}

      <RoutineNameDialog
        open={nameDialog.open}
        title={nameDialog.mode === 'create' ? 'Create routine' : 'Rename routine'}
        initialName={nameDialog.initialName}
        onCancel={() => setNameDialog((p) => ({ ...p, open: false }))}
        onSubmit={async (name) => {
          try {
            if (nameDialog.mode === 'create') {
              setNameDialog((p) => ({ ...p, open: false }));
              const now = new Date().toISOString();
              const routineName = String(name || '').trim();
              const existingNames = new Set((Array.isArray(routines) ? routines : []).map((r) => String(r?.name || '')));
              if (!routineName) throw new Error('Routine name is required');
              if (existingNames.has(routineName)) throw new Error('Routine name must be unique');
              const id = newId();
              const routine = { id, name: routineName, createdAt: now, updatedAt: now };
              routineXmlCacheRef.current.set(String(id), defaultRoutineXml);
              editorInitialXmlRef.current = defaultRoutineXml;
              setRoutines((prev) => [...(Array.isArray(prev) ? prev : []), routine]);
              setEditorXml(defaultRoutineXml);
              setEditorRoutine({ id, name: routineName });
              setEditorDirty(false);
              setRunState('idle');
              setRunError(null);
              setTrace([]);
            } else {
              const routineName = String(name || '').trim();
              if (!routineName) throw new Error('Routine name is required');
              const existingNames = new Set(
                (Array.isArray(routines) ? routines : [])
                  .filter((r) => String(r?.id) !== String(nameDialog.routineId))
                  .map((r) => String(r?.name || '')),
              );
              if (existingNames.has(routineName)) throw new Error('Routine name must be unique');
              setRoutines((prev) =>
                (Array.isArray(prev) ? prev : []).map((r) =>
                  String(r?.id) === String(nameDialog.routineId)
                    ? { ...(r || {}), name: routineName, updatedAt: new Date().toISOString() }
                    : r,
                ),
              );
              if (editorRoutine?.id === nameDialog.routineId) setEditorRoutine((p) => (p ? { ...p, name: routineName } : p));
              setNameDialog((p) => ({ ...p, open: false }));
            }
          } catch (e) {
            addLog?.(`Routine update failed: ${e?.message || String(e)}`);
          }
        }}
      />
    </div>
  );
});

export default RoutinesTab;
