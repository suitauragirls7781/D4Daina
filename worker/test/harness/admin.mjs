// The owner's side of the scenarios: signing in to the admin panel and calling /api/admin-config with the cookie.

export const ADMIN_COOKIE = 'sag_admin_session';

/** `name=value` of the admin cookie a response set, ready to send back ('' when it set none or cleared it). */
export const adminCookieFrom = (response) => {
  const line = response.cookies.find((cookie) => cookie.startsWith(`${ADMIN_COOKIE}=`));
  const pair = line ? line.split(';')[0] : '';
  return pair === `${ADMIN_COOKIE}=` ? '' : pair;
};

/** Attributes of the admin cookie a response set: { value, 'max-age': '…', path: '…', httponly: true, … }. */
export const adminCookieAttributes = (response) => {
  const line = response.cookies.find((cookie) => cookie.startsWith(`${ADMIN_COOKIE}=`));
  if (!line) return null;
  const [pair, ...attributes] = line.split(';').map((part) => part.trim());
  const parsed = { value: pair.slice(ADMIN_COOKIE.length + 1) };
  for (const attribute of attributes) {
    const [name, value] = attribute.split('=');
    parsed[name.toLowerCase()] = value === undefined ? true : value;
  }
  return parsed;
};

/** POST /api/admin-config?action=login with the bootstrap credentials unless others are given. */
export const adminLogin = (h, { username = h.env.ADMIN_INITIAL_USERNAME, password = h.env.ADMIN_INITIAL_PASSWORD, pin = h.env.ADMIN_INITIAL_PIN, remember, ip } = {}) => h.post(
  '/api/admin-config?action=login',
  { username, password, pin, ...(remember === undefined ? {} : { remember }) },
  { ip: ip || h.nextIp() },
);

/** Signs the owner in. Returns the cookie for /api/admin-config and the token for /api/orders and /api/db. */
export const signInAdmin = async (h) => {
  const response = await adminLogin(h);
  if (response.status !== 200) throw new Error(`Admin sign-in failed in test setup: ${response.status} ${response.text}`);
  return { cookie: adminCookieFrom(response), token: response.body.firebaseToken };
};

/** PUT /api/admin-config as the signed-in owner. */
export const adminPut = (h, cookie, body) => h.call('/api/admin-config', { method: 'PUT', json: body, cookie });
