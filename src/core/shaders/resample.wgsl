@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var out: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var samp: sampler;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let size = textureDimensions(out);
  if (any(gid.xy >= size)) { return; }
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(size);
  textureStore(out, vec2i(gid.xy), textureSampleLevel(image, samp, uv, 0));
}
