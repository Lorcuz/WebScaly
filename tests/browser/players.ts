import "./fixture";
const kind = new URLSearchParams(location.search).get("player") ?? "jw";
document.querySelector("#kind")!.textContent = kind;
const video = document.querySelector<HTMLVideoElement>("video")!;
let start = () => window.fixture.create(30, 640, true);
if (kind === "videojs") {
  const [{ default: videojs }] = await Promise.all([
    import("video.js"),
    import("video.js/dist/video-js.css"),
  ]);
  video.classList.add("video-js");
  const player = videojs(video, {
    controls: true,
    muted: true,
    width: 960,
    height: 540,
  });
  await new Promise<void>((resolve) => player.ready(() => resolve()));
  start = async () => {
    await window.fixture.create(30, 640, true);
    const source = URL.createObjectURL(window.fixture.blob!);
    player.src({ src: source, type: "video/webm" });
    player.loop(true);
    await player.play();
  };
} else if (kind === "plyr") {
  const [{ default: Plyr }] = await Promise.all([
    import("plyr"),
    import("plyr/dist/plyr.css"),
  ]);
  new Plyr(video, {
    loadSprite: false,
    controls: ["play", "progress", "current-time", "mute", "fullscreen"],
  });
} else if (kind === "hls") {
  const { default: Hls } = await import("hls.js");
  const hls = new Hls();
  hls.attachMedia(video);
  start = async () => {
    hls.loadSource("/test-results/media/hls/index.m3u8");
    await new Promise<void>((resolve, reject) => {
      hls.once(Hls.Events.MANIFEST_PARSED, () => resolve());
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) reject(new Error(data.details));
      });
    });
    await video.play();
  };
} else if (kind === "dash") {
  const { MediaPlayer } = await import("dashjs");
  const player = MediaPlayer().create();
  player.initialize(video, undefined, false);
  start = async () => {
    player.attachSource("/test-results/media/dash/index.mpd");
    await video.play();
  };
} else {
  // Reproduce Vixcloud/JW's auto stacking: controls are later siblings of .jw-media.
  // A positive canvas z-index inside .jw-media would cover these clickable controls.
  video.className = "jw-video";
  video.controls = false;
  const host = document.querySelector(".player")!;
  host.classList.add("jwplayer");
  const wrapper = document.createElement("div");
  wrapper.className = "jw-wrapper";
  const media = document.createElement("div");
  media.className = "jw-media";
  media.append(video);
  const captions = document.createElement("div");
  captions.className = "jw-captions";
  captions.textContent = "Native captions";
  const controlsLayer = document.createElement("div");
  controlsLayer.className = "jw-controls";
  const controls = document.createElement("div");
  controls.className = "native-controls";
  controls.innerHTML = '<button id="native-pause">Pause</button>';
  controls
    .querySelector("button")!
    .addEventListener("click", () =>
      video.paused ? void video.play() : video.pause(),
    );
  controlsLayer.append(controls);
  wrapper.append(media, captions, controlsLayer);
  host.append(wrapper);
}
document.querySelector("#play")!.replaceWith(
  Object.assign(document.createElement("button"), {
    id: "play",
    textContent: "Start video",
  }),
);
document.querySelector("#play")!.addEventListener("click", () => {
  void start().catch((e) => {
    document.querySelector("#kind")!.textContent = `${kind}: ${e.message}`;
  });
});
document.querySelector("#fullscreen")!.addEventListener("click", () => {
  void document.querySelector(".player")!.requestFullscreen();
});
document.body.dataset.ready = "true";
export {};
