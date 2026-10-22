/**
 * Procedural test footage drawn on this device: moving shapes, fine line pairs,
 * small text and a shallow gradient that bands when compressed. No network media.
 */
export type FixtureKind = "motion" | "anime" | "cut" | "static" | "preview";
export function drawFixture(
  ctx: CanvasRenderingContext2D,
  index: number,
  fps: number,
  fixture: FixtureKind,
) {
  const { width: w, height: h } = ctx.canvas;
  const visibleIndex =
    fixture === "anime"
      ? Math.floor(index / 2) * 2
      : fixture === "static"
        ? 0
        : index;
  const time = visibleIndex / fps;
  if (fixture === "preview") {
    drawPreview(ctx, w, h, time);
    return;
  }
  const cut = fixture === "cut" && Math.floor(time / 2) % 2;
  ctx.fillStyle = cut ? "#a93447" : "#122332";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#3b566c";
  ctx.lineWidth = 1;
  for (let i = 0; i < w; i += w / 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
  const x = w * (0.5 + 0.3 * Math.sin(time * 1.2));
  ctx.fillStyle = "#79dfbd";
  ctx.beginPath();
  ctx.arc(x, h * 0.45, h * 0.12, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "#f4cb7d";
  ctx.fillRect(w - x - h * 0.09, h * 0.55, h * 0.18, h * 0.18);
  ctx.font = `${Math.round(h * 0.045)}px system-ui`;
  ctx.fillStyle = "#edf3f7";
  ctx.fillText(
    `WebScaly · ${fps} FPS · frame ${visibleIndex}`,
    w * 0.04,
    h * 0.09,
  );
  ctx.font = `${Math.round(h * 0.031)}px system-ui`;
  ctx.fillText(
    "Fine lines / moving edges / synchronized comparison",
    w * 0.04,
    h * 0.88,
  );
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 100; i++)
    ctx.fillRect(w * 0.05 + i * 3, h * 0.2, 1, h * 0.1);
}
// A plain test card for the before/after preview. Detail is mirrored across
// the middle so both halves of the default 50% split show the same features:
// line pairs of falling width, small text, a hard-edged dot in motion, and a
// shallow quantized gradient that bands when compressed.
function drawPreview(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
) {
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    ctx.fillStyle = `rgb(${Math.round(16 + 18 * t)},${Math.round(24 + 34 * t)},${Math.round(32 + 44 * t)})`;
    ctx.fillRect(0, (h * i) / steps, w, h / steps + 1);
  }
  const cx = w * 0.1,
    cy = h * 0.19,
    cw = w * 0.8,
    ch = h * 0.42;
  ctx.fillStyle = "#e5edf4";
  ctx.fillRect(cx, cy, cw, ch);
  ctx.fillStyle = "#101820";
  // Line pairs: each half gets the same set, from 3 px down to 1 px.
  for (const half of [0, 0.5]) {
    let x = cx + cw * (half + 0.05);
    for (const width of [3, 3, 2, 2, 2, 1, 1, 1, 1]) {
      ctx.fillRect(x, cy + ch * 0.14, width, ch * 0.34);
      x += width * 2 + 2;
    }
  }
  ctx.font = `600 ${Math.round(ch * 0.12)}px system-ui`;
  for (const half of [0, 0.5])
    ctx.fillText("WebScaly", cx + cw * (half + 0.05), cy + ch * 0.72);
  ctx.font = `${Math.round(ch * 0.075)}px system-ui`;
  for (const half of [0, 0.5])
    ctx.fillText("fine lines · small text", cx + cw * (half + 0.05), cy + ch * 0.88);
  ctx.fillStyle = "#79dfbd";
  ctx.beginPath();
  ctx.arc(
    w * (0.5 + 0.36 * Math.sin(time * 0.8)),
    h * 0.7,
    h * 0.045,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}
/** A looping captureStream video of the fixture, driven by a timer at `fps`. */
export function fixtureStream(
  width: number,
  height: number,
  fps: number,
  fixture: FixtureKind,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  let index = 0;
  drawFixture(ctx, index, fps, fixture);
  const stream = canvas.captureStream(0),
    track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const interval = setInterval(() => {
    drawFixture(ctx, index++, fps, fixture);
    track.requestFrame();
  }, 1000 / fps);
  return {
    stream,
    stop() {
      clearInterval(interval);
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
