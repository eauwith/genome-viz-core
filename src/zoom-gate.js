/**
 * Four tall WebGL panels in a scrolling article will each swallow the wheel and
 * trap the reader, because OrbitControls preventDefaults every wheel event it
 * handles. Gate zoom behind a modifier instead: a plain wheel is ignored by the
 * controls (so the page scrolls normally), while ctrl/⌘+wheel zooms.
 *
 * A capture-phase listener on the same element runs before the controls' own
 * target-phase listener, so enableZoom is already correct by the time they see
 * the event. Trackpad pinch also arrives as ctrlKey wheel, so pinch-to-zoom
 * works naturally.
 */
export function gateZoomBehindModifier(controls, domElement){
  const onWheel = e => { controls.enableZoom = e.ctrlKey || e.metaKey; };
  domElement.addEventListener('wheel', onWheel, { capture: true, passive: true });
  controls.enableZoom = false;
  return () => domElement.removeEventListener('wheel', onWheel, { capture: true });
}
