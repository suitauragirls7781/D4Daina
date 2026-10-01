// Runs `wrangler login` and opens Cloudflare's approval page in Google Chrome (not the default browser).
// The owner signs in with the new Cloudflare account and presses "Allow"; wrangler then stores the login.
const { spawn } = require('child_process');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child = spawn('npx', ['--yes', 'wrangler', 'login', '--browser=false'], { cwd: path.resolve(__dirname, '..', '..'), shell: true });
let opened = false;
const onData = (chunk) => {
  const text = String(chunk);
  process.stdout.write(text.replace(/https:\/\/dash\.cloudflare\.com\/oauth2\/auth\S+/g, '[login link]'));
  const match = text.match(/https:\/\/dash\.cloudflare\.com\/oauth2\/auth\S+/);
  if (match && !opened) {
    opened = true;
    spawn(CHROME, ['--new-window', match[0]], { detached: true, stdio: 'ignore' }).unref();
    console.log('\nOpened the Cloudflare approval page in Chrome. Waiting for "Allow"...');
  }
};
child.stdout.on('data', onData);
child.stderr.on('data', onData);
child.on('exit', (code) => { console.log('wrangler login finished with code', code); process.exit(code || 0); });
