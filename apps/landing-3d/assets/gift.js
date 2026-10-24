/* The floating 3D gift: procedural three.js scene, driven by scroll.
 * Loaded by site.js. Needs the "three" import map declared in each page.
 *
 *   initGift({ canvas, kd, km, tops })
 *     kd / km  keyframes (desktop / mobile), one per <section>, in page order
 *     tops()   returns each section's top offset in document px (same order)
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerpAngle = (a, b, t) => { const d = ((b - a + 540) % 360) - 180; return a + d * t; };

export function initGift({ canvas, kd, km, tops }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    canvas.style.display = 'none'; // no WebGL — the page still works without the gift
    return;
  }
  const small = () => innerWidth < 760;
  renderer.setPixelRatio(Math.min(devicePixelRatio, small() ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  camera.position.set(0, 0, 10);

  scene.add(new THREE.HemisphereLight(0xf2eeff, 0x7a62c9, 1.3));
  const key = new THREE.DirectionalLight(0xfff1d6, 2.6); key.position.set(3, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xc8b8ff, 2.2); rim.position.set(-5, 2, -4); scene.add(rim);

  // flight (world position, scale, yaw) > giftRoot (roll/pitch) > the gift
  const flight = new THREE.Group(); scene.add(flight);
  const giftRoot = new THREE.Group(); flight.add(giftRoot);

  /* ------------------------------------------------------------ the gift (procedural) */
  const GLYPH_D = document.querySelector('#g path').getAttribute('d');

  function star4(g, cx, cy, r, inner = .28) {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 - Math.PI / 2;
      const rr = i % 2 ? r * inner : r;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
  }

  // wrapping paper: violet with sparkles and tiny genie glyphs
  function paperTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 512, 512);
    gr.addColorStop(0, '#7c3aed'); gr.addColorStop(1, '#5b21b6');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 48; i++) {
      g.globalAlpha = .25 + rnd() * .5;
      g.fillStyle = rnd() < .35 ? '#ffd978' : '#ffffff';
      star4(g, rnd() * 512, rnd() * 512, 5 + rnd() * 13); g.fill();
    }
    const glyph = new Path2D(GLYPH_D);
    for (let i = 0; i < 10; i++) {
      const s = .15 + rnd() * .07;
      g.save(); g.globalAlpha = .17; g.fillStyle = '#fff';
      g.translate(36 + rnd() * 440, 36 + rnd() * 440); g.rotate((rnd() - .5) * .8); g.scale(s, s); g.translate(-58, -90);
      g.fill(glyph); g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function loopShape(L, W) { // teardrop loop of ribbon, root at the origin, pointing +X
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(L * .15, W * .9, L * .8, W * .75, L, 0);
    s.bezierCurveTo(L * .8, -W * .75, L * .15, -W * .9, 0, 0);
    const h = new THREE.Path(), l2 = L * .6, w2 = W * .48, o = L * .22;
    h.moveTo(o, 0);
    h.bezierCurveTo(o + l2 * .15, w2 * .9, o + l2 * .8, w2 * .75, o + l2, 0);
    h.bezierCurveTo(o + l2 * .8, -w2 * .75, o + l2 * .15, -w2 * .9, o, 0);
    s.holes.push(h);
    return s;
  }
  function loopGeo(L, W) {
    const g = new THREE.ExtrudeGeometry(loopShape(L, W), { depth: .03, bevelEnabled: true, bevelThickness: .016, bevelSize: .011, bevelSegments: 3, curveSegments: 18 });
    g.translate(0, 0, -.015);
    return g;
  }
  function tailGeo(len) { // strap that runs over the lid, round its edge and down the side
    const pts = [[0, .03], [.12, .022], [.3, .008], [.5, .0], [.562, -.04], [.566, -.12], [.566, -.22], [.55, -.27], [.522, -.32], [.522, -.32 - len]]
      .map(([x, y]) => new THREE.Vector3(x, y, 0));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', .5);
    const sh = new THREE.Shape();
    sh.moveTo(-.006, -.052); sh.lineTo(.006, -.052); sh.lineTo(.006, .052); sh.lineTo(-.006, .052); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { steps: 48, bevelEnabled: false, extrudePath: curve });
  }

  const loops = [];
  const parts = {};
  function buildGift() {
    const holder = new THREE.Group();
    const paperTex = paperTexture();
    const lidTex = paperTex.clone(); lidTex.repeat.set(1, .28); lidTex.needsUpdate = true;
    const paper = new THREE.MeshPhysicalMaterial({
      map: paperTex, roughness: .4, metalness: 0, clearcoat: .55, clearcoatRoughness: .32,
      sheen: .4, sheenRoughness: .5, sheenColor: new THREE.Color(0xb79bff), envMapIntensity: .8,
    });
    const paperLid = paper.clone(); paperLid.map = lidTex;
    // satin gold: partly metal + a little self-glow so it stays bright on the dark sections
    const gold = new THREE.MeshPhysicalMaterial({
      color: 0xffcc4d, metalness: .6, roughness: .3, clearcoat: .5, clearcoatRoughness: .25,
      envMapIntensity: 1.5, emissive: 0x5a3600, emissiveIntensity: .35,
    });

    holder.add(new THREE.Mesh(new RoundedBoxGeometry(1, .78, 1, 5, .07), paper));
    holder.add(new THREE.Mesh(new RoundedBoxGeometry(.2, .79, 1.012, 3, .018), gold));
    holder.add(new THREE.Mesh(new RoundedBoxGeometry(1.012, .794, .2, 3, .018), gold));

    const lid = new THREE.Group(); lid.position.y = .485; holder.add(lid);
    lid.add(new THREE.Mesh(new RoundedBoxGeometry(1.08, .22, 1.08, 5, .06), paperLid));
    lid.add(new THREE.Mesh(new RoundedBoxGeometry(.2, .232, 1.092, 3, .018), gold));
    lid.add(new THREE.Mesh(new RoundedBoxGeometry(1.092, .238, .2, 3, .018), gold));

    const bow = new THREE.Group(); bow.position.y = .125; lid.add(bow);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(.085, 28, 18), gold);
    knot.scale.set(1, .72, 1); knot.position.y = .03; bow.add(knot);
    const big = loopGeo(.36, .18), smallLoop = loopGeo(.27, .14);
    for (let i = 0; i < 6; i++) {
      const isBig = i % 2 === 0;
      const lg = new THREE.Group(); lg.rotation.y = i * Math.PI / 3 + .2; lg.position.y = .03;
      const m = new THREE.Mesh(isBig ? big : smallLoop, gold);
      m.rotation.z = (isBig ? 50 : 30) * DEG;
      lg.add(m); bow.add(lg); loops.push({ lg, m, i });
    }
    const t1 = new THREE.Mesh(tailGeo(.16), gold); bow.add(t1);
    const t2 = new THREE.Mesh(tailGeo(.12), gold); t2.rotation.y = Math.PI; bow.add(t2);

    parts.lid = lid; parts.bow = bow;

    // normalise: biggest dimension = 1, centred
    const box = new THREE.Box3().setFromObject(holder);
    const size = new THREE.Vector3(); box.getSize(size);
    const k = 1 / Math.max(size.x, size.y, size.z);
    const wrap = new THREE.Group(); wrap.add(holder);
    holder.scale.setScalar(k);
    const box2 = new THREE.Box3().setFromObject(wrap);
    const c = new THREE.Vector3(); box2.getCenter(c);
    holder.position.sub(c);
    return wrap;
  }
  const gift = buildGift();
  giftRoot.add(gift);

  /* ------------------------------------------------------------ sparkles: an orbit + a trail of magic dust */
  function sparkleTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gl = g.createRadialGradient(64, 64, 0, 64, 64, 60);
    gl.addColorStop(0, 'rgba(255,236,170,.95)'); gl.addColorStop(.25, 'rgba(255,200,80,.45)'); gl.addColorStop(1, 'rgba(255,190,60,0)');
    g.fillStyle = gl; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff6d6'; star4(g, 64, 64, 58, .16); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 7, 0, 7); g.fill();
    return new THREE.CanvasTexture(c);
  }
  const NP = small() ? 100 : 150, ORB = small() ? 40 : 64;
  const sPos = new Float32Array(NP * 3), sSize = new Float32Array(NP), sAlpha = new Float32Array(NP);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
  sGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sAlpha, 1));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: sparkleTexture() }, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uPx;
      void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPx * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vA;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(t.rgb, t.a * vA); }`,
    transparent: true, depthWrite: false,
  });
  const sparks = new THREE.Points(sGeo, sparkMat); sparks.frustumCulled = false; scene.add(sparks);

  const orbit = Array.from({ length: ORB }, () => ({
    r: .75 + Math.random() * 1.0, a: Math.random() * 6.283, sp: (.35 + Math.random() * .8) * (Math.random() < .5 ? -1 : 1),
    y: (Math.random() - .5) * 1.5, ph: Math.random() * 6.283, sz: .3 + Math.random() * .6,
  }));
  const dust = Array.from({ length: NP - ORB }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, sz: 0 }));
  let emit = 0;

  /* ------------------------------------------------------------ scroll-driven flight path */
  // progress through the sections: 0 = top of the first, 1 = top of the second, …
  function progress(y) {
    const t = tops();
    if (!t.length || y <= t[0]) return 0;
    for (let i = 0; i < t.length - 1; i++) {
      if (y < t[i + 1]) return i + (y - t[i]) / Math.max(1, t[i + 1] - t[i]);
    }
    return t.length - 1;
  }
  function targetAt(p) {
    const K = small() ? km : kd;
    p = Number.isFinite(p) ? p : 0;
    p = clamp(p, 0, K.length - 1);
    const i = Math.min(K.length - 2, Math.floor(p));
    const f = p - i;
    const t = ease(clamp((f - .12) / .76, 0, 1)); // holds still at each section, flies in between
    const a = K[i], b = K[i + 1] || K[i];
    const m = Math.sin(t * Math.PI);
    return {
      x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) + m * -.22, s: lerp(a.s, b.s, t) * (1 + m * .12),
      yaw: lerpAngle(a.yaw, b.yaw, t), pitch: lerp(a.pitch, b.pitch, t), roll: lerp(a.roll, b.roll, t), moving: m,
    };
  }

  /* ------------------------------------------------------------ animation loop */
  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, small() ? 1.5 : 2));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    sparkMat.uniforms.uPx.value = renderer.getPixelRatio();
  }
  const cur = targetAt(progress(scrollY));
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', (e) => { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = -((e.clientY / innerHeight) * 2 - 1); });
  addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let prevX = cur.x, prevY = cur.y;
  const lidBase = parts.lid.position.y;
  const tmp = new THREE.Vector3();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), .05);
    const t = clock.elapsedTime;
    if (dt <= 0) return;

    const tg = targetAt(progress(scrollY));
    const k = 1 - Math.exp(-dt * 3.2);
    cur.x = lerp(cur.x, tg.x, k); cur.y = lerp(cur.y, tg.y, k); cur.s = lerp(cur.s, tg.s, k);
    cur.pitch = lerp(cur.pitch, tg.pitch, k); cur.roll = lerp(cur.roll, tg.roll, k);
    cur.yaw = lerpAngle(cur.yaw, tg.yaw, 1 - Math.exp(-dt * 2.6));
    cur.moving = tg.moving;
    const vx = (cur.x - prevX) / dt, vy = (cur.y - prevY) / dt;
    prevX = cur.x; prevY = cur.y;

    const km2 = 1 - Math.exp(-dt * 2);
    mouse.sx = lerp(mouse.sx, mouse.x, km2); mouse.sy = lerp(mouse.sy, mouse.y, km2);

    const halfH = Math.tan((camera.fov * DEG) / 2) * camera.position.z;
    const halfW = halfH * camera.aspect;
    const hover = Math.sin(t * 2.1) * .045 + Math.sin(t * 3.7) * .015;
    flight.position.set(
      cur.x * halfW + Math.sin(t * 1.3) * .04 + mouse.sx * .12,
      cur.y * halfH + hover * halfH * .5 + mouse.sy * .08,
      Math.sin(t * .9) * .15,
    );
    const S = halfH * 2 * .34 * cur.s; // the gift ≈ a third of the viewport height
    flight.scale.setScalar(S);
    flight.rotation.set(0, -(cur.yaw + mouse.sx * 12) * DEG, 0);

    const pitch = cur.pitch - clamp(vy * 22, -28, 28) + Math.sin(t * 2.1 + 1) * 3 + mouse.sy * 6;
    const roll = cur.roll + clamp(vx * 18, -30, 30) + Math.sin(t * 1.7) * 4;
    giftRoot.rotation.set(roll * DEG, 0, pitch * DEG, 'YZX');

    // the gift's own life: a slow turn, a lid that hops, a bow that breathes
    const mv = cur.moving;
    gift.rotation.y = t * .35;
    const hop = Math.pow(Math.max(0, Math.sin(t * 2.6)), 3) * .035 + mv * .05;
    parts.lid.position.y = lidBase + hop;
    parts.lid.rotation.z = Math.sin(t * 2.6 + .4) * .012 * (1 + mv * 2);
    parts.bow.rotation.y = Math.sin(t * .7) * .12;
    loops.forEach(({ m, i }) => { const s = 1 + Math.sin(t * 3 + i * 1.3) * .035 * (1 + mv * 2); m.scale.set(s, s, 1); });

    // sparkles: orbiting the gift + dust shed while it flies
    flight.getWorldPosition(tmp);
    const gx = tmp.x, gy = tmp.y, gz = tmp.z;
    for (let i = 0; i < ORB; i++) {
      const o = orbit[i];
      const ang = o.a + t * o.sp * (.8 + mv * 1.4);
      sPos[i * 3] = gx + Math.cos(ang) * o.r * S * .85;
      sPos[i * 3 + 1] = gy + o.y * S * .75 + Math.sin(t * 1.3 + o.ph) * .05 * S;
      sPos[i * 3 + 2] = gz + Math.sin(ang) * o.r * S * .55 + .1;
      const tw = .5 + .5 * Math.sin(t * 2.4 + o.ph);
      sSize[i] = o.sz * (.55 + tw * .7) * (1 + mv * .35);
      sAlpha[i] = clamp(.25 + tw * .75, 0, 1) * .9;
    }
    emit += dt * (5 + mv * 80);
    while (emit >= 1) {
      emit -= 1;
      const d = dust.find((q) => q.life <= 0);
      if (!d) break;
      d.max = d.life = .9 + Math.random() * .9;
      d.x = gx + (Math.random() - .5) * S * .9; d.y = gy + (Math.random() - .5) * S * .9; d.z = gz + (Math.random() - .5) * S * .4;
      d.vx = (Math.random() - .5) * .25 * S; d.vy = (.1 + Math.random() * .35) * S * .5;
      d.sz = .2 + Math.random() * .5;
    }
    for (let j = 0; j < dust.length; j++) {
      const d = dust[j], i = ORB + j;
      if (d.life > 0) {
        d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt;
        const a = clamp(d.life / d.max, 0, 1);
        sPos[i * 3] = d.x; sPos[i * 3 + 1] = d.y; sPos[i * 3 + 2] = d.z;
        sSize[i] = d.sz * (.4 + a * .8); sAlpha[i] = a * a * .95;
      } else { sAlpha[i] = 0; sSize[i] = 0; }
    }
    sGeo.attributes.position.needsUpdate = true;
    sGeo.attributes.aSize.needsUpdate = true;
    sGeo.attributes.aAlpha.needsUpdate = true;

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
