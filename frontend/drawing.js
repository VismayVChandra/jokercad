// An engineering drawing of a part as SVG, in millimetres so it prints true to
// scale: front, top and side views with hidden lines dashed, overall sizes,
// centre marks and a table for every hole, the part's parameters, an
// isometric view and a title block.
//
// Edges come from the display mesh: sharp edges (faces meeting at over 30°),
// plus each view's outline of curved surfaces. Whether an edge is hidden is
// read from a depth map of the part rendered from that view.

import * as THREE from "three";

const SHEETS = { A4: [297, 210], A3: [420, 297] };
const SCALES = [10, 5, 4, 2, 1, 1 / 2, 1 / 4, 1 / 5, 1 / 10, 1 / 20, 1 / 50, 1 / 100];
const MARGIN = 10; // sheet edge to border
const GAP = 26; // between views, leaving room for dimensions
const TABLE_WIDTH = 78; // right-hand column for the tables
const TITLE_HEIGHT = 30;
const FEATURE_COS = Math.cos((30 * Math.PI) / 180);
const SMOOTH_COS = Math.cos((25 * Math.PI) / 180);
const DEPTH_PIXELS = 1400; // depth map size along a view's longer side
const INK = "#111";

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

// A view: the direction looked in, and the part directions shown as right and up (Z is up).
function makeView(look, upHint) {
  look = unit3(look);
  const right = unit3(cross3(look, upHint));
  return { look, right, up: cross3(right, look) };
}

const VIEWS = {
  front: makeView([0, 1, 0], [0, 0, 1]),
  top: makeView([0, 0, -1], [0, 1, 0]),
  right: makeView([-1, 0, 0], [0, 0, 1]),
  iso: makeView([-1, 1, -1], [0, 0, 1]),
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (v) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : Number.isInteger(r) ? String(r) : r.toFixed(1);
};
const n2 = (v) => v.toFixed(2);

/* ---------- mesh ---------- */

// All triangles of the part, with coincident corners merged (the display mesh
// isn't welded, and edges need shared corners to find their two faces).
function weld(root) {
  const ids = new Map();
  const positions = [];
  const triangles = [];
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!child.isMesh || !child.visible) return;
    const position = child.geometry.getAttribute("position");
    const index = child.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const corner = [];
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(child.matrixWorld);
        const key = `${Math.round(v.x * 1000)},${Math.round(v.y * 1000)},${Math.round(v.z * 1000)}`;
        let id = ids.get(key);
        if (id === undefined) {
          id = positions.length / 3;
          ids.set(key, id);
          positions.push(v.x, v.y, v.z);
        }
        corner.push(id);
      }
      if (corner[0] !== corner[1] && corner[1] !== corner[2] && corner[0] !== corner[2]) triangles.push(...corner);
    }
  });
  if (!triangles.length) throw new Error("the part has no surfaces to draw");
  return { positions: Float32Array.from(positions), triangles: Uint32Array.from(triangles) };
}

const EDGE_KEY = 4294967296;

// Face normals and areas, and each edge with the faces on either side.
function topology({ positions: P, triangles: T }) {
  const count = T.length / 3;
  const normals = new Float32Array(3 * count);
  const areas = new Float32Array(count);
  const edges = new Map();
  for (let t = 0; t < count; t++) {
    const [a, b, c] = [T[3 * t], T[3 * t + 1], T[3 * t + 2]];
    const u = [P[3 * b] - P[3 * a], P[3 * b + 1] - P[3 * a + 1], P[3 * b + 2] - P[3 * a + 2]];
    const w = [P[3 * c] - P[3 * a], P[3 * c + 1] - P[3 * a + 1], P[3 * c + 2] - P[3 * a + 2]];
    const n = cross3(u, w);
    const length = Math.hypot(n[0], n[1], n[2]);
    areas[t] = length / 2;
    if (length > 0) normals.set([n[0] / length, n[1] / length, n[2] / length], 3 * t);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const key = Math.min(p, q) * EDGE_KEY + Math.max(p, q);
      const faces = edges.get(key);
      if (faces) faces.push(t);
      else edges.set(key, [t]);
    }
  }
  return { normals, areas, edges };
}

const normalOf = (topo, t) => [topo.normals[3 * t], topo.normals[3 * t + 1], topo.normals[3 * t + 2]];

// Edges drawn in every view (sharp or open), and smooth ones that are drawn
// where they outline a curved surface.
function sortEdges(topo) {
  const always = [];
  const smooth = [];
  for (const [key, faces] of topo.edges) {
    const a = Math.floor(key / EDGE_KEY);
    const b = key % EDGE_KEY;
    if (faces.length !== 2) always.push([a, b]);
    else if (dot3(normalOf(topo, faces[0]), normalOf(topo, faces[1])) < FEATURE_COS) always.push([a, b]);
    else smooth.push([a, b, faces[0], faces[1]]);
  }
  return { always, smooth };
}

/* ---------- holes ---------- */

// Round holes: smooth patches whose normals all lie square to one axis and
// point in towards it. Returns their axis, a point on it at mid-length,
// diameter, length, and whether they go right through the part.
function findHoles(mesh, topo) {
  const { positions: P, triangles: T } = mesh;
  const count = T.length / 3;
  const neighbours = Array.from({ length: count }, () => []);
  for (const faces of topo.edges.values()) {
    if (faces.length === 2 && dot3(normalOf(topo, faces[0]), normalOf(topo, faces[1])) > SMOOTH_COS) {
      neighbours[faces[0]].push(faces[1]);
      neighbours[faces[1]].push(faces[0]);
    }
  }
  const seen = new Uint8Array(count);
  const holes = [];
  for (let start = 0; start < count; start++) {
    if (seen[start] || !topo.areas[start]) continue;
    const region = [start];
    seen[start] = 1;
    for (let i = 0; i < region.length; i++) {
      for (const u of neighbours[region[i]]) {
        if (!seen[u]) {
          seen[u] = 1;
          region.push(u);
        }
      }
    }
    if (region.length < 8) continue;
    const normals = region.map((t) => normalOf(topo, t));
    const step = Math.ceil(normals.length / 150);
    const sample = normals.filter((_, i) => i % step === 0);
    // Every cross product of two normals lies along a cylinder's axis.
    let axis = [0, 0, 0];
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j < sample.length; j++) {
        const c = cross3(sample[i], sample[j]);
        const sign = dot3(c, axis) < 0 ? -1 : 1;
        axis = [axis[0] + sign * c[0], axis[1] + sign * c[1], axis[2] + sign * c[2]];
      }
    }
    if (Math.hypot(...axis) < 1e-6) continue;
    axis = unit3(axis);
    if (!normals.every((n) => Math.abs(dot3(n, axis)) < 0.2)) continue;

    // Fit centre and radius: each face centre sits `radius` along its normal
    // (flattened square to the axis) from the axis; a hole's comes out negative.
    const flat = (v) => {
      const d = dot3(v, axis);
      return [v[0] - axis[0] * d, v[1] - axis[1] * d, v[2] - axis[2] * d];
    };
    const centres = region.map((t) =>
      [0, 1, 2].map((c) => (P[3 * T[3 * t] + c] + P[3 * T[3 * t + 1] + c] + P[3 * T[3 * t + 2] + c]) / 3)
    );
    const p = centres.map(flat);
    const n = normals.map((v) => unit3(flat(v)));
    const mean = (list) => list.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]).map((c) => c / list.length);
    const meanP = mean(p);
    const meanN = mean(n);
    let top = 0;
    let bottom = 0;
    p.forEach((v, i) => {
      const dn = [n[i][0] - meanN[0], n[i][1] - meanN[1], n[i][2] - meanN[2]];
      top += dot3([v[0] - meanP[0], v[1] - meanP[1], v[2] - meanP[2]], dn);
      bottom += dot3(dn, dn);
    });
    const radius = bottom > 1e-9 ? top / bottom : 0;
    if (radius >= -0.05) continue;

    const along = region.flatMap((t) => [0, 1, 2].map((k) => dot3([P[3 * T[3 * t + k]], P[3 * T[3 * t + k] + 1], P[3 * T[3 * t + k] + 2]], axis)));
    const low = Math.min(...along);
    const high = Math.max(...along);
    const onAxis = [meanP[0] - meanN[0] * radius, meanP[1] - meanN[1] * radius, meanP[2] - meanN[2] * radius];
    const middle = (low + high) / 2;
    holes.push({
      axis,
      centre: [onAxis[0] + axis[0] * middle, onAxis[1] + axis[1] * middle, onAxis[2] + axis[2] * middle],
      diameter: -2 * radius,
      length: high - low,
    });
  }

  // Through if it spans the whole part along its axis.
  for (const hole of holes) {
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < P.length; i += 3) {
      const d = P[i] * hole.axis[0] + P[i + 1] * hole.axis[1] + P[i + 2] * hole.axis[2];
      low = Math.min(low, d);
      high = Math.max(high, d);
    }
    hole.through = hole.length >= high - low - 0.5;
    const letters = ["X", "Y", "Z"];
    hole.axisName = letters[hole.axis.map(Math.abs).indexOf(Math.max(...hole.axis.map(Math.abs)))];
  }
  holes.sort((a, b) => b.centre[2] - a.centre[2] || a.centre[0] - b.centre[0] || a.centre[1] - b.centre[1]);
  return holes;
}

/* ---------- views ---------- */

const DEPTH_MATERIAL = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  // Depth packed into three 8-bit channels; alpha marks where the part is.
  fragmentShader: `void main() {
    vec3 packed = fract(gl_FragCoord.z * vec3(1.0, 255.0, 65025.0));
    packed -= packed.yzz * vec3(1.0 / 255.0, 1.0 / 255.0, 0.0);
    gl_FragColor = vec4(packed, 1.0);
  }`,
});

function bounds2d(positions, view) {
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity, dMin = Infinity, dMax = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const p = [positions[i], positions[i + 1], positions[i + 2]];
    const u = dot3(p, view.right);
    const v = dot3(p, view.up);
    const d = dot3(p, view.look);
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
    dMin = Math.min(dMin, d); dMax = Math.max(dMax, d);
  }
  return { uMin, uMax, vMin, vMax, dMin, dMax, width: uMax - uMin, height: vMax - vMin };
}

// A depth map of the part seen from `view`, and a test for whether a point
// on the part can be seen.
function depthMap(renderer, geometry, view, box) {
  const pad = Math.max(box.width, box.height) * 0.02 + 0.5;
  const width = box.width + 2 * pad;
  const height = box.height + 2 * pad;
  const pixel = Math.max(width, height) / DEPTH_PIXELS;
  const W = Math.max(16, Math.round(width / pixel));
  const H = Math.max(16, Math.round(height / pixel));
  const depthSpan = box.dMax - box.dMin;
  const margin = Math.max(depthSpan * 0.05, 1);
  const uc = (box.uMin + box.uMax) / 2;
  const vc = (box.vMin + box.vMax) / 2;
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, margin / 2, depthSpan + 2 * margin);
  const eye = [0, 1, 2].map((i) => view.right[i] * uc + view.up[i] * vc + view.look[i] * (box.dMin - margin));
  camera.position.set(...eye);
  camera.up.set(...view.up);
  camera.lookAt(eye[0] + view.look[0], eye[1] + view.look[1], eye[2] + view.look[2]);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, DEPTH_MATERIAL));
  const target = new THREE.WebGLRenderTarget(W, H);
  const clearColor = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const previousTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  const pixels = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(clearColor, clearAlpha);
  target.dispose();

  const depth = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    depth[i] = pixels[4 * i + 3] ? pixels[4 * i] / 255 + pixels[4 * i + 1] / 65025 + pixels[4 * i + 2] / 16581375 : 1;
  }
  // A point is seen when nothing nearer covers it; the 3×3 neighbourhood and
  // the allowance keep edges lying on the surface from hiding themselves.
  const allowance = (2 * pixel) / (depthSpan + 1.5 * margin) + 2e-4;
  const probe = new THREE.Vector3();
  return {
    pixel,
    visible(p) {
      probe.set(p[0], p[1], p[2]).project(camera);
      const x = Math.floor(((probe.x + 1) / 2) * W);
      const y = Math.floor(((probe.y + 1) / 2) * H);
      const d = (probe.z + 1) / 2;
      let farthest = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          farthest = xx < 0 || yy < 0 || xx >= W || yy >= H ? 1 : Math.max(farthest, depth[yy * W + xx]);
          if (farthest === 1) return true;
        }
      }
      return d <= farthest + allowance;
    },
  };
}

// The view's visible and hidden edge segments, in view coordinates (mm).
function traceView(renderer, mesh, geometry, topo, edges, view, withHidden) {
  const box = bounds2d(mesh.positions, view);
  const map = depthMap(renderer, geometry, view, box);
  const P = mesh.positions;
  const point = (i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  const drawn = edges.always.slice();
  for (const [a, b, f1, f2] of edges.smooth) {
    // An outline of a curved surface: one side faces the viewer, the other away.
    if (dot3(normalOf(topo, f1), view.look) * dot3(normalOf(topo, f2), view.look) < 0) drawn.push([a, b]);
  }
  const visible = [];
  const hidden = [];
  for (const [a, b] of drawn) {
    const A = point(a);
    const B = point(b);
    const a2 = [dot3(A, view.right), dot3(A, view.up)];
    const b2 = [dot3(B, view.right), dot3(B, view.up)];
    const lengthPx = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) / map.pixel;
    if (lengthPx < 0.05) continue; // an edge seen end-on
    const samples = Math.min(64, Math.max(1, Math.ceil(lengthPx / 2)));
    let runStart = 0;
    let runVisible = null;
    const finish = (t0, t1, isVisible) => {
      if (!isVisible && !withHidden) return;
      const s = [a2[0] + (b2[0] - a2[0]) * t0, a2[1] + (b2[1] - a2[1]) * t0, a2[0] + (b2[0] - a2[0]) * t1, a2[1] + (b2[1] - a2[1]) * t1];
      (isVisible ? visible : hidden).push(s);
    };
    for (let i = 0; i < samples; i++) {
      const t = (i + 0.5) / samples;
      const seen = map.visible([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
      if (runVisible === null) runVisible = seen;
      else if (seen !== runVisible) {
        const boundary = i / samples;
        finish(runStart, boundary, runVisible);
        runStart = boundary;
        runVisible = seen;
      }
    }
    finish(runStart, 1, runVisible);
  }
  return { box, visible, hidden };
}

/* ---------- sheet ---------- */

function pathOf(segments, place) {
  let d = "";
  for (const [u0, v0, u1, v1] of segments) {
    const [x0, y0] = place(u0, v0);
    const [x1, y1] = place(u1, v1);
    d += `M${n2(x0)} ${n2(y0)}L${n2(x1)} ${n2(y1)}`;
  }
  return d;
}

function arrow(x, y, dx, dy) {
  // A filled arrowhead at (x, y) pointing along (dx, dy).
  const length = 2.6;
  const half = 0.8;
  const bx = x - dx * length;
  const by = y - dy * length;
  return `<path d="M${n2(x)} ${n2(y)}L${n2(bx - dy * half)} ${n2(by + dx * half)}L${n2(bx + dy * half)} ${n2(by - dx * half)}Z" fill="${INK}"/>`;
}

// A horizontal dimension of the span x0..x1, measured from features at yFrom,
// drawn at yAt (above or below).
function horizontalDimension(x0, x1, yFrom, yAt, text) {
  const dir = yAt > yFrom ? 1 : -1;
  return (
    `<path d="M${n2(x0)} ${n2(yFrom + dir * 1.5)}V${n2(yAt + dir * 1.5)}M${n2(x1)} ${n2(yFrom + dir * 1.5)}V${n2(yAt + dir * 1.5)}M${n2(x0)} ${n2(yAt)}H${n2(x1)}" stroke="${INK}" stroke-width="0.18" fill="none"/>` +
    arrow(x0, yAt, -1, 0) +
    arrow(x1, yAt, 1, 0) +
    `<text x="${n2((x0 + x1) / 2)}" y="${n2(yAt - 1)}" font-size="3.2" text-anchor="middle">${esc(text)}</text>`
  );
}

function verticalDimension(y0, y1, xFrom, xAt, text) {
  const dir = xAt > xFrom ? 1 : -1;
  const xm = xAt;
  const ym = (y0 + y1) / 2;
  return (
    `<path d="M${n2(xFrom + dir * 1.5)} ${n2(y0)}H${n2(xAt + dir * 1.5)}M${n2(xFrom + dir * 1.5)} ${n2(y1)}H${n2(xAt + dir * 1.5)}M${n2(xAt)} ${n2(y0)}V${n2(y1)}" stroke="${INK}" stroke-width="0.18" fill="none"/>` +
    arrow(xAt, y0, 0, -1) +
    arrow(xAt, y1, 0, 1) +
    `<text x="${n2(xm - 1)}" y="${n2(ym)}" font-size="3.2" text-anchor="middle" transform="rotate(-90 ${n2(xm - 1)} ${n2(ym)})">${esc(text)}</text>`
  );
}

function scaleText(s) {
  return s >= 1 ? `${fmt(s)}:1` : `1:${fmt(1 / s)}`;
}

function table(x, y, width, title, columns, rows) {
  const rowHeight = 5;
  let out = `<text x="${n2(x)}" y="${n2(y - 1.5)}" font-size="2.8" font-weight="bold">${esc(title)}</text>`;
  const total = rows.length + 1;
  out += `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(width)}" height="${n2(total * rowHeight)}" fill="none" stroke="${INK}" stroke-width="0.25"/>`;
  let cx = x;
  for (const [, w] of columns.slice(0, -1)) {
    cx += w;
    out += `<path d="M${n2(cx)} ${n2(y)}V${n2(y + total * rowHeight)}" stroke="${INK}" stroke-width="0.13"/>`;
  }
  [["header", columns.map(([label]) => label)], ...rows.map((r) => ["row", r])].forEach(([kind, cells], i) => {
    const top = y + i * rowHeight;
    if (i) out += `<path d="M${n2(x)} ${n2(top)}H${n2(x + width)}" stroke="${INK}" stroke-width="0.13"/>`;
    let left = x;
    cells.forEach((cell, j) => {
      out += `<text x="${n2(left + 1.2)}" y="${n2(top + 3.5)}" font-size="2.5"${kind === "header" ? ' font-weight="bold"' : ""}>${esc(cell)}</text>`;
      left += columns[j][1];
    });
  });
  return { svg: out, bottom: y + total * rowHeight };
}

/**
 * info: { renderer, title, project, material, params: [{ name, value, unit }],
 * projection: "first" | "third", sheet: "A4" | "A3", date }
 * root: the part in its own coordinates (mm, Z up). Returns { svg, holes, scale }.
 */
export function buildDrawing(root, info) {
  const mesh = weld(root);
  const topo = topology(mesh);
  const edges = sortEdges(topo);
  const holes = findHoles(mesh, topo);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));

  const views = {};
  for (const name of ["front", "top", "right", "iso"]) {
    views[name] = traceView(info.renderer, mesh, geometry, topo, edges, VIEWS[name], name !== "iso");
  }
  geometry.dispose();

  const [W, H] = SHEETS[info.sheet] || SHEETS.A4;
  const first = info.projection !== "third";
  // First-angle (ISO): the view from the right goes on the left, the top
  // view below the front. Third-angle: right on the right, top above.
  const grid = first
    ? { cells: [["right", "front"], ["iso", "top"]] }
    : { cells: [["top", "iso"], ["front", "right"]] };
  const sizeOf = (name) => [views[name].box.width, views[name].box.height];
  const columnWidth = [0, 1].map((c) => Math.max(...grid.cells.map((row) => (row[c] === "iso" ? 0 : sizeOf(row[c])[0]))));
  const rowHeight = [0, 1].map((r) => Math.max(...grid.cells[r].map((name) => (name === "iso" ? 0 : sizeOf(name)[1]))));

  const area = { x: MARGIN + 6, y: MARGIN + 6, width: W - 2 * MARGIN - TABLE_WIDTH - 16, height: H - 2 * MARGIN - TITLE_HEIGHT - 14 };
  const fits = (s) => (columnWidth[0] + columnWidth[1]) * s + GAP <= area.width && (rowHeight[0] + rowHeight[1]) * s + GAP <= area.height;
  const scale = SCALES.find(fits) || SCALES[SCALES.length - 1];
  const totalWidth = (columnWidth[0] + columnWidth[1]) * scale + GAP;
  const totalHeight = (rowHeight[0] + rowHeight[1]) * scale + GAP;
  const x0 = area.x + (area.width - totalWidth) / 2;
  const y0 = area.y + (area.height - totalHeight) / 2;
  const columnX = [x0, x0 + columnWidth[0] * scale + GAP];
  const rowY = [y0, y0 + rowHeight[0] * scale + GAP];

  const parts = [];
  const frames = {};
  grid.cells.forEach((row, r) =>
    row.forEach((name, c) => {
      const view = views[name];
      let s = scale;
      let x = columnX[c];
      let y = rowY[r];
      let cellW = columnWidth[c] * scale;
      let cellH = rowHeight[r] * scale;
      if (name === "iso") {
        // Fits whatever room the empty corner has, at the drawing scale or smaller.
        cellW = columnWidth[c] * scale;
        cellH = rowHeight[r] * scale;
        s = Math.min(scale, (cellW * 0.9) / (view.box.width || 1), (cellH * 0.9) / (view.box.height || 1));
        x += (cellW - view.box.width * s) / 2;
        y += (cellH - view.box.height * s) / 2;
      } else {
        // Centre smaller views in their cell, keeping front/top and front/side aligned.
        if (name === "top" || (name === "front" && !first) || (name === "front" && first)) x += (cellW - view.box.width * s) / 2;
        if (name !== "top") y += (cellH - view.box.height * s) / 2;
      }
      const place = (u, v) => [x + (u - view.box.uMin) * s, y + (view.box.vMax - v) * s];
      frames[name] = { place, x, y, width: view.box.width * s, height: view.box.height * s, s };
      parts.push(`<path d="${pathOf(view.hidden, place)}" stroke="${INK}" stroke-width="0.18" stroke-dasharray="1.6 0.9" fill="none"/>`);
      parts.push(`<path d="${pathOf(view.visible, place)}" stroke="${INK}" stroke-width="0.35" stroke-linecap="round" fill="none"/>`);
    })
  );
  const iso = frames.iso;
  parts.push(`<text x="${n2(iso.x + iso.width / 2)}" y="${n2(iso.y + iso.height + 5)}" font-size="2.6" text-anchor="middle">ISOMETRIC VIEW${iso.s < scale * 0.999 ? " (not to scale)" : ""}</text>`);

  // Overall sizes, on the sides away from the other views.
  const [sx, sy, sz] = [views.front.box.width, views.top.box.height, views.front.box.height];
  const front = frames.front;
  const top = frames.top;
  const widthY = first ? front.y - 9 : front.y + front.height + 9;
  parts.push(horizontalDimension(front.x, front.x + front.width, first ? front.y : front.y + front.height, widthY, fmt(sx)));
  const heightX = first ? front.x + front.width + 9 : front.x - 9;
  parts.push(verticalDimension(front.y, front.y + front.height, first ? front.x + front.width : front.x, heightX, fmt(sz)));
  const depthX = first ? top.x + top.width + 9 : top.x - 9;
  parts.push(verticalDimension(top.y, top.y + top.height, first ? top.x + top.width : top.x, depthX, fmt(sy)));

  // Holes: centre marks and labels where they show as circles.
  holes.forEach((hole, i) => {
    for (const name of ["front", "top", "right"]) {
      if (Math.abs(dot3(hole.axis, VIEWS[name].look)) < 0.98) continue;
      const frame = frames[name];
      const [cx, cy] = frame.place(dot3(hole.centre, VIEWS[name].right), dot3(hole.centre, VIEWS[name].up));
      const r = (hole.diameter / 2) * frame.s;
      const reach = r + 1.8;
      parts.push(
        `<path d="M${n2(cx - reach)} ${n2(cy)}H${n2(cx + reach)}M${n2(cx)} ${n2(cy - reach)}V${n2(cy + reach)}" stroke="${INK}" stroke-width="0.13" stroke-dasharray="3 0.7 0.7 0.7" fill="none"/>`,
        `<text x="${n2(cx + r * 0.72 + 0.8)}" y="${n2(cy - r * 0.72 - 0.8)}" font-size="2.6" font-weight="bold">H${i + 1}</text>`
      );
    }
  });

  // Tables down the right-hand side.
  const tableX = W - MARGIN - TABLE_WIDTH - 3;
  let tableY = MARGIN + 9;
  const params = (info.params || []).slice(0, 14);
  if (params.length) {
    const t = table(tableX, tableY, TABLE_WIDTH, "PARAMETERS", [["NAME", 50], ["VALUE", 28]], params.map((p) => [p.name, `${fmt(p.value)}${p.unit ? ` ${p.unit}` : ""}`]));
    parts.push(t.svg);
    tableY = t.bottom + 9;
  }
  if (holes.length) {
    const rows = holes.slice(0, 14).map((h, i) => [
      `H${i + 1}`,
      h.axisName,
      fmt(h.centre[0]),
      fmt(h.centre[1]),
      fmt(h.centre[2]),
      fmt(h.diameter),
      h.through ? "THRU" : fmt(h.length),
    ]);
    const t = table(tableX, tableY, TABLE_WIDTH, "HOLES", [["HOLE", 10], ["AXIS", 9], ["X", 12], ["Y", 12], ["Z", 12], ["Ø", 10], ["DEPTH", 13]], rows);
    parts.push(t.svg);
    if (holes.length > 14) parts.push(`<text x="${n2(tableX)}" y="${n2(t.bottom + 4)}" font-size="2.4">+ ${holes.length - 14} more holes</text>`);
  }

  // Title block, bottom right.
  const tb = { x: W - MARGIN - 182, y: H - MARGIN - TITLE_HEIGHT, w: 182, h: TITLE_HEIGHT };
  const cell = (x, y, w, h, label, value, size = 3) =>
    `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="none" stroke="${INK}" stroke-width="0.25"/>` +
    `<text x="${n2(x + 1.2)}" y="${n2(y + 2.6)}" font-size="1.9" fill="#555">${esc(label)}</text>` +
    `<text x="${n2(x + 1.2)}" y="${n2(y + h - 2)}" font-size="${size}"${size > 3 ? ' font-weight="bold"' : ""}>${esc(value)}</text>`;
  const today = new Date();
  const date = info.date || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  parts.push(
    cell(tb.x, tb.y, 122, 12, "TITLE", info.title || "Part", 5),
    cell(tb.x + 122, tb.y, 60, 12, "DRAWN WITH", "jokercad", 3.4),
    cell(tb.x, tb.y + 12, 70, 9, "PROJECT", info.project || ""),
    cell(tb.x + 70, tb.y + 12, 52, 9, "MATERIAL", info.material || ""),
    cell(tb.x + 122, tb.y + 12, 60, 9, "SCALE", scaleText(scale)),
    cell(tb.x, tb.y + 21, 30, 9, "UNITS", "mm"),
    cell(tb.x + 30, tb.y + 21, 62, 9, "PROJECTION", first ? "FIRST ANGLE" : "THIRD ANGLE"),
    cell(tb.x + 92, tb.y + 21, 50, 9, "DATE", date),
    cell(tb.x + 142, tb.y + 21, 40, 9, "SHEET", info.sheet || "A4")
  );
  // Two short lines, clear of the title block.
  parts.push(
    `<text x="${n2(MARGIN + 4)}" y="${n2(H - MARGIN - 7.5)}" font-size="2.4">Dimensions in mm. Hidden edges dashed.</text>`,
    `<text x="${n2(MARGIN + 4)}" y="${n2(H - MARGIN - 4)}" font-size="2.4">Untoleranced sizes ±0.2 mm. Holes in part coordinates.</text>`
  );

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif" fill="${INK}">` +
    `<rect width="${W}" height="${H}" fill="#fff"/>` +
    `<rect x="${MARGIN}" y="${MARGIN}" width="${W - 2 * MARGIN}" height="${H - 2 * MARGIN}" fill="none" stroke="${INK}" stroke-width="0.5"/>` +
    parts.join("") +
    "</svg>";
  return { svg, holes, scale };
}

/**
 * A DXF (R12/AC1009, millimetres) of the outline seen from one view — for
 * laser- or CNC-cutting a flat or mostly-flat part. Only the visible lines
 * from that view go in (no hidden lines, no dimensions): the outer profile
 * plus any holes or slots that show as closed loops from that direction.
 * info: { renderer, view: "top" | "front" | "right" } (default "top", the
 * usual way a flat part sits for cutting).
 */
export function buildDxf(root, info) {
  const mesh = weld(root);
  const topo = topology(mesh);
  const edges = sortEdges(topo);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));

  const view = VIEWS[info.view] || VIEWS.top;
  const { box, visible } = traceView(info.renderer, mesh, geometry, topo, edges, view, false);
  geometry.dispose();
  if (!visible.length) throw new Error("Nothing is visible from that side — try a different view.");

  const d = (v) => (Math.round(v * 1000) / 1000).toString();
  const entities = visible
    .map(([x0, y0, x1, y1]) => `0\nLINE\n8\n0\n10\n${d(x0)}\n20\n${d(y0)}\n30\n0\n11\n${d(x1)}\n21\n${d(y1)}\n31\n0\n`)
    .join("");
  const dxf =
    "0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n" + // 4 = millimetres
    `0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
  return { dxf, size: [box.width, box.height], segments: visible.length };
}
