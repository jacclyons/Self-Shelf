/**
 * Stages the reader engine for the web build.
 *
 * `assets/reader/` is the single source of truth. Native unpacks it from the
 * app bundle at runtime; the browser needs the same files served from our own
 * origin under their real names, because reader.html loads its siblings by
 * relative path (`<script src="epub.js">`).
 *
 * The libraries are stored as `.jstxt` so Metro treats them as assets rather
 * than modules to bundle, so they get their real `.js` extension back here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'assets', 'reader');
const dest = path.join(root, 'public', 'reader');

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

let count = 0;
for (const name of fs.readdirSync(src)) {
  const target = name.endsWith('.jstxt') ? `${name.slice(0, -'.jstxt'.length)}.js` : name;
  fs.copyFileSync(path.join(src, name), path.join(dest, target));
  count++;
}

console.log(`Staged ${count} reader files into public/reader/`);
