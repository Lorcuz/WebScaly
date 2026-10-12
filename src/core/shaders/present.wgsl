struct Params { split: f32, compare: f32, pad0: f32, pad1: f32 }
@group(0) @binding(0) var enhanced: texture_2d<f32>;
@group(0) @binding(1) var original: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;
struct VertexOutput { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vert(@builtin(vertex_index) index: u32) -> VertexOutput {
  let points = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  let p = points[index];
  return VertexOutput(vec4f(p, 0, 1), vec2f((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5));
}
@fragment fn frag(v: VertexOutput) -> @location(0) vec4f {
  let processed = textureSample(enhanced, linearSampler, v.uv);
  let raw = textureSample(original, linearSampler, v.uv);
  return vec4f(select(processed.rgb, raw.rgb, params.compare > 0.5 && v.uv.x < params.split), 1);
}
