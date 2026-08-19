/**
 * Build guards for this project's specific failure modes.
 *
 * The published page runs under a strict CSP that blocks every external host,
 * and it must stay under the Artifact size limit — so a stray CDN <script> or a
 * bloated bundle is a shipping bug, not a style nit. The DOM-wiring check exists
 * because a scene that references a missing element id fails silently at load
 * with "Cannot read properties of null", which is easy to miss in a page with
 * six independent WebGL scenes.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 16 * 1024 * 1024; // Artifact platform limit

let failed = 0;
const pass = m => console.log(`  PASS  ${m}`);
const fail = m => { console.error(`  FAIL  ${m}`); failed++; };

// ---------- 1. build output exists ----------
const artifactPath = join(root, 'dist/artifact.html');
if (!existsSync(artifactPath)) {
  fail('dist/artifact.html missing — run `npm run build:artifact`');
  process.exit(1);
}
const artifact = readFileSync(artifactPath, 'utf8');
const bytes = statSync(artifactPath).size;
pass(`dist/artifact.html present (${(bytes / 1024 / 1024).toFixed(2)} MB)`);

// ---------- 2. size ----------
if (bytes > MAX_BYTES) fail(`artifact is ${(bytes/1024/1024).toFixed(2)} MB, over the ${MAX_BYTES/1024/1024} MB limit`);
else pass(`artifact within size limit`);

// ---------- 3. self-contained (CSP blocks external hosts) ----------
const external = [...artifact.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)].map(m => m[1]);
if (external.length) {
  fail(`artifact references ${external.length} external URL(s) — CSP will block these:`);
  [...new Set(external)].slice(0, 10).forEach(u => console.error(`          ${u}`));
} else {
  pass('artifact is self-contained (no external src/href)');
}

// XML namespaces are identifiers, not fetches, so they are deliberately ignored.
const fetches = [...artifact.matchAll(/\b(?:fetch|importScripts)\s*\(\s*["'`]https?:\/\//gi)];
if (fetches.length) fail(`artifact makes ${fetches.length} external network call(s)`);
else pass('artifact makes no external network calls');

// ---------- 4. DOM wiring: every id the code touches must exist in the page ----------
const html = readFileSync(join(root, 'index.html'), 'utf8');
const htmlIds = new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(m => m[1]));

const srcDir = join(root, 'src');
const srcFiles = readdirSync(srcDir).filter(f => f.endsWith('.js'));
const missing = [];
for (const file of srcFiles) {
  const code = readFileSync(join(srcDir, file), 'utf8');
  for (const m of code.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!htmlIds.has(m[1])) missing.push(`${file} → #${m[1]}`);
  }
}
if (missing.length) {
  fail(`${missing.length} element id(s) referenced in src/ but absent from index.html:`);
  missing.forEach(m => console.error(`          ${m}`));
} else {
  pass(`all element ids referenced in src/ exist in index.html (${htmlIds.size} ids)`);
}

// ---------- 5. every scene module is actually mounted ----------
const main = readFileSync(join(srcDir, 'main.js'), 'utf8');
const sceneFiles = srcFiles.filter(f => f.startsWith('scene-'));
const unmounted = sceneFiles.filter(f => {
  const code = readFileSync(join(srcDir, f), 'utf8');
  const exported = [...code.matchAll(/export function (create\w+Scene)/g)].map(m => m[1]);
  return exported.some(fn => !main.includes(fn));
});
if (unmounted.length) fail(`scene module(s) built but never mounted in main.js: ${unmounted.join(', ')}`);
else pass(`all ${sceneFiles.length} scene modules are mounted`);

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('All build checks passed.');
