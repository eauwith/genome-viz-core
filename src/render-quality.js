import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

/**
 * Shared render setup. Filmic tone mapping plus a procedurally generated
 * environment map (no external assets, so the page stays self-contained under
 * a strict CSP) gives the physically-based materials something to reflect —
 * that is what reads as "smooth and wet" rather than flat plastic.
 */
export function configureRenderer(renderer){
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
}

// Each scene owns its own WebGL context, and a PMREM texture belongs to the
// context that produced it — so this is per-renderer, not a global singleton.
export function environmentFor(renderer){
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}

/**
 * Pull the camera back far enough that a sphere of `radius` around the orbit
 * target fits in BOTH axes. Without this, a narrow viewport (phone, split pane)
 * crops the scene, because a fixed camera distance only ever suits one aspect.
 * Callers stop invoking this once the viewer has taken manual control.
 */
export function fitCameraToRadius(camera, controls, radius){
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov/2) * camera.aspect);
  const dist = Math.max(radius / Math.sin(vFov/2), radius / Math.sin(hFov/2));
  if(dist > controls.maxDistance) controls.maxDistance = dist * 1.05;
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.update();
}

const noise = new ImprovedNoise();

/**
 * A smooth, irregular blob. Built from an icosphere (uniform vertices, no pole
 * pinching), displaced by two octaves of noise, welded with mergeVertices so
 * computeVertexNormals produces smooth shading instead of visible facets.
 */
export function organicGeometry(radius, { detail = 4, amp = 0.16, freq = 1.1, seed = 0 } = {}){
  let geo = new THREE.IcosahedronGeometry(radius, detail);
  geo = mergeVertices(geo);

  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for(let i = 0; i < pos.count; i++){
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    const n1 = noise.noise(dir.x*freq + seed, dir.y*freq + seed, dir.z*freq + seed);
    const n2 = noise.noise(dir.x*freq*2.7 + seed*3, dir.y*freq*2.7 + seed*3, dir.z*freq*2.7 + seed*3);
    dir.multiplyScalar(radius * (1 + amp*n1 + amp*0.35*n2));
    pos.setXYZ(i, dir.x, dir.y, dir.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Translucent membrane — a thin glassy shell.
 *
 * Deliberately NOT using MeshPhysicalMaterial.transmission: transmissive
 * materials only refract *opaque* geometry, so every transparent object inside
 * an envelope (chromosome territories, organelles) would vanish. Clearcoat over
 * a low-opacity surface gives the same wet highlight while keeping contents
 * visible, and depthWrite:false lets inner transparent meshes sort correctly.
 */
export function membraneMaterial(color, { opacity = 0.18, roughness = 0.12 } = {}){
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    transparent: true, opacity,
    roughness, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.16,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
    depthWrite: false
  });
}

/** Soft-bodied organelle surface — smooth, slightly glossy, not plastic. */
export function tissueMaterial(color, { roughness = 0.42, opacity = 1, emissive = null, emissiveIntensity = 0 } = {}){
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness, metalness: 0,
    clearcoat: 0.35, clearcoatRoughness: 0.45,
    envMapIntensity: 0.65,
    transparent: opacity < 1, opacity
  });
  if(emissive){ m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveIntensity; }
  return m;
}
