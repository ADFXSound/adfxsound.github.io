/*
 * YouTube facade.
 *
 * Replaces each embed with a local thumbnail and our own play button, and only inserts
 * the real iframe once the visitor clicks. Two reasons:
 *
 *   1. It removes YouTube's title/avatar chip from the poster frame. That chip is drawn
 *      inside the cross-origin iframe, so no stylesheet here can reach it, and the
 *      parameters that used to hide it are gone - showinfo was removed in 2018 and
 *      modestbranding was deprecated in 2023 (and only ever touched the logo anyway).
 *   2. Every embed otherwise pulls the whole YouTube player up front. trailers.html
 *      carries six. Deferring them also means no third-party request fires until the
 *      visitor asks for one, which is the same intent behind the existing
 *      youtube-nocookie.com host.
 *
 * The iframe element itself is kept and re-inserted on click rather than rebuilt, so the
 * original allow / referrerpolicy / allowfullscreen attributes carry over untouched.
 *
 * It also forces a 1080p rendition. YouTube picks the rendition from the player's own
 * viewport and refuses to send a large one into a small frame, and every documented way to
 * ask directly is gone: vq was never honoured on iframe embeds, hd=1 is a Flash-era
 * leftover, and setPlaybackQuality is deprecated with no effect. What still works is giving
 * the iframe a genuinely large internal viewport and scaling the result back down to the
 * frame it should occupy, so the player measures 1920 wide and streams accordingly while
 * displaying at whatever size the column allows.
 */
(function () {
  "use strict";

  var EMBED = /youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]+)/;

  /* Deferring the player has one cost: on click there is no warm connection, so the DNS
     lookup and TLS handshake happen before the player can even start measuring bandwidth,
     and YouTube opens on a low rendition while it works out what the line can carry.
     Doing the handshakes on first hover buys that time back without loading anything.
     Only the two hosts playback actually needs are listed - the media itself streams from
     a per-session rrN---snXXXX.googlevideo.com name that cannot be known in advance. */

  var warmed = false;

  function warm() {
    if (warmed) return;
    warmed = true;
    ["https://www.youtube-nocookie.com", "https://i.ytimg.com"].forEach(function (host) {
      var link = document.createElement("link");
      link.rel = "preconnect";
      link.href = host;
      document.head.appendChild(link);
    });
  }

  /* Internal viewport width to advertise. 1920 is the smallest that reliably lands on a
     1080p rendition; the player would otherwise settle around 720p at this column width. */
  var TARGET = 1920;

  /* Below this frame width the trick is switched off. A phone cannot show the extra detail,
     so forcing 1080p there would spend someone's mobile data for nothing. */
  var FLOOR = 640;

  var live = [];

  function fit(frame, box) {
    var w = box.clientWidth;
    var h = box.clientHeight;
    if (!w || !h) return;

    /* Fullscreen is the one case where the frame is already as large as the screen, so the
       scaling is dropped and the player is left to fill it natively. */
    var full = document.fullscreenElement === frame ||
               document.webkitFullscreenElement === frame;

    if (w < FLOOR || full) {
      frame.style.width = "";
      frame.style.height = "";
      frame.style.transform = "";
      return;
    }

    /* Height is derived from the frame's real ratio rather than assumed to be 16:9 - the
       wrapper's padding-bottom is 56.2%, so a hardcoded ratio would leave a seam. */
    frame.style.width = TARGET + "px";
    frame.style.height = (TARGET * h / w) + "px";
    frame.style.transform = "scale(" + (w / TARGET) + ")";
  }

  function refit() {
    live.forEach(function (frame) {
      if (frame.parentNode) fit(frame, frame.parentNode);
    });
  }

  var pending;

  window.addEventListener("resize", function () {
    clearTimeout(pending);
    pending = setTimeout(refit, 150);
  });

  document.addEventListener("fullscreenchange", refit);
  document.addEventListener("webkitfullscreenchange", refit);

  function build(frame) {
    var match = frame.src.match(EMBED);
    if (!match) return;
    var id = match[1];

    var facade = document.createElement("button");
    facade.type = "button";
    facade.className = "yt-facade";
    facade.style.backgroundImage = "url('Resources/yt-" + id + ".webp')";

    // The generic embeds all carry title="YouTube embed", which says nothing useful.
    var label = frame.getAttribute("title");
    facade.setAttribute("aria-label",
      label && label !== "YouTube embed" ? "Play video: " + label : "Play video");

    facade.appendChild(document.createElement("span")).className = "yt-facade-play";

    facade.addEventListener("pointerenter", warm);
    facade.addEventListener("focus", warm);

    facade.addEventListener("click", function () {
      /* Order matters. The frame is still detached here, so it has no browsing context and
         the src assignment below loads nothing yet; that leaves room to size it first, and
         the player consequently boots already measuring TARGET instead of reading the small
         on-screen box and committing to a low rendition it would only climb out of slowly. */
      fit(frame, facade.parentNode);
      live.push(frame);

      // Separator depends on whether the captured src already carried a query string.
      frame.src += (frame.src.indexOf("?") === -1 ? "?" : "&") + "autoplay=1";
      frame.removeAttribute("loading");
      facade.replaceWith(frame);
      frame.focus();
    });

    frame.replaceWith(facade);
  }

  function init() {
    var frames = document.querySelectorAll(
      'iframe[src*="youtube-nocookie.com/embed/"]');
    Array.prototype.forEach.call(frames, build);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
