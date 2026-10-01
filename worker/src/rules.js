// Port of firestore.rules for the /api/db gateway (the browser's only way to the database).
// Every `match` block of the rules file is reproduced below with its original text in a comment, so the
// two can be compared line by line. The Admin-SDK code in api/** does not pass through here, exactly as
// it bypassed the Firestore rules.
//
// How a rule is evaluated (same model as Firestore):
//   request.auth            null for anonymous visitors, else { uid, token: { admin, customerEmail } }
//   request.resource.data   the document as it would be AFTER the write (null for delete and reads)
//   resource.data           the stored document BEFORE the request (resource is null when it does not exist)
//   id                      the document id (the {wildcard} of the match path)
// A rule that throws (for example it reads `resource.data` of a missing document) denies, as in Firestore.

export const OPERATIONS = ['get', 'list', 'create', 'update', 'delete'];
const READ_OPERATIONS = ['get', 'list'];

const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// function isAdmin() {
//   return request.auth != null && request.auth.token.admin == true;
// }
const isAdmin = ({ request }) => request.auth != null && request.auth.token.admin === true;

// function isCustomer(email) {
//   return request.auth != null && request.auth.token.customerEmail == email;
// }
// A token without the customerEmail claim never matches: the claim is then undefined, not ''.
const isCustomer = ({ request }, email) => request.auth != null
  && typeof request.auth.token.customerEmail === 'string'
  && request.auth.token.customerEmail === email;

// function optionalString(data, key, maxLen) {
//   return !(key in data) || data[key] == null || (data[key] is string && data[key].size() <= maxLen);
// }
// size() counts characters; .length counts UTF-16 units, which is the same or larger (never looser).
const optionalString = (data, key, maxLen) => !(key in data)
  || data[key] === null
  || (typeof data[key] === 'string' && data[key].length <= maxLen);

const always = () => true;
const never = () => false;

const LEAD_FIELDS = ['name', 'email', 'phone', 'source', 'message', 'orderNumber', 'createdAt', 'offerSent'];

/** True when the query can only return documents whose `field` equals `value`. */
const queryPins = (query, field, value) => Array.isArray(query?.where)
  && query.where.some((clause) => Array.isArray(clause) && clause[0] === field && clause[1] === '==' && clause[2] === value);

// Keys per collection: `read` (= get + list), `write` (= create + update + delete) or a single operation;
// the single operation wins. An operation with no rule is denied.
// `listQuery` is Firestore's "rules are not filters" check for list rules that depend on the document:
// the query itself must prove it cannot return a forbidden document.
const MATCHES = {
  // // Catalog: public read, admin write. Stock is changed by the server when orders are paid or cancelled.
  // match /products/{productId} {
  //   allow read: if true;
  //   allow write: if isAdmin();
  // }
  products: { read: always, write: isAdmin },

  // match /categories/{categoryId} {
  //   allow read: if true;
  //   allow write: if isAdmin();
  // }
  categories: { read: always, write: isAdmin },

  // match /hero_slides/{slideId} {
  //   allow read: if true;
  //   allow write: if isAdmin();
  // }
  hero_slides: { read: always, write: isAdmin },

  // // Coupons are listed at checkout; the server re-validates every coupon when the order is created.
  // match /coupons/{couponId} {
  //   allow read: if true;
  //   allow write: if isAdmin();
  // }
  coupons: { read: always, write: isAdmin },

  // // Shoppers read approved reviews only; new reviews come in through /api/reviews (Admin SDK, rate-limited).
  // match /reviews/{reviewId} {
  //   allow read: if isAdmin() || resource.data.status == 'approved';
  //   allow create, update, delete: if isAdmin();
  // }
  reviews: {
    read: (c) => isAdmin(c) || c.resource.data.status === 'approved',
    // Firestore refuses a shopper's query unless it filters on status == 'approved'.
    listQuery: (c, query) => isAdmin(c) || queryPins(query, 'status', 'approved'),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },

  // // Orders are created, paid and updated only by /api/orders, which is also how customers see their own
  // // orders (without internal notes). Only the admin reads order documents directly.
  // match /orders/{orderNumber} {
  //   allow read: if isAdmin();
  //   allow create, update: if false;
  //   allow delete: if isAdmin();
  // }
  orders: { read: isAdmin, create: never, update: never, delete: isAdmin },

  // // Customer profile (cart, wishlist, address), keyed by lowercase email; only that signed-in customer.
  // match /profiles/{email} {
  //   allow get, create, update: if isAdmin() || isCustomer(email);
  //   allow list, delete: if isAdmin();
  // }
  profiles: {
    get: (c) => isAdmin(c) || isCustomer(c, c.id),
    create: (c) => isAdmin(c) || isCustomer(c, c.id),
    update: (c) => isAdmin(c) || isCustomer(c, c.id),
    list: isAdmin,
    delete: isAdmin,
  },

  // // Customer accounts are written by /api/customer-auth only.
  // match /customers/{email} {
  //   allow read: if isAdmin() || isCustomer(email);
  //   allow write: if false;
  // }
  customers: {
    read: (c) => isAdmin(c) || isCustomer(c, c.id),
    // Stricter than Firestore, which would accept a customer's query pinned to their own document id.
    // The app never lists this collection as a customer, so customer queries are simply refused.
    listQuery: isAdmin,
    write: never,
  },

  // match /abandoned_checkouts/{sessionId} {
  //   allow create, update: if true;
  //   allow read, delete: if isAdmin();
  // }
  abandoned_checkouts: { create: always, update: always, read: isAdmin, delete: isAdmin },

  // // Written only by the server API; clients just watch for changes.
  // match /storefront_settings/{settingKey} {
  //   allow read: if true;
  //   allow write: if false;
  // }
  storefront_settings: { read: always, write: never },

  // // Server-only collections (Admin SDK bypasses these rules).
  // match /admin_credentials/{docId} {
  //   allow read, write: if false;
  // }
  admin_credentials: { read: never, write: never },
  // match /customer_email_otps/{docId} {
  //   allow read, write: if false;
  // }
  customer_email_otps: { read: never, write: never },
  // match /rate_limits/{key} {
  //   allow read, write: if false;
  // }
  rate_limits: { read: never, write: never },

  // // Newsletter / contact leads: public can create, admin manages.
  // match /leads/{leadId} {
  //   allow create: if request.resource.data.keys().hasOnly(['name', 'email', 'phone', 'source', 'message', 'orderNumber', 'createdAt', 'offerSent'])
  //     && request.resource.data.source is string && request.resource.data.source.size() <= 40
  //     && optionalString(request.resource.data, 'name', 120)
  //     && optionalString(request.resource.data, 'email', 160)
  //     && optionalString(request.resource.data, 'phone', 20)
  //     && optionalString(request.resource.data, 'message', 2000)
  //     && optionalString(request.resource.data, 'orderNumber', 40)
  //     && request.resource.data.get('offerSent', false) == false;
  //   allow read, update, delete: if isAdmin();
  // }
  leads: {
    // Note: the rule has no isAdmin() branch, so the admin's creates are held to the same field checks.
    create: ({ request }) => {
      const data = request.resource.data;
      return isMap(data)
        && Object.keys(data).every((key) => LEAD_FIELDS.includes(key))
        && typeof data.source === 'string' && data.source.length <= 40
        && optionalString(data, 'name', 120)
        && optionalString(data, 'email', 160)
        && optionalString(data, 'phone', 20)
        && optionalString(data, 'message', 2000)
        && optionalString(data, 'orderNumber', 40)
        && (!('offerSent' in data) || data.offerSent === false);
    },
    read: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },

  // // Visitor analytics: written only by the server (api/track.js, verified payments); only the admin reads it.
  // match /visitor_sessions/{sessionId} {
  //   allow read, delete: if isAdmin();
  // }
  visitor_sessions: { read: isAdmin, delete: isAdmin },

  // match /daily_analytics/{date} {
  //   allow read, delete: if isAdmin();
  // }
  daily_analytics: { read: isAdmin, delete: isAdmin },

  // // Per-product daily counts (views / wishlist saves). Counts only, no visitor data: anyone may
  // // read one day's counts for a product (honest social proof); only the server writes them.
  // match /product_daily/{id} {
  //   allow get: if true;
  //   allow list, delete: if isAdmin();
  // }
  product_daily: { get: always, list: isAdmin, delete: isAdmin },

  // match /search_terms/{id} {
  //   allow read, delete: if isAdmin();
  // }
  search_terms: { read: isAdmin, delete: isAdmin },

  // match /feature_daily/{id} {
  //   allow read, delete: if isAdmin();
  // }
  feature_daily: { read: isAdmin, delete: isAdmin },

  // // Lifetime visitor totals: kept by the server, read by the admin, never deleted or reset.
  // match /analytics_totals/{id} {
  //   allow read: if isAdmin();
  // }
  analytics_totals: { read: isAdmin },

  // // Stock change history, written by the admin panel when the admin changes a product's stock. Admin only.
  // match /inventory_log/{entryId} {
  //   allow read, write: if isAdmin();
  // }
  inventory_log: { read: isAdmin, write: isAdmin },

  // // Private admin preferences (e.g. the low-stock alert threshold). Admin only.
  // match /admin_settings/{settingKey} {
  //   allow read, write: if isAdmin();
  // }
  admin_settings: { read: isAdmin, write: isAdmin },

  // // Default deny for all other collections
  // match /{document=**} {
  //   allow read, write: if false;
  // }
  // -> any collection that is not a key of this object has no rule and is denied (see ruleFor).
};

const ruleFor = (collection, operation) => {
  if (typeof collection !== 'string' || !Object.hasOwn(MATCHES, collection)) return never;
  const match = MATCHES[collection];
  return match[operation] || match[READ_OPERATIONS.includes(operation) ? 'read' : 'write'] || never;
};

/** identity is what the gateway resolved from the Bearer token: { admin, email (customerEmail claim), uid }. */
const toRequest = (identity, incoming) => ({
  auth: identity && typeof identity.uid === 'string' && identity.uid
    ? { uid: identity.uid, token: { admin: identity.admin === true, customerEmail: identity.email || undefined } }
    : null,
  resource: incoming == null ? null : { data: incoming },
});

const evaluate = (rule, context, ...rest) => {
  try {
    return rule(context, ...rest) === true;
  } catch {
    return false;
  }
};

/**
 * May `identity` run `operation` (get | list | create | update | delete) on `collection/id`?
 * `existing` is the stored document's data (null when there is none); `incoming` is the document as it
 * would be after the write (create / update only).
 */
export const allows = (identity, collection, id, operation, { existing = null, incoming = null } = {}) => {
  if (!OPERATIONS.includes(operation) || typeof id !== 'string' || !id) return false;
  const context = {
    request: toRequest(identity, incoming),
    resource: existing == null ? null : { data: existing },
    id,
  };
  return evaluate(ruleFor(collection, operation), context);
};

/**
 * May `identity` run this list query at all, before any document is looked at? Like Firestore, a query is
 * refused unless it can only return readable documents. The gateway still checks every returned document
 * with allows(..., 'list'), so both checks must pass.
 */
export const allowsQuery = (identity, collection, query = {}) => {
  if (typeof collection !== 'string' || !Object.hasOwn(MATCHES, collection)) return false;
  const context = { request: toRequest(identity, null), resource: null, id: null };
  const rule = MATCHES[collection].listQuery || ruleFor(collection, 'list');
  return evaluate(rule, context, query);
};
