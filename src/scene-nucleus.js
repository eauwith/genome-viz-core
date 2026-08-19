import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { gsap } from 'gsap';
import { getPalette } from './theme.js';
import { attachSway } from './sway.js';
import { gateZoomBehindModifier } from './zoom-gate.js';
import { configureRenderer, environmentFor, organicGeometry, membraneMaterial, tissueMaterial, fitCameraToRadius } from './render-quality.js';

// Composition is laid out symmetrically about x=0 so the orbit target is the
// true centre of the figure and neither half swings out of frame.
const NUC_CENTER = new THREE.Vector3(-2.9, 0, 0);
const NUC_R = 1.9;
const LOOP_X0 = 1.1, LOOP_X1 = 4.7;

export function createNucleusScene(container){
  const pal = getPalette();
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 1.9, 11.5);

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  configureRenderer(renderer);
  scene.environment = environmentFor(renderer);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.inset = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  // Controls must listen on the WebGL canvas: the CSS2D label layer sits on top
  // with pointer-events:none, so it never receives pointer events itself.
  const controls = new OrbitControls(camera, renderer.domElement);
  // OrbitControls forces touchAction:'none' in its constructor, which would trap
  // one-finger page scrolling on mobile. pan-y gives vertical scrolling back to
  // the page while horizontal drags still rotate the scene.
  renderer.domElement.style.touchAction = 'pan-y';
  gateZoomBehindModifier(controls, renderer.domElement);
  let autoFit = true;
  controls.addEventListener('start', () => { autoFit = false; });
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 7;
  controls.maxDistance = 16;
  controls.minPolarAngle = Math.PI*0.30;
  controls.maxPolarAngle = Math.PI*0.66;
  controls.minAzimuthAngle = -0.55;
  controls.maxAzimuthAngle = 0.55;
  controls.enablePan = false;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(4,5,6);
  scene.add(key);
  const rim = new THREE.PointLight(0xffffff, 0.35);
  rim.position.set(-4,-2,-3);
  scene.add(rim);

  // ---------- nucleus ----------
  const nucGroup = new THREE.Group();
  nucGroup.position.copy(NUC_CENTER);
  world.add(nucGroup);

  // Nuclear envelope: a refractive shell rather than a flat translucent sphere.
  nucGroup.add(new THREE.Mesh(
    new THREE.SphereGeometry(NUC_R, 96, 64),
    membraneMaterial(pal.inkFaint, { opacity: 0.15, roughness: 0.1 })
  ));

  // Compartment zones. The A/B split is radial: the transcriptionally active A
  // compartment occupies the nuclear interior, while B-compartment chromatin is
  // tethered at the periphery against the lamina. BackSide on the outer shell
  // paints only the inner surface, so it reads as a peripheral rind.
  const aZone = new THREE.Mesh(
    new THREE.SphereGeometry(NUC_R*0.58, 48, 32),
    new THREE.MeshBasicMaterial({ color:new THREE.Color(pal.up), transparent:true, opacity:0.07, depthWrite:false })
  );
  nucGroup.add(aZone);

  const bZone = new THREE.Mesh(
    new THREE.SphereGeometry(NUC_R*0.985, 64, 44),
    new THREE.MeshBasicMaterial({ color:new THREE.Color(pal.down), transparent:true, opacity:0.09, side:THREE.BackSide, depthWrite:false })
  );
  nucGroup.add(bZone);

  // Nuclear lamina, the anchor B-compartment chromatin is tethered to.
  nucGroup.add(new THREE.Mesh(
    new THREE.SphereGeometry(NUC_R*0.995, 64, 44),
    new THREE.MeshBasicMaterial({ color:new THREE.Color(pal.down), wireframe:true, transparent:true, opacity:0.06, depthWrite:false })
  ));

  function zoneLabel(text, pos, cls){
    const el = document.createElement('div');
    el.className = 'gl-label ' + cls;
    el.innerHTML = text;
    const anchor = new THREE.Object3D();
    anchor.position.set(...pos);
    nucGroup.add(anchor);
    anchor.add(new CSS2DObject(el));
    return el;
  }
  // Kept clear of DIR_VEC (upper-right), where the locus and its label travel.
  zoneLabel('A compartment<span>active · interior</span>', [-0.95, 0.15, 0.95], 'gl-compartment gl-compartment--a');
  zoneLabel('B compartment<span>repressed · lamina</span>', [-0.1, -NUC_R - 0.45, 0.3], 'gl-compartment gl-compartment--b');

  // Chromosome territories — smooth noise-displaced blobs. Welded normals mean
  // they shade continuously instead of showing polygon facets.
  [
    {p:[-0.55,0.55,0.3],  s:0.92, sc:[1,1.15,0.9],  o:0.72, seed:11},
    {p:[0.6,-0.35,-0.4],  s:1.0,  sc:[1.1,0.9,1],   o:0.6,  seed:29},
    {p:[-0.2,-0.75,0.55], s:0.78, sc:[0.9,1,1.1],   o:0.8,  seed:47},
  ].forEach(b=>{
    const m = new THREE.Mesh(
      organicGeometry(b.s, { detail: 4, amp: 0.13, freq: 1.35, seed: b.seed }),
      tissueMaterial(pal.surface2, { roughness: 0.55, opacity: b.o })
    );
    m.position.set(...b.p);
    m.scale.set(...b.sc);
    nucGroup.add(m);
  });

  const locus = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 48, 32),
    tissueMaterial(pal.up, { roughness: 0.28, emissive: pal.up, emissiveIntensity: 0.5 })
  );
  nucGroup.add(locus);

  const guide = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: new THREE.Color(pal.inkFaint), dashSize:0.08, gapSize:0.06, transparent:true, opacity:0.6 })
  );
  nucGroup.add(guide);

  const locusLabel = document.createElement('div');
  locusLabel.className = 'gl-label gl-label--strong';
  const locusLabelObj = new CSS2DObject(locusLabel);
  locusLabelObj.position.set(0, 0.36, 0);
  locus.add(locusLabelObj);

  const DIR_VEC = new THREE.Vector3(0.55, 0.5, 0.4).normalize();
  const locusRadius = compA => NUC_R - 0.22 - (compA/100) * (NUC_R - 0.65);

  // ---------- loop diagram ----------
  const loopGroup = new THREE.Group();
  world.add(loopGroup);

  const baseline = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, (LOOP_X1-LOOP_X0) + 0.9, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.border) })
  );
  baseline.rotation.z = Math.PI/2;
  baseline.position.set((LOOP_X0+LOOP_X1)/2, 0, 0);
  loopGroup.add(baseline);

  function ctcfCone(x, dir){
    const c = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.26, 12),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.inkDim), roughness:0.6 })
    );
    c.rotation.z = dir>0 ? Math.PI/2 : -Math.PI/2;
    c.position.set(x, 0.02, 0);
    loopGroup.add(c);
  }
  ctcfCone(LOOP_X0, 1);
  ctcfCone(LOOP_X1, -1);

  const boxGeo = new THREE.BoxGeometry(0.62, 0.4, 0.42);
  const enhancerBox = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.surface2), roughness:0.7 }));
  enhancerBox.position.set(LOOP_X0, -0.45, 0);
  loopGroup.add(enhancerBox);
  const enhancerLabel = document.createElement('div');
  enhancerLabel.className = 'gl-label';
  enhancerLabel.textContent = 'Enhancer';
  const enhLabelObj = new CSS2DObject(enhancerLabel);
  enhLabelObj.position.set(0, -0.42, 0);
  enhancerBox.add(enhLabelObj);

  const geneMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.up), roughness:0.5, emissive: new THREE.Color(pal.up), emissiveIntensity:0.18 });
  const geneBox = new THREE.Mesh(boxGeo, geneMat);
  geneBox.position.set(LOOP_X1, -0.45, 0);
  loopGroup.add(geneBox);
  const geneLabel = document.createElement('div');
  geneLabel.className = 'gl-label gl-label--strong';
  const geneLabelObj = new CSS2DObject(geneLabel);
  geneLabelObj.position.set(0, -0.42, 0);
  geneBox.add(geneLabelObj);

  const loopMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pal.up), transparent:true, opacity:0.6, roughness:0.4, metalness:0.1
  });
  let loopTube = null;
  function rebuildLoopTube(strength){
    const h = 0.55 + (strength/100)*1.5;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(LOOP_X0, 0.02, 0),
      new THREE.Vector3(LOOP_X0 + (LOOP_X1-LOOP_X0)*0.25, h*0.92, 0),
      new THREE.Vector3((LOOP_X0+LOOP_X1)/2, h, 0),
      new THREE.Vector3(LOOP_X1 - (LOOP_X1-LOOP_X0)*0.25, h*0.92, 0),
      new THREE.Vector3(LOOP_X1, 0.02, 0),
    ]);
    const geo = new THREE.TubeGeometry(curve, 44, 0.02 + (strength/100)*0.07, 10, false);
    if(loopTube){ loopTube.geometry.dispose(); loopTube.geometry = geo; }
    else { loopTube = new THREE.Mesh(geo, loopMat); loopGroup.add(loopTube); }
    loopMat.opacity = 0.35 + (strength/100)*0.6;
  }

  function resize(){
    const w = container.clientWidth, h = container.clientHeight;
    if(!w || !h) return;
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
    renderer.setSize(w,h);
    labelRenderer.setSize(w,h);
    if(autoFit) fitCameraToRadius(camera, controls, 5.05);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let raf;
  (function tick(){
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  })();

  attachSway(world, controls);

  // ---------- state ----------
  const upColor = new THREE.Color(pal.up);
  const downColor = new THREE.Color(pal.down);
  const anim = { r: locusRadius(35), strength: 20 };

  function placeLocus(){
    const p = DIR_VEC.clone().multiplyScalar(anim.r);
    locus.position.copy(p);
    guide.geometry.setFromPoints([new THREE.Vector3(), p]);
    guide.computeLineDistances();
  }

  function setState({ gene, compA, loop, dir, animate = true }){
    locusLabel.textContent = gene;
    geneLabel.textContent = gene;
    const target = dir === 'up' ? upColor : downColor;
    const targetR = locusRadius(compA);

    if(animate){
      gsap.to(anim, { r: targetR, duration: 0.7, ease:'power2.out', onUpdate: placeLocus });
      gsap.to(anim, { strength: loop, duration: 0.7, ease:'power2.out', onUpdate: () => rebuildLoopTube(anim.strength) });
      [locus.material.color, locus.material.emissive, geneMat.color, geneMat.emissive, loopMat.color].forEach(c=>{
        gsap.to(c, { r:target.r, g:target.g, b:target.b, duration:0.7 });
      });
    } else {
      anim.r = targetR; anim.strength = loop;
      placeLocus();
      rebuildLoopTube(loop);
      [locus.material.color, locus.material.emissive, geneMat.color, geneMat.emissive, loopMat.color].forEach(c=>c.copy(target));
    }
  }
  setState({ gene:'SIRT1', compA:35, loop:20, dir:'up', animate:false });

  return {
    setState,
    dispose(){ cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); container.innerHTML=''; }
  };
}
