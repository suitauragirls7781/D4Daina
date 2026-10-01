// Stand-in for 'firebase-admin/app' on the Worker (aliased in worker/wrangler.jsonc).
// There is no Firebase project behind it any more: api/_lib/firebaseAdmin.js only needs these three
// functions to exist and to remember that an app was created.

const apps = [];

export const cert = (serviceAccount) => ({ serviceAccount });

export const getApps = () => apps;

export const initializeApp = (options = {}, name = '[DEFAULT]') => {
  const app = { name, options };
  apps.push(app);
  return app;
};
