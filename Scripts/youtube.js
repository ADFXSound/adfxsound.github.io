/*
 * YouTube facade.
 *
 * Each embed is a static <button.yt-facade data-yt-src="..."> in the HTML, with a local
 * poster as its background-image. That keeps the block editable in Pinegrow (and previewable
 * without a live deploy). This script only wires behaviour: preconnect on hover, then insert
 * the real iframe on click.
 *
 * Two reasons for the facade itself:
 *
 *   1. It removes YouTube's title/avatar chip from the poster frame. That chip is drawn
 *      inside the cross-origin iframe, so no stylesheet here can reach it, and the
 *      parameters that used to hide it are gone - showinfo was removed in 2018 and
 *      modestbranding was deprecated in 2023 (and only ever touched the logo anyway).
 *   2. Every embed otherwise pulls the whole YouTube player up front. trailers.html
 *      carries six. Deferring them means no third-party request fires until the
 *      visitor asks for one.
 *
 * It also forces a 1080p rendition. YouTube picks the rendition from the player's own
 * viewport and refuses to send a large one into a small frame, and every documented way to
 * ask directly is gone: vq was never honoured on iframe embeds, hd=1 is a Flash-era
 * leftover, and setPlaybackQuality is deprecated with no effect. What still works is giving
 * the iframe a genuinely large internal viewport and scaling the result back down to the
 * frame it should occupy, so the player measures 1920 wide and streams accordingly while
 * displaying at whatever size the column allows.
 *
 * To add a video in Pinegrow: duplicate an existing facade block, set data-yt-src to
 * https://www.youtube.com/embed/{ID}, set the button's background-image to
 * Resources/yt-{ID}.webp, and drop that WebP into Resources/.
 */
(function () {
  "use strict";

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
    ["https://www.youtube.com", "https://i.ytimg.com"].forEach(function (host) {
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

  function play(facade) {
    var src = facade.getAttribute("data-yt-src");
    if (!src) return;

    var frame = document.createElement("iframe");
    frame.src = src + (src.indexOf("?") === -1 ? "?" : "&") + "autoplay=1";
    frame.setAttribute("title", facade.getAttribute("aria-label") || "YouTube video");
    frame.setAttribute("frameborder", "0");
    frame.setAttribute("allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    frame.setAttribute("allowfullscreen", "");

    /* Order matters. The frame is still detached here, so it has no browsing context and
       the src assignment above loads nothing yet; that leaves room to size it first, and
       the player consequently boots already measuring TARGET instead of reading the small
       on-screen box and committing to a low rendition it would only climb out of slowly. */
    fit(frame, facade.parentNode);
    live.push(frame);
    facade.replaceWith(frame);
    frame.focus();
  }

  function bind(facade) {
    facade.addEventListener("pointerenter", warm);
    facade.addEventListener("focus", warm);
    facade.addEventListener("click", function () {
      play(facade);
    });
  }

  function init() {
    var facades = document.querySelectorAll(".yt-facade[data-yt-src]");
    Array.prototype.forEach.call(facades, bind);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
