/*
 * Video player for the ADFX rebuild.
 *
 * Each embed is a static <button.yt-facade> with a local poster as its
 * background-image. That keeps custom thumbnails (no YouTube title/avatar chip)
 * and stays editable in Pinegrow.
 *
 * The previous implementation swapped the facade for a raw YouTube iframe, then
 * scaled that iframe to a 1920px internal viewport so YouTube would stream 1080p.
 * CSS transforms on a cross-origin iframe break hit-testing: the visible pause
 * button and timeline no longer line up with the coordinates YouTube receives,
 * so playback started and then every control died.
 *
 * This player never sends clicks into that iframe. Play / pause / stop / scrub /
 * mute / fullscreen live in our DOM. YouTube is driven through the IFrame API
 * with the iframe's pointer-events turned off. Local files (data-video-src on
 * the facade) use a plain <video> with the same bar.
 *
 * To add a YouTube clip: duplicate an embed .sqs-block, set data-yt-src to
 * https://www.youtube.com/embed/{ID} (watch?v= URLs also work), the facade
 * background-image to Resources/yt-{ID}.webp, and drop that WebP into Resources/.
 *
 * To add a local file instead, set data-video-src to the mp4/webm path on the
 * same button (data-yt-src can stay as a fallback).
 */
(function () {
  "use strict";

  var TARGET = 1920;
  var FLOOR = 640;
  var live = [];
  var apiPromise;

  function $(el, sel) {
    return el.querySelector(sel);
  }

  function mmss(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function videoId(src) {
    if (!src) return "";
    var watch = src.match(/[?&]v=([^&]+)/);
    if (watch) return watch[1];
    var embed = src.match(/\/embed\/([^?&/]+)/);
    if (embed) return embed[1];
    var short = src.match(/youtu\.be\/([^?&/]+)/);
    if (short) return short[1];
    return "";
  }

  function ico(name) {
    var paths = {
      play: '<path d="M8 5v14l11-7z"/>',
      pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>',
      stop: '<path d="M6 6h12v12H6z"/>',
      vol: '<path d="M4 9h4l5-4v14l-5-4H4V9zm11.5 3a3.5 3.5 0 0 0-2-3.16v6.32A3.5 3.5 0 0 0 15.5 12z"/>',
      muted: '<path d="M4 9h4l5-4v14l-5-4H4V9zm12.6-1.4 1.4 1.4-2.1 2 2.1 2-1.4 1.4-2.1-2-2.1 2-1.4-1.4 2.1-2-2.1-2 1.4-1.4 2.1 2 2.1-2z"/>',
      full: '<path d="M4 9V4h5v2H6v3H4zm10-5h5v5h-2V6h-3V4zM4 15h2v3h3v2H4v-5zm16 5h-5v-2h3v-3h2v5z"/>',
      exit: '<path d="M9 4H7v5H2v2h7V4zm8 0h-2v7h7V9h-5V4zM9 20v-7H2v2h5v5h2zm6-7v7h2v-5h5v-2h-7z"/>'
    };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || "") + "</svg>";
  }

  function warm() {
    if (warm.done) return;
    warm.done = true;
    ["https://www.youtube.com", "https://i.ytimg.com"].forEach(function (host) {
      var link = document.createElement("link");
      link.rel = "preconnect";
      link.href = host;
      document.head.appendChild(link);
    });
    loadApi();
  }

  function loadApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (resolve, reject) {
      var previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof previous === "function") previous();
        resolve();
      };
      var script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = function () {
        apiPromise = null;
        reject(new Error("YouTube API failed to load"));
      };
      document.head.appendChild(script);
    });
    return apiPromise;
  }

  function fit(frame, box) {
    if (!frame || !box) return;
    var w = box.clientWidth;
    var h = box.clientHeight;
    if (!w || !h) return;

    var full = document.fullscreenElement === box.closest(".yt-player") ||
               document.webkitFullscreenElement === box.closest(".yt-player");

    if (w < FLOOR || full) {
      frame.style.width = "100%";
      frame.style.height = "100%";
      frame.style.transform = "";
      return;
    }

    frame.style.width = TARGET + "px";
    frame.style.height = (TARGET * h / w) + "px";
    frame.style.transform = "scale(" + (w / TARGET) + ")";
  }

  function pauseSiteAudio() {
    if (typeof window.ADFXPauseAudio === "function") window.ADFXPauseAudio();
  }

  function Html5Engine(stage, src, onState) {
    var video = document.createElement("video");
    video.className = "yt-html5";
    video.playsInline = true;
    video.preload = "auto";
    video.src = src;
    video.setAttribute("playsinline", "");
    stage.insertBefore(video, stage.firstChild);
    this.video = video;
    video.addEventListener("play", function () { onState("playing"); });
    video.addEventListener("pause", function () { onState("paused"); });
    video.addEventListener("ended", function () {
      video.currentTime = 0;
      onState("ended");
    });
    video.addEventListener("durationchange", function () { onState("time"); });
    video.addEventListener("timeupdate", function () { onState("time"); });
    var play = video.play();
    if (play && play.catch) play.catch(function () { onState("paused"); });
  }

  Html5Engine.prototype.play = function () { return this.video.play(); };
  Html5Engine.prototype.pause = function () { this.video.pause(); };
  Html5Engine.prototype.seek = function (t) { this.video.currentTime = t; };
  Html5Engine.prototype.time = function () { return this.video.currentTime || 0; };
  Html5Engine.prototype.duration = function () {
    return isFinite(this.video.duration) ? this.video.duration : 0;
  };
  Html5Engine.prototype.isMuted = function () { return this.video.muted; };
  Html5Engine.prototype.mute = function () { this.video.muted = true; };
  Html5Engine.prototype.unmute = function () { this.video.muted = false; };
  Html5Engine.prototype.destroy = function () {
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    if (this.video.parentNode) this.video.parentNode.removeChild(this.video);
  };

  function YoutubeEngine(mount, id, stage, onState, onReady) {
    var self = this;
    this.player = null;
    this._stage = stage;
    loadApi().then(function () {
      if (!mount.isConnected) return;
      self.player = new window.YT.Player(mount, {
        videoId: id,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          origin: window.location.origin
        },
        events: {
          onReady: function () {
            var iframe = self.player.getIframe();
            if (iframe) {
              iframe.setAttribute("tabindex", "-1");
              iframe.style.pointerEvents = "none";
              iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
              fit(iframe, stage);
            }
            try { self.player.playVideo(); } catch (e) {}
            onReady();
            onState("time");
          },
          onStateChange: function (e) {
            var S = window.YT && window.YT.PlayerState;
            if (!S) return;
            if (e.data === S.PLAYING) onState("playing");
            else if (e.data === S.PAUSED) onState("paused");
            else if (e.data === S.ENDED) onState("ended");
          },
          onError: function (e) {
            var code = e && e.data;
            if (code === 2 || code === 100 || code === 101 || code === 150) {
              onState("error", "This video cannot be embedded.");
            }
          }
        }
      });
    }).catch(function () {
      onState("error", "YouTube player failed to load");
    });
  }

  YoutubeEngine.prototype.play = function () {
    if (this.player && this.player.playVideo) this.player.playVideo();
  };
  YoutubeEngine.prototype.pause = function () {
    if (this.player && this.player.pauseVideo) this.player.pauseVideo();
  };
  YoutubeEngine.prototype.seek = function (t) {
    if (this.player && this.player.seekTo) this.player.seekTo(t, true);
  };
  YoutubeEngine.prototype.time = function () {
    try { return this.player && this.player.getCurrentTime ? this.player.getCurrentTime() : 0; }
    catch (e) { return 0; }
  };
  YoutubeEngine.prototype.duration = function () {
    try { return this.player && this.player.getDuration ? this.player.getDuration() : 0; }
    catch (e) { return 0; }
  };
  YoutubeEngine.prototype.isMuted = function () {
    try { return !!(this.player && this.player.isMuted && this.player.isMuted()); }
    catch (e) { return false; }
  };
  YoutubeEngine.prototype.mute = function () {
    if (this.player && this.player.mute) this.player.mute();
  };
  YoutubeEngine.prototype.unmute = function () {
    if (this.player && this.player.unMute) this.player.unMute();
  };
  YoutubeEngine.prototype.iframe = function () {
    try { return this.player && this.player.getIframe && this.player.getIframe(); }
    catch (e) { return null; }
  };
  YoutubeEngine.prototype.destroy = function () {
    try { if (this.player && this.player.stopVideo) this.player.stopVideo(); } catch (e) {}
    try { if (this.player && this.player.destroy) this.player.destroy(); } catch (err) {}
    this.player = null;
  };

  function Player(facade) {
    this.src = facade.getAttribute("data-yt-src") || "";
    this.file = facade.getAttribute("data-video-src") || "";
    this.id = videoId(this.src);
    this.poster = facade.style.backgroundImage;
    this.label = facade.getAttribute("aria-label") || "Video";
    this.wrapper = facade.parentNode;
    this.engine = null;
    this.tick = 0;
    this.dragging = false;
    this.shown = 0;
    this.length = 0;
    this.playing = false;
    this._onFull = this.onFull.bind(this);
    this._onKey = this.onKey.bind(this);
    this.build(facade);
    live.push(this);
    this.boot();
  }

  Player.prototype.build = function (facade) {
    var root = document.createElement("div");
    root.className = "yt-player";
    root.setAttribute("tabindex", "0");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", this.label);

    var stage = document.createElement("div");
    stage.className = "yt-stage";
    if (this.poster) stage.style.backgroundImage = this.poster;

    var mount = document.createElement("div");
    mount.className = "yt-mount";

    var hit = document.createElement("button");
    hit.type = "button";
    hit.className = "yt-hit";
    hit.setAttribute("aria-label", "Pause video");

    var bar = document.createElement("div");
    bar.className = "yt-bar";
    bar.innerHTML =
      '<button type="button" class="yt-btn yt-play" aria-label="Pause">' + ico("pause") + "</button>" +
      '<button type="button" class="yt-btn yt-stop" aria-label="Stop and return to thumbnail">' + ico("stop") + "</button>" +
      '<div class="yt-track" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" tabindex="0">' +
        '<div class="yt-played"><span class="yt-knob"></span></div>' +
      "</div>" +
      '<span class="yt-time" aria-live="off">0:00 / 0:00</span>' +
      '<button type="button" class="yt-btn yt-mute" aria-label="Mute">' + ico("vol") + "</button>" +
      '<button type="button" class="yt-btn yt-full" aria-label="Full screen">' + ico("full") + "</button>";

    stage.appendChild(mount);
    stage.appendChild(hit);
    stage.appendChild(bar);
    root.appendChild(stage);
    facade.replaceWith(root);

    this.root = root;
    this.stage = stage;
    this.mount = mount;
    this.hit = hit;
    this.playBtn = $(bar, ".yt-play");
    this.stopBtn = $(bar, ".yt-stop");
    this.track = $(bar, ".yt-track");
    this.played = $(bar, ".yt-played");
    this.time = $(bar, ".yt-time");
    this.muteBtn = $(bar, ".yt-mute");
    this.fullBtn = $(bar, ".yt-full");

    var self = this;
    hit.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.toggle();
    });
    this.playBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.toggle();
    });
    this.stopBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.stop();
    });
    this.muteBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.toggleMute();
    });
    this.fullBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.toggleFull();
    });

    this.bindScrub(this.track);
    root.addEventListener("keydown", this._onKey);
    document.addEventListener("fullscreenchange", this._onFull);
    document.addEventListener("webkitfullscreenchange", this._onFull);
    root.focus({ preventScroll: true });
  };

  Player.prototype.boot = function () {
    var self = this;
    function onState(kind, message) {
      if (kind === "playing") self.setPlaying(true);
      else if (kind === "paused") self.setPlaying(false);
      else if (kind === "ended") {
        self.setPlaying(false);
        self.seekSeconds(0);
      } else if (kind === "error") {
        self.fail(message);
      }
      self.sync();
    }
    if (this.file) {
      this.engine = new Html5Engine(this.stage, this.file, onState);
      this.startTick();
      return;
    }
    if (!this.id) {
      this.fail("Missing video source");
      return;
    }
    this.engine = new YoutubeEngine(this.mount, this.id, this.stage, onState, function () {
      self.startTick();
    });
  };

  Player.prototype.bindScrub = function (track) {
    var self = this;

    function point(ev) {
      return ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX;
    }

    function seek(ev) {
      self.seekTo(point(ev));
    }

    function start(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      self.dragging = true;
      seek(ev);
      var shim = document.createElement("div");
      shim.className = "scrubber-shim";
      document.body.appendChild(shim);

      function move(e) { seek(e); }
      function up() {
        self.dragging = false;
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        document.removeEventListener("touchmove", move);
        document.removeEventListener("touchend", up);
        if (shim.parentNode) shim.parentNode.removeChild(shim);
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      document.addEventListener("touchmove", move, { passive: false });
      document.addEventListener("touchend", up);
    }

    track.addEventListener("mousedown", start);
    track.addEventListener("touchstart", start, { passive: false });
    track.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? 10 : 5;
      if (e.key === "ArrowLeft") { e.preventDefault(); self.nudge(-step); }
      if (e.key === "ArrowRight") { e.preventDefault(); self.nudge(step); }
      if (e.key === "Home") { e.preventDefault(); self.seekSeconds(0); }
      if (e.key === "End" && self.length) { e.preventDefault(); self.seekSeconds(self.length - 0.25); }
    });
  };

  Player.prototype.fail = function (message) {
    if (!this.stage || this.stage.querySelector(".yt-error")) return;
    var note = document.createElement("p");
    note.className = "yt-error";
    note.textContent = message + " Stop returns to the thumbnail.";
    this.stage.appendChild(note);
    this.setPlaying(false);
  };

  Player.prototype.setPlaying = function (playing) {
    this.playing = playing;
    if (!this.root) return;
    this.root.classList.toggle("is-playing", playing);
    this.playBtn.innerHTML = ico(playing ? "pause" : "play");
    this.playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    this.hit.setAttribute("aria-label", playing ? "Pause video" : "Play video");
  };

  Player.prototype.toggle = function () {
    if (!this.engine) return;
    if (this.playing) this.engine.pause();
    else this.engine.play();
  };

  Player.prototype.toggleMute = function () {
    if (!this.engine) return;
    if (this.engine.isMuted()) {
      this.engine.unmute();
      this.muteBtn.innerHTML = ico("vol");
      this.muteBtn.setAttribute("aria-label", "Mute");
    } else {
      this.engine.mute();
      this.muteBtn.innerHTML = ico("muted");
      this.muteBtn.setAttribute("aria-label", "Unmute");
    }
  };

  Player.prototype.toggleFull = function () {
    var node = this.root;
    var current = document.fullscreenElement || document.webkitFullscreenElement;
    if (current === node) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    var enter = node.requestFullscreen || node.webkitRequestFullscreen;
    if (enter) enter.call(node);
  };

  Player.prototype.onFull = function () {
    var iframe = this.engine && this.engine.iframe && this.engine.iframe();
    if (iframe) fit(iframe, this.stage);
    var full = document.fullscreenElement === this.root ||
               document.webkitFullscreenElement === this.root;
    this.fullBtn.innerHTML = ico(full ? "exit" : "full");
    this.fullBtn.setAttribute("aria-label", full ? "Exit full screen" : "Full screen");
    this.root.classList.toggle("is-full", full);
  };

  Player.prototype.seekTo = function (clientX) {
    var r = this.track.getBoundingClientRect();
    if (!r.width) return;
    var ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    this.seekSeconds(ratio * (this.length || 0));
  };

  Player.prototype.seekSeconds = function (seconds) {
    var d = this.length || 0;
    var t = d ? Math.min(d, Math.max(0, seconds)) : Math.max(0, seconds);
    this.shown = t;
    if (this.engine) this.engine.seek(t);
    this.paintAt(t);
  };

  Player.prototype.nudge = function (delta) {
    this.seekSeconds((this.shown || 0) + delta);
  };

  Player.prototype.startTick = function () {
    var self = this;
    if (this.tick) return;
    this.tick = window.setInterval(function () { self.sync(); }, 200);
  };

  Player.prototype.sync = function () {
    if (!this.engine) return;
    var d = this.engine.duration();
    if (d) this.length = d;
    if (!this.dragging) this.shown = this.engine.time();
    this.paintAt(this.shown);
  };

  Player.prototype.paintAt = function (now) {
    var d = this.length || 0;
    var ratio = d ? Math.min(1, Math.max(0, now / d)) : 0;
    this.played.style.width = (ratio * 100) + "%";
    this.time.textContent = mmss(now) + " / " + mmss(d);
    this.track.setAttribute("aria-valuemax", String(Math.round(d)));
    this.track.setAttribute("aria-valuenow", String(Math.round(now)));
  };

  Player.prototype.onKey = function (e) {
    if (e.target && e.target.closest && e.target.closest(".yt-track")) return;
    var step = e.shiftKey ? 10 : 5;
    if (e.key === " " || e.key === "k" || e.key === "K") { e.preventDefault(); this.toggle(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); this.nudge(-step); }
    else if (e.key === "ArrowRight") { e.preventDefault(); this.nudge(step); }
    else if (e.key === "Home") { e.preventDefault(); this.seekSeconds(0); }
    else if (e.key === "m" || e.key === "M") { e.preventDefault(); this.toggleMute(); }
    else if (e.key === "f" || e.key === "F") { e.preventDefault(); this.toggleFull(); }
    else if (e.key === "Escape") {
      var full = document.fullscreenElement === this.root ||
                 document.webkitFullscreenElement === this.root;
      if (!full) { e.preventDefault(); this.stop(); }
    }
  };

  Player.prototype.stop = function () {
    this.teardown(true);
  };

  Player.prototype.teardown = function (restore) {
    var i = live.indexOf(this);
    if (i !== -1) live.splice(i, 1);
    if (this.tick) { window.clearInterval(this.tick); this.tick = 0; }
    document.removeEventListener("fullscreenchange", this._onFull);
    document.removeEventListener("webkitfullscreenchange", this._onFull);
    var full = document.fullscreenElement === this.root ||
               document.webkitFullscreenElement === this.root;
    if (full) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
    if (this.engine && this.engine.destroy) this.engine.destroy();
    this.engine = null;
    if (restore && this.wrapper && this.root && this.root.isConnected) {
      var facade = document.createElement("button");
      facade.type = "button";
      facade.className = "yt-facade";
      if (this.src) facade.setAttribute("data-yt-src", this.src);
      if (this.file) facade.setAttribute("data-video-src", this.file);
      facade.setAttribute("aria-label", this.label);
      if (this.poster) facade.style.backgroundImage = this.poster;
      facade.innerHTML = '<span class="yt-facade-play" aria-hidden="true"></span>';
      this.root.replaceWith(facade);
    }
    this.root = null;
  };

  function stopAll() {
    live.slice().forEach(function (p) { p.stop(); });
  }

  function play(facade) {
    if (!facade || !facade.isConnected) return;
    stopAll();
    pauseSiteAudio();
    new Player(facade);
  }

  function init() {
    warm();

    document.addEventListener("pointerenter", function (e) {
      var block = e.target && e.target.closest && e.target.closest(".sqs-block-embed");
      if (block && block.querySelector(".yt-facade")) warm();
    }, true);

    document.addEventListener("click", function (e) {
      var block = e.target && e.target.closest && e.target.closest(".sqs-block-embed");
      if (!block) return;
      if (block.querySelector(".yt-player")) return;
      var facade = block.querySelector(".yt-facade");
      if (!facade) return;
      if (!facade.getAttribute("data-yt-src") && !facade.getAttribute("data-video-src")) return;
      play(facade);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var facade = e.target && e.target.closest && e.target.closest(".yt-facade");
      if (!facade) return;
      e.preventDefault();
      play(facade);
    });

    window.addEventListener("resize", function () {
      live.forEach(function (p) {
        var iframe = p.engine && p.engine.iframe && p.engine.iframe();
        if (iframe) fit(iframe, p.stage);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
