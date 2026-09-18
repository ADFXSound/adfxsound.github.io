(function () {
  "use strict";

  function setupVideo(video) {
    if (video.dataset.adfxControlsReady === "1") return;
    video.dataset.adfxControlsReady = "1";

    video.controls = true;

    var wrapper = video.parentElement;
    if (!wrapper) return;
    if (getComputedStyle(wrapper).position === "static") {
      wrapper.style.position = "relative";
    }

    var button = document.createElement("button");
    button.type = "button";
    button.className = "adfx-video-toggle";
    button.setAttribute("aria-label", "Pause video");

    function sync() {
      var paused = video.paused || video.ended;
      button.textContent = paused ? "Play" : "Pause";
      button.setAttribute("aria-label", paused ? "Play video" : "Pause video");
    }

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (video.paused || video.ended) {
        var result = video.play();
        if (result && result.catch) result.catch(function () {});
      } else {
        video.pause();
      }
    });

    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    video.addEventListener("ended", sync);
    wrapper.appendChild(button);
    sync();
  }

  function init() {
    document.querySelectorAll(".sqs-block-image video").forEach(setupVideo);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
