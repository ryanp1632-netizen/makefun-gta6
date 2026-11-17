// The static 3D city, built once from the generated layout and merged into one vertex buffer per
// 800-unit district chunk so a frame draws a few dozen meshes. Buildings are extruded from their
// footprints (window-grid facades, parapets, hip and arched roofs, tower crowns and spires,
// rooftop AC units, tanks, pools, helipads, solar panels), with neon signs, billboards and deco
// trims; streets get lamps; palms and shade trees, beach umbrellas and sunbathers, boats, piers,
// bridge rails, dock cranes, planes, market stalls and fountains fill in the rest. Also returns
// the lamp and sign positions the lighting pass turns into lights at night.
import { MeshBuilder, MAT, frame, hexRgb } from './meshBuilder.js';
import { createStaticMesh } from './glContext.js';
import { atlasEntry } from './textAtlas.js';
import { WATER_Y, FLOOR, FACADE, STYLE, buildingHeights } from './heights.js';
import { hash2 } from '../core/random.js';
import { clamp } from '../core/math.js';

export const SCH = 800;
const GLASS = { deco: [70, 130, 150], oldtown: [52, 64, 78], villa: [86, 128, 156], marina: [86, 128, 156], warehouse: [60, 70, 80] };

const c255 = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];

function walls(mb, x0, z0, x1, z1, y0, y1, style) {
  const f = FLOOR[style];
  const colW = f ? f[1] : 1;
  const edges = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az);
    const uLen = f ? Math.max(1, Math.round(len / colW)) * colW : len;
    mb.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, 0, y0, uLen, y1);
  }
}

function flatRoof(mb, R, H, roof, wall) {
  mb.rgb(roof, 0.95).mat(MAT.PLAIN);
  mb.quad(R.x0, H, R.y0, R.x1, H, R.y0, R.x1, H, R.y1, R.x0, H, R.y1);
  const w = R.x1 - R.x0;
  const d = R.y1 - R.y0;
  if (w < 24 || d < 24) return;
  const p = 2.2;
  const ph = 3.5;
  mb.rgb(wall, 0.92);
  mb.box(R.x0, H, R.y0, R.x1, H + ph, R.y0 + p);
  mb.box(R.x0, H, R.y1 - p, R.x1, H + ph, R.y1);
  mb.box(R.x0, H, R.y0 + p, R.x0 + p, H + ph, R.y1 - p);
  mb.box(R.x1 - p, H, R.y0 + p, R.x1, H + ph, R.y1 - p);
}

function hipRoof(mb, R, H, roof, wall) {
  const e = 3;
  const x0 = R.x0 - e;
  const x1 = R.x1 + e;
  const z0 = R.y0 - e;
  const z1 = R.y1 + e;
  const w = x1 - x0;
  const d = z1 - z0;
  const peak = Math.min(w, d) * 0.36;
  mb.rgb(wall, 0.7).mat(MAT.PLAIN);
  mb.quad(x0, H, z0, x0, H, z1, x1, H, z1, x1, H, z0);
  mb.rgb(roof).mat(MAT.FACADE, FACADE.RIBS, 0, 0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const top = H + peak;
  if (w >= d) {
    const r0 = [x0 + d / 2, top, cz];
    const r1 = [x1 - d / 2, top, cz];
    mb.poly([[x0, H, z0], [x1, H, z0], r1, r0], [[x0, 99], [x1, 99], [r1[0], 99], [r0[0], 99]]);
    mb.poly([[x1, H, z1], [x0, H, z1], r0, r1], [[x1, 99], [x0, 99], [r0[0], 99], [r1[0], 99]]);
    mb.poly([[x0, H, z1], [x0, H, z0], r0], [[z1, 99], [z0, 99], [cz, 99]]);
    mb.poly([[x1, H, z0], [x1, H, z1], r1], [[z0, 99], [z1, 99], [cz, 99]]);
    mb.rgb(roof, 0.7).mat(MAT.PLAIN);
    mb.box(r0[0], top - 0.6, cz - 0.9, r1[0], top + 1, cz + 0.9);
  } else {
    const r0 = [cx, top, z0 + w / 2];
    const r1 = [cx, top, z1 - w / 2];
    mb.poly([[x1, H, z0], [x1, H, z1], r1, r0], [[z0, 99], [z1, 99], [r1[2], 99], [r0[2], 99]]);
    mb.poly([[x0, H, z1], [x0, H, z0], r0, r1], [[z1, 99], [z0, 99], [r0[2], 99], [r1[2], 99]]);
    mb.poly([[x0, H, z0], [x1, H, z0], r0], [[x0, 99], [x1, 99], [cx, 99]]);
    mb.poly([[x1, H, z1], [x0, H, z1], r1], [[x1, 99], [x0, 99], [cx, 99]]);
    mb.rgb(roof, 0.7).mat(MAT.PLAIN);
    mb.box(cx - 0.9, top - 0.6, r0[2], cx + 0.9, top + 1, r1[2]);
  }
}

function archRoof(mb, R, H, roof, wall) {
  const alongX = R.x1 - R.x0 >= R.y1 - R.y0;
  const rad = (alongX ? R.y1 - R.y0 : R.x1 - R.x0) / 2;
  const cc = alongX ? (R.y0 + R.y1) / 2 : (R.x0 + R.x1) / 2;
  const a0 = alongX ? R.x0 : R.y0;
  const a1 = alongX ? R.x1 : R.y1;
  const seg = 10;
  const P = (along, ang) => {
    const o = Math.cos(ang) * rad;
    const y = H + Math.sin(ang) * rad * 0.7;
    return alongX ? [along, y, cc + o] : [cc + o, y, along];
  };
  mb.rgb(roof).mat(MAT.FACADE, FACADE.RIBS, 0, 0);
  for (let i = 0; i < seg; i += 1) {
    const g0 = (i / seg) * Math.PI;
    const g1 = ((i + 1) / seg) * Math.PI;
    const p = [P(a0, g0), P(a1, g0), P(a1, g1), P(a0, g1)];
    mb.poly(p, [[0, 99], [a1 - a0, 99], [a1 - a0, 99], [0, 99]]);
  }
  mb.rgb(wall, 0.95).mat(MAT.PLAIN);
  for (const along of [a0, a1]) {
    const pts = [];
    for (let i = 0; i <= seg; i += 1) pts.push(P(along, (i / seg) * Math.PI));
    mb.poly(pts);
  }
}

/** The four sides of a rectangle as sign frames: midpoint, reading direction, outward normal. */
function edgeFrame(R, edge) {
  if (edge === 's') return { cx: (R.x0 + R.x1) / 2, cz: R.y1, rx: 1, rz: 0, nx: 0, nz: 1, len: R.x1 - R.x0 };
  if (edge === 'n') return { cx: (R.x0 + R.x1) / 2, cz: R.y0, rx: -1, rz: 0, nx: 0, nz: -1, len: R.x1 - R.x0 };
  if (edge === 'e') return { cx: R.x1, cz: (R.y0 + R.y1) / 2, rx: 0, rz: -1, nx: 1, nz: 0, len: R.y1 - R.y0 };
  return { cx: R.x0, cz: (R.y0 + R.y1) / 2, rx: 0, rz: 1, nx: -1, nz: 0, len: R.y1 - R.y0 };
}

function streetEdges(b) {
  const blk = b.block;
  if (!blk) return ['s', 'e', 'n', 'w'];
  const d = [[b.y0 - blk.y0, 'n'], [blk.y1 - b.y1, 's'], [b.x0 - blk.x0, 'w'], [blk.x1 - b.x1, 'e']];
  d.sort((p, q) => p[0] - q[0]);
  return d.map((p) => p[1]);
}

/** An axis-aligned box from a centre, half-extents along the frame's reading/normal axes. */
function frameBox(mb, f, cx, cz, alongHalf, n0, n1, y0, y1) {
  const ax = Math.abs(f.rx) > 0.5;
  const nx0 = cx + f.nx * n0;
  const nz0 = cz + f.nz * n0;
  const nx1 = cx + f.nx * n1;
  const nz1 = cz + f.nz * n1;
  if (ax) mb.box(cx - alongHalf, y0, Math.min(nz0, nz1), cx + alongHalf, y1, Math.max(nz0, nz1));
  else mb.box(Math.min(nx0, nx1), y0, cz - alongHalf, Math.max(nx0, nx1), y1, cz + alongHalf);
}

/** A standing neon sign (kind 0) or a lit billboard (kind 1) on a roof edge. */
function standingPanel(mb, atlas, R, H, edge, text, color, kind, lights) {
  const e = atlasEntry(atlas, text);
  const f = edgeFrame(R, edge);
  const rgb = hexRgb(color);
  let ph = kind ? clamp(f.len * 0.3, 18, 46) : clamp(f.len * 0.17, 13, 40);
  let pw = Math.min(f.len - 6, kind ? ph * 3.1 : ph * e.aspect * 0.92);
  if (!kind && pw < ph * e.aspect * 0.92) ph = pw / (e.aspect * 0.92);
  if (pw < 8) return;
  const inset = 3;
  const cx = f.cx - f.nx * inset;
  const cz = f.cz - f.nz * inset;
  const y0 = H + (kind ? 16 : 5);
  const y1 = y0 + ph;
  mb.color(0.09, 0.08, 0.11).mat(MAT.METAL);
  frameBox(mb, f, cx, cz, pw * 0.52, -2.2, -0.35, y0 - 1, y1 + 1);
  for (const s of [-0.34, 0.34]) {
    const px = cx + f.rx * pw * s;
    const pz = cz + f.rz * pw * s;
    frameBox(mb, f, px, pz, 1, -2.4, -1, H, y0);
  }
  if (kind) frameBox(mb, f, cx, cz, pw * 0.5, -2.4, -1.2, y0 - 6, y0 - 4);
  const hw = pw / 2;
  const TL = [cx - f.rx * hw, y1, cz - f.rz * hw];
  const TR = [cx + f.rx * hw, y1, cz + f.rz * hw];
  const BR = [cx + f.rx * hw, y0, cz + f.rz * hw];
  const BL = [cx - f.rx * hw, y0, cz - f.rz * hw];
  mb.color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).mat(MAT.SIGN, kind);
  if (kind) {
    const i0 = mb.vcount;
    mb.color2(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    mb.vert(TL[0], TL[1], TL[2], f.nx, 0, f.nz, e.u0, e.v0);
    mb.vert(TR[0], TR[1], TR[2], f.nx, 0, f.nz, e.u1, e.v0);
    mb.color2(0.1, 0.06, 0.2);
    mb.vert(BR[0], BR[1], BR[2], f.nx, 0, f.nz, e.u1, e.v1);
    mb.vert(BL[0], BL[1], BL[2], f.nx, 0, f.nz, e.u0, e.v1);
    mb.triN(i0, i0 + 1, i0 + 2, f.nx, 0, f.nz);
    mb.triN(i0, i0 + 2, i0 + 3, f.nx, 0, f.nz);
  } else {
    mb.quad(TL[0], TL[1], TL[2], TR[0], TR[1], TR[2], BR[0], BR[1], BR[2], BL[0], BL[1], BL[2], e.u0, e.v0, e.u1, e.v1);
    // A neon tube frame around the lettering.
    mb.color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).color2(rgb[0] / 400, rgb[1] / 400, rgb[2] / 400).mat(MAT.EMIT, 120, 1);
    frameBox(mb, f, cx, cz, hw + 0.8, 0.1, 0.9, y1 + 0.2, y1 + 1.1);
    frameBox(mb, f, cx, cz, hw + 0.8, 0.1, 0.9, y0 - 1.1, y0 - 0.2);
  }
  lights.push({ x: cx + f.nx * 26, y: (y0 + y1) / 2, z: cz + f.nz * 26, color: rgb, r: kind ? 150 : 190, k: kind ? 0.7 : 1 });
}

const STREET_SIGNS = ['BAR', 'OPEN 24H', 'TACOS', 'LIQUOR', 'PIZZA', 'KARAOKE', 'ARCADE', 'NOODLES', 'TATTOO', 'MOTEL', 'DINER', 'PAWN', 'LOUNGE', 'SUSHI', 'VIDEO', 'BODEGA', 'CAFE', 'DANCE'];
const STREET_NEON = ['#ff4fd8', '#3ee6ff', '#ffe14f', '#7dff6a', '#ff6a4f', '#b26bff', '#ff8fd0'];

/** A neon sign over the shopfronts, between the ground floor and the first floor. */
function facadeSign(mb, atlas, b, edge, text, color, lights) {
  const e = atlasEntry(atlas, text);
  const f = edgeFrame(b, edge);
  const rgb = hexRgb(color);
  let ph = 10.5;
  const pw = Math.min(f.len - 14, ph * e.aspect * 0.92, 150);
  if (pw < ph * e.aspect * 0.92) ph = pw / (e.aspect * 0.92);
  if (pw < 16) return;
  const cx = f.cx + f.nx * 1.3;
  const cz = f.cz + f.nz * 1.3;
  const y0 = 21.5;
  const y1 = y0 + ph;
  mb.color(0.05, 0.04, 0.07).mat(MAT.METAL);
  frameBox(mb, f, cx, cz, pw * 0.5 + 1.2, -1.3, -0.1, y0 - 1.2, y1 + 1.2);
  const hw = pw / 2;
  mb.color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).mat(MAT.SIGN, 0);
  mb.quad(cx - f.rx * hw, y1, cz - f.rz * hw, cx + f.rx * hw, y1, cz + f.rz * hw, cx + f.rx * hw, y0, cz + f.rz * hw, cx - f.rx * hw, y0, cz - f.rz * hw, e.u0, e.v0, e.u1, e.v1);
  mb.color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).color2(rgb[0] / 400, rgb[1] / 400, rgb[2] / 400).mat(MAT.EMIT, 140, 1);
  frameBox(mb, f, cx, cz, hw + 1.6, 0.05, 0.8, y1 + 1.2, y1 + 2);
  frameBox(mb, f, cx, cz, hw + 1.6, 0.05, 0.8, y0 - 2, y0 - 1.2);
  lights.push({ x: cx + f.nx * 22, y: 26, z: cz + f.nz * 22, color: rgb, r: 140, k: 0.85 });
}

function roofDetails(mb, b, H, atlas, lights) {
  for (const d of b.details) {
    switch (d.k) {
      case 'ac':
        mb.color(0.74, 0.76, 0.78).mat(MAT.METAL);
        mb.box(d.x, H, d.y, d.x + d.w, H + 7, d.y + d.h);
        mb.color(0.3, 0.32, 0.35).mat(MAT.PLAIN);
        mb.disc(d.x + d.w / 2, H + 7.15, d.y + d.h / 2, Math.min(d.w, d.h) * 0.34, 8);
        break;
      case 'tank': {
        mb.color(0.35, 0.3, 0.25).mat(MAT.PLAIN);
        for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) mb.box(d.x + ox * d.r * 0.7 - 0.6, H, d.y + oz * d.r * 0.7 - 0.6, d.x + ox * d.r * 0.7 + 0.6, H + 7, d.y + oz * d.r * 0.7 + 0.6);
        mb.color(0.68, 0.58, 0.45);
        mb.tube(d.x, H + 7, d.y, d.x, H + 22, d.y, d.r * 1.15, d.r * 1.15, 8, false);
        mb.color(0.5, 0.42, 0.33);
        mb.tube(d.x, H + 22, d.y, d.x, H + 27, d.y, d.r * 1.2, 0.5, 8, false);
        break;
      }
      case 'antenna':
        mb.color(0.35, 0.36, 0.4).mat(MAT.METAL);
        mb.box(d.x - 0.6, H, d.y - 0.6, d.x + 0.6, H + 46, d.y + 0.6);
        mb.color(1, 0.15, 0.12).color2(0.4, 0.1, 0.1).mat(MAT.EMIT, 255, 1);
        mb.box(d.x - 1.3, H + 46, d.y - 1.3, d.x + 1.3, H + 48.6, d.y + 1.3, '');
        break;
      case 'solar':
        mb.color(0.5, 0.5, 0.52).mat(MAT.PLAIN);
        mb.box(d.x0 + 2, H, d.y0 + 2, d.x1 - 2, H + 2.5, d.y1 - 2);
        mb.color(0.12, 0.18, 0.38).mat(MAT.GLASS);
        mb.quad(d.x0, H + 3, d.y1, d.x1, H + 3, d.y1, d.x1, H + 9, d.y0, d.x0, H + 9, d.y0);
        break;
      case 'skylight':
        mb.color(0.5, 0.7, 0.8).mat(MAT.GLASS);
        mb.box(d.x, H, d.y, d.x + d.w, H + 3, d.y + d.h);
        break;
      case 'heli': {
        mb.color(0.27, 0.28, 0.31).mat(MAT.PLAIN);
        mb.disc(d.x, H + 0.6, d.y, d.r * 1.15, 18);
        mb.color(0.95, 0.76, 0.19);
        for (let i = 0; i < 24; i += 1) {
          const a0 = (i / 24) * Math.PI * 2;
          const a1 = ((i + 1) / 24) * Math.PI * 2;
          const r0 = d.r * 0.86;
          const r1 = d.r * 0.96;
          mb.quad(d.x + Math.cos(a0) * r0, H + 0.75, d.y + Math.sin(a0) * r0, d.x + Math.cos(a0) * r1, H + 0.75, d.y + Math.sin(a0) * r1, d.x + Math.cos(a1) * r1, H + 0.75, d.y + Math.sin(a1) * r1, d.x + Math.cos(a1) * r0, H + 0.75, d.y + Math.sin(a1) * r0);
        }
        const e = atlasEntry(atlas, 'H');
        const s = d.r * 0.55;
        const k = s * 0.5;
        mb.color(1, 1, 1).color2(0.27, 0.28, 0.31).mat(MAT.SIGN, 1);
        mb.quad(d.x - s * e.aspect * 0.4, H + 0.8, d.y - k * 1.6, d.x + s * e.aspect * 0.4, H + 0.8, d.y - k * 1.6, d.x + s * e.aspect * 0.4, H + 0.8, d.y + k * 1.6, d.x - s * e.aspect * 0.4, H + 0.8, d.y + k * 1.6, e.u0, e.v0, e.u1, e.v1);
        mb.color(0.4, 1, 0.35).color2(0.2, 0.3, 0.2).mat(MAT.EMIT, 200, 1);
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2;
          const x = d.x + Math.cos(a) * d.r * 1.1;
          const z = d.y + Math.sin(a) * d.r * 1.1;
          mb.box(x - 1, H + 0.6, z - 1, x + 1, H + 2, z + 1);
        }
        break;
      }
      case 'pool':
        mb.color(0.9, 0.88, 0.82).mat(MAT.PLAIN);
        mb.box(d.x0 - 3, H, d.y0 - 3, d.x1 + 3, H + 1, d.y1 + 3);
        mb.color(0.2, 0.7, 0.8).mat(MAT.POOL);
        mb.quad(d.x0, H + 1.1, d.y0, d.x1, H + 1.1, d.y0, d.x1, H + 1.1, d.y1, d.x0, H + 1.1, d.y1);
        break;
      case 'lounger':
        mb.color(0.97, 0.97, 0.95).mat(MAT.PLAIN);
        mb.box(d.x, H, d.y, d.x + 14, H + 2, d.y + 6);
        mb.color(1, 0.47, 0.55);
        mb.quad(d.x + 10, H + 2, d.y, d.x + 14, H + 5, d.y, d.x + 14, H + 5, d.y + 6, d.x + 10, H + 2, d.y + 6);
        break;
      case 'garden':
        mb.color(0.3, 0.55, 0.26).mat(MAT.PLAIN);
        mb.box(d.x0, H, d.y0, d.x1, H + 1.5, d.y1);
        mb.color(0.2, 0.45, 0.2).mat(MAT.FOLIAGE, 30, b.seed % 255);
        for (let i = 0; i < 4; i += 1) {
          const x = d.x0 + hash2(b.seed, i, 1) * (d.x1 - d.x0);
          const z = d.y0 + hash2(b.seed, i, 2) * (d.y1 - d.y0);
          mb.blob(x, H + 4, z, 5, 4, 5, b.seed + i, 0.2, 3, 6);
        }
        break;
      default:
        break;
    }
  }
}

function building(mb, b, atlas, lights) {
  const hh = buildingHeights(b);
  const style = STYLE[b.style] ?? FACADE.PLAIN;
  const seed = b.seed % 251;
  const glass = c255(b.glass ?? GLASS[b.style] ?? [70, 110, 140]);
  const R = b.top ?? b;
  const H = hh.top ?? hh.base;
  if (b.style === 'lifeguard') {
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.y0 + b.y1) / 2;
    mb.color(0.85, 0.82, 0.76).mat(MAT.PLAIN);
    for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) mb.box(cx + ox * 8 - 0.8, 0, cz + oz * 8 - 0.8, cx + ox * 8 + 0.8, 13, cz + oz * 8 + 0.8);
    mb.color(0.95, 0.93, 0.88);
    mb.box(cx - 11, 12, cz - 11, cx + 11, 13.5, cz + 11);
    mb.rgb(b.wall).mat(MAT.PLAIN);
    mb.box(cx - 8, 13.5, cz - 8, cx + 8, 25, cz + 8);
    mb.color(0.2, 0.3, 0.4).mat(MAT.GLASS);
    mb.quad(cx + 8.1, 17, cz - 6, cx + 8.1, 17, cz + 6, cx + 8.1, 23, cz + 6, cx + 8.1, 23, cz - 6);
    mb.rgb(b.roof).mat(MAT.PLAIN);
    mb.poly([[cx - 10, 25, cz - 10], [cx + 10, 25, cz - 10], [cx + 10, 25, cz + 10], [cx - 10, 25, cz + 10]]);
    mb.poly([[cx - 10, 25, cz - 10], [cx + 10, 25, cz - 10], [cx, 31, cz]]);
    mb.poly([[cx + 10, 25, cz - 10], [cx + 10, 25, cz + 10], [cx, 31, cz]]);
    mb.poly([[cx + 10, 25, cz + 10], [cx - 10, 25, cz + 10], [cx, 31, cz]]);
    mb.poly([[cx - 10, 25, cz + 10], [cx - 10, 25, cz - 10], [cx, 31, cz]]);
    mb.color(0.85, 0.82, 0.76).mat(MAT.PLAIN);
    mb.quad(cx - 11, 12, cz - 4, cx - 11, 12, cz + 4, cx - 26, 0, cz + 4, cx - 26, 0, cz - 4);
    return;
  }
  if (b.style === 'control') {
    const H0 = hh.base;
    mb.rgb(b.wall).mat(MAT.FACADE, FACADE.PLAIN, seed);
    walls(mb, b.x0 + 5, b.y0 + 5, b.x1 - 5, b.y1 - 5, 0, H0 - 26, FACADE.PLAIN);
    mb.color(0.25, 0.27, 0.3).mat(MAT.PLAIN);
    mb.box(b.x0 - 2, H0 - 28, b.y0 - 2, b.x1 + 2, H0 - 25, b.y1 + 2, '');
    mb.color(0.3, 0.55, 0.7).mat(MAT.GLASS);
    mb.box(b.x0 - 1, H0 - 25, b.y0 - 1, b.x1 + 1, H0 - 8, b.y1 + 1, 'bt');
    mb.color(0.22, 0.24, 0.28).mat(MAT.PLAIN);
    mb.box(b.x0 - 3, H0 - 8, b.y0 - 3, b.x1 + 3, H0 - 4, b.y1 + 3, '');
    mb.color(0.4, 0.4, 0.44).mat(MAT.METAL);
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.y0 + b.y1) / 2;
    mb.box(cx - 0.8, H0 - 4, cz - 0.8, cx + 0.8, H0 + 26, cz + 0.8);
    mb.color(1, 0.15, 0.1).color2(0.5, 0.1, 0.1).mat(MAT.EMIT, 255, 1);
    mb.box(cx - 1.6, H0 + 26, cz - 1.6, cx + 1.6, H0 + 29, cz + 1.6, '');
    return;
  }
  if (b.style === 'container') {
    mb.rgb(b.wall).mat(MAT.FACADE, FACADE.RIBS, seed);
    walls(mb, b.x0, b.y0, b.x1, b.y1, 0, hh.base, FACADE.RIBS);
    mb.rgb(b.wall, 1.05).mat(MAT.FACADE, FACADE.RIBS, seed);
    mb.quad(b.x0, hh.base, b.y0, b.x1, hh.base, b.y0, b.x1, hh.base, b.y1, b.x0, hh.base, b.y1, 0, 99, Math.max(b.x1 - b.x0, b.y1 - b.y0), 99);
    if (hh.base > 30) {
      mb.color(0.15, 0.15, 0.17).mat(MAT.PLAIN);
      mb.box(b.x0 - 0.2, hh.base / 2 - 0.6, b.y0 - 0.2, b.x1 + 0.2, hh.base / 2 + 0.6, b.y1 + 0.2, '');
    }
    return;
  }
  // Walls (podium first when the building carries a tower).
  mb.rgb(b.wall).color2(glass[0], glass[1], glass[2]).mat(MAT.FACADE, style, seed);
  walls(mb, b.x0, b.y0, b.x1, b.y1, 0, hh.base, style);
  if (b.top) {
    flatRoof(mb, b, hh.base, b.roof, b.wall);
    mb.rgb(b.wall, 0.96).color2(glass[0], glass[1], glass[2]).mat(MAT.FACADE, style, seed);
    walls(mb, R.x0, R.y0, R.x1, R.y1, hh.base, H, style);
  }
  if (b.roofType === 'hip' && !b.top) hipRoof(mb, b, H, b.roof, b.wall);
  else if (b.roofType === 'arch') archRoof(mb, b, H, b.roof, b.wall);
  else if (b.roofType === 'corrugated') {
    mb.rgb(b.roof).mat(MAT.FACADE, FACADE.WAREHOUSE, seed);
    mb.quad(R.x0, H, R.y0, R.x1, H, R.y0, R.x1, H, R.y1, R.x0, H, R.y1, R.x0, 99, R.x1, 99);
  } else flatRoof(mb, R, H, b.roof, b.wall);
  if (b.style === 'hangar') {
    mb.color(0.32, 0.34, 0.37).mat(MAT.FACADE, FACADE.RIBS, seed);
    const w = b.x1 - b.x0;
    mb.quad(b.x0 + w * 0.15, 0, b.y1 + 0.3, b.x1 - w * 0.15, 0, b.y1 + 0.3, b.x1 - w * 0.15, H * 0.82, b.y1 + 0.3, b.x0 + w * 0.15, H * 0.82, b.y1 + 0.3, 0, 99, w * 0.7, 99);
  }
  // Tower crowns: a plant room and, on the tallest, a spire with a warning light.
  if (b.style === 'tower' && H > 250) {
    const w = R.x1 - R.x0;
    const d = R.y1 - R.y0;
    const ix = w * 0.28;
    const iz = d * 0.28;
    mb.rgb(b.wall, 0.85).color2(glass[0], glass[1], glass[2]).mat(MAT.FACADE, FACADE.PLAIN, seed);
    walls(mb, R.x0 + ix, R.y0 + iz, R.x1 - ix, R.y1 - iz, H, H + 20, FACADE.PLAIN);
    flatRoof(mb, { x0: R.x0 + ix, y0: R.y0 + iz, x1: R.x1 - ix, y1: R.y1 - iz }, H + 20, b.roof, b.wall);
    if (H > 420 && seed % 3 !== 0) {
      const cx = (R.x0 + R.x1) / 2;
      const cz = (R.y0 + R.y1) / 2;
      mb.color(0.75, 0.78, 0.82).mat(MAT.METAL);
      mb.tube(cx, H + 20, cz, cx, H + 110, cz, 2.6, 0.6, 6, false);
      mb.color(1, 0.12, 0.1).color2(0.5, 0.1, 0.1).mat(MAT.EMIT, 255, 1);
      mb.box(cx - 1.8, H + 108, cz - 1.8, cx + 1.8, H + 112, cz + 1.8, '');
    }
  }
  // Deco trims: pastel bands by day, neon tubes by night.
  if (b.trim) {
    const t = c255(b.trim);
    mb.color(t[0], t[1], t[2]).color2(t[0], t[1], t[2]).mat(MAT.EMIT, 90, 1);
    mb.box(b.x0 - 0.8, hh.base - 7, b.y0 - 0.8, b.x1 + 0.8, hh.base - 4.6, b.y1 + 0.8, '');
    mb.box(b.x0 - 0.8, 27.5, b.y0 - 0.8, b.x1 + 0.8, 29.5, b.y1 + 0.8, '');
    // A vertical fin at one corner, the classic deco flourish.
    if (hh.base > 70) {
      const [ex] = streetEdges(b);
      const f = edgeFrame(b, ex);
      const fx = f.cx + f.nx * 3 - f.rx * (f.len / 2 - 6);
      const fz = f.cz + f.nz * 3 - f.rz * (f.len / 2 - 6);
      mb.rgb(b.wall, 1.08).mat(MAT.PLAIN);
      mb.box(fx - 2, 34, fz - 2, fx + 2, hh.base + 14, fz + 2);
      mb.color(t[0], t[1], t[2]).color2(1, 1, 1).mat(MAT.EMIT, 150, 1);
      mb.box(fx - 2.4, 36, fz - 2.4, fx + 2.4, 38, fz + 2.4, '');
      mb.box(fx - 2.4, hh.base + 10, fz - 2.4, fx + 2.4, hh.base + 12, fz + 2.4, '');
    }
  }
  roofDetails(mb, b, H, atlas, lights);
  const edges = streetEdges(b);
  if (b.sign) standingPanel(mb, atlas, R, H, b.sign.edge, b.sign.text, b.sign.color, 0, lights);
  // Street-level neon over the shops (the landmark's own name where it has one).
  if ((b.style === 'tower' || b.style === 'deco' || b.style === 'oldtown') && hh.base > 40) {
    const own = b.sign && (b.poi || seed % 2 === 0);
    const text = own ? b.sign.text : seed % 3 === 0 ? null : STREET_SIGNS[seed % STREET_SIGNS.length];
    if (text) facadeSign(mb, atlas, b, own ? b.sign.edge : edges[0], text, own ? b.sign.color : STREET_NEON[(seed >> 2) % STREET_NEON.length], lights);
  }
  for (const d of b.details) {
    if (d.k !== 'billboard') continue;
    const edge = edges.find((e) => !b.sign || e !== b.sign.edge) ?? edges[0];
    standingPanel(mb, atlas, R, H, edge, d.text, d.color, 1, lights);
  }
}

function palm(mb, t) {
  const h = t.h * 2.05;
  const r = t.r * 1.75;
  const rnd = (k) => hash2(t.seed, k, 71);
  const leanA = rnd(1) * Math.PI * 2;
  const lean = h * (0.06 + rnd(2) * 0.12);
  const lx = Math.cos(leanA) * lean;
  const lz = Math.sin(leanA) * lean;
  mb.mat(MAT.PLAIN);
  let px = t.x;
  let py = 0;
  let pz = t.y;
  const segs = 6;
  for (let i = 1; i <= segs; i += 1) {
    const s = i / segs;
    const x = t.x + lx * s * s;
    const y = h * s;
    const z = t.y + lz * s * s;
    const k = i % 2 ? 1 : 0.88;
    mb.color(0.47 * k, 0.39 * k, 0.29 * k);
    mb.tube(px, py, pz, x, y, z, 3.3 - (i - 1) * 0.28, 3.3 - i * 0.28, 6, i === segs);
    px = x;
    py = y;
    pz = z;
  }
  mb.color(0.36, 0.42, 0.2).mat(MAT.PLAIN);
  mb.blob(px, py - 1, pz, 3.6, 3.2, 3.6, t.seed, 0.1, 3, 6);
  mb.color(0.28, 0.2, 0.1);
  for (let i = 0; i < 3; i += 1) {
    const a = rnd(40 + i) * 6.28;
    mb.blob(px + Math.cos(a) * 3, py - 3, pz + Math.sin(a) * 3, 1.8, 1.8, 1.8, t.seed + i, 0, 2, 4);
  }
  const n = 9 + (t.seed % 3);
  const phase = t.seed % 255;
  const base = [[0.16, 0.38, 0.12], [0.22, 0.46, 0.15], [0.28, 0.52, 0.18], [0.2, 0.42, 0.14]][t.seed % 4];
  for (let f = 0; f < n; f += 1) {
    const a = (f / n) * Math.PI * 2 + rnd(10 + f) * 0.5;
    const L = r * (0.95 + rnd(20 + f) * 0.4);
    const droop = 0.55 + rnd(30 + f) * 0.35;
    const dead = f === 0 && rnd(5) > 0.45;
    const col = dead ? [0.42, 0.32, 0.16] : base.map((v) => v * (0.85 + rnd(50 + f) * 0.3));
    frond(mb, px, py, pz, a, L, droop, col, phase, dead);
  }
}

function frond(mb, tx, ty, tz, a, L, droop, col, phase, dead) {
  const dx = Math.cos(a);
  const dz = Math.sin(a);
  const px = -dz;
  const pz = dx;
  const segs = 5;
  const rows = [];
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const along = L * t * (dead ? 0.4 : 1);
    const up = dead ? -L * 0.8 * t : L * (0.42 * t - droop * t * t);
    const cx = tx + dx * along;
    const cy = ty + up;
    const cz = tz + dz * along;
    const w = L * 0.17 * Math.sin(Math.min(1, t * 1.12) * Math.PI) ** 0.6 + (i === 0 ? 0.8 : 0);
    const fold = w * 0.42;
    const shade = 0.8 + t * 0.35;
    mb.color(col[0] * shade, col[1] * shade, col[2] * shade).mat(MAT.FOLIAGE, Math.round(t * t * 255), phase);
    const l = mb.vert(cx + px * w, cy - fold, cz + pz * w, px * 0.55, 1, pz * 0.55);
    const c = mb.vert(cx, cy, cz, 0, 1, 0);
    const r = mb.vert(cx - px * w, cy - fold, cz - pz * w, -px * 0.55, 1, -pz * 0.55);
    rows.push([l, c, r]);
  }
  for (let i = 0; i < segs; i += 1) {
    const [l0, c0, r0] = rows[i];
    const [l1, c1, r1] = rows[i + 1];
    mb.triN(l0, c0, c1, 0, 1, 0);
    mb.triN(l0, c1, l1, 0, 1, 0);
    mb.triN(c0, r0, r1, 0, 1, 0);
    mb.triN(c0, r1, c1, 0, 1, 0);
  }
}

function shadeTree(mb, t) {
  const h = t.h * 1.9;
  const r = t.r * 1.45;
  mb.color(0.36, 0.27, 0.19).mat(MAT.PLAIN);
  mb.tube(t.x, 0, t.y, t.x, h * 0.8, t.y, 2.6, 1.6, 6, false);
  const greens = [[0.17, 0.36, 0.14], [0.22, 0.44, 0.17], [0.27, 0.5, 0.2]];
  for (let i = 0; i < 4; i += 1) {
    const a = hash2(t.seed, i, 3) * 6.28;
    const o = i === 0 ? 0 : r * 0.42;
    const g = greens[(t.seed + i) % 3];
    mb.color(g[0], g[1], g[2]).mat(MAT.FOLIAGE, 25, (t.seed + i * 40) % 255);
    const rr = r * (i === 0 ? 0.75 : 0.55);
    mb.blob(t.x + Math.cos(a) * o, h * (i === 0 ? 0.95 : 0.8), t.y + Math.sin(a) * o, rr, rr * 0.8, rr, t.seed + i * 7, 0.22, 4, 7);
  }
}

function lamp(mb, l, lights) {
  const H = 62;
  mb.color(0.24, 0.25, 0.28).mat(MAT.METAL);
  mb.box(l.x - 1.8, 0, l.y - 1.8, l.x + 1.8, 3, l.y + 1.8);
  mb.tube(l.x, 0, l.y, l.x, H, l.y, 1.2, 0.9, 6, false);
  const ex = l.x + l.ax * 17;
  const ez = l.y + l.ay * 17;
  mb.tube(l.x, H - 2, l.y, ex, H + 1, ez, 0.8, 0.7, 5, false);
  mb.color(0.3, 0.31, 0.34);
  mb.box(ex - 3.5, H - 1, ez - 3.5, ex + 3.5, H + 2, ez + 3.5);
  mb.color(1, 0.84, 0.6).color2(0.75, 0.76, 0.78).mat(MAT.EMIT, 160, 2);
  mb.box(ex - 2.8, H - 1.8, ez - 2.8, ex + 2.8, H - 0.9, ez + 2.8, '');
  lights.push({ x: ex, y: H - 3, z: ez });
}

function umbrella(mb, u) {
  const c1 = hexRgb(u.c1);
  const c2 = hexRgb(u.c2);
  mb.color(0.95, 0.95, 0.93).mat(MAT.PLAIN);
  mb.box(u.x - 0.5, 0, u.y - 0.5, u.x + 0.5, 23, u.y + 0.5);
  const R = u.r * 1.4;
  for (let i = 0; i < 8; i += 1) {
    const a0 = u.angle + (i / 8) * Math.PI * 2;
    const a1 = u.angle + ((i + 1) / 8) * Math.PI * 2;
    const c = i % 2 ? c2 : c1;
    mb.color(c[0] / 255, c[1] / 255, c[2] / 255).mat(MAT.PLAIN);
    mb.triangle(u.x, 24, u.y, u.x + Math.cos(a0) * R, 18, u.y + Math.sin(a0) * R, u.x + Math.cos(a1) * R, 18, u.y + Math.sin(a1) * R);
  }
  if (u.towel) {
    const tx = u.x + Math.cos(u.angle) * 16;
    const tz = u.y + Math.sin(u.angle) * 16;
    const ax = Math.cos(u.angle + Math.PI / 2);
    const az = Math.sin(u.angle + Math.PI / 2);
    const bx = -az;
    const bz = ax;
    const t = hexRgb(u.towel);
    mb.color(t[0] / 255, t[1] / 255, t[2] / 255).mat(MAT.PLAIN);
    const p = (s, w) => [tx + ax * s + bx * w, tz + az * s + bz * w];
    const q = [p(-13, -7), p(13, -7), p(13, 7), p(-13, 7)];
    mb.quad(q[0][0], 0.35, q[0][1], q[1][0], 0.35, q[1][1], q[2][0], 0.35, q[2][1], q[3][0], 0.35, q[3][1]);
    if (u.person) {
      const skins = [[241, 194, 125], [224, 172, 105], [198, 134, 66], [141, 85, 36], [255, 219, 172]];
      const s = skins[u.skin];
      mb.color(s[0] / 255, s[1] / 255, s[2] / 255);
      mb.xform(frame(tx, 0.35, tz, u.angle + Math.PI / 2));
      mb.box(-8, 0, -2.4, 6, 2.6, 2.4);
      mb.box(6.5, 0, -1.8, 10, 3, 1.8);
      const c = hexRgb(u.c1);
      mb.color(c[0] / 255, c[1] / 255, c[2] / 255);
      mb.box(-2, 2.6, -2.5, 2, 3, 2.5);
      mb.xform(null);
    }
  }
}

function boat(mb, b) {
  const ship = b.kind === 'ship';
  const L = b.len;
  const W = ship ? 70 : L * (b.kind === 'sail' ? 0.32 : 0.36);
  mb.xform(frame(b.x, WATER_Y, b.y, b.angle));
  const top = ship ? 18 : 5;
  const bot = ship ? -8 : -2;
  const outline = [[L / 2, 0], [L * 0.25, W / 2], [-L * 0.1, W / 2], [-L / 2, W * 0.45], [-L / 2, -W * 0.45], [-L * 0.1, -W / 2], [L * 0.25, -W / 2]];
  const hull = hexRgb(b.color);
  const acc = hexRgb(b.accent);
  const n = outline.length;
  for (let i = 0; i < n; i += 1) {
    const p = outline[i];
    const q = outline[(i + 1) % n];
    mb.rgb(hull).mat(MAT.PAINT);
    mb.quad(p[0] * 0.9, bot, p[1] * 0.75, q[0] * 0.9, bot, q[1] * 0.75, q[0], top - 1.5, q[1], p[0], top - 1.5, p[1]);
    mb.rgb(acc).mat(MAT.PAINT);
    mb.quad(p[0], top - 1.5, p[1], q[0], top - 1.5, q[1], q[0], top, q[1], p[0], top, p[1]);
  }
  mb.color(ship ? 0.5 : 0.92, ship ? 0.25 : 0.88, ship ? 0.2 : 0.8).mat(MAT.PLAIN);
  mb.poly(outline.map((p) => [p[0], top, p[1]]));
  if (ship) {
    const colors = [[196, 64, 52], [40, 96, 170], [230, 140, 40], [40, 140, 110], [170, 170, 176]];
    for (let i = 0; i < 9; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        for (let k = 0; k < 2; k += 1) {
          if ((i + j + k) % 5 === 4 && k === 1) continue;
          mb.rgb(colors[(i * 3 + j * 2 + k + 1) % 5]).mat(MAT.FACADE, FACADE.RIBS, i);
          const x0 = -L * 0.32 + i * 30;
          const z0 = -W * 0.36 + j * 16;
          mb.box(x0, top + k * 13, z0, x0 + 27, top + 13 + k * 13, z0 + 14);
        }
      }
    }
    mb.color(0.93, 0.93, 0.9).mat(MAT.FACADE, FACADE.VILLA, 9);
    walls(mb, -L * 0.48, -W * 0.34, -L * 0.48 + 36, W * 0.34, top, top + 46, FACADE.VILLA);
    flatRoof(mb, { x0: -L * 0.48, y0: -W * 0.34, x1: -L * 0.48 + 36, y1: W * 0.34 }, top + 46, [80, 90, 100], [236, 236, 230]);
    mb.color(0.85, 0.3, 0.2).mat(MAT.PLAIN);
    mb.tube(-L * 0.43, top + 46, 0, -L * 0.43, top + 64, 0, 5, 5, 8, true);
  } else if (b.kind === 'sail') {
    mb.color(0.85, 0.85, 0.85).mat(MAT.METAL);
    mb.box(L * 0.1 - 0.6, top, -0.6, L * 0.1 + 0.6, top + L * 1.1, 0.6);
    mb.color(0.98, 0.98, 0.96).mat(MAT.PLAIN);
    mb.triangle(L * 0.1, top + L * 1.05, 0, L * 0.1, top + 3, 0, -L * 0.38, top + 4, 0);
    mb.triangle(L * 0.12, top + L * 0.9, 0.3, L * 0.46, top + 2, 0.3, L * 0.12, top + 3, 0.3);
  } else {
    mb.color(0.95, 0.95, 0.93).mat(MAT.PLAIN);
    mb.box(-L * 0.32, top, -W * 0.3, L * 0.05, top + (b.kind === 'yacht' ? 9 : 5), W * 0.3);
    mb.color(0.15, 0.22, 0.3).mat(MAT.GLASS);
    mb.box(L * 0.05, top, -W * 0.28, L * 0.14, top + 4, W * 0.28);
    if (b.kind === 'yacht') {
      mb.color(0.95, 0.95, 0.93).mat(MAT.PLAIN);
      mb.box(-L * 0.25, top + 9, -W * 0.22, -L * 0.04, top + 14, W * 0.22);
      mb.color(0.15, 0.22, 0.3).mat(MAT.GLASS);
      mb.box(-L * 0.04, top + 9, -W * 0.2, L * 0.01, top + 13, W * 0.2);
    }
  }
  mb.xform(null);
}

function plane(mb, p) {
  const s = p.span * 1.3;
  const col = hexRgb(p.color);
  const acc = hexRgb(p.accent);
  mb.xform(frame(p.x, 0, p.y, p.angle));
  const y = s * 0.11;
  mb.rgb(col).mat(MAT.PAINT);
  mb.tube(-s * 0.48, y + 1, 0, s * 0.36, y, 0, s * 0.035, s * 0.065, 10, false);
  mb.tube(s * 0.36, y, 0, s * 0.48, y - 1, 0, s * 0.065, s * 0.012, 10, true);
  mb.box(-s * 0.06, y - 1.5, -s * 0.5, s * 0.08, y - 0.3, s * 0.5);
  mb.box(-s * 0.48, y + 1, -s * 0.16, -s * 0.4, y + 1.8, s * 0.16);
  mb.rgb(acc).mat(MAT.PAINT);
  mb.poly([[-s * 0.47, y + 2, 0], [-s * 0.36, y + 2, 0], [-s * 0.47, y + s * 0.18, 0]]);
  mb.box(-s * 0.4, y - 0.4, -s * 0.072, s * 0.3, y + 0.4, s * 0.072);
  mb.color(0.12, 0.16, 0.22).mat(MAT.GLASS);
  mb.box(s * 0.3, y + s * 0.02, -s * 0.03, s * 0.38, y + s * 0.05, s * 0.03);
  mb.color(0.1, 0.1, 0.1).mat(MAT.PLAIN);
  for (const [x, z] of [[s * 0.3, 0], [-s * 0.02, -s * 0.08], [-s * 0.02, s * 0.08]]) mb.box(x - 1.5, 0, z - 1, x + 1.5, y - 2, z + 1);
  if (p.jet) {
    mb.rgb(col, 0.8).mat(MAT.METAL);
    for (const z of [-s * 0.22, s * 0.22]) mb.tube(s * 0.02, y - 4, z, s * 0.16, y - 4, z, 3.5, 3.5, 8, true);
  }
  mb.xform(null);
}

function crane(mb, c) {
  const H = c.h * 1.6;
  mb.color(0.92, 0.47, 0.16).mat(MAT.METAL);
  const legs = [[-26, -30], [26, -30], [26, 30], [-26, 30]];
  for (const [dx, dz] of legs) mb.box(c.x + dx - 3, 0, c.y + dz - 3, c.x + dx + 3, H, c.y + dz + 3);
  mb.box(c.x - 29, H - 6, c.y - 33, c.x + 29, H, c.y - 27);
  mb.box(c.x - 29, H - 6, c.y + 27, c.x + 29, H, c.y + 33);
  mb.box(c.x - 29, H * 0.45, c.y - 33, c.x - 23, H * 0.45 + 5, c.y + 33);
  mb.box(c.x + 23, H * 0.45, c.y - 33, c.x + 29, H * 0.45 + 5, c.y + 33);
  mb.color(0.95, 0.55, 0.2);
  mb.box(c.x - 230, H, c.y - 5, c.x + 80, H + 9, c.y + 5);
  mb.box(c.x + 60, H + 9, c.y - 4, c.x + 70, H + 40, c.y + 4);
  mb.color(0.3, 0.34, 0.38).mat(MAT.PLAIN);
  mb.box(c.x - 70, H - 12, c.y - 7, c.x - 52, H, c.y + 7);
  mb.color(1, 0.15, 0.1).color2(0.4, 0.1, 0.1).mat(MAT.EMIT, 255, 1);
  mb.box(c.x - 232, H + 9, c.y - 2, c.x - 228, H + 12, c.y + 2, '');
  mb.box(c.x + 63, H + 40, c.y - 2, c.x + 67, H + 43, c.y + 2, '');
}

/** Rails and deck edges where a road crosses open water (spans found when the ground was painted). */
function bridges(mb, road) {
  const spans = road.spans ?? [];
  if (!spans.length) return;
  for (const [a, b] of spans) {
    for (const side of [-1, 1]) {
      const off = side * (road.hw + 3);
      const offOut = side * (road.hw + 6);
      if (road.vertical) {
        const x = road.x0 + off;
        mb.color(0.84, 0.83, 0.8).mat(MAT.PLAIN);
        mb.box(x - 1.5, 0, road.y0 + a, x + 1.5, 5.5, road.y0 + b);
        mb.color(0.62, 0.62, 0.6);
        mb.quad(road.x0 + offOut, 0, road.y0 + a, road.x0 + offOut, 0, road.y0 + b, road.x0 + offOut, WATER_Y - 1, road.y0 + b, road.x0 + offOut, WATER_Y - 1, road.y0 + a);
      } else {
        const z = road.y0 + off;
        mb.color(0.84, 0.83, 0.8).mat(MAT.PLAIN);
        mb.box(road.x0 + a, 0, z - 1.5, road.x0 + b, 5.5, z + 1.5);
        mb.color(0.62, 0.62, 0.6);
        mb.quad(road.x0 + a, 0, road.y0 + offOut, road.x0 + b, 0, road.y0 + offOut, road.x0 + b, WATER_Y - 1, road.y0 + offOut, road.x0 + a, WATER_Y - 1, road.y0 + offOut);
      }
    }
  }
}

function pier(mb, p) {
  mb.color(0.36, 0.28, 0.2).mat(MAT.PLAIN);
  for (let x = p.x0 + 6; x < p.x1; x += 30) {
    for (const z of [p.y0, p.y1]) mb.box(x - 1.4, WATER_Y - 2, z - 1.4, x + 1.4, 4, z + 1.4);
  }
  mb.color(0.45, 0.35, 0.25);
  mb.quad(p.x0, 0, p.y1, p.x1, 0, p.y1, p.x1, -2, p.y1, p.x0, -2, p.y1);
  mb.quad(p.x1, 0, p.y0, p.x0, 0, p.y0, p.x0, -2, p.y0, p.x1, -2, p.y0);
}

function fountain(mb, cx, cz, r) {
  mb.color(0.85, 0.82, 0.76).mat(MAT.PLAIN);
  mb.tube(cx, 0, cz, cx, 3.5, cz, r, r, 16, false);
  mb.color(0.3, 0.7, 0.8).mat(MAT.POOL);
  mb.disc(cx, 3, cz, r * 0.9, 16);
  mb.color(0.88, 0.86, 0.8).mat(MAT.PLAIN);
  mb.tube(cx, 0, cz, cx, 12, cz, r * 0.16, r * 0.12, 8, true);
  mb.tube(cx, 12, cz, cx, 13.5, cz, r * 0.4, r * 0.45, 10, true);
}

function marketStalls(mb, lot) {
  const colors = [['#e63946', '#fff1e6'], ['#2a9d8f', '#f1faee'], ['#f4a261', '#ffffff'], ['#457b9d', '#f1faee'], ['#e9c46a', '#8d5524'], ['#ff7eb6', '#ffffff']];
  const w = lot.x1 - lot.x0;
  const h = lot.y1 - lot.y0;
  let n = 0;
  for (let sy = lot.y0 + 16; sy + 24 < lot.y1 - 10; sy += 46) {
    for (let sx = lot.x0 + 14; sx + 32 < lot.x1 - 10; sx += 44) {
      n += 1;
      if (Math.hypot(sx + 16 - (lot.x0 + w / 2), sy + 12 - (lot.y0 + h / 2)) < 50) continue;
      const [c1, c2] = colors[n % colors.length];
      mb.color(0.45, 0.33, 0.22).mat(MAT.PLAIN);
      mb.box(sx + 2, 0, sy + 14, sx + 30, 8, sy + 22);
      for (const [px, pz] of [[sx + 1, sy + 1], [sx + 31, sy + 1], [sx + 1, sy + 23], [sx + 31, sy + 23]]) mb.box(px - 0.6, 0, pz - 0.6, px + 0.6, 16, pz + 0.6);
      for (let s = 0; s < 4; s += 1) {
        const c = hexRgb(s % 2 ? c2 : c1);
        mb.color(c[0] / 255, c[1] / 255, c[2] / 255);
        mb.quad(sx + s * 8, 18, sy - 1, sx + s * 8 + 8, 18, sy - 1, sx + s * 8 + 8, 15, sy + 25, sx + s * 8, 15, sy + 25);
      }
    }
  }
}

function chunkBounds(mb) {
  const f = mb.f32;
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < mb.vcount; i += 1) {
    const x = f[i * 9];
    const y = f[i * 9 + 1];
    const z = f[i * 9 + 2];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0: x0 - 8, y0: y0 - 8, z0: z0 - 8, x1: x1 + 8, y1: y1 + 8, z1: z1 + 8 };
}

/** Build and upload every static chunk; returns { chunks, lamps, signs, stats }. */
export function buildCityMeshes(gl, city, atlas) {
  const cols = Math.ceil(city.width / SCH);
  const rows = Math.ceil(city.height / SCH);
  const builders = new Map();
  const at = (x, z) => {
    const cx = clamp(Math.floor(x / SCH), 0, cols - 1);
    const cz = clamp(Math.floor(z / SCH), 0, rows - 1);
    const key = cz * cols + cx;
    let mb = builders.get(key);
    if (!mb) {
      mb = new MeshBuilder(32768, 65536);
      builders.set(key, mb);
    }
    return mb;
  };
  const lamps = [];
  const signs = [];
  for (const b of city.buildings) building(at((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), b, atlas, signs);
  for (const t of city.trees) {
    if (t.kind === 'palm') palm(at(t.x, t.y), t);
    else shadeTree(at(t.x, t.y), t);
  }
  for (const l of city.lamps) lamp(at(l.x, l.y), l, lamps);
  for (const u of city.umbrellas) umbrella(at(u.x, u.y), u);
  for (const b of city.boats) boat(at(b.x, b.y), b);
  for (const p of city.planes) plane(at(p.x, p.y), p);
  for (const c of city.cranes ?? []) crane(at(c.x, c.y), c);
  for (const p of city.piers) pier(at((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2), p);
  for (const r of city.roads) bridges(at((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), r);
  for (const lot of city.lots) {
    const w = lot.x1 - lot.x0;
    const h = lot.y1 - lot.y0;
    if (lot.kind === 'plaza') fountain(at(lot.x0 + w / 2, lot.y0 + h / 2), lot.x0 + w / 2, lot.y0 + h / 2, Math.min(w, h) * 0.2);
    else if (lot.kind === 'market') {
      fountain(at(lot.x0 + w / 2, lot.y0 + h / 2), lot.x0 + w / 2, lot.y0 + h / 2, 26);
      marketStalls(at(lot.x0 + w / 2, lot.y0 + h / 2), lot);
    }
  }
  const chunks = [];
  let verts = 0;
  let tris = 0;
  for (const mb of builders.values()) {
    if (mb.icount === 0) continue;
    verts += mb.vcount;
    tris += mb.icount / 3;
    chunks.push({ mesh: createStaticMesh(gl, mb), ...chunkBounds(mb) });
  }
  return { chunks, lamps, signs, stats: { verts, tris } };
}
