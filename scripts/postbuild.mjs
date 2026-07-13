// Post-build step for the @astrojs/cloudflare "Workers" output.
//
// The adapter emits the server entry to `dist/_worker.js/` and routing
// metadata to `dist/_routes.json`, but our wrangler `assets.directory` is
// `./dist`. Without an `.assetsignore`, wrangler refuses to upload the
// `_worker.js` directory as a public asset (it would expose server code) and
// the deploy fails. Writing this file excludes those internal artifacts from
// the static-asset upload while `main` still loads the worker itself.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const contents = ['_worker.js', '_routes.json', ''].join('\n');

writeFileSync(join(distDir, '.assetsignore'), contents);
console.log('[postbuild] wrote dist/.assetsignore (_worker.js, _routes.json)');
