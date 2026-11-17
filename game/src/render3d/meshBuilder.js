// Builds indexed triangle meshes in the renderer's packed vertex layout. A builder carries the
// current colours, material and an optional rigid transform (position + yaw/pitch/roll), and
// offers quads, boxes, prisms, tubes and fans; the city, vehicles, people and effects are all made
// from these. Local frames use +X forward, +Y up, +Z right, matching the simulation's angles.
import { STRIDE } from './glContext.js';

/** Material ids understood by the shaders (a_mat.x). */
export const MAT = {
  PLAIN: 0, FACADE: 1, EMIT: 2, SIGN: 3, GLASS: 4, FOLIAGE: 5, POOL: 6, PAINT: 7, METAL: 8,
};


export class MeshBuilder {
  constructor(vcap = 4096, icap = 8192) {
    this.alloc(vcap, icap);
    this.vcount = 0;
    this.icount = 0;
    this.c = [255, 255, 255, 255];
    this.c2 = [0, 0, 0, 0];
    this.m = [0, 0, 0, 0];
    this.x = null;
  }

  alloc(vcap, icap) {
    const old = this.bytes;
    const oldI = this.indices;
    this.vcap = vcap;
    this.bytes = new Uint8Array(vcap * STRIDE);
    if (old) this.bytes.set(old.subarray(0, Math.min(old.length, this.bytes.length)));
    this.f32 = new Float32Array(this.bytes.buffer);
    this.i8 = new Int8Array(this.bytes.buffer);
    this.icap = icap;
    this.indices = new Uint32Array(icap);
    if (oldI) this.indices.set(oldI.subarray(0, Math.min(oldI.length, icap)));
  }

  reset() {
    this.vcount = 0;
    this.icount = 0;
    this.x = null;
    return this;
  }

  /** Current colour (0..1 floats; a is shader-specific: opacity, glow...). */
  color(r, g, b, a = 1) {
    this.c[0] = clampByte(r * 255);
    this.c[1] = clampByte(g * 255);
    this.c[2] = clampByte(b * 255);
    this.c[3] = clampByte(a * 255);
    return this;
  }

  /** Colour from an [r, g, b] 0..255 triple, scaled by k. */
  rgb(c, k = 1, a = 1) {
    return this.color((c[0] / 255) * k, (c[1] / 255) * k, (c[2] / 255) * k, a);
  }

  color2(r, g, b, a = 1) {
    this.c2[0] = clampByte(r * 255);
    this.c2[1] = clampByte(g * 255);
    this.c2[2] = clampByte(b * 255);
    this.c2[3] = clampByte(a * 255);
    return this;
  }

  /** Material id and three byte parameters. */
  mat(id, p1 = 0, p2 = 0, p3 = 0) {
    this.m[0] = id;
    this.m[1] = clampByte(p1);
    this.m[2] = clampByte(p2);
    this.m[3] = clampByte(p3);
    return this;
  }

  /** Rigid transform for following geometry (from frame()), or null for world space. */
  xform(x) {
    this.x = x;
    return this;
  }

  ensure(nv, ni) {
    if (this.vcount + nv > this.vcap || this.icount + ni > this.icap) {
      this.alloc(Math.max(this.vcap * 2, this.vcount + nv + 1024), Math.max(this.icap * 2, this.icount + ni + 2048));
    }
  }

  vert(x, y, z, nx, ny, nz, u = 0, v = 0) {
    const t = this.x;
    if (t) {
      const qx = t[0] * nx + t[3] * ny + t[6] * nz;
      const qy = t[1] * nx + t[4] * ny + t[7] * nz;
      const qz = t[2] * nx + t[5] * ny + t[8] * nz;
      nx = qx;
      ny = qy;
      nz = qz;
    }
    const l = 127 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
    return this.raw(x, y, z, Math.round(nx * l), Math.round(ny * l), Math.round(nz * l), u, v);
  }

  /** Write one vertex: local position (moved by the current transform), a packed final normal. */
  raw(x, y, z, bnx, bny, bnz, u, v) {
    const t = this.x;
    if (t) {
      const px = t[0] * x + t[3] * y + t[6] * z + t[9];
      const py = t[1] * x + t[4] * y + t[7] * z + t[10];
      const pz = t[2] * x + t[5] * y + t[8] * z + t[11];
      x = px;
      y = py;
      z = pz;
    }
    const i = this.vcount;
    if (i >= this.vcap) this.ensure(1, 0);
    const f = i * 9;
    const b = i * STRIDE;
    this.f32[f] = x;
    this.f32[f + 1] = y;
    this.f32[f + 2] = z;
    this.i8[b + 12] = bnx;
    this.i8[b + 13] = bny;
    this.i8[b + 14] = bnz;
    this.i8[b + 15] = 0;
    const by = this.bytes;
    by[b + 16] = this.c[0];
    by[b + 17] = this.c[1];
    by[b + 18] = this.c[2];
    by[b + 19] = this.c[3];
    by[b + 20] = this.c2[0];
    by[b + 21] = this.c2[1];
    by[b + 22] = this.c2[2];
    by[b + 23] = this.c2[3];
    this.f32[f + 6] = u;
    this.f32[f + 7] = v;
    by[b + 32] = this.m[0];
    by[b + 33] = this.m[1];
    by[b + 34] = this.m[2];
    by[b + 35] = this.m[3];
    this.vcount = i + 1;
    return i;
  }

  tri(a, b, c) {
    if (this.icount + 3 > this.icap) this.ensure(0, 3);
    this.indices[this.icount++] = a;
    this.indices[this.icount++] = b;
    this.indices[this.icount++] = c;
  }

  /**
   * A flat quad a-b-c-d (any winding; the shaders light both sides). uv corners: a=(u0,v0),
   * b=(u1,v0), c=(u1,v1), d=(u0,v1).
   */
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, u0 = 0, v0 = 0, u1 = 0, v1 = 0) {
    this.ensure(4, 6);
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = dx - ax;
    const vy = dy - ay;
    const vz = dz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    if (nx === 0 && ny === 0 && nz === 0) {
      const wx = cx - ax;
      const wy = cy - ay;
      const wz = cz - az;
      nx = uy * wz - uz * wy;
      ny = uz * wx - ux * wz;
      nz = ux * wy - uy * wx;
    }
    // One normal for the face, transformed and packed once.
    const t = this.x;
    if (t) {
      const qx = t[0] * nx + t[3] * ny + t[6] * nz;
      const qy = t[1] * nx + t[4] * ny + t[7] * nz;
      const qz = t[2] * nx + t[5] * ny + t[8] * nz;
      nx = qx;
      ny = qy;
      nz = qz;
    }
    const l = 127 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
    const bnx = Math.round(nx * l);
    const bny = Math.round(ny * l);
    const bnz = Math.round(nz * l);
    const i = this.raw(ax, ay, az, bnx, bny, bnz, u0, v0);
    this.raw(bx, by, bz, bnx, bny, bnz, u1, v0);
    this.raw(cx, cy, cz, bnx, bny, bnz, u1, v1);
    this.raw(dx, dy, dz, bnx, bny, bnz, u0, v1);
    this.tri(i, i + 1, i + 2);
    this.tri(i, i + 2, i + 3);
  }

  /** Index a triangle so its winding agrees with normal (nx, ny, nz) (smooth surfaces). */
  triN(a, b, c, nx, ny, nz) {
    const f = this.f32;
    const ax = f[a * 9];
    const ay = f[a * 9 + 1];
    const az = f[a * 9 + 2];
    const ux = f[b * 9] - ax;
    const uy = f[b * 9 + 1] - ay;
    const uz = f[b * 9 + 2] - az;
    const vx = f[c * 9] - ax;
    const vy = f[c * 9 + 1] - ay;
    const vz = f[c * 9 + 2] - az;
    const gx = uy * vz - uz * vy;
    const gy = uz * vx - ux * vz;
    const gz = ux * vy - uy * vx;
    if (gx * nx + gy * ny + gz * nz >= 0) this.tri(a, b, c);
    else this.tri(a, c, b);
  }

  /** A flat convex polygon from [[x, y, z], ...] with optional per-point uv [[u, v], ...]. */
  poly(pts, uvs = null) {
    const n = pts.length;
    this.ensure(n, (n - 2) * 3);
    const a = pts[0];
    const b = pts[1];
    const c = pts[2];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const i0 = this.vcount;
    for (let i = 0; i < n; i += 1) this.vert(pts[i][0], pts[i][1], pts[i][2], nx, ny, nz, uvs ? uvs[i][0] : 0, uvs ? uvs[i][1] : 0);
    for (let i = 1; i + 1 < n; i += 1) this.tri(i0, i0 + i, i0 + i + 1);
  }

  /** A lumpy low-poly ellipsoid (tree crowns, bushes); `jit` roughens it deterministically. */
  blob(cx, cy, cz, rx, ry, rz, seed = 0, jit = 0.18, lat = 5, lon = 8) {
    this.ensure((lat + 1) * (lon + 1), lat * lon * 6);
    const base = this.vcount;
    for (let i = 0; i <= lat; i += 1) {
      const th = (i / lat) * Math.PI;
      for (let j = 0; j <= lon; j += 1) {
        const ph = ((j % lon) / lon) * Math.PI * 2;
        const nx = Math.sin(th) * Math.cos(ph);
        const ny = Math.cos(th);
        const nz = Math.sin(th) * Math.sin(ph);
        const h = Math.sin(seed * 12.9898 + (j % lon) * 78.233 + i * 37.719) * 43758.5453;
        const k = i === 0 || i === lat ? 1 : 1 + (h - Math.floor(h) - 0.5) * 2 * jit;
        this.vert(cx + nx * rx * k, cy + ny * ry * k, cz + nz * rz * k, nx, ny, nz);
      }
    }
    for (let i = 0; i < lat; i += 1) {
      for (let j = 0; j < lon; j += 1) {
        const a = base + i * (lon + 1) + j;
        const b = a + lon + 1;
        const f = this.f32;
        const mx = (f[a * 9] + f[b * 9 + 9]) / 2 - cx;
        const my = (f[a * 9 + 1] + f[b * 9 + 10]) / 2 - cy;
        const mz = (f[a * 9 + 2] + f[b * 9 + 11]) / 2 - cz;
        this.triN(a, b, b + 1, mx, my, mz);
        this.triN(a, b + 1, a + 1, mx, my, mz);
      }
    }
  }

  /** Copy another builder's triangles in, moved by rigid transform `t` (from frame()). */
  append(src, t) {
    const n = src.vcount;
    this.ensure(n, src.icount);
    const base = this.vcount;
    const sf = src.f32;
    const si8 = src.i8;
    const sb = src.bytes;
    const df = this.f32;
    const di8 = this.i8;
    const db = this.bytes;
    for (let i = 0; i < n; i += 1) {
      const s = i * 9;
      const d = (base + i) * 9;
      const x = sf[s];
      const y = sf[s + 1];
      const z = sf[s + 2];
      df[d] = t[0] * x + t[3] * y + t[6] * z + t[9];
      df[d + 1] = t[1] * x + t[4] * y + t[7] * z + t[10];
      df[d + 2] = t[2] * x + t[5] * y + t[8] * z + t[11];
      const sb0 = i * STRIDE;
      const db0 = (base + i) * STRIDE;
      const nx = si8[sb0 + 12];
      const ny = si8[sb0 + 13];
      const nz = si8[sb0 + 14];
      const qx = t[0] * nx + t[3] * ny + t[6] * nz;
      const qy = t[1] * nx + t[4] * ny + t[7] * nz;
      const qz = t[2] * nx + t[5] * ny + t[8] * nz;
      const ql = 127 / (Math.hypot(qx, qy, qz) || 1);
      di8[db0 + 12] = Math.round(qx * ql);
      di8[db0 + 13] = Math.round(qy * ql);
      di8[db0 + 14] = Math.round(qz * ql);
      di8[db0 + 15] = 0;
      for (let k = 16; k < 24; k += 1) db[db0 + k] = sb[sb0 + k];
      df[d + 6] = sf[s + 6];
      df[d + 7] = sf[s + 7];
      for (let k = 32; k < 36; k += 1) db[db0 + k] = sb[sb0 + k];
    }
    this.vcount += n;
    const si = src.indices;
    for (let i = 0; i < src.icount; i += 1) this.indices[this.icount + i] = si[i] + base;
    this.icount += src.icount;
  }

  /** A flat triangle. */
  triangle(ax, ay, az, bx, by, bz, cx, cy, cz, u0 = 0, v0 = 0) {
    this.ensure(3, 3);
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const i = this.vert(ax, ay, az, nx, ny, nz, u0, v0);
    this.vert(bx, by, bz, nx, ny, nz, u0, v0);
    this.vert(cx, cy, cz, nx, ny, nz, u0, v0);
    this.tri(i, i + 1, i + 2);
  }

  /** An axis-aligned box (in the current frame) from (x0,y0,z0) to (x1,y1,z1). `skip` omits faces: 'b' bottom, 't' top. */
  box(x0, y0, z0, x1, y1, z1, skip = 'b') {
    if (!skip.includes('t')) this.quad(x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1);
    if (!skip.includes('b')) this.quad(x0, y0, z0, x0, y0, z1, x1, y0, z1, x1, y0, z0);
    this.quad(x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0);
    this.quad(x1, y0, z1, x0, y0, z1, x0, y1, z1, x1, y1, z1);
    this.quad(x0, y0, z1, x0, y0, z0, x0, y1, z0, x0, y1, z1);
    this.quad(x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0);
  }

  /** A box centred on (cx, cz) in the current frame, standing on y0. */
  block(cx, y0, cz, sx, sy, sz, skip = 'b') {
    this.box(cx - sx / 2, y0, cz - sz / 2, cx + sx / 2, y0 + sy, cz + sz / 2, skip);
  }

  /**
   * A tube between two points with radii r0 -> r1 and `sides` facets (smooth shaded), capped at
   * the far end when `cap`.
   */
  tube(x0, y0, z0, x1, y1, z1, r0, r1, sides = 6, cap = false) {
    let ax = x1 - x0;
    let ay = y1 - y0;
    let az = z1 - z0;
    const len = Math.hypot(ax, ay, az) || 1;
    ax /= len;
    ay /= len;
    az /= len;
    // Basis perpendicular to the axis.
    let px = Math.abs(ay) < 0.9 ? 0 : 1;
    let py = Math.abs(ay) < 0.9 ? 1 : 0;
    let pz = 0;
    let ux = ay * pz - az * py;
    let uy = az * px - ax * pz;
    let uz = ax * py - ay * px;
    let l = Math.hypot(ux, uy, uz) || 1;
    ux /= l;
    uy /= l;
    uz /= l;
    const wx = ay * uz - az * uy;
    const wy = az * ux - ax * uz;
    const wz = ax * uy - ay * ux;
    void l;
    px = 0;
    py = 0;
    pz = 0;
    this.ensure((sides + 1) * 2 + sides + 2, sides * 6 + sides * 3);
    const base = this.vcount;
    for (let i = 0; i <= sides; i += 1) {
      const a = (i / sides) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nx = ux * ca + wx * sa;
      const ny = uy * ca + wy * sa;
      const nz = uz * ca + wz * sa;
      this.vert(x0 + nx * r0, y0 + ny * r0, z0 + nz * r0, nx, ny, nz, i / sides, 0);
      this.vert(x1 + nx * r1, y1 + ny * r1, z1 + nz * r1, nx, ny, nz, i / sides, len);
    }
    for (let i = 0; i < sides; i += 1) {
      const a = base + i * 2;
      this.tri(a, a + 2, a + 3);
      this.tri(a, a + 3, a + 1);
    }
    if (cap) {
      const c = this.vert(x1, y1, z1, ax, ay, az);
      const first = this.vcount;
      for (let i = 0; i <= sides; i += 1) {
        const a = (i / sides) * Math.PI * 2;
        const nx = ux * Math.cos(a) + wx * Math.sin(a);
        const ny = uy * Math.cos(a) + wy * Math.sin(a);
        const nz = uz * Math.cos(a) + wz * Math.sin(a);
        this.vert(x1 + nx * r1, y1 + ny * r1, z1 + nz * r1, ax, ay, az);
      }
      for (let i = 0; i < sides; i += 1) this.tri(c, first + i, first + i + 1);
    }
  }

  /** A flat disc (fan) of radius r around (x, y, z) facing up, `sides` segments. */
  disc(x, y, z, r, sides = 12, u = 0, v = 0) {
    this.ensure(sides + 2, sides * 3);
    const c = this.vert(x, y, z, 0, 1, 0, u, v);
    for (let i = 0; i <= sides; i += 1) {
      const a = (i / sides) * Math.PI * 2;
      this.vert(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0, 1, 0, u, v);
    }
    for (let i = 0; i < sides; i += 1) this.tri(c, c + 2 + i, c + 1 + i);
  }

  /**
   * Extrude a convex side profile (points [x, y] in the X-Y plane, counter-clockwise) across the
   * width from z0 to z1: two side faces plus the faces between consecutive points.
   */
  extrude(profile, z0, z1, faceMat = null) {
    const n = profile.length;
    for (const z of [z0, z1]) {
      const c = profile.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
      for (let i = 0; i < n; i += 1) {
        const p = profile[i];
        const q = profile[(i + 1) % n];
        this.triangle(c[0], c[1], z, p[0], p[1], z, q[0], q[1], z);
      }
    }
    for (let i = 0; i < n; i += 1) {
      const p = profile[i];
      const q = profile[(i + 1) % n];
      if (faceMat) faceMat(i, this);
      this.quad(p[0], p[1], z0, q[0], q[1], z0, q[0], q[1], z1, p[0], p[1], z1);
    }
  }
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * A rigid frame at (x, y, z) (3D coordinates) turned to the simulation heading `yaw` (radians,
 * the sim's angle), nose up by `pitch`, rolled right by `roll`, uniformly scaled by `s`.
 */
export function frame(x, y, z, yaw, pitch = 0, roll = 0, s = 1) {
  const ca = Math.cos(yaw);
  const sa = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  // Local axes after pitch (about Z) then roll (about X), before yaw.
  const fx = cp;
  const fy = sp;
  const ux = -sp * cr;
  const uy = cp * cr;
  const uz = sr;
  const rx = sp * sr;
  const ry = -cp * sr;
  const rz = cr;
  // Yaw: local X -> (ca, 0, sa), local Z -> (-sa, 0, ca).
  const Y = (vx, vy, vz) => [vx * ca - vz * sa, vy, vx * sa + vz * ca];
  const F = Y(fx, fy, 0);
  const U = Y(ux, uy, uz);
  const R = Y(rx, ry, rz);
  return new Float32Array([F[0] * s, F[1] * s, F[2] * s, U[0] * s, U[1] * s, U[2] * s, R[0] * s, R[1] * s, R[2] * s, x, y, z]);
}

/** Parse '#rrggbb' into [r, g, b] 0..255. */
const hexCache = new Map();
export function hexRgb(h) {
  let v = hexCache.get(h);
  if (!v) {
    const n = Number.parseInt(h.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache.set(h, v);
  }
  return v;
}
