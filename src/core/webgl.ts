import type { Settings } from "../shared/settings-core";
import { snapshot, releaseSnapshot } from "./source-frame";
import { pixelCrop, type Crop } from "./crop";

const UNIFORMS = [
  "texel",
  "region",
  "strength",
  "denoise",
  "split",
  "compare",
  "bicubic",
  "vibrance",
  "contrast",
  "brightness",
] as const;
// A single-pass GPU spatial filter for devices/browsers without WebGPU:
// optional Catmull-Rom upscaling, edge-aware denoise and bounded sharpening,
// colour adjustment and the comparison split. No float targets or extensions.
export class WebGLSpatial {
  readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  readonly backend: string;
  private program: WebGLProgram;
  private input: WebGLTexture;
  private vertices: WebGLBuffer;
  private shaders: WebGLShader[] = [];
  private settings: Settings;
  private locations = new Map<string, WebGLUniformLocation | null>();
  constructor(
    canvas: HTMLCanvasElement,
    settings: Settings,
    private crop?: Crop,
  ) {
    const options = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    };
    const gl =
      (canvas.getContext("webgl2", options) as WebGL2RenderingContext | null) ??
      (canvas.getContext("webgl", options) as WebGLRenderingContext | null);
    if (!gl)
      throw new Error(
        "WebGPU and WebGL are unavailable. Enable Chrome graphics acceleration, then retry. Native playback continues.",
      );
    this.gl = gl;
    this.settings = settings;
    const v2 =
      typeof WebGL2RenderingContext !== "undefined" &&
      gl instanceof WebGL2RenderingContext;
    this.backend = v2 ? "WebGL2" : "WebGL";
    const prefix = v2 ? "#version 300 es\n" : "";
    const vertex = `${prefix}${v2 ? "in" : "attribute"} vec2 position; ${v2 ? "out" : "varying"} vec2 uv;
      void main(){gl_Position=vec4(position,0.,1.);uv=vec2((position.x+1.)*.5,(1.-position.y)*.5);}`;
    const precision = gl.getShaderPrecisionFormat(
      gl.FRAGMENT_SHADER,
      gl.HIGH_FLOAT,
    )?.precision
      ? "highp"
      : "mediump";
    const sample = v2 ? "texture" : "texture2D";
    const fragment = `${prefix}precision ${precision} float;
      ${v2 ? "in" : "varying"} vec2 uv; ${v2 ? "out vec4 color;" : ""}
      uniform sampler2D image; uniform vec2 texel; uniform vec4 region;
      uniform float strength,denoise,split,compare,bicubic,vibrance,contrast,brightness;
      vec3 pixel(vec2 p){return ${sample}(image,clamp(p,texel*.5,vec2(1.)-texel*.5)).rgb;}
      float cr(float x){x=abs(x);return x<1.?(1.5*x-2.5)*x*x+1.:x<2.?((-.5*x+2.5)*x-4.)*x+2.:0.;}
      vec3 cubic(vec2 p){
        vec2 pos=p/texel-.5,base=floor(pos),f=pos-base;vec3 sum=vec3(0.);float total=0.;
        for(int j=-1;j<=2;j++){float wy=cr(float(j)-f.y);
          for(int i=-1;i<=2;i++){float w=cr(float(i)-f.x)*wy;
            sum+=pixel((base+vec2(float(i),float(j))+.5)*texel)*w;total+=w;}}
        return clamp(sum/total,0.,1.);}
      vec3 grade(vec3 x){x+=brightness*.2;x=(x-.5)*(1.+contrast*.5)+.5;
        float l=dot(x,vec3(.2126,.7152,.0722)),c=max(x.r,max(x.g,x.b))-min(x.r,min(x.g,x.b));
        return clamp(mix(vec3(l),x,1.+vibrance*(1.-clamp(c,0.,1.))),0.,1.);}
      void main(){vec2 p=region.xy+uv*region.zw;vec3 raw=pixel(p);
        vec3 c=bicubic>.5?cubic(p):raw,n=pixel(p-vec2(0.,texel.y)),s=pixel(p+vec2(0.,texel.y)),e=pixel(p+vec2(texel.x,0.)),w=pixel(p-vec2(texel.x,0.));
        vec3 average=(n+s+e+w)*.25,lo=min(raw,min(min(n,s),min(e,w))),hi=max(raw,max(max(n,s),max(e,w)));
        vec3 range=hi-lo;float spread=max(max(range.r,range.g),range.b);
        vec3 base=mix(c,average,denoise*(1.-smoothstep(.01,.10,spread)));
        vec3 processed=grade(clamp(base+(base-average)*strength,lo,hi));
        ${v2 ? "color" : "gl_FragColor"}=vec4(compare>.5&&uv.x<split?raw:processed,1.);}`;
    const compile = (type: number, code: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Cannot allocate a WebGL shader.");
      this.shaders.push(shader);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(
          gl.getShaderInfoLog(shader) ?? "WebGL shader compilation failed.",
        );
      return shader;
    };
    const program = gl.createProgram(),
      input = gl.createTexture(),
      vertices = gl.createBuffer();
    if (!program || !input || !vertices) {
      gl.deleteProgram(program);
      gl.deleteTexture(input);
      gl.deleteBuffer(vertices);
      throw new Error("Cannot allocate WebGL resources.");
    }
    this.program = program;
    this.input = input;
    this.vertices = vertices;
    try {
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(
          gl.getProgramInfoLog(program) ?? "WebGL program linking failed.",
        );
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, input);
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
        gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
        gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
      gl.uniform1i(gl.getUniformLocation(program, "image"), 0);
      for (const name of UNIFORMS)
        this.locations.set(name, gl.getUniformLocation(program, name));
    } catch (error) {
      this.destroy();
      throw error;
    }
  }
  update(settings: Settings) {
    this.settings = settings;
  }
  render(video: HTMLVideoElement, mediaTime: number, compare: boolean) {
    const gl = this.gl,
      s = this.settings,
      frame = snapshot(video, mediaTime);
    try {
      gl.bindTexture(gl.TEXTURE_2D, this.input);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        frame,
      );
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.useProgram(this.program);
      const at = (name: (typeof UNIFORMS)[number]) => this.locations.get(name)!;
      gl.uniform2f(at("texel"), 1 / video.videoWidth, 1 / video.videoHeight);
      const region = pixelCrop(video.videoWidth, video.videoHeight, this.crop);
      gl.uniform4f(
        at("region"),
        region.x / video.videoWidth,
        region.y / video.videoHeight,
        region.width / video.videoWidth,
        region.height / video.videoHeight,
      );
      const upscaling = gl.drawingBufferHeight > region.height * 1.05;
      for (const [name, value] of [
        ["strength", s.strength],
        ["denoise", s.denoise],
        ["split", s.split],
        ["compare", compare ? 1 : 0],
        ["bicubic", upscaling && s.quality !== "fast" ? 1 : 0],
        ["vibrance", s.vibrance],
        ["contrast", s.contrast],
        ["brightness", s.brightness],
      ] as const)
        gl.uniform1f(at(name), value);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const error = gl.getError();
      if (error !== gl.NO_ERROR)
        throw new Error(`WebGL frame upload/render failed (${error}).`);
    } finally {
      releaseSnapshot(frame);
    }
  }
  destroy() {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.input);
    gl.deleteBuffer(this.vertices);
    this.shaders.forEach((s) => gl.deleteShader(s));
    this.shaders = [];
  }
}
