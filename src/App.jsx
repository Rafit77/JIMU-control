import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import * as Slider from '@radix-ui/react-slider';
import RoutinesTab from './routines/RoutinesTab.jsx';
import ControllerTab from './controller/ControllerTab.jsx';
import { batteryPercentFromVolts } from './battery.js';
import * as globalVars from './routines/global_vars.js';
import * as controllerState from './controller/controller_state.js';
import servoIconUrl from '../media/servo-icon.png';
import wheelIconUrl from '../media/wheel-icon.png';

const Section = ({ title, children, style }) => (
  <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12, ...(style || {}) }}>
    {title ? <h2 style={{ margin: '0 0 8px 0' }}>{title}</h2> : null}
    {children}
  </div>
);

const PlaceholderList = ({ items }) => (
  <ul style={{ margin: 0, paddingLeft: 18 }}>
    {items.map((item, idx) => (
      <li key={`${idx}-${String(item)}`}>{item}</li>
    ))}
  </ul>
);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v ?? 0)));
const uniqSortedNums = (arr) =>
  Array.from(new Set((Array.isArray(arr) ? arr : []).map((x) => Number(x)).filter((x) => Number.isFinite(x)))).sort(
    (a, b) => a - b,
  );
const getModuleStatusKind = (id, savedIds, liveIds, { connected = true } = {}) => {
  if (!connected) return 'offline';
  const isSaved = (savedIds || []).includes(id);
  const isLive = (liveIds || []).includes(id);
  if (isLive && isSaved) return 'detected';
  if (isLive && !isSaved) return 'new';
  if (!isLive && isSaved) return 'missing';
  return 'missing';
};
const moduleStatusColor = (kind) => {
  if (kind === 'detected') return '#2ea44f'; // green
  if (kind === 'new') return '#1565c0'; // blue
  if (kind === 'error') return '#b71c1c'; // red
  if (kind === 'offline') return '#9e9e9e';
  return '#9e9e9e'; // gray (missing/unknown)
};
const moduleStatusBg = (kind) => {
  if (kind === 'detected') return '#e8f5e9';
  if (kind === 'new') return '#e3f2fd';
  if (kind === 'error') return '#ffebee';
  if (kind === 'offline') return '#f5f5f5';
  return '#f5f5f5';
};
const moduleButtonStyle = (kind, isLive) => {
  const bg = moduleStatusColor(kind);
  return {
    padding: '6px 10px',
    background: bg,
    color: '#fff',
    border: `1px solid ${bg}`,
    borderRadius: 6,
    opacity: isLive ? 1 : 0.65,
    cursor: isLive ? 'pointer' : 'not-allowed',
  };
};
const moduleBadgeStyle = (kind) => {
  const c = moduleStatusColor(kind);
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 8,
    border: `1px solid ${c}`,
    background: moduleStatusBg(kind),
    color: '#111',
    fontSize: 12,
    fontWeight: 600,
  };
};
const rgbToHex = (r, g, b) =>
  `#${[r, g, b]
    .map((x) => clampByte(x).toString(16).padStart(2, '0'))
    .join('')}`;
const hexToRgb = (hex) => {
  const s = String(hex || '').replace('#', '').trim();
  if (s.length !== 6) return null;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if ([r, g, b].some((x) => Number.isNaN(x))) return null;
  return { r, g, b };
};

const BatteryIcon = ({ volts, connected }) => {
  const pct = batteryPercentFromVolts(volts);
  const fillPct = connected && pct != null ? pct : 0;
  const label =
    connected && pct != null
      ? `${volts.toFixed(2)}V (${Math.round(pct * 100)}%)`
      : 'Disconnected';
  const frameBg = connected ? '#fff' : '#f1f1f1';
  const frameBorder = connected ? '#666' : '#aaa';
  const fillColor = connected ? (pct != null && pct < 0.1 ? '#c62828' : '#2ea44f') : '#9e9e9e';

  return (
    <div title={label} style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{
          position: 'relative',
          width: 82,
          height: 22,
          boxSizing: 'border-box',
          borderRadius: 6,
          border: `1px solid ${frameBorder}`,
          background: frameBg,
          padding: 3,
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -5,
            top: 7,
            width: 5,
            height: 8,
            borderRadius: '0 3px 3px 0',
            borderStyle: 'solid',
            borderColor: frameBorder,
            borderWidth: 1,
            borderLeftWidth: 0,
            background: frameBg,
            boxSizing: 'border-box',
          }}
        />
        <div
          style={{
            height: '100%',
            width: `${Math.round(fillPct * 100)}%`,
            background: fillColor,
            borderRadius: 4,
            transition: 'width 120ms linear',
          }}
        />
      </div>
    </div>
  );
};

const TouchBarSlider = ({
  minLimit = -120,
  maxLimit = 120,
  minValue,
  maxValue,
  value,
  onChange,
}) => {
  const [activeThumb, setActiveThumb] = useState(null); // 0=min | 1=value | 2=max | null
  const safeMin = clamp(minValue, minLimit, 119);
  const safeMax = clamp(maxValue, safeMin + 1, maxLimit);
  const safeValue = clamp(value, safeMin, safeMax);
  const values = [safeMin, safeValue, safeMax];

  return (
    <div style={{ marginTop: 6 }}>
      <Slider.Root
        className="touchbar-slider"
        min={minLimit}
        max={maxLimit}
        step={1}
        value={values}
        onValueChange={(next) => {
          if (!next || next.length !== 3) return;
          if (activeThumb === 0) {
            const nextMin = clamp(next[0], minLimit, safeMax - 1);
            const nextVal = clamp(safeValue, nextMin, safeMax);
            onChange({ min: nextMin, max: safeMax, value: nextVal });
            return;
          }
          if (activeThumb === 2) {
            const nextMax = clamp(next[2], safeMin + 1, maxLimit);
            const nextVal = clamp(safeValue, safeMin, nextMax);
            onChange({ min: safeMin, max: nextMax, value: nextVal });
            return;
          }
          const nextVal = clamp(next[1], safeMin, safeMax);
          onChange({ min: safeMin, max: safeMax, value: nextVal });
        }}
      >
        <Slider.Track className="touchbar-track">
          <Slider.Range className="touchbar-range" />
        </Slider.Track>
        <Slider.Thumb
          className="touchbar-thumb touchbar-thumb-min"
          aria-label="min position"
          onPointerDown={() => setActiveThumb(0)}
          onPointerUp={() => setActiveThumb(null)}
          onFocus={() => setActiveThumb(0)}
          onBlur={() => setActiveThumb(null)}
        />
        <Slider.Thumb
          className="touchbar-thumb touchbar-thumb-value"
          aria-label="test position"
          onPointerDown={() => setActiveThumb(1)}
          onPointerUp={() => setActiveThumb(null)}
          onFocus={() => setActiveThumb(1)}
          onBlur={() => setActiveThumb(null)}
        />
        <Slider.Thumb
          className="touchbar-thumb touchbar-thumb-max"
          aria-label="max position"
          onPointerDown={() => setActiveThumb(2)}
          onPointerUp={() => setActiveThumb(null)}
          onFocus={() => setActiveThumb(2)}
          onBlur={() => setActiveThumb(null)}
        />
      </Slider.Root>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
        <span>{minLimit}</span>
        <span>{maxLimit}</span>
      </div>
    </div>
  );
};

export default function App() {
  const [status, setStatus] = useState('Disconnected');
  const [modules, setModules] = useState(null);
  const [battery, setBattery] = useState(null);
  const [log, setLog] = useState([]);
  const [projects, setProjects] = useState([]); // saved projects list (metadata)
  const [currentProject, setCurrentProject] = useState(null); // {id, dir, data, thumbnailDataUrl}
  const [isDirty, setIsDirty] = useState(false);
  const [bricks, setBricks] = useState([]);
  const [selectedBrickId, setSelectedBrickId] = useState('');
  const [tab, setTab] = useState('model'); // model | actions | routines | controller | logs
  const [initialModules, setInitialModules] = useState(null);
  const [servoDetail, setServoDetail] = useState(null); // {id, mode, min, max, pos, speed, maxSpeed, dir, lastPos}
  const [motorDetail, setMotorDetail] = useState(null); // {id, dir, speed, maxSpeed, durationMs}
  const [eyeDetail, setEyeDetail] = useState(null); // {id, hex, r, g, b, anim, speedMs}
  const [irPanel, setIrPanel] = useState({ open: false, live: false });
  const [usPanel, setUsPanel] = useState({
    open: false,
    live: false,
    led: { id: 1, hex: '#00ff00', r: 0, g: 255, b: 0 },
  });
  const [sensorReadings, setSensorReadings] = useState({ ir: {}, us: {} }); // {ir:{[id]:{raw,at}}, us:{[id]:{raw,at}}}
  const [sensorError, setSensorError] = useState(null); // string|null
  const [isScanning, setIsScanning] = useState(false);
  const [verboseFrames, setVerboseFrames] = useState(false);
  const [idChange, setIdChange] = useState({ module: 'servo', fromId: 0, toId: 1 });
  const [idChangeError, setIdChangeError] = useState(null);
  const [isChangingId, setIsChangingId] = useState(false);
  const [idChangeOpen, setIdChangeOpen] = useState(false);
  const [projectDialog, setProjectDialog] = useState({
    open: false,
    mode: 'new', // new | saveAs | edit
    name: '',
    description: '',
  });
  const ipc = useMemo(() => {
    try {
      if (typeof window?.require !== 'function') return null;
      const electronApi = window.require('electron');
      return electronApi?.ipcRenderer || null;
    } catch (_) {
      return null;
    }
  }, []);
  const eyeAnimCancelRef = useRef(null);
  const routinesRef = useRef(null);
  const controllerRef = useRef(null);
  const routineXmlRamCacheRef = useRef(new Map()); // routineId -> xml (RAM-only, per current project)

  const addLog = useCallback((msg, opts = {}) => {
    const persist = opts?.persist !== false;
    const line = `${new Date().toLocaleTimeString()} ${msg}`;
    setLog((prev) => [line, ...prev].slice(0, 200));
    try {
      if (persist && ipc && currentProject?.id) ipc.send?.('app:log', { projectId: currentProject.id, line });
    } catch (_) {
      // ignore
    }
  }, [ipc, currentProject?.id]);

  const payloadToHex = (payload) => {
    if (!payload) return '';
    const bytes = Array.from(payload);
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const firmware = useMemo(() => modules?.text || 'n/a', [modules]);
  const listMask = (arr) => (arr && arr.length ? arr.join(', ') : 'none');
  const hasProject = Boolean(currentProject?.id);
  const isConnected = status === 'Connected';
  const idChangeMax = idChange.module === 'servo' ? 32 : 8;
  const idChangeDetectedIds = useMemo(() => {
    const kind = String(idChange.module || '').toLowerCase();
    const map = {
      servo: modules?.servos,
      motor: modules?.motors,
      ir: modules?.ir,
      ultrasonic: modules?.ultrasonic,
      eye: modules?.eyes,
      speaker: modules?.speakers,
    };
    const raw = map[kind] || [];
    return Array.from(new Set((Array.isArray(raw) ? raw : []).map(Number).filter((n) => Number.isFinite(n) && n > 0))).sort(
      (a, b) => a - b,
    );
  }, [modules, idChange.module]);
  const idChangeFromOptions = useMemo(() => [0, ...idChangeDetectedIds], [idChangeDetectedIds]);
  const updateCurrentProjectData = useCallback((updater) => {
    setCurrentProject((prev) => {
      if (!prev) return prev;
      const nextData = updater(prev.data || {});
      return { ...prev, data: nextData };
    });
    setIsDirty(true);
  }, []);

  const refreshProjectList = useCallback(async () => {
    if (!ipc) return;
    try {
      const list = await ipc.invoke('project:list');
      setProjects(Array.isArray(list) ? list : []);
    } catch (e) {
      addLog(`Project list failed: ${e?.message || String(e)}`);
    }
  }, [ipc, addLog]);

  useEffect(() => {
    try {
      globalVars.varImport(currentProject?.data?.variables || {});
    } catch (_) {
      // ignore
    }
  }, [currentProject?.id]);

  useEffect(() => {
    routineXmlRamCacheRef.current.clear();
  }, [currentProject?.id]);

  useEffect(() => {
    if (status !== 'Connected') return;
    controllerState.resetAll();
  }, [status, currentProject?.id]);

  const saveCurrentProject = useCallback(async () => {
    if (!ipc || !currentProject?.id) return;
    let routinesPayload = null;
    try {
      routinesPayload = await routinesRef.current?.exportForSave?.();
    } catch (e) {
      addLog(`Routine export failed: ${e?.message || String(e)}`);
    }
    const routinesList = Array.isArray(routinesPayload?.routines)
      ? routinesPayload.routines
      : Array.isArray(currentProject.data?.routines)
        ? currentProject.data.routines
        : [];
    const routineXmlById = routinesPayload?.routineXmlById && typeof routinesPayload.routineXmlById === 'object' ? routinesPayload.routineXmlById : null;
    const dataToSave = {
      ...(currentProject.data || {}),
      variables: (() => {
        try {
          return globalVars.varExport();
        } catch (_) {
          return currentProject.data?.variables || {};
        }
      })(),
      routines: routinesList,
      ...(routineXmlById ? { __routineXmlById: routineXmlById } : null),
      hardware: {
        ...(currentProject.data?.hardware || {}),
        modules: modules || currentProject.data?.hardware?.modules || null,
      },
    };
    const saved = await ipc.invoke('project:save', { id: currentProject.id, data: dataToSave });
    setCurrentProject(saved);
    setIsDirty(false);
    await refreshProjectList();
    addLog('Project saved');
  }, [ipc, currentProject, modules, refreshProjectList, addLog]);

  const openProjectDialog = useCallback(
    (mode) => {
      if ((mode === 'saveAs' || mode === 'edit') && !currentProject?.id) return;
      setProjectDialog({
        open: true,
        mode,
        name: mode === 'new' ? '' : currentProject?.data?.name || 'Project',
        description: mode === 'new' ? '' : currentProject?.data?.description || '',
      });
    },
    [currentProject?.id, currentProject?.data?.name, currentProject?.data?.description],
  );

  const submitProjectDialog = useCallback(async () => {
    if (!ipc) return;
    const name = String(projectDialog.name || '').trim();
    const description = String(projectDialog.description || '');
    if (!name) {
      addLog('Project name is required');
      return;
    }
    if (projectDialog.mode === 'new') {
      const created = await ipc.invoke('project:create', { name, description });
      await refreshProjectList();
      setCurrentProject(created);
      setIsDirty(false);
      setTab('model');
      if (ipc) ipc.invoke('ui:setTitle', `JIMU Control - ${created?.data?.name || name}`);
      addLog(`Project created: ${name}`);
      setProjectDialog((prev) => ({ ...prev, open: false }));
      return;
    }
    if (projectDialog.mode === 'saveAs') {
      if (!currentProject?.id) return;
      const saved = await ipc.invoke('project:clone', { fromId: currentProject.id, name, description });
      setCurrentProject(saved);
      setIsDirty(false);
      await refreshProjectList();
      addLog(`Project saved as "${name}"`);
      if (ipc) ipc.invoke('ui:setTitle', `JIMU Control - ${name}`);
      setProjectDialog((prev) => ({ ...prev, open: false }));
      return;
    }
    if (projectDialog.mode === 'edit') {
      if (!currentProject?.id) return;
      updateCurrentProjectData((d) => ({ ...d, name, description }));
      if (ipc) ipc.invoke('ui:setTitle', `JIMU Control - ${name}`);
      addLog('Project metadata updated (unsaved)');
      setProjectDialog((prev) => ({ ...prev, open: false }));
    }
  }, [ipc, projectDialog, refreshProjectList, currentProject?.id, updateCurrentProjectData, addLog]);

  const openProjectById = useCallback(
    async (id) => {
      if (!ipc) return;
      const loaded = await ipc.invoke('project:open', { id });
      setCurrentProject(loaded);
      setIsDirty(false);
      setTab('model');
      if (ipc) ipc.invoke('ui:setTitle', `JIMU Control - ${loaded?.data?.name || id}`);
      setServoDetail((prev) => {
        if (!prev) return prev;
        const liveIds = modules?.servos || [];
        if (!liveIds.includes(prev.id)) return null;
        const cfg = loaded?.data?.calibration?.servoConfig?.[prev.id];
        const mode = cfg?.mode || 'servo';
        const rawMin = cfg?.min ?? -120;
        const rawMax = cfg?.max ?? 120;
        const min = clamp(Number(rawMin), -120, 119);
        const max = clamp(Number(rawMax), min + 1, 120);
        const pos = clamp(Number(prev.pos ?? 0), min, max);
        return {
          ...prev,
          mode,
          min,
          max,
          pos,
          maxSpeed: cfg?.maxSpeed ?? 1000,
          reverse: Boolean(cfg?.reverse),
        };
      });
      setMotorDetail((prev) => {
        if (!prev) return prev;
        const liveIds = modules?.motors || [];
        if (!liveIds.includes(prev.id)) return null;
        const cfg = loaded?.data?.calibration?.motorConfig?.[prev.id];
        return {
          ...prev,
          maxSpeed: cfg?.maxSpeed ?? 150,
          reverse: Boolean(cfg?.reverse),
          speed: 0,
        };
      });
      return loaded;
    },
    [ipc, modules?.servos, modules?.motors],
  );

  const switchProjectTo = useCallback(
    async (id) => {
      if (isDirty && currentProject?.id) {
        const save = window.confirm('You have unsaved changes. Save now?');
        if (save) {
          try {
            await saveCurrentProject();
          } catch (e) {
            addLog(`Save failed: ${e?.message || String(e)}`);
            return;
          }
        } else {
          const discard = window.confirm('Discard changes and open another project?');
          if (!discard) return;
        }
      }
      await openProjectById(id);
    },
    [isDirty, currentProject?.id, saveCurrentProject, addLog, openProjectById],
  );

  const promptCreateProject = useCallback(async () => {
    if (!ipc) return;
    if (isDirty && currentProject?.id) {
      const save = window.confirm('You have unsaved changes. Save now?');
      if (save) {
        try {
          await saveCurrentProject();
        } catch (e) {
          addLog(`Save failed: ${e?.message || String(e)}`);
          return;
        }
      } else {
        const discard = window.confirm('Discard changes and create a new project?');
        if (!discard) return;
      }
    }
    openProjectDialog('new');
  }, [ipc, isDirty, currentProject?.id, saveCurrentProject, refreshProjectList, addLog, openProjectDialog]);

  const saveAsCurrentProject = useCallback(async () => {
    openProjectDialog('saveAs');
  }, [openProjectDialog]);

  const deleteProjectById = useCallback(
    async (id) => {
      if (!ipc || !id) return;
      if (id === currentProject?.id && isDirty) {
        const save = window.confirm('You have unsaved changes. Save now before deleting this project?');
        if (save) {
          try {
            await saveCurrentProject();
          } catch (e) {
            addLog(`Save failed: ${e?.message || String(e)}`);
            return;
          }
        } else {
          const discard = window.confirm('Discard changes and continue deleting this project?');
          if (!discard) return;
        }
      }
      const ok = window.confirm(`Delete project "${id}"? This removes it from ./jimu_saves/`);
      if (!ok) return;
      await ipc.invoke('project:delete', { id });
      if (currentProject?.id === id) {
        setCurrentProject(null);
        setIsDirty(false);
        if (ipc) ipc.invoke('ui:setTitle', 'JIMU Control');
      }
      await refreshProjectList();
      addLog(`Project deleted: ${id}`);
    },
    [ipc, currentProject?.id, isDirty, saveCurrentProject, refreshProjectList, addLog],
  );
  const closeServoPanel = async () => {
    if (servoDetail && ipc && status === 'Connected') {
      try {
        await ipc.invoke('jimu:rotateServo', { id: servoDetail.id, dir: 0x01, speed: 0 });
      } catch (_) {
        // ignore
      }
      try {
        await ipc.invoke('jimu:readServo', servoDetail.id);
      } catch (_) {
        // ignore
      }
    }
    setServoDetail(null);
  };
  const closeMotorPanel = async () => {
    if (motorDetail && ipc) {
      try {
        await ipc.invoke('jimu:stopMotor', motorDetail.id);
      } catch (_) {
        // ignore best-effort stop
      }
    }
    setMotorDetail(null);
  };

  const turnOffUltrasonicLeds = useCallback(
    async (ids) => {
      if (!ipc) return;
      const list = Array.isArray(ids) ? ids : [];
      for (const id of list) {
        try {
          await ipc.invoke('jimu:setUltrasonicLedOff', { id });
        } catch (_) {
          // best effort
        }
      }
    },
    [ipc],
  );
  const stopEyeAnimation = useCallback(async () => {
    if (eyeAnimCancelRef.current) {
      eyeAnimCancelRef.current();
      eyeAnimCancelRef.current = null;
    }
  }, []);
  const closeEyePanel = useCallback(async () => {
    await stopEyeAnimation();
    if (ipc && eyeDetail?.id) {
      const eyesMask = 1 << (eyeDetail.id - 1);
      try {
        await ipc.invoke('jimu:setEyeOff', { eyesMask });
      } catch (_) {
        // best effort
      }
    }
    setEyeDetail(null);
  }, [stopEyeAnimation, ipc, eyeDetail]);

  useEffect(() => {
    if (!ipc) return;
    const onStatus = (_e, data) => {
      setModules(data);
      setInitialModules((prevInit) => prevInit || data);
      if (currentProject?.id && data?.text) {
        setCurrentProject((prev) =>
          prev
            ? {
                ...prev,
                data: {
                  ...(prev.data || {}),
                  hardware: {
                    ...(prev.data?.hardware || {}),
                    firmware: data?.text || prev.data?.hardware?.firmware || null,
                  },
                },
              }
            : prev,
        );
      }
      addLog(`Status update: ${data?.text || 'n/a'}`);
    };
    const onBattery = (_e, data) => {
      setBattery(data);
      addLog(`Battery: ${data?.volts?.toFixed(3)}V ${data?.charging ? '(charging)' : ''}`);
    };
    const onDisconnect = () => {
      setStatus('Disconnected');
      setModules(null);
      setBattery(null);
      setServoDetail(null);
      setMotorDetail(null);
      setEyeDetail(null);
      stopEyeAnimation();
      setIrPanel({ open: false, live: false });
      setUsPanel((prev) => ({ ...prev, open: false, live: false }));
      setSensorReadings({ ir: {}, us: {} });
      setSensorError(null);
      addLog('Disconnected from device');
    };
    const onNewProject = () => {
      promptCreateProject();
    };
    const onSaveProject = () => {
      if (!currentProject?.id) return;
      saveCurrentProject().catch((e) => addLog(`Save failed: ${e?.message || String(e)}`));
    };
    const onOpenProject = () => {
      refreshProjectList().catch(() => {});
      addLog('Use the Project picker to open a project');
    };
    const onUiLog = (_e, data) => {
      const msg = typeof data === 'string' ? data : data?.message;
      // Main-process diagnostics already know how to persist to the run log;
      // avoid forwarding them back to main again.
      if (msg) addLog(String(msg), { persist: false });
    };
    const onCloseProject = () => {
      handleCloseProject();
    };
    const onServoPos = (_e, data) => {
      if (!data) return;
      setServoDetail((prev) => (prev && prev.id === data.id ? { ...prev, lastPos: data.deg } : prev));
      addLog(`Servo ${data.id} position: ${data.deg}`);
    };
    const onDeviceError = (_e, data) => {
      const id = data?.deviceId != null ? ` id=${data.deviceId}` : '';
      addLog(`Device error ack cmd=0x${(data?.cmd ?? 0).toString(16)}${id} status=${data?.status}`);
    };
    const onErrorReport = (_e, data) => {
      addLog(`Error report (0x05) type=${data?.type ?? 'n/a'} mask=${(data?.maskBytes || []).join(',')}`);
    };
    const onTransportError = (_e, data) => {
      addLog(`Transport error: ${data?.message || 'unknown'}`);
    };
    const onCommandResult = (_e, data) => {
      if (!data) return;
      if (data.ok) return;
      addLog(`Command failed cmd=0x${(data.cmd ?? 0).toString(16)} status=${data.status}`);
    };
    const onTx = (_e, data) => {
      if (!verboseFrames) return;
      const cmd = data?.meta?.cmd ?? data?.cmd;
      const hex = payloadToHex(data?.payload);
      addLog(`=> cmd=0x${(cmd ?? 0).toString(16)} ${hex}`);
    };
    const onFrame = (_e, data) => {
      if (!verboseFrames) return;
      const cmd = data?.meta?.cmd ?? data?.cmd;
      const hex = payloadToHex(data?.payload);
      addLog(`<= cmd=0x${(cmd ?? 0).toString(16)} ${hex}`);
    };
    const onSensor = (_e, evt) => {
      const readings = evt?.parsed?.readings || [];
      if (!readings.length) return;
      const now = Date.now();
      setSensorReadings((prev) => {
        const next = { ir: { ...prev.ir }, us: { ...prev.us } };
        for (const r of readings) {
          if (r?.type === 0x01) next.ir[r.id] = { raw: r.value, at: now };
          if (r?.type === 0x06) next.us[r.id] = { raw: r.value, at: now };
        }
        return next;
      });
    };
    ipc.on('jimu:status', onStatus);
    ipc.on('jimu:battery', onBattery);
    ipc.on('jimu:disconnected', onDisconnect);
    ipc.on('ui:newProject', onNewProject);
    ipc.on('ui:saveProject', onSaveProject);
    ipc.on('ui:openProject', onOpenProject);
    ipc.on('ui:closeProject', onCloseProject);
    ipc.on('ui:log', onUiLog);
    ipc.on('jimu:servoPos', onServoPos);
    ipc.on('jimu:deviceError', onDeviceError);
    ipc.on('jimu:errorReport', onErrorReport);
    ipc.on('jimu:transportError', onTransportError);
    ipc.on('jimu:commandResult', onCommandResult);
    ipc.on('jimu:tx', onTx);
    ipc.on('jimu:frame', onFrame);
    ipc.on('jimu:sensor', onSensor);
    return () => {
      ipc.removeListener('jimu:status', onStatus);
      ipc.removeListener('jimu:battery', onBattery);
      ipc.removeListener('jimu:disconnected', onDisconnect);
      ipc.removeListener('ui:newProject', onNewProject);
      ipc.removeListener('ui:saveProject', onSaveProject);
      ipc.removeListener('ui:openProject', onOpenProject);
      ipc.removeListener('ui:closeProject', onCloseProject);
      ipc.removeListener('ui:log', onUiLog);
      ipc.removeListener('jimu:servoPos', onServoPos);
      ipc.removeListener('jimu:deviceError', onDeviceError);
      ipc.removeListener('jimu:errorReport', onErrorReport);
      ipc.removeListener('jimu:transportError', onTransportError);
      ipc.removeListener('jimu:commandResult', onCommandResult);
      ipc.removeListener('jimu:tx', onTx);
      ipc.removeListener('jimu:frame', onFrame);
      ipc.removeListener('jimu:sensor', onSensor);
    };
  }, [ipc, currentProject, addLog, verboseFrames, promptCreateProject, refreshProjectList, saveCurrentProject, stopEyeAnimation]);

  useEffect(() => {
    refreshProjectList().catch(() => {});
  }, [refreshProjectList]);

  useEffect(() => {
    if (!ipc) return;
    if (!irPanel.live && !usPanel.live) return;
    if (!modules?.ir?.length && !modules?.ultrasonic?.length) return;
    let disposed = false;
    const delayMs = 250;
    const run = async () => {
      while (!disposed) {
        try {
          const res = await ipc.invoke('jimu:readSensors');
          if (res?.error) {
            setSensorError(res.message || 'Sensor read failed');
          } else {
            setSensorError(null);
          }
        } catch (e) {
          setSensorError(e?.message || String(e));
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
    };
    run();
    return () => {
      disposed = true;
    };
  }, [ipc, irPanel.live, usPanel.live, modules?.ir, modules?.ultrasonic]);

  const handleConnect = async () => {
    if (!ipc) return addLog('IPC unavailable');
    if (!currentProject) return addLog('Select or create a project first');
    if (!selectedBrickId) return addLog('Scan and select a JIMU brick first');
    setStatus('Connecting...');
    try {
      const info = await ipc.invoke('jimu:connect', selectedBrickId);
      setStatus('Connected');
      setModules(info?.modules || null);
      setBattery(info?.battery || null);
      const nextBrick = {
        id: selectedBrickId,
        name: bricks.find((b) => b.id === selectedBrickId)?.name || null,
      };
      const nextFirmware = info?.modules?.text || null;
      const prevBrick = currentProject?.data?.hardware?.connectedBrick || null;
      const prevFirmware = currentProject?.data?.hardware?.firmware || null;
      const shouldMarkDirty =
        (!prevBrick && nextBrick?.id) ||
        prevBrick?.id !== nextBrick?.id ||
        prevBrick?.name !== nextBrick?.name ||
        (nextFirmware && prevFirmware !== nextFirmware);
      setCurrentProject((prev) =>
        prev
          ? {
              ...prev,
              data: {
                ...(prev.data || {}),
                hardware: {
                  ...(prev.data?.hardware || {}),
                  connectedBrick: nextBrick,
                  firmware: nextFirmware || prev.data?.hardware?.firmware || null,
                },
              },
            }
          : prev,
      );
      if (shouldMarkDirty) setIsDirty(true);
      setInitialModules(info?.modules || null);
      addLog('Connected to JIMU');
    } catch (err) {
      setStatus('Error');
      addLog(`Connect failed: ${err.message}`);
    }
  };

  const handleRefresh = async () => {
    if (!ipc) return;
    try {
      const s = await ipc.invoke('jimu:refreshStatus');
      setModules(s || null);
      // refresh is a live status; saved module snapshot updates only on explicit Save
    } catch (e) {
      addLog(`Refresh status failed: ${e?.message || String(e)}`);
    }
  };

  const handleCloseProject = async () => {
    if (tab === 'routines' && routinesRef.current?.confirmCanLeave) {
      const ok = await routinesRef.current.confirmCanLeave();
      if (!ok) return;
      await routinesRef.current.stopIfRunning?.();
    }
    await turnOffUltrasonicLeds(modules?.ultrasonic);
    if (isDirty) {
      const save = window.confirm('You have unsaved changes. Save now?');
      if (save) {
        try {
          await saveCurrentProject();
        } catch (e) {
          addLog(`Save failed: ${e?.message || String(e)}`);
        }
      } else {
        const discard = window.confirm('Discard changes and close project?');
        if (!discard) return;
      }
    }
    if (ipc) {
      try {
        await ipc.invoke('jimu:emergencyStop');
      } catch (_) {
        // ignore best effort
      }
    }
    await closeServoPanel();
    await closeMotorPanel();
    await closeEyePanel();
    if (ipc) {
      try {
        await ipc.invoke('jimu:disconnect');
      } catch (_) {
        // ignore best effort
      }
    }
    setModules(null);
    setBattery(null);
    setSelectedBrickId('');
    setInitialModules(null);
    setIrPanel({ open: false, live: false });
    setUsPanel((prev) => ({ ...prev, open: false, live: false }));
    setSensorReadings({ ir: {}, us: {} });
    setSensorError(null);
    setCurrentProject(null);
    setIsDirty(false);
    if (ipc) ipc.invoke('ui:setTitle', 'JIMU Control');
  };

  const handleReadSensors = async () => {
    if (!ipc) return;
    try {
      await ipc.invoke('jimu:readSensors');
      addLog('Requested sensor read');
    } catch (e) {
      addLog(`Sensor read request failed: ${e?.message || String(e)}`);
    }
  };

  const handleServoTest = async () => {
    if (!ipc) return;
    try {
      await ipc.invoke('jimu:setEyeRed');
      addLog('Eye set red (test)');
    } catch (e) {
      addLog(`Eye test failed: ${e?.message || String(e)}`);
    }
  };

  return (
    <div
      style={{
        fontFamily: 'Segoe UI, sans-serif',
        padding: 12,
        width: '100%',
        boxSizing: 'border-box',
        minHeight: 'calc(100vh - 24px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >

      <Section>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {!ipc ? (
            <div style={{ width: '100%', marginBottom: 8, color: '#b71c1c' }}>
              IPC unavailable: running UI without Electron bridge (device + project persistence disabled).
            </div>
          ) : null}
          {projectDialog.open ? (
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
                if (e.target === e.currentTarget) setProjectDialog((prev) => ({ ...prev, open: false }));
              }}
            >
              <div style={{ width: 'min(520px, 92vw)', background: '#fff', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontWeight: 700 }}>
                    {projectDialog.mode === 'new' ? 'New project' : projectDialog.mode === 'saveAs' ? 'Save project as' : 'Edit project'}
                  </div>
                  <button onClick={() => setProjectDialog((prev) => ({ ...prev, open: false }))}>Close</button>
                </div>
                <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span>Name</span>
                    <input
                      type="text"
                      value={projectDialog.name}
                      onChange={(e) => setProjectDialog((prev) => ({ ...prev, name: e.target.value }))}
                      autoFocus
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span>Description</span>
                    <textarea
                      rows={3}
                      value={projectDialog.description}
                      onChange={(e) => setProjectDialog((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </label>
                  {projectDialog.mode === 'edit' ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <button
                        onClick={async () => {
                          if (!ipc || !currentProject?.id) return;
                          try {
                            const res = await ipc.invoke('project:setThumbnail', { id: currentProject.id });
                            if (res?.thumbnailDataUrl) {
                              setCurrentProject((prev) => (prev ? { ...prev, thumbnailDataUrl: res.thumbnailDataUrl } : prev));
                              await refreshProjectList();
                              addLog('Thumbnail updated');
                            }
                          } catch (e) {
                            addLog(`Thumbnail set failed: ${e?.message || String(e)}`);
                          }
                        }}
                      >
                        Change thumbnail
                      </button>
                      <button
                        onClick={async () => {
                          if (!currentProject?.id) return;
                          await deleteProjectById(currentProject.id);
                          setProjectDialog((prev) => ({ ...prev, open: false }));
                        }}
                        style={{ background: '#b71c1c', color: '#fff', border: '1px solid #7f0000' }}
                      >
                        Delete project
                      </button>
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setProjectDialog((prev) => ({ ...prev, open: false }))}>Cancel</button>
                    <button
                      onClick={() => {
                        submitProjectDialog().catch((e) => addLog(`Project action failed: ${e?.message || String(e)}`));
                      }}
                    >
                      {projectDialog.mode === 'new' ? 'Create' : projectDialog.mode === 'saveAs' ? 'Save As' : 'Apply'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {!hasProject ? (
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <button onClick={promptCreateProject}>New project</button>
                <button onClick={refreshProjectList}>Refresh list</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10 }}>
                {projects.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: 8,
                      padding: 10,
                      display: 'grid',
                      gridTemplateColumns: '72px 1fr',
                      gap: 10,
                      alignItems: 'start',
                    }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 6,
                        border: '1px solid #ccc',
                        background: '#f3f3f3',
                        overflow: 'hidden',
                      }}
                      title={p.thumbnailDataUrl ? 'Thumbnail' : 'No thumbnail'}
                    >
                      {p.thumbnailDataUrl ? (
                        <img src={p.thumbnailDataUrl} width={64} height={64} alt="" style={{ display: 'block' }} />
                      ) : null}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.name || p.id}</div>
                      <div style={{ color: '#666', fontSize: 12, minHeight: 32 }}>
                        {p.description ? (
                          String(p.description).slice(0, 80)
                        ) : (
                          <span style={{ color: '#999' }}>No description</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => switchProjectTo(p.id)}>Open</button>
                      </div>
                    </div>
                  </div>
                ))}
                {projects.length === 0 ? <div style={{ color: '#777' }}>No saved projects yet.</div> : null}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <button
                  onClick={() => openProjectDialog('edit')}
                  style={{
                    width: 72,
                    height: 72,
                    padding: 0,
                    border: '1px solid #ccc',
                    borderRadius: 10,
                    background: '#f3f3f3',
                    overflow: 'hidden',
                  }}
                  title="Project thumbnail (Edit to change)"
                >
                  {currentProject?.thumbnailDataUrl ? (
                    <img
                      src={currentProject.thumbnailDataUrl}
                      width={72}
                      height={72}
                      alt=""
                      style={{ display: 'block' }}
                    />
                  ) : (
                    <div style={{ fontSize: 11, color: '#666' }}>No thumbnail</div>
                  )}
                </button>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      Project {currentProject?.data?.name || currentProject?.id}
                      {isDirty ? <span style={{ marginLeft: 8, color: '#c62828' }}>*</span> : null}
                    </div>
                    <button onClick={() => openProjectDialog('edit')}>Edit</button>
                  </div>
                  <div style={{ marginTop: 6, color: '#555' }}>
                    <span style={{ color: '#666' }}>Description:</span>{' '}
                    {currentProject?.data?.description ? (
                      <span>{currentProject.data.description}</span>
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() =>
                        saveCurrentProject().catch((e) => addLog(`Save failed: ${e?.message || String(e)}`))
                      }
                    >
                      Save
                    </button>
                    <button onClick={saveAsCurrentProject}>
                      Save As
                    </button>
                    <button
                      onClick={async () => {
                        if (!currentProject?.id) return;
                        if (isDirty) {
                          const ok = window.confirm('Revert local changes and reload from disk?');
                          if (!ok) return;
                        }
                        await openProjectById(currentProject.id);
                        addLog('Project reloaded');
                      }}
                    >
                      Revert
                    </button>
                    <button onClick={handleCloseProject}>Close</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}
          >
            <button
              onClick={async () => {
                if (!ipc) return;
                try {
                  await routinesRef.current?.stopIfRunning?.();
                  await controllerRef.current?.stopAllRoutines?.();
                  await ipc.invoke('jimu:emergencyStop');
                  addLog('Emergency stop issued');
                } catch (e) {
                  addLog(`Emergency stop failed: ${e?.message || String(e)}`);
                }
              }}
              style={{
                background: '#c62828',
                color: '#fff',
                border: '1px solid #8e0000',
                height: 42,
              }}
              title="Stop motors/rotations and release servos (best effort)"
            >
              Emergency Stop
            </button>
            <BatteryIcon volts={battery?.volts} connected={isConnected} />
          </div>
        </div>
      </Section>

      {!hasProject ? (
        <Section title="Create or select a project">
          <div style={{ color: '#777' }}>Use the controls above to create or open a project.</div>
        </Section>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, width: '100%' }}>
            {['model', 'actions', 'routines', 'controller', 'logs'].map((t) => (
              <button
                key={t}
                onClick={async () => {
                  if (tab === 'routines' && t !== 'routines' && routinesRef.current?.confirmCanLeave) {
                    const ok = await routinesRef.current.confirmCanLeave();
                    if (!ok) return;
                    await routinesRef.current.stopIfRunning?.();
                  }
                  await closeServoPanel();
                  await closeMotorPanel();
                  await closeEyePanel();
                  await turnOffUltrasonicLeds(modules?.ultrasonic);
                  setIrPanel({ open: false, live: false });
                  setUsPanel((prev) => ({ ...prev, open: false, live: false }));
                  setSensorError(null);
                  setTab(t);
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: tab === t ? '#0057d8' : '#eee',
                  color: tab === t ? '#fff' : '#000',
                  border: '1px solid #ccc',
                  borderRadius: 6,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {t === 'model'
                  ? 'Model'
                  : t === 'actions'
                    ? 'Actions'
                    : t === 'routines'
                      ? 'Routines'
                      : t === 'controller'
                        ? 'Controller'
                        : 'Logs'}
              </button>
            ))}
          </div>

          {tab === 'model' && (
            <>
              <Section title="Connection">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={async () => {
                      if (!ipc) return;
                      setIsScanning(true);
                      try {
                        const found = await ipc.invoke('jimu:scan');
                        setBricks(found);
                        const preferredId = currentProject?.data?.hardware?.connectedBrick?.id;
                        if (preferredId && found.some((b) => b.id === preferredId)) {
                          setSelectedBrickId(preferredId);
                        }
                        addLog(`Scan found ${found.length} device(s)`);
                      } catch (e) {
                        addLog(`Scan failed: ${e?.message || String(e)}`);
                      } finally {
                        setIsScanning(false);
                      }
                    }}
                  >
                    {isScanning ? 'Scanning...' : 'Scan bricks'}
                  </button>
                  <select value={selectedBrickId} onChange={(e) => setSelectedBrickId(e.target.value)}>
                    <option value="">Select brick</option>
                    {bricks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.id})
                      </option>
                    ))}
                  </select>
                  <button onClick={handleConnect}>Connect</button>
                  <button onClick={handleRefresh}>Refresh status</button>
                  <span>
                    Status:{' '}
                    <span
                      style={{
                        fontWeight: 700,
                        color:
                          status === 'Connected'
                            ? '#2ea44f'
                            : status === 'Disconnected'
                              ? '#777'
                              : status === 'Error'
                                ? '#c62828'
                                : '#444',
                      }}
                    >
                      {status}
                    </span>
                  </span>
                  <div style={{ marginLeft: 'auto' }} />
                  <button
                    disabled={!ipc}
                    onClick={() => {
                      setIdChangeError(null);
                      setIdChangeOpen(true);
                    }}
                  >
                    Change ID
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <strong>Firmware:</strong> {firmware}
                  <br />
                  <strong>Battery:</strong>{' '}
                  {battery ? `${battery.volts.toFixed(3)}V ${battery.charging ? '(charging)' : ''}` : 'n/a'}
                </div>
              </Section>

              {idChangeOpen && (
                <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: 16,
                  }}
                  onMouseDown={() => setIdChangeOpen(false)}
                >
                  <div
                    style={{
                      width: 'min(780px, 100%)',
                      background: '#fff',
                      borderRadius: 10,
                      border: '1px solid #ddd',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
                      padding: 14,
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>Change module ID</div>
                      <button onClick={() => setIdChangeOpen(false)}>Cancel</button>
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#555' }}>Module</span>
                        <select
                          value={idChange.module}
                          onChange={(e) => {
                            const next = String(e.target.value || 'servo');
                            setIdChange({ module: next, fromId: 0, toId: 1 });
                            setIdChangeError(null);
                          }}
                        >
                          <option value="servo">Servo</option>
                          <option value="motor">Motor</option>
                          <option value="ir">IR</option>
                          <option value="ultrasonic">Ultrasonic</option>
                          <option value="eye">Eye</option>
                          <option value="speaker">Speaker</option>
                        </select>
                      </label>

                      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#555' }}>From ID</span>
                        <select
                          value={String(idChange.fromId)}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            setIdChange((prev) => ({ ...prev, fromId: Number.isFinite(next) ? next : 0 }));
                            setIdChangeError(null);
                          }}
                        >
                          {idChangeFromOptions.map((id) => (
                            <option key={`from-${id}`} value={String(id)}>
                              {id === 0 ? '0 (fix)' : String(id)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#555' }}>To ID</span>
                        <input
                          type="number"
                          min={1}
                          max={idChangeMax}
                          value={idChange.toId}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            setIdChange((prev) => ({ ...prev, toId: Number.isFinite(next) ? next : 1 }));
                            setIdChangeError(null);
                          }}
                          style={{ width: 88 }}
                        />
                        <span style={{ fontSize: 12, color: '#777' }}>(1..{idChangeMax})</span>
                      </label>

                      <button
                        disabled={!isConnected || !ipc || isChangingId}
                        onClick={async () => {
                          if (!ipc) return;
                          if (!isConnected) return setIdChangeError('Connect to a brick first');

                          const kind = String(idChange.module || '').toLowerCase();
                          const max = kind === 'servo' ? 32 : 8;
                          const fromId = Math.max(0, Math.min(max, Math.round(Number(idChange.fromId))));
                          const toId = Math.max(1, Math.min(max, Math.round(Number(idChange.toId))));
                          if (!Number.isFinite(fromId) || !Number.isFinite(toId)) {
                            setIdChangeError('Invalid ID values');
                            return;
                          }
                          if (kind === 'servo' && (toId < 1 || toId > 32)) {
                            setIdChangeError('Servo ID must be 1..32');
                            return;
                          }
                          if (kind !== 'servo' && (toId < 1 || toId > 8)) {
                            setIdChangeError('Peripheral ID must be 1..8');
                            return;
                          }

                          setIsChangingId(true);
                          setIdChangeError(null);
                          try {
                            await closeServoPanel();
                            await closeMotorPanel();
                            await closeEyePanel();
                            await turnOffUltrasonicLeds(modules?.ultrasonic);
                            setIrPanel({ open: false, live: false });
                            setUsPanel((prev) => ({ ...prev, open: false, live: false }));
                            setSensorError(null);

                            await ipc.invoke('jimu:changeModuleId', { module: kind, fromId, toId });
                            addLog(`Changed ${kind} ID: ${fromId} -> ${toId}`);
                            setIdChange((prev) => ({ ...prev, fromId: toId }));

                            const s = await ipc.invoke('jimu:refreshStatus');
                            setModules(s || null);
                          } catch (e) {
                            const msg = e?.message || String(e);
                            setIdChangeError(msg);
                            addLog(`Change ID failed: ${msg}`);
                          } finally {
                            setIsChangingId(false);
                          }
                        }}
                      >
                        {isChangingId ? 'Changing...' : 'Change ID'}
                      </button>
                    </div>

                    {idChangeError && <div style={{ marginTop: 10, color: '#c62828' }}>{idChangeError}</div>}
                    <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
                      Requires an active connection. After changing the ID, the app refreshes status to rescan detected modules.
                    </div>
                  </div>
                </div>
              )}

              <Section title="Model Config (live overview)">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
                  <div>
                    <strong>Servos</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {uniqSortedNums([
                        ...(currentProject?.data?.hardware?.modules?.servos || []),
                        ...(modules?.servos || []),
                      ]).map((id) => {
                        const savedIds = currentProject?.data?.hardware?.modules?.servos || [];
                        const liveIds = modules?.servos || [];
                        const isLive = isConnected && liveIds.includes(id);
                        const statusKind = getModuleStatusKind(id, savedIds, liveIds, { connected: isConnected });
                        const cfg = currentProject?.data?.calibration?.servoConfig?.[id] || {};
                        const mode = String(cfg?.mode || 'servo');
                        const showServoIcon = mode === 'servo' || mode === 'mixed' || !mode;
                        const showWheelIcon = mode === 'motor' || mode === 'mixed';
                        return (
                          <button
                            key={`sv${id}`}
                            onClick={async () => {
                              if (!isLive) return;
                            if (servoDetail && servoDetail.id !== id) {
                              await closeServoPanel();
                            }
                            if (motorDetail) await closeMotorPanel();
                            if (eyeDetail) await closeEyePanel();
                            await turnOffUltrasonicLeds(modules?.ultrasonic);
                            setIrPanel({ open: false, live: false });
                            setUsPanel((prev) => ({ ...prev, open: false, live: false }));
                            setSensorError(null);
                            setServoDetail((prev) => {
                              const cfg = currentProject?.data?.calibration?.servoConfig?.[id] || {};
                              const mode = prev?.id === id ? prev.mode : cfg.mode || 'servo';
                              const rawMin = prev?.id === id ? prev.min : cfg.min ?? -120;
                              const rawMax = prev?.id === id ? prev.max : cfg.max ?? 120;
                              const min = clamp(Number(rawMin), -120, 119);
                              const max = clamp(Number(rawMax), min + 1, 120);
                              const pos = prev?.id === id ? prev.pos : clamp(0, min, max);
                              return {
                                id,
                                mode,
                                min,
                                max,
                                pos,
                                speed: prev?.id === id ? prev.speed : 0,
                                maxSpeed: prev?.id === id ? prev.maxSpeed : cfg.maxSpeed ?? 1000,
                                reverse: prev?.id === id ? prev.reverse : Boolean(cfg.reverse),
                                dir: prev?.id === id ? prev.dir : 'cw',
                                lastPos: prev?.id === id ? prev.lastPos : null,
                              };
                            });
                            if (ipc) {
                              try {
                                await ipc.invoke('jimu:readServo', id);
                              } catch (e) {
                                addLog(`Servo ${id} read failed: ${e?.message || String(e)}`);
                              }
                            }
                            }}
                            style={moduleButtonStyle(statusKind, isLive)}
                            title={statusKind}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span>Servo {id}</span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 2 }}>
                                {showServoIcon ? (
                                  <img
                                    src={servoIconUrl}
                                    width={14}
                                    height={14}
                                    style={{ display: 'block' }}
                                    alt="servo mode"
                                    title="servo/mixed mode"
                                  />
                                ) : null}
                                {showWheelIcon ? (
                                  <img
                                    src={wheelIconUrl}
                                    width={14}
                                    height={14}
                                    style={{ display: 'block' }}
                                    alt="motor mode"
                                    title="motor/mixed mode"
                                  />
                                ) : null}
                              </span>
                            </span>
                          </button>
                        );
                      }) || <span>none</span>}
                    </div>
                  </div>
                  <div>
                    <strong>Motors</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {uniqSortedNums([
                        ...(currentProject?.data?.hardware?.modules?.motors || []),
                        ...(modules?.motors || []),
                      ]).map((id) => {
                        const savedIds = currentProject?.data?.hardware?.modules?.motors || [];
                        const liveIds = modules?.motors || [];
                        const isLive = isConnected && liveIds.includes(id);
                        const statusKind = getModuleStatusKind(id, savedIds, liveIds, { connected: isConnected });
                        return (
                          <button
                            key={`m${id}`}
                            onClick={async () => {
                              if (!isLive) return;
                            if (motorDetail && motorDetail.id !== id) await closeMotorPanel();
                            if (servoDetail) await closeServoPanel();
                            if (eyeDetail) await closeEyePanel();
                            await turnOffUltrasonicLeds(modules?.ultrasonic);
                            setIrPanel({ open: false, live: false });
                            setUsPanel((prev) => ({ ...prev, open: false, live: false }));
                            setSensorError(null);
                            setMotorDetail((prev) => ({
                              id,
                              reverse: prev?.id === id ? prev.reverse : Boolean(currentProject?.data?.calibration?.motorConfig?.[id]?.reverse),
                              dir: prev?.id === id ? prev.dir : 'cw',
                              speed: 0,
                              maxSpeed: prev?.id === id ? prev.maxSpeed : currentProject?.data?.calibration?.motorConfig?.[id]?.maxSpeed ?? 150,
                              durationMs: prev?.id === id ? prev.durationMs : 1000,
                            }));
                            }}
                            style={moduleButtonStyle(statusKind, isLive)}
                            title={statusKind}
                          >
                            Motor {id}
                          </button>
                        );
                      }) || <span>none</span>}
                    </div>
                  </div>
                  <div>
                    <strong>IR</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {uniqSortedNums([
                        ...(currentProject?.data?.hardware?.modules?.ir || []),
                        ...(modules?.ir || []),
                      ]).map((id) => {
                        const savedIds = currentProject?.data?.hardware?.modules?.ir || [];
                        const liveIds = modules?.ir || [];
                        const isLive = isConnected && liveIds.includes(id);
                        const statusKind = getModuleStatusKind(id, savedIds, liveIds, { connected: isConnected });
                        return (
                          <button
                            key={`ir${id}`}
                            onClick={async () => {
                              if (!isLive) return;
                            if (servoDetail) await closeServoPanel();
                            if (motorDetail) await closeMotorPanel();
                            if (eyeDetail) await closeEyePanel();
                            await turnOffUltrasonicLeds(modules?.ultrasonic);
                            setUsPanel((prev) => ({ ...prev, open: false, live: false }));
                            setIrPanel({ open: true, live: true });
                            }}
                            style={moduleButtonStyle(statusKind, isLive)}
                            title={statusKind}
                          >
                            IR {id}
                          </button>
                        );
                      }) || <span>none</span>}
                    </div>
                  </div>
                  <div>
                    <strong>Ultrasonic</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {uniqSortedNums([
                        ...(currentProject?.data?.hardware?.modules?.ultrasonic || []),
                        ...(modules?.ultrasonic || []),
                      ]).map((id) => {
                        const savedIds = currentProject?.data?.hardware?.modules?.ultrasonic || [];
                        const liveIds = modules?.ultrasonic || [];
                        const isLive = isConnected && liveIds.includes(id);
                        const statusKind = getModuleStatusKind(id, savedIds, liveIds, { connected: isConnected });
                        return (
                          <button
                            key={`us${id}`}
                            onClick={async () => {
                              if (!isLive) return;
                            if (servoDetail) await closeServoPanel();
                            if (motorDetail) await closeMotorPanel();
                            if (eyeDetail) await closeEyePanel();
                            setIrPanel({ open: false, live: false });
                            setUsPanel((prev) => ({ ...prev, open: true, live: true, led: { ...prev.led, id } }));
                            }}
                            style={moduleButtonStyle(statusKind, isLive)}
                            title={statusKind}
                          >
                            US {id}
                          </button>
                        );
                      }) || <span>none</span>}
                    </div>
                  </div>
                  <div>
                    <strong>Eyes</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {uniqSortedNums([
                        ...(currentProject?.data?.hardware?.modules?.eyes || []),
                        ...(modules?.eyes || []),
                      ]).map((id) => {
                        const savedIds = currentProject?.data?.hardware?.modules?.eyes || [];
                        const liveIds = modules?.eyes || [];
                        const isLive = isConnected && liveIds.includes(id);
                        const statusKind = getModuleStatusKind(id, savedIds, liveIds, { connected: isConnected });
                        return (
                          <button
                            key={`eye${id}`}
                            onClick={async () => {
                              if (!isLive) return;
                            if (servoDetail) await closeServoPanel();
                            if (motorDetail) await closeMotorPanel();
                            await turnOffUltrasonicLeds(modules?.ultrasonic);
                            setIrPanel({ open: false, live: false });
                            setUsPanel((prev) => ({ ...prev, open: false, live: false }));
                            setSensorError(null);
                            await stopEyeAnimation();
                            const initialHex = '#00ff00';
                            const rgb = hexToRgb(initialHex);
                            setEyeDetail({
                              id,
                              hex: initialHex,
                              r: rgb?.r ?? 0,
                              g: rgb?.g ?? 255,
                              b: rgb?.b ?? 0,
                              anim: 'none',
                              speedMs: 250,
                            });
                            }}
                            style={moduleButtonStyle(statusKind, isLive)}
                            title={statusKind}
                          >
                            Eye {id}
                          </button>
                        );
                      }) || <span>none</span>}
                    </div>
                  </div>
                  <div>
                    <strong>Speakers</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {uniqSortedNums([
                        ...(currentProject?.data?.hardware?.modules?.speakers || []),
                        ...(modules?.speakers || []),
                      ]).map((id) => {
                        const savedIds = currentProject?.data?.hardware?.modules?.speakers || [];
                        const liveIds = modules?.speakers || [];
                        const isLive = isConnected && liveIds.includes(id);
                        const statusKind = getModuleStatusKind(id, savedIds, liveIds, { connected: isConnected });
                        return (
                          <span
                            key={`spk${id}`}
                            style={{ ...moduleBadgeStyle(statusKind), opacity: isLive ? 1 : 0.65 }}
                            title={statusKind}
                          >
                            Speaker {id}
                          </span>
                        );
                      })}
                      {uniqSortedNums([
                        ...(currentProject?.data?.hardware?.modules?.speakers || []),
                        ...(modules?.speakers || []),
                      ]).length === 0 ? (
                        <span style={{ color: '#777' }}>none</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {servoDetail && (
                  <div style={{ marginTop: 12, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0 }}>Selected servo ID{servoDetail.id}</h3>
                      <button onClick={closeServoPanel}>Close</button>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <label>
                        Mode:{' '}
                        <select
                          value={servoDetail.mode}
                          onChange={(e) => setServoDetail((prev) => ({ ...prev, mode: e.target.value }))}
                        >
                          <option value="servo">servo</option>
                          <option value="motor">motor</option>
                          <option value="mixed">mixed</option>
                        </select>
                      </label>
                      <label style={{ marginLeft: 12 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(servoDetail.reverse)}
                          onChange={(e) => setServoDetail((prev) => ({ ...prev, reverse: e.target.checked }))}
                        />{' '}
                        Reverse
                      </label>
                    </div>
                    {(servoDetail.mode === 'servo' || servoDetail.mode === 'mixed') && (
                      <div style={{ marginTop: 12 }}>
                        <TouchBarSlider
                          minValue={servoDetail.min}
                          maxValue={servoDetail.max}
                          value={servoDetail.pos}
                          onChange={({ min, max, value }) =>
                            setServoDetail((prev) => {
                              const safeMin = clamp(min, -120, 119);
                              const safeMax = clamp(max, safeMin + 1, 120);
                              const safePos = clamp(value, safeMin, safeMax);
                              return { ...prev, min: safeMin, max: safeMax, pos: safePos };
                            })
                          }
                        />
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                          <label>
                            Min{' '}
                            <input
                              type="number"
                              style={{ width: 70 }}
                              value={servoDetail.min}
                              onChange={(e) =>
                                setServoDetail((prev) => {
                                  const min = clamp(Number(e.target.value), -120, prev.max - 1);
                                  const pos = clamp(prev.pos, min, prev.max);
                                  return { ...prev, min, pos };
                                })
                              }
                            />
                          </label>
                          <label>
                            Max{' '}
                            <input
                              type="number"
                              style={{ width: 70 }}
                              value={servoDetail.max}
                              onChange={(e) =>
                                setServoDetail((prev) => {
                                  const max = clamp(Number(e.target.value), prev.min + 1, 120);
                                  const pos = clamp(prev.pos, prev.min, max);
                                  return { ...prev, max, pos };
                                })
                              }
                            />
                          </label>
                          <span>
                            Test position: <strong>{servoDetail.pos}</strong> deg
                          </span>
                        </div>
                        <div>
                          <button
                            onClick={async () => {
                              if (!ipc) return;
                              try {
                                const res = await ipc.invoke('jimu:readServo', servoDetail.id);
                                const deg = typeof res?.deg === 'number' ? res.deg : null;
                                if (deg == null) {
                                  addLog(`Servo ${servoDetail.id} read returned no position`);
                                  return;
                                }
                                const uiDeg = servoDetail.reverse ? -deg : deg;
                                setServoDetail((prev) => {
                                  if (!prev || prev.id !== servoDetail.id) return prev;
                                  const pos = clamp(Math.round(uiDeg), prev.min, prev.max);
                                  return { ...prev, pos, lastPos: pos };
                                });
                                addLog(`Servo ${servoDetail.id} position read: ${deg} deg`);
                              } catch (e) {
                                addLog(`Servo ${servoDetail.id} read failed: ${e?.message || String(e)}`);
                              }
                            }}
                          >
                            Get position
                          </button>
                          <button
                            style={{ marginLeft: 8 }}
                            onClick={async () => {
                              if (!ipc) return;
                              try {
                                await ipc.invoke('jimu:setServoPos', {
                                  id: servoDetail.id,
                                  posDeg: servoDetail.reverse ? -servoDetail.pos : servoDetail.pos,
                                });
                                setServoDetail((prev) => ({ ...prev, lastPos: servoDetail.pos }));
                                addLog(`Servo ${servoDetail.id} -> pos ${servoDetail.pos}`);
                              } catch (e) {
                                addLog(`Servo set position failed: ${e?.message || String(e)}`);
                              }
                            }}
                          >
                            Test position
                          </button>
                          <button
                            style={{ marginLeft: 8 }}
                            onClick={async () => {
                              if (!ipc) return;
                              setServoDetail((prev) => ({ ...prev, lastPos: 'pending' }));
                              try {
                                await ipc.invoke('jimu:readServo', servoDetail.id);
                                addLog(`Servo ${servoDetail.id} released (readServo)`);
                              } catch (e) {
                                addLog(`Servo release failed: ${e?.message || String(e)}`);
                                setServoDetail((prev) => ({ ...prev, lastPos: 'error' }));
                              }
                            }}
                          >
                            Stop / release
                          </button>
                          <button
                            style={{ marginLeft: 8 }}
                            onClick={() => {
                              updateCurrentProjectData((d) => ({
                                ...d,
                                calibration: {
                                  ...(d.calibration || {}),
                                  servoConfig: {
                                    ...(d.calibration?.servoConfig || {}),
                                    [servoDetail.id]: {
                                      mode: servoDetail.mode,
                                      min: servoDetail.min,
                                      max: servoDetail.max,
                                      maxSpeed: servoDetail.maxSpeed ?? 1000,
                                      reverse: Boolean(servoDetail.reverse),
                                    },
                                  },
                                },
                              }));
                              addLog(`Saved servo ${servoDetail.id} config`);
                            }}
                          >
                            Save settings
                          </button>
                        </div>
                      </div>
                    )}
                    {(servoDetail.mode === 'motor' || servoDetail.mode === 'mixed') && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                          <label>
                            <input
                              type="radio"
                              checked={servoDetail.dir === 'ccw'}
                              onChange={() => setServoDetail((prev) => ({ ...prev, dir: 'ccw' }))}
                            />{' '}
                            Counter clockwise
                          </label>
                          <label>
                            <input
                              type="radio"
                              checked={servoDetail.dir === 'cw'}
                              onChange={() => setServoDetail((prev) => ({ ...prev, dir: 'cw' }))}
                            />{' '}
                            Clockwise
                          </label>
                          <label>
                            Max speed (1-1000){' '}
                            <input
                              type="number"
                              style={{ width: 100 }}
                              value={servoDetail.maxSpeed ?? 1000}
                              onChange={(e) =>
                                setServoDetail((prev) => {
                                  const ms = Math.max(1, Math.min(1000, Number(e.target.value)));
                                  return { ...prev, maxSpeed: ms, speed: Math.min(prev.speed ?? ms, ms) };
                                })
                              }
                            />
                          </label>
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>0</span>
                          <input
                            type="range"
                            min={0}
                            max={servoDetail.maxSpeed ?? 1000}
                            value={servoDetail.speed ?? 0}
                            onChange={(e) =>
                              setServoDetail((prev) => ({
                                ...prev,
                                speed: Math.max(0, Math.min(prev.maxSpeed ?? 1000, Number(e.target.value))),
                              }))
                            }
                            style={{ flex: 1 }}
                          />
                          <span>{servoDetail.maxSpeed ?? 1000}</span>
                          <span style={{ marginLeft: 8 }}>Speed: {servoDetail.speed ?? 0}</span>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <button
                            onClick={async () => {
                              if (!ipc) return;
                              const dirBase = servoDetail.dir === 'cw' ? 0x01 : 0x02;
                              const dir = servoDetail.reverse ? (dirBase === 0x01 ? 0x02 : 0x01) : dirBase;
                              try {
                                await ipc.invoke('jimu:rotateServo', {
                                  id: servoDetail.id,
                                  dir,
                                  speed: servoDetail.speed ?? 0,
                                  maxSpeed: servoDetail.maxSpeed ?? 1000,
                                });
                                addLog(`Servo ${servoDetail.id} rotate dir=${dir} speed=${servoDetail.speed}`);
                              } catch (e) {
                                addLog(`Servo rotate failed: ${e?.message || String(e)}`);
                              }
                            }}
                          >
                            Test rotation
                          </button>
                          <button
                            style={{ marginLeft: 8 }}
                            onClick={async () => {
                              if (!ipc) return;
                              try {
                                await ipc.invoke('jimu:readServo', servoDetail.id);
                                setServoDetail((prev) => ({ ...prev, speed: 0 }));
                                addLog(`Servo ${servoDetail.id} stop (readServo)`);
                              } catch (e) {
                                addLog(`Servo stop failed: ${e?.message || String(e)}`);
                              }
                            }}
                          >
                            Stop
                          </button>
                          <button
                            style={{ marginLeft: 8 }}
                            onClick={() => {
                              updateCurrentProjectData((d) => ({
                                ...d,
                                calibration: {
                                  ...(d.calibration || {}),
                                  servoConfig: {
                                    ...(d.calibration?.servoConfig || {}),
                                    [servoDetail.id]: {
                                      mode: servoDetail.mode,
                                      min: servoDetail.min,
                                      max: servoDetail.max,
                                      maxSpeed: servoDetail.maxSpeed ?? 1000,
                                      reverse: Boolean(servoDetail.reverse),
                                    },
                                  },
                                },
                              }));
                              addLog(`Saved servo ${servoDetail.id} config`);
                            }}
                          >
                            Save settings
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {motorDetail && (
                  <div style={{ marginTop: 12, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0 }}>Selected motor ID{motorDetail.id}</h3>
                      <button onClick={closeMotorPanel}>Close</button>
                    </div>

                    <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label>
                        <input
                          type="radio"
                          checked={motorDetail.dir === 'ccw'}
                          onChange={() => setMotorDetail((prev) => ({ ...prev, dir: 'ccw' }))}
                        />{' '}
                        Counter clockwise
                      </label>
                      <label>
                        <input
                          type="radio"
                          checked={motorDetail.dir === 'cw'}
                          onChange={() => setMotorDetail((prev) => ({ ...prev, dir: 'cw' }))}
                        />{' '}
                        Clockwise
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(motorDetail.reverse)}
                          onChange={(e) => setMotorDetail((prev) => ({ ...prev, reverse: e.target.checked }))}
                        />{' '}
                        Reverse
                      </label>
                      <label>
                        Max speed (1-150){' '}
                        <input
                          type="number"
                          style={{ width: 90 }}
                          value={motorDetail.maxSpeed ?? 150}
                          onChange={(e) =>
                            setMotorDetail((prev) => {
                              const ms = Math.max(1, Math.min(150, Number(e.target.value)));
                              return { ...prev, maxSpeed: ms, speed: Math.min(prev.speed ?? ms, ms) };
                            })
                          }
                        />
                      </label>
                      <label>
                        Duration ms (0-6000){' '}
                        <input
                          type="number"
                          style={{ width: 100 }}
                          value={motorDetail.durationMs ?? 1000}
                          onChange={(e) => setMotorDetail((prev) => ({ ...prev, durationMs: Math.max(0, Math.min(6000, Number(e.target.value))) }))}
                        />
                      </label>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>0</span>
                      <input
                        type="range"
                        min={0}
                        max={motorDetail.maxSpeed ?? 150}
                        value={motorDetail.speed ?? 0}
                        onChange={(e) =>
                          setMotorDetail((prev) => ({
                            ...prev,
                            speed: Math.max(0, Math.min(prev.maxSpeed ?? 150, Number(e.target.value))),
                          }))
                        }
                        style={{ flex: 1 }}
                      />
                      <span>{motorDetail.maxSpeed ?? 150}</span>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={async () => {
                          if (!ipc) return;
                          try {
                            const effectiveDir = motorDetail.reverse ? (motorDetail.dir === 'cw' ? 'ccw' : 'cw') : motorDetail.dir;
                            await ipc.invoke('jimu:rotateMotor', {
                              id: motorDetail.id,
                              dir: effectiveDir,
                              speed: motorDetail.speed ?? 0,
                              maxSpeed: motorDetail.maxSpeed ?? 150,
                              durationMs: motorDetail.durationMs ?? 1000,
                            });
                            addLog(
                              `Motor ${motorDetail.id} rotate dir=${effectiveDir} speed=${motorDetail.speed} dur=${motorDetail.durationMs}ms`,
                            );
                          } catch (e) {
                            addLog(`Motor rotate failed: ${e?.message || String(e)}`);
                          }
                        }}
                      >
                        Test rotation
                      </button>
                      <button
                        style={{ marginLeft: 8 }}
                        onClick={async () => {
                          if (!ipc) return;
                          try {
                            const effectiveDir = motorDetail.reverse ? (motorDetail.dir === 'cw' ? 'ccw' : 'cw') : motorDetail.dir;
                            await ipc.invoke('jimu:rotateMotor', {
                              id: motorDetail.id,
                              dir: effectiveDir,
                              speed: 0,
                              maxSpeed: motorDetail.maxSpeed ?? 150,
                              durationMs: motorDetail.durationMs ?? 1000,
                            });
                            setMotorDetail((prev) => ({ ...prev, speed: 0 }));
                            addLog(`Motor ${motorDetail.id} stopped`);
                          } catch (e) {
                            addLog(`Motor stop failed: ${e?.message || String(e)}`);
                          }
                        }}
                      >
                        Stop
                      </button>
                      <button
                        style={{ marginLeft: 8 }}
                        onClick={() => {
                          updateCurrentProjectData((d) => ({
                            ...d,
                            calibration: {
                              ...(d.calibration || {}),
                              motorConfig: {
                                ...(d.calibration?.motorConfig || {}),
                                [motorDetail.id]: {
                                  maxSpeed: motorDetail.maxSpeed ?? 150,
                                  reverse: Boolean(motorDetail.reverse),
                                },
                              },
                            },
                          }));
                          addLog(`Saved motor ${motorDetail.id} config`);
                        }}
                      >
                        Save settings
                      </button>
                    </div>
                  </div>
                )}

                {eyeDetail && (
                  <div style={{ marginTop: 12, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0 }}>Selected eye ID{eyeDetail.id}</h3>
                      <button onClick={closeEyePanel}>Close</button>
                    </div>

                    <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          Picker
                          <input
                            type="color"
                            value={eyeDetail.hex}
                            onChange={(e) => {
                              const rgb = hexToRgb(e.target.value);
                              setEyeDetail((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      hex: e.target.value,
                                      r: rgb?.r ?? prev.r,
                                      g: rgb?.g ?? prev.g,
                                      b: rgb?.b ?? prev.b,
                                    }
                                  : prev,
                              );
                            }}
                            style={{ width: 44, height: 30, padding: 0, border: 'none', background: 'transparent' }}
                          />
                        </label>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          Hex
                          <input
                            type="text"
                            value={eyeDetail.hex}
                            onChange={(e) => {
                              const nextHex = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
                              const rgb = hexToRgb(nextHex);
                              setEyeDetail((prev) =>
                                prev ? { ...prev, hex: nextHex, ...(rgb ? rgb : {}) } : prev,
                              );
                            }}
                            style={{ width: 90 }}
                            placeholder="#RRGGBB"
                          />
                        </label>
                        {[
                          ['#ff0000', 'red'],
                          ['#00ff00', 'green'],
                          ['#0000ff', 'blue'],
                          ['#ffff00', 'yellow'],
                          ['#ff00ff', 'magenta'],
                          ['#00ffff', 'cyan'],
                          ['#ffffff', 'white'],
                          ['#000000', 'off'],
                        ].map(([hex, name]) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => {
                              const rgb = hexToRgb(hex);
                              setEyeDetail((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      hex,
                                      r: rgb?.r ?? prev.r,
                                      g: rgb?.g ?? prev.g,
                                      b: rgb?.b ?? prev.b,
                                    }
                                  : prev,
                              );
                            }}
                            style={{
                              width: 22,
                              height: 22,
                              padding: 0,
                              borderRadius: 6,
                              border: '1px solid #bbb',
                              background: hex,
                              cursor: 'pointer',
                            }}
                            title={name}
                          />
                        ))}
                      </div>
                      <label>
                        R{' '}
                        <input
                          type="number"
                          style={{ width: 70 }}
                          min={0}
                          max={255}
                          value={eyeDetail.r}
                          onChange={(e) =>
                            setEyeDetail((prev) => {
                              if (!prev) return prev;
                              const r = clampByte(Number(e.target.value));
                              return { ...prev, r, hex: rgbToHex(r, prev.g, prev.b) };
                            })
                          }
                        />
                      </label>
                      <label>
                        G{' '}
                        <input
                          type="number"
                          style={{ width: 70 }}
                          min={0}
                          max={255}
                          value={eyeDetail.g}
                          onChange={(e) =>
                            setEyeDetail((prev) => {
                              if (!prev) return prev;
                              const g = clampByte(Number(e.target.value));
                              return { ...prev, g, hex: rgbToHex(prev.r, g, prev.b) };
                            })
                          }
                        />
                      </label>
                      <label>
                        B{' '}
                        <input
                          type="number"
                          style={{ width: 70 }}
                          min={0}
                          max={255}
                          value={eyeDetail.b}
                          onChange={(e) =>
                            setEyeDetail((prev) => {
                              if (!prev) return prev;
                              const b = clampByte(Number(e.target.value));
                              return { ...prev, b, hex: rgbToHex(prev.r, prev.g, b) };
                            })
                          }
                        />
                      </label>
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #ccc', background: eyeDetail.hex }} />
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        onClick={async () => {
                          if (!ipc) return;
                          await stopEyeAnimation();
                          const eyesMask = 1 << (eyeDetail.id - 1);
                          try {
                            await ipc.invoke('jimu:setEyeColor', {
                              eyesMask,
                              time: 0xff,
                              r: eyeDetail.r,
                              g: eyeDetail.g,
                              b: eyeDetail.b,
                            });
                            addLog(`Eye ${eyeDetail.id} set rgb=${eyeDetail.r},${eyeDetail.g},${eyeDetail.b}`);
                          } catch (e) {
                            addLog(`Eye set color failed: ${e?.message || String(e)}`);
                          }
                        }}
                      >
                        Test color
                      </button>
                      <button
                        onClick={async () => {
                          if (!ipc) return;
                          await stopEyeAnimation();
                          const eyesMask = 1 << (eyeDetail.id - 1);
                          try {
                            await ipc.invoke('jimu:setEyeOff', { eyesMask });
                            addLog(`Eye ${eyeDetail.id} off`);
                          } catch (e) {
                            addLog(`Eye off failed: ${e?.message || String(e)}`);
                          }
                        }}
                      >
                        Off
                      </button>
                    </div>

                    <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <label>
                        Animation{' '}
                        <select
                          value={eyeDetail.anim}
                          onChange={(e) => setEyeDetail((prev) => (prev ? { ...prev, anim: e.target.value } : prev))}
                        >
                          <option value="none">none</option>
                          <option value="blink">blink</option>
                          <option value="pulse">pulse</option>
                          <option value="rainbow">rainbow</option>
                        </select>
                      </label>
                      <label>
                        Speed ms{' '}
                        <input
                          type="number"
                          min={40}
                          max={2000}
                          style={{ width: 90 }}
                          value={eyeDetail.speedMs}
                          onChange={(e) =>
                            setEyeDetail((prev) =>
                              prev ? { ...prev, speedMs: Math.max(40, Math.min(2000, Number(e.target.value))) } : prev,
                            )
                          }
                        />
                      </label>
                      <button
                        onClick={async () => {
                          if (!ipc) return;
                          await stopEyeAnimation();
                          const eyesMask = 1 << (eyeDetail.id - 1);
                          const anim = eyeDetail.anim;
                          if (anim === 'none') return;
                          let cancelled = false;
                          eyeAnimCancelRef.current = () => {
                            cancelled = true;
                          };
                          const base = { r: eyeDetail.r, g: eyeDetail.g, b: eyeDetail.b };
                          const stepMs = Math.max(40, eyeDetail.speedMs ?? 250);
                          try {
                            if (anim === 'blink') {
                              while (!cancelled) {
                                await ipc.invoke('jimu:setEyeColor', { eyesMask, time: 0xff, ...base });
                                await sleep(stepMs);
                                await ipc.invoke('jimu:setEyeOff', { eyesMask });
                                await sleep(stepMs);
                              }
                            } else if (anim === 'pulse') {
                              let t = 0;
                              while (!cancelled) {
                                t += 1;
                                const k = (Math.sin(t / 6) + 1) / 2; // 0..1
                                const r = clampByte(base.r * k);
                                const g = clampByte(base.g * k);
                                const b = clampByte(base.b * k);
                                await ipc.invoke('jimu:setEyeColor', { eyesMask, time: 0xff, r, g, b });
                                await sleep(stepMs);
                              }
                            } else if (anim === 'rainbow') {
                              let hue = 0;
                              while (!cancelled) {
                                hue = (hue + 12) % 360;
                                const c = 1;
                                const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
                                let r1 = 0,
                                  g1 = 0,
                                  b1 = 0;
                                if (hue < 60) [r1, g1, b1] = [c, x, 0];
                                else if (hue < 120) [r1, g1, b1] = [x, c, 0];
                                else if (hue < 180) [r1, g1, b1] = [0, c, x];
                                else if (hue < 240) [r1, g1, b1] = [0, x, c];
                                else if (hue < 300) [r1, g1, b1] = [x, 0, c];
                                else [r1, g1, b1] = [c, 0, x];
                                await ipc.invoke('jimu:setEyeColor', {
                                  eyesMask,
                                  time: 0xff,
                                  r: clampByte(r1 * 255),
                                  g: clampByte(g1 * 255),
                                  b: clampByte(b1 * 255),
                                });
                                await sleep(stepMs);
                              }
                            }
                          } finally {
                            eyeAnimCancelRef.current = null;
                          }
                        }}
                      >
                        Start
                      </button>
                        <button
                          onClick={async () => {
                            await stopEyeAnimation();
                            if (!ipc || !eyeDetail) return;
                            const eyesMask = 1 << (eyeDetail.id - 1);
                            try {
                              await ipc.invoke('jimu:setEyeOff', { eyesMask });
                            } catch (_) {
                              // ignore
                            }
                          }}
                        >
                          Stop
                        </button>
                    </div>
                  </div>
                )}

                {irPanel.open && modules?.ir?.length ? (
                  <div style={{ marginTop: 12, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0 }}>IR sensors</h3>
                      <button onClick={() => setIrPanel({ open: false, live: false })}>Close</button>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(irPanel.live)}
                          onChange={(e) => setIrPanel((prev) => ({ ...prev, live: e.target.checked }))}
                        />{' '}
                        Live (5Hz)
                      </label>
                      <button
                        onClick={async () => {
                          if (!ipc) return;
                          try {
                            const res = await ipc.invoke('jimu:readSensors');
                            if (res?.error) setSensorError(res.message || 'Sensor read failed');
                          } catch (e) {
                            setSensorError(e?.message || String(e));
                          }
                        }}
                      >
                        Read once
                      </button>
                      {sensorError && <span style={{ color: '#b71c1c' }}>Error: {sensorError}</span>}
                    </div>
                    <div style={{ marginTop: 10, padding: 10, border: '1px solid #eee', borderRadius: 8 }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        {(modules?.ir?.length ? modules.ir : []).map((id) => {
                          const r = sensorReadings.ir?.[id];
                          return (
                            <div key={`ir-row-${id}`}>{`IR ${id}: ${r?.raw != null ? r.raw : 'n/a'}`}</div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}

                {usPanel.open && modules?.ultrasonic?.length ? (
                  <div style={{ marginTop: 12, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0 }}>Ultrasonic sensors</h3>
                      <button
                        onClick={async () => {
                          await turnOffUltrasonicLeds(modules?.ultrasonic);
                          setUsPanel((prev) => ({ ...prev, open: false, live: false }));
                        }}
                      >
                        Close
                      </button>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(usPanel.live)}
                          onChange={(e) => setUsPanel((prev) => ({ ...prev, live: e.target.checked }))}
                        />{' '}
                        Live (5Hz)
                      </label>
                      <button
                        onClick={async () => {
                          if (!ipc) return;
                          try {
                            const res = await ipc.invoke('jimu:readSensors');
                            if (res?.error) setSensorError(res.message || 'Sensor read failed');
                          } catch (e) {
                            setSensorError(e?.message || String(e));
                          }
                        }}
                      >
                        Read once
                      </button>
                      {sensorError && <span style={{ color: '#b71c1c' }}>Error: {sensorError}</span>}
                    </div>

                    <div style={{ marginTop: 10, padding: 10, border: '1px solid #eee', borderRadius: 8 }}>
                      <strong>Readings</strong>
                      <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                        {(modules?.ultrasonic?.length ? modules.ultrasonic : []).map((id) => {
                          const r = sensorReadings.us?.[id];
                          const raw = r?.raw;
                          const cm = raw == null ? null : raw === 0 ? 301.0 : raw / 10;
                          return (
                            <div key={`us-row-${id}`}>{`US ${id}: ${cm == null ? 'n/a' : `${cm.toFixed(1)} cm`}`}</div>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ marginTop: 10, padding: 10, border: '1px solid #eee', borderRadius: 8 }}>
                      <strong>US LED</strong>
                      <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label>
                          Sensor ID{' '}
                          <select
                            value={usPanel.led.id}
                            onChange={(e) =>
                              setUsPanel((prev) => ({ ...prev, led: { ...prev.led, id: Number(e.target.value) } }))
                            }
                          >
                            {(modules?.ultrasonic?.length ? modules.ultrasonic : []).map((id) => (
                              <option key={`us-opt-${id}`} value={id}>
                                {id}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          Picker
                          <input
                            type="color"
                            value={usPanel.led.hex}
                            onChange={(e) => {
                              const rgb = hexToRgb(e.target.value);
                              setUsPanel((prev) => ({
                                ...prev,
                                led: {
                                  ...prev.led,
                                  hex: e.target.value,
                                  r: rgb?.r ?? prev.led.r,
                                  g: rgb?.g ?? prev.led.g,
                                  b: rgb?.b ?? prev.led.b,
                                },
                              }));
                            }}
                            style={{ width: 44, height: 30, padding: 0, border: 'none', background: 'transparent' }}
                          />
                        </label>
                        <button
                          onClick={async () => {
                            if (!ipc) return;
                            try {
                              await ipc.invoke('jimu:setUltrasonicLed', {
                                id: usPanel.led.id,
                                r: usPanel.led.r,
                                g: usPanel.led.g,
                                b: usPanel.led.b,
                              });
                              addLog(`US ${usPanel.led.id} LED rgb=${usPanel.led.r},${usPanel.led.g},${usPanel.led.b}`);
                            } catch (e) {
                              addLog(`US LED set failed: ${e?.message || String(e)}`);
                            }
                          }}
                        >
                          Test LED
                        </button>
                        <button
                          onClick={async () => {
                            if (!ipc) return;
                            try {
                              await ipc.invoke('jimu:setUltrasonicLedOff', { id: usPanel.led.id });
                              addLog(`US ${usPanel.led.id} LED off`);
                            } catch (e) {
                              addLog(`US LED off failed: ${e?.message || String(e)}`);
                            }
                          }}
                        >
                          Off
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </Section>

            </>
          )}

          {tab === 'actions' && (
            <Section title="Actions (placeholder)">
              <div style={{ color: '#777' }}>Create and edit action timelines (future work).</div>
            </Section>
          )}

          {tab === 'routines' && (
            <Section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginBottom: 0 }}>
              <RoutinesTab
                ref={routinesRef}
                ipc={ipc}
                projectId={currentProject?.id}
                status={status}
                selectedBrickId={selectedBrickId}
                connectToSelectedBrick={handleConnect}
                calibration={currentProject?.data?.calibration || {}}
                projectModules={currentProject?.data?.hardware?.modules || {}}
                controllerData={currentProject?.data?.controller || { widgets: [] }}
                projectRoutines={currentProject?.data?.routines}
                onUpdateProjectData={updateCurrentProjectData}
                routineXmlRamCacheRef={routineXmlRamCacheRef}
                battery={battery}
                addLog={addLog}
              />
            </Section>
          )}

          {tab === 'controller' && (
            <Section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginBottom: 0 }}>
              <ControllerTab
                ref={controllerRef}
                ipc={ipc}
                projectId={currentProject?.id}
                status={status}
                calibration={currentProject?.data?.calibration || {}}
                projectModules={currentProject?.data?.hardware?.modules || {}}
                battery={battery}
                routines={currentProject?.data?.routines || []}
                controllerData={currentProject?.data?.controller || { widgets: [] }}
                routineXmlRamCacheRef={routineXmlRamCacheRef}
                onUpdateControllerData={(updater) => {
                  updateCurrentProjectData((d) => {
                    const prev = d?.controller || { widgets: [] };
                    const next = typeof updater === 'function' ? updater(prev) : updater;
                    return { ...(d || {}), controller: next };
                  });
                }}
                addLog={addLog}
              />
            </Section>
          )}

          {tab === 'logs' && (
            <Section title="Console">
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <label>
                  <input type="checkbox" checked={verboseFrames} onChange={(e) => setVerboseFrames(e.target.checked)} />{' '}
                  Verbose device frames
                </label>
                <button onClick={() => setLog([])}>Clear</button>
              </div>
              <div style={{ maxHeight: 300, overflow: 'auto', background: '#f7f7f7', padding: 8, borderRadius: 6 }}>
                {log.length === 0 ? <div style={{ color: '#888' }}>No logs yet.</div> : <PlaceholderList items={log} />}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
