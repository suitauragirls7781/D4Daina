/**
 * Official tracking pages of common Indian couriers. `track(awb)` is used only where the courier's own
 * page accepts the AWB in its address; otherwise the customer lands on the courier's tracking page and
 * pastes the AWB (we copy it for them). An https tracking link typed by the admin always wins.
 * A courier without `home` is recognised by name but not linked (its site does not open safely), so the
 * customer only gets the AWB to copy unless the admin pastes a link.
 */
export interface CourierInfo {
  key: string;
  name: string;
  /** The courier's own tracking page (left out when it cannot be linked safely). */
  home?: string;
  /** Deep link for one AWB, when the courier's page supports it. */
  track?: (awb: string) => string;
}

const enc = encodeURIComponent;

export const COURIERS: CourierInfo[] = [
  { key: 'delhivery', name: 'Delhivery', home: 'https://www.delhivery.com/tracking', track: (awb) => `https://www.delhivery.com/track-v2/package/${enc(awb)}` },
  { key: 'bluedart', name: 'Blue Dart', home: 'https://www.bluedart.com/tracking', track: (awb) => `https://www.bluedart.com/trackdartresultthirdparty?trackFor=0&trackNo=${enc(awb)}` },
  { key: 'dtdc', name: 'DTDC', home: 'https://www.dtdc.com/track-your-shipment/' },
  { key: 'ekart', name: 'Ekart', home: 'https://ekartlogistics.com/shipmenttrack/' },
  { key: 'xpressbees', name: 'XpressBees', home: 'https://www.xpressbees.com/shipment/tracking', track: (awb) => `https://www.xpressbees.com/shipment/tracking?awbNo=${enc(awb)}` },
  { key: 'shadowfax', name: 'Shadowfax', home: 'https://tracker.shadowfax.in/' },
  { key: 'indiapost', name: 'India Post', home: 'https://www.indiapost.gov.in/' },
  // ecomexpress.in serves an expired TLS certificate (checked 29 Sept 2026), so browsers show a security warning: not linked.
  { key: 'ecomexpress', name: 'Ecom Express' },
  { key: 'shiprocket', name: 'Shiprocket', home: 'https://www.shiprocket.in/shipment-tracking/', track: (awb) => `https://shiprocket.co/tracking/${enc(awb)}` },
  { key: 'amazon', name: 'Amazon Shipping', home: 'https://track.amazon.in/', track: (awb) => `https://track.amazon.in/tracking/${enc(awb)}` },
];

/** Words the admin might type for each courier (compared without spaces, dots or dashes). */
const ALIASES: Record<string, string[]> = {
  delhivery: ['delhivery', 'delhivry'],
  bluedart: ['bluedart', 'bluedartexpress', 'dhlbluedart'],
  dtdc: ['dtdc'],
  ekart: ['ekart', 'ekartlogistics', 'flipkartekart'],
  xpressbees: ['xpressbees', 'expressbees', 'xpressbee', 'xbees'],
  shadowfax: ['shadowfax'],
  indiapost: ['indiapost', 'speedpost', 'indianpost', 'indiapostspeedpost', 'registeredpost'],
  ecomexpress: ['ecomexpress', 'ecom'],
  shiprocket: ['shiprocket'],
  amazon: ['amazonshipping', 'amazon', 'amazontransportation'],
};

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The courier the admin named, matched loosely ("Blue Dart", "BLUEDART", "Speed Post"...), or null. */
export const findCourier = (name?: string): CourierInfo | null => {
  const key = squash(name || '');
  if (!key) return null;
  const hit = Object.entries(ALIASES).find(([, words]) => words.some((word) => key === word || key.startsWith(word)));
  return hit ? COURIERS.find((courier) => courier.key === hit[0]) || null : null;
};

const safeHttps = (value?: string) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
};

export interface TrackingLink {
  url: string;
  /** Button text, e.g. "Track on Delhivery website". */
  label: string;
  /** True when the page opens with this AWB already filled in (the admin's link counts as such). */
  hasAwb: boolean;
}

/**
 * Where "Track on courier website" should go: the admin's own https link first, then the courier's
 * official page for this AWB, then the courier's tracking page. Null when the courier is unknown or not linked.
 */
export const trackingLinkFor = (order: { courierPartner?: string; trackingNumber?: string; trackingUrl?: string }): TrackingLink | null => {
  const courier = findCourier(order.courierPartner);
  const custom = safeHttps(order.trackingUrl);
  const name = courier?.name || (order.courierPartner || '').trim();
  if (custom) return { url: custom, label: name ? `Track on ${name} website` : 'Track on courier website', hasAwb: true };
  if (!courier) return null;
  const awb = (order.trackingNumber || '').trim();
  if (awb && courier.track) return { url: courier.track(awb), label: `Track on ${courier.name} website`, hasAwb: true };
  return courier.home ? { url: courier.home, label: `Track on ${courier.name} website`, hasAwb: false } : null;
};
