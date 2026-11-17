// GLSL for the 3D view. Every lit surface shares one sky model (gradient, sun halo, clouds), sun
// lighting with a PCF shadow map, up to 32 point/spot lights (lamps, neon, headlights, light
// bars, fire, muzzle flashes, the searchlight) and distance fog tinted by the sky. Materials are
// picked per vertex: plain, procedural window facades, emissive neon, sign text, glass, swaying
// foliage, pools, glossy car paint and metal. Ground, water, sky, effects and the HDR post chain
// (bright pass, bloom, ACES tone map, grade) have their own programs.

const HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

const COMMON = `
uniform vec3 u_camPos;
uniform vec3 u_sunDir;
uniform vec3 u_skySun;
uniform vec3 u_sunCol;
uniform vec3 u_zenith;
uniform vec3 u_horizon;
uniform vec3 u_horizon2;
uniform vec3 u_glowCol;
uniform vec3 u_ambSky;
uniform vec3 u_ambGround;
uniform float u_night;
uniform float u_neon;
uniform float u_time;
uniform float u_fogDen;
uniform float u_fogStart;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += vnoise(p) * a;
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }

// The sky seen along direction d (no sun disc, no clouds).
vec3 skyBase(vec3 d) {
  float y = d.y;
  // The horizon is warm toward the sun and cools to violet opposite it.
  vec2 sh = normalize(u_skySun.xz + vec2(1e-4, 0.0));
  vec2 dh = normalize(d.xz + vec2(1e-4, 0.0));
  float toward = dot(sh, dh) * 0.5 + 0.5;
  vec3 hor = mix(u_horizon2, u_horizon, smoothstep(0.05, 1.0, toward * toward));
  vec3 c = mix(hor, u_zenith, pow(clamp(y, 0.0, 1.0), 0.36));
  if (y < 0.0) c = mix(hor, hor * 0.55 + u_zenith * 0.12, clamp(-y * 2.5, 0.0, 1.0));
  float sd = max(dot(d, u_skySun), 0.0);
  float hz = exp(-abs(y - u_skySun.y) * 6.0);
  c += u_glowCol * (pow(sd, 7.0) * 0.42 * (0.3 + 0.7 * hz) + pow(sd, 48.0) * 0.8 + pow(sd, 500.0) * 2.0);
  return c;
}
vec3 fogColor(vec3 d) {
  vec3 f = skyBase(normalize(vec3(d.x, 0.015 + max(d.y, 0.0) * 0.25, d.z)));
  return f;
}
vec3 applyFog(vec3 col, vec3 p) {
  vec3 dv = p - u_camPos;
  float dist = length(dv);
  float d = max(dist - u_fogStart, 0.0);
  float f = 1.0 - exp(-d * d * u_fogDen * u_fogDen);
  // Height falloff: the haze sits low over the water and streets.
  float h = clamp(1.0 - max(p.y, 0.0) / 900.0, 0.35, 1.0);
  return mix(col, fogColor(dv / max(dist, 1e-3)), clamp(f * h, 0.0, 1.0));
}
`;

const LIGHTS = `
#define MAXL 32
uniform vec4 u_lPos[MAXL];
uniform vec4 u_lCol[MAXL];
uniform vec4 u_lDir[MAXL];
uniform int u_nL;
uniform highp sampler2DShadow u_shadow;
uniform mat4 u_shadowMat;
uniform float u_shadowOn;
uniform float u_shadowTexel;

float shadowAt(vec3 p, vec3 n) {
  if (u_shadowOn < 0.5) return 1.0;
  vec4 s = u_shadowMat * vec4(p + n * 1.2, 1.0);
  vec3 c = s.xyz / s.w * 0.5 + 0.5;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  float sum = 0.0;
  float ts = u_shadowTexel * 1.25;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      sum += texture(u_shadow, vec3(c.xy + vec2(float(i), float(j)) * ts, c.z - 0.0009));
    }
  }
  float sh = sum / 9.0;
  vec2 e = min(c.xy, 1.0 - c.xy);
  return mix(1.0, sh, clamp(min(e.x, e.y) * 14.0, 0.0, 1.0));
}

void addLights(vec3 p, vec3 n, vec3 V, float gloss, float specK, inout vec3 diff, inout vec3 spec) {
  for (int i = 0; i < MAXL; i++) {
    if (i >= u_nL) break;
    vec3 L = u_lPos[i].xyz - p;
    float r = u_lPos[i].w;
    float d2 = dot(L, L);
    if (d2 > r * r) continue;
    float d = sqrt(d2);
    L /= max(d, 0.001);
    float k = 1.0 - d / r;
    float att = k * k / (1.0 + d * 0.004);
    if (u_lCol[i].w > -1.5) att *= smoothstep(u_lCol[i].w, u_lDir[i].w, dot(-L, u_lDir[i].xyz));
    vec3 c = u_lCol[i].rgb * att;
    diff += c * (max(dot(n, L), 0.0) * 0.8 + 0.2);
    vec3 H = normalize(L + V);
    spec += c * pow(max(dot(n, H), 0.0), gloss) * specK;
  }
}
`;

export const LIT_VS = `${HEADER}
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec4 a_nrm;
layout(location = 2) in vec4 a_col;
layout(location = 3) in vec4 a_col2;
layout(location = 4) in vec2 a_uv;
layout(location = 5) in vec4 a_mat;
uniform mat4 u_viewProj;
uniform float u_time;
out vec3 v_pos;
out vec3 v_nrm;
out vec4 v_col;
out vec4 v_col2;
out vec2 v_uv;
flat out vec4 v_mat;
void main() {
  vec3 p = a_pos;
  if (int(a_mat.x + 0.5) == 5 && a_mat.y > 0.0) {
    float w = a_mat.y / 255.0 * 6.0;
    float ph = a_mat.z / 255.0 * 6.2831;
    p.x += sin(u_time * 1.3 + ph) * w;
    p.z += cos(u_time * 1.05 + ph * 1.7) * w * 0.7;
    p.y += sin(u_time * 1.7 + ph) * w * 0.25;
  }
  v_pos = p;
  v_nrm = a_nrm.xyz;
  v_col = a_col;
  v_col2 = a_col2;
  v_uv = a_uv;
  v_mat = a_mat;
  gl_Position = u_viewProj * vec4(p, 1.0);
}
`;

export const LIT_FS = `${HEADER}
${COMMON}
${LIGHTS}
in vec3 v_pos;
in vec3 v_nrm;
in vec4 v_col;
in vec4 v_col2;
in vec2 v_uv;
flat in vec4 v_mat;
uniform sampler2D u_atlas;
uniform float u_nearFade;
out vec4 o;

vec3 skyRefl(vec3 R) {
  vec3 s = skyBase(normalize(vec3(R.x, max(R.y, -0.4), R.z)));
  if (R.y < 0.0) s = mix(s, u_ambGround * 0.6, clamp(-R.y * 3.0, 0.0, 1.0));
  return s;
}

void main() {
  // Anything right in front of the lens dissolves (dithered) instead of clipping the near plane.
  float dEye = length(u_camPos - v_pos);
  if (dEye < u_nearFade && dEye < u_nearFade * (0.35 + 0.65 * hash12(gl_FragCoord.xy))) discard;
  vec3 n = normalize(v_nrm);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(u_camPos - v_pos);
  int m = int(v_mat.x + 0.5);
  vec3 base = toLin(v_col.rgb);
  vec3 emit = vec3(0.0);
  float specK = 0.06;
  float gloss = 24.0;
  float refl = 0.0;
  float win = 0.0;
  vec3 glassCol = vec3(0.0);
  float alpha = 1.0;
  float sh = shadowAt(v_pos, n);

  if (m == 1) {
    // Facades: floors of windows by style; glass reflects the sky; a share light up at night.
    int style = int(v_mat.y + 0.5);
    float seed = v_mat.z;
    float u = v_uv.x;
    float h = v_uv.y;
    float floorH = 30.0;
    float colW = 18.0;
    float ww = 0.5;
    float wh = 0.52;
    float sill = 0.28;
    if (style == 0) { floorH = 27.0; colW = 11.0; ww = 0.9; wh = 0.72; sill = 0.2; }
    else if (style == 1) { floorH = 30.0; colW = 19.0; ww = 0.5; wh = 0.5; sill = 0.3; }
    else if (style == 2) { floorH = 29.0; colW = 21.0; ww = 0.36; wh = 0.5; sill = 0.3; }
    else if (style == 3) { floorH = 32.0; colW = 30.0; ww = 0.5; wh = 0.46; sill = 0.32; }
    vec3 tint = toLin(v_col2.rgb);
    float fi = floor(h / floorH);
    float ci = floor(u / colW);
    vec2 cell = vec2(fract(u / colW), fract(h / floorH));
    vec2 fw = fwidth(vec2(u / colW, h / floorH)) + 1e-4;
    float far = clamp(max(fw.x, fw.y) * 2.5 - 0.6, 0.0, 1.0);
    bool shop = (style == 0 || style == 1 || style == 2 || style == 7) && h < floorH;
    if (shop) { ww = 0.86; wh = 0.62; sill = 0.1; }
    if (style == 4 || style == 5) {
      float rib = style == 5 ? 3.0 : 6.0;
      float r = smoothstep(0.35, 0.5, abs(fract(u / rib) - 0.5));
      base *= mix(0.9 + 0.12 * r, 0.95, far);
    } else if (style != 6) {
      float wx = smoothstep(0.5 - ww * 0.5 - fw.x, 0.5 - ww * 0.5 + fw.x, cell.x) * (1.0 - smoothstep(0.5 + ww * 0.5 - fw.x, 0.5 + ww * 0.5 + fw.x, cell.x));
      float wy = smoothstep(sill - fw.y, sill + fw.y, cell.y) * (1.0 - smoothstep(sill + wh - fw.y, sill + wh + fw.y, cell.y));
      win = mix(wx * wy, ww * wh, far);
      if (style == 2) {
        // Painted shutters beside each window.
        float sx = abs(cell.x - 0.5);
        float shut = step(ww * 0.5, sx) * step(sx, ww * 0.5 + 0.13) * wy;
        base = mix(base, toLin(seed > 127.0 ? vec3(0.16, 0.47, 0.43) : vec3(0.24, 0.35, 0.6)), shut * (1.0 - far));
      }
      if (style == 1) {
        // Deco eyebrow ledges over the windows.
        float ledge = smoothstep(sill + wh + 0.02, sill + wh + 0.05, cell.y) * (1.0 - smoothstep(sill + wh + 0.09, sill + wh + 0.12, cell.y));
        base *= 1.0 + ledge * 0.25 * (1.0 - far);
      }
      vec3 R = reflect(-V, n);
      float fres = 0.18 + 0.82 * pow(1.0 - max(dot(n, V), 0.0), 3.0);
      vec3 sky = skyRefl(R);
      float pane = hash12(vec2(ci * 0.71 + seed, fi * 1.93 - seed));
      tint *= 0.78 + 0.44 * pane;
      fres *= 0.75 + 0.5 * pane * (1.0 - far);
      glassCol = mix(tint * (u_ambSky * 0.6 + u_sunCol * 0.08), sky * (style == 0 ? 0.9 : 0.65) * mix(vec3(1.0), tint * 1.6 + 0.3, 0.35), fres);
      glassCol += u_sunCol * pow(max(dot(R, u_sunDir), 0.0), 220.0) * 6.0 * sh;
      float hs = hash12(vec2(ci * 1.37 + seed * 3.1, fi * 2.11 + seed));
      float litFrac = (shop ? 0.85 : 0.08 + 0.17 * u_night);
      float lit = step(hs, litFrac) * u_neon;
      vec3 warm = fract(hs * 7.0) > 0.8 ? vec3(0.55, 0.7, 1.0) : fract(hs * 5.0) > 0.5 ? vec3(1.0, 0.58, 0.26) : vec3(1.0, 0.72, 0.42);
      // Interior falloff: brighter toward the window's lower half, like a lit room.
      float room = 0.65 + 0.35 * (1.0 - smoothstep(sill, sill + wh, cell.y));
      float k = 0.4 + fract(hs * 13.0) * 0.45;
      if (shop) {
        int pick = int(mod(seed * 0.37 + floor(ci / 3.0), 4.0));
        warm = pick == 0 ? vec3(1.0, 0.62, 0.32) : pick == 1 ? vec3(1.0, 0.3, 0.75) : pick == 2 ? vec3(0.25, 0.85, 1.0) : vec3(0.75, 0.4, 1.0);
        k = 1.5;
      }
      emit += toLin(warm) * lit * k * room * win;
      if (u_neon > 0.0) glassCol *= 1.0 - lit * 0.7;
    }
    // Contact shadow at the foot of every wall.
    base *= 0.62 + 0.38 * smoothstep(0.0, 14.0, h);
    specK = 0.04;
  } else if (m == 2) {
    // Emissive: neon tubes, lamps, lights. col = glow colour, col2 = unlit look.
    float k = v_mat.y / 255.0 * 10.0;
    int mode = int(v_mat.z + 0.5);
    float on = mode == 0 ? 1.0 : mode == 1 ? u_neon : clamp(u_neon * 1.2, 0.0, 1.0);
    emit = toLin(v_col.rgb) * k * on;
    base = toLin(v_col2.rgb) * (1.0 - on * 0.85);
  } else if (m == 3) {
    // Signs from the text atlas: neon letters on a dark panel, or a billboard print.
    vec4 t = texture(u_atlas, v_uv);
    float kind = v_mat.y;
    vec3 neon = toLin(v_col.rgb);
    if (kind < 0.5) {
      vec3 panel = vec3(0.025, 0.02, 0.04);
      float core = smoothstep(0.55, 0.95, t.a);
      base = mix(panel, neon * 0.9, t.a);
      emit = (neon * t.a * 3.5 + vec3(1.0) * core * 2.0) * (0.25 + 0.75 * u_neon) + neon * t.a * 0.5;
    } else {
      // Printed boards: the lettering takes the vertex colour over the background colour.
      vec3 bg = toLin(v_col2.rgb);
      base = mix(bg, toLin(v_col.rgb), t.a);
      emit = base * (0.1 + 0.7 * u_neon);
    }
    specK = 0.15;
  } else if (m == 4) {
    // Tinted glass.
    vec3 R = reflect(-V, n);
    float fres = 0.3 + 0.7 * pow(1.0 - max(dot(n, V), 0.0), 3.0);
    glassCol = mix(base * 0.25 * (u_ambSky + u_sunCol * 0.2), skyRefl(R) * 0.85, fres);
    glassCol += u_sunCol * pow(max(dot(R, u_sunDir), 0.0), 300.0) * 8.0 * sh;
    win = 1.0;
    specK = 0.6;
    gloss = 80.0;
  } else if (m == 5) {
    // Foliage: soft translucency when the sun is behind the leaves.
    float back = pow(max(dot(-V, u_sunDir), 0.0), 3.0);
    emit += base * u_sunCol * back * 0.35 * sh;
    specK = 0.02;
  } else if (m == 6) {
    // Pool water.
    vec3 R = reflect(-V, n);
    float caust = vnoise(v_pos.xz * 0.35 + vec2(u_time * 0.4, u_time * 0.3)) * vnoise(v_pos.xz * 0.5 - vec2(u_time * 0.3, 0.0));
    base = mix(toLin(vec3(0.15, 0.75, 0.85)), toLin(vec3(0.6, 0.98, 1.0)), caust);
    glassCol = mix(base * (u_ambSky + u_sunCol * 0.5), skyRefl(R), 0.25);
    emit = toLin(vec3(0.1, 0.8, 1.0)) * u_neon * 1.2;
    win = 1.0;
  } else if (m == 7) {
    // Car paint: diffuse plus a clear coat reflecting the sky.
    vec3 R = reflect(-V, n);
    float fres = 0.05 + 0.6 * pow(1.0 - max(dot(n, V), 0.0), 4.0);
    refl = fres;
    specK = 1.4;
    gloss = 160.0;
    glassCol = skyRefl(R);
  } else if (m == 8) {
    specK = 0.5;
    gloss = 40.0;
  }

  vec3 amb = mix(u_ambGround, u_ambSky, n.y * 0.5 + 0.5);
  float ndl = max(dot(n, u_sunDir), 0.0);
  vec3 ld = vec3(0.0);
  vec3 ls = vec3(0.0);
  addLights(v_pos, n, V, gloss, specK + 0.1, ld, ls);
  vec3 col = base * (amb + u_sunCol * ndl * sh + ld);
  vec3 H = normalize(u_sunDir + V);
  col += u_sunCol * specK * pow(max(dot(n, H), 0.0), gloss) * sh * ndl + ls;
  if (refl > 0.0) col = mix(col, glassCol, refl);
  if (win > 0.0) col = mix(col, glassCol + ls * 0.3, win);
  col += emit;
  o = vec4(applyFog(col, v_pos), alpha);
}
`;

export const GROUND_VS = `${HEADER}
layout(location = 0) in vec3 a_pos;
uniform mat4 u_viewProj;
out vec3 v_pos;
void main() {
  v_pos = a_pos;
  gl_Position = u_viewProj * vec4(a_pos, 1.0);
}
`;

export const GROUND_FS = `${HEADER}
${COMMON}
${LIGHTS}
in vec3 v_pos;
uniform sampler2D u_tex;
uniform vec4 u_rect;
uniform float u_wet;
out vec4 o;
void main() {
  vec2 uv = (v_pos.xz - u_rect.xy) * u_rect.zw;
  vec4 t = texture(u_tex, uv);
  if (t.a < 0.03) discard;
  vec3 base = toLin(t.rgb);
  float dist = length(v_pos - u_camPos);
  float near = 1.0 - smoothstep(150.0, 700.0, dist);
  float dn = vnoise(v_pos.xz * 0.45) * 0.5 + vnoise(v_pos.xz * 1.7) * 0.35 + vnoise(v_pos.xz * 0.06) * 0.6;
  base *= mix(1.0, 0.8 + 0.3 * dn, near * 0.8 + 0.2);
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 V = normalize(u_camPos - v_pos);
  float sh = shadowAt(v_pos, n);
  float lum = dot(t.rgb, vec3(0.3, 0.55, 0.15));
  float wet = (1.0 - smoothstep(0.2, 0.55, lum)) * (0.15 + u_wet * 0.85);
  vec3 ld = vec3(0.0);
  vec3 ls = vec3(0.0);
  addLights(v_pos, n, V, 30.0 + wet * 110.0, wet * (1.2 + u_wet * 2.2), ld, ls);
  float ndl = max(u_sunDir.y, 0.0);
  vec3 col = base * (u_ambSky * 0.95 + u_sunCol * ndl * sh + ld) + ls;
  vec3 H = normalize(u_sunDir + V);
  col += u_sunCol * pow(max(dot(n, H), 0.0), 50.0) * wet * 0.5 * sh;
  // Wet asphalt mirrors a little of the sky at night.
  vec3 R = reflect(-V, n);
  col += skyBase(R) * wet * 0.12 * pow(1.0 - V.y, 3.0);
  o = vec4(applyFog(col, v_pos), t.a);
}
`;

export const WATER_VS = GROUND_VS;

export const WATER_FS = `${HEADER}
${COMMON}
${LIGHTS}
in vec3 v_pos;
uniform sampler2D u_sdf;
uniform vec4 u_sdfRect;
out vec4 o;
vec2 waveGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.045 + t * 1.1) * 0.9;
  g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 0.07 + t * 1.5) * 0.6;
  g += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 0.13 + t * 2.1) * 0.35;
  g += vec2(vnoise(p * 0.08 + t * 0.35) - 0.5, vnoise(p * 0.08 - t * 0.3 + 7.0) - 0.5) * 0.3;
  g += vec2(vnoise(p * 0.32 + t * 0.9) - 0.5, vnoise(p * 0.31 - t * 0.8 + 3.0) - 0.5) * 1.1;
  g += vec2(vnoise(p * 0.9 - t * 1.4) - 0.5, vnoise(p * 0.85 + t * 1.2 + 5.0) - 0.5) * 0.6;
  return g;
}
void main() {
  vec2 uv = (v_pos.xz - u_sdfRect.xy) * u_sdfRect.zw;
  float sd = texture(u_sdf, uv).r * 255.0 - 64.0;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) sd = 191.0;
  vec3 V = normalize(u_camPos - v_pos);
  float dist = length(v_pos - u_camPos);
  float amp = 0.075 * (1.0 - smoothstep(200.0, 2200.0, dist)) + 0.02;
  vec2 g = waveGrad(v_pos.xz, u_time) * amp;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  float depth = clamp(sd / 200.0, 0.0, 1.0);
  vec3 shallow = toLin(vec3(0.14, 0.68, 0.66));
  vec3 deep = toLin(vec3(0.03, 0.24, 0.38));
  vec3 body = mix(shallow, deep, pow(depth, 0.6));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = skyBase(normalize(vec3(R.x, clamp(abs(R.y), 0.02, 0.22), R.z)));
  vec3 ld = vec3(0.0);
  vec3 ls = vec3(0.0);
  addLights(v_pos, n, V, 120.0, 2.5, ld, ls);
  float sh = 1.0;
  vec3 col = body * (u_ambSky * 1.5 + u_sunCol * (max(u_sunDir.y, 0.0) * 0.5 + 0.06) + ld * 0.4);
  col = mix(col, sky * mix(vec3(1.0), body * 4.0 + 0.4, 0.3), clamp(fres * 0.62, 0.0, 0.62));
  // Sun glitter: a sharp highlight broken up by sparkles along a path toward the sun.
  float sp = max(dot(R, u_sunDir), 0.0);
  float sparkle = smoothstep(0.62, 0.82, vnoise(v_pos.xz * 1.3 + u_time * 1.5)) * smoothstep(0.35, 0.6, vnoise(v_pos.xz * 0.21 - u_time * 0.3));
  col += u_sunCol * (pow(sp, 900.0) * 30.0 + pow(sp, 45.0) * 5.0 * sparkle + pow(sp, 12.0) * 0.24) * sh;
  col += ls;
  // Foam along the shore.
  float fn = vnoise(v_pos.xz * 0.12 + u_time * 0.2);
  float band = sin(sd * 0.55 - u_time * 1.6 + fn * 6.0) * 0.5 + 0.5;
  float foam = (1.0 - smoothstep(2.0, 16.0, sd + fn * 6.0)) * (0.55 + 0.45 * band);
  foam += (1.0 - smoothstep(14.0, 26.0, sd + fn * 8.0)) * smoothstep(0.75, 0.95, band) * 0.5;
  col = mix(col, (u_ambSky + u_sunCol * max(u_sunDir.y, 0.05)) * 0.95, clamp(foam, 0.0, 1.0) * 0.85);
  o = vec4(applyFog(col, v_pos), 1.0);
}
`;

export const SKY_VS = `${HEADER}
out vec2 v_ndc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  v_ndc = p;
  gl_Position = vec4(p, 0.9999, 1.0);
}
`;

export const SKY_FS = `${HEADER}
${COMMON}
in vec2 v_ndc;
uniform mat4 u_invViewProj;
uniform vec3 u_sunDisc;
uniform float u_sunSize;
uniform float u_cloudK;
out vec4 o;
void main() {
  vec4 p = u_invViewProj * vec4(v_ndc, 1.0, 1.0);
  vec3 d = normalize(p.xyz / p.w - u_camPos);
  vec3 col = skyBase(d);
  float sd = dot(d, u_skySun);
  float disc = smoothstep(cos(u_sunSize), cos(u_sunSize * 0.8), sd);
  // Clouds: streaky fbm on a dome, lit warm from below near the sun.
  if (d.y > -0.02) {
    vec2 cuv = d.xz / (d.y + 0.12) * 1.1 + vec2(u_time * 0.004, 0.0);
    float c = fbm(cuv * vec2(0.8, 2.2) + vec2(3.0, 1.0));
    float cov = smoothstep(0.58, 0.8, c) * smoothstep(0.0, 0.1, d.y) * u_cloudK;
    float lit = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(u_skySun.x, 0.0, u_skySun.z))), 0.0), 3.0);
    vec3 shade = u_zenith * 1.4 + u_horizon2 * 0.35;
    vec3 pink = u_horizon2 * 1.7 + u_glowCol * 0.22;
    vec3 rim = u_glowCol * 1.1 + u_horizon * 0.5;
    float tops = smoothstep(0.6, 0.85, c);
    vec3 cc = mix(shade, pink, (1.0 - u_night) * (0.35 + 0.45 * tops));
    cc = mix(cc, rim, lit * (1.0 - u_night) * (0.35 + 0.65 * tops));
    disc *= 1.0 - cov * 0.85;
    col = mix(col, cc, cov * 0.85);
  }
  col += u_sunDisc * disc;
  // Stars by night.
  if (u_night > 0.3 && d.y > 0.0) {
    vec2 sp = d.xz / (d.y + 1.0) * 220.0;
    float h = hash12(floor(sp));
    float star = step(0.995, h) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5));
    col += vec3(star) * (u_night - 0.3) * 2.0 * smoothstep(0.0, 0.3, d.y);
  }
  o = vec4(col, 1.0);
}
`;

export const FX_VS = `${HEADER}
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec4 a_nrm;
layout(location = 2) in vec4 a_col;
layout(location = 4) in vec2 a_uv;
layout(location = 5) in vec4 a_mat;
uniform mat4 u_viewProj;
out vec3 v_pos;
out vec3 v_nrm;
out vec4 v_col;
out vec2 v_uv;
flat out vec4 v_mat;
void main() {
  v_pos = a_pos;
  v_nrm = a_nrm.xyz;
  v_col = a_col;
  v_uv = a_uv;
  v_mat = a_mat;
  gl_Position = u_viewProj * vec4(a_pos, 1.0);
}
`;

export const FX_FS = `${HEADER}
${COMMON}
in vec3 v_pos;
in vec3 v_nrm;
in vec4 v_col;
in vec2 v_uv;
flat in vec4 v_mat;
out vec4 o;
void main() {
  int shape = int(v_mat.x + 0.5);
  vec3 V = normalize(u_camPos - v_pos);
  if (shape == 8) {
    // See-through vehicle glass: a dark tint with a Fresnel sky reflection and a sun glint, so
    // the cabin and its driver show through the windscreen.
    vec3 n = normalize(v_nrm);
    if (dot(n, V) < 0.0) n = -n;
    float ndv = max(dot(n, V), 0.0);
    float fres = 0.12 + 0.88 * pow(1.0 - ndv, 4.0);
    vec3 R = reflect(-V, n);
    vec3 sky = skyBase(normalize(vec3(R.x, max(R.y, 0.03), R.z)));
    vec3 tint = toLin(v_col.rgb) * (u_ambSky + u_sunCol * 0.15);
    vec3 glint = u_sunCol * pow(max(dot(R, u_skySun), 0.0), 260.0) * 6.0;
    float ga = clamp(v_col.a * (0.4 + 0.55 * fres), 0.0, 0.95);
    vec3 gc = mix(tint, sky * 0.9, fres) + glint;
    vec3 gdv = v_pos - u_camPos;
    float gd = max(length(gdv) - u_fogStart, 0.0);
    float gf = clamp(1.0 - exp(-gd * gd * u_fogDen * u_fogDen), 0.0, 1.0);
    gc = mix(gc, fogColor(gdv / max(length(gdv), 1.0)), gf);
    o = vec4(gc * ga, ga);
    return;
  }
  float k = v_mat.y / 255.0 * 12.0;
  bool additive = v_mat.z > 0.5;
  vec2 q = v_uv * 2.0 - 1.0;
  float r = length(q);
  float a = 1.0;
  if (shape == 0) a = pow(max(1.0 - r, 0.0), 1.6);
  else if (shape == 1) a = 1.0;
  else if (shape == 2) a = (1.0 - v_uv.y) * (1.0 - pow(abs(q.x), 2.0));
  else if (shape == 3) a = smoothstep(0.6, 0.85, r) * (1.0 - smoothstep(0.88, 1.0, r));
  else if (shape == 4) {
    float nz = vnoise(v_uv * 3.0 + v_mat.w * 0.1);
    a = smoothstep(1.0, 0.2, r + nz * 0.35);
  } else if (shape == 5) a = (1.0 - v_uv.y) * smoothstep(1.0, 0.3, abs(q.x));
  else if (shape == 6) {
    // Light shafts and beams: brightest where the surface faces the eye, fading along the beam.
    float facing = abs(dot(normalize(v_nrm), V));
    a = pow(facing, 1.6) * (0.2 + 0.8 * (1.0 - v_uv.y)) * smoothstep(0.0, 0.08, v_uv.y + 0.02);
  } else if (shape == 7) a = smoothstep(1.0, 0.92, r) * (0.55 + 0.45 * r);
  a *= v_col.a;
  if (a < 0.003) discard;
  vec3 c = toLin(v_col.rgb) * k;
  vec3 dv = v_pos - u_camPos;
  float dist = length(dv);
  float d = max(dist - u_fogStart, 0.0);
  float f = clamp(1.0 - exp(-d * d * u_fogDen * u_fogDen), 0.0, 1.0);
  if (additive) {
    o = vec4(c * a * (1.0 - f), 0.0);
  } else {
    vec3 lit = c * (u_ambSky + u_sunCol * 0.6);
    lit = mix(lit, fogColor(dv / max(dist, 1.0)), f);
    o = vec4(lit * a, a);
  }
}
`;

export const DEPTH_VS = `${HEADER}
layout(location = 0) in vec3 a_pos;
uniform mat4 u_viewProj;
void main() {
  gl_Position = u_viewProj * vec4(a_pos, 1.0);
}
`;

export const DEPTH_FS = `${HEADER}
out vec4 o;
void main() {
  o = vec4(1.0);
}
`;

export const POST_VS = `${HEADER}
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const BRIGHT_FS = `${HEADER}
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_thresh;
out vec4 o;
void main() {
  vec3 c = vec3(0.0);
  c += texture(u_src, v_uv + u_texel * vec2(-0.5, -0.5)).rgb;
  c += texture(u_src, v_uv + u_texel * vec2(0.5, -0.5)).rgb;
  c += texture(u_src, v_uv + u_texel * vec2(-0.5, 0.5)).rgb;
  c += texture(u_src, v_uv + u_texel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - u_thresh, 0.0) / max(l, 1e-4);
  o = vec4(min(c * k, vec3(40.0)), 1.0);
}
`;

export const DOWN_FS = `${HEADER}
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
out vec4 o;
void main() {
  vec3 c = texture(u_src, v_uv).rgb * 0.25;
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, -1.0)).rgb * 0.1875;
  c += texture(u_src, v_uv + u_texel * vec2(1.0, -1.0)).rgb * 0.1875;
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, 1.0)).rgb * 0.1875;
  c += texture(u_src, v_uv + u_texel * vec2(1.0, 1.0)).rgb * 0.1875;
  o = vec4(c, 1.0);
}
`;

export const UP_FS = `${HEADER}
in vec2 v_uv;
uniform sampler2D u_src;
uniform sampler2D u_base;
uniform vec2 u_texel;
uniform float u_mix;
out vec4 o;
void main() {
  vec3 c = vec3(0.0);
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, -1.0)).rgb;
  c += texture(u_src, v_uv + u_texel * vec2(0.0, -1.0)).rgb * 2.0;
  c += texture(u_src, v_uv + u_texel * vec2(1.0, -1.0)).rgb;
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, 0.0)).rgb * 2.0;
  c += texture(u_src, v_uv).rgb * 4.0;
  c += texture(u_src, v_uv + u_texel * vec2(1.0, 0.0)).rgb * 2.0;
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, 1.0)).rgb;
  c += texture(u_src, v_uv + u_texel * vec2(0.0, 1.0)).rgb * 2.0;
  c += texture(u_src, v_uv + u_texel * vec2(1.0, 1.0)).rgb;
  o = vec4(texture(u_base, v_uv).rgb + c / 16.0 * u_mix, 1.0);
}
`;

export const COMPOSITE_FS = `${HEADER}
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_exposure;
uniform float u_bloomK;
uniform vec3 u_lift;
uniform vec3 u_gain;
uniform float u_vignette;
uniform float u_sat;
uniform float u_contrast;
out vec4 o;
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 c = texture(u_scene, v_uv).rgb + texture(u_bloom, v_uv).rgb * u_bloomK;
  c = aces(c * u_exposure);
  c = pow(c, vec3(1.0 / 2.2));
  c = mix(c, c * c * (3.0 - 2.0 * c), u_contrast);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, u_sat);
  c = c * u_gain + u_lift * (1.0 - c);
  vec2 q = v_uv - 0.5;
  c *= 1.0 - dot(q, q) * u_vignette;
  float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  o = vec4(c + dither, 1.0);
}
`;
