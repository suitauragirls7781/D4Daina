import { COLLECTIONS, emailKey, getDocById, saveDoc } from './dataStore';

/**
 * Customer address book: several saved delivery addresses.
 * Kept in this browser (localStorage 'sag_address_book_v1', one list per signed-in email or 'guest') and, for
 * signed-in customers, in their profile document (profiles/{email}.addresses) so the list follows them to
 * every device. The default address is also mirrored into the single-address profile fields (and the
 * 'sag_user_profile_<email>' copy) that checkout already reads, so checkout keeps prefilling it.
 */

export type AddressType = 'Home' | 'Work' | 'Other';

export interface SavedAddress {
  id: string;
  fullName: string;
  mobile: string;
  altMobile?: string;
  houseFlat: string;
  street: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  tehsil?: string;
  district?: string;
  type: AddressType;
  isDefault: boolean;
}

const STORAGE_KEY = 'sag_address_book_v1';
const GUEST = 'guest';
const MAX_ADDRESSES = 20;

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

let owner = GUEST;
const listeners = new Set<() => void>();
const synced = new Map<string, Promise<SavedAddress[]>>();

const str = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const digits = (value: unknown, max: number) => String(value ?? '').replace(/\D/g, '').slice(-max);

export const newAddressId = () => `adr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Cleans one stored address (older or hand-edited rows may miss fields). Returns null when unusable. */
const clean = (raw: any): SavedAddress | null => {
  if (!raw || typeof raw !== 'object') return null;
  const address: SavedAddress = {
    id: str(raw.id, 60) || newAddressId(),
    fullName: str(raw.fullName, 80),
    mobile: digits(raw.mobile ?? raw.phone, 10),
    houseFlat: str(raw.houseFlat ?? raw.streetAddress, 200),
    street: str(raw.street, 200),
    area: str(raw.area, 120),
    city: str(raw.city, 80),
    state: str(raw.state, 80),
    pincode: digits(raw.pincode, 6),
    type: raw.type === 'Work' || raw.type === 'Other' ? raw.type : 'Home',
    isDefault: Boolean(raw.isDefault),
  };
  const alt = digits(raw.altMobile, 10);
  if (alt) address.altMobile = alt;
  const landmark = str(raw.landmark, 120);
  if (landmark) address.landmark = landmark;
  const tehsil = str(raw.tehsil, 80);
  if (tehsil) address.tehsil = tehsil;
  const district = str(raw.district, 80);
  if (district) address.district = district;
  if (!address.houseFlat && !address.pincode && !address.city) return null;
  return address;
};

/** Exactly one default (the first one when none is marked). */
const normalize = (list: SavedAddress[]) => {
  const rows = list.slice(0, MAX_ADDRESSES);
  const defaultIndex = Math.max(0, rows.findIndex((a) => a.isDefault));
  return rows.map((a, index) => ({ ...a, isDefault: index === defaultIndex }));
};

const readAll = (): Record<string, SavedAddress[]> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const readLocal = (who = owner): SavedAddress[] | null => {
  const rows = readAll()[who];
  if (!Array.isArray(rows)) return null;
  return normalize(rows.map(clean).filter(Boolean) as SavedAddress[]);
};

const writeLocal = (list: SavedAddress[], who = owner) => {
  try {
    const all = readAll();
    all[who] = list;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
};

const notify = () => listeners.forEach((fn) => { try { fn(); } catch {} });

/** Re-render hook support: called whenever the list changes. Returns the unsubscribe function. */
export const subscribeAddressBook = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

/** The single address saved before the address book existed (checkout / Account → Profile), if any. */
const legacyAddress = (profile?: Record<string, any> | null): SavedAddress | null => {
  let source: any = profile && (profile.houseFlat || profile.streetAddress || profile.pincode) ? profile : null;
  if (!source) {
    try {
      const key = owner === GUEST ? 'sag_user_profile_current' : `sag_user_profile_${owner}`;
      source = JSON.parse(localStorage.getItem(key) || 'null');
    } catch {}
  }
  if (!source) return null;
  const address = clean({
    fullName: source.fullName || source.name,
    mobile: source.phone || source.mobile,
    houseFlat: source.houseFlat || source.streetAddress,
    street: source.houseFlat && source.streetAddress && source.streetAddress !== source.houseFlat ? source.streetAddress : source.street,
    area: source.area,
    city: source.city,
    state: source.state,
    pincode: source.pincode,
    type: 'Home',
    isDefault: true,
  });
  return address && address.houseFlat && address.pincode ? address : null;
};

/** Sets whose list the helpers below read and write: the signed-in email, or null for a guest. */
export const setAddressBookOwner = (email?: string | null, silent = false) => {
  const next = email ? emailKey(email) : GUEST;
  if (next === owner) return;
  owner = next;
  if (!silent) notify();
};

export const getAddressBookOwner = () => (owner === GUEST ? '' : owner);

/** Saved addresses for the current owner (default first). Migrates the old single saved address on first use. */
export const listAddresses = (): SavedAddress[] => {
  const local = readLocal();
  if (local) return [...local].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  const migrated = legacyAddress();
  const list = migrated ? [migrated] : [];
  if (migrated) writeLocal(list);
  return list;
};

export const getDefaultAddress = (): SavedAddress | null => listAddresses().find((a) => a.isDefault) || null;

/** Writes the list to the profile document (signed-in customers only) and mirrors the default address. */
const pushRemote = async (list: SavedAddress[], who = owner) => {
  if (who === GUEST) return;
  const def = list.find((a) => a.isDefault);
  const mirror = def
    ? { houseFlat: def.houseFlat, streetAddress: def.houseFlat, street: def.street, area: def.area, city: def.city, state: def.state, pincode: def.pincode }
    : {};
  if (def) {
    try {
      const key = `sag_user_profile_${who}`;
      const current = JSON.parse(localStorage.getItem(key) || '{}') || {};
      localStorage.setItem(key, JSON.stringify({
        ...current,
        ...mirror,
        email: who,
        fullName: current.fullName || def.fullName,
        phone: current.phone || def.mobile,
      }));
    } catch {}
  }
  await saveDoc(COLLECTIONS.profiles, who, { email: who, addresses: list, ...mirror });
};

/** The change is saved in this browser, but the upload to the customer's profile failed. */
export class AddressSyncError extends Error {
  constructor() {
    super('Saved on this device. We could not sync it to your account right now.');
  }
}

const commit = async (list: SavedAddress[]) => {
  const who = owner;
  const rows = normalize(list);
  writeLocal(rows, who);
  notify();
  try {
    await pushRemote(rows, who);
  } catch (err) {
    console.warn('Could not save addresses to profile:', err);
    throw new AddressSyncError();
  }
  return rows;
};

/**
 * Loads the signed-in customer's list from their profile once per session (pass the profile document when it
 * was already read, to save a read). The profile's list wins; otherwise this browser's list or the old single
 * address is used and uploaded.
 */
export const syncAddressBook = (email: string, profile?: Record<string, any> | null): Promise<SavedAddress[]> => {
  const who = emailKey(email);
  if (!who) return Promise.resolve(listAddresses());
  setAddressBookOwner(who);
  const cached = synced.get(who);
  if (cached) return cached;
  const run = (async () => {
    const data = profile !== undefined ? profile : await getDocById(COLLECTIONS.profiles, who).catch(() => null);
    if (Array.isArray(data?.addresses)) {
      const rows = normalize(data!.addresses.map(clean).filter(Boolean) as SavedAddress[]);
      writeLocal(rows, who);
      notify();
      return rows;
    }
    const local = readLocal(who);
    const migrated = local || (() => { const one = legacyAddress(data); return one ? [one] : []; })();
    writeLocal(migrated, who);
    notify();
    if (migrated.length) pushRemote(migrated, who).catch((err) => console.warn('Could not save addresses to profile:', err));
    return migrated;
  })();
  synced.set(who, run);
  run.catch(() => synced.delete(who));
  return run;
};

/** Adds or updates an address (matched by id). Returns the saved address. */
export const saveAddress = async (input: Partial<SavedAddress>): Promise<SavedAddress> => {
  const address = clean({ ...input, id: input.id || newAddressId() });
  if (!address) throw new Error('Please fill in the address.');
  const list = listAddresses();
  const exists = list.some((a) => a.id === address.id);
  let next = exists ? list.map((a) => (a.id === address.id ? address : a)) : [...list, address];
  if (!exists && list.length >= MAX_ADDRESSES) throw new Error(`You can save up to ${MAX_ADDRESSES} addresses.`);
  if (address.isDefault || next.length === 1) next = next.map((a) => ({ ...a, isDefault: a.id === address.id }));
  else if (!next.some((a) => a.isDefault)) next = next.map((a, i) => ({ ...a, isDefault: i === 0 }));
  const rows = await commit(next.sort((a, b) => Number(b.isDefault) - Number(a.isDefault)));
  return rows.find((a) => a.id === address.id) || address;
};

export const deleteAddress = async (id: string) => {
  await commit(listAddresses().filter((a) => a.id !== id));
};

export const setDefaultAddress = async (id: string) => {
  const list = listAddresses();
  if (!list.some((a) => a.id === id)) return;
  await commit(list.map((a) => ({ ...a, isDefault: a.id === id })).sort((a, b) => Number(b.isDefault) - Number(a.isDefault)));
};

/** One-line address for cards and previews. */
export const formatAddressLine = (a: Pick<SavedAddress, 'houseFlat' | 'street' | 'area' | 'landmark' | 'city' | 'state' | 'pincode'> & Partial<Pick<SavedAddress, 'tehsil' | 'district'>>) => {
  const same = (x?: string, y?: string) => Boolean(x && y && x.trim().toLowerCase() === y.trim().toLowerCase());
  const tehsil = a.tehsil && !same(a.tehsil, a.city) ? `Tehsil ${a.tehsil}` : '';
  const district = a.district && !same(a.district, a.city) ? `District ${a.district}` : '';
  return [a.houseFlat, a.street, a.area, a.landmark ? `Near ${a.landmark}` : '', a.city, tehsil, district, `${a.state || ''} ${a.pincode || ''}`.trim()].filter(Boolean).join(', ');
};

// ---- Places (OpenStreetMap Nominatim, at most one request per second) ----

export interface PlaceResult {
  id: string;
  label: string;
  houseFlat: string;
  street: string;
  area: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  lat?: number;
  lon?: number;
}

let lastNominatimAt = 0;
const nominatim = async (url: string, signal?: AbortSignal) => {
  const wait = lastNominatimAt + 1000 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  lastNominatimAt = Date.now();
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Location search is unavailable right now.');
  return response.json();
};

const toPlace = (row: any): PlaceResult => {
  const a = row?.address || {};
  const lat = Number.parseFloat(row?.lat);
  const lon = Number.parseFloat(row?.lon);
  return {
    id: String(row?.place_id ?? row?.osm_id ?? Math.random()),
    label: String(row?.display_name || ''),
    houseFlat: [a.house_number, a.building].filter(Boolean).join(', '),
    street: a.road || a.pedestrian || '',
    area: a.neighbourhood || a.suburb || a.quarter || a.residential || a.village || '',
    city: a.city || a.town || a.village || a.city_district || a.county || a.state_district || '',
    district: String(a.state_district || a.county || '').replace(/\s+district$/i, ''),
    state: a.state || '',
    pincode: String(a.postcode || '').replace(/\D/g, '').slice(0, 6),
    ...(Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : {}),
  };
};

/** Search by area / street / locality within India. */
export const searchPlaces = async (text: string, signal?: AbortSignal): Promise<PlaceResult[]> => {
  const q = text.trim();
  if (q.length < 3) return [];
  const rows = await nominatim(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&addressdetails=1&limit=6&accept-language=en&q=${encodeURIComponent(q)}`, signal);
  return Array.isArray(rows) ? rows.map(toPlace) : [];
};

/** Address at the given coordinates (same reverse lookup checkout uses). */
export const reversePlace = async (lat: number, lon: number, signal?: AbortSignal): Promise<PlaceResult | null> => {
  const data = await nominatim(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1&zoom=18&accept-language=en`, signal);
  return data?.address ? toPlace(data) : null;
};

export type PincodeLookup =
  | { valid: true; city: string; district: string; tehsil: string; state: string }
  | { valid: false };

const realName = (value: unknown) => {
  const text = String(value ?? '').trim();
  return /^(na|n\/a|not applicable|-)?$/i.test(text) ? '' : text;
};

/**
 * City, district, tehsil (block) and state for an Indian PIN code (India Post API, as used on checkout and
 * Account → Profile). { valid: false } when India Post says the PIN does not exist; null when the lookup
 * itself failed (network / service down), so the caller should not call the PIN wrong.
 */
export const lookupPincode = async (pin: string): Promise<PincodeLookup | null> => {
  if (!/^[1-9]\d{5}$/.test(pin)) return { valid: false };
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    if (!res.ok) return null;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;
    const po = row.Status === 'Success' ? row.PostOffice?.[0] : null;
    if (!po) return row.Status === 'Error' || row.Status === '404' ? { valid: false } : null;
    const district = realName(po.District);
    const tehsil = realName(po.Block);
    return { valid: true, city: district || tehsil, district, tehsil, state: realName(po.State) };
  } catch {
    return null;
  }
};
