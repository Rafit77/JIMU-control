import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import * as Slider from '@radix-ui/react-slider';

const Section = ({ title, children }) => (
  <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
    <h2 style={{ margin: '0 0 8px 0' }}>{title}</h2>
    {children}
  </div>
);

const PlaceholderList = ({ items }) => (
  <ul style={{ margin: 0, paddingLeft: 18 }}>
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v ?? 0)));
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
  const [projects, setProjects] = useState([]);
  const [projectName, setProjectName] = useState('');
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [bricks, setBricks] = useState([]);
  const [selectedBrickId, setSelectedBrickId] = useState('');
  const [tab, setTab] = useState('model'); // model | actions | functions | control | logs
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
  const ipc = window.require ? window.require('electron').ipcRenderer : null;
  const eyeAnimCancelRef = useRef(null);

  const addLog = useCallback((msg) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 200));
  }, []);

  const payloadToHex = (payload) => {
    if (!payload) return '';
    const bytes = Array.from(payload);
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const firmware = useMemo(() => modules?.text || 'n/a', [modules]);
  const listMask = (arr) => (arr && arr.length ? arr.join(', ') : 'none');
  const currentProject = useMemo(() => projects.find((p) => p.id === currentProjectId) || null, [projects, currentProjectId]);
  const hasProject = Boolean(currentProject);
  const closeServoPanel = async () => {
    if (servoDetail && ipc) {
      try {
        await ipc.invoke('jimu:rotateServo', { id: servoDetail.id, dir: 0x01, speed: 0 });
      } catch (_) {
        // ignore
      }
      await ipc.invoke('jimu:readServo', servoDetail.id);
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
      // Detect composition change vs stored project
      if (currentProjectId && currentProject?.modules) {
        const prev = JSON.stringify(currentProject.modules?.masks || {});
        const next = JSON.stringify(data?.masks || {});
        if (prev !== next) {
          const accept = window.confirm('Detected device composition change. Accept new layout?');
          if (!accept) {
            addLog('Composition change rejected by user');
            return;
          }
        }
      }
      setModules(data);
      setInitialModules((prevInit) => prevInit || data);
      if (currentProjectId) {
        setProjects((prev) =>
          prev.map((p) => (p.id === currentProjectId ? { ...p, modules: data } : p)),
        );
      }
      addLog(`Status update: ${data?.text || 'n/a'}`);
    };
    const onBattery = (_e, data) => {
      setBattery(data);
      if (currentProjectId) {
        setProjects((prev) =>
          prev.map((p) => (p.id === currentProjectId ? { ...p, battery: data } : p)),
        );
      }
      addLog(`Battery: ${data?.volts?.toFixed(3)}V ${data?.charging ? '(charging)' : ''}`);
    };
    const onDisconnect = () => {
      setStatus('Disconnected');
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
      const name = window.prompt('Project name:');
      if (name && name.trim()) {
        createProject(name.trim());
      }
    };
    const onSaveProject = () => {
      addLog('Save project (stub serialization)');
      // TODO: serialize currentProject to disk
    };
    const onOpenProject = () => {
      addLog('Open project (stub load)');
      // TODO: load project from disk and set state
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
    ipc.on('jimu:servoPos', onServoPos);
    ipc.on('jimu:deviceError', onDeviceError);
    ipc.on('jimu:errorReport', onErrorReport);
    ipc.on('jimu:transportError', onTransportError);
    ipc.on('jimu:commandResult', onCommandResult);
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
      ipc.removeListener('jimu:servoPos', onServoPos);
      ipc.removeListener('jimu:deviceError', onDeviceError);
      ipc.removeListener('jimu:errorReport', onErrorReport);
      ipc.removeListener('jimu:transportError', onTransportError);
      ipc.removeListener('jimu:commandResult', onCommandResult);
      ipc.removeListener('jimu:frame', onFrame);
      ipc.removeListener('jimu:sensor', onSensor);
    };
  }, [ipc, currentProjectId, currentProject, addLog, verboseFrames]);

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

  const createProject = (name) => {
    const id = `prj-${Date.now()}`;
    const proj = { id, name, modules: null, battery: null, connectedBrick: null };
    setProjects((prev) => [...prev, proj]);
    setCurrentProjectId(id);
    setTab('model');
    setModules(null);
    setBattery(null);
    setInitialModules(null);
    setServoDetail(null);
    setMotorDetail(null);
    setIrPanel({ open: false, live: false });
    setUsPanel((prev) => ({ ...prev, open: false, live: false }));
    setSensorReadings({ ir: {}, us: {} });
    setSensorError(null);
    if (ipc) ipc.invoke('ui:setTitle', `JIMU Control - ${name}`);
  };

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
      setProjects((prev) =>
        prev.map((p) =>
          p.id === currentProjectId
            ? {
                ...p,
                connectedBrick: selectedBrickId,
                modules: info?.modules || null,
                battery: info?.battery || null,
              }
            : p,
        ),
      );
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
      if (currentProjectId) {
        setProjects((prev) => prev.map((p) => (p.id === currentProjectId ? { ...p, modules: s || null } : p)));
      }
    } catch (e) {
      addLog(`Refresh status failed: ${e?.message || String(e)}`);
    }
  };

  const handleCloseProject = async () => {
    await turnOffUltrasonicLeds(modules?.ultrasonic);
    if (ipc) await ipc.invoke('jimu:disconnect');
    setCurrentProjectId(null);
    setModules(null);
    setBattery(null);
    setSelectedBrickId('');
    setInitialModules(null);
    await closeServoPanel();
    await closeMotorPanel();
    await closeEyePanel();
    setIrPanel({ open: false, live: false });
    setUsPanel((prev) => ({ ...prev, open: false, live: false }));
    setSensorReadings({ ir: {}, us: {} });
    setSensorError(null);
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
    <div style={{ fontFamily: 'Segoe UI, sans-serif', padding: 12, maxWidth: 1200, margin: '0 auto' }}>

      <Section title="Project">
        {!hasProject && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="New project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
            <button onClick={() => projectName.trim() && (createProject(projectName.trim()), setProjectName(''))}>
              Create
            </button>
            <select value={currentProjectId || ''} onChange={(e) => setCurrentProjectId(e.target.value || null)}>
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {currentProject && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>Current:</strong> {currentProject.name}
            <button onClick={handleCloseProject}>Close project</button>
            <button
              onClick={async () => {
                if (!ipc) return;
                try {
                  await ipc.invoke('jimu:emergencyStop');
                  addLog('Emergency stop issued');
                } catch (e) {
                  addLog(`Emergency stop failed: ${e?.message || String(e)}`);
                }
              }}
              style={{ marginLeft: 'auto', background: '#c62828', color: '#fff', border: '1px solid #8e0000' }}
              title="Stop motors/rotations and release servos (best effort)"
            >
              Emergency Stop
            </button>
          </div>
        )}
      </Section>

      {!hasProject ? (
        <Section title="Create or select a project">
          <div style={{ color: '#777' }}>Use the controls above or File → New Project to start.</div>
        </Section>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {['model', 'actions', 'functions', 'control', 'logs'].map((t) => (
              <button
                key={t}
                onClick={async () => {
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
                  padding: '8px 12px',
                  background: tab === t ? '#0057d8' : '#eee',
                  color: tab === t ? '#fff' : '#000',
                  border: '1px solid #ccc',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                {t[0].toUpperCase() + t.slice(1)}
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
                  <span>Status: {status}</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <strong>Firmware:</strong> {firmware}
                  <br />
                  <strong>Battery:</strong>{' '}
                  {battery ? `${battery.volts.toFixed(3)}V ${battery.charging ? '(charging)' : ''}` : 'n/a'}
                </div>
              </Section>

              <Section title="Model Config (live overview)">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
                  <div>
                    <strong>Servos</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {modules?.servos?.map((id) => (
                        <button
                          key={`sv${id}`}
                          onClick={async () => {
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
                              const mode = prev?.id === id ? prev.mode : currentProject?.servoConfig?.[id]?.mode || 'servo';
                              const rawMin = prev?.id === id ? prev.min : currentProject?.servoConfig?.[id]?.min ?? -120;
                              const rawMax = prev?.id === id ? prev.max : currentProject?.servoConfig?.[id]?.max ?? 120;
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
                                maxSpeed: prev?.id === id ? prev.maxSpeed : currentProject?.servoConfig?.[id]?.maxSpeed ?? 1000,
                                dir: prev?.id === id ? prev.dir : currentProject?.servoConfig?.[id]?.dir || 'cw',
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
                          style={{ padding: '6px 10px' }}
                        >
                          Servo {id}
                        </button>
                      )) || <span>none</span>}
                    </div>
                  </div>
                  <div>
                    <strong>Motors</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {modules?.motors?.map((id) => (
                        <button
                          key={`m${id}`}
                          onClick={async () => {
                            if (motorDetail && motorDetail.id !== id) await closeMotorPanel();
                            if (servoDetail) await closeServoPanel();
                            if (eyeDetail) await closeEyePanel();
                            await turnOffUltrasonicLeds(modules?.ultrasonic);
                            setIrPanel({ open: false, live: false });
                            setUsPanel((prev) => ({ ...prev, open: false, live: false }));
                            setSensorError(null);
                            setMotorDetail((prev) => ({
                              id,
                              dir: prev?.id === id ? prev.dir : currentProject?.motorConfig?.[id]?.dir || 'cw',
                              speed: 0,
                              maxSpeed: prev?.id === id ? prev.maxSpeed : currentProject?.motorConfig?.[id]?.maxSpeed ?? 150,
                              durationMs: prev?.id === id ? prev.durationMs : 1000,
                            }));
                          }}
                          style={{ padding: '6px 10px' }}
                        >
                          Motor {id}
                        </button>
                      )) || <span>none</span>}
                    </div>
                  </div>
                  <div>
                    <strong>IR</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {modules?.ir?.map((id) => (
                        <button
                          key={`ir${id}`}
                          onClick={async () => {
                            if (servoDetail) await closeServoPanel();
                            if (motorDetail) await closeMotorPanel();
                            if (eyeDetail) await closeEyePanel();
                            await turnOffUltrasonicLeds(modules?.ultrasonic);
                            setUsPanel((prev) => ({ ...prev, open: false, live: false }));
                            setIrPanel({ open: true, live: true });
                          }}
                          style={{ padding: '6px 10px' }}
                        >
                          IR {id}
                        </button>
                      )) || <span>none</span>}
                    </div>
                  </div>
                  <div>
                    <strong>Ultrasonic</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {modules?.ultrasonic?.map((id) => (
                        <button
                          key={`us${id}`}
                          onClick={async () => {
                            if (servoDetail) await closeServoPanel();
                            if (motorDetail) await closeMotorPanel();
                            if (eyeDetail) await closeEyePanel();
                            setIrPanel({ open: false, live: false });
                            setUsPanel((prev) => ({ ...prev, open: true, live: true, led: { ...prev.led, id } }));
                          }}
                          style={{ padding: '6px 10px' }}
                        >
                          US {id}
                        </button>
                      )) || <span>none</span>}
                    </div>
                  </div>
                  <div>
                    <strong>Eyes</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {modules?.eyes?.map((id) => (
                        <button
                          key={`eye${id}`}
                          onClick={async () => {
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
                          style={{ padding: '6px 10px' }}
                        >
                          Eye {id}
                        </button>
                      )) || <span>none</span>}
                    </div>
                  </div>
                  <div>
                    <strong>Speakers</strong>
                    <div>{listMask(modules?.speakers)}</div>
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
                                await ipc.invoke('jimu:setServoPos', {
                                  id: servoDetail.id,
                                  posDeg: servoDetail.pos,
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
                              setProjects((prev) =>
                                prev.map((p) =>
                                  p.id === currentProjectId
                                    ? {
                                        ...p,
                                        servoConfig: {
                                          ...(p.servoConfig || {}),
                                          [servoDetail.id]: {
                                            mode: servoDetail.mode,
                                            min: servoDetail.min,
                                            max: servoDetail.max,
                                            maxSpeed: servoDetail.maxSpeed ?? 1000,
                                            dir: servoDetail.dir,
                                          },
                                        },
                                      }
                                    : p,
                                ),
                              );
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
                              const dir = servoDetail.dir === 'cw' ? 0x01 : 0x02;
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
                              setProjects((prev) =>
                                prev.map((p) =>
                                  p.id === currentProjectId
                                    ? {
                                        ...p,
                                        servoConfig: {
                                          ...(p.servoConfig || {}),
                                          [servoDetail.id]: {
                                            mode: servoDetail.mode,
                                            min: servoDetail.min,
                                            max: servoDetail.max,
                                            maxSpeed: servoDetail.maxSpeed ?? 1000,
                                            dir: servoDetail.dir,
                                          },
                                        },
                                      }
                                    : p,
                                ),
                              );
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
                            await ipc.invoke('jimu:rotateMotor', {
                              id: motorDetail.id,
                              dir: motorDetail.dir,
                              speed: motorDetail.speed ?? 0,
                              maxSpeed: motorDetail.maxSpeed ?? 150,
                              durationMs: motorDetail.durationMs ?? 1000,
                            });
                            addLog(`Motor ${motorDetail.id} rotate dir=${motorDetail.dir} speed=${motorDetail.speed} dur=${motorDetail.durationMs}ms`);
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
                            await ipc.invoke('jimu:rotateMotor', {
                              id: motorDetail.id,
                              dir: motorDetail.dir,
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
                          setProjects((prev) =>
                            prev.map((p) =>
                              p.id === currentProjectId
                                ? {
                                    ...p,
                                    motorConfig: {
                                      ...(p.motorConfig || {}),
                                      [motorDetail.id]: {
                                        maxSpeed: motorDetail.maxSpeed ?? 150,
                                        dir: motorDetail.dir,
                                      },
                                    },
                                  }
                                : p,
                            ),
                          );
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
              <div style={{ color: '#777' }}>Define reusable motion/action presets (future work).</div>
            </Section>
          )}

          {tab === 'functions' && (
            <Section title="Functions (placeholder)">
              <div style={{ color: '#777' }}>Blockly editor integration will live here.</div>
            </Section>
          )}

          {tab === 'control' && (
            <Section title="Control Panel (placeholder)">
              <div style={{ color: '#777' }}>Grid of widgets for run mode; edit/run modes to be implemented.</div>
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
        </>
      )}
    </div>
  );
}
