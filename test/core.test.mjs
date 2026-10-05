import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BUILDS, cloneBuild, validate, combinationMatrix, capabilities } from '../js/build.js';
import { facts, localDecide, gate, ruleRunner, jevRequest, PRESETS } from '../js/brain.js';
import { rulesProgram, modesProgram, bridgeScript } from '../js/export.js';

test('default builds are valid against both kits', () => {
  assert.deepEqual(validate(DEFAULT_BUILDS.inventor, ['51515', '31313']).filter((i) => i.level === 'error'), []);
  assert.deepEqual(validate(DEFAULT_BUILDS.ev3, ['51515', '31313']).filter((i) => i.level === 'error'), []);
});

test('connector families do not mix and EV3 port kinds are enforced', () => {
  const b = cloneBuild(DEFAULT_BUILDS.ev3);
  b.ports.A = 'touch-ev3';
  b.ports.S2 = 'medium-angular';
  const text = validate(b, ['51515', '31313']).map((i) => i.text).join(' ');
  assert.match(text, /Port A is a motor port/);
  assert.match(text, /LPF2 connector/);
});

test('inventory limits are counted', () => {
  const b = cloneBuild(DEFAULT_BUILDS.inventor);
  b.ports.E = 'color-lpf2';
  assert.ok(validate(b, ['51515']).some((i) => /2 x Color Sensor/.test(i.text)));
});

test('combination matrix counts ordered port layouts', () => {
  const rover = combinationMatrix(['51515', '31313']).find((r) => r.archetype.id === 'rover');
  assert.deepEqual(rover.cells.map((c) => c.layouts), [30, 12]); // 6P2 and 4P2
  const walker = combinationMatrix(['31313']).find((r) => r.archetype.id === 'walker');
  assert.deepEqual(walker.cells[0].missing, ['1 motor']);
});

test('capabilities of the default inventor build', () => {
  assert.deepEqual(capabilities(DEFAULT_BUILDS.inventor), { motor: 2, color: 1, distance: 1, touch: 0 });
});

test('facts are categories, never raw numbers', () => {
  const f = facts({ distance: 100, reflection: 50, color: 'white', touch: null }, 'explore', 0);
  assert.equal(f.front, 'blocked');
  assert.equal(f.floor, 'line edge');
  assert.ok(Object.values(f).every((v) => typeof v === 'string'));
  assert.equal(facts({ distance: 900, reflection: 80, color: 'white', touch: null }, 'explore', 0, true).floor, 'crossed a line');
});

test('blocked beats every goal word, and the gate holds low-confidence answers', () => {
  const goal = 'Follow the line';
  const f = facts({ distance: 50, reflection: 12, color: 'black', touch: null }, 'follow_line', 10);
  assert.equal(localDecide(goal, f).choice, 'avoid');
  const p = localDecide(goal, f).probabilities;
  assert.ok(Math.abs(Object.values(p).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(gate({ choice: 'stop', confidence: 0.1 }, 'explore', 0.25), 'explore');
});

test('rule runner honours hold timers', () => {
  const run = ruleRunner(PRESETS.bounce.rules);
  assert.equal(run({ distance: 100 }, 0).rule, 0);
  assert.equal(run({ distance: 900 }, 300).rule, 0); // still held
  assert.equal(run({ distance: 900 }, 600).rule, 1);
});

test('the Jev request matches the documented shape', () => {
  const r = jevRequest('reach the red patch', facts({ distance: 900, reflection: 80, color: 'white', touch: false }, 'explore', 0));
  assert.equal(r.model, 'jev-latest');
  assert.equal(r.questions.mode.type, 'choice');
  assert.deepEqual(Object.keys(r.questions.mode.criteria), ['follow_line', 'explore', 'avoid', 'stop']);
  assert.equal(r.questions.goal_reached.type, 'noul');
});

test('exports name the right hub classes and ports', () => {
  const inv = rulesProgram(DEFAULT_BUILDS.inventor, PRESETS['line-p'].rules);
  assert.match(inv, /from pybricks.hubs import InventorHub/);
  assert.match(inv, /ColorSensor\(Port.C\)/);
  const ev3 = modesProgram(DEFAULT_BUILDS.ev3);
  assert.match(ev3, /^#!\/usr\/bin\/env pybricks-micropython/);
  assert.match(ev3, /InfraredSensor\(Port.S4\)/);
  assert.match(bridgeScript('go', 0.3), /c5f50002-8280-46da-89f4-6d8051e4aeef/);
});
