import { gsap } from 'gsap';

/**
 * Gentle idle turntable motion applied to a scene group (not the camera, since
 * OrbitControls in r160 exposes getAzimuthalAngle but no setter). Pauses while
 * the user is dragging and resumes after they stop.
 */
export function attachSway(group, controls, { amplitude = 0.13, duration = 8, idleDelay = 4000 } = {}){
  let tween = null, idle = null;

  function start(){
    if(tween) tween.kill();
    group.rotation.y = -amplitude;
    tween = gsap.to(group.rotation, {
      y: amplitude, duration, ease: 'sine.inOut', yoyo: true, repeat: -1
    });
  }
  function stop(){
    if(tween){ tween.kill(); tween = null; }
    if(idle){ clearTimeout(idle); idle = null; }
  }

  controls.addEventListener('start', stop);
  controls.addEventListener('end', () => {
    if(idle) clearTimeout(idle);
    idle = setTimeout(start, idleDelay);
  });

  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches) start();

  return { stop };
}
