// Box-filtered thumbnail of the working frame for the content-type estimate.
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var output: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var linearSampler: sampler;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let size = textureDimensions(output);
  if (any(gid.xy >= size)) { return; }
  let texel = 1.0 / vec2f(size);
  let uv = (vec2f(gid.xy) + 0.5) * texel;
  let o = texel * 0.25;
  let c = (textureSampleLevel(image, linearSampler, uv + vec2f(-o.x, -o.y), 0.0) +
    textureSampleLevel(image, linearSampler, uv + vec2f(o.x, -o.y), 0.0) +
    textureSampleLevel(image, linearSampler, uv + vec2f(-o.x, o.y), 0.0) +
    textureSampleLevel(image, linearSampler, uv + vec2f(o.x, o.y), 0.0)) * 0.25;
  textureStore(output, vec2i(gid.xy), vec4f(c.rgb, 1.0));
}
