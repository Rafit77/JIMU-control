import EventEmitter from 'events';
import noble from '@abandonware/noble';

const TARGET_NAME_SUBSTR = 'jimu';
const CUSTOM_PREFIX = '49535343';
const START_BYTES = [0xfb, 0xbf];
const TERMINATOR = 0xed;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = (promise, ms, label) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (res) => {
        clearTimeout(t);
        resolve(res);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });

const buildFrame = (payload) => {
  const len = payload.length + 4; // start bytes + payload + checksum + terminator (without the length byte itself)
  const checksum = [len, ...payload].reduce((sum, byte) => (sum + byte) & 0xff, 0);
  return Buffer.from([...START_BYTES, len, ...payload, checksum, TERMINATOR]);
};

class FrameParser {
  constructor({ onFrame, onError }) {
    this.buffer = Buffer.alloc(0);
    this.onFrame = onFrame;
    this.onError = onError;
  }

  push(chunk) {
    if (!chunk || !chunk.length) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 4) {
      // Seek start bytes.
      const start = this.buffer.indexOf(Buffer.from(START_BYTES));
      if (start === -1) {
        this.buffer = Buffer.alloc(0);
        return;
      }
      if (start > 0) {
        this.buffer = this.buffer.slice(start);
      }
      if (this.buffer.length < 3) return;

      const lenByte = this.buffer[2];
      const totalLength = lenByte + 1; // length excludes the length byte itself.
      if (totalLength < 5) {
        this.buffer = this.buffer.slice(2);
        this.onError?.(new Error(`Frame too short (len=${lenByte})`));
        continue;
      }
      if (this.buffer.length < totalLength) return;

      const frame = this.buffer.slice(0, totalLength);
      this.buffer = this.buffer.slice(totalLength);

      const terminator = frame[frame.length - 1];
      if (terminator !== TERMINATOR) {
        this.onError?.(new Error(`Missing terminator 0x${TERMINATOR.toString(16)}`));
        continue;
      }

      const checksum = frame[frame.length - 2];
      const calcChecksum = frame
        .slice(2, frame.length - 2) // length byte + payload only
        .reduce((sum, byte) => (sum + byte) & 0xff, 0);
      const payload = frame.slice(3, frame.length - 2);
      const cmd = payload[0];
      const meta = { lenByte, cmd, checksumOk: checksum === calcChecksum };

      if (!meta.checksumOk) {
        this.onError?.(new Error(`Checksum mismatch for cmd=0x${cmd?.toString(16)}`), { frame });
        continue;
      }
      this.onFrame?.({ frame, payload, cmd, meta });
    }
  }
}

export class JimuBleClient extends EventEmitter {
  constructor({ nameSubstring = TARGET_NAME_SUBSTR } = {}) {
    super();
    this.nameSubstring = nameSubstring.toLowerCase();
    this.peripheral = null;
    this.writeCharacteristics = [];
    this.notifyCharacteristics = [];
    this._disconnectHandler = null;
    this.parser = new FrameParser({
      onFrame: (data) => this.emit('frame', data),
      onError: (err, ctx) => this.emit('frameError', err, ctx),
    });
  }

  static async scan({ timeoutMs = 5000, nameSubstring = TARGET_NAME_SUBSTR } = {}) {
    const matches = new Map();

    const discoverHandler = (p) => {
      const name = p.advertisement?.localName || '';
      if (!name || !name.toLowerCase().includes(nameSubstring.toLowerCase())) return;
      matches.set(p.id, { id: p.id, name, peripheral: p });
    };

    noble.on('discover', discoverHandler);
    if (noble.state === 'poweredOn') {
      await noble.startScanningAsync([], false);
    } else {
      await new Promise((resolve) => {
        const handler = async (state) => {
          if (state === 'poweredOn') {
            noble.removeListener('stateChange', handler);
            await noble.startScanningAsync([], false);
            resolve();
          }
        };
        noble.on('stateChange', handler);
      });
    }

    await sleep(timeoutMs);
    noble.removeListener('discover', discoverHandler);
    await noble.stopScanningAsync();
    return Array.from(matches.values());
  }

  async connect(target) {
    const targetIdOrName = typeof target === 'string' ? target.toLowerCase() : null;
    let peripheral = target && typeof target !== 'string' ? target : null;

    if (!peripheral) {
      const candidates = await JimuBleClient.scan({ nameSubstring: this.nameSubstring, timeoutMs: 4000 });
      if (!candidates.length) throw new Error('No JIMU devices found');
      const match = candidates.find((c) => c.id.toLowerCase() === targetIdOrName || c.name.toLowerCase() === targetIdOrName) || candidates[0];
      peripheral = match.peripheral;
    }

    this.peripheral = peripheral;
    this._disconnectHandler = () => this.emit('disconnect');
    this.peripheral.on('disconnect', this._disconnectHandler);

    await withTimeout(this.peripheral.connectAsync(), 10000, 'BLE connect');
    const { services, characteristics } = await withTimeout(
      this.peripheral.discoverAllServicesAndCharacteristicsAsync(),
      10000,
      'Service discovery',
    );

    const targetService = services.find((s) => s.uuid.replace(/-/g, '').startsWith(CUSTOM_PREFIX))?.uuid;
    const byService = (svc) => characteristics.filter((c) => (c._serviceUuid || '').replace(/-/g, '') === svc.replace(/-/g, ''));
    const scopedChars = targetService ? byService(targetService) : characteristics;

    this.notifyCharacteristics = (scopedChars.length ? scopedChars : characteristics).filter((c) => c.properties.includes('notify'));
    const preferredWrites = [
      '49535343884143f4a8d4ecbe34729bb3',
      '49535343aca3481c91ecd85e28a60318',
    ];
    this.writeCharacteristics = [];
    for (const u of preferredWrites) {
      const c = characteristics.find((x) => x.uuid === u);
      if (c && (c.properties.includes('write') || c.properties.includes('writeWithoutResponse'))) {
        this.writeCharacteristics.push(c);
      }
    }
    for (const c of scopedChars) {
      if (!this.writeCharacteristics.includes(c) && (c.properties.includes('write') || c.properties.includes('writeWithoutResponse'))) {
        this.writeCharacteristics.push(c);
      }
    }
    for (const c of characteristics) {
      if (!this.writeCharacteristics.includes(c) && (c.properties.includes('write') || c.properties.includes('writeWithoutResponse'))) {
        this.writeCharacteristics.push(c);
      }
    }

    if (!this.writeCharacteristics.length || !this.notifyCharacteristics.length) {
      throw new Error('Missing write/notify characteristics');
    }

    for (const nc of this.notifyCharacteristics) {
      try {
        await withTimeout(nc.subscribeAsync(), 5000, `Subscribe ${nc.uuid}`);
        nc.on('data', (data) => this.parser.push(data));
      } catch (err) {
        this.emit('frameError', err, { characteristic: nc.uuid });
      }
    }

    this.emit('connect', {
      id: peripheral.id,
      name: peripheral.advertisement?.localName || 'Unknown',
      services: services.map((s) => s.uuid),
      notifyCount: this.notifyCharacteristics.length,
      writeCount: this.writeCharacteristics.length,
    });
  }

  async disconnect() {
    for (const nc of this.notifyCharacteristics) {
      try {
        await withTimeout(nc.unsubscribeAsync(), 3000, `Unsubscribe ${nc.uuid}`);
      } catch (_) {
        // ignore
      }
      nc.removeAllListeners('data');
    }
    if (this.peripheral) {
      if (this._disconnectHandler) {
        this.peripheral.removeListener('disconnect', this._disconnectHandler);
        this._disconnectHandler = null;
      }
      if (this.peripheral.state === 'connected') {
        try {
          await withTimeout(this.peripheral.disconnectAsync(), 5000, 'BLE disconnect');
        } catch (_) {
          // ignore
        }
      }
    }
    this.peripheral = null;
    this.notifyCharacteristics = [];
    this.writeCharacteristics = [];
    this.parser.buffer = Buffer.alloc(0);
  }

  async send(payload) {
    if (!this.peripheral || this.peripheral.state !== 'connected') throw new Error('Not connected');
    const frame = buildFrame(payload);

    for (const wc of this.writeCharacteristics) {
      const withoutResponse = wc.properties.includes('writeWithoutResponse');
      try {
        await wc.writeAsync(frame, withoutResponse);
        return true;
      } catch (err) {
        this.emit('frameError', err, { characteristic: wc.uuid });
      }
    }
    throw new Error('All writes failed');
  }
}

export const helpers = { buildFrame };
