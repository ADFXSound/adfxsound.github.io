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
