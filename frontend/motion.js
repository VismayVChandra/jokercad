// Moves a mechanism for the motion slider: for a given drive value, finds where
// every part has to be so the parts stay joined at their pins and slides.
//
// Parts move flat in the model's XY plane (pivot axes along Z). Each moving
// part's pose is a turn theta about the model's origin plus a shift (dx, dy),
// measured from where the code built it, so the built pose is drive value 0.
// The poses are found by damped least squares (Levenberg-Marquardt), starting
// from the previous pose so the parts follow one smooth path.

const DEG = Math.PI / 180;
// Weighs turning errors (radians) against position errors (mm): an angle error
// of 1 radian counts like being 20 mm off.
const ANGLE_WEIGHT = 20;
// How far apart (mm) joined points may end up before a pose counts as unreachable.
const TOLERANCE = 0.05;
// Largest drive step solved at once, so a fast drag can't jump the parts onto
// a different way of assembling the same linkage.
const MAX_STEP = 2;

function unit2(v) {
  const length = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / length, v[1] / length];
}

/**
 * spec: the `motion` dict from the part's code. labels: the assembly's part labels.
 * Returns null when the spec doesn't describe any motion of these parts.
 */
export function makeRig(spec, labels) {
  if (!spec || !Array.isArray(labels) || labels.length < 2) return null;
  const known = new Set(labels);
  const host = new Map(labels.map((label) => [label, label]));
  const root = (label) => {
    while (host.get(label) !== label) label = host.get(label);
    return label;
  };
  const join = (child, parent) => {
    if (root(child) !== root(parent)) host.set(root(child), root(parent));
  };

  const ground = known.has(spec.ground) ? spec.ground : labels[0];
  for (const pair of spec.attached || []) {
    if (Array.isArray(pair) && known.has(pair[0]) && known.has(pair[1])) join(pair[0], pair[1]);
  }
  const listed = (spec.joints || []).filter(
    (j) => j && Array.isArray(j.parts) && known.has(j.parts[0]) && known.has(j.parts[1]) && (j.pivot || j.slide)
  );
  // A part no joint moves stays put with the ground.
  const jointed = new Set(listed.flatMap((j) => j.parts.map(root)));
  for (const label of labels) if (!jointed.has(root(label))) join(label, ground);

  const groundRoot = root(ground);
  const bodies = [...new Set(labels.map(root))].filter((body) => body !== groundRoot);
  const index = (label) => (root(label) === groundRoot ? -1 : bodies.indexOf(root(label)));
  const joints = listed
    .map((j) => ({
      a: index(j.parts[0]),
      b: index(j.parts[1]),
      slide: Boolean(j.slide),
      pivot: (j.pivot || [0, 0]).slice(0, 2).map(Number),
      direction: j.slide ? unit2(j.slide.map(Number)) : null,
      drive: Number(j.drive) || 0,
    }))
    .filter((j) => j.a !== j.b && j.pivot.every(Number.isFinite));
  if (!bodies.length || !joints.some((j) => j.drive)) return null;

  const range = (Array.isArray(spec.range) ? spec.range : [-30, 30]).map(Number);
  const low = Math.min(range[0], range[1], 0);
  const high = Math.max(range[0], range[1], 0);
  return {
    labels,
    root,
    bodies,
    joints,
    range: [Number.isFinite(low) ? low : -30, Number.isFinite(high) ? high : 30],
    unit: joints.some((j) => j.drive && j.slide) ? "mm" : "°",
    pose: new Float64Array(3 * bodies.length),
    value: 0,
  };
}

const place = ([theta, dx, dy], [x, y]) => [
  Math.cos(theta) * x - Math.sin(theta) * y + dx,
  Math.sin(theta) * x + Math.cos(theta) * y + dy,
];

// How far every joint is from holding, for poses x at drive value `value`.
function residuals(rig, x, value) {
  const out = [];
  const pose = (k) => (k < 0 ? [0, 0, 0] : [x[3 * k], x[3 * k + 1], x[3 * k + 2]]);
  for (const j of rig.joints) {
    const a = pose(j.a);
    const b = pose(j.b);
    if (!j.slide) {
      // Both parts carry the pivot point to the same place.
      const pa = place(a, j.pivot);
      const pb = place(b, j.pivot);
      out.push(pa[0] - pb[0], pa[1] - pb[1]);
      if (j.drive) out.push((b[0] - a[0] - j.drive * value * DEG) * ANGLE_WEIGHT);
    } else {
      // Same turn, and b only shifts along the slide's direction.
      out.push((b[0] - a[0]) * ANGLE_WEIGHT);
      const c = Math.cos(a[0]);
      const s = Math.sin(a[0]);
      const u = [c * j.direction[0] - s * j.direction[1], s * j.direction[0] + c * j.direction[1]];
      const shift = [b[1] - a[1], b[2] - a[2]];
      out.push(-u[1] * shift[0] + u[0] * shift[1]);
      if (j.drive) out.push(u[0] * shift[0] + u[1] * shift[1] - j.drive * value);
    }
  }
  return out;
}

const worst = (values) => values.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

// Solves A x = b by Gaussian elimination with partial pivoting.
function solveLinear(A, b) {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / A[col][col];
      for (let k = col; k < n; k++) A[row][k] -= factor * A[col][k];
      b[row] -= factor * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) sum -= A[row][k] * x[k];
    x[row] = sum / A[row][row];
  }
  return x;
}

// The pose for `value`, starting from `start`; null if the joints can't all hold there.
function solveAt(rig, start, value) {
  const x = Float64Array.from(start);
  const n = x.length;
  const h = 1e-6;
  let error = residuals(rig, x, value);
  for (let iteration = 0; iteration < 40 && worst(error) > 1e-7; iteration++) {
    const columns = [];
    for (let i = 0; i < n; i++) {
      const saved = x[i];
      x[i] += h;
      columns.push(residuals(rig, x, value).map((v, r) => (v - error[r]) / h));
      x[i] = saved;
    }
    // (JᵀJ + λI) step = -Jᵀ error; the small λ keeps parts that are free to
    // move (not held by any joint) from drifting.
    const A = Array.from({ length: n }, (_, i) =>
      Float64Array.from({ length: n }, (_, k) => columns[i].reduce((sum, v, r) => sum + v * columns[k][r], 0) + (i === k ? 1e-4 : 0))
    );
    const b = Float64Array.from({ length: n }, (_, i) => -columns[i].reduce((sum, v, r) => sum + v * error[r], 0));
    const step = solveLinear(A, b);
    for (let i = 0; i < n; i++) x[i] += step[i];
    error = residuals(rig, x, value);
  }
  return worst(error) <= TOLERANCE ? x : null;
}

/**
 * Moves the rig toward drive value `target` in small steps. Stops at the last
 * reachable pose if the mechanism can't go further; returns whether it got there.
 */
export function moveTo(rig, target) {
  target = Math.min(Math.max(target, rig.range[0]), rig.range[1]);
  const steps = Math.max(1, Math.ceil(Math.abs(target - rig.value) / MAX_STEP));
  const from = rig.value;
  for (let i = 1; i <= steps; i++) {
    const value = from + ((target - from) * i) / steps;
    const pose = solveAt(rig, rig.pose, value);
    if (!pose) return false;
    rig.pose = pose;
    rig.value = value;
  }
  return true;
}

/** The labels that move as body k. */
export function bodyLabels(rig, k) {
  return rig.labels.filter((label) => rig.root(label) === rig.bodies[k]);
}
