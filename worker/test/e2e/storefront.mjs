// What a shopper does: browse, search, add to bag, reach the payment step (never pays), write a lead and an
// abandoned checkout, and get refused when trying to change the catalogue. Also the static-hosting checks.
import {
  BASE_URL, WORKER_URL, createReport, d1All, d1DeleteDoc, d1Doc, d1Docs, launch, openPage, screenshot, sleep, until,
} from './lib.mjs';

const report = createReport('storefront');
const { check, clean } = report;
const browser = await launch();
const { page, watch } = await openPage(browser);
const bodyText = () => page.evaluate(() => document.body.innerText);
const cleanup = [];

try {
  const products = d1Docs('products').filter(({ data }) => data.hidden !== true);
  const byCategory = products.reduce((counts, { data }) => ({ ...counts, [data.category]: (counts[data.category] || 0) + 1 }), {});

  // ---- a. browsing ----
  const catalogResponse = page.waitForResponse((response) => response.url().includes('action=catalog'));
  await page.goto('/', { waitUntil: 'load' });
  const catalog = await (await catalogResponse).json();
  check('catalogue has every product of local D1 that is not hidden', catalog.products.length === products.length, `${catalog.products.length} of ${products.length}`);
  const catalogIds = new Set(catalog.products.map((product) => product.id));
  check('catalogue product ids are the D1 ids', products.every(({ id }) => catalogIds.has(id)));

  await page.waitForSelector('a[href^="/product/"]');
  const home = await bodyText();
  const shown = [...home.matchAll(/^(.+)\n+(\d+) designs?$/gm)].map((match) => [match[1].trim(), Number(match[2])]);
  const tiles = shown.filter(([name]) => byCategory[name] !== undefined);
  check('home: category tiles show the D1 product counts', tiles.length >= 3 && tiles.every(([name, count]) => byCategory[name] === count),
    tiles.map(([name, count]) => `${name} ${count}/${byCategory[name]}`).join(', '));
  check('home: nothing was read through /api/db by a first-time visitor', watch.api.every((call) => call.path !== '/api/db'),
    watch.api.map((call) => `${call.method} ${call.path}`).join(', '));
  clean('home', watch);

  await page.goto('/shop', { waitUntil: 'load' });
  await page.waitForSelector('article[id^="product-card-"]');
  const shopIds = await page.evaluate(() => [...document.querySelectorAll('article[id^="product-card-"]')].map((card) => card.id.replace('product-card-', '')));
  check('shop: product cards are D1 products', shopIds.length > 10 && shopIds.every((id) => catalogIds.has(id)), `${shopIds.length} cards`);
  clean('shop', watch);

  await page.goto('/category/suits', { waitUntil: 'load' });
  await page.waitForSelector('article[id^="product-card-"]');
  const suits = (await bodyText()).match(/Showing (\d+) of (\d+) styles/);
  check('category Suits: count matches D1', suits && Number(suits[2]) === byCategory.Suits, `${suits?.[0]} / D1 ${byCategory.Suits}`);
  clean('category', watch);

  await page.locator('button:visible', { hasText: /^kids & toys$/i }).first().click();
  await page.waitForSelector('article[id^="product-card-"]');
  const kidsText = await bodyText();
  const kids = kidsText.match(/Showing (\d+) of (\d+) styles/);
  const kidsInD1 = products.filter(({ data }) => ['Toys', 'Baby Girls', 'Baby Boys'].includes(data.category)).length;
  check('Kids & Toys: count matches D1', kids && Number(kids[2]) === kidsInD1, `${kids?.[0]} / D1 ${kidsInD1} @ ${new URL(page.url()).pathname}`);
  clean('kids & toys', watch);

  const product = products.find(({ data }) => data.category === 'Suits' && data.inStock !== false && (data.sizes || []).length > 0);
  await page.goto(`/product/${product.id}`, { waitUntil: 'load' });
  await page.waitForSelector('h1');
  await until(() => watch.api.some((call) => call.ops.startsWith('get:product_daily')));
  check('product page: shows the D1 name and price', (await bodyText()).includes(product.data.name) && (await bodyText()).includes(`₹${Number(product.data.price).toLocaleString('en-IN')}`), product.data.name);
  clean('product page', watch);

  await page.getByRole('button', { name: /^Search suits/ }).first().click();
  await page.keyboard.type('anarkali', { delay: 30 });
  await page.keyboard.press('Enter');
  const found = await until(async () => (await page.locator('article[id^="product-card-"]').count()) > 0 && /anarkali/i.test(await bodyText()), { timeout: 8000 });
  await screenshot(page, 'storefront-search');
  check('search: "anarkali" finds products', found, new URL(page.url()).pathname + new URL(page.url()).search);
  clean('search', watch);

  // ---- b. bag -> checkout -> payment options ----
  await page.goto(`/product/${product.id}`, { waitUntil: 'load' });
  await page.waitForSelector('h1');
  // The first size that can be bought (a sold-out size is a disabled button).
  for (const size of product.data.sizes) {
    const button = page.locator('main button:visible:enabled', { hasText: new RegExp(`^${size}$`) }).first();
    if (await button.count()) {
      await button.click();
      break;
    }
  }
  await page.getByRole('button', { name: /^add to bag$/i }).first().click();
  await page.getByText('Your bag').first().waitFor();
  check('add to bag: the bag holds the product', await until(async () => /1 item/.test(await bodyText())));

  // The PIN code lookup is a public service outside this machine: it is answered here instead.
  await page.context().route('https://api.postalpincode.in/**', (route) => route.fulfill({
    json: [{ Status: 'Success', PostOffice: [{ Name: 'Asansol', District: 'Paschim Bardhaman', State: 'West Bengal' }] }],
  }));
  await page.goto('/checkout', { waitUntil: 'load' });
  await page.getByPlaceholder('First name').waitFor();
  const shopperEmail = `e2e-${Date.now()}@example.com`;
  await page.getByPlaceholder('First name').fill('Local');
  await page.getByPlaceholder('Last name').fill('Tester');
  await page.getByPlaceholder('10-digit mobile number').fill('9876543210');
  await page.getByPlaceholder('you@example.com').fill(shopperEmail);
  await page.getByPlaceholder(/6-digit PIN code/).fill('713301');
  await page.getByPlaceholder('Flat 302, Palm Heights').fill('1 Test House');
  await page.getByPlaceholder('MG Road, Near Central Mall').fill('Station Road');
  await page.getByPlaceholder('New Delhi').fill('Asansol');
  await page.locator('select').first().selectOption({ label: 'West Bengal' });

  // ---- c. allowed anonymous write: the abandoned checkout ----
  const abandoned = await until(() => d1All("SELECT id FROM docs WHERE collection = 'abandoned_checkouts' AND json_extract(data, '$.email') = ?", shopperEmail)[0], { timeout: 10000 });
  check('abandoned checkout: saved in local D1 by an anonymous shopper', Boolean(abandoned), abandoned?.id || 'not found');
  if (abandoned) cleanup.push(['abandoned_checkouts', abandoned.id]);

  await page.getByRole('button', { name: /deliver here/i }).click();
  await sleep(800);
  await screenshot(page, 'storefront-checkout-summary');
  check('checkout: payment options came from /api/orders', await until(() => watch.api.find((call) => call.path === '/api/orders' && call.status === 200), { timeout: 10000 }));
  await page.getByRole('button', { name: /continue to payment/i }).click();
  await sleep(800);
  await screenshot(page, 'storefront-checkout-payment');
  check('checkout: the payment step offers Razorpay (UPI, cards & net banking)', await until(async () => /UPI, cards & net banking/i.test(await bodyText()), { timeout: 8000 }));
  check('checkout: no order was created', d1All("SELECT id FROM docs WHERE collection = 'orders' AND json_extract(data, '$.customerEmail') = ?", shopperEmail).length === 0);
  clean('bag and checkout', watch);

  // ---- c. leads: contact form and newsletter ----
  await page.goto('/contact', { waitUntil: 'load' });
  const contactEmail = `e2e-contact-${Date.now()}@example.com`;
  await page.getByPlaceholder('e.g. Priya Patel').fill('Local Tester');
  await page.getByPlaceholder('priya@example.com').fill(contactEmail);
  await page.getByPlaceholder(/How can we help/).fill('Local end-to-end check. Please ignore.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const leadRow = (email) => d1All("SELECT id, data FROM docs WHERE collection = 'leads' AND json_extract(data, '$.email') = ?", email)[0];
  const contactLead = await until(() => leadRow(contactEmail), { timeout: 8000 });
  check('contact form: lead saved in local D1', Boolean(contactLead) && JSON.parse(contactLead.data).source === 'contact');
  if (contactLead) cleanup.push(['leads', contactLead.id]);

  await page.goto('/', { waitUntil: 'load' });
  const newsletterEmail = `e2e-news-${Date.now()}@example.com`;
  const newsletter = page.locator('#newsletter-section');
  await until(() => newsletter.count(), { timeout: 8000 });
  await newsletter.scrollIntoViewIfNeeded();
  await newsletter.getByPlaceholder('Your email address').fill(newsletterEmail);
  await newsletter.locator('button[type="submit"]').click();
  const newsletterLead = await until(() => leadRow(newsletterEmail), { timeout: 8000 });
  check('newsletter: lead saved in local D1', Boolean(newsletterLead) && JSON.parse(newsletterLead.data).source === 'newsletter');
  if (newsletterLead) cleanup.push(['leads', newsletterLead.id]);
  clean('contact and newsletter', watch);

  // ---- c. forbidden writes and reads, as an anonymous visitor ----
  const before = d1Doc('products', product.id);
  const answers = await page.evaluate(async (productId) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: [
        { op: 'update', path: `products/${productId}`, data: { price: 1 } },
        { op: 'set', path: `products/${productId}`, data: { price: 1 }, merge: true },
        { op: 'delete', path: `products/${productId}` },
        { op: 'set', path: 'storefront_settings/storeSettings', data: { value_json: '{}' } },
        { op: 'query', collection: 'orders' },
        { op: 'query', collection: 'customers' },
        { op: 'get', path: 'admin_credentials/singleton' },
        { op: 'add', collection: 'leads', data: { email: 'x@example.com', source: 'newsletter', createdAt: new Date().toISOString(), offerSent: true, admin: true } },
      ] }),
    });
    return (await response.json()).results.map((result) => result.error?.code || 'ALLOWED');
  }, product.id);
  check('anonymous: product writes, settings write, orders/customers/credentials reads are all denied',
    answers.every((code) => code === 'permission-denied'), answers.join(','));
  const after = d1Doc('products', product.id);
  check('anonymous: the product in D1 is unchanged', after.version === before.version && after.data.price === before.data.price);
  const foreign = await fetch(`${WORKER_URL}/api/db`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify({ ops: [{ op: 'query', collection: 'products' }] }),
  });
  check('/api/db refuses another origin', foreign.status === 403, String(foreign.status));
  watch.apiFailures.length = 0;

  // ---- g. customer sign-in screen ----
  await page.goto('/login', { waitUntil: 'load' });
  check('customer sign-in screen renders', await until(async () => /EMAIL ME A CODE/i.test(await bodyText())));
  clean('customer sign-in', watch);

  // ---- h. hosting ----
  const sitemap = await fetch(`${WORKER_URL}/sitemap.xml`);
  const sitemapText = await sitemap.text();
  check('/sitemap.xml is XML with product links', sitemap.status === 200 && /xml/.test(sitemap.headers.get('content-type') || '') && sitemapText.includes('<urlset') && sitemapText.includes(`/product/`),
    `${sitemap.status} ${sitemap.headers.get('content-type')}`);

  const index = await fetch(`${WORKER_URL}/`);
  const html = await index.text();
  const securityHeaders = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'SAMEORIGIN' };
  check('index.html has the security headers', Object.entries(securityHeaders).every(([name, value]) => index.headers.get(name) === value) && Boolean(index.headers.get('permissions-policy')),
    Object.keys(securityHeaders).map((name) => `${name}=${index.headers.get(name)}`).join(' '));
  const assetPath = html.match(/\/assets\/[^"']+\.js/)?.[0];
  const asset = await fetch(`${WORKER_URL}${assetPath}`);
  check('a static asset has the long-cache header', asset.status === 200 && asset.headers.get('cache-control') === 'public, max-age=31536000, immutable', `${assetPath} ${asset.headers.get('cache-control')}`);
  const adminEntry = await fetch(`${WORKER_URL}/drdaina/orders`);
  check('admin paths are noindex and never cached', /noindex/.test(adminEntry.headers.get('x-robots-tag') || '') && adminEntry.headers.get('cache-control') === 'no-store');
  const headersFile = await fetch(`${WORKER_URL}/_headers`);
  check('/_headers is not served as a file', !(await headersFile.text()).includes('X-Robots-Tag'));

  const unknown = await page.goto('/no/such/page', { waitUntil: 'load' });
  check('unknown path: 200 from the app shell and the store\'s 404 page', unknown.status() === 200 && await until(async () => /This page does not exist/.test(await bodyText())));
  const adminPath = await page.goto('/admin', { waitUntil: 'load' });
  check('/admin shows the store\'s 404 page', adminPath.status() === 200 && await until(async () => /This page does not exist/.test(await bodyText())));
  const apiPost = await fetch(`${WORKER_URL}/api/nope`, { method: 'POST', headers: { Origin: BASE_URL } });
  check('unknown /api path does not run a handler', apiPost.status === 404 || apiPost.status === 405, String(apiPost.status));
  clean('unknown paths', watch);
} catch (error) {
  await screenshot(page, 'storefront-failure');
  check('storefront run completed', false, error.message.split('\n')[0]);
} finally {
  await browser.close();
  for (const [collection, id] of cleanup) d1DeleteDoc(collection, id);
}

process.exitCode = report.finish() ? 1 : 0;
