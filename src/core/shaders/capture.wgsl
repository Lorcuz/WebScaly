struct Region { area: vec4f }
@group(0) @binding(0) var decoded: texture_external;
@group(0) @binding(1) var output: texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> region: Region;
fn tap(uv: vec2f) -> vec3f {
  return textureSampleBaseClampToEdge(decoded, linearSampler, uv).rgb;
}
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(output);
  if (any(id.xy >= size)) { return; }
  let texel = region.area.zw / vec2f(size);
  let uv = region.area.xy + (vec2f(id.xy) + vec2f(.5)) * texel;
  let source = vec2f(textureDimensions(decoded)) * region.area.zw;
  var pixel = tap(uv);
  // Large reductions (for example 4K to 1080p) average four bilinear taps so
  // fine detail does not alias into shimmer.
  if (any(source > vec2f(size) * 1.34)) {
    let o = texel * .25;
    pixel = (tap(uv + vec2f(-o.x, -o.y)) + tap(uv + vec2f(o.x, -o.y)) +
      tap(uv + vec2f(-o.x, o.y)) + tap(uv + vec2f(o.x, o.y))) * .25;
  }
  textureStore(output, vec2i(id.xy), vec4f(pixel, 1));
}
