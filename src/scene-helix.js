import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { gsap } from 'gsap';
import { getPalette } from './theme.js';
import { seededShuffle } from './data.js';
import { attachSway } from './sway.js';
import { fitCameraToRadius } from './render-quality.js';
import { gateZoomBehindModifier } from './zoom-gate.js';

const L = 9.0, R = 0.5, TURNS = 6.0;
const ZONES = [
  { key:'inter',  u0:0.00,  u1:0.205, n:9,  seed:7,  label:'INTERGENIC' },
  { key:'shore',  u0:0.205, u1:0.385, n:10, seed:13, label:'CpG SHORE' },
  { key:'island', u0:0.385, u1:0.565, n:9,  seed:21, label:'CpG ISLAND' },
  { key:'body',   u0:0.565, u1:1.00,  n:16, seed:29, label:'GENE BODY' },
];

function helixPos(u, phase=0){
  const ang = u * TURNS * Math.PI*2 + phase;
  return new THREE.Vector3(u*L - L/2, R*Math.cos(ang), R*Math.sin(ang));
}

export function createHelixScene(container){
  const pal = getPalette();
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 2.4, 10.2);

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
  controls.minDistance = 6.5; controls.maxDistance = 15;
  controls.minPolarAngle = Math.PI*0.28; controls.maxPolarAngle = Math.PI*0.66;
  controls.minAzimuthAngle = -0.45; controls.maxAzimuthAngle = 0.45;
  controls.enablePan = false;

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(3,5,6); scene.add(key);
  const rim = new THREE.PointLight(0xffffff, 0.3); rim.position.set(-3,-2,-3); scene.add(rim);

  // Zone bands are a positional annotation track, not a data series, so they
  // stay neutral and alternate in weight — methylation state is carried purely
  // by the CpG markers.
  ZONES.forEach((z,i)=>{
    const len = (z.u1-z.u0)*L;
    const cx = (z.u0+z.u1)/2*L - L/2;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(R+0.34, R+0.34, len, 24, 1, true),
      new THREE.MeshBasicMaterial({ color:new THREE.Color(pal.inkFaint), transparent:true, opacity: i%2===0 ? 0.05 : 0.18, side:THREE.DoubleSide })
    );
    band.rotation.z = Math.PI/2;
    band.position.set(cx,0,0);
    world.add(band);

    const label = document.createElement('div');
    label.className = 'gl-label gl-zone-label';
    label.textContent = z.label;
    const lo = new CSS2DObject(label);
    lo.position.set(cx, R+0.85, 0);
    world.add(lo);
  });

  // TSS marker at the island/body boundary
  const tssX = ZONES[2].u1*L - L/2;
  const tssCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.32, 12),
    new THREE.MeshStandardMaterial({ color:new THREE.Color(pal.inkDim) })
  );
  tssCone.position.set(tssX, R+0.5, 0);
  tssCone.rotation.z = Math.PI;
  world.add(tssCone);
  const tssLabel = document.createElement('div');
  tssLabel.className = 'gl-label';
  tssLabel.textContent = 'TSS';
  const tssLabelObj = new CSS2DObject(tssLabel);
  tssLabelObj.position.set(0, 0.62, 0);
  tssCone.add(tssLabelObj);

  // backbone strands
  function buildStrand(phase, color){
    const pts = [];
    for(let i=0;i<=200;i++) pts.push(helixPos(i/200, phase));
    return new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 190, 0.05, 6, false),
      new THREE.MeshStandardMaterial({ color:new THREE.Color(color), roughness:0.5 })
    );
  }
  world.add(buildStrand(0, pal.inkDim));
  world.add(buildStrand(Math.PI, pal.inkFaint));

  // structural rungs (decorative base pairs)
  const N_RUNG = 44;
  const rungMat = new THREE.MeshBasicMaterial({ color:new THREE.Color(pal.border), transparent:true, opacity:0.55 });
  const rungGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
  const up = new THREE.Vector3(0,1,0);
  for(let i=1;i<N_RUNG;i++){
    const u = i/N_RUNG;
    const p1 = helixPos(u,0), p2 = helixPos(u,Math.PI);
    const cyl = new THREE.Mesh(rungGeo, rungMat);
    cyl.position.copy(p1).add(p2).multiplyScalar(0.5);
    cyl.scale.y = p1.distanceTo(p2);
    cyl.quaternion.setFromUnitVectors(up, p2.clone().sub(p1).normalize());
    world.add(cyl);
  }

  // CpG methylation markers
  const methylColor = new THREE.Color(pal.methyl);
  // pal.ink flips with the theme (near-black on light, near-white on dark), so
  // bare CpGs stay high-contrast against both the strands and the background.
  const bareColor = new THREE.Color(pal.ink);
  // Unmethylated CpGs stay visible — "the island is unmethylated" is read from
  // bare markers being present, not from empty space. At this scale a wireframe
  // sphere reads as a filled one, so the two states differ by size AND colour.
  const filledGeo = new THREE.SphereGeometry(0.115, 14, 10);
  const hollowGeo = new THREE.SphereGeometry(0.07, 10, 8);
  const dotsByZone = {};
  ZONES.forEach(z=>{
    const order = seededShuffle(z.n, z.seed);
    const dots = [];
    for(let i=0;i<z.n;i++){
      const u = z.u0 + (z.u1-z.u0) * ((i+0.5)/z.n);
      const phase = (i%2===0) ? 0 : Math.PI;
      const base = helixPos(u, phase);
      const pos = base.clone().add(new THREE.Vector3(0, base.y, base.z).normalize().multiplyScalar(0.3));

      const g = new THREE.Group();
      g.position.copy(pos);
      const filled = new THREE.Mesh(filledGeo, new THREE.MeshStandardMaterial({ color:methylColor, emissive:methylColor, emissiveIntensity:0.25, transparent:true, opacity:1 }));
      const hollow = new THREE.Mesh(hollowGeo, new THREE.MeshStandardMaterial({ color:bareColor, roughness:0.7, transparent:true, opacity:0.9 }));
      g.add(filled, hollow);
      world.add(g);
      dots.push({ g, filled, hollow, rank:order[i] });
    }
    dotsByZone[z.key] = dots;
  });

  function paintZone(zoneKey, pct, animate){
    const dots = dotsByZone[zoneKey];
    const nFilled = Math.round(dots.length * pct/100);
    dots.forEach(d=>{
      const isFilled = d.rank < nFilled;
      const fOp = isFilled ? 1 : 0, hOp = isFilled ? 0 : 0.9;
      const scale = isFilled ? 1.15 : 1;
      if(animate){
        gsap.to(d.filled.material, { opacity:fOp, duration:0.5 });
        gsap.to(d.hollow.material, { opacity:hOp, duration:0.5 });
        gsap.to(d.g.scale, { x:scale, y:scale, z:scale, duration:0.5, ease:'back.out(1.7)' });
      } else {
        d.filled.material.opacity = fOp;
        d.hollow.material.opacity = hOp;
        d.g.scale.setScalar(scale);
      }
    });
  }

  function resize(){
    const w = container.clientWidth, h = container.clientHeight;
    if(!w || !h) return;
    camera.aspect = w/h; camera.updateProjectionMatrix();
    renderer.setSize(w,h); labelRenderer.setSize(w,h);
    if(autoFit) fitCameraToRadius(camera, controls, 4.85);
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  let raf;
  (function tick(){
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  })();

  attachSway(world, controls, { amplitude: 0.10 });

  function setState({ inter, shore, island, body, animate=true }){
    paintZone('inter', inter, animate);
    paintZone('shore', shore, animate);
    paintZone('island', island, animate);
    paintZone('body', body, animate);
  }
  setState({ inter:80, shore:52, island:3, body:55, animate:false });

  return {
    setState,
    dispose(){ cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); container.innerHTML=''; }
  };
}
