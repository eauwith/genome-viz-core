import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { gsap } from 'gsap';
import { getPalette } from './theme.js';
import { attachSway } from './sway.js';
import { fitCameraToRadius } from './render-quality.js';
import { gateZoomBehindModifier } from './zoom-gate.js';

const N_NUC = 11;
const PROMOTER_A = 5, PROMOTER_B = 6;

// Spacing carries the euchromatin/heterochromatin reading, and the off-axis
// displacement amplifies it: open = wide + straight, closed = tight + clumped.
function beadTarget(i, access){
  const spacing = 0.48 + (access/100)*0.62;
  const amt = 1 - access/100;
  const alt = i%2===0 ? 1 : -1;
  return [
    (i - (N_NUC-1)/2) * spacing,
    amt * 0.40 * -alt,
    amt * 0.85 * alt
  ];
}

export function createChromatinScene(container){
  const pal = getPalette();
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 1.7, 9.2);

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.position='absolute'; renderer.domElement.style.inset='0';
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position='absolute';
  labelRenderer.domElement.style.inset='0';
  labelRenderer.domElement.style.pointerEvents='none';
  container.appendChild(labelRenderer.domElement);

  // Listen on the canvas, not the pointer-events:none CSS2D label layer.
  const controls = new OrbitControls(camera, renderer.domElement);
  // Undo OrbitControls' touchAction:'none' so mobile page scrolling still works.
  renderer.domElement.style.touchAction = 'pan-y';
  gateZoomBehindModifier(controls, renderer.domElement);
  let autoFit = true;
  controls.addEventListener('start', () => { autoFit = false; });
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 6; controls.maxDistance = 14;
  controls.minPolarAngle = Math.PI*0.30; controls.maxPolarAngle = Math.PI*0.66;
  controls.minAzimuthAngle = -0.5; controls.maxAzimuthAngle = 0.5;
  controls.enablePan = false;

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(3,5,5); scene.add(key);
  const rim = new THREE.PointLight(0xffffff, 0.3); rim.position.set(-3,-2,-3); scene.add(rim);

  const beadGeo = new THREE.SphereGeometry(0.26, 22, 16);
  const beads = [];
  for(let i=0;i<N_NUC;i++){
    const isPromoter = i===PROMOTER_A || i===PROMOTER_B;
    const mat = isPromoter
      ? new THREE.MeshStandardMaterial({ color:new THREE.Color(pal.surface), roughness:0.4, emissive:new THREE.Color(pal.up), emissiveIntensity:0.22 })
      : new THREE.MeshStandardMaterial({ color:new THREE.Color(pal.surface2), roughness:0.6 });
    const m = new THREE.Mesh(beadGeo, mat);
    world.add(m);
    beads.push(m);
  }

  const backboneMat = new THREE.MeshStandardMaterial({ color:new THREE.Color(pal.border), roughness:0.8 });
  let backbone = null;
  function rebuildBackbone(){
    const curve = new THREE.CatmullRomCurve3(beads.map(b=>b.position.clone()));
    const geo = new THREE.TubeGeometry(curve, 70, 0.045, 8, false);
    if(backbone){ backbone.geometry.dispose(); backbone.geometry = geo; }
    else { backbone = new THREE.Mesh(geo, backboneMat); world.add(backbone); }
  }

  const upColor = new THREE.Color(pal.up), downColor = new THREE.Color(pal.down);
  const flagGeo = new THREE.ConeGeometry(0.12, 0.5, 16);

  const actFlag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color:upColor, emissive:upColor, emissiveIntensity:0.3, transparent:true, opacity:0.9 }));
  const repFlag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color:downColor, emissive:downColor, emissiveIntensity:0.3, transparent:true, opacity:0.9 }));
  repFlag.rotation.z = Math.PI;
  world.add(actFlag, repFlag);

  const actLabel = document.createElement('div');
  actLabel.className = 'gl-label gl-flag-up';
  actLabel.textContent = 'K4me3 · K27ac';
  const actLabelObj = new CSS2DObject(actLabel);
  actLabelObj.position.set(0, 0.45, 0);
  actFlag.add(actLabelObj);

  const repLabel = document.createElement('div');
  repLabel.className = 'gl-label gl-flag-down';
  repLabel.textContent = 'K9me3 · K27me3';
  const repLabelObj = new CSS2DObject(repLabel);
  repLabelObj.position.set(0, 0.45, 0); // cone is flipped, so +y is downward in world
  repFlag.add(repLabelObj);

  function resize(){
    const w = container.clientWidth, h = container.clientHeight;
    if(!w || !h) return;
    camera.aspect = w/h; camera.updateProjectionMatrix();
    renderer.setSize(w,h); labelRenderer.setSize(w,h);
    if(autoFit) fitCameraToRadius(camera, controls, 5.20);
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  let raf;
  (function tick(){
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  })();

  attachSway(world, controls);

  // A single proxy drives every bead, so the backbone is rebuilt once per frame
  // rather than once per bead per frame.
  const anim = { access: 40, act: 0.4, rep: 0.4 };

  function applyLayout(){
    for(let i=0;i<N_NUC;i++) beads[i].position.set(...beadTarget(i, anim.access));
    rebuildBackbone();
    const a = beads[PROMOTER_A].position, b = beads[PROMOTER_B].position;
    actFlag.position.set(a.x, a.y + 0.95, a.z);
    repFlag.position.set(b.x, b.y - 0.95, b.z);
  }

  function setState({ access, actLevel, repLevel, dir, animate=true }){
    const actScale = 0.4 + (actLevel/100)*1.3;
    const repScale = 0.4 + (repLevel/100)*1.3;
    const dirColor = dir==='up' ? upColor : downColor;
    beads[PROMOTER_A].material.emissive.copy(dirColor);
    beads[PROMOTER_B].material.emissive.copy(dirColor);

    if(animate){
      gsap.to(anim, { access, duration:0.65, ease:'power2.out', onUpdate: applyLayout });
      gsap.to(actFlag.scale, { x:actScale, y:actScale, z:actScale, duration:0.6, ease:'back.out(1.6)' });
      gsap.to(repFlag.scale, { x:repScale, y:repScale, z:repScale, duration:0.6, ease:'back.out(1.6)' });
      gsap.to(actFlag.material, { opacity: 0.25 + (actLevel/100)*0.75, duration:0.6 });
      gsap.to(repFlag.material, { opacity: 0.25 + (repLevel/100)*0.75, duration:0.6 });
    } else {
      anim.access = access;
      applyLayout();
      actFlag.scale.setScalar(actScale);
      repFlag.scale.setScalar(repScale);
      actFlag.material.opacity = 0.25 + (actLevel/100)*0.75;
      repFlag.material.opacity = 0.25 + (repLevel/100)*0.75;
    }
  }
  setState({ access:40, actLevel:37, repLevel:27, dir:'up', animate:false });

  return {
    setState,
    dispose(){ cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); container.innerHTML=''; }
  };
}
