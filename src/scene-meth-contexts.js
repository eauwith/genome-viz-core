import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { gsap } from 'gsap';
import { getPalette } from './theme.js';
import { attachSway } from './sway.js';
import { gateZoomBehindModifier } from './zoom-gate.js';
import { configureRenderer, environmentFor, tissueMaterial, fitCameraToRadius } from './render-quality.js';
import { seededShuffle } from './data.js';

const SPAN = 7.6;
// Same molecular mark, three genomic addresses, three different consequences.
const ROWS = [
  { key:'promoter',   y: 2.0,  n:14, seed:5,  label:'PROMOTER — CpG island' },
  { key:'enhancer',   y: 0.0,  n:10, seed:19, label:'ENHANCER' },
  { key:'intergenic', y:-2.0,  n:9,  seed:37, label:'INTERGENIC — repeats' },
];

export function createMethContextScene(container){
  const pal = getPalette();
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0.6, 11);

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
  controls.minDistance = 6; controls.maxDistance = 18;
  controls.minPolarAngle = Math.PI*0.34; controls.maxPolarAngle = Math.PI*0.62;
  controls.minAzimuthAngle = -0.35; controls.maxAzimuthAngle = 0.35;
  controls.enablePan = false;

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 0.95); key.position.set(3,6,6); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.3); fill.position.set(-4,-2,3); scene.add(fill);

  const mkLabel = (parent, cls, pos) => {
    const el = document.createElement('div');
    el.className = 'gl-label ' + cls;
    const o = new CSS2DObject(el);
    o.position.set(...pos);
    parent.add(o);
    return el;
  };

  const methylColor = new THREE.Color(pal.methyl);
  const bareColor = new THREE.Color(pal.ink);
  const filledGeo = new THREE.SphereGeometry(0.135, 16, 12);
  const hollowGeo = new THREE.SphereGeometry(0.08, 12, 10);

  const rows = {};
  ROWS.forEach(def => {
    const g = new THREE.Group();
    g.position.y = def.y;
    world.add(g);

    // DNA backbone for this row
    const pts = [];
    for(let i=0;i<=60;i++){
      const x = -SPAN/2 + (i/60)*SPAN;
      pts.push(new THREE.Vector3(x, Math.sin(i*0.5)*0.045, Math.cos(i*0.5)*0.045));
    }
    g.add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 70, 0.075, 8, false),
      tissueMaterial(pal.inkDim, { roughness: 0.5 })
    ));

    // CpG markers: methylated = large pink, unmethylated = small neutral
    const order = seededShuffle(def.n, def.seed);
    const dots = [];
    for(let i=0;i<def.n;i++){
      const x = -SPAN/2 + SPAN * ((i+0.5)/def.n);
      const holder = new THREE.Group();
      holder.position.set(x, 0.2, 0);
      const filled = new THREE.Mesh(filledGeo, new THREE.MeshStandardMaterial({
        color: methylColor, emissive: methylColor, emissiveIntensity: 0.25, transparent:true, opacity:1
      }));
      const hollow = new THREE.Mesh(hollowGeo, new THREE.MeshStandardMaterial({
        color: bareColor, roughness: 0.7, transparent:true, opacity:0.9
      }));
      // little stalk so the CpG reads as sitting on the DNA
      const stalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6),
        new THREE.MeshBasicMaterial({ color:new THREE.Color(pal.inkFaint), transparent:true, opacity:0.55 })
      );
      stalk.position.y = -0.1;
      holder.add(filled, hollow, stalk);
      g.add(holder);
      dots.push({ holder, filled, hollow, rank: order[i] });
    }

    mkLabel(g, 'gl-context-title', [-SPAN/2 - 0.15, 0.72, 0]).textContent = def.label;
    const pctEl = mkLabel(g, 'gl-context-pct', [SPAN/2 + 0.75, 0.28, 0]);
    const consEl = mkLabel(g, 'gl-context-consequence', [0, -0.5, 0]);

    rows[def.key] = { group:g, dots, pctEl, consEl };
  });

  function paint(key, pct, animate){
    const { dots, pctEl } = rows[key];
    const nFilled = Math.round(dots.length * pct/100);
    dots.forEach(d => {
      const isFilled = d.rank < nFilled;
      const fOp = isFilled ? 1 : 0, hOp = isFilled ? 0 : 0.9;
      if(animate){
        gsap.to(d.filled.material, { opacity:fOp, duration:0.5 });
        gsap.to(d.hollow.material, { opacity:hOp, duration:0.5 });
      } else {
        d.filled.material.opacity = fOp;
        d.hollow.material.opacity = hOp;
      }
    });
    pctEl.textContent = Math.round(pct) + '%';
    pctEl.dataset.level = pct >= 50 ? 'high' : pct >= 20 ? 'mid' : 'low';
  }

  function resize(){
    const w = container.clientWidth, h = container.clientHeight;
    if(!w || !h) return;
    camera.aspect = w/h; camera.updateProjectionMatrix();
    renderer.setSize(w,h); labelRenderer.setSize(w,h);
    if(autoFit) fitCameraToRadius(camera, controls, 4.6);
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  let raf;
  (function tick(){
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  })();

  attachSway(world, controls, { amplitude: 0.07, duration: 12 });

  function setState({ promoter, enhancer, intergenic, dir, animate = true }){
    paint('promoter', promoter, animate);
    paint('enhancer', enhancer, animate);
    paint('intergenic', intergenic, animate);

    // The consequence of the SAME mark differs by address: a switch at the
    // promoter, a rheostat at the enhancer, genome defence in between.
    rows.promoter.consEl.innerHTML = promoter < 10
      ? 'Unmethylated → promoter stays open, gene <b>can</b> be transcribed'
      : 'Methylated → MBD proteins recruit HDACs, gene <b>stably silenced</b>';
    rows.promoter.consEl.dataset.tone = promoter < 10 ? 'on' : 'off';

    const enhOn = enhancer < 40;
    rows.enhancer.consEl.innerHTML = enhOn
      ? 'Low methylation → TFs bind, enhancer <b>active</b>, target gene boosted'
      : 'High methylation → TF binding blocked, enhancer <b>damped down</b>';
    rows.enhancer.consEl.dataset.tone = enhOn ? 'on' : 'off';

    rows.intergenic.consEl.innerHTML =
      'Stays heavily methylated → transposable elements <b>kept silent</b>, genome stable';
    rows.intergenic.consEl.dataset.tone = 'neutral';
  }
  setState({ promoter:3, enhancer:58, intergenic:80, dir:'up', animate:false });

  return {
    setState,
    dispose(){ cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); container.innerHTML=''; }
  };
}
