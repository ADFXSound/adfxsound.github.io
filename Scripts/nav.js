/*
 * Mobile navigation toggle.
 *
 * This is the only behaviour the site actually used from Squarespace's site.js. The
 * accompanying navBreaker() there is dead on this template: it only runs for a body
 * carrying header-navigation-split, and every page here is header-navigation-normal.
 */
(function () {
  "use strict";

  function init() {
    var link = document.querySelector("#mobileMenuLink a");
    var nav = document.querySelector("#mobileNav");
    if (!link || !nav) return;

    link.addEventListener("click", function (e) {
      e.preventDefault();
      nav.classList.toggle("menu-open");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
