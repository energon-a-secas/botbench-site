// The simulator's loop and canvas. It owns the clock, runs the brain against
// the sensor readings, and paints the world. The UI only hears about it
// through onUpdate, throttled so the panel is not re-rendered every frame.
import { W, H, createWorld, createRobot, sense, stepRobot, mounts } from './sim.js';
import { ruleRunner, MODES, facts, localDecide, gate, jevRequest } from './brain.js';

const STEP = 1 / 60;
const DECIDE_EVERY_MS = 500;

export function createSimView(canvas, { onUpdate }) {
  const ctx = canvas.getContext('2d');
  let world = null, robot = null, brain = null;
  let running = false, speed = 1, tMs = 0, acc = 0, lastFrame = 0, lastEmit = 0;
  let runner = null, modeRunners = {}, mode = 'explore', modeSince = 0, decision = null;
  let reading = null, ruleIdx = -1, cmd = { left: 0, right: 0 }, crossed = false;
  let accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6ee7b7';

  function load({ build, arenaId, brain: b }) {
    world = createWorld(arenaId);
    robot = createRobot(build, world);
    brain = b;
    tMs = 0; acc = 0; modeSince = 0; decision = null; ruleIdx = -1; cmd = { left: 0, right: 0 }; crossed = false;
    runner = b.kind === 'rules' ? ruleRunner(b.rules) : null;
    modeRunners = Object.fromEntries(Object.keys(MODES).map((k) => [k, ruleRunner(MODES[k].rules)]));
    mode = b.startMode || 'explore';
    reading = sense(robot, world);
    resize();
    emit(true);
  }

  function decide() {
    const f = facts(reading, mode, (tMs - modeSince) / 1000, crossed);
    crossed = false;
    const answer = localDecide(brain.goal, f);
    const next = gate(answer, mode, brain.gateMin);
    decision = { facts: f, answer, request: jevRequest(brain.goal, f), switched: next !== mode, gated: next !== answer.choice };
    if (next !== mode) { mode = next; modeSince = tMs; }
  }

  function tick() {
    reading = sense(robot, world);
    if (reading.reflection != null && reading.reflection < 65) crossed = true;
    if (brain.kind === 'rules') {
      const out = runner(reading, tMs);
      cmd = out.cmd; ruleIdx = out.rule;
    } else {
      if (tMs === 0 || Math.floor(tMs / DECIDE_EVERY_MS) !== Math.floor((tMs - STEP * 1000) / DECIDE_EVERY_MS)) decide();
      const out = modeRunners[mode](reading, tMs);
      cmd = out.cmd; ruleIdx = -1;
    }
    stepRobot(robot, cmd, STEP, world);
    tMs += STEP * 1000;
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    acc += dt * speed;
    while (acc >= STEP) { tick(); acc -= STEP; }
    draw();
    emit(false);
    requestAnimationFrame(frame);
  }

  function emit(force) {
    if (!robot) return;
    const now = performance.now();
    if (!force && now - lastEmit < 120) return;
    lastEmit = now;
    onUpdate({ tMs, reading, ruleIdx, cmd, mode, decision, odoMm: robot.odoMm, canDrive: robot.canDrive, running });
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 800;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(((w * H) / W) * dpr);
    draw();
  }

  function draw() {
    if (!world) return;
    const k = canvas.width / W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(world.floor, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#2b3042';
    ctx.strokeStyle = '#11131c';
    ctx.lineWidth = 4;
    for (const o of world.obstacles) { ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeRect(o.x, o.y, o.w, o.h); }
    ctx.strokeStyle = '#11131c';
    ctx.lineWidth = 16;
    ctx.strokeRect(0, 0, W, H);
    if (robot.trail.length > 1) {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 6;
      ctx.beginPath();
      robot.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawRobot(k);
  }

  function drawRobot() {
    const r = robot, m = mounts(r);
    if (r.has.distance && reading?.distance != null) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(m.eye.x, m.eye.y);
      ctx.lineTo(m.eye.x + Math.cos(r.th) * reading.distance, m.eye.y + Math.sin(r.th) * reading.distance);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.th);
    const len = r.radius * 1.8, wid = r.axleMm - 10;
    ctx.fillStyle = '#0b0d14';
    ctx.fillRect(-r.wheelMm / 2, -r.axleMm / 2 - 12, r.wheelMm, 18);
    ctx.fillRect(-r.wheelMm / 2, r.axleMm / 2 - 6, r.wheelMm, 18);
    ctx.fillStyle = r.bumped ? '#fb7185' : accent;
    ctx.strokeStyle = '#0b0d14';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-len * 0.45, -wid / 2, len, wid, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0b0d14';
    ctx.beginPath();
    ctx.moveTo(len * 0.45, 0); ctx.lineTo(len * 0.3, -12); ctx.lineTo(len * 0.3, 12);
    ctx.fill();
    ctx.restore();
    if (r.has.color) {
      ctx.fillStyle = '#f97316';
      ctx.beginPath(); ctx.arc(m.color.x, m.color.y, 9, 0, Math.PI * 2); ctx.fill();
    }
  }

  window.addEventListener('resize', () => { if (world) resize(); });

  return {
    load,
    play() { if (running || !robot.canDrive) return; running = true; lastFrame = 0; requestAnimationFrame(frame); emit(true); },
    pause() { running = false; emit(true); },
    stepOnce() { running = false; for (let i = 0; i < 6; i++) tick(); draw(); emit(true); },
    setSpeed(x) { speed = x; },
    resize() { if (world) resize(); },
    get running() { return running; },
    refreshAccent() { accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accent; draw(); },
  };
}
