import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

const newId = () => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_) {
    // ignore
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FRAME_MIN_MS = 50;
const FRAME_MAX_MS = 5000;
const FRAME_STEP_MS = 10;

const sumDurationMs = (frames) => {
  const list = Array.isArray(frames) ? frames : [];
  let total = 0;
  for (const f of list) total += clamp(Number(f?.durationMs ?? 0), FRAME_MIN_MS, FRAME_MAX_MS);
  return Math.max(0, Math.round(total));
};

const servoSpeedByteFromDurationMs = (durationMs) => {
  const ms = clamp(Number(durationMs ?? 400), FRAME_MIN_MS, FRAME_MAX_MS);
  // Protocol note (docs/protocol.md): speed/20 = seconds for movement => speed ~= ms/50
  return clamp(Math.round(ms / 50), 0, 0xff);
};

const servoUiConfig = (calibration, id) => {
  const servoId = Number(id ?? 0);
  const cfg = calibration?.servoConfig?.[servoId] || calibration?.servoConfig?.[String(servoId)] || {};
  const min = typeof cfg.min === 'number' ? cfg.min : -120;
  const max = typeof cfg.max === 'number' ? cfg.max : 120;
  const reverse = Boolean(cfg.reverse);
  const mode = String(cfg.mode || 'servo');
  return { min, max, reverse, mode };
};

const toDeviceDeg = (calibration, id, uiDeg) => {
  const { min, max, reverse } = servoUiConfig(calibration, id);
  const clampedUi = clamp(Math.round(Number(uiDeg ?? 0)), min, max);
  return reverse ? -clampedUi : clampedUi;
};

const fromDeviceDeg = (calibration, id, deviceDeg) => {
  const { min, max, reverse } = servoUiConfig(calibration, id);
  const d = Math.round(Number(deviceDeg ?? 0));
  const ui = reverse ? -d : d;
  return clamp(ui, min, max);
};

const defaultActionJson = (actionMeta) => ({
  id: String(actionMeta?.id || ''),
  name: String(actionMeta?.name || ''),
  servoIds: Array.isArray(actionMeta?.servoIds) ? actionMeta.servoIds.map(Number).filter((n) => Number.isFinite(n)) : [],
  frames: [],
});

const normalizeActionJson = (actionJson, actionMeta) => {
  const base = defaultActionJson(actionMeta);
  const obj = actionJson && typeof actionJson === 'object' ? actionJson : {};
  const framesRaw = Array.isArray(obj.frames) ? obj.frames : [];
  const frames = framesRaw
    .map((f) => {
      const durationMs = clamp(Number(f?.durationMs ?? 400), FRAME_MIN_MS, FRAME_MAX_MS);
      const poseDeg = f?.poseDeg && typeof f.poseDeg === 'object' ? f.poseDeg : {};
      return { durationMs, poseDeg };
    })
    .filter(Boolean);
  return {
    ...base,
    ...obj,
    id: base.id,
    name: String(obj?.name ?? base.name),
    servoIds: base.servoIds,
    frames,
  };
};

const ActionNameDialog = ({ open, title, initialName, onCancel, onSubmit }) => {
  const [name, setName] = useState(initialName || '');
  const inputRef = useRef(null);

  useEffect(() => setName(initialName || ''), [initialName, open]);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          inputRef.current?.focus?.({ preventScroll: true });
          inputRef.current?.select?.();
        } catch (_) {
          // ignore
        }
      });
    });
  }, [open]);

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
              ref={inputRef}
              style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onCancel();
                if (e.key === 'Enter') onSubmit(name);
              }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onCancel}>Cancel</button>
            <button onClick={() => onSubmit(name)}>OK</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ActionsTab = forwardRef(function ActionsTab(
  { ipc, projectId, status, calibration, projectModules, projectActions, onUpdateProjectData, actionJsonRamCacheRef, addLog },
  ref,
) {
  const [actions, setActions] = useState([]);
  const [editorAction, setEditorAction] = useState(null); // {id,name}
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorData, setEditorData] = useState(null); // action json for editor action
  const [selectedFrameIdx, setSelectedFrameIdx] = useState(-1);
  const [runState, setRunState] = useState('idle'); // idle|running|stopped|error
  const [runError, setRunError] = useState(null);
  const [nameDialog, setNameDialog] = useState({ open: false, mode: 'create', actionId: null, initialName: '' });
  const [servoPick, setServoPick] = useState(() => new Set());

  const localActionJsonCacheRef = useRef(new Map());
  const actionJsonCacheRef = actionJsonRamCacheRef || localActionJsonCacheRef; // actionId -> object
  const editorInitialJsonRef = useRef(null);
  const cancelRef = useRef({ isCancelled: false, cancel: () => {} });
  const liveSendTimersRef = useRef(new Map()); // servoId -> timeout
  const clipboardFrameRef = useRef(null); // {durationMs, poseDeg}

  const isConnected = status === 'Connected';

  const setActionsRam = useCallback(
    (updater) => {
      setActions((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try {
          onUpdateProjectData?.((d) => ({ ...(d || {}), actions: Array.isArray(next) ? next : [] }));
        } catch (_) {
          // ignore
        }
        return Array.isArray(next) ? next : [];
      });
    },
    [onUpdateProjectData],
  );

  const refreshList = useCallback(async () => {
    if (!projectId) return;
    const list = Array.isArray(projectActions) ? projectActions : [];
    setActions(Array.isArray(list) ? list : []);
    if (!ipc) return;

    // Best-effort preload action JSON into RAM cache so opening uses RAM definition (not disk).
    Promise.all(
      list.map(async (a) => {
        const id = String(a?.id || '');
        if (!id) return;
        if (actionJsonCacheRef.current.has(id)) return;
        try {
          const res = await ipc.invoke('action:loadJson', { projectId, actionId: id });
          const obj = res?.json && typeof res.json === 'object' ? res.json : null;
          actionJsonCacheRef.current.set(id, normalizeActionJson(obj, a));
        } catch (_) {
          actionJsonCacheRef.current.set(id, defaultActionJson(a));
        }
      }),
    ).catch(() => {});
  }, [ipc, projectId, projectActions, actionJsonCacheRef]);

  useEffect(() => {
    if (actionJsonRamCacheRef) return;
    actionJsonCacheRef.current.clear();
  }, [projectId, actionJsonRamCacheRef, actionJsonCacheRef]);

  useEffect(() => {
    refreshList().catch(() => {});
  }, [refreshList]);

  useEffect(() => {
    if (!projectId) return;
    if (!Array.isArray(projectActions)) return;
    setActions(Array.isArray(projectActions) ? projectActions : []);
  }, [projectId, projectActions]);

  const selectableServoIds = useMemo(() => {
    const modules = projectModules || {};
    const servos = Array.isArray(modules.servos) ? modules.servos.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
    return servos.filter((id) => servoUiConfig(calibration, id).mode !== 'motor');
  }, [projectModules, calibration]);

  const ensureEditorLoaded = useCallback(
    async (actionMeta) => {
      const id = String(actionMeta?.id || '');
      if (!id) return null;
      let obj = actionJsonCacheRef.current.get(id);
      if (obj === undefined && ipc) {
        try {
          const res = await ipc.invoke('action:loadJson', { projectId, actionId: id });
          obj = normalizeActionJson(res?.json, actionMeta);
          actionJsonCacheRef.current.set(id, obj);
        } catch (_) {
          obj = defaultActionJson(actionMeta);
          actionJsonCacheRef.current.set(id, obj);
        }
      }
      if (obj === undefined) obj = defaultActionJson(actionMeta);
      const normalized = normalizeActionJson(obj, actionMeta);
      editorInitialJsonRef.current = normalized;
      setEditorData(normalized);
      setSelectedFrameIdx(normalized.frames.length ? 0 : -1);
      setServoPick(new Set(normalized.servoIds || []));
      return normalized;
    },
    [ipc, projectId, actionJsonCacheRef],
  );

  const saveAction = useCallback(async () => {
    if (!editorAction?.id || !editorData) return;
    const id = String(editorAction.id);
    const now = new Date().toISOString();
    const meta = actions.find((a) => String(a?.id) === id) || { id, name: editorAction.name || 'Action', servoIds: [] };
    const next = normalizeActionJson({ ...(editorData || {}), id, name: meta.name, servoIds: meta.servoIds }, meta);
    const totalDurationMs = sumDurationMs(next.frames);
    actionJsonCacheRef.current.set(id, next);
    setEditorData(next);
    editorInitialJsonRef.current = next;
    setEditorDirty(false);
    setActionsRam((prev) =>
      (Array.isArray(prev) ? prev : []).map((a) =>
        String(a?.id) === id ? { ...(a || {}), totalDurationMs, updatedAt: now } : a,
      ),
    );
    addLog?.(`Action saved (RAM): ${meta.name}`);
  }, [editorAction?.id, editorAction?.name, editorData, actions, actionJsonCacheRef, setActionsRam, addLog]);

  const confirmLeaveEditor = useCallback(async () => {
    if (!editorAction) return true;
    if (!editorDirty) return true;
    const save = window.confirm('Action has unsaved changes. Save now?');
    if (save) {
      try {
        await saveAction();
        return true;
      } catch (e) {
        addLog?.(`Action save failed: ${e?.message || String(e)}`);
        return false;
      }
    }
    const discard = window.confirm('Discard changes?');
    return discard;
  }, [editorAction, editorDirty, saveAction, addLog]);

  const openAction = useCallback(
    async (actionMeta) => {
      const ok = await confirmLeaveEditor();
      if (!ok) return;
      const id = String(actionMeta?.id || '');
      if (!id) return;
      setEditorAction({ id, name: String(actionMeta?.name || 'Action') });
      setEditorDirty(false);
      setRunState('idle');
      setRunError(null);
      await ensureEditorLoaded(actionMeta);
    },
    [confirmLeaveEditor, ensureEditorLoaded],
  );

  const play = useCallback(async () => {
    if (!ipc) throw new Error('IPC unavailable');
    if (!editorAction?.id || !editorData) return;
    if (!isConnected) throw new Error('Not connected');
    const id = String(editorAction.id);
    const meta = actions.find((a) => String(a?.id) === id) || null;
    const servoIds = (meta?.servoIds || editorData.servoIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    const frames = Array.isArray(editorData.frames) ? editorData.frames : [];
    if (!frames.length) return;

    cancelRef.current.isCancelled = false;
    cancelRef.current.cancel = () => {
      cancelRef.current.isCancelled = true;
      setRunState('stopped');
    };
    setRunState('running');
    setRunError(null);

    try {
      for (let frameIdx = 0; frameIdx < frames.length; frameIdx += 1) {
        if (cancelRef.current.isCancelled) break;
        setSelectedFrameIdx(frameIdx);
        const f = frames[frameIdx];
        const durationMs = clamp(Number(f?.durationMs ?? 400), FRAME_MIN_MS, FRAME_MAX_MS);
        const poseDeg = f?.poseDeg && typeof f.poseDeg === 'object' ? f.poseDeg : {};
        const ids = [];
        const degrees = [];
        for (const sid of servoIds) {
          if (cancelRef.current.isCancelled) break;
          const uiDeg = poseDeg?.[String(sid)];
          if (typeof uiDeg !== 'number' || !Number.isFinite(uiDeg)) continue;
          ids.push(sid);
          degrees.push(toDeviceDeg(calibration, sid, uiDeg));
        }
        if (ids.length) {
          const speed = servoSpeedByteFromDurationMs(durationMs);
          await ipc.invoke('jimu:setServoPosMulti', { ids, degrees, speed });
        }
        const step = clamp(durationMs, FRAME_MIN_MS, FRAME_MAX_MS);
        if (step > 0) await sleep(step);
      }
    } catch (e) {
      setRunError(e?.message || String(e));
      setRunState('error');
      return;
    }

    if (cancelRef.current.isCancelled) setRunState('stopped');
    else setRunState('idle');
  }, [ipc, editorAction?.id, editorData, isConnected, actions, calibration]);

  const stopPlay = useCallback(() => {
    // Stop playback after finishing the currently executing frame.
    // For an immediate safety stop, the user can always use the global Emergency Stop.
    cancelRef.current.isCancelled = true;
    setRunState('stopped');
  }, []);

  const setCurrentServoSelection = useCallback(
    async (nextIds, { capturePoseForAdded = false } = {}) => {
      if (!editorAction?.id || !editorData) return;
      const id = String(editorAction.id);
      const meta = actions.find((a) => String(a?.id) === id) || null;
      const prevIds = (meta?.servoIds || editorData.servoIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
      const next = Array.from(new Set((nextIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))).sort((a, b) => a - b);

      const removed = new Set(prevIds.filter((x) => !next.includes(x)));
      const added = next.filter((x) => !prevIds.includes(x));

      const frames = (Array.isArray(editorData.frames) ? editorData.frames : []).map((f) => {
        const poseDeg = { ...(f?.poseDeg || {}) };
        for (const sid of removed) delete poseDeg[String(sid)];
        return { ...(f || {}), poseDeg };
      });

      if (capturePoseForAdded && added.length) {
        if (!ipc) throw new Error('IPC unavailable');
        if (!isConnected) throw new Error('Not connected');
        const poseById = {};
        for (const sid of added) {
          const res = await ipc.invoke('jimu:readServo', sid);
          const deg = typeof res?.deg === 'number' ? res.deg : 0;
          poseById[String(sid)] = fromDeviceDeg(calibration, sid, deg);
        }
        for (const f of frames) {
          for (const sid of added) {
            f.poseDeg = { ...(f.poseDeg || {}), [String(sid)]: poseById[String(sid)] };
          }
        }
      }

      const now = new Date().toISOString();
      setActionsRam((prev) =>
        (Array.isArray(prev) ? prev : []).map((a) =>
          String(a?.id) === id ? { ...(a || {}), servoIds: next, updatedAt: now } : a,
        ),
      );
      const nextEditor = normalizeActionJson({ ...(editorData || {}), servoIds: next, frames }, meta || editorData);
      setEditorData(nextEditor);
      setServoPick(new Set(next));
      setEditorDirty(true);
    },
    [editorAction?.id, editorData, actions, setActionsRam, calibration, ipc, isConnected],
  );

  const addFrameFromCurrentPose = useCallback(async () => {
    if (!ipc) throw new Error('IPC unavailable');
    if (!isConnected) throw new Error('Not connected');
    if (!editorAction?.id || !editorData) return;
    const id = String(editorAction.id);
    const meta = actions.find((a) => String(a?.id) === id) || null;
    const servoIds = (meta?.servoIds || editorData.servoIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (!servoIds.length) throw new Error('No servos selected');

    const poseDeg = {};
    for (const sid of servoIds) {
      const res = await ipc.invoke('jimu:readServo', sid);
      const deg = typeof res?.deg === 'number' ? res.deg : 0;
      poseDeg[String(sid)] = fromDeviceDeg(calibration, sid, deg);
    }
    const frame = { durationMs: 400, poseDeg };
    const frames = Array.isArray(editorData.frames) ? editorData.frames : [];
    const insertAt = selectedFrameIdx >= 0 ? selectedFrameIdx + 1 : frames.length;
    const nextFrames = [...frames.slice(0, insertAt), frame, ...frames.slice(insertAt)];
    const next = normalizeActionJson({ ...(editorData || {}), frames: nextFrames }, meta || editorData);
    setEditorData(next);
    setSelectedFrameIdx(insertAt);
    setEditorDirty(true);
  }, [ipc, isConnected, editorAction?.id, editorData, actions, calibration, selectedFrameIdx]);

  const recordOverCurrentFrame = useCallback(async () => {
    if (!ipc) throw new Error('IPC unavailable');
    if (!isConnected) throw new Error('Not connected');
    if (!editorAction?.id || !editorData) return;
    const frames = Array.isArray(editorData.frames) ? editorData.frames : [];
    if (selectedFrameIdx < 0 || selectedFrameIdx >= frames.length) {
      addLog?.('No frame selected to record over');
      return;
    }
    const id = String(editorAction.id);
    const meta = actions.find((a) => String(a?.id) === id) || null;
    const servoIds = (meta?.servoIds || editorData.servoIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (!servoIds.length) throw new Error('No servos selected');

    const poseDeg = {};
    for (const sid of servoIds) {
      const res = await ipc.invoke('jimu:readServo', sid);
      const deg = typeof res?.deg === 'number' ? res.deg : 0;
      poseDeg[String(sid)] = fromDeviceDeg(calibration, sid, deg);
    }

    const nextFrames = frames.map((f, i) => (i === selectedFrameIdx ? { ...(f || {}), poseDeg } : f));
    const next = normalizeActionJson({ ...(editorData || {}), frames: nextFrames }, meta || editorData);
    setEditorData(next);
    setEditorDirty(true);
  }, [ipc, isConnected, editorAction?.id, editorData, actions, calibration, selectedFrameIdx, addLog]);

  const selectFrame = useCallback(
    async (idx) => {
      if (!editorAction?.id || !editorData) return;
      const i = clamp(Number(idx ?? -1), -1, (editorData.frames || []).length - 1);
      setSelectedFrameIdx(i);
      if (i < 0) return;
      if (!ipc || !isConnected) return;
      const f = editorData.frames[i];
      const servoIds = (editorData.servoIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
      const ids = [];
      const degrees = [];
      for (const sid of servoIds) {
        const uiDeg = f?.poseDeg?.[String(sid)];
        if (typeof uiDeg !== 'number' || !Number.isFinite(uiDeg)) continue;
        ids.push(sid);
        degrees.push(toDeviceDeg(calibration, sid, uiDeg));
      }
      if (ids.length) {
        const speed = servoSpeedByteFromDurationMs(400);
        await ipc.invoke('jimu:setServoPosMulti', { ids, degrees, speed });
      }
    },
    [ipc, isConnected, editorAction?.id, editorData, calibration],
  );

  const updateFrameDuration = useCallback(
    (idx, durationMs) => {
      if (!editorData) return;
      const frames = Array.isArray(editorData.frames) ? editorData.frames : [];
      if (idx < 0 || idx >= frames.length) return;
      const nextFrames = frames.map((f, i) => {
        if (i !== idx) return f;
        const ms = clamp(Number(durationMs ?? 0), FRAME_MIN_MS, FRAME_MAX_MS);
        const stepped = Math.round(ms / FRAME_STEP_MS) * FRAME_STEP_MS;
        return { ...(f || {}), durationMs: clamp(stepped, FRAME_MIN_MS, FRAME_MAX_MS) };
      });
      setEditorData((prev) => (prev ? { ...prev, frames: nextFrames } : prev));
      setEditorDirty(true);
    },
    [editorData],
  );

  const updatePoseDeg = useCallback(
    (idx, servoId, uiDeg) => {
      if (!editorData) return;
      const frames = Array.isArray(editorData.frames) ? editorData.frames : [];
      if (idx < 0 || idx >= frames.length) return;
      const sid = Number(servoId ?? 0);
      if (!Number.isFinite(sid) || sid <= 0) return;
      const { min, max } = servoUiConfig(calibration, sid);
      const clampedUi = clamp(Number(uiDeg ?? 0), min, max);
      const nextFrames = frames.map((f, i) => {
        if (i !== idx) return f;
        const poseDeg = { ...(f?.poseDeg || {}) };
        poseDeg[String(sid)] = clampedUi;
        return { ...(f || {}), poseDeg };
      });
      setEditorData((prev) => (prev ? { ...prev, frames: nextFrames } : prev));
      setEditorDirty(true);

      if (!ipc || !isConnected) return;
      const key = String(sid);
      const old = liveSendTimersRef.current.get(key);
      if (old) clearTimeout(old);
      const t = setTimeout(async () => {
        try {
          await ipc.invoke('jimu:setServoPos', { id: sid, posDeg: toDeviceDeg(calibration, sid, clampedUi) });
        } catch (_) {
          // ignore
        }
      }, 40);
      liveSendTimersRef.current.set(key, t);
    },
    [editorData, calibration, ipc, isConnected],
  );

  const deleteFrame = useCallback(() => {
    if (!editorData) return;
    const frames = Array.isArray(editorData.frames) ? editorData.frames : [];
    if (selectedFrameIdx < 0 || selectedFrameIdx >= frames.length) return;
    const nextFrames = frames.filter((_, i) => i !== selectedFrameIdx);
    setEditorData((prev) => (prev ? { ...prev, frames: nextFrames } : prev));
    setSelectedFrameIdx(nextFrames.length ? clamp(selectedFrameIdx, 0, nextFrames.length - 1) : -1);
    setEditorDirty(true);
  }, [editorData, selectedFrameIdx]);

  const duplicateFrame = useCallback(() => {
    if (!editorData) return;
    const frames = Array.isArray(editorData.frames) ? editorData.frames : [];
    if (selectedFrameIdx < 0 || selectedFrameIdx >= frames.length) return;
    const f = frames[selectedFrameIdx];
    const copy = { durationMs: f?.durationMs ?? 400, poseDeg: { ...(f?.poseDeg || {}) } };
    const insertAt = selectedFrameIdx + 1;
    const nextFrames = [...frames.slice(0, insertAt), copy, ...frames.slice(insertAt)];
    setEditorData((prev) => (prev ? { ...prev, frames: nextFrames } : prev));
    setSelectedFrameIdx(insertAt);
    setEditorDirty(true);
  }, [editorData, selectedFrameIdx]);

  const copyFrame = useCallback(() => {
    if (!editorData) return;
    const frames = Array.isArray(editorData.frames) ? editorData.frames : [];
    if (selectedFrameIdx < 0 || selectedFrameIdx >= frames.length) return;
    const f = frames[selectedFrameIdx];
    clipboardFrameRef.current = { durationMs: f?.durationMs ?? 400, poseDeg: { ...(f?.poseDeg || {}) } };
    addLog?.('Frame copied');
  }, [editorData, selectedFrameIdx, addLog]);

  const pasteFrame = useCallback(() => {
    if (!editorData) return;
    const frames = Array.isArray(editorData.frames) ? editorData.frames : [];
    const clip = clipboardFrameRef.current;
    if (!clip) return;
    const insertAt = selectedFrameIdx >= 0 ? selectedFrameIdx + 1 : frames.length;
    const copy = { durationMs: clip.durationMs ?? 400, poseDeg: { ...(clip.poseDeg || {}) } };
    const nextFrames = [...frames.slice(0, insertAt), copy, ...frames.slice(insertAt)];
    setEditorData((prev) => (prev ? { ...prev, frames: nextFrames } : prev));
    setSelectedFrameIdx(insertAt);
    setEditorDirty(true);
  }, [editorData, selectedFrameIdx]);

  const currentActionMeta = useMemo(() => {
    const id = String(editorAction?.id || '');
    if (!id) return null;
    return actions.find((a) => String(a?.id) === id) || null;
  }, [actions, editorAction?.id]);

  const editorHeader = useMemo(() => {
    const list = Array.isArray(actions) ? actions : [];
    const selectedId = String(editorAction?.id || '');
    const selectedName = String(currentActionMeta?.name || editorAction?.name || 'Action');
    const canEdit = Boolean(editorAction?.id);

    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={selectedId}
          onChange={(e) => {
            const id = String(e.target.value || '');
            const a = list.find((x) => String(x?.id) === id) || null;
            if (a) openAction(a).catch(() => {});
          }}
          disabled={!list.length || runState === 'running'}
        >
          <option value="">Select action</option>
          {list.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <button disabled={!canEdit || runState === 'running'} onClick={() => saveAction().catch(() => {})}>
          Save
        </button>
        <button
          disabled={!canEdit || runState === 'running'}
          onClick={() => {
            confirmLeaveEditor().then((ok) => {
              if (!ok) return;
              setEditorAction(null);
              setEditorData(null);
              setSelectedFrameIdx(-1);
              setEditorDirty(false);
              setRunState('idle');
              setRunError(null);
            });
          }}
        >
          Close
        </button>
        <button
          disabled={!canEdit || runState === 'running' || !editorDirty}
          onClick={() => {
            const ok = window.confirm('Revert unsaved changes?');
            if (!ok) return;
            const initial = editorInitialJsonRef.current;
            if (!initial) return;
            setEditorData(initial);
            setSelectedFrameIdx(initial.frames.length ? 0 : -1);
            setServoPick(new Set(initial.servoIds || []));
            setEditorDirty(false);
          }}
        >
          Revert
        </button>
        <button
          disabled={!canEdit || runState === 'running'}
          onClick={() => {
            if (!currentActionMeta?.id) return;
            const ok = window.confirm(`Delete action "${selectedName}"?`);
            if (!ok) return;
            const id = String(currentActionMeta.id);
            setActionsRam((prev) => (Array.isArray(prev) ? prev : []).filter((a) => String(a?.id) !== id));
            actionJsonCacheRef.current.delete(id);
            setEditorAction(null);
            setEditorData(null);
            setSelectedFrameIdx(-1);
            setEditorDirty(false);
            setRunState('idle');
            setRunError(null);
          }}
        >
          Delete
        </button>
        <button
          disabled={!canEdit || !isConnected || runState === 'running'}
          onClick={() => play().catch((e) => addLog?.(`Play failed: ${e?.message || String(e)}`))}
        >
          Test / play
        </button>
        <button disabled={runState !== 'running'} onClick={stopPlay}>
          Stop play
        </button>

        <div style={{ marginLeft: 'auto', color: '#777' }}>
          {runState === 'running' ? 'Running' : runState === 'error' ? 'Error' : runState === 'stopped' ? 'Stopped' : 'Idle'}
          {editorDirty ? ' • unsaved' : ''}
        </div>
      </div>
    );
  }, [
    actions,
    editorAction?.id,
    editorAction?.name,
    currentActionMeta?.id,
    currentActionMeta?.name,
    editorDirty,
    runState,
    isConnected,
    openAction,
    confirmLeaveEditor,
    saveAction,
    setActionsRam,
    actionJsonCacheRef,
    play,
    stopPlay,
    addLog,
  ]);

  const frames = Array.isArray(editorData?.frames) ? editorData.frames : [];
  const canFrame = selectedFrameIdx >= 0 && selectedFrameIdx < frames.length;

  const listUi = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => setNameDialog({ open: true, mode: 'create', actionId: null, initialName: '' })}>Create action</button>
        <div style={{ marginLeft: 'auto', color: '#777' }}>{(actions || []).length} action(s)</div>
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        {(actions || []).length === 0 ? (
          <div style={{ padding: 12, color: '#777' }}>No actions yet.</div>
        ) : (
          (actions || []).map((a) => (
            <div
              key={a.id}
              style={{
                padding: 10,
                borderBottom: '1px solid #eee',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                <div style={{ fontSize: 12, color: '#777' }}>
                  {Array.isArray(a?.servoIds) && a.servoIds.length ? `servos: ${a.servoIds.join(', ')}` : 'servos: none'}
                </div>
                <div style={{ fontSize: 12, color: '#777' }}>
                  duration: {Math.round(Number(a?.totalDurationMs ?? 0))} ms
                </div>
              </div>
              <button onClick={() => openAction(a).catch(() => {})}>Open</button>
              <button onClick={() => setNameDialog({ open: true, mode: 'rename', actionId: a.id, initialName: a.name })}>Rename</button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const editorUi = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {editorHeader}
      {runError ? <div style={{ marginTop: 8, color: '#b71c1c' }}>Error: {runError}</div> : null}

      <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 420 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Servo selection</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {selectableServoIds.length === 0 ? (
              <div style={{ color: '#777' }}>No selectable servos detected.</div>
            ) : (
              selectableServoIds.map((sid) => (
                <label key={sid} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={servoPick.has(sid)}
                    disabled={runState === 'running'}
                    onChange={(e) => {
                      setServoPick((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(sid);
                        else next.delete(sid);
                        return next;
                      });
                    }}
                  />
                  {sid}
                </label>
              ))
            )}
            <button
              disabled={runState === 'running' || !editorData}
              onClick={() =>
                setCurrentServoSelection(Array.from(servoPick), { capturePoseForAdded: true }).catch((e) =>
                  addLog?.(`Servo selection update failed: ${e?.message || String(e)}`),
                )
              }
            >
              Apply selection
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600 }}>Timeline</div>
          <button
            disabled={runState === 'running' || !isConnected}
            onClick={() => addFrameFromCurrentPose().catch((e) => addLog?.(`Add frame failed: ${e?.message || String(e)}`))}
          >
            Add
          </button>
          <button disabled={!canFrame || runState === 'running'} onClick={duplicateFrame}>
            Duplicate
          </button>
          <button
            disabled={!canFrame || runState === 'running' || !isConnected}
            onClick={() => recordOverCurrentFrame().catch((e) => addLog?.(`Record failed: ${e?.message || String(e)}`))}
            style={{ background: '#c62828', color: '#fff', border: '1px solid #8e0000' }}
            title="Record over the selected frame"
          >
            Record
          </button>
          <button disabled={!canFrame || runState === 'running'} onClick={copyFrame}>
            Copy
          </button>
          <button disabled={runState === 'running'} onClick={pasteFrame}>
            Paste
          </button>
          <button disabled={!canFrame || runState === 'running'} onClick={deleteFrame}>
            Delete
          </button>
        </div>

        <div style={{ marginTop: 8, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
          {frames.length === 0 ? (
            <div style={{ color: '#777' }}>No frames yet. Press Add to capture a frame from the current pose.</div>
          ) : (
            frames.map((f, idx) => {
              const w = clamp(Math.round(Number(f?.durationMs ?? 400) / 30), 36, 260);
              const selected = idx === selectedFrameIdx;
              return (
                <button
                  key={idx}
                  onClick={() => selectFrame(idx).catch(() => {})}
                  style={{
                    minWidth: w,
                    height: 44,
                    borderRadius: 8,
                    border: selected ? '2px solid #0057d8' : '1px solid #ccc',
                    background: selected ? '#e3f2fd' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    padding: '6px 10px',
                  }}
                  disabled={runState === 'running'}
                >
                  <div style={{ fontWeight: 600, fontSize: 12 }}>Frame {idx + 1}</div>
                  <div style={{ fontSize: 12, color: '#555' }}>{Math.round(Number(f?.durationMs ?? 0))} ms</div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {canFrame ? (
        <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 600 }}>Frame {selectedFrameIdx + 1}</div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              Duration (ms)
              <input
                type="number"
                style={{ width: 110 }}
                min={FRAME_MIN_MS}
                max={FRAME_MAX_MS}
                step={FRAME_STEP_MS}
                value={Math.round(Number(frames[selectedFrameIdx]?.durationMs ?? 0))}
                disabled={runState === 'running'}
                onChange={(e) => updateFrameDuration(selectedFrameIdx, e.target.value)}
              />
            </label>
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(editorData?.servoIds || []).map((sid) => {
              const { min, max } = servoUiConfig(calibration, sid);
              const v = frames[selectedFrameIdx]?.poseDeg?.[String(sid)];
              const val = typeof v === 'number' && Number.isFinite(v) ? v : 0;
              return (
                <div key={sid} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10, background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontWeight: 600 }}>Servo {sid}</div>
                    <div style={{ color: '#555' }}>{Math.round(val)}°</div>
                  </div>
                  <div style={{ position: 'relative', width: 220 }}>
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                      {[-90, -45, 0, 45, 90]
                        .filter((m) => m >= min && m <= max)
                        .map((m) => {
                          const pct = ((m - min) / (max - min)) * 100;
                          const isZero = m === 0;
                          return (
                            <div
                              key={m}
                              style={{
                                position: 'absolute',
                                left: `calc(${pct}% - ${isZero ? 1 : 0.5}px)`,
                                top: 10,
                                width: isZero ? 2 : 1,
                                height: isZero ? 14 : 8,
                                background: isZero ? '#0057d8' : '#999',
                                opacity: isZero ? 0.9 : 0.6,
                              }}
                            />
                          );
                        })}
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={val}
                      disabled={runState === 'running'}
                      onChange={(e) => updatePoseDeg(selectedFrameIdx, sid, Number(e.target.value))}
                      style={{ width: 220 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );

  useImperativeHandle(
    ref,
    () => ({
      confirmCanLeave: () => confirmLeaveEditor(),
      stopIfRunning: async () => {
        if (runState !== 'running') return;
        try {
          cancelRef.current.cancel?.();
        } catch (_) {
          // ignore
        }
      },
      exportForSave: async () => {
        const list = Array.isArray(actions) ? actions : [];
        const actionJsonById = {};
        for (const a of list) {
          const id = String(a?.id || '');
          if (!id) continue;
          const obj = actionJsonCacheRef.current.get(id);
          if (obj !== undefined) actionJsonById[id] = obj;
        }
        return { actions: list, actionJsonById };
      },
    }),
    [confirmLeaveEditor, runState, actions, actionJsonCacheRef],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!projectId ? <div style={{ color: '#777' }}>Open a project to manage actions.</div> : null}
      {projectId ? (editorAction ? editorUi : listUi) : null}

      <ActionNameDialog
        open={nameDialog.open}
        title={nameDialog.mode === 'create' ? 'Create action' : 'Rename action'}
        initialName={nameDialog.initialName}
        onCancel={() => setNameDialog((p) => ({ ...p, open: false }))}
        onSubmit={async (name) => {
          try {
            const actionName = String(name || '').trim();
            if (!actionName) throw new Error('Action name is required');
            const existingNames = new Set(
              (Array.isArray(actions) ? actions : [])
                .filter((a) => (nameDialog.mode === 'rename' ? String(a?.id) !== String(nameDialog.actionId) : true))
                .map((a) => String(a?.name || '')),
            );
            if (existingNames.has(actionName)) throw new Error('Action name must be unique');

            const now = new Date().toISOString();
            if (nameDialog.mode === 'create') {
              const id = newId();
              const action = { id, name: actionName, servoIds: [], totalDurationMs: 0, createdAt: now, updatedAt: now };
              actionJsonCacheRef.current.set(String(id), defaultActionJson(action));
              setActionsRam((prev) => [...(Array.isArray(prev) ? prev : []), action]);
              setNameDialog((p) => ({ ...p, open: false }));
              await openAction(action);
              return;
            }

            const id = String(nameDialog.actionId || '');
            setActionsRam((prev) =>
              (Array.isArray(prev) ? prev : []).map((a) =>
                String(a?.id) === id ? { ...(a || {}), name: actionName, updatedAt: now } : a,
              ),
            );
            if (String(editorAction?.id) === id) setEditorAction((p) => (p ? { ...p, name: actionName } : p));
            const cached = actionJsonCacheRef.current.get(id);
            if (cached && typeof cached === 'object') actionJsonCacheRef.current.set(id, { ...(cached || {}), name: actionName });
            if (String(editorData?.id) === id) setEditorData((p) => (p ? { ...p, name: actionName } : p));
            setNameDialog((p) => ({ ...p, open: false }));
          } catch (e) {
            addLog?.(`Action update failed: ${e?.message || String(e)}`);
          }
        }}
      />
    </div>
  );
});

export default ActionsTab;
