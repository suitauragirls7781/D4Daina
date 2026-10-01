// Stands in for `firebase-admin/auth` on the Worker (aliased in wrangler.jsonc), so api/** runs unchanged.
// Only what the handlers call is provided; the real work is in ../tokens.js.
import { createCustomToken, revokeRefreshTokens, verifyIdToken } from '../tokens.js';

const auth = {
  createCustomToken,
  verifyIdToken,
  revokeRefreshTokens,
  // api/customer-auth.js deletes the bridge Firebase user after a Google sign-in. No such user exists here,
  // but the call must still return a promise because the handler chains `.catch()` on it.
  deleteUser: async () => {},
};

export const getAuth = () => auth;
