// scripts.js

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('interactive-canvas');
  if (!canvas) return console.error('Canvas not found');

  // THREE.js core
  const scene    = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  const camera  = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.z = 15;

  // Environment map
  const envLoader = new THREE.CubeTextureLoader();
  const envMap = envLoader
    .setPath('https://unpkg.com/three@0.150.1/examples/textures/cube/Bridge2/')
    .load(['posx.jpg','negx.jpg','posy.jpg','negy.jpg','posz.jpg','negz.jpg']);
  scene.environment = envMap;

  // Bump map
  const bumpMap = new THREE.TextureLoader().load('assets/patternBump.png');
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(4, 4);

  // Material
  const mat = new THREE.MeshPhysicalMaterial({
    color:             0xffffff,
    metalness:         1.5,
    roughness:         7.4,
    clearcoat:         1.4,
    clearcoatRoughness:0.8,
    envMap,
    envMapIntensity:   1.0,
    emissive:          0xffffff,
    emissiveIntensity: 2.0,
    bumpMap,
    bumpScale:         1.9,
    transparent:       true,
    opacity:           0.8
  });

  // Create the orb
  const geo = new THREE.SphereGeometry(1, 128, 128);
  const orb = new THREE.Mesh(geo, mat);
  orb.scale.set(0.2, 0.2, 0.2);

  // 1) Restore saved position if present
  const savedX = parseFloat(localStorage.getItem('orbPosX'));
  const savedY = parseFloat(localStorage.getItem('orbPosY'));
  if (!isNaN(savedX) && !isNaN(savedY)) {
    orb.position.set(savedX, savedY, 0);
  }

  scene.add(orb);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  const dir1 = new THREE.DirectionalLight(0xffffff, 1.0);
  dir1.position.set(5, 10, 7);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.6);
  dir2.position.set(-5, 5, -5);
  scene.add(dir2);
  const point = new THREE.PointLight(0xffffff, 1.0, 100);
  scene.add(point);

  // Interaction state
  const trail         = [];
  const maxTrail      = 60;
  const trailLag      = 10;
  const idleThreshold = 1331;
  let lastMove        = performance.now();
  let idle            = false;

  // Click/stretch state
  let isClicked = false;
  let clickTime = 0;
  const clickDur = 300; // ms

  window.addEventListener('mousedown', () => {
    isClicked = true;
    clickTime = performance.now();
  });
  window.addEventListener('mouseup', () => {
    isClicked = false;
    clickTime = performance.now();
  });

  window.addEventListener('mousemove', e => {
    const x = (e.clientX / window.innerWidth)*2 - 1;
    const y = -(e.clientY / window.innerHeight)*2 + 1;
    trail.push({ x: x*5, y: y*3 });
    if (trail.length > maxTrail) trail.shift();
    lastMove = performance.now();
    if (idle) {
      idle = false;
      mat.opacity = 0;
    }
  });

  // Orb dynamics settings
  const settings = {
    period:          4,
    minScale:        0.2,
    maxScale:        0.68,
    wobbleAmp:       0.2,
    wobbleFreq:      1.5,
    repulseRadius:   0.02,
    repulseStrength: 0.05,
    upwardBias:      0.15,
    worldTopY:       3
  };

  function animate(ms) {
    requestAnimationFrame(animate);
    const t    = ms * 0.001;
    const {
      period, minScale, maxScale,
      wobbleAmp, wobbleFreq,
      repulseRadius, repulseStrength,
      upwardBias, worldTopY
    } = settings;

    // 1) Base oscillation
    const omega = (2*Math.PI)/period;
    const osc   = Math.sin(omega*t)*0.5 + 0.5;
    const base  = minScale + (maxScale-minScale)*osc;

    // 2) Click-stretch
    let pct = 0;
    const sinceClick = performance.now() - clickTime;
    if (isClicked) {
      pct = 1;
    } else if (sinceClick < clickDur) {
      pct = 1 - (sinceClick / clickDur);
    }
    pct = Math.max(0, Math.min(1, pct));
    const stretchX = base * (1 + 0.5 * pct);
    const stretchY = base * (1 - 0.5 * pct);
    const stretchZ = base;
    orb.scale.set(stretchX, stretchY, stretchZ);

    // 3) Wobble dents
    orb.scale.x += Math.sin(t*wobbleFreq + 0.7) * wobbleAmp * 0.2;
    orb.scale.y += Math.cos(t*wobbleFreq + 0.9) * wobbleAmp * 0.3;
    orb.scale.z += Math.sin(t*wobbleFreq + 1.4) * wobbleAmp * 0.25;

    // 4) Idle teleport
    if ((performance.now() - lastMove) > idleThreshold && !idle) {
      idle = true;
      mat.opacity = 0;

      const maxX   = 5;
      const maxY   = worldTopY;
      const angle  = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random());

      const x = Math.cos(angle) * radius * maxX;
      const y = Math.sin(angle) * radius * maxY;

      orb.position.set(x, y, 0);
    }

    // 5) Trail-lag chase
    let target = trail.length > trailLag
      ? trail[trail.length-1-trailLag]
      : trail[0] || { x: orb.position.x, y: orb.position.y };

    // 6) Upward bias
    target.y += (worldTopY - target.y) * upwardBias;

    // 7) Repel
    const dx   = orb.position.x - target.x;
    const dy   = orb.position.y - target.y;
    const dist = Math.hypot(dx, dy) || 1;
    let desiredX = target.x, desiredY = target.y;
    if (!idle && dist < repulseRadius) {
      desiredX = orb.position.x + (dx/dist)*repulseStrength;
      desiredY = orb.position.y + (dy/dist)*repulseStrength;
    }

    // 8) Smooth follow
    orb.position.x += (desiredX - orb.position.x) * 0.02;
    orb.position.y += (desiredY - orb.position.y) * 0.03;

    // 9) Fade in/out
    const targetOp = idle ? 0 : 1;
    mat.opacity += (targetOp - mat.opacity) * 0.03;

    // 10) Rainbow + emissive + card hue sync
    const hueFrac = (t * 0.6) % 1.0;        // fraction [0,1)
    mat.color.setHSL(hueFrac, 0.9, 0.6);
    mat.emissive.setHSL(hueFrac, 0.9, 0.6);
    mat.emissiveIntensity = 1 + 0.5 * Math.sin(t * 2.0);

    // Update CSS card hue (0–360)
    const hue = Math.floor(hueFrac * 360);
    document.documentElement.style.setProperty('--card-hue', hue);

    // 11) Light follows orb
    point.position.copy(orb.position);

    // 12) Subtle rotation
    orb.rotation.x += 0.0008;
    orb.rotation.y += 0.0012;

    renderer.render(scene, camera);
  }

  animate(0);

  // 2) Save orb position before unload
  window.addEventListener('beforeunload', () => {
    localStorage.setItem('orbPosX', orb.position.x);
    localStorage.setItem('orbPosY', orb.position.y);
  });

  // Handle resizing
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // Toggle video controls on hover
  document.querySelectorAll('video').forEach(video => {
    // start without controls
    video.removeAttribute('controls');

    video.addEventListener('mouseenter', () => {
      video.setAttribute('controls', '');
    });

    video.addEventListener('mouseleave', () => {
      video.removeAttribute('controls');
    });
  });
});
