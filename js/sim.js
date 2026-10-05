// A 2D top-down world in millimetres, a differential-drive robot, and the
// sensor models. No drawing here: simview.js owns the canvas and the loop.
import { DEVICES } from './catalog.js';
import { motorPorts, sensorPort } from './build.js';

export const W = 2000;
export const H = 1200;
const RASTER = 0.5; // floor pixels per mm
const MAX_DEG_S = 900; // motor speed at 100 %, close to both kits' drive motors unloaded

const FLOOR = '#e4e4de';
const PALETTE = {
  black: [24, 24, 28], white: [235, 235, 230], red: [214, 52, 48],
  green: [42, 168, 92], blue: [44, 102, 208], yellow: [238, 198, 44],
};

const oval = (ctx) => {
  ctx.strokeStyle = '#18181c';
  ctx.lineWidth = 22 * RASTER;
  ctx.beginPath();
  ctx.ellipse(1000 * RASTER, 600 * RASTER, 700 * RASTER, 380 * RASTER, 0, 0, Math.PI * 2);
  ctx.stroke();
};
const patch = (ctx, color, x, y, w, h) => {
  ctx.fillStyle = color;
  ctx.fillRect(x * RASTER, y * RASTER, w * RASTER, h * RASTER);
};

export const ARENAS = {
  oval: {
    name: 'Oval line track',
    note: 'A dark oval on a light floor, with a red patch on the far side.',
    paint: (ctx) => { oval(ctx); patch(ctx, '#d63430', 955, 175, 90, 90); },
    obstacles: [],
    start: { x: 288, y: 640, th: -Math.PI / 2 },
  },
  room: {
    name: 'Room with obstacles',
    note: 'Walls and boxes, coloured zones in two corners. No line.',
    paint: (ctx) => {
      patch(ctx, '#2ca85c', 1650, 60, 300, 260);
      patch(ctx, '#d63430', 60, 880, 300, 260);
    },
    obstacles: [
      { x: 620, y: 260, w: 220, h: 160 }, { x: 1180, y: 640, w: 260, h: 200 },
      { x: 520, y: 760, w: 140, h: 140 }, { x: 1500, y: 420, w: 120, h: 300 },
    ],
    start: { x: 220, y: 200, th: 0.25 },
  },
  mixed: {
    name: 'Line, boxes and a goal',
    note: 'The oval with a box sitting on the line before the red goal. Built for mode switching.',
    paint: (ctx) => { oval(ctx); patch(ctx, '#d63430', 955, 175, 90, 90); },
    obstacles: [{ x: 440, y: 290, w: 120, h: 100 }, { x: 1150, y: 560, w: 180, h: 140 }],
    start: { x: 288, y: 640, th: -Math.PI / 2 },
  },
};

export function createWorld(arenaId) {
  const arena = ARENAS[arenaId] || ARENAS.oval;
  const canvas = document.createElement('canvas');
  canvas.width = W * RASTER;
  canvas.height = H * RASTER;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = FLOOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  arena.paint(ctx);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { id: arenaId, arena, floor: canvas, pixels, obstacles: arena.obstacles };
}

function rgbAt(world, x, y) {
  const w = world.floor.width;
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const px = Math.round(x * RASTER) + dx, py = Math.round(y * RASTER) + dy;
      if (px < 0 || py < 0 || px >= w || py >= world.floor.height) continue;
      const i = (py * w + px) * 4;
      r += world.pixels[i]; g += world.pixels[i + 1]; b += world.pixels[i + 2]; n++;
    }
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}

function nearestColor([r, g, b]) {
  // Greys (the line's soft edge) have no hue: call them by brightness, the
  // way a real sensor reads black or white there rather than a colour.
  if (Math.max(r, g, b) - Math.min(r, g, b) < 60) return (r + g + b) / 3 < 110 ? 'black' : 'white';
  let best = 'white', bestD = Infinity;
  for (const [name, [pr, pg, pb]] of Object.entries(PALETTE)) {
    if (name === 'black' || name === 'white') continue;
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

const inRect = (x, y, o, pad = 0) => x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad;

function solidAt(world, x, y, pad = 0) {
  if (x < pad || y < pad || x > W - pad || y > H - pad) return true;
  return world.obstacles.some((o) => inRect(x, y, o, pad));
}

export function createRobot(build, world) {
  const s = world.arena.start;
  const motors = motorPorts(build);
  return {
    x: s.x, y: s.y, th: s.th,
    wheelMm: build.wheelMm, axleMm: build.axleMm,
    radius: build.axleMm / 2 + 14,
    canDrive: motors.includes(build.left) && motors.includes(build.right) && build.left !== build.right,
    has: {
      color: !!sensorPort(build, 'color'),
      distance: !!sensorPort(build, 'distance'),
      touch: !!sensorPort(build, 'touch'),
    },
    rangeMm: sensorPort(build, 'distance') ? DEVICES[build.ports[sensorPort(build, 'distance')]].rangeMm : 0,
    bumped: false,
    trail: [],
    odoMm: 0,
  };
}

/** Sensor mount points in world coordinates. */
export function mounts(r) {
  const c = Math.cos(r.th), s = Math.sin(r.th);
  const at = (fwd) => ({ x: r.x + c * fwd, y: r.y + s * fwd });
  return { color: at(r.radius * 0.55), eye: at(r.radius * 0.8), bumper: at(r.radius + 6) };
}

function ray(world, x, y, th, max) {
  const c = Math.cos(th), s = Math.sin(th);
  for (let d = 0; d <= max; d += 5) {
    if (solidAt(world, x + c * d, y + s * d)) return d;
  }
  return max;
}

export function sense(r, world) {
  const m = mounts(r);
  const out = { distance: null, reflection: null, color: null, touch: null, heading: Math.round((r.th * 180) / Math.PI) };
  if (r.has.color) {
    const rgb = rgbAt(world, m.color.x, m.color.y);
    const lum = (0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]) / 255;
    out.reflection = Math.round(4 + lum * 88);
    out.color = nearestColor(rgb);
  }
  if (r.has.distance) {
    const d = ray(world, m.eye.x, m.eye.y, r.th, r.rangeMm);
    // The IR sensor reports relative proximity 0-100, not millimetres; the
    // decider and rules work in mm, so keep mm and note the scale in export.
    out.distance = Math.round(d);
  }
  if (r.has.touch) out.touch = r.bumped;
  return out;
}

/** Advance the robot by dt seconds under a { left, right } percent command. */
export function stepRobot(r, cmd, dt, world) {
  if (!r.canDrive) return;
  const clampPct = (v) => Math.max(-100, Math.min(100, v || 0));
  const mmPerDeg = (Math.PI * r.wheelMm) / 360;
  const vl = (clampPct(cmd.left) / 100) * MAX_DEG_S * mmPerDeg;
  const vr = (clampPct(cmd.right) / 100) * MAX_DEG_S * mmPerDeg;
  const v = (vl + vr) / 2;
  // y grows downward, so a faster left wheel turns clockwise on screen: +th.
  const th = r.th + ((vl - vr) / r.axleMm) * dt;
  const nx = r.x + Math.cos(th) * v * dt;
  const ny = r.y + Math.sin(th) * v * dt;
  const hit = solidAt(world, nx, ny, r.radius);
  r.th = th;
  if (!hit) {
    r.odoMm += Math.abs(v * dt);
    r.x = nx; r.y = ny;
  }
  const b = mounts(r).bumper;
  r.bumped = hit || solidAt(world, b.x, b.y);
  const last = r.trail[r.trail.length - 1];
  if (!last || Math.hypot(last.x - r.x, last.y - r.y) > 8) {
    r.trail.push({ x: r.x, y: r.y });
    if (r.trail.length > 900) r.trail.shift();
  }
}
