// Tiny local Worker that reports whether every node:crypto function api/** uses exists and works under
// nodejs_compat. Started and queried by check.mjs (local workerd only, never deployed).
import { createHash, createHmac, pbkdf2Sync, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { setEnv } from '../../src/env.js';
import { createCustomToken, verifyIdToken } from '../../src/tokens.js';

const attempt = (fn) => {
  try {
    return fn();
  } catch (error) {
    return `ERROR: ${error?.message || error}`;
  }
};

export default {
  async fetch() {
    setEnv({ AUTH_TOKEN_SECRET: 'local-check-only' });
    const salt = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
    const report = {
      createHash: attempt(() => createHash('sha256').update('abc').digest('hex')),
      createHashSha512: attempt(() => createHash('sha512').update('abc').digest('hex')),
      createHashSha1: attempt(() => createHash('sha1').update('abc').digest('hex')),
      createHmacHex: attempt(() => createHmac('sha256', 'key').update('abc').digest('hex')),
      createHmacBase64Url: attempt(() => createHmac('sha256', 'key').update('abc').digest('base64url')),
      randomBytes: attempt(() => randomBytes(16).toString('hex').length),
      randomInt: attempt(() => { const n = randomInt(100000, 1000000); return n >= 100000 && n < 1000000; }),
      timingSafeEqual: attempt(() => timingSafeEqual(Buffer.from('same'), Buffer.from('same')) && !timingSafeEqual(Buffer.from('same'), Buffer.from('sane'))),
      scryptSync: attempt(() => scryptSync('secret', salt, 64).toString('hex')),
      pbkdf2Sync: attempt(() => pbkdf2Sync(createHmac('sha256', 'pepper').update('secret').digest(), salt, 5000, 32, 'sha256').toString('hex')),
      bufferBase64Url: attempt(() => Buffer.from('{"a":1}').toString('base64url')),
      subtleHmac: await crypto.subtle.importKey('raw', new TextEncoder().encode('key'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
        .then((key) => crypto.subtle.sign('HMAC', key, new TextEncoder().encode('abc')))
        .then((signature) => Buffer.from(signature).toString('hex'))
        .catch((error) => `ERROR: ${error?.message || error}`),
      // the real token module, minted and verified inside workerd
      sessionToken: await createCustomToken('sag-admin', { admin: true })
        .then((token) => verifyIdToken(token))
        .then((decoded) => `${decoded.uid}:${decoded.admin}:${decoded.exp - decoded.iat}`)
        .catch((error) => `ERROR: ${error?.message || error}`),
    };
    return Response.json(report);
  },
};
