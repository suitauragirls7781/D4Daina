// Read-only look at the new Cloudflare account through wrangler's saved login: Workers that exist, their
// routes / domains / build (Git) settings, and a few counts in the D1 database. Prints no secrets.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ACCOUNT = '65142a242e92f18ec9db9798f3ac35b4';
const D1_ID = 'bae4a715-99a3-4021-9d42-56843baed258';
const cfg = [path.join(process.env.APPDATA || '', 'xdg.config', '.wrangler', 'config', 'default.toml'), path.join(os.homedir(), '.wrangler', 'config', 'default.toml')].find((p) => fs.existsSync(p));
const token = (fs.readFileSync(cfg, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/) || [])[1];
const api = async (p, init = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4' + p, { ...init, signal: controller.signal, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(init.headers || {}) } });
    return await r.json();
  } catch (e) {
    return { success: false, errors: [{ message: String(e.message) }] };
  } finally { clearTimeout(timer); }
};
const sql = async (query) => {
  const r = await api(`/accounts/${ACCOUNT}/d1/database/${D1_ID}/query`, { method: 'POST', body: JSON.stringify({ sql: query }) });
  return r.success ? r.result[0].results : `ERROR ${JSON.stringify(r.errors).slice(0, 160)}`;
};

(async () => {
  const scripts = await api(`/accounts/${ACCOUNT}/workers/scripts`);
  console.log('Workers:', scripts.success ? (scripts.result || []).map((s) => `${s.id} (modified ${String(s.modified_on).slice(0, 16)})`).join(' | ') || 'none' : JSON.stringify(scripts.errors).slice(0, 200));
  const sub = await api(`/accounts/${ACCOUNT}/workers/subdomain`);
  console.log('workers.dev subdomain:', sub.success ? sub.result.subdomain : JSON.stringify(sub.errors).slice(0, 120));
  for (const s of (scripts.result || [])) {
    const domains = await api(`/accounts/${ACCOUNT}/workers/domains?service=${s.id}`);
    const settings = await api(`/accounts/${ACCOUNT}/workers/scripts/${s.id}/settings`);
    const bindings = settings.success ? (settings.result.bindings || []).map((b) => `${b.type}:${b.name}`).join(', ') : '?';
    console.log(`  ${s.id}: custom domains [${domains.success ? (domains.result || []).map((d) => d.hostname).join(', ') : '?'}] bindings [${bindings}]`);
  }
  const zones = await api('/zones?per_page=20');
  for (const z of (zones.result || [])) {
    const routes = await api(`/zones/${z.id}/workers/routes`);
    console.log(`zone ${z.name}: worker routes`, routes.success ? JSON.stringify((routes.result || []).map((r) => ({ pattern: r.pattern, script: r.script }))) : JSON.stringify(routes.errors).slice(0, 120));
  }
  console.log('D1 products by photo host:', JSON.stringify(await sql("SELECT SUM(CASE WHEN data LIKE '%/daps4gdk/%' THEN 1 ELSE 0 END) AS old_cloud, SUM(CASE WHEN data LIKE '%/lvc3kqwu/%' THEN 1 ELSE 0 END) AS new_cloud, COUNT(*) AS products FROM docs WHERE collection='products'")));
  console.log('D1 rows per collection:', JSON.stringify(await sql('SELECT collection, COUNT(*) AS n FROM docs GROUP BY collection')));
})();
