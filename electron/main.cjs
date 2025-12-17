const electron = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } = electron;

const isDev =
  process.env.VITE_DEV_SERVER === 'true' ||
  process.env.ELECTRON_DEV === 'true' ||
  process.env.NODE_ENV !== 'production';

let jimu = null;
let JimuBleClient = null;
let winRef = null;

const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v ?? 0)));
const toDataUrlPng = (buf) => `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
const safeName = (name) =>
  String(name || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 64) || 'Project';

const getSavesRoot = () => path.join(app.getAppPath(), 'jimu_saves');

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const writeJson = async (filePath, obj) => {
  await fs.writeFile(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
};

const listProjects = async () => {
  const root = getSavesRoot();
  await ensureDir(root);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const results = [];
  for (const id of folders) {
    const projectDir = path.join(root, id);
    const projectJsonPath = path.join(projectDir, 'project.json');
    try {
      const data = await readJson(projectJsonPath);
      let thumbnailDataUrl = null;
      try {
        const thumbPath = path.join(projectDir, 'assets', 'thumbnail.png');
        const buf = await fs.readFile(thumbPath);
        thumbnailDataUrl = toDataUrlPng(buf);
      } catch (_) {
        // ignore
      }
      results.push({
        id,
        name: data?.name || id,
        description: data?.description || '',
        updatedAt: data?.updatedAt || data?.createdAt || null,
        schemaVersion: data?.schemaVersion ?? null,
        thumbnailDataUrl,
      });
    } catch (_) {
      // ignore broken entries
    }
  }
  results.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return results;
};

const loadProject = async (id) => {
  const root = getSavesRoot();
  const projectDir = path.join(root, id);
  const data = await readJson(path.join(projectDir, 'project.json'));
  let thumbnailDataUrl = null;
  try {
    const buf = await fs.readFile(path.join(projectDir, 'assets', 'thumbnail.png'));
    thumbnailDataUrl = toDataUrlPng(buf);
  } catch (_) {
    // ignore
  }
  return { id, dir: projectDir, data, thumbnailDataUrl };
};

const createProject = async ({ name, description }) => {
  const root = getSavesRoot();
  await ensureDir(root);
  const now = new Date().toISOString();
  const id = `${Date.now()}-${safeName(name).toLowerCase().replace(/\s+/g, '-')}`;
  const projectDir = path.join(root, id);
  await ensureDir(projectDir);
  await ensureDir(path.join(projectDir, 'assets'));
  const data = {
    schemaVersion: 1,
    name: safeName(name),
    description: String(description || ''),
    createdAt: now,
    updatedAt: now,
    hardware: {
      connectedBrick: null,
      firmware: null,
      modules: null,
    },
    calibration: {
      servoConfig: {},
      motorConfig: {},
    },
  };
  await writeJson(path.join(projectDir, 'project.json'), data);
  return loadProject(id);
};

const saveProject = async ({ id, data }) => {
  const root = getSavesRoot();
  const projectDir = path.join(root, id);
  await ensureDir(projectDir);
  await ensureDir(path.join(projectDir, 'assets'));
  const now = new Date().toISOString();
  const next = { ...(data || {}), updatedAt: now };
  if (!next.createdAt) next.createdAt = now;
  if (!next.schemaVersion) next.schemaVersion = 1;
  await writeJson(path.join(projectDir, 'project.json'), next);
  return loadProject(id);
};

const cloneProject = async ({ fromId, name, description }) => {
  if (!fromId) throw new Error('fromId is required');
  const src = await loadProject(fromId);
  const created = await createProject({ name, description });
  const nextData = {
    ...(src?.data || {}),
    schemaVersion: src?.data?.schemaVersion ?? 1,
    name: safeName(name),
    description: String(description || ''),
    createdAt: created?.data?.createdAt || new Date().toISOString(),
  };
  await saveProject({ id: created.id, data: nextData });
  try {
    await fs.copyFile(
      path.join(src.dir, 'assets', 'thumbnail.png'),
      path.join(created.dir, 'assets', 'thumbnail.png'),
    );
  } catch (_) {
    // ignore if no thumbnail
  }
  return loadProject(created.id);
};

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'JIMU Control',
  });
  winRef = win;

  if (isDev) {
    await win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    await win.loadFile(indexPath);
  }
};

const sendToRenderer = (channel, payload) => {
  if (winRef && !winRef.isDestroyed()) {
    winRef.webContents.send(channel, payload);
  }
};

const attachJimuEvents = () => {
  jimu.on('status', (status) => sendToRenderer('jimu:status', status));
  jimu.on('battery', (battery) => sendToRenderer('jimu:battery', battery));
  jimu.on('disconnect', () => sendToRenderer('jimu:disconnected'));
  jimu.on('servoPosition', (pos) => sendToRenderer('jimu:servoPos', pos));
  jimu.on('frame', (frame) => sendToRenderer('jimu:frame', frame));
  jimu.on('sensor', (evt) => sendToRenderer('jimu:sensor', evt));
  jimu.on('commandResult', (evt) => sendToRenderer('jimu:commandResult', evt));
  jimu.on('deviceError', (evt) => sendToRenderer('jimu:deviceError', evt));
  jimu.on('errorReport', (evt) => sendToRenderer('jimu:errorReport', evt));
  jimu.on('transportError', (evt) => sendToRenderer('jimu:transportError', evt));
};

const registerIpc = () => {
  ipcMain.handle('project:list', async () => listProjects());
  ipcMain.handle('project:create', async (_evt, { name, description } = {}) => createProject({ name, description }));
  ipcMain.handle('project:clone', async (_evt, { fromId, name, description } = {}) =>
    cloneProject({ fromId, name, description }),
  );
  ipcMain.handle('project:open', async (_evt, { id } = {}) => loadProject(id));
  ipcMain.handle('project:save', async (_evt, { id, data } = {}) => saveProject({ id, data }));
  ipcMain.handle('project:delete', async (_evt, { id } = {}) => {
    const root = getSavesRoot();
    const projectDir = path.join(root, id);
    await fs.rm(projectDir, { recursive: true, force: true });
    return { ok: true };
  });
  ipcMain.handle('project:setThumbnail', async (_evt, { id } = {}) => {
    const root = getSavesRoot();
    const projectDir = path.join(root, id);
    await ensureDir(path.join(projectDir, 'assets'));
    const result = await dialog.showOpenDialog(winRef, {
      title: 'Select project thumbnail',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }],
    });
    if (result.canceled || !result.filePaths?.length) return { canceled: true };
    const img = nativeImage.createFromPath(result.filePaths[0]);
    const resized = img.resize({ width: 64, height: 64, quality: 'good' });
    const png = resized.toPNG();
    await fs.writeFile(path.join(projectDir, 'assets', 'thumbnail.png'), png);
    return { ok: true, thumbnailDataUrl: toDataUrlPng(png) };
  });

  ipcMain.handle('jimu:scan', async () => {
    const devices = await JimuBleClient.scan({ timeoutMs: 4000 });
    return devices.map((d) => ({ id: d.id, name: d.name || 'Unknown' }));
  });
  ipcMain.handle('jimu:connect', async (_evt, target) => {
    await jimu.connect(target);
    const info = jimu.getInfo();
    return info;
  });
  ipcMain.handle('jimu:disconnect', async () => {
    await jimu.disconnect();
    sendToRenderer('jimu:disconnected');
  });
  ipcMain.handle('jimu:refreshStatus', async () => {
    return jimu.refreshStatus();
  });
  ipcMain.handle('jimu:enable', async () => {
    return jimu.enableDetected();
  });
  ipcMain.handle('jimu:readSensors', async () => {
    try {
      await jimu.readAllSensors();
      return { ok: true };
    } catch (e) {
      return { error: true, message: e?.message || String(e) };
    }
  });
  ipcMain.handle('jimu:setEyeRed', async () => {
    return jimu.setEyeColor({ eyesMask: 0x01, time: 0xff, r: 0xff, g: 0x00, b: 0x00 });
  });
  ipcMain.handle('jimu:setEyeColor', async (_evt, { eyesMask = 0x01, time = 0xff, r = 0, g = 0, b = 0 } = {}) => {
    return jimu.setEyeColor({
      eyesMask,
      time,
      r: Math.max(0, Math.min(255, Math.round(r))),
      g: Math.max(0, Math.min(255, Math.round(g))),
      b: Math.max(0, Math.min(255, Math.round(b))),
    });
  });
  ipcMain.handle('jimu:setEyeOff', async (_evt, { eyesMask = 0x01 } = {}) => {
    return jimu.setEyeColor({ eyesMask, time: 0x00, r: 0x00, g: 0x00, b: 0x00 });
  });
  ipcMain.handle('jimu:setUltrasonicLed', async (_evt, { id = 1, r = 0, g = 0, b = 0 } = {}) => {
    return jimu.setUltrasonicLed({
      id,
      r: Math.max(0, Math.min(255, Math.round(r))),
      g: Math.max(0, Math.min(255, Math.round(g))),
      b: Math.max(0, Math.min(255, Math.round(b))),
    });
  });
  ipcMain.handle('jimu:setUltrasonicLedOff', async (_evt, { id = 1 } = {}) => {
    return jimu.setUltrasonicLedOff(id);
  });
  ipcMain.handle('jimu:readServo', async (_evt, id) => jimu.readServoPosition(id));
  ipcMain.handle('jimu:readSensorIR', async (_evt, id) => {
    try {
      return await jimu.readIR(id);
    } catch (e) {
      return { error: true, message: e?.message || String(e) };
    }
  });
  ipcMain.handle('jimu:readSensorUS', async (_evt, id) => {
    try {
      return await jimu.readUltrasonic(id);
    } catch (e) {
      return { error: true, message: e?.message || String(e) };
    }
  });
  ipcMain.handle('ui:setTitle', (_evt, title) => {
    if (winRef && !winRef.isDestroyed()) winRef.setTitle(title);
  });
  ipcMain.handle('jimu:setServoPos', async (_evt, { id, posDeg, speed }) => {
    return jimu.setServoPositionDeg(id, posDeg ?? 0, { speed: speed ?? 0x14, tail: [0x00, 0x00] });
  });
  ipcMain.handle('jimu:rotateServo', async (_evt, { id, dir, speed, maxSpeed = 1000 }) => {
    const lim = Math.max(0, Math.min(maxSpeed, speed ?? 0));
    return jimu.rotateServo(id, dir, lim);
  });
  ipcMain.handle('jimu:rotateMotor', async (_evt, { id, dir = 'cw', speed = 0, maxSpeed = 150, durationMs = 1000 }) => {
    const lim = Math.max(0, Math.min(maxSpeed, Math.round(speed ?? 0)));
    const signed = dir === 'ccw' ? -lim : lim;
    return jimu.rotateMotor(id, signed, Math.max(0, Math.min(6000, Math.round(durationMs ?? 1000))));
  });
  ipcMain.handle('jimu:stopMotor', async (_evt, id) => jimu.stopMotor(id));
  ipcMain.handle('jimu:emergencyStop', async () => jimu.emergencyStop());
};

const buildMenu = () => {
  Menu.setApplicationMenu(null);
};

const main = async () => {
  const { Jimu } = await import(pathToFileURL(path.join(__dirname, '..', 'jimu', 'jimu.js')).href);
  const ble = await import(pathToFileURL(path.join(__dirname, '..', 'jimu', 'jimu_ble.js')).href);
  JimuBleClient = ble.JimuBleClient;
  jimu = new Jimu();

  attachJimuEvents();
  registerIpc();
  buildMenu();

  await app.whenReady();
  await createWindow();
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error in Electron main:', err);
  try {
    electron?.app?.quit?.();
  } catch (_) {
    // ignore
  }
});
