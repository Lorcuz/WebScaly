// A snapshot owns a stable decoded frame across GPU submission. In particular,
// the page may change its video element while a frame callback is running.
// VideoFrame retains the browser's origin checks; this never proxies media URLs.
export function snapshot(
  video: HTMLVideoElement,
  mediaTime = video.currentTime,
): VideoFrame | HTMLVideoElement {
  if (
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    !video.videoWidth ||
    !video.videoHeight
  ) {
    throw new DOMException(
      "Waiting for a decoded video frame.",
      "InvalidStateError",
    );
  }
  return typeof VideoFrame === "function"
    ? new VideoFrame(video, { timestamp: Math.round(mediaTime * 1_000_000) })
    : video;
}
export function releaseSnapshot(frame: VideoFrame | HTMLVideoElement) {
  if (typeof VideoFrame === "function" && frame instanceof VideoFrame)
    frame.close();
}
export function captureError(error: unknown): string {
  const detail =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (error instanceof DOMException && error.name === "SecurityError") {
    return `This player blocks direct video-frame access (cross-origin media). Native playback continues. Open the compatibility player from the WebScaly popup to share this tab with Chrome. ${detail}`;
  }
  return detail;
}
