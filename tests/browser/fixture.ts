declare global {
  interface Window {
    fixture: {
      create: (fps: number, width: number, record?: boolean) => Promise<void>;
      blob?: Blob;
      stop: () => void;
    };
  }
}
const video = document.querySelector<HTMLVideoElement>("#video")!;
let timer: ReturnType<typeof setInterval> | undefined,
  stream: MediaStream | undefined,
  url: string | undefined;
window.fixture = {
  async create(fps = 30, width = 1280, record = false) {
    window.fixture.stop();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = (width * 9) / 16;
    const ctx = canvas.getContext("2d")!;
    let frame = 0;
    const draw = () => {
      ctx.fillStyle = "#142539";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#7ee1bf";
      ctx.fillRect((frame * 12) % (width - 140), 100, 140, 140);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 4) {
        ctx.beginPath();
        ctx.moveTo(x, canvas.height * 0.7);
        ctx.lineTo(x, canvas.height * 0.9);
        ctx.stroke();
      }
      frame++;
    };
    draw();
    stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    timer = setInterval(() => {
      draw();
      track.requestFrame();
    }, 1000 / fps);
    if (record) {
      const parts: Blob[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8",
        videoBitsPerSecond: 4_000_000,
      });
      recorder.ondataavailable = (e) => parts.push(e.data);
      const done = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start();
      await new Promise((r) => setTimeout(r, 2500));
      recorder.stop();
      await done;
      window.fixture.blob = new Blob(parts, { type: "video/webm" });
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      url = URL.createObjectURL(window.fixture.blob);
      video.src = url;
      video.loop = true;
    } else {
      video.removeAttribute("src");
      video.srcObject = stream;
    }
    await video.play();
    await new Promise<void>((resolve) =>
      video.requestVideoFrameCallback(() => resolve()),
    );
  },
  stop() {
    clearInterval(timer);
    stream?.getTracks().forEach((t) => t.stop());
    video.pause();
    if (url) URL.revokeObjectURL(url);
  },
};
if (location.pathname.endsWith("/fixture.html")) {
  document.querySelector("#play")!.addEventListener("click", () => {
    void window.fixture.create(30, 1280);
  });
  document.querySelector("#fullscreen")!.addEventListener("click", () => {
    void document.querySelector(".player")!.requestFullscreen();
  });
}
export {};
