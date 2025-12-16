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
  const [sensorDetail, setSensorDetail] = useState(null); // {type:'ir'|'us', id, live, lastValue, lastAt, lastErr}
  const [isScanning, setIsScanning] = useState(false);
  const [verboseFrames, setVerboseFrames] = useState(false);
  const ipc = window.require ? window.require('electron').ipcRenderer : null;
  const sensorDetailRef = useRef(sensorDetail);

  useEffect(() => {
    sensorDetailRef.current = sensorDetail;
  }, [sensorDetail]);

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
      setSensorDetail(null);
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
      const active = sensorDetailRef.current;
      if (!active || !readings.length) return;
      const wantType = active.type === 'ir' ? 0x01 : 0x06;
      const match = readings.find((r) => r.type === wantType && r.id === active.id);
      if (!match) return;
      setSensorDetail((prev) =>
        prev && prev.id === active.id && prev.type === active.type
          ? { ...prev, lastValue: match.value, lastAt: Date.now(), lastErr: null }
          : prev,
      );
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
    let disposed = false;
    if (!sensorDetail?.live) return;
    const type = sensorDetail.type;
    const id = sensorDetail.id;
    const delayMs = 200;

    const run = async () => {
      while (!disposed) {
        try {
          const reading =
            type === 'ir' ? await ipc.invoke('jimu:readSensorIR', id) : await ipc.invoke('jimu:readSensorUS', id);
          if (disposed) break;
          if (reading?.error) {
            setSensorDetail((prev) => (prev ? { ...prev, lastErr: reading.message || 'Sensor read failed' } : prev));
          } else if (reading?.value != null) {
            setSensorDetail((prev) =>
              prev ? { ...prev, lastValue: reading.value, lastAt: Date.now(), lastErr: null } : prev,
            );
          }
        } catch (e) {
          if (disposed) break;
          setSensorDetail((prev) => (prev ? { ...prev, lastErr: e?.message || String(e) } : prev));
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
    };
    run();
    return () => {
      disposed = true;
    };
  }, [ipc, sensorDetail?.live, sensorDetail?.type, sensorDetail?.id]);

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
    setSensorDetail(null);
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
    if (ipc) await ipc.invoke('jimu:disconnect');
    setCurrentProjectId(null);
    setModules(null);
    setBattery(null);
    setSelectedBrickId('');
    setInitialModules(null);
    await closeServoPanel();
    await closeMotorPanel();
    setSensorDetail(null);
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
                  setSensorDetail(null);
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
                            setSensorDetail(null);
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
                            setSensorDetail({ type: 'ir', id, live: true, lastValue: null, lastAt: null, lastErr: null });
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
                            setSensorDetail({ type: 'us', id, live: true, lastValue: null, lastAt: null, lastErr: null });
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
                    <div>{listMask(modules?.eyes)}</div>
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

                {sensorDetail && (
                  <div style={{ marginTop: 12, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0 }}>
                        Selected {sensorDetail.type === 'ir' ? 'IR' : 'Ultrasonic'} ID{sensorDetail.id}
                      </h3>
                      <button onClick={() => setSensorDetail(null)}>Close</button>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(sensorDetail.live)}
                          onChange={(e) => setSensorDetail((prev) => ({ ...prev, live: e.target.checked }))}
                        />{' '}
                        Live (5Hz)
                      </label>
                      <button
                        onClick={async () => {
                          if (!ipc) return;
                          try {
                            const reading =
                              sensorDetail.type === 'ir'
                                ? await ipc.invoke('jimu:readSensorIR', sensorDetail.id)
                                : await ipc.invoke('jimu:readSensorUS', sensorDetail.id);
                            if (reading?.value != null) {
                              setSensorDetail((prev) => ({ ...prev, lastValue: reading.value, lastAt: Date.now(), lastErr: null }));
                            }
                          } catch (e) {
                            setSensorDetail((prev) => ({ ...prev, lastErr: e?.message || String(e) }));
                          }
                        }}
                      >
                        Read once
                      </button>
                      <span>
                        Value:{' '}
                        {sensorDetail.lastValue == null
                          ? 'n/a'
                          : sensorDetail.type === 'us'
                          ? `${(sensorDetail.lastValue / 10).toFixed(1)} cm (raw ${sensorDetail.lastValue})`
                          : `${sensorDetail.lastValue}`}
                      </span>
                      {sensorDetail.lastErr && <span style={{ color: '#b71c1c' }}>Error: {sensorDetail.lastErr}</span>}
                    </div>
                  </div>
                )}
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
