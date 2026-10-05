// The robot's brain is data, not code: a rule table, or a set of modes plus a
// decider that picks one. The simulator interprets it here; export.js turns
// the same data into Pybricks Python. Keeping it declarative is what lets one
// definition run in the browser (no eval under the CSP) and on the hub.
//
// Readings `s`: { distance: mm|null, reflection: 0-100|null, color: name|null,
//                 touch: bool|null, heading: degrees }

export const SENSORS = {
  distance: { label: 'Distance (mm)', ops: ['<', '>'] },
  reflection: { label: 'Reflection (0-100)', ops: ['<', '>'] },
  color: { label: 'Colour', ops: ['=='], values: ['black', 'white', 'red', 'green', 'blue', 'yellow'] },
  touch: { label: 'Touch', ops: ['=='], values: ['pressed', 'released'] },
  always: { label: 'Always', ops: [] },
};

// action: drive (left/right %), line (P controller on reflection), stop.
export const PRESETS = {
  bounce: {
    name: 'Bounce off walls', needs: ['distance'],
    rules: [
      { sensor: 'distance', op: '<', value: 220, action: 'drive', left: -35, right: 35, holdMs: 500 },
      { sensor: 'always', action: 'drive', left: 55, right: 55 },
    ],
  },
  bumper: {
    name: 'Bumper reverse', needs: ['touch'],
    rules: [
      { sensor: 'touch', op: '==', value: 'pressed', action: 'drive', left: -45, right: -15, holdMs: 900 },
      { sensor: 'always', action: 'drive', left: 50, right: 50 },
    ],
  },
  'line-bang': {
    name: 'Line follower, on/off', needs: ['reflection'],
    rules: [
      { sensor: 'reflection', op: '<', value: 50, action: 'drive', left: 10, right: 45 },
      { sensor: 'always', action: 'drive', left: 45, right: 10 },
    ],
  },
  'line-p': {
    name: 'Line follower, proportional', needs: ['reflection'],
    rules: [
      { sensor: 'color', op: '==', value: 'red', action: 'stop' },
      { sensor: 'always', action: 'line', base: 40, kp: 1.1, target: 50 },
    ],
  },
};

export function newRule() {
  return { sensor: 'distance', op: '<', value: 200, action: 'drive', left: 0, right: 0, holdMs: 0 };
}

function matches(rule, s) {
  if (rule.sensor === 'always') return true;
  const v = rule.sensor === 'touch' ? (s.touch ? 'pressed' : 'released') : s[rule.sensor];
  if (v === null || v === undefined) return false;
  if (rule.op === '<') return v < Number(rule.value);
  if (rule.op === '>') return v > Number(rule.value);
  return v === rule.value;
}

/** Motor command for one action: { left, right } in percent of max speed. */
export function act(rule, s) {
  if (rule.action === 'stop') return { left: 0, right: 0 };
  if (rule.action === 'line') {
    // Edge following with the dark line on the sensor's right: brighter than
    // the target means drifting off the line, so steer right toward it.
    const err = (s.reflection ?? rule.target) - rule.target;
    const turn = rule.kp * err;
    return { left: rule.base + turn * 0.5, right: rule.base - turn * 0.5 };
  }
  return { left: Number(rule.left), right: Number(rule.right) };
}

/** Rule-table runner with per-rule hold timers. Returns a stateful tick fn. */
export function ruleRunner(rules) {
  let held = null;
  let until = 0;
  return (s, tMs) => {
    if (held && tMs < until) return { cmd: act(held, s), rule: rules.indexOf(held) };
    held = null;
    const i = rules.findIndex((r) => matches(r, s));
    if (i < 0) return { cmd: { left: 0, right: 0 }, rule: -1 };
    const r = rules[i];
    if (r.holdMs > 0) { held = r; until = tMs + Number(r.holdMs); }
    return { cmd: act(r, s), rule: i };
  };
}

// ── Modes and the decider ──────────────────────────────────────

export const MODES = {
  follow_line: { label: 'Follow line', criteria: 'Track the dark line on the floor.', rules: [{ sensor: 'always', action: 'line', base: 40, kp: 1.1, target: 50 }] },
  explore: { label: 'Explore', criteria: 'Drive forward into open space looking for something new.', rules: [{ sensor: 'always', action: 'drive', left: 50, right: 46 }] },
  avoid: { label: 'Avoid', criteria: 'Back off and turn away from an obstacle or a bump.', rules: [{ sensor: 'always', action: 'drive', left: -30, right: 40, holdMs: 700 }] },
  stop: { label: 'Stop', criteria: 'Stay still: the goal is reached or nothing useful can be done.', rules: [{ sensor: 'always', action: 'stop' }] },
};

/**
 * A thin line goes by in a tenth of a second and decisions come every half
 * second, so the hub latches "crossed a line" between reports.
 *
 * Numbers become categories before any model sees them. Comparing numbers is
 * on Jev's documented weak-spot list, so code does the arithmetic and the
 * model only judges what the categories mean for the goal.
 */
export function facts(s, mode, secondsInMode, crossedLine = false) {
  const front = s.distance == null ? 'no distance sensor' : s.distance < 160 ? 'blocked' : s.distance < 420 ? 'obstacle near' : 'clear';
  let floor = 'no colour sensor';
  if (s.reflection != null) floor = s.color === 'red' ? 'red zone' : s.reflection < 35 ? 'dark line' : s.reflection < 65 ? 'line edge' : crossedLine ? 'crossed a line' : 'plain floor';
  return {
    front,
    floor,
    bumper: s.touch == null ? 'no touch sensor' : s.touch ? 'pressed' : 'not pressed',
    current_mode: mode,
    time_in_mode: secondsInMode < 2 ? 'just started' : secondsInMode < 8 ? 'a few seconds' : 'a long time',
  };
}

/** The exact body the bridge would POST to https://api.typesafe.ai/v1/systemone. */
export function jevRequest(goal, f) {
  const criteria = Object.fromEntries(Object.entries(MODES).map(([k, m]) => [k, m.criteria]));
  return {
    model: 'jev-latest',
    state: { goal, robot: f },
    questions: {
      mode: { type: 'choice', instructions: 'Which behaviour should the robot run next to make progress on `goal`, given `robot`?', criteria },
      goal_reached: { type: 'noul', instructions: 'Has the robot achieved `goal`?' },
    },
  };
}

const has = (text, words) => words.some((w) => text.includes(w));

/**
 * Local stand-in for the Jev call, so the loop is testable without a key.
 * Hand-weighted scores through a softmax: it is a rough imitation of the
 * answer shape, not of Jev's judgment, and the UI labels it that way.
 */
export function localDecide(goal, f) {
  const g = goal.toLowerCase();
  const score = { follow_line: 0, explore: 0.4, avoid: 0, stop: 0 };
  // Nothing makes progress through a wall, so blocked outranks every goal word.
  if (f.front === 'blocked') { score.avoid += 5; score.follow_line -= 1; score.explore -= 1; }
  if (f.front === 'obstacle near') score.avoid += 0.8;
  if (f.bumper === 'pressed') score.avoid += 3.5;
  if (['dark line', 'line edge', 'crossed a line'].includes(f.floor)) score.follow_line += 2.2;
  if (has(g, ['line', 'track', 'follow'])) score.follow_line += 1.4;
  if (f.front === 'clear') score.explore += 0.8;
  if (f.floor === 'plain floor') score.explore += 0.6;
  if (has(g, ['explore', 'wander', 'search', 'find'])) score.explore += 1.0;
  if (f.floor === 'red zone' && has(g, ['red', 'stop', 'park', 'reach'])) score.stop += 5;
  // Switching has a cost: give a mode time to settle before abandoning it.
  if (f.current_mode in score && f.current_mode !== 'stop') score[f.current_mode] += f.time_in_mode === 'just started' ? 1.4 : 0.6;
  // Avoid is a manoeuvre, not a destination: once the way is clear, let go.
  if (f.current_mode === 'avoid' && f.front === 'clear') { score.avoid -= 2; score.explore += 0.5; }
  if (f.current_mode === 'avoid' && f.time_in_mode !== 'just started') score.avoid -= 1.5;
  const exps = Object.fromEntries(Object.entries(score).map(([k, v]) => [k, Math.exp(v)]));
  const sum = Object.values(exps).reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(Object.entries(exps).map(([k, v]) => [k, v / sum]));
  const sorted = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  return {
    type: 'choice',
    choice: sorted[0][0],
    probabilities,
    // How far the top option sits above a uniform guess, scaled to 0-1.
    confidence: Math.max(0, (sorted[0][1] - 1 / sorted.length) / (1 - 1 / sorted.length)),
  };
}

/** Confidence-gated switch: below the gate, keep the current mode. */
export function gate(answer, current, minConfidence) {
  return answer.confidence >= minConfidence ? answer.choice : current;
}
