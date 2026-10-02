// A signed-in customer in the browser. The one-time code arrives by email, which a local run cannot
// receive, so the session token is minted here with the Worker's own token code and the local
// AUTH_TOKEN_SECRET; everything after that is the real app: profile read, bag saved to the profile,
// account page, and the limits of what a customer may touch.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKER_DIR, createReport, d1DeleteDoc, d1Doc, d1Docs, launch, openPage, screenshot, until } from './lib.mjs';
import { setEnv } from '../../src/env.js';
import { createCustomToken } from '../../src/tokens.js';

const VARS_FILE = path.resolve(WORKER_DIR, process.env.E2E_VARS || '.dev.vars');
const EMAIL = 'e2e-customer@example.com';

/** One value from a .dev.vars file (NAME=value or NAME="value"). */
const localVar = (name) => {
  const line = readFileSync(VARS_FILE, 'utf8').split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is not in ${VARS_FILE}`);
  return line.slice(name.length + 1).trim().replace(/^"(.*)"$/, '$1');
};

const report = createReport('customer');
const { check, clean } = report;
const browser = await launch();
const { context, page, watch } = await openPage(browser);
const bodyText = () => page.evaluate(() => document.body.innerText);

try {
  setEnv({ AUTH_TOKEN_SECRET: localVar('AUTH_TOKEN_SECRET') });
  const token = await createCustomToken('c_e2e0000000000001', { customerEmail: EMAIL });
  // The shim keeps the customer session under this key (src/shims/firebase-auth.ts).
  await context.addInitScript((value) => localStorage.setItem('sag_auth_token:[DEFAULT]', value), token);

  const product = d1Docs('products').find(({ data }) => data.hidden !== true && data.category === 'Suits' && data.inStock !== false);
  await page.goto(`/product/${product.id}`, { waitUntil: 'load' });
  await page.waitForSelector('h1');
  check('the saved session is restored: the profile is read as the customer',
    await until(() => watch.api.some((call) => call.as === 'customer' && call.ops.includes(`get:profiles/${EMAIL}`) && call.status === 200), { timeout: 10000 }));

  for (const size of product.data.sizes) {
    const button = page.locator('main button:visible:enabled', { hasText: new RegExp(`^${size}$`) }).first();
    if (await button.count()) {
      await button.click();
      break;
    }
  }
  await page.getByRole('button', { name: /^add to bag$/i }).first().click();
  const profile = await until(() => {
    const doc = d1Doc('profiles', EMAIL);
    return doc && Array.isArray(doc.data.cart) && doc.data.cart.some((item) => item.product?.id === product.id) ? doc : null;
  }, { timeout: 10000 });
  check('add to bag: the bag is saved to the customer\'s profile in local D1', Boolean(profile), profile ? `profiles/${EMAIL} v${profile.version}` : 'not saved');
  clean('product page as a customer', watch);

  await page.goto('/account', { waitUntil: 'load' });
  check('account page opens for the customer (no sign-in form)', await until(async () => {
    const text = await bodyText();
    return text.includes(EMAIL) || (/orders/i.test(text) && !/EMAIL ME A CODE/i.test(text));
  }, { timeout: 10000 }));
  check('account page: the customer\'s orders come from /api/orders', await until(() => watch.api.some((call) => call.path === '/api/orders' && call.as === 'customer' && call.status === 200), { timeout: 10000 }));
  await screenshot(page, 'customer-account');
  clean('account page', watch);

  const other = d1Docs('profiles').find(({ id }) => id !== EMAIL);
  const answers = await page.evaluate(async ({ bearer, otherId, productId, own }) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ ops: [
        { op: 'get', path: `profiles/${own}` },
        { op: 'get', path: `profiles/${otherId}` },
        { op: 'set', path: `profiles/${otherId}`, data: { cart: [] }, merge: true },
        { op: 'query', collection: 'profiles' },
        { op: 'query', collection: 'orders' },
        { op: 'get', path: `customers/${otherId}` },
        { op: 'update', path: `products/${productId}`, data: { price: 1 } },
        { op: 'delete', path: `profiles/${own}` },
      ] }),
    });
    return (await response.json()).results.map((result) => result.error?.code || 'ALLOWED');
  }, { bearer: token, otherId: other.id, productId: product.id, own: EMAIL });
  check('a customer reads their own profile and nothing of anyone else',
    answers[0] === 'ALLOWED' && answers.slice(1).every((code) => code === 'permission-denied'), answers.join(','));
  watch.apiFailures.length = 0;
} catch (error) {
  await screenshot(page, 'customer-failure');
  check('customer run completed', false, error.message.split('\n')[0]);
} finally {
  await browser.close();
  if (d1Doc('profiles', EMAIL)) d1DeleteDoc('profiles', EMAIL);
}

process.exitCode = report.finish() ? 1 : 0;
