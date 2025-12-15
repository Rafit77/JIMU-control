import React, { useState, useMemo, useEffect } from 'react';

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
  const [isScanning, setIsScanning] = useState(false);
  const ipc = window.require ? window.require('electron').ipcRenderer : null;

  const addLog = (msg) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 200));
  };

  const firmware = useMemo(() => modules?.text || 'n/a', [modules]);
  const listMask = (arr) => (arr && arr.length ? arr.join(', ') : 'none');
  const currentProject = useMemo(() => projects.find((p) => p.id === currentProjectId) || null, [projects, currentProjectId]);
  const hasProject = Boolean(currentProject);
  const closeServoPanel = async () => {
    if (servoDetail && ipc) {
      await ipc.invoke('jimu:readServo', servoDetail.id);
    }
    setServoDetail(null);
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
    ipc.on('jimu:status', onStatus);
    ipc.on('jimu:battery', onBattery);
    ipc.on('jimu:disconnected', onDisconnect);
    ipc.on('ui:newProject', onNewProject);
    ipc.on('ui:saveProject', onSaveProject);
    ipc.on('ui:openProject', onOpenProject);
    ipc.on('ui:closeProject', onCloseProject);
    ipc.on('jimu:servoPos', onServoPos);
    return () => {
      ipc.removeListener('jimu:status', onStatus);
      ipc.removeListener('jimu:battery', onBattery);
      ipc.removeListener('jimu:disconnected', onDisconnect);
      ipc.removeListener('ui:newProject', onNewProject);
      ipc.removeListener('ui:saveProject', onSaveProject);
      ipc.removeListener('ui:openProject', onOpenProject);
      ipc.removeListener('ui:closeProject', onCloseProject);
      ipc.removeListener('jimu:servoPos', onServoPos);
    };
  }, [ipc, currentProjectId, currentProject, addLog]);

  const createProject = (name) => {
    const id = `prj-${Date.now()}`;
    const proj = { id, name, modules: null, battery: null, connectedBrick: null };
    setProjects((prev) => [...prev, proj]);
    setCurrentProjectId(id);
    setTab('model');
    setModules(null);
    setBattery(null);
    setInitialModules(null);
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
    const s = await ipc.invoke('jimu:refreshStatus');
    setModules(s || null);
    if (currentProjectId) {
      setProjects((prev) => prev.map((p) => (p.id === currentProjectId ? { ...p, modules: s || null } : p)));
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
    if (ipc) ipc.invoke('ui:setTitle', 'JIMU Control');
  };

  const handleReadSensors = async () => {
    if (!ipc) return;
    await ipc.invoke('jimu:readSensors');
    addLog('Requested sensor read');
  };

  const handleServoTest = async () => {
    if (!ipc) return;
    await ipc.invoke('jimu:setEyeRed');
    addLog('Eye set red (test)');
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
                      const found = await ipc.invoke('jimu:scan');
                      setBricks(found);
                      setIsScanning(false);
                      addLog(`Scan found ${found.length} device(s)`);
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
                            setServoDetail((prev) => ({
                              id,
                              mode: prev?.id === id ? prev.mode : currentProject?.servoConfig?.[id]?.mode || 'servo',
                              min: prev?.id === id ? prev.min : currentProject?.servoConfig?.[id]?.min ?? -120,
                              max: prev?.id === id ? prev.max : currentProject?.servoConfig?.[id]?.max ?? 120,
                              pos: prev?.id === id ? prev.pos : currentProject?.servoConfig?.[id]?.pos ?? 0,
                              speed: prev?.id === id ? prev.speed : currentProject?.servoConfig?.[id]?.speed ?? 20,
                              maxSpeed: prev?.id === id ? prev.maxSpeed : currentProject?.servoConfig?.[id]?.maxSpeed ?? 1000,
                              dir: prev?.id === id ? prev.dir : currentProject?.servoConfig?.[id]?.dir || 'cw',
                              lastPos: prev?.id === id ? prev.lastPos : null,
                            }));
                            if (ipc) await ipc.invoke('jimu:readServo', id);
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
                    <div>{listMask(modules?.motors)}</div>
                  </div>
                  <div>
                    <strong>IR</strong>
                    <div>{listMask(modules?.ir)}</div>
                  </div>
                  <div>
                    <strong>Ultrasonic</strong>
                    <div>{listMask(modules?.ultrasonic)}</div>
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
                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={async () => {
                          if (!ipc) return;
                          await ipc.invoke('jimu:readServo', servoDetail.id);
                          setServoDetail((prev) => ({ ...prev, lastPos: 'pending' }));
                        }}
                      >
                        Get position
                      </button>{' '}
                      <span>Current position: {servoDetail.lastPos ?? 'n/a'} deg</span>
                      <br />
                      <span>Current speed: {servoDetail.speed ?? 0}</span>
                    </div>
                    {(servoDetail.mode === 'servo' || servoDetail.mode === 'mixed') && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                          <label>
                            Min{' '}
                            <input
                              type="number"
                              style={{ width: 70 }}
                              value={servoDetail.min}
                              onChange={(e) =>
                                setServoDetail((prev) => ({
                                  ...prev,
                                  min: Math.max(-120, Math.min(120, Number(e.target.value))),
                                }))
                              }
                            />
                          </label>
                          <input
                            type="range"
                            min={servoDetail.min}
                            max={servoDetail.max}
                            value={servoDetail.pos}
                            onChange={(e) => setServoDetail((prev) => ({ ...prev, pos: Number(e.target.value) }))}
                            style={{ flex: 1 }}
                          />
                          <label>
                            Max{' '}
                            <input
                              type="number"
                              style={{ width: 70 }}
                              value={servoDetail.max}
                              onChange={(e) =>
                                setServoDetail((prev) => ({
                                  ...prev,
                                  max: Math.max(-120, Math.min(120, Number(e.target.value))),
                                }))
                              }
                            />
                          </label>
                        </div>
                        <div>
                          <button
                            onClick={async () => {
                              if (!ipc) return;
                              await ipc.invoke('jimu:setServoPos', {
                                id: servoDetail.id,
                                posDeg: servoDetail.pos,
                                speed: servoDetail.speed,
                              });
                              setServoDetail((prev) => ({ ...prev, lastPos: servoDetail.pos }));
                              addLog(`Servo ${servoDetail.id} -> pos ${servoDetail.pos}`);
                            }}
                          >
                            Test position
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
                                            pos: servoDetail.pos,
                                            speed: servoDetail.speed,
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
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <button
                            onClick={async () => {
                              if (!ipc) return;
                              const dir = servoDetail.dir === 'cw' ? 0x01 : 0x02;
                              await ipc.invoke('jimu:rotateServo', {
                                id: servoDetail.id,
                                dir,
                                speed: servoDetail.speed ?? 0,
                                maxSpeed: servoDetail.maxSpeed ?? 1000,
                              });
                              addLog(`Servo ${servoDetail.id} rotate dir=${dir} speed=${servoDetail.speed}`);
                            }}
                          >
                            Test rotation
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
                                            pos: servoDetail.pos,
                                            speed: servoDetail.speed,
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




