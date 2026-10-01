// The Worker's bindings (D1, secrets, assets) arrive with each request. The unchanged api/** handlers
// have no way to receive them, so the entry point stores them here and the shims read them back.

let current = null;

export const setEnv = (env) => {
  current = env;
};

export const getEnv = () => {
  if (!current) throw new Error('Worker env is not set: call setEnv(env) at the start of the request.');
  return current;
};

export const getDB = () => {
  const db = getEnv().DB;
  if (!db) throw new Error('D1 binding "DB" is missing: check d1_databases in worker/wrangler.jsonc.');
  return db;
};
