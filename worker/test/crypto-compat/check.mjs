// Starts worker.js in local workerd (wrangler dev, no network), and compares what each node:crypto function
// returns there with what Node returns here. Run: node worker/test/crypto-compat/check.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, createHmac, pbkdf2Sync, scryptSync } from 'node:crypto';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8799;
const here = dirname(fileURLToPath(import.meta.url));
const salt = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');

const expected = {
  createHash: createHash('sha256').update('abc').digest('hex'),
  createHashSha512: createHash('sha512').update('abc').digest('hex'),
  createHashSha1: createHash('sha1').update('abc').digest('hex'),
  createHmacHex: createHmac('sha256', 'key').update('abc').digest('hex'),
  createHmacBase64Url: createHmac('sha256', 'key').update('abc').digest('base64url'),
  randomBytes: 32,
  randomInt: true,
  timingSafeEqual: true,
  scryptSync: scryptSync('secret', salt, 64).toString('hex'),
  pbkdf2Sync: pbkdf2Sync(createHmac('sha256', 'pepper').update('secret').digest(), salt, 5000, 32, 'sha256').toString('hex'),
  bufferBase64Url: Buffer.from('{"a":1}').toString('base64url'),
  subtleHmac: createHmac('sha256', 'key').update('abc').digest('hex'),
  sessionToken: `sag-admin:true:${400 * 24 * 60 * 60}`,
};

const wrangler = spawn(`npx wrangler dev --local --port ${PORT} --ip 127.0.0.1`, {
  cwd: here,
  shell: true,
  stdio: 'ignore',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});

const stop = () => {
  // On Windows the shell wrapper does not pass signals on, so the whole process tree is ended
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(wrangler.pid), '/T', '/F'], { stdio: 'ignore' });
  else wrangler.kill('SIGTERM');
};

const fetchReport = async () => {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/`);
      if (response.ok) return response.json();
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('The local worker did not start within 90 seconds.');
};

try {
  const report = await fetchReport();
  let failed = 0;
  for (const [name, want] of Object.entries(expected)) {
    const ok = report[name] === want;
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok      ' : 'MISMATCH'} ${name}${ok ? '' : `: ${String(report[name]).slice(0, 120)}`}`);
  }
  assert.equal(failed, 0, `${failed} node:crypto check(s) differ between workerd and Node`);
  console.log(`All ${Object.keys(expected).length} checks match Node.`);
} finally {
  stop();
  // wrangler's local state folder for this throwaway worker
  await new Promise((resolve) => setTimeout(resolve, 1500));
  rmSync(join(here, '.wrangler'), { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
