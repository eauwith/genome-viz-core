export function getPalette(){
  const cs = getComputedStyle(document.documentElement);
  const g = name => cs.getPropertyValue(name).trim();
  return {
    bg: g('--bg'), surface: g('--surface'), surface2: g('--surface-2'),
    border: g('--border'), ink: g('--ink'), inkDim: g('--ink-dim'), inkFaint: g('--ink-faint'),
    up: g('--up'), down: g('--down'), methyl: g('--methyl')
  };
}
