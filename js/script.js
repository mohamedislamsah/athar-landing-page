/* ============================================================
   ATHAR — Landing page interactions
   Pure Vanilla JavaScript · No dependencies
   ============================================================ */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------
     QR configuration
     When the landing page is deployed, set DOWNLOAD_PAGE_URL
     to the final page address. Until then, if the page is being
     served over http(s), the current address is used instead.
     --------------------------------------------------------- */
  var CONFIG = {
    DOWNLOAD_PAGE_URL: "" /* e.g. "https://athar.example.com/" */
  };

  var QR_PLACEHOLDER_MSG = "QR placeholder active: set CONFIG.DOWNLOAD_PAGE_URL in js/script.js to the final deployed URL.";

  /* ================= Mobile navigation ================= */
  function initNav() {
    var toggle = document.querySelector(".nav-toggle");
    var menu = document.getElementById("nav-menu");
    if (!toggle || !menu) return;

    function setOpen(open) {
      menu.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "إغلاق قائمة التنقل" : "فتح قائمة التنقل");
    }

    toggle.addEventListener("click", function () {
      setOpen(menu.classList.contains("open") ? false : true);
    });

    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });

    document.addEventListener("click", function (e) {
      if (menu.classList.contains("open") &&
          !menu.contains(e.target) && !toggle.contains(e.target)) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth >= 900) setOpen(false);
    });
  }

  /* ================= Scroll reveal ================= */
  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ================= Active nav link ================= */
  function initActiveNav() {
    var links = document.querySelectorAll(".nav-link[href^='#']");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var map = {};
    links.forEach(function (link) {
      var id = link.getAttribute("href").slice(1);
      var sec = document.getElementById(id);
      if (sec) map[id] = link;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          links.forEach(function (l) { l.classList.remove("is-active"); });
          var link = map[entry.target.id];
          if (link) link.classList.add("is-active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
  }

  /* ================= Hero particles ================= */
  function initParticles() {
    var canvas = document.getElementById("particles");
    if (!canvas || reducedMotion) return;
    var ctx = canvas.getContext("2d");
    var colors = ["rgba(52,211,153,", "rgba(212,176,106,", "rgba(244,239,230,"];
    var particles = [];
    var w = 0, h = 0, raf = null, running = false;

    function makeParticle(spawnBelow) {
      return {
        x: Math.random() * w,
        y: spawnBelow ? Math.random() * h : h + 12,
        r: 0.8 + Math.random() * 2,
        vy: 0.08 + Math.random() * 0.3,
        vx: (Math.random() - 0.5) * 0.12,
        a: 0.15 + Math.random() * 0.4,
        c: colors[Math.floor(Math.random() * colors.length)],
        tw: Math.random() * Math.PI * 2
      };
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.min(70, Math.floor((w * h) / 22000));
      particles = [];
      for (var i = 0; i < count; i++) particles.push(makeParticle(true));
    }

    function step() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx;
        p.y -= p.vy;
        p.tw += 0.02;
        if (p.y < -12) particles[i] = makeParticle(false);
        if (p.x < -12) p.x = w + 12;
        if (p.x > w + 12) p.x = -12;
        var alpha = p.a * (0.6 + 0.4 * Math.sin(p.tw));
        ctx.beginPath();
        ctx.fillStyle = p.c + alpha + ")";
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = p.c + (alpha * 0.22) + ")";
        ctx.arc(p.x, p.y, p.r * 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(step);
    }

    function start() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(step);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, w, h);
    }

    var seen = false;
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { if (!seen) { resize(); seen = true; } start(); }
          else stop();
        });
      }, { threshold: 0 });
      io.observe(canvas);
    }

    var rto;
    window.addEventListener("resize", function () {
      clearTimeout(rto);
      rto = setTimeout(function () { if (running || !seen) resize(); }, 200);
    });
  }

  /* ================= Daily content switcher ================= */
  function initDaily() {
    var stage = document.getElementById("dailyStage");
    if (!stage) return;
    var cards = stage.querySelectorAll(".daily-card");
    var dots = document.querySelectorAll(".daily-dot");
    if (!cards.length) return;
    var index = 0;
    var timer = null;

    function show(i) {
      index = (i + cards.length) % cards.length;
      cards.forEach(function (c, k) {
        c.classList.toggle("is-active", k === index);
      });
      dots.forEach(function (d, k) {
        d.classList.toggle("is-active", k === index);
      });
    }

    function resetTimer() {
      if (timer) clearInterval(timer);
      if (reducedMotion) return;
      timer = setInterval(function () { show(index + 1); }, 5000);
    }

    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        show(parseInt(dot.getAttribute("data-goto"), 10));
        resetTimer();
      });
    });

    resetTimer();
  }

  /* ================= QR code ================= */
  function initQR() {
    var canvas = document.getElementById("qrCanvas");
    var qrCard = document.getElementById("qrCard");
    var urlEl = document.getElementById("qrUrl");
    if (!canvas || !qrCard) return;

    var url = CONFIG.DOWNLOAD_PAGE_URL;
    if (!/^https?:\/\//i.test(url)) {
      var here = window.location.href.split("#")[0];
      if (/^https?:\/\//i.test(here)) url = here;
    }

    function placeholder() {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      var logo = qrCard.querySelector(".qr-logo");
      if (logo) logo.parentNode.removeChild(logo);
      var ph = document.createElement("div");
      ph.className = "qr-placeholder";
      ph.setAttribute("role", "status");
      ph.innerHTML =
        '<svg class="icon" aria-hidden="true"><use href="#i-android"/></svg>' +
        "<strong>رمز الاستجابة السريعة سيكون جاهزًا<br>بعد نشر الصفحة على رابط ثابت</strong>" +
        "<small>حدِّث DOWNLOAD_PAGE_URL داخل js/script.js<br>برابط الصفحة النهائي</small>";
      qrCard.appendChild(ph);
      if (urlEl) urlEl.textContent = "";
      if (window.console) console.info(QR_PLACEHOLDER_MSG);
      return;
    }

    if (!url) { placeholder(); return; }

    if (!window.AtharQR) { placeholder(); return; }

    try {
      var qr = window.AtharQR.make(url);
      window.AtharQR.renderToCanvas(canvas, qr);
      if (urlEl) urlEl.textContent = url;
    } catch (err) {
      if (window.console) console.warn("QR generation failed:", err);
      placeholder();
    }
  }

  /* ================= Footer year ================= */
  function initYear() {
    var el = document.getElementById("year");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  /* ================= Boot ================= */
  document.addEventListener("DOMContentLoaded", function () {
    initNav();
    initReveal();
    initActiveNav();
    initParticles();
    initDaily();
    initQR();
    initYear();
  });
})();
