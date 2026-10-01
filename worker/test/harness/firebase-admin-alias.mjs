// api/** imports 'firebase-admin/app', '/firestore' and '/auth'. On the Worker, wrangler.jsonc aliases those
// three names to the shims. This resolve hook does the same in Node, so the scenario tests load the REAL
// handlers on the D1 document store. Without it they would load the real firebase-admin from node_modules.
//
// Import this file for its side effect, and load anything from api/** or worker/src/index.js with a dynamic
// import() afterwards: static imports are resolved before this file has run.
import { registerHooks } from 'node:module';

const shim = (file) => new URL(`../../src/shims/${file}`, import.meta.url).href;

// Keep in step with "alias" in worker/wrangler.jsonc.
const ALIASES = {
  'firebase-admin/app': shim('firebase-admin-app.js'),
  'firebase-admin/firestore': shim('firebase-admin-firestore.js'),
  'firebase-admin/auth': shim('firebase-admin-auth.js'),
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(ALIASES, specifier)) return { url: ALIASES[specifier], shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
