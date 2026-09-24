(function () {
  'use strict';

  // ─── Mobile Nav Toggle ───────────────────────────────────────────────────────
  var hamburger = document.querySelector('.nav-hamburger');
  var mobileMenu = document.querySelector('.nav-mobile-menu');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', function () {
      var isOpen = mobileMenu.classList.contains('open');
      if (isOpen) {
        mobileMenu.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      } else {
        mobileMenu.classList.add('open');
        hamburger.setAttribute('aria-expanded', 'true');
      }
    });

    // Close mobile menu when a link inside it is clicked
    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileMenu.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ─── Smooth Scroll for Anchor Links ─────────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var targetId = anchor.getAttribute('href');
      if (targetId === '#') return;
      var target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ─── Sticky Nav: add .scrolled on scroll ────────────────────────────────────
  var nav = document.querySelector('nav');

  if (nav) {
    function onScroll() {
      if (window.scrollY > 10) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    // Run once on load in case page is already scrolled
    onScroll();
  }

  // ─── Intersection Observer: .animate-on-scroll ──────────────────────────────
  var animatables = document.querySelectorAll('.animate-on-scroll');

  if (animatables.length > 0 && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    animatables.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    // Fallback: just make everything visible immediately
    animatables.forEach(function (el) {
      el.classList.add('visible');
    });
  }
})();
