import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CMD, EVT, MODE_CODES, TELEOP, KEY_TO_TELEOP, codeToMode, factsLine, parseFacts, parseEvent,
  parseCapabilities, stdinFrames, lineSplitter, createLink,
} from '../js/link.js';
import { DEFAULT_BUILDS } from '../js/build.js';
import { modesProgram, bridgeScript } from '../js/export.js';

test('mode codes and teleop digits never collide', () => {
  const codes = Object.values(MODE_CODES);
  assert.equal(new Set(codes).size, codes.length);
  for (const d of Object.keys(TELEOP)) assert.ok(!codes.includes(d));
  for (const d of Object.values(KEY_TO_TELEOP)) assert.ok(TELEOP[d], `key maps to a teleop digit: ${d}`);
  assert.equal(codeToMode('f'), 'follow_line');
  assert.equal(codeToMode('z'), null);
});

test('the facts line round-trips through parseFacts', () => {
  const line = factsLine({ front: 'obstacle near', floor: 'line edge', bumper: 'no touch sensor' }, 'explore');
  assert.equal(line, 'front=obstacle near;floor=line edge;bumper=no touch sensor;mode=explore');
  assert.deepEqual(parseFacts(line), { front: 'obstacle near', floor: 'line edge', bumper: 'no touch sensor', mode: 'explore' });
  assert.equal(parseFacts('>>> hello'), null);
  assert.equal(parseFacts('Traceback (most recent call last):'), null);
});

test('events decode per the Pybricks profile', () => {
  const out = parseEvent(Uint8Array.from([EVT.STDOUT, 104, 105]));
  assert.equal(out.type, 'stdout');
  assert.equal(new TextDecoder().decode(out.bytes), 'hi');
  const running = parseEvent(Uint8Array.from([EVT.STATUS, 0x41, 0x00, 0x00, 0x00, 0x00]));
  assert.equal(running.type, 'status');
  assert.equal(running.running, true);
  assert.deepEqual(running.warnings, ['battery low']);
  assert.equal(running.program, 0);
  assert.equal(parseEvent(Uint8Array.from([EVT.STATUS, 0, 0, 0, 0])).running, false);
  assert.equal(parseEvent(Uint8Array.from([7, 1])).type, 'unknown');
});

test('capabilities read little-endian and report the REPL flag', () => {
  const buf = new ArrayBuffer(10);
  const dv = new DataView(buf);
  dv.setUint16(0, 100, true); dv.setUint32(2, 0b11, true); dv.setUint32(6, 16384, true);
  assert.deepEqual(parseCapabilities(dv), { maxCharSize: 100, flags: 3, maxProgramSize: 16384, repl: true });
  assert.equal(parseCapabilities(new DataView(new ArrayBuffer(4))), null);
});

test('stdin frames carry the write-stdin command and respect the write size', () => {
  const frames = stdinFrames('abcdefgh', 4);
  assert.equal(frames.length, 3);
  assert.deepEqual([...frames[0]], [CMD.WRITE_STDIN, 97, 98, 99]);
  assert.deepEqual([...frames[2]], [CMD.WRITE_STDIN, 103, 104]);
  assert.deepEqual([...stdinFrames('f', 20)[0]], [CMD.WRITE_STDIN, 102]);
});

test('the line splitter joins fragments and strips carriage returns', () => {
  const lines = [];
  const feed = lineSplitter((l) => lines.push(l));
  const enc = new TextEncoder();
  feed(enc.encode('front=cl'));
  feed(enc.encode('ear;mode=explore\r\nfloor'));
  feed(enc.encode('=x\n'));
  assert.deepEqual(lines, ['front=clear;mode=explore', 'floor=x']);
});

test('a link over a fake transport routes facts, status and bytes', async () => {
  const written = [];
  let push = null;
  const transport = {
    name: 'fake', available: () => true,
    async connect({ onEvent }) { push = onEvent; return { name: 'Fake', caps: { maxCharSize: 20, repl: false } }; },
    async write(u8) { written.push([...u8]); },
    disconnect() {},
  };
  const seen = { facts: [], lines: [], status: [] };
  const link = createLink(transport, { facts: (f) => seen.facts.push(f), line: (l) => seen.lines.push(l), status: (s) => seen.status.push(s.running) });
  await link.connect();
  assert.equal(link.state, 'connected');
  push(Uint8Array.from([EVT.STATUS, 0x40, 0, 0, 0]));
  push(Uint8Array.from([EVT.STDOUT, ...new TextEncoder().encode('front=clear;mode=explore\nnot facts\n')]));
  assert.deepEqual(seen.status, [true]);
  assert.deepEqual(seen.facts, [{ front: 'clear', mode: 'explore' }]);
  assert.deepEqual(seen.lines, ['not facts']);
  await link.sendMode('avoid');
  await link.sendTeleop('8');
  await link.startProgram();
  assert.deepEqual(written, [[CMD.WRITE_STDIN, 97], [CMD.WRITE_STDIN, 56], [CMD.START_PROGRAM]]);
  await assert.rejects(() => link.runSource('print(1)'), /no REPL/);
});

test('the exported modes program and bridge speak the same bytes', () => {
  const py = modesProgram(DEFAULT_BUILDS.inventor);
  assert.match(py, /b"f": \(mode_follow_line, "follow_line"\)/);
  assert.match(py, /b"8": \(50, 50\)/);
  assert.match(py, /;mode=" \+ mode_name/);
  assert.match(py, /def mode_teleop\(\):/);
  const ev3 = modesProgram(DEFAULT_BUILDS.ev3);
  assert.match(ev3, /Button\.LEFT in pressed/);
  assert.doesNotMatch(ev3, /stdin/);
  const bridge = bridgeScript('go', 0.3);
  assert.match(bridge, /robot\.pop\("mode", None\)/);
  assert.match(bridge, /b"\\x01"/);
});
