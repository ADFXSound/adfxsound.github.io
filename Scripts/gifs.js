/*
 * GIF stand-ins: the muted, looping <video> tags inside image blocks
 * (Unreal Sound Node, Reaper script demos). They are not the YouTube player
 * and must keep running on their own.
 *
 * Browsers often ignore the autoplay attribute (preview iframes, headless,
 * low media-engagement scores) and leave the poster frozen. A muted play()
 * still starts them. If another player on the page pauses them, start them
 * again — they should stay unaffected.
 */
(function () {
  "use strict";

  function isGifLoop(video) {
    if (!video || video.closest(".yt-player")) return false;
    if (video.classList.contains("yt-html5")) return false;
    return video.hasAttribute("autoplay") ||
           video.hasAttribute("loop") ||
           video.closest(".sqs-block-image");
  }

  function kick(video) {
    if (!isGifLoop(video)) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
    video.autoplay = true;
    video.controls = false;
    video.removeAttribute("controls");
    if (video.preload === "metadata") video.preload = "auto";
    var play = video.play();
    if (play && play.catch) play.catch(function () {});
  }

  function kickAll() {
    var videos = document.querySelectorAll("video");
    for (var i = 0; i < videos.length; i++) kick(videos[i]);
  }

  function bind(video) {
    if (!isGifLoop(video) || video.getAttribute("data-gif-bound")) return;
    video.setAttribute("data-gif-bound", "1");
    var restarting = false;
    video.addEventListener("pause", function () {
      if (restarting || video.closest(".yt-player")) return;
      restarting = true;
      kick(video);
      window.setTimeout(function () { restarting = false; }, 80);
    });
    video.addEventListener("loadeddata", function () { kick(video); });
    video.addEventListener("canplay", function () { kick(video); });
    kick(video);
  }

  function init() {
    var videos = document.querySelectorAll("video");
    for (var i = 0; i < videos.length; i++) bind(videos[i]);

    document.addEventListener("pointerdown", kickAll, true);
    document.addEventListener("keydown", kickAll, true);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) kickAll();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
