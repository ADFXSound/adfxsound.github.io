/*
 * Audio players for the .sqs-audio-embed blocks.
 *
 * Squarespace shipped ~3.3 MB of bundles whose only remaining job on this site was
 * driving these six players against markup that is already in the HTML. This walks
 * that same markup and wires it to a plain <audio> element, so nothing else needs to
 * load. Class names match the original stylesheet.
 */
(function () {
  "use strict";

  var players = [];

  function mmss(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function Player(embed) {
    this.embed = embed;
    this.widget = embed.querySelector(".sqs-widgets-audio-player");
    this.action = embed.querySelector(".action");
    this.track = embed.querySelector(".track");
    this.played = embed.querySelector(".played");
    this.elapsed = embed.querySelector(".time .progress");
    this.total = embed.querySelector(".time .total");

    var src = embed.getAttribute("data-asset-url");
    if (!this.widget || !src) return;

    this.audio = new Audio();
    // Nothing is fetched until the visitor presses play. The markup carries a
    // duration hint, so the running time can still be shown without touching the
    // file, which keeps six mp3s off the initial page load.
    this.audio.preload = "none";
    this.audio.src = src;
    this.started = false;

    var title = embed.querySelector(".title");
    if (title && !title.textContent.trim()) {
      title.textContent = embed.getAttribute("data-title") ||
        embed.getAttribute("data-untitled") || "Untitled";
    }

    // The markup ships a duration hint, so the total can show before metadata lands.
    var hint = parseInt(embed.getAttribute("data-length-in-milli-seconds"), 10);
    this.hinted = isFinite(hint) && hint > 0 ? hint / 1000 : 0;

    this.bind();
    players.push(this);
  }

  Player.prototype.duration = function () {
    return isFinite(this.audio.duration) && this.audio.duration > 0
      ? this.audio.duration
      : this.hinted;
  };

  Player.prototype.bind = function () {
    var self = this;

    this.action.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      self.toggle();
    });
    this.action.addEventListener("keydown", function (e) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        self.toggle();
      }
    });

    this.audio.addEventListener("timeupdate", function () { self.paint(); });
    this.audio.addEventListener("durationchange", function () { self.paint(); });
    this.audio.addEventListener("play", function () { self.setState("playing"); });
    this.audio.addEventListener("pause", function () { self.setState("paused"); });
    this.audio.addEventListener("ended", function () {
      self.audio.currentTime = 0;
      self.setState("stopped");
      self.paint();
    });

    // Scrubbing: mousedown anywhere on the bar seeks, and dragging keeps seeking.
    this.track.addEventListener("mousedown", function (e) {
      e.preventDefault();
      self.seekTo(e.clientX);
      var shim = document.createElement("div");
      shim.className = "scrubber-shim";
      document.body.appendChild(shim);

      function move(ev) { self.seekTo(ev.clientX); }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        if (shim.parentNode) shim.parentNode.removeChild(shim);
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  };

  Player.prototype.seekTo = function (clientX) {
    var r = this.track.getBoundingClientRect();
    if (!r.width) return;
    var ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    var d = this.duration();
    if (d) {
      this.audio.currentTime = ratio * d;
      this.reveal();
      this.paint();
    }
  };

  Player.prototype.toggle = function () {
    if (this.audio.paused) {
      // Only one track at a time, which is what the original did too.
      players.forEach(function (p) { if (p !== this && !p.audio.paused) p.audio.pause(); }, this);
      this.reveal();
      this.audio.play();
    } else {
      this.audio.pause();
    }
  };

  Player.prototype.reveal = function () {
    if (this.started) return;
    this.started = true;
    if (this.elapsed) this.elapsed.classList.add("loaded");
    if (this.total) this.total.classList.add("loaded");
  };

  Player.prototype.setState = function (state) {
    this.widget.classList.remove("playing", "paused", "stopped");
    this.widget.classList.add(state);
  };

  Player.prototype.paint = function () {
    var d = this.duration();
    if (this.played) {
      this.played.style.width = d ? (this.audio.currentTime / d) * 100 + "%" : "0%";
    }
    // The stylesheet always displays these spans, so the original player kept them
    // empty until playback began rather than hiding them. Same here.
    if (!this.started) return;
    if (this.elapsed) this.elapsed.textContent = mmss(this.audio.currentTime);
    if (this.total) this.total.textContent = mmss(d);
  };

  function init() {
    var embeds = document.querySelectorAll(".sqs-audio-embed[data-asset-url]");
    for (var i = 0; i < embeds.length; i++) new Player(embeds[i]);
    players.forEach(function (p) { p.setState("stopped"); p.paint(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
