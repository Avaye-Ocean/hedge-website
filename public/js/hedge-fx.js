// Hedge Wears visual FX — vanilla WebGL shader gradient + liquid-metal logo +
// scroll reveals/parallax. Progressive enhancement: no WebGL / reduced-motion → static fallback.
(function () {
  'use strict';

  var reduce =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Compact value-noise + fbm, shared by both fragment shaders.
  var NOISE = [
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);',
    'float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));',
    'return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}',
    'float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.0;a*=0.5;}return v;}',
  ].join('\n');

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';

  // Compile a fullscreen-quad program; returns a render context or null on failure.
  function makeGL(canvas, frag) {
    var gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!gl) return null;
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    }
    var vs = sh(gl.VERTEX_SHADER, VERT);
    var fs = sh(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    return {
      gl: gl,
      uTime: gl.getUniformLocation(prog, 'u_time'),
      uRes: gl.getUniformLocation(prog, 'u_res'),
      uMouse: gl.getUniformLocation(prog, 'u_mouse'),
    };
  }

  // Size a canvas to its box, capping DPR so large hero surfaces stay cheap.
  function resize(canvas, ctx) {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    var w = canvas.clientWidth * dpr,
      h = canvas.clientHeight * dpr;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx.gl.viewport(0, 0, w, h);
    }
  }

  // Drive a shader canvas with a rAF loop, pausing when off-screen or tab hidden.
  function run(canvas, ctx, speed) {
    var mx = 0.0,
      my = 0.0,
      visible = true,
      raf = 0;
    var target = canvas.closest('[data-fx-host]') || canvas;
    target.addEventListener('pointermove', function (e) {
      var r = target.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - 0.5;
      my = 0.5 - (e.clientY - r.top) / r.height;
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (visible && !raf) loop(performance.now());
      }).observe(canvas);
    }
    function loop(t) {
      raf = 0;
      if (!visible || document.hidden) return;
      resize(canvas, ctx);
      ctx.gl.uniform1f(ctx.uTime, (t * 0.001) * speed);
      ctx.gl.uniform2f(ctx.uRes, canvas.width, canvas.height);
      ctx.gl.uniform2f(ctx.uMouse, mx, my);
      ctx.gl.drawArrays(ctx.gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(loop);
    }
    loop(performance.now());
  }

  // 1) Shader-gradient hero — flowing brand orange ↔ ink behind the hero content.
  function initGradient() {
    var canvas = document.querySelector('.hero-fx-canvas');
    if (!canvas) return;
    var frag = [
      'precision highp float;uniform float u_time;uniform vec2 u_res;uniform vec2 u_mouse;',
      NOISE,
      'void main(){vec2 uv=gl_FragCoord.xy/u_res.xy;vec2 q=uv;q.x*=u_res.x/u_res.y;',
      'float t=u_time*0.06;',
      'float n=fbm(q*1.6+vec2(t,-t)+u_mouse*0.4);',
      'float m=fbm(q*2.7-vec2(t*0.7,t*0.3)+n);',
      'vec3 deep=vec3(0.016,0.027,0.035);vec3 ink=vec3(0.067,0.086,0.094);',
      'vec3 orange=vec3(0.757,0.314,0.024);vec3 amber=vec3(0.86,0.47,0.14);',
      'vec3 col=mix(deep,ink,smoothstep(0.1,0.95,n));',
      'col=mix(col,orange,smoothstep(0.5,0.95,n*0.6+m*0.55)*0.85);',
      'col+=amber*pow(max(m,0.0),3.0)*0.35;',
      'float v=smoothstep(1.25,0.15,length(uv-0.5));col*=mix(0.65,1.05,v);',
      'gl_FragColor=vec4(col,1.0);}',
    ].join('\n');
    var ctx = makeGL(canvas, frag);
    if (!ctx) return;
    canvas.setAttribute('data-active', '1');
    run(canvas, ctx, 1.0);
  }

  // 2) Liquid-metal logo — the H mark (CSS-masked canvas) rendered as flowing metal.
  function initLogo() {
    var canvas = document.querySelector('.hero-logo-canvas');
    if (!canvas) return;
    var frag = [
      'precision highp float;uniform float u_time;uniform vec2 u_res;uniform vec2 u_mouse;',
      NOISE,
      'void main(){vec2 uv=gl_FragCoord.xy/u_res.xy;vec2 q=(uv-0.5);q.x*=u_res.x/u_res.y;',
      'float t=u_time*0.18;',
      'float f=fbm(q*3.0+vec2(t,t*0.5)+u_mouse*0.6);',
      'float g=fbm(q*6.0-vec2(t*0.8,0.0)+f);',
      'float metal=0.5+0.5*sin((f+g)*6.2831+t*2.2);',
      'vec3 dark=vec3(0.08,0.06,0.05);vec3 orange=vec3(0.757,0.314,0.024);vec3 hot=vec3(1.0,0.72,0.38);',
      'vec3 col=mix(dark,orange,smoothstep(0.15,0.72,metal));',
      'col=mix(col,hot,pow(metal,6.0));',
      'gl_FragColor=vec4(col,1.0);}',
    ].join('\n');
    var ctx = makeGL(canvas, frag);
    if (!ctx) return;
    canvas.setAttribute('data-active', '1');
    run(canvas, ctx, 1.0);
  }

  // 3) Scroll reveals (IntersectionObserver) + light parallax on [data-parallax].
  function initScroll() {
    var reveals = document.querySelectorAll('[data-fx]');
    if ('IntersectionObserver' in window && reveals.length) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              e.target.classList.add('fx-in');
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
      );
      reveals.forEach(function (el) {
        return io.observe(el);
      });
    } else {
      reveals.forEach(function (el) {
        return el.classList.add('fx-in');
      });
    }

    var px = document.querySelectorAll('[data-parallax]');
    if (reduce || !px.length) return;
    var ticking = false;
    function apply() {
      ticking = false;
      var vh = window.innerHeight;
      px.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var d = (r.top + r.height / 2 - vh / 2) / vh;
        var s = parseFloat(el.getAttribute('data-parallax')) || 0.12;
        el.style.transform = 'translate3d(0,' + (d * s * 100).toFixed(2) + 'px,0)';
      });
    }
    window.addEventListener(
      'scroll',
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(apply);
        }
      },
      { passive: true }
    );
    apply();
  }

  function start() {
    if (!reduce) {
      initGradient();
      initLogo();
    }
    initScroll();
  }
  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
})();
