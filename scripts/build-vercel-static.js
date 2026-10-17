import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const outputDir = path.join(rootDir, 'dist');
const indexPath = path.join(outputDir, 'index.html');
const appScript = '<script type="module" src="/js/app.js"></script>';

await rm(outputDir, { recursive: true, force: true });
await cp(publicDir, outputDir, { recursive: true });

const index = await readFile(indexPath, 'utf8');
if (!index.includes(appScript)) {
  throw new Error('Could not find the storefront app script in public/index.html.');
}
await writeFile(
  indexPath,
  index.replace(appScript, `<script>window.OG_CAPS_STATIC_DEMO = true;</script>\n    ${appScript}`),
);
