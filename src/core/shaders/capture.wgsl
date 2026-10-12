struct Region { area: vec4f }
@group(0) @binding(0) var decoded: texture_external;
@group(0) @binding(1) var output: texture_storage_2d<rgba8unorm,write>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var<uniform> region: Region;
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id:vec3u){
 let size=textureDimensions(output);if(any(id.xy>=size)){return;}
 let uv=region.area.xy+(vec2f(id.xy)+vec2f(.5))/vec2f(size)*region.area.zw;
 let pixel=textureSampleBaseClampToEdge(decoded,linearSampler,uv);
 textureStore(output,vec2i(id.xy),vec4f(pixel.rgb,1));
}
