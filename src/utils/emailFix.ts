// Mistyped email domains at checkout ("gamil.com" for "gmail.com"). The same list is in api/_lib/emailFix.js,
// where the server corrects the address again when the order is created: keep the two in step.

const TYPOS: Record<string, string[]> = {
  'gmail.com': ['gamil.com', 'gmial.com', 'gmai.com', 'gmal.com', 'gmil.com', 'gemil.com', 'gmain.com', 'gnail.com', 'gmaill.com', 'gmali.com', 'gamail.com', 'gimail.com', 'gmaul.com', 'gmsil.com', 'gmail.co', 'gmail.con', 'gmail.cm', 'gmail.om', 'gmail.comm', 'gmail.cim', 'gmail.vom', 'gmail.cpm', 'gmail.coom'],
  'yahoo.com': ['yaho.com', 'yahooo.com', 'yhoo.com', 'yahoo.con', 'yahoo.cm'],
  'hotmail.com': ['hotmial.com', 'hotmal.com', 'hotmail.con', 'hotmil.com'],
  'outlook.com': ['outlok.com', 'outlook.con', 'outloo.com'],
};
const RIGHT_DOMAIN = new Map<string, string>(Object.entries(TYPOS).flatMap(([right, wrong]) => wrong.map((domain) => [domain, right] as [string, string])));

/** The address with a well-known mistyped domain corrected; '' when there is nothing to correct. */
export const correctedEmail = (email: string): string => {
  const value = String(email || '').trim();
  const at = value.lastIndexOf('@');
  if (at < 1) return '';
  const right = RIGHT_DOMAIN.get(value.slice(at + 1).toLowerCase());
  return right ? `${value.slice(0, at)}@${right}` : '';
};
