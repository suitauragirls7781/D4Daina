// Copies the server settings from .env.migration into the Worker's secrets.
//
//   node migration/scripts/set-worker-secrets.cjs --dry-run      list which names would be set and which are empty
//   node migration/scripts/set-worker-secrets.cjs                `wrangler secret put` for every filled-in name
//   node migration/scripts/set-worker-secrets.cjs --dev-vars     write worker/.dev.vars instead (local `wrangler dev`)
//   ... --generate   first create ADMIN_SESSION_SECRET / AUTH_TOKEN_SECRET if they are empty and save them
//                    in .env.migration (with --dry-run it only says what it would create)
//
// Values go to wrangler through stdin: never on a command line, never printed.
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const WORKER = path.join(ROOT, 'worker');
const ENV_FILE = path.join(ROOT, '.env.migration');

// Worker secret -> the .env.migration key it is read from: the server env names of
// migration/map/05-integrations-and-config.md (section 1.1) plus AUTH_TOKEN_SECRET and the optional
// GOOGLE_CLIENT_ID (build spec, section 5). FIREBASE_DATABASE_ID is gone and SECURE_COOKIES is a plain var in wrangler.jsonc.
const SECRETS = {
  // Optional: only its "private_key" is still used, to keep the ids of existing customer reviews (api/reviews.js).
  FIREBASE_SERVICE_ACCOUNT: 'FIREBASE_SERVICE_ACCOUNT',
  GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID',
  ADMIN_SESSION_SECRET: 'ADMIN_SESSION_SECRET',
  AUTH_TOKEN_SECRET: 'AUTH_TOKEN_SECRET',
  ADMIN_INITIAL_USERNAME: 'ADMIN_INITIAL_USERNAME',
  ADMIN_INITIAL_PASSWORD: 'ADMIN_INITIAL_PASSWORD',
  ADMIN_INITIAL_PIN: 'ADMIN_INITIAL_PIN',
  CLOUDINARY_CLOUD_NAME: 'CLOUDINARY_CLOUD_NAME',
  CLOUDINARY_API_KEY: 'CLOUDINARY_API_KEY',
  CLOUDINARY_API_SECRET: 'CLOUDINARY_API_SECRET',
  RAZORPAY_KEY_ID: 'RAZORPAY_KEY_ID',
  // api/_lib/payu.js reads both names for the key id
  VITE_RAZORPAY_KEY_ID: 'RAZORPAY_KEY_ID',
  RAZORPAY_KEY_SECRET: 'RAZORPAY_KEY_SECRET',
  RAZORPAY_WEBHOOK_SECRET: 'RAZORPAY_WEBHOOK_SECRET',
  BREVO_API_KEY: 'BREVO_API_KEY',
  BREVO_SENDER_EMAIL: 'BREVO_SENDER_EMAIL',
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  TRACK_WRITE_BUDGET: 'TRACK_WRITE_BUDGET',
  // Optional: a Cloudflare API token with "Account Analytics: Read", for Admin -> Usage & limits (api/_lib/usage.js).
  CLOUDFLARE_ANALYTICS_TOKEN: 'CLOUDFLARE_ANALYTICS_TOKEN',
};
const GENERATED = ['ADMIN_SESSION_SECRET', 'AUTH_TOKEN_SECRET'];

/** KEY=VALUE lines; blank lines and # comments are skipped; surrounding quotes are removed. */
const readEnvFile = (file) => {
  if (!fs.existsSync(file)) throw new Error('.env.migration was not found in the repository root.');
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
};

/** Saves new values in .env.migration: an existing "KEY=" line is filled in place, otherwise a line is added. */
const saveToEnvFile = (file, additions) => {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const [name, value] of Object.entries(additions)) {
    const index = lines.findIndex((line) => new RegExp(`^\\s*${name}\\s*=`).test(line));
    if (index === -1) lines.push(`${name}=${value}`);
    else lines[index] = `${name}=${value}`;
  }
  fs.writeFileSync(file, lines.join('\n'));
};

const generateMissing = (env, dryRun) => {
  const missing = GENERATED.filter((name) => !env[name]);
  if (!missing.length) return console.log('--generate: both generated secrets already have a value.');
  if (dryRun) return console.log(`--generate would create: ${missing.join(', ')}`);
  const additions = Object.fromEntries(missing.map((name) => [name, randomBytes(48).toString('base64url')]));
  saveToEnvFile(ENV_FILE, additions);
  Object.assign(env, additions);
  return console.log(`Generated and saved in .env.migration: ${missing.join(', ')}`);
};

// .dev.vars is a dotenv file: quote each value with a quote character it does not contain.
const devVarsLine = (name, value) => {
  const quote = ["'", '"', '`'].find((mark) => !value.includes(mark));
  if (!quote || /[\r\n]/.test(value)) throw new Error(`${name} cannot be written to .dev.vars (quotes or line breaks in the value).`);
  return `${name}=${quote}${value}${quote}`;
};

const putSecret = (name, value) => {
  const run = spawnSync(`npx wrangler secret put ${name}`, { cwd: ROOT, shell: true, input: value, encoding: 'utf8' });
  if (run.status === 0) return;
  // wrangler does not echo the value, but make sure of it before showing its message
  const message = `${run.stderr || ''}${run.stdout || ''}`.split(value).join('[value]').trim().slice(-600);
  throw new Error(`wrangler secret put ${name} failed (exit ${run.status}):\n${message}`);
};

const main = () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const env = readEnvFile(ENV_FILE);
  if (args.includes('--generate')) generateMissing(env, dryRun);

  const filled = Object.keys(SECRETS).filter((name) => env[SECRETS[name]]);
  const empty = Object.keys(SECRETS).filter((name) => !env[SECRETS[name]]);

  if (dryRun) {
    console.log(`Would set (${filled.length}): ${filled.join(', ') || 'none'}`);
    console.log(`Still empty (${empty.length}): ${empty.join(', ') || 'none'}`);
    return;
  }
  if (args.includes('--dev-vars')) {
    fs.writeFileSync(path.join(WORKER, '.dev.vars'), `${filled.map((name) => devVarsLine(name, env[SECRETS[name]])).join('\n')}\n`);
    console.log(`Wrote worker/.dev.vars (git-ignored) with ${filled.length} names.`);
  } else {
    for (const name of filled) {
      putSecret(name, env[SECRETS[name]]);
      console.log(`set ${name}`);
    }
    console.log(`Set ${filled.length} Worker secrets.`);
  }
  if (empty.length) console.log(`Not set because empty in .env.migration: ${empty.join(', ')}`);
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
