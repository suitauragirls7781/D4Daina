// Counts the requests that reach the Worker (the ones Cloudflare bills: /api/* and /sitemap.xml; static
// files and the app shell are served by Workers Static Assets without running the Worker) for a new
// visitor's home page, a product page and an idle admin dashboard.
import { ADMIN, DEV_LOG, d1Docs, launch, openPage, sleep, workerLog } from './lib.mjs';

const IDLE_SECONDS = Number(process.env.E2E_IDLE_SECONDS || 300);
const FREE_REQUESTS_PER_DAY = 100000;

const summarise = (calls) => {
  const groups = new Map();
  for (const call of calls) {
    const key = `${call.method} ${call.path}${call.ops ? ` [${call.ops}]` : ''} as ${call.as}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  return [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => `    ${String(count).padStart(3)} x ${key}`).join('\n');
};

/** Runs `visit` and returns the API calls the browser made, cross-checked with the Worker's own log. */
const measure = async (browser, name, visit) => {
  const { context, page, watch } = await openPage(browser);
  const logStart = workerLog().lines;
  const calls = await visit(page, watch);
  await sleep(1000);
  const logged = workerLog(logStart).requests.length;
  await context.close();
  console.log(`\n${name}: ${calls.length} Worker requests${DEV_LOG ? ` (Worker log: ${logged})` : ''}`);
  console.log(summarise(calls));
  return calls.length;
};

const browser = await launch();
try {
  const product = d1Docs('products').find(({ data }) => data.hidden !== true && data.category === 'Suits');

  const home = await measure(browser, 'New visitor, home page (20 s on the page)', async (page, watch) => {
    await page.goto('/', { waitUntil: 'load' });
    await sleep(3000);
    await page.mouse.wheel(0, 6000);
    await sleep(17000);
    return watch.api.slice();
  });

  const productPage = await measure(browser, 'New visitor, product page (20 s on the page)', async (page, watch) => {
    await page.goto(`/product/${product.id}`, { waitUntil: 'load' });
    await sleep(20000);
    return watch.api.slice();
  });

  const idle = await measure(browser, `Admin dashboard, idle for ${IDLE_SECONDS} s (sign-in not counted)`, async (page, watch) => {
    await page.goto('/drdaina', { waitUntil: 'load' });
    const inputs = page.locator('input:visible');
    await inputs.nth(0).fill(ADMIN.username);
    await inputs.nth(1).fill(ADMIN.password);
    await inputs.nth(2).fill(ADMIN.pin);
    await page.getByRole('button', { name: /unlock admin vault/i }).click();
    await page.getByText('EXECUTIVE STORE OVERVIEW').waitFor({ timeout: 20000 });
    await sleep(5000);
    const start = watch.api.length;
    await sleep(IDLE_SECONDS * 1000);
    const calls = watch.api.slice(start);
    await page.locator('aside button, nav button').filter({ hasText: /^Logout/ }).first().click();
    await sleep(1500);
    return calls;
  });

  const perHour = Math.round((idle * 3600) / IDLE_SECONDS);
  console.log(`\nAgainst the free plan's ${FREE_REQUESTS_PER_DAY.toLocaleString('en-IN')} Worker requests a day:`);
  console.log(`  home page view: ${home} -> ${Math.floor(FREE_REQUESTS_PER_DAY / Math.max(home, 1)).toLocaleString('en-IN')} such visits a day`);
  console.log(`  product page view: ${productPage} -> ${Math.floor(FREE_REQUESTS_PER_DAY / Math.max(productPage, 1)).toLocaleString('en-IN')} such views a day`);
  console.log(`  admin dashboard left open: ${perHour} an hour -> ${(perHour * 8).toLocaleString('en-IN')} in an 8-hour day (${((perHour * 8 * 100) / FREE_REQUESTS_PER_DAY).toFixed(1)}% of the daily limit)`);
} finally {
  await browser.close();
}
