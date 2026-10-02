// Cut-over switch: Worker routes on the suitauragirls.in zone, through wrangler's saved login.
// The DNS records stay as they are and must stay proxied (orange cloud): a route makes Cloudflare answer
// with the Worker before the request reaches whatever the record points at. Removing a route sends that
// traffic to the DNS target again, which was the old host (now retired). Prints no secrets.
//
//   node migration/scripts/cf-route.cjs list
//   node migration/scripts/cf-route.cjs add www.suitauragirls.in/*
//   node migration/scripts/cf-route.cjs remove www.suitauragirls.in/*
const fs = require('fs');
const os = require('os');
const path = require('path');

const ZONE = 'suitauragirls.in';
const SCRIPT = 'd4daina';
const cfg = [path.join(process.env.APPDATA || '', 'xdg.config', '.wrangler', 'config', 'default.toml'), path.join(os.homedir(), '.wrangler', 'config', 'default.toml')].find((p) => fs.existsSync(p));
const token = (fs.readFileSync(cfg, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/) || [])[1];
const api = async (p, init = {}) => {
  const r = await fetch('https://api.cloudflare.com/client/v4' + p, { ...init, signal: AbortSignal.timeout(25000), headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' } });
  return r.json();
};

(async () => {
  const [action = 'list', pattern] = process.argv.slice(2);
  const zones = await api('/zones?name=' + ZONE);
  const zone = zones.result?.[0];
  if (!zone) throw new Error('Zone not found: ' + JSON.stringify(zones.errors).slice(0, 200));
  const routes = async () => (await api(`/zones/${zone.id}/workers/routes`)).result || [];
  if (action === 'add') {
    if (!pattern) throw new Error('Give the route pattern.');
    if ((await routes()).some((r) => r.pattern === pattern)) console.log('already there:', pattern);
    else {
      const r = await api(`/zones/${zone.id}/workers/routes`, { method: 'POST', body: JSON.stringify({ pattern, script: SCRIPT }) });
      console.log(r.success ? 'added: ' + pattern : 'FAILED: ' + JSON.stringify(r.errors).slice(0, 300));
    }
  } else if (action === 'remove') {
    for (const r of (await routes()).filter((x) => x.pattern === pattern)) {
      const d = await api(`/zones/${zone.id}/workers/routes/${r.id}`, { method: 'DELETE' });
      console.log(d.success ? 'removed: ' + pattern : 'FAILED: ' + JSON.stringify(d.errors).slice(0, 300));
    }
  }
  console.log('routes now:', JSON.stringify((await routes()).map((r) => ({ pattern: r.pattern, script: r.script }))));
})().catch((e) => { console.error(String(e.message)); process.exit(1); });
