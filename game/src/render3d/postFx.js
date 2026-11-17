// The HDR frame: the scene is drawn into a 4x multisampled (half-float when available) target,
// resolved, then a bright pass and a five-level down/up bloom chain make neon, lamps, the sun
// and muzzle flashes glow before an ACES tone map, colour grade, vignette and dither go to the
// screen.
import { createMsaaTarget, createTarget } from './glContext.js';

export function createPost(gl, P) {
  return { gl, P, w: 0, h: 0, hdr: gl.ext.floatTarget, msaa: null, scene: null, depthRb: null, down: [], up: [] };
}

function free(gl, t) {
  if (!t) return;
  if (t.tex) gl.deleteTexture(t.tex);
  if (t.fbo) gl.deleteFramebuffer(t.fbo);
  if (t.color) gl.deleteRenderbuffer(t.color);
  if (t.depth) gl.deleteRenderbuffer(t.depth);
}

export function resizePost(post, w, h) {
  if (post.w === w && post.h === h) return;
  const gl = post.gl;
  free(gl, post.msaa);
  free(gl, post.scene);
  if (post.depthRb) gl.deleteRenderbuffer(post.depthRb);
  for (const t of post.down) free(gl, t);
  for (const t of post.up) free(gl, t);
  post.w = w;
  post.h = h;
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
  post.msaa = samples > 1 ? createMsaaTarget(gl, w, h, post.hdr, samples) : null;
  post.scene = createTarget(gl, w, h, post.hdr);
  post.depthRb = null;
  if (!post.msaa) {
    // No multisampling: draw straight into the scene texture with its own depth buffer.
    post.depthRb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, post.depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, post.scene.fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, post.depthRb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  post.down = [];
  post.up = [];
  let bw = Math.max(1, w >> 1);
  let bh = Math.max(1, h >> 1);
  for (let i = 0; i < 5; i += 1) {
    post.down.push(createTarget(gl, bw, bh, post.hdr));
    if (i < 4) post.up.push(createTarget(gl, bw, bh, post.hdr));
    bw = Math.max(1, bw >> 1);
    bh = Math.max(1, bh >> 1);
  }
}

/** Bind the target the 3D scene is drawn into. */
export function beginScene(post) {
  const gl = post.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, post.msaa ? post.msaa.fbo : post.scene.fbo);
  gl.viewport(0, 0, post.w, post.h);
  return !!post.msaa;
}

function pass(gl, prog, target, setup) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
  gl.useProgram(prog.prog);
  setup(prog.u);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function bindTex(gl, unit, tex, loc) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(loc, unit);
}

/** Resolve, bloom and tone map onto the canvas (outW x outH). */
export function finishScene(post, sky, outW, outH) {
  const gl = post.gl;
  const P = post.P;
  if (post.msaa) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, post.msaa.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, post.scene.fbo);
    gl.blitFramebuffer(0, 0, post.w, post.h, 0, 0, post.w, post.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.depthMask(false);
  gl.bindVertexArray(null);
  const d = post.down;
  gl.viewport(0, 0, d[0].w, d[0].h);
  pass(gl, P.bright, d[0], (u) => {
    bindTex(gl, 0, post.scene.tex, u.u_src);
    gl.uniform2f(u.u_texel, 1 / post.w, 1 / post.h);
    gl.uniform1f(u.u_thresh, post.hdr ? sky.thresh : 0.75);
  });
  for (let i = 1; i < d.length; i += 1) {
    gl.viewport(0, 0, d[i].w, d[i].h);
    pass(gl, P.down, d[i], (u) => {
      bindTex(gl, 0, d[i - 1].tex, u.u_src);
      gl.uniform2f(u.u_texel, 1 / d[i - 1].w, 1 / d[i - 1].h);
    });
  }
  for (let i = d.length - 2; i >= 0; i -= 1) {
    const src = i === d.length - 2 ? d[i + 1] : post.up[i + 1];
    gl.viewport(0, 0, post.up[i].w, post.up[i].h);
    pass(gl, P.up, post.up[i], (u) => {
      bindTex(gl, 0, src.tex, u.u_src);
      bindTex(gl, 1, d[i].tex, u.u_base);
      gl.uniform2f(u.u_texel, 1 / src.w, 1 / src.h);
      gl.uniform1f(u.u_mix, i >= 2 ? 0.55 : 0.85);
    });
  }
  gl.viewport(0, 0, outW, outH);
  pass(gl, P.composite, null, (u) => {
    bindTex(gl, 0, post.scene.tex, u.u_scene);
    bindTex(gl, 1, post.up[0].tex, u.u_bloom);
    gl.uniform1f(u.u_exposure, sky.exposure);
    gl.uniform1f(u.u_bloomK, sky.bloom * (post.hdr ? 1 : 0.6) / 5);
    gl.uniform3fv(u.u_lift, sky.lift);
    gl.uniform3fv(u.u_gain, sky.gain);
    gl.uniform1f(u.u_vignette, sky.vignette);
    gl.uniform1f(u.u_sat, sky.sat);
    gl.uniform1f(u.u_contrast, sky.contrast ?? 0.25);
  });
  gl.depthMask(true);
}
