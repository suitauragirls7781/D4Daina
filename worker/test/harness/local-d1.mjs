// REAL local D1 for tests: workerd's SQLite through wrangler's getPlatformProxy, in local mode, with nothing
// persisted and nothing sent to Cloudflare. Slower to start than d1-node.mjs, but it is the engine the Worker
// runs on, with real asynchronous round trips between statements.
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { schemaStatements } from '../d1-node.mjs';

// wrangler is not a dependency of this project: use an installed copy if there is one, else the copy
// `npx wrangler` keeps in the npm cache.
const findWrangler = () => {
  try {
    return dirname(createRequire(import.meta.url).resolve('wrangler/package.json'));
  } catch {
    const cache = process.env.npm_config_cache || (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'npm-cache') : join(homedir(), '.npm'));
    const npx = join(cache, '_npx');
    const found = existsSync(npx) && readdirSync(npx).map((entry) => join(npx, entry, 'node_modules', 'wrangler')).find((dir) => existsSync(join(dir, 'package.json')));
    if (!found) throw new Error('wrangler not found. Run "npx wrangler@4 --version" once, then run this test again.');
    return found;
  }
};

/** An empty local D1 database with worker/schema.sql applied. Call dispose() when the tests are done. */
export const openLocalD1 = async () => {
  const dir = findWrangler();
  const { main } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const { getPlatformProxy } = await import(pathToFileURL(join(dir, main)).href);
  const proxy = await getPlatformProxy({ configPath: fileURLToPath(new URL('../wrangler.test.jsonc', import.meta.url)), persist: false });
  const d1 = proxy.env.DB;
  await d1.batch(schemaStatements().map((statement) => d1.prepare(statement)));
  return { d1, dispose: () => proxy.dispose() };
};
