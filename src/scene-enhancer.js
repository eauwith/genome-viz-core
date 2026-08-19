import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { gsap } from 'gsap';
import { getPalette } from './theme.js';
import { attachSway } from './sway.js';
import { gateZoomBehindModifier } from './zoom-gate.js';
import { configureRenderer, environmentFor, tissueMaterial, fitCameraToRadius } from './render-quality.js';

const SPAN = 9.6;          // DNA length in world units
const PER_SIDE = 3;        // flanking octamers each side of the enhancer
const ENH_HALF = 0.85;     // half-width of the enhancer element

function helixPoint(x, phase, radius){
  const a = x * 2.6 + phase;
  return new THREE.Vector3(x, radius*Math.cos(a), radius*Math.sin(a));
}

export function createEnhancerScene(container){
  const pal = getPalette();
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 2.2, 10);

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  configureRenderer(renderer);
  scene.environment = environmentFor(renderer);
  renderer.domElement.style.position='absolute'; renderer.domElement.style.inset='0';
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position='absolute';
  labelRenderer.domElement.style.inset='0';
  labelRenderer.domElement.style.pointerEvents='none';
  container.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  renderer.domElement.style.touchAction = 'pan-y';
  gateZoomBehindModifier(controls, renderer.domElement);
  let autoFit = true;
  controls.addEventListener('start', () => { autoFit = false; });
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 5; controls.maxDistance = 16;
  controls.minPolarAngle = Math.PI*0.28; controls.maxPolarAngle = Math.PI*0.68;
  controls.minAzimuthAngle = -0.5; controls.maxAzimuthAngle = 0.5;
  controls.enablePan = false;

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(4,6,6); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-5,-2,3); scene.add(fill);

  const label = (parent, text, cls, pos) => {
    const el = document.createElement('div');
    el.className = 'gl-label ' + cls;
    el.innerHTML = text;
    const o = new CSS2DObject(el);
    o.position.set(...pos);
    parent.add(o);
    return el;
  };

  // ---------- DNA double helix ----------
  const dnaGroup = new THREE.Group();
  world.add(dnaGroup);
  function strand(phase, color){
    const pts = [];
    for(let i=0;i<=180;i++) pts.push(helixPoint(-SPAN/2 + (i/180)*SPAN, phase, 0.19));
    return new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 170, 0.05, 8, false),
      tissueMaterial(color, { roughness: 0.45 })
    );
  }
  dnaGroup.add(strand(0, pal.inkDim));
  dnaGroup.add(strand(Math.PI, pal.inkFaint));

  const rungMat = new THREE.MeshBasicMaterial({ color:new THREE.Color(pal.border), transparent:true, opacity:0.5 });
  const rungGeo = new THREE.CylinderGeometry(0.013, 0.013, 1, 6);
  const upVec = new THREE.Vector3(0,1,0);
  for(let i=0;i<=64;i++){
    const x = -SPAN/2 + (i/64)*SPAN;
    const p1 = helixPoint(x, 0, 0.19), p2 = helixPoint(x, Math.PI, 0.19);
    const c = new THREE.Mesh(rungGeo, rungMat);
    c.position.copy(p1).add(p2).multiplyScalar(0.5);
    c.scale.y = p1.distanceTo(p2);
    c.quaternion.setFromUnitVectors(upVec, p2.clone().sub(p1).normalize());
    dnaGroup.add(c);
  }

  // The enhancer element itself — a highlighted stretch of the double helix.
  const enhSleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, ENH_HALF*2, 28, 1, true),
    new THREE.MeshBasicMaterial({ color:new THREE.Color(pal.up), transparent:true, opacity:0.22, side:THREE.DoubleSide, depthWrite:false })
  );
  enhSleeve.rotation.z = Math.PI/2;
  world.add(enhSleeve);
  label(enhSleeve, 'Enhancer', 'gl-organelle-label gl-organelle-label--key', [0, 0.62, 0]);

  // ---------- nucleosomes ----------
  // The centre pair slides ONTO the enhancer when chromatin closes, and off it
  // when chromatin opens — that occlusion is the whole mechanism.
  const histoneMat = tissueMaterial(pal.surface2, { roughness: 0.5 });
  function makeNucleosome(){
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.34, 28), histoneMat);
    disc.rotation.z = Math.PI/2;
    g.add(disc);
    // DNA wrapped ~1.7 turns around the octamer
    const wrap = new THREE.Mesh(
      new THREE.TorusGeometry(0.44, 0.055, 10, 40),
      tissueMaterial(pal.inkDim, { roughness: 0.5 })
    );
    wrap.rotation.y = Math.PI/2;
    g.add(wrap);
    world.add(g);
    return g;
  }

  const flanking = [];
  for(let side of [-1, 1]){
    for(let rank=0; rank<PER_SIDE; rank++) flanking.push({ g: makeNucleosome(), side, rank });
  }
  // The central octamer is the one that matters: it physically occupies the
  // enhancer in heterochromatin and is evicted as the element opens.
  const centralNuc = makeNucleosome();
  label(flanking[PER_SIDE].g, 'Nucleosome', 'gl-organelle-label', [0, 0.72, 0]);

  // ---------- transcription factors ----------
  const tfGroup = new THREE.Group();
  world.add(tfGroup);
  const tfs = [];
  const tfDefs = [
    { p:[-0.5, 0.78, 0.16], s:0.2,  c:pal.up },
    { p:[ 0.12, 0.95, -0.1], s:0.25, c:pal.up },
    { p:[ 0.62, 0.74, 0.2],  s:0.18, c:pal.up },
  ];
  tfDefs.forEach(d=>{
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(d.s, 2),
      tissueMaterial(d.c, { roughness: 0.35, opacity: 1, emissive: d.c, emissiveIntensity: 0.2 })
    );
    m.position.set(...d.p);
    m.material.transparent = true;
    tfGroup.add(m);
    tfs.push({ mesh:m, home:new THREE.Vector3(...d.p) });
  });
  const tfLabel = label(tfs[1].mesh, 'Transcription factors bound', 'gl-organelle-label gl-organelle-label--key', [0, 0.5, 0]);

  // acetyl / repressive mark flags above the flanking nucleosomes
  const acFlag = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.42, 14),
    tissueMaterial(pal.up, { roughness: 0.4, emissive: pal.up, emissiveIntensity: 0.25 })
  );
  acFlag.material.transparent = true;
  world.add(acFlag);
  const acLabel = label(acFlag, 'H3K27ac', 'gl-flag-up gl-label', [0, 0.42, 0]);

  const repFlag = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.42, 14),
    tissueMaterial(pal.down, { roughness: 0.4, emissive: pal.down, emissiveIntensity: 0.25 })
  );
  repFlag.material.transparent = true;
  repFlag.rotation.z = Math.PI;
  world.add(repFlag);
  const repLabel = label(repFlag, 'H3K9me3 · compacted', 'gl-flag-down gl-label', [0, 0.42, 0]);

  function resize(){
    const w = container.clientWidth, h = container.clientHeight;
    if(!w || !h) return;
    camera.aspect = w/h; camera.updateProjectionMatrix();
    renderer.setSize(w,h); labelRenderer.setSize(w,h);
    if(autoFit) fitCameraToRadius(camera, controls, 5.0);
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  let raf;
  (function tick(){
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  })();

  attachSway(world, controls, { amplitude: 0.09 });

  const anim = { open: 0.4 };

  function applyState(){
    const o = anim.open;                        // 0 = heterochromatin, 1 = euchromatin
    const gap = ENH_HALF + 0.55 + o * 0.45;     // where the first flanker sits
    const pitch = 0.95 + o * 0.25;              // spacing of the flanking array
    const clump = 1 - o;

    flanking.forEach(({ g, side, rank }) => {
      g.position.x = side * (gap + rank * pitch);
      // closed chromatin also stacks the array off-axis into a compact zig-zag
      g.position.y = clump * 0.30 * (rank % 2 === 0 ? 1 : -1);
      g.position.z = clump * 0.55 * (rank % 2 === 0 ? -1 : 1);
      g.rotation.x = clump * 0.5 * side;
    });

    // Occupies the enhancer when closed; shrinks away (evicted) as it opens.
    const occ = Math.max(0, 1 - o * 1.35);
    centralNuc.visible = occ > 0.02;
    centralNuc.scale.setScalar(occ);
    centralNuc.position.set(0, 0, 0);

    // TFs can only dock once the enhancer DNA is nucleosome-free
    tfs.forEach(t => {
      const m = t.mesh;
      m.material.opacity = Math.max(0, (o - 0.35) / 0.5);
      m.visible = m.material.opacity > 0.02;
      m.position.set(t.home.x, t.home.y + (1 - o) * 1.1, t.home.z);
      m.scale.setScalar(0.6 + o * 0.5);
    });
    tfLabel.style.opacity = o > 0.55 ? '1' : '0';

    acFlag.position.set(-(gap + 0.02), 0.62, 0);
    acFlag.material.opacity = Math.max(0.05, (o - 0.25) / 0.6);
    acFlag.visible = acFlag.material.opacity > 0.06;
    acLabel.style.opacity = o > 0.5 ? '1' : '0';

    repFlag.position.set(gap + 0.02, -0.62, 0);
    repFlag.material.opacity = Math.max(0.05, (0.75 - o) / 0.6);
    repFlag.visible = repFlag.material.opacity > 0.06;
    repLabel.style.opacity = o < 0.45 ? '1' : '0';

    enhSleeve.material.opacity = 0.1 + o * 0.24;
  }

  function setState({ open, animate = true }){
    if(animate) gsap.to(anim, { open, duration: 0.7, ease:'power2.out', onUpdate: applyState });
    else { anim.open = open; applyState(); }
  }
  setState({ open: 0.4, animate:false });

  return {
    setState,
    dispose(){ cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); container.innerHTML=''; }
  };
}
