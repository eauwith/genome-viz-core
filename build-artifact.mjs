// Inlines the minified bundle + CSS into a single self-contained artifact page.
// The Artifact host wraps the file in <!doctype html><head>…</head><body>, so we
// emit page content only — no <html>/<head>/<body> tags of our own.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(resolve(here, p), 'utf8');

const html = read('index.html');
const css = read('dist/bundle.css');
const js = read('dist/bundle.min.js');

// Pull just the page content out of the dev index.html.
const body = html
  .slice(html.indexOf('<div class="page">'), html.lastIndexOf('</div>') + 6)
  .replace(/<script src="\.\/dist\/bundle\.js"><\/script>/, '');

const out = `<meta charset="utf-8">
<title>Genome Under Cancer</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${css}
</style>
${body}
<script>
${js}
</script>
`;

writeFileSync(resolve(here, 'dist/artifact.html'), out);
console.log('artifact.html written:', (Buffer.byteLength(out)/1024/1024).toFixed(2), 'MB');
