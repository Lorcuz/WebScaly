// Final pass at display resolution: contrast-adaptive sharpening, colour
// adjustment and the original/enhanced comparison split.
struct Params {
  split: f32, compare: f32, strength: f32, vibrance: f32,
  contrast: f32, brightness: f32, pad0: f32, pad1: f32,
}
@group(0) @binding(0) var scaled: texture_2d<f32>;
@group(0) @binding(1) var original: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;
struct VertexOutput { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vert(@builtin(vertex_index) index: u32) -> VertexOutput {
  let points = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  let p = points[index];
  return VertexOutput(vec4f(p, 0, 1), vec2f((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5));
}
fn px(p: vec2i, size: vec2i) -> vec3f {
  return textureLoad(scaled, clamp(p, vec2i(0), size - 1), 0).rgb;
}
fn sharpen(p: vec2i) -> vec3f {
  let size = vec2i(textureDimensions(scaled));
  let c = px(p, size);
  if (params.strength <= 0.0) { return c; }
  let n = px(p + vec2i(0, -1), size); let s = px(p + vec2i(0, 1), size);
  let e = px(p + vec2i(1, 0), size); let w = px(p + vec2i(-1, 0), size);
  let lo = min(c, min(min(n, s), min(e, w)));
  let hi = max(c, max(max(n, s), max(e, w)));
  // Less sharpening where local contrast is already high, so strong edges and
  // subtitles do not grow halos while soft texture gains definition.
  let amount = sqrt(clamp(min(lo, 1.0 - hi) / max(hi, vec3f(1e-4)), vec3f(0.0), vec3f(1.0)));
  let k = -amount * (params.strength * 0.2);
  return clamp((c + (n + s + e + w) * k) / (1.0 + 4.0 * k), vec3f(0.0), vec3f(1.0));
}
fn grade(c: vec3f) -> vec3f {
  var x = c + params.brightness * 0.2;
  x = (x - 0.5) * (1.0 + params.contrast * 0.5) + 0.5;
  let l = dot(x, vec3f(0.2126, 0.7152, 0.0722));
  let chroma = clamp(max(x.r, max(x.g, x.b)) - min(x.r, min(x.g, x.b)), 0.0, 1.0);
  // Vibrance lifts muted colours more than already-saturated ones (skin stays natural).
  x = mix(vec3f(l), x, 1.0 + params.vibrance * (1.0 - chroma));
  return clamp(x, vec3f(0.0), vec3f(1.0));
}
@fragment fn frag(v: VertexOutput) -> @location(0) vec4f {
  if (params.compare > 0.5 && v.uv.x < params.split) {
    return vec4f(textureSampleLevel(original, linearSampler, v.uv, 0.0).rgb, 1.0);
  }
  return vec4f(grade(sharpen(vec2i(v.pos.xy))), 1.0);
}
