// Resamples the enhanced picture to the display size.
// mode 0: bilinear (Fast), 1: Catmull-Rom bicubic (Balanced),
// 2: Lanczos-2 with partial anti-ringing (Quality).
struct Params { mode: u32, pad0: u32, pad1: u32, pad2: u32 }
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var output: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;
fn load(p: vec2i, size: vec2i) -> vec3f {
  return textureLoad(image, clamp(p, vec2i(0), size - 1), 0).rgb;
}
fn catmull(x: f32) -> f32 {
  let a = abs(x);
  if (a < 1.0) { return (1.5 * a - 2.5) * a * a + 1.0; }
  if (a < 2.0) { return ((-0.5 * a + 2.5) * a - 4.0) * a + 2.0; }
  return 0.0;
}
fn lanczos2(x: f32) -> f32 {
  let a = abs(x);
  if (a < 1e-5) { return 1.0; }
  if (a >= 2.0) { return 0.0; }
  let px = 3.14159265 * a;
  return 2.0 * sin(px) * sin(px * 0.5) / (px * px);
}
fn weight(x: f32) -> f32 {
  if (params.mode == 2u) { return lanczos2(x); }
  return catmull(x);
}
fn linear(uv: vec2f) -> vec3f {
  return textureSampleLevel(image, linearSampler, uv, 0.0).rgb;
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let size = textureDimensions(output);
  if (any(gid.xy >= size)) { return; }
  let insize = vec2i(textureDimensions(image));
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(size);
  var c: vec3f;
  if (any(vec2i(size) < insize)) {
    // Reduction (for example a 2x neural result on a smaller player): a
    // four-tap box keeps the learned detail without aliasing.
    let o = 0.25 / vec2f(size);
    c = (linear(uv + vec2f(-o.x, -o.y)) + linear(uv + vec2f(o.x, -o.y)) +
      linear(uv + vec2f(-o.x, o.y)) + linear(uv + vec2f(o.x, o.y))) * 0.25;
  } else if (params.mode == 0u) {
    c = linear(uv);
  } else {
    let pos = uv * vec2f(insize) - 0.5;
    let base = vec2i(floor(pos));
    let f = pos - floor(pos);
    var sum = vec3f(0.0);
    var total = 0.0;
    var lo = vec3f(1.0);
    var hi = vec3f(0.0);
    for (var j = -1; j <= 2; j++) {
      let wy = weight(f32(j) - f.y);
      for (var i = -1; i <= 2; i++) {
        let w = weight(f32(i) - f.x) * wy;
        let s = load(base + vec2i(i, j), insize);
        sum += s * w;
        total += w;
        if (i >= 0 && i <= 1 && j >= 0 && j <= 1) { lo = min(lo, s); hi = max(hi, s); }
      }
    }
    c = sum / total;
    // Lanczos rings around hard edges; pull most of the overshoot back inside
    // the four nearest source pixels while keeping some of its crispness.
    if (params.mode == 2u) { c = mix(c, clamp(c, lo, hi), 0.65); }
  }
  textureStore(output, vec2i(gid.xy), vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), 1.0));
}
