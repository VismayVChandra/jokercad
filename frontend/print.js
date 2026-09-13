// 3D-print checks on a triangle mesh in print position: millimetres, Z up.
// tris: a Float32Array with 9 numbers (three corners) per triangle.

// Faces tilted down more than 45° from vertical need support underneath.
const OVERHANG = Math.cos(Math.PI / 4);
// Faces within this height (mm) of the lowest point rest on the bed.
const BED_GAP = 0.3;
// The thinnest wall a 0.4 mm nozzle prints reliably: two lines.
export const MIN_WALL = 0.8;
// Wall-thickness rays × triangles tested at most, to keep the check quick.
const RAY_BUDGET = 3e7;

function measureTriangles(tris) {
  const n = tris.length / 9;
  const normals = new Float32Array(3 * n);
  const areas = new Float32Array(n);
  let signedVolume = 0;
  for (let t = 0; t < n; t++) {
    const o = 9 * t;
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.subarray(o, o + 9);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    areas[t] = length / 2;
    if (length > 0) {
      normals[3 * t] = nx / length;
      normals[3 * t + 1] = ny / length;
      normals[3 * t + 2] = nz / length;
    }
    signedVolume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  // A mesh wound the other way round has its normals pointing inwards.
  const inward = signedVolume < 0;
  if (inward) for (let i = 0; i < normals.length; i++) normals[i] = -normals[i];
  return { n, normals, areas, volume: Math.abs(signedVolume), inward };
}

function bounds(tris) {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      low[k] = Math.min(low[k], tris[i + k]);
      high[k] = Math.max(high[k], tris[i + k]);
    }
  }
  return [low, high];
}

// Distance along `dir` from `origin` to the nearest triangle other than `skip`
// (Möller–Trumbore), or Infinity.
function rayDistance(tris, n, origin, dir, skip) {
  let best = Infinity;
  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = dir;
  for (let t = 0; t < n; t++) {
    if (t === skip) continue;
    const o = 9 * t;
    const ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
    const e1x = tris[o + 3] - ax, e1y = tris[o + 4] - ay, e1z = tris[o + 5] - az;
    const e2x = tris[o + 6] - ax, e2y = tris[o + 7] - ay, e2z = tris[o + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const sx = ox - ax, sy = oy - ay, sz = oz - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (d > 1e-4 && d < best) best = d;
  }
  return best;
}

/**
 * Size, volume, surface area, overhangs (and their triangles), bed contact
 * and, with walls, thin spots sampled evenly over the surface.
 */
export function analyzePrint(tris, { walls = true } = {}) {
  const { n, normals, areas, volume } = measureTriangles(tris);
  const [low, high] = bounds(tris);
  let area = 0;
  let overhangArea = 0;
  let overhangMoment = 0;
  let contactArea = 0;
  const overhang = [];
  for (let t = 0; t < n; t++) {
    const a = areas[t];
    area += a;
    if (normals[3 * t + 2] >= -OVERHANG) continue;
    const o = 9 * t;
    const top = Math.max(tris[o + 2], tris[o + 5], tris[o + 8]);
    if (top - low[2] <= BED_GAP) {
      contactArea += a;
    } else {
      overhangArea += a;
      overhangMoment += a * ((tris[o + 2] + tris[o + 5] + tris[o + 8]) / 3 - low[2]);
      overhang.push(t);
    }
  }

  // Wall thickness: from just inside a point on the surface, straight inwards
  // to the wall opposite.
  const thin = [];
  let thinnest = Infinity;
  const samples = walls ? Math.min(1500, Math.floor(RAY_BUDGET / Math.max(n, 1))) : 0;
  if (samples > 0 && area > 0) {
    const cumulative = new Float64Array(n);
    let running = 0;
    for (let t = 0; t < n; t++) cumulative[t] = running += areas[t];
    for (let k = 0; k < samples; k++) {
      const target = ((k + 0.5) / samples) * running;
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cumulative[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      const t = lo;
      if (!areas[t]) continue;
      const o = 9 * t;
      const centre = [0, 1, 2].map((c) => (tris[o + c] + tris[o + 3 + c] + tris[o + 6 + c]) / 3);
      const dir = [-normals[3 * t], -normals[3 * t + 1], -normals[3 * t + 2]];
      const origin = centre.map((c, i) => c + dir[i] * 1e-3);
      const d = rayDistance(tris, n, origin, dir, t);
      if (!Number.isFinite(d)) continue;
      thinnest = Math.min(thinnest, d);
      if (d < MIN_WALL) thin.push({ point: centre, thickness: d });
    }
  }

  return {
    size: [0, 1, 2].map((k) => high[k] - low[k]),
    low,
    volume,
    area,
    overhangArea,
    overhangHeight: overhangArea ? overhangMoment / overhangArea : 0,
    contactArea,
    overhang,
    thin,
    thinnest,
  };
}

const normalize = (v) => {
  const length = Math.hypot(...v) || 1;
  return v.map((c) => c / length);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Row-major 3x3 rotation by `angle` about unit `axis`.
function rotationAbout([x, y, z], angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const C = 1 - c;
  return [
    c + x * x * C, x * y * C - z * s, x * z * C + y * s,
    y * x * C + z * s, c + y * y * C, y * z * C - x * s,
    z * x * C - y * s, z * y * C + x * s, c + z * z * C,
  ];
}

// The rotation turning unit vector a onto unit vector b.
function rotationTo(a, b) {
  a = normalize(a);
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (c > 1 - 1e-9) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (c < -1 + 1e-9) {
    const other = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return rotationAbout(normalize(cross(a, other)), Math.PI);
  }
  const v = cross(a, b);
  const s = Math.hypot(...v);
  return rotationAbout(v.map((x) => x / s), Math.atan2(s, c));
}

export function rotateTriangles(tris, R) {
  const out = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i], y = tris[i + 1], z = tris[i + 2];
    out[i] = R[0] * x + R[1] * y + R[2] * z;
    out[i + 1] = R[3] * x + R[4] * y + R[5] * z;
    out[i + 2] = R[6] * x + R[7] * y + R[8] * z;
  }
  return out;
}

/**
 * The rotation (row-major 3x3) that puts the part in its best printing
 * position: least area needing support, then the most area on the bed and a
 * low height. Tries each axis and each large flat face as the one facing down.
 */
export function bestOrientation(tris) {
  const { n, normals, areas } = measureTriangles(tris);
  const faces = new Map();
  for (let t = 0; t < n; t++) {
    const normal = [normals[3 * t], normals[3 * t + 1], normals[3 * t + 2]];
    const key = normal.map((c) => Math.round(c * 20)).join(",");
    const face = faces.get(key) || { area: 0, normal: [0, 0, 0] };
    face.area += areas[t];
    face.normal = face.normal.map((c, i) => c + normal[i] * areas[t]);
    faces.set(key, face);
  }
  const flats = [...faces.values()].sort((a, b) => b.area - a.area).slice(0, 6).map((f) => normalize(f.normal));
  const candidates = [[0, 0, -1], [0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], ...flats];

  let best = null;
  for (const down of candidates) {
    const rotation = rotationTo(down, [0, 0, -1]);
    const r = analyzePrint(rotateTriangles(tris, rotation), { walls: false });
    const score = r.overhangArea - 0.25 * r.contactArea + 0.02 * r.size[2] * Math.sqrt(r.area);
    // The current position comes first and wins ties, so a good part isn't turned for nothing.
    if (!best || score < best.score - 1e-6) best = { score, rotation };
  }
  return best;
}

/* ---------- 3MF export ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// An uncompressed ("stored") zip of the given files.
function zipStore(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(12, 33, true); // 1 Jan 1980
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(14, 33, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    directory.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directorySize = directory.reduce((sum, p) => sum + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...directory, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A 3MF file of the mesh, standing on the bed with its middle at `centre` (x, y). */
export function make3mf(tris, centre) {
  const [low, high] = bounds(tris);
  const shift = [centre[0] - (low[0] + high[0]) / 2, centre[1] - (low[1] + high[1]) / 2, -low[2]];
  const { inward } = measureTriangles(tris);
  const index = new Map();
  const vertices = [];
  const triangles = [];
  for (let t = 0; t < tris.length / 9; t++) {
    const ids = [0, 1, 2].map((k) => {
      const xyz = [0, 1, 2].map((c) => (tris[9 * t + 3 * k + c] + shift[c]).toFixed(4));
      const key = xyz.join(",");
      if (!index.has(key)) {
        index.set(key, vertices.length);
        vertices.push(`<vertex x="${xyz[0]}" y="${xyz[1]}" z="${xyz[2]}"/>`);
      }
      return index.get(key);
    });
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue;
    // 3MF wants every triangle wound counter-clockwise seen from outside.
    const [a, b, c] = inward ? [ids[0], ids[2], ids[1]] : ids;
    triangles.push(`<triangle v1="${a}" v2="${b}" v3="${c}"/>`);
  }
  const model =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">' +
    `<resources><object id="1" type="model"><mesh><vertices>${vertices.join("")}</vertices>` +
    `<triangles>${triangles.join("")}</triangles></mesh></object></resources>` +
    '<build><item objectid="1"/></build></model>';
  const encoder = new TextEncoder();
  return zipStore([
    {
      name: "[Content_Types].xml",
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
      ),
    },
    {
      name: "_rels/.rels",
      data: encoder.encode(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
      ),
    },
    { name: "3D/3dmodel.model", data: encoder.encode(model) },
  ]);
}
