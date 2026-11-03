// The link between this page and a hub running Pybricks: the Pybricks BLE
// profile (github.com/pybricks/technical-info, pybricks-ble-profile.md), the
// facts line the exported program prints, and the bytes it accepts. Two
// transports share one protocol: Web Bluetooth to a real Inventor Hub, and
// the simulator standing in as a virtual hub. Nothing here touches the DOM.

export const UUID = {
  service: 'c5f50001-8280-46da-89f4-6d8051e4aeef',
  command: 'c5f50002-8280-46da-89f4-6d8051e4aeef',
  capabilities: 'c5f50003-8280-46da-89f4-6d8051e4aeef',
};

// Command bytes written to the command/event characteristic (profile v1.2+,
// WRITE_STDIN since v1.3). Events are notifications from the same one.
export const CMD = { STOP_PROGRAM: 0, START_PROGRAM: 1, START_REPL: 2, WRITE_STDIN: 6 };
export const EVT = { STATUS: 0, STDOUT: 1 };

export const STATUS_BITS = [
  'battery low', 'battery shutdown', 'high current', 'advertising', 'low signal',
  'power button pressed', 'program running', 'shutting down', 'shutdown requested', 'host connected',
];
const RUNNING_BIT = 6;

// One byte per mode, written to the hub's stdin. The exported program and the
// virtual hub both read this table, so a code is defined once.
export const MODE_CODES = { follow_line: 'f', explore: 'e', avoid: 'a', stop: 's' };

// Teleop bytes, numpad style so they never collide with a mode letter.
// Values are left and right motor speed in percent.
export const TELEOP = {
  8: { label: 'forward', drive: [50, 50] },
  2: { label: 'back', drive: [-40, -40] },
  4: { label: 'spin left', drive: [-35, 35] },
  6: { label: 'spin right', drive: [35, -35] },
  7: { label: 'veer left', drive: [25, 50] },
  9: { label: 'veer right', drive: [50, 25] },
  5: { label: 'stop', drive: [0, 0] },
};
export const KEY_TO_TELEOP = {
  ArrowUp: '8', w: '8', ArrowDown: '2', s: '2', ArrowLeft: '4', a: '4', ArrowRight: '6', d: '6',
  q: '7', e: '9', ' ': '5', x: '5',
};

export function codeToMode(ch) {
  return Object.keys(MODE_CODES).find((k) => MODE_CODES[k] === ch) || null;
}

/** The line the hub prints twice a second; parseFacts reads it back. */
export function factsLine(f, mode) {
  return `front=${f.front};floor=${f.floor};bumper=${f.bumper};mode=${mode}`;
}

/** "front=clear;floor=plain floor;mode=explore" -> object, or null if it is not one. */
export function parseFacts(line) {
  const out = {};
  for (const part of line.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const key = part.slice(0, i).trim();
    if (!/^[a-z_]+$/.test(key)) continue;
    out[key] = part.slice(i + 1).trim();
  }
  return Object.keys(out).length ? out : null;
}

/** Decode one notification from the command/event characteristic. */
export function parseEvent(u8) {
  if (!u8 || !u8.length) return { type: 'empty' };
  if (u8[0] === EVT.STDOUT) return { type: 'stdout', bytes: u8.subarray(1) };
  if (u8[0] === EVT.STATUS && u8.length >= 5) {
    const flags = u8[1] | (u8[2] << 8) | (u8[3] << 16) | (u8[4] << 24);
    return {
      type: 'status',
      flags: flags >>> 0,
      running: !!(flags & (1 << RUNNING_BIT)),
      program: u8.length >= 6 ? u8[5] : null, // profile v1.4 names the running program
      warnings: STATUS_BITS.filter((_, i) => (flags & (1 << i)) && [0, 1, 2, 4].includes(i)),
    };
  }
  return { type: 'unknown', code: u8[0] };
}

/** The hub capabilities characteristic: 10 bytes, little-endian. */
export function parseCapabilities(dv) {
  if (!dv || dv.byteLength < 10) return null;
  const flags = dv.getUint32(2, true);
  return {
    maxCharSize: dv.getUint16(0, true),
    flags,
    maxProgramSize: dv.getUint32(6, true),
    repl: !!(flags & 1),
  };
}

/** Split text into WRITE_STDIN frames no larger than the hub's write size. */
export function stdinFrames(text, maxCharSize = 20) {
  const bytes = new TextEncoder().encode(text);
  const chunk = Math.max(1, maxCharSize - 1);
  const frames = [];
  for (let i = 0; i < bytes.length; i += chunk) {
    const f = new Uint8Array(1 + Math.min(chunk, bytes.length - i));
    f[0] = CMD.WRITE_STDIN;
    f.set(bytes.subarray(i, i + chunk), 1);
    frames.push(f);
  }
  return frames;
}

/** Accumulate stdout bytes and hand back whole lines. */
export function lineSplitter(onLine) {
  const decoder = new TextDecoder();
  let buf = '';
  return (bytes) => {
    buf += decoder.decode(bytes, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      onLine(buf.slice(0, i).replace(/\r$/, ''));
      buf = buf.slice(i + 1);
    }
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One link over one transport. A transport is { name, available(), connect({ onEvent, onDisconnect }),
 * write(u8), disconnect() }; connect resolves to { name, caps, profile, firmware }.
 */
export function createLink(transport, handlers = {}) {
  const on = (name, ...args) => handlers[name]?.(...args);
  let state = 'idle', info = null, status = null, caps = { maxCharSize: 20, repl: false };
  let echo = '';
  const feed = lineSplitter((line) => {
    const f = parseFacts(line);
    if (f) on('facts', f, line); else on('line', line);
  });
  let writing = Promise.resolve();
  const queue = (fn) => { writing = writing.then(fn, fn); return writing; };

  function setState(next, detail) { state = next; on('state', state, detail); }

  async function connect() {
    if (state !== 'idle') return;
    setState('connecting');
    try {
      info = await transport.connect({
        onEvent: (u8) => {
          const e = parseEvent(u8);
          if (e.type === 'stdout') {
            const text = new TextDecoder().decode(e.bytes);
            echo += text;
            if (echo.length > 4000) echo = echo.slice(-2000);
            on('stdout', text);
            feed(e.bytes);
          } else if (e.type === 'status') {
            status = e;
            on('status', e);
          }
        },
        onDisconnect: () => { if (state !== 'idle') { setState('idle', 'disconnected'); info = null; status = null; } },
      });
      if (info?.caps) caps = info.caps;
      setState('connected', info);
    } catch (err) {
      info = null;
      setState('idle', err?.message || String(err));
      throw err;
    }
  }

  function disconnect() {
    if (state === 'idle') return;
    try { transport.disconnect(); } catch { /* already gone */ }
    setState('idle', 'disconnected');
    info = null; status = null;
  }

  const command = (bytes) => queue(() => transport.write(Uint8Array.from(bytes)));
  const writeStdin = (text) => queue(async () => { for (const f of stdinFrames(text, caps.maxCharSize)) await transport.write(f); });

  async function waitFor(pred, timeoutMs, what) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (pred()) return;
      await wait(25);
    }
    throw new Error(`Timed out waiting for ${what}`);
  }

  /**
   * Experimental: run Python source through the hub's REPL in paste mode,
   * pacing each line on its echo so the hub's stdin buffer never overflows.
   * Untested on hardware as of 2026-11-02; the hub output pane shows what it
   * answered. The virtual hub cannot run Python and refuses.
   */
  async function runSource(source) {
    if (state !== 'connected') throw new Error('Not connected');
    if (!caps.repl) throw new Error('This hub reports no REPL, so source cannot be pasted into it');
    if (status?.running) { await command([CMD.STOP_PROGRAM]); await waitFor(() => status && !status.running, 3000, 'the program to stop'); }
    echo = '';
    try { await command([CMD.START_REPL]); } catch { await command([CMD.START_PROGRAM, 0x80]); } // v1.4 names the REPL as builtin 0x80
    await waitFor(() => status?.running, 4000, 'the REPL to start');
    await writeStdin('\x05');
    await waitFor(() => echo.includes('=== '), 3000, 'paste mode');
    for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
      const line = raw.replace(/\s+$/, '');
      echo = '';
      await writeStdin(line + '\n');
      await waitFor(() => (line ? echo.includes(line) : echo.includes('=== ')), 4000, `the echo of: ${line.slice(0, 40)}`);
    }
    await writeStdin('\x04');
  }

  return {
    get state() { return state; },
    get info() { return info; },
    get status() { return status; },
    get caps() { return caps; },
    transportName: transport.name,
    available: () => transport.available(),
    connect, disconnect, writeStdin, runSource,
    startProgram: () => command([CMD.START_PROGRAM]),
    stopProgram: () => command([CMD.STOP_PROGRAM]),
    sendMode: (mode) => writeStdin(MODE_CODES[mode]),
    sendTeleop: (digit) => writeStdin(String(digit)),
  };
}

/** Web Bluetooth to a hub running Pybricks firmware 3.3 or newer. */
export function bleTransport() {
  let device = null, char = null;
  const copy = (dv) => new Uint8Array(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength));
  return {
    name: 'Bluetooth',
    available: () => typeof navigator !== 'undefined' && !!navigator.bluetooth && globalThis.isSecureContext === true,
    async connect({ onEvent, onDisconnect }) {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [UUID.service] }],
        optionalServices: ['device_information'],
      });
      device.addEventListener('gattserverdisconnected', onDisconnect);
      const server = await device.gatt.connect();
      const svc = await server.getPrimaryService(UUID.service);
      char = await svc.getCharacteristic(UUID.command);
      char.addEventListener('characteristicvaluechanged', (ev) => onEvent(copy(ev.target.value)));
      await char.startNotifications();
      let caps = null, profile = null, firmware = null;
      try { caps = parseCapabilities(await (await svc.getCharacteristic(UUID.capabilities)).readValue()); } catch { /* profile 1.1 or older */ }
      try {
        const dis = await server.getPrimaryService('device_information');
        const dec = new TextDecoder();
        profile = dec.decode(await (await dis.getCharacteristic('software_revision_string')).readValue());
        firmware = dec.decode(await (await dis.getCharacteristic('firmware_revision_string')).readValue());
      } catch { /* optional */ }
      return { name: device.name || 'Pybricks Hub', caps, profile, firmware };
    },
    async write(u8) {
      if (!char) throw new Error('Not connected');
      await char.writeValueWithResponse(u8);
    },
    disconnect() { device?.gatt?.disconnect(); char = null; },
  };
}

/** The simulator as a hub: same events, same bytes, no Bluetooth. */
export function virtualTransport(sim) {
  let onEvent = null;
  const statusFrame = (running) => Uint8Array.from([EVT.STATUS, running ? 1 << RUNNING_BIT : 0, 0, 0, 0]);
  return {
    name: 'Virtual hub',
    available: () => true,
    async connect(h) {
      onEvent = h.onEvent;
      sim.attachHub({
        onStdout: (text) => onEvent(Uint8Array.from([EVT.STDOUT, ...new TextEncoder().encode(text)])),
        onStatus: (running) => onEvent(statusFrame(running)),
      });
      onEvent(statusFrame(sim.running));
      return { name: 'Virtual hub (the simulator)', caps: { maxCharSize: 100, flags: 0, maxProgramSize: 0, repl: false }, profile: 'virtual', firmware: null };
    },
    async write(u8) {
      if (u8[0] === CMD.WRITE_STDIN) sim.hubWrite(new TextDecoder().decode(u8.subarray(1)));
      else if (u8[0] === CMD.START_PROGRAM) sim.play();
      else if (u8[0] === CMD.STOP_PROGRAM) sim.pause();
      else throw new Error('The virtual hub only runs the program it already has');
    },
    disconnect() { sim.detachHub(); onEvent = null; },
  };
}
