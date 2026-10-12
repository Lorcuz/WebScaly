struct Params { strength: f32, denoise: f32, pad0: f32, pad1: f32 }
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var output: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;
fn pixel(p: vec2i) -> vec3f {
  return textureLoad(image, clamp(p, vec2i(0), vec2i(textureDimensions(image)) - 1), 0).rgb;
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (any(gid.xy >= textureDimensions(output))) { return; }
  let p = vec2i(gid.xy);
  let c = pixel(p);
  let n = pixel(p + vec2i(0, -1)); let s = pixel(p + vec2i(0, 1));
  let e = pixel(p + vec2i(1, 0)); let w = pixel(p + vec2i(-1, 0));
  let average = (n + s + e + w) * 0.25;
  let lo = min(c, min(min(n, s), min(e, w)));
  let hi = max(c, max(max(n, s), max(e, w)));
  let contrast = max(max(hi.r - lo.r, hi.g - lo.g), hi.b - lo.b);
  let base = mix(c, average, params.denoise * (1.0 - smoothstep(0.01, 0.10, contrast)));
  let sharpened = base + (base - average) * params.strength;
  // Bound overshoot to local extrema to reduce ringing around subtitles/line art.
  textureStore(output, p, vec4f(clamp(sharpened, lo, hi), 1.0));
}
