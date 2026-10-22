// Work-resolution cleanup before any engine: edge-aware denoise, then deband.
// Output is half-float so the smoothed gradients are not re-quantized into bands.
struct Params { denoise: f32, deband: f32, pad0: f32, pad1: f32 }
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var output: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> params: Params;
fn load(p: vec2i) -> vec3f {
  return textureLoad(image, clamp(p, vec2i(0), vec2i(textureDimensions(image)) - 1), 0).rgb;
}
fn hash(p: vec2u) -> f32 {
  var h = p.x * 1664525u + p.y * 1013904223u + 374761393u;
  h = (h ^ (h >> 16u)) * 2246822519u;
  h = (h ^ (h >> 13u)) * 3266489917u;
  h = h ^ (h >> 16u);
  return f32(h) / 4294967295.0;
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (any(gid.xy >= textureDimensions(output))) { return; }
  let p = vec2i(gid.xy);
  var c = load(p);
  if (params.denoise > 0.0) {
    let n = load(p + vec2i(0, -1)); let s = load(p + vec2i(0, 1));
    let e = load(p + vec2i(1, 0)); let w = load(p + vec2i(-1, 0));
    let average = (n + s + e + w) * 0.25;
    let lo = min(c, min(min(n, s), min(e, w)));
    let hi = max(c, max(max(n, s), max(e, w)));
    let contrast = max(max(hi.r - lo.r, hi.g - lo.g), hi.b - lo.b);
    // Smooth flat regions only; edges keep their full contrast.
    c = mix(c, average, params.denoise * (1.0 - smoothstep(0.01, 0.10, contrast)));
  }
  if (params.deband > 0.0) {
    // Compare against four samples on a randomly rotated cross. Where every
    // sample sits within the band threshold, the step is compression banding,
    // not detail, so it is replaced with their average.
    let radius = mix(4.0, 16.0, params.deband);
    let threshold = mix(0.006, 0.02, params.deband);
    let angle = hash(gid.xy) * 6.2831853;
    let reach = (0.5 + 0.5 * hash(gid.yx + vec2u(17u, 5u))) * radius;
    let o = vec2i(round(vec2f(cos(angle), sin(angle)) * reach));
    let a = load(p + o); let b = load(p - o);
    let d = load(p + vec2i(-o.y, o.x)); let e = load(p + vec2i(o.y, -o.x));
    let spread = max(max(abs(a - c), abs(b - c)), max(abs(d - c), abs(e - c)));
    c = select(c, (a + b + d + e) * 0.25, spread < vec3f(threshold));
    // Triangular dither keeps the new gradient smooth after 8-bit display.
    let n = hash(gid.xy * 3u + vec2u(1u, 2u)) - hash(gid.xy * 5u + vec2u(3u, 7u));
    c += vec3f(n * params.deband * 1.5 / 255.0);
  }
  textureStore(output, p, vec4f(clamp(c, vec3f(0), vec3f(1)), 1.0));
}
