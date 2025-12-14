import EventEmitter from 'events';
import { JimuBleClient } from './jimu_ble.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clampByte = (v) => ((v % 256) + 256) % 256;

const maskByteToIds = (byte = 0) => {
  const ids = [];
  for (let i = 0; i < 8; i += 1) if (byte & (1 << i)) ids.push(i + 1);
  return ids;
};

const maskBytesToIds = (bytes = []) => {
  // bytes ordered as [b12, b13, b14, b15] mapping bits [id32..id1]
  const ids = [];
  const len = bytes.length;
  bytes.forEach((b, idx) => {
    const offset = (len - idx - 1) * 8; // b15 -> +0, b12 -> +24
    maskByteToIds(b).forEach((id) => ids.push(id + offset));
  });
  return ids;
};

const idsToMaskBytes32 = (ids = []) => {
  const bytes = [0, 0, 0, 0]; // b12..b15
  ids.forEach((id) => {
    if (id < 1 || id > 32) return;
    const idx = 3 - Math.floor((id - 1) / 8);
    const bit = (id - 1) % 8;
    bytes[idx] |= 1 << bit;
  });
  return bytes;
};

const idsToMaskByte = (ids = []) => ids.reduce((m, id) => m | (1 << ((id - 1) % 8)), 0) & 0xff;

const parseStatus08 = (payload) => {
  if (!payload?.length || payload[0] !== 0x08) return null;
  const safe = (idx) => (idx < payload.length ? payload[idx] : 0);
  const servoBytes = [safe(12), safe(13), safe(14), safe(15)];
  const irByte = safe(29);
  const eyeByte = safe(50);
  const usByte = safe(64);
  const speakerByte = safe(78);
  const motorByte = safe(120);
  const text = Buffer.from(payload.slice(1, Math.min(payload.length, 12)))
    .toString('ascii')
    .replace(/\0+$/, '');
  return {
    text,
    servos: maskBytesToIds(servoBytes),
    ir: maskByteToIds(irByte),
    eyes: maskByteToIds(eyeByte),
    ultrasonic: maskByteToIds(usByte),
    speakers: maskByteToIds(speakerByte),
    motors: maskByteToIds(motorByte),
    masks: {
      servos: servoBytes,
      ir: irByte,
      eyes: eyeByte,
      ultrasonic: usByte,
      speakers: speakerByte,
      motors: motorByte,
    },
  };
};

export class Jimu extends EventEmitter {
  constructor({
    pingIntervalMs = 5000,
    batteryIntervalMs = 30000,
    nameSubstring,
  } = {}) {
    super();
    this.client = new JimuBleClient({ nameSubstring });
    this.state = {
      status08: null,
      connected: false,
      battery: null,
    };
    this.pingIntervalMs = pingIntervalMs;
    this.batteryIntervalMs = batteryIntervalMs;
    this._pingTimer = null;
    this._batteryTimer = null;
    this._onFrame = this._onFrame.bind(this);
    this._onDisconnect = this._onDisconnect.bind(this);
  }

  async connect(target) {
    this.client.on('frame', this._onFrame);
    this.client.on('disconnect', this._onDisconnect);
    await this.client.connect(target);
    this.state.connected = true;
    await this._boot();
    this._startMaintenance();
    return this.getInfo();
  }

  async disconnect() {
    this._stopMaintenance();
    this.state.connected = false;
    await this.client.disconnect();
    this.client.removeListener('frame', this._onFrame);
    this.client.removeListener('disconnect', this._onDisconnect);
  }

  _onDisconnect() {
    this._stopMaintenance();
    this.state.connected = false;
    this.emit('disconnect');
  }

  _onFrame({ payload, cmd, meta }) {
    if (meta?.cmd === 0x08) {
      this.state.status08 = parseStatus08(Array.from(payload));
      this.emit('status', this.state.status08);
    }
    if (meta?.cmd === 0x27 && payload.length >= 5) {
      const charging = payload[1] === 1;
      const volts = (payload[3] * 256 + payload[4]) / 2500;
      this.state.battery = { charging, volts, raw: [payload[3], payload[4]] };
      this.emit('battery', this.state.battery);
    }
    if (meta?.cmd === 0x7e) {
      this.emit('sensor', payload);
    }
    if (meta?.cmd === 0x03) {
      this.emit('ping', payload);
    }
    this.emit('frame', { payload, cmd, meta });
  }

  async _boot() {
    // Minimal tested boot: info -> probe -> status -> enable -> battery
    const seq = [
      [0x36, 0x00],
      [0x01, 0x00],
    ];
    for (const p of seq) {
      await this._send(p);
      await sleep(150);
    }
    await this.refreshStatus();
    await this.enableDetected();
    await this.requestBattery();
  }

  _startMaintenance() {
    this._stopMaintenance();
    if (this.pingIntervalMs > 0) {
      this._pingTimer = setInterval(() => this._send([0x03, 0x00]), this.pingIntervalMs);
    }
    if (this.batteryIntervalMs > 0) {
      this._batteryTimer = setInterval(() => this.requestBattery(), this.batteryIntervalMs);
    }
  }

  _stopMaintenance() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    if (this._batteryTimer) clearInterval(this._batteryTimer);
    this._pingTimer = null;
    this._batteryTimer = null;
  }

  async _send(payload) {
    return this.client.send(payload);
  }

  // ----------------- Public API -----------------
  async refreshStatus() {
    await this._send([0x08, 0x00]);
    await sleep(200);
    return this.state.status08;
  }

  getStatus() {
    return this.state.status08;
  }

  getInfo() {
    const s = this.state.status08;
    return {
      firmware: s?.text || null,
      modules: s || null,
      battery: this.state.battery,
    };
  }

  async enableDetected() {
    const s = this.state.status08 || (await this.refreshStatus());
    if (!s) return;
    const enableSet = [
      { type: 0x01, mask: s.masks.ir },
      { type: 0x04, mask: s.masks.eyes },
      { type: 0x06, mask: s.masks.ultrasonic },
      { type: 0x08, mask: s.masks.speakers },
    ].filter((x) => x.mask);
    for (const cfg of enableSet) {
      await this._send([0x71, cfg.type, cfg.mask, 0x00]);
      await sleep(120);
    }
  }

  async requestBattery() {
    await this._send([0x27, 0x00]);
  }

  // Servos
  async setServoPositions({ ids = [], positions = [], speed = 0x14, tail = [0x00, 0x00] } = {}) {
    if (!ids.length) throw new Error('No servo ids provided');
    const select = idsToMaskBytes32(ids);
    const payload = [0x09, ...select, ...positions.slice(0, ids.length), clampByte(speed), ...tail];
    await this._send(payload);
  }

  async rotateServo(id, direction, velocity) {
    const vel = Math.max(0, Math.min(0xffff, velocity || 0));
    const hi = (vel >> 8) & 0xff;
    const lo = vel & 0xff;
    await this._send([0x07, 0x01, id, direction, hi, lo]);
  }

  async readServoPosition(id = 0) {
    // id=0 => all
    await this._send([0x0b, clampByte(id), 0x00]);
  }

  async changeServoId(fromId, toId) {
    await this._send([0x0c, clampByte(fromId), clampByte(toId)]);
  }

  // Motors
  async rotateMotor(id, speed = 0) {
    // speed: -100..100 mapped to signed 16-bit
    const scaled = Math.max(-32767, Math.min(32767, Math.trunc((speed / 100) * 32767)));
    const val = scaled < 0 ? 0x10000 + scaled : scaled;
    const hi = (val >> 8) & 0xff;
    const lo = val & 0xff;
    // direction encoded in signed magnitude seen in sniff; keep 0x01 (motor count?)
    await this._send([0x90, 0x01, clampByte(id), hi, lo, 0xff, 0xff]);
  }

  async stopMotor(id) {
    await this._send([0x90, 0x01, clampByte(id), 0x00, 0x00, 0xff, 0xff]);
  }

  // Sensors
  async readIR(id = 1) {
    await this._send([0x7e, 0x01, 0x01, clampByte(id)]);
  }

  async readUltrasonic(id = 1) {
    await this._send([0x7e, 0x01, 0x06, clampByte(id)]);
  }

  async readAllSensors(status = this.state.status08) {
    const s = status || this.state.status08 || (await this.refreshStatus());
    if (!s) return;
    const sensors = [
      ...s.ir.map((id) => ({ type: 0x01, id })),
      ...s.ultrasonic.map((id) => ({ type: 0x06, id })),
    ];
    if (!sensors.length) return;
    // Protocol warning: only one sensor of a given type per frame.
    const queue = [...sensors];
    while (queue.length) {
      const batch = [];
      const seen = new Set();
      for (let i = 0; i < queue.length; ) {
        const entry = queue[i];
        if (seen.has(entry.type)) {
          i += 1;
          continue;
        }
        seen.add(entry.type);
        batch.push(entry);
        queue.splice(i, 1);
      }
      const payload = [0x7e, clampByte(batch.length)];
      batch.forEach((x) => payload.push(x.type, x.id));
      await this._send(payload);
      await sleep(100);
    }
  }

  // Eyes
  async setEyeColor({ eyesMask = 0x01, time = 0xff, r = 0xff, g = 0x00, b = 0x00 } = {}) {
    await this._send([0x79, 0x04, clampByte(eyesMask), clampByte(time), 0x01, 0xff, clampByte(r), clampByte(g), clampByte(b)]);
  }

  async setEyeSegments({ eyesMask = 0x01, time = 0xff, entries = [] } = {}) {
    const payload = [0x79, 0x04, clampByte(eyesMask), 0x02, clampByte(entries.length), clampByte(time)];
    entries.forEach(({ r, g, b, mask }) => {
      payload.push(clampByte(r ?? 0), clampByte(g ?? 0), clampByte(b ?? 0), clampByte(mask ?? 0x01));
    });
    await this._send(payload);
  }

  // Change IDs (sensors/motors/eyes/ultrasonic)
  async changePeripheralId({ type, fromId, toId }) {
    await this._send([0x74, clampByte(type), clampByte(fromId), clampByte(toId)]);
  }

  async fixSensorFromZero({ type = 0x01, toId = 0x02 } = {}) {
    await this.changePeripheralId({ type, fromId: 0x00, toId });
  }
}

export class WheeledDrive {
  constructor(jimu, { left = [], right = [], invertLeft = false, invertRight = true } = {}) {
    this.jimu = jimu;
    this.left = left;
    this.right = right;
    this.invertLeft = invertLeft;
    this.invertRight = invertRight;
  }

  async drive(speed = 0, turn = 0) {
    // speed/turn in -100..100; differential mix
    const forward = Math.max(-100, Math.min(100, speed));
    const turnVal = Math.max(-100, Math.min(100, turn));
    const leftSpeed = forward + turnVal;
    const rightSpeed = forward - turnVal;
    await Promise.all([
      this._driveGroup(this.left, leftSpeed, this.invertLeft),
      this._driveGroup(this.right, rightSpeed, this.invertRight),
    ]);
  }

  async _driveGroup(ids, speed, invert) {
    const dirSpeed = invert ? -speed : speed;
    const direction = dirSpeed >= 0 ? 0x01 : 0x02;
    const velocity = Math.round(Math.abs(dirSpeed) * 10); // coarse scaling
    for (const id of ids) {
      await this.jimu.rotateServo(id, direction, velocity);
    }
  }
}

export const utils = { parseStatus08, idsToMaskBytes32, idsToMaskByte, maskBytesToIds };
