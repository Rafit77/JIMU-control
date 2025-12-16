import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { Jimu } from '../jimu/jimu.js';
import { JimuBleClient } from '../jimu/jimu_ble.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev =
  process.env.VITE_DEV_SERVER === 'true' ||
  process.env.ELECTRON_DEV === 'true' ||
  process.env.NODE_ENV !== 'production';
const jimu = new Jimu();
let winRef = null;

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
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
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
  });
  ipcMain.handle('jimu:refreshStatus', async () => {
    return jimu.refreshStatus();
  });
  ipcMain.handle('jimu:enable', async () => {
    return jimu.enableDetected();
  });
  ipcMain.handle('jimu:readSensors', async () => {
    return jimu.readAllSensors();
  });
  ipcMain.handle('jimu:setEyeRed', async () => {
    return jimu.setEyeColor({ eyesMask: 0x01, time: 0xff, r: 0xff, g: 0x00, b: 0x00 });
  });
  ipcMain.handle('jimu:stop', async () => {
    await jimu.emergencyStop();
  });
  ipcMain.handle('jimu:centerServo', async (_evt, id) => {
    return jimu.setServoPositionDeg(id, 0, { speed: 0x14, tail: [0x00, 0x00] });
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
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToRenderer('ui:newProject'),
        },
        {
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToRenderer('ui:openProject'),
        },
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendToRenderer('ui:saveProject'),
        },
        {
          label: 'Close Project',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendToRenderer('ui:closeProject'),
        },
        {
          type: 'separator',
        },
        {
          role: 'quit',
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

app.whenReady().then(() => {
  attachJimuEvents();
  registerIpc();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
