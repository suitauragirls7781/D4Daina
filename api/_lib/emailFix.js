// Mistyped email domains. Shoppers who come from ads on a phone often type "gamil.com" for "gmail.com". The
// order then carries an address that no mail reaches (the receipt is lost) and that is not the address the
// shopper later signs in with (her account says "No orders"). Both are handled here:
//  - fixEmailTypo: the corrected address, used when an order is created, so the receipt arrives and the order
//    belongs to the right account.
//  - emailVariants: the addresses an account's email may have been mistyped as, used to find the orders that
//    were already saved with a mistyped address (they are read, never rewritten).
// Only domains that are well-known slips of four big mail providers are listed; anything else is left alone.
// The same list is in src/utils/emailFix.ts for the checkout field: keep the two in step.

const TYPOS = {
  'gmail.com': ['gamil.com', 'gmial.com', 'gmai.com', 'gmal.com', 'gmil.com', 'gemil.com', 'gmain.com', 'gnail.com', 'gmaill.com', 'gmali.com', 'gamail.com', 'gimail.com', 'gmaul.com', 'gmsil.com', 'gmail.co', 'gmail.con', 'gmail.cm', 'gmail.om', 'gmail.comm', 'gmail.cim', 'gmail.vom', 'gmail.cpm', 'gmail.coom'],
  'yahoo.com': ['yaho.com', 'yahooo.com', 'yhoo.com', 'yahoo.con', 'yahoo.cm'],
  'hotmail.com': ['hotmial.com', 'hotmal.com', 'hotmail.con', 'hotmil.com'],
  'outlook.com': ['outlok.com', 'outlook.con', 'outloo.com'],
};
const RIGHT_DOMAIN = new Map(Object.entries(TYPOS).flatMap(([right, wrong]) => wrong.map((domain) => [domain, right])));

const parts = (email) => {
  const value = String(email || '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  return at > 0 ? [value.slice(0, at), value.slice(at + 1)] : [value, ''];
};

/** The address with a well-known mistyped domain corrected (lower case); any other address comes back unchanged. */
export const fixEmailTypo = (email) => {
  const [name, domain] = parts(email);
  if (!domain) return name;
  return `${name}@${RIGHT_DOMAIN.get(domain) || domain}`;
};

/** True when two addresses are the same person's address once well-known typing slips are corrected. */
export const sameEmail = (a, b) => Boolean(a) && Boolean(b) && fixEmailTypo(a) === fixEmailTypo(b);

/** The address itself first, then every mistyped form of it that an older order may carry (at most 30 in all). */
export const emailVariants = (email) => {
  const fixed = fixEmailTypo(email);
  const [name, domain] = parts(fixed);
  const own = String(email || '').trim().toLowerCase();
  return [...new Set([own, fixed, ...(TYPOS[domain] || []).map((wrong) => `${name}@${wrong}`)])].filter(Boolean).slice(0, 30);
};
