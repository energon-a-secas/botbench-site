// The build: which hub, what is plugged into each port, and the drive
// geometry. Everything downstream (simulator, exporter, project fit) reads a
// build through these functions, never by poking at ports directly.
import { HUBS, DEVICES, KITS, ARCHETYPES } from './catalog.js';

export const DEFAULT_BUILDS = {
  inventor: {
    hub: 'inventor', wheelMm: 56, axleMm: 112,
    ports: { A: 'medium-angular', B: 'medium-angular', C: 'color-lpf2', D: 'distance', E: null, F: null },
    left: 'A', right: 'B',
  },
  ev3: {
    hub: 'ev3', wheelMm: 43, axleMm: 120,
    ports: { A: null, B: 'large-ev3', C: 'large-ev3', D: 'medium-ev3', S1: 'touch-ev3', S2: null, S3: 'color-ev3', S4: 'ir-ev3' },
    left: 'B', right: 'C',
  },
};

export function cloneBuild(b) {
  return { ...b, ports: { ...b.ports } };
}

/** Devices available from the kits the visitor owns, as { deviceId: count }. */
export function inventory(owned) {
  const inv = {};
  for (const kitId of owned) {
    for (const [dev, n] of Object.entries(KITS[kitId].devices)) inv[dev] = (inv[dev] || 0) + n;
  }
  return inv;
}

/** Devices that may go in a given port of a given hub. */
export function devicesForPort(hubId, port) {
  const hub = HUBS[hubId];
  const kind = hub.portKind[port];
  return Object.entries(DEVICES)
    .filter(([, d]) => d.family === hub.family && (kind === 'any' || d.kind === kind))
    .map(([id]) => id);
}

export function motorPorts(build) {
  return Object.entries(build.ports).filter(([, d]) => d && DEVICES[d].kind === 'motor').map(([p]) => p);
}

/** First port carrying a sensor with this sense, or null. */
export function sensorPort(build, sense) {
  const hit = Object.entries(build.ports).find(([, d]) => d && DEVICES[d].sense === sense);
  return hit ? hit[0] : null;
}

/** Count what the build can do: motors and each sensing ability. */
export function capabilities(build) {
  const caps = { motor: 0, color: 0, distance: 0, touch: 0 };
  for (const d of Object.values(build.ports)) {
    if (!d) continue;
    const dev = DEVICES[d];
    if (dev.kind === 'motor') caps.motor++;
    else caps[dev.sense]++;
  }
  return caps;
}

export function meets(needs, caps) {
  return Object.entries(needs).every(([k, n]) => (caps[k] || 0) >= n);
}

/** Problems with a build, each { level: 'error'|'warn', text }. */
export function validate(build, owned) {
  const out = [];
  const hub = HUBS[build.hub];
  if (!owned.includes(hub.kit)) out.push({ level: 'error', text: `The ${hub.name} comes in ${hub.kit}, which is not in your kits.` });
  const inv = inventory(owned);
  const used = {};
  for (const [port, d] of Object.entries(build.ports)) {
    if (!d) continue;
    const dev = DEVICES[d];
    used[d] = (used[d] || 0) + 1;
    if (dev.family !== hub.family) out.push({ level: 'error', text: `Port ${port}: the ${dev.name} uses the ${dev.family} connector and will not plug into the ${hub.name}.` });
    const kind = hub.portKind[port];
    if (kind !== 'any' && kind !== dev.kind) out.push({ level: 'error', text: `Port ${port} is a ${kind} port; the ${dev.name} is a ${dev.kind}.` });
  }
  for (const [d, n] of Object.entries(used)) {
    const have = inv[d] || 0;
    if (n > have) out.push({ level: 'error', text: `${n} x ${DEVICES[d].name} assigned, your kits have ${have}.` });
  }
  const motors = motorPorts(build);
  if (motors.length >= 2 && (!motors.includes(build.left) || !motors.includes(build.right) || build.left === build.right)) {
    out.push({ level: 'warn', text: 'Pick two different motor ports for the left and right wheels.' });
  }
  if (motors.length < 2) out.push({ level: 'warn', text: 'Fewer than two motors: the simulator needs a drive pair to move.' });
  if (!(build.wheelMm > 10 && build.wheelMm < 200)) out.push({ level: 'warn', text: 'Wheel diameter looks off; measure the tyre in millimetres.' });
  if (!(build.axleMm > 40 && build.axleMm < 400)) out.push({ level: 'warn', text: 'Axle track looks off; it is the distance between the two tyre contact points.' });
  return out;
}

/** Keep left/right pointing at real motor ports after the ports change. */
export function repairDrive(build) {
  const motors = motorPorts(build);
  if (!motors.includes(build.left)) build.left = motors.find((p) => p !== build.right) || null;
  if (!motors.includes(build.right) || build.right === build.left) build.right = motors.find((p) => p !== build.left) || null;
}

/** Ways to place `needs` into a hub's ports (ordered: which port holds which part). */
function layouts(hubId, needs) {
  const hub = HUBS[hubId];
  const kinds = hub.ports.map((p) => hub.portKind[p]);
  const req = [];
  for (const [k, n] of Object.entries(needs)) for (let i = 0; i < n; i++) req.push(k === 'motor' ? 'motor' : 'sensor');
  // Count injective assignments of required slots to compatible ports.
  const count = (i, taken) => {
    if (i === req.length) return 1;
    let total = 0;
    kinds.forEach((kind, j) => {
      if (taken & (1 << j)) return;
      if (kind === 'any' || kind === req[i]) total += count(i + 1, taken | (1 << j));
    });
    return total;
  };
  return count(0, 0);
}

/** Capabilities a hub could reach using only the kit devices of its own family. */
function reach(hubId, owned) {
  const hub = HUBS[hubId];
  const inv = inventory(owned);
  const caps = { motor: 0, color: 0, distance: 0, touch: 0 };
  for (const [d, n] of Object.entries(inv)) {
    const dev = DEVICES[d];
    if (dev.family !== hub.family) continue;
    if (dev.kind === 'motor') caps.motor += n; else caps[dev.sense] += n;
  }
  return { caps };
}

/**
 * The combination matrix: every archetype against each hub you own, plus the
 * two-robot option when both kits are present. A cell says whether it builds,
 * what is missing, and how many distinct port layouts exist.
 */
export function combinationMatrix(owned) {
  const hubs = Object.values(HUBS).filter((h) => owned.includes(h.kit));
  return ARCHETYPES.map((a) => {
    const cells = hubs.map((h) => {
      const r = reach(h.id, owned);
      const missing = Object.entries(a.needs).filter(([k, n]) => r.caps[k] < n).map(([k, n]) => `${n - r.caps[k]} ${k}`);
      return { hub: h.id, ok: missing.length === 0, missing, layouts: missing.length ? 0 : layouts(h.id, a.needs) };
    });
    return { archetype: a, cells };
  });
}
