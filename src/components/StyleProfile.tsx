import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { StyleIcon } from './AccountIcons';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import { COLLECTIONS, emailKey, getDocById, saveDoc } from '../lib/dataStore';
import { Product } from '../types';
import { COLOUR_FAMILIES, OCCASIONS, isAvailable, productColourFamilies, productOccasions } from '../utils/smartQuery';
import { ProductCard } from './ProductCard';

/** A customer's optional style profile, saved on profiles/{email}.stylePrefs. */
export interface StylePrefs {
  colours: string[]; // COLOUR_FAMILIES keys
  sizes: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  occasions: string[]; // OCCASIONS keys
  categories: string[];
  updatedAt?: string;
}

const EMPTY_PREFS: StylePrefs = { colours: [], sizes: [], budgetMin: null, budgetMax: null, occasions: [], categories: [] };
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free Size'];
const MAX_BUDGET = 100000;
const OCCASION_LABELS: Record<string, string> = { Party: 'Party wear', Office: 'Office wear', Daily: 'Daily wear' };

const isOneSize = (sizes: string[]) => sizes.length === 0 || sizes.every((s) => /free|one size/i.test(s));

/** Cleans prefs read from Firestore: unknown colours/occasions are dropped and budgets bounded. */
export const normaliseStylePrefs = (raw: unknown): StylePrefs | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const list = (value: unknown, allowed?: string[]) => (Array.isArray(value) ? value : [])
    .map((x) => String(x ?? '').trim().slice(0, 40))
    .filter((x, i, all) => x && all.indexOf(x) === i && (!allowed || allowed.includes(x)))
    .slice(0, 20);
  const money = (value: unknown) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_BUDGET) : null;
  };
  let budgetMin = money(r.budgetMin);
  let budgetMax = money(r.budgetMax);
  if (budgetMin && budgetMax && budgetMin > budgetMax) [budgetMin, budgetMax] = [budgetMax, budgetMin];
  return {
    colours: list(r.colours, Object.keys(COLOUR_FAMILIES)),
    sizes: list(r.sizes),
    budgetMin,
    budgetMax,
    occasions: list(r.occasions, Object.keys(OCCASIONS)),
    categories: list(r.categories),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
  };
};

export const hasStylePrefs = (p: StylePrefs | null | undefined): p is StylePrefs =>
  Boolean(p && (p.colours.length || p.sizes.length || p.occasions.length || p.categories.length || p.budgetMin || p.budgetMax));

/**
 * How well a product fits the saved style, or null when it does not fit at all
 * (hidden, sold out, not made in her sizes, or outside her budget).
 */
export const styleMatchScore = (p: Product, prefs: StylePrefs): number | null => {
  if (p.hidden || !isAvailable(p)) return null;
  const sizes = (p.sizes || []).map(String);
  const oneSize = isOneSize(sizes);
  if (prefs.sizes.length && !oneSize && !prefs.sizes.some((s) => sizes.includes(s))) return null;
  if (prefs.budgetMin && p.price < prefs.budgetMin) return null;
  if (prefs.budgetMax && p.price > prefs.budgetMax) return null;
  let taste = 0;
  if (prefs.colours.length && productColourFamilies(p).some((c) => prefs.colours.includes(c))) taste += 3;
  if (prefs.occasions.length && productOccasions(p).some((o) => prefs.occasions.includes(o))) taste += 2;
  if (prefs.categories.length && prefs.categories.includes(p.category)) taste += 2;
  // With colour, occasion or category preferences, at least one of them has to match
  if (prefs.colours.length + prefs.occasions.length + prefs.categories.length > 0 && taste === 0) return null;
  const fit = (prefs.sizes.length && !oneSize ? 1 : 0) + (prefs.budgetMin || prefs.budgetMax ? 1 : 0);
  return taste + fit;
};

/** Available products that match the saved style, best matches first. */
export const recommendedForYou = (products: Product[], prefs: StylePrefs | null | undefined, limit = 10) => {
  if (!hasStylePrefs(prefs)) return [];
  return products
    .map((p) => ({ p, s: styleMatchScore(p, prefs) }))
    .filter((x): x is { p: Product; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || Number(Boolean(b.p.isNewArrival)) - Number(Boolean(a.p.isNewArrival)) || a.p.price - b.p.price)
    .slice(0, limit)
    .map((x) => x.p);
};

// Prefs are read once per sign-in and shared by the account tab and the home "Recommended for you" rail.
let cachedEmail = '';
let cachedPrefs: StylePrefs | null = null;
let loaded = false;
let loading: Promise<void> | null = null;
let version = 0;
const subscribers = new Set<() => void>();
const emit = () => {
  version += 1;
  subscribers.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
};
const getVersion = () => version;

/** Seeds the cache from a profile document that was already read (saves a second read). */
export const primeStylePrefs = (email: string, raw: unknown) => {
  cachedEmail = emailKey(email);
  cachedPrefs = normaliseStylePrefs(raw);
  loaded = true;
  loading = null;
  emit();
};

const loadStylePrefs = (email: string) => {
  const key = emailKey(email);
  if (!key || (cachedEmail === key && (loaded || loading))) return;
  if (cachedEmail !== key) cachedPrefs = null;
  cachedEmail = key;
  loaded = false;
  const request: Promise<void> = getDocById(COLLECTIONS.profiles, key)
    .then((profile) => {
      if (cachedEmail !== key || loading !== request) return;
      cachedPrefs = normaliseStylePrefs(profile?.stylePrefs);
      loaded = true;
    })
    .catch((err) => console.warn('Could not load style profile:', err))
    .finally(() => {
      if (cachedEmail !== key || loading !== request) return;
      loading = null; // on failure `loaded` stays false, so the next visit (or "Try again") reads again
      emit();
    });
  loading = request;
  emit();
};

/** The signed-in customer's saved style profile (null for guests or when none is saved). */
export const useStylePrefs = () => {
  const { user } = useAuth();
  const email = user?.email ? emailKey(user.email) : '';
  useSyncExternalStore(subscribe, getVersion, getVersion);
  useEffect(() => {
    if (email) loadStylePrefs(email);
  }, [email]);
  const mine = Boolean(email) && cachedEmail === email;
  return {
    email,
    prefs: mine ? cachedPrefs : null,
    ready: mine && loaded,
    failed: mine && !loaded && !loading,
    retry: () => loadStylePrefs(email),
  };
};

/** Saves (or, when nothing is selected, removes) the style profile on the customer's own profile doc. */
export const saveStylePrefs = async (email: string, prefs: StylePrefs) => {
  const key = emailKey(email);
  const value = hasStylePrefs(prefs) ? { ...prefs, updatedAt: new Date().toISOString() } : null;
  await saveDoc(COLLECTIONS.profiles, key, { email: key, stylePrefs: value });
  primeStylePrefs(key, value);
};

// Square outline chips; the selected one carries an ink border and a small tick (never a fill)
const chipClass = 'sag-chip h-[38px] min-w-[44px] gap-1.5 px-3.5 text-[13px] font-normal aria-pressed:font-semibold';
const legendClass = 'text-[11px] leading-4 font-semibold uppercase tracking-[0.14em] text-ink';

const ChipGroup: React.FC<{ legend: string; hint?: string; options: Array<{ value: string; label: string }>; selected: string[]; onToggle: (value: string) => void }> = ({ legend, hint, options, selected, onToggle }) => (
  <fieldset className="space-y-2">
    <legend className={legendClass}>{legend}</legend>
    {hint && <p className="text-[13px] leading-[18px] text-ink-muted">{hint}</p>}
    <div className="flex flex-wrap gap-2">
      {options.map(({ value, label }) => {
        const on = selected.includes(value);
        return (
          <button key={value} type="button" aria-pressed={on} onClick={() => onToggle(value)} className={chipClass}>
            {on && <Check className="w-3.5 h-3.5 text-current" strokeWidth={1.5} aria-hidden="true" />}
            {label}
          </button>
        );
      })}
    </div>
  </fieldset>
);

const inputClass = 'sag-input sag-num h-[46px]';

/** Account tab where a signed-in customer can optionally save colours, sizes, budget, occasions and categories. */
export const StyleProfile: React.FC = () => {
  const { user } = useAuth();
  const { allProducts = [], showToast } = useShop();
  const { prefs, ready, failed, retry } = useStylePrefs();
  const [draft, setDraft] = useState<StylePrefs>(EMPTY_PREFS);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Start from the saved profile once it has loaded (and again after each save)
  useEffect(() => {
    if (!ready) return;
    const saved = prefs || EMPTY_PREFS;
    setDraft(saved);
    setMinText(saved.budgetMin ? String(saved.budgetMin) : '');
    setMaxText(saved.budgetMax ? String(saved.budgetMax) : '');
  }, [ready, prefs?.updatedAt]);

  const visible = useMemo(() => allProducts.filter((p) => !p.hidden), [allProducts]);
  const categories = useMemo(() => [...new Set(visible.map((p) => String(p.category || '')).filter(Boolean))].sort(), [visible]);
  const sizes = useMemo(() => {
    const made = new Set(visible.filter(isAvailable).flatMap((p) => (p.sizes || []).map(String)));
    const list = [...made].sort((a, b) => (SIZE_ORDER.indexOf(a) + 1 || 99) - (SIZE_ORDER.indexOf(b) + 1 || 99));
    return list.length ? list : SIZE_ORDER.slice(0, 7);
  }, [visible]);
  const priceRange = useMemo(() => {
    const prices = visible.filter(isAvailable).map((p) => Number(p.price) || 0).filter((n) => n > 0);
    return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
  }, [visible]);

  const parseMoney = (text: string) => {
    const n = Math.round(Number(text));
    return text.trim() && Number.isFinite(n) && n > 0 ? Math.min(n, MAX_BUDGET) : null;
  };
  const preview: StylePrefs = { ...draft, budgetMin: parseMoney(minText), budgetMax: parseMoney(maxText) };
  const matches = useMemo(
    () => recommendedForYou(visible, preview, 200),
    [visible, draft, minText, maxText],
  );

  if (!user) return null;

  const toggle = (key: 'colours' | 'sizes' | 'occasions' | 'categories') => (value: string) => {
    setError('');
    setDraft((prev) => ({ ...prev, [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value] }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const budgetMin = parseMoney(minText);
    const budgetMax = parseMoney(maxText);
    if ((minText.trim() && budgetMin === null) || (maxText.trim() && budgetMax === null)) {
      setError('Budget must be a whole amount in rupees, for example 999.');
      return;
    }
    if (budgetMin && budgetMax && budgetMin > budgetMax) {
      setError('The minimum budget should be lower than the maximum.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const next: StylePrefs = {
        ...draft,
        // Categories that no longer exist in the shop are dropped
        categories: categories.length ? draft.categories.filter((c) => categories.includes(c)) : draft.categories,
        budgetMin,
        budgetMax,
      };
      await saveStylePrefs(user.email, next);
      showToast(hasStylePrefs(next) ? 'Style profile saved. Your picks are on the home page.' : 'Style profile removed.', 'success');
    } catch (err) {
      console.warn('Style profile save failed:', err);
      showToast('Could not save your style profile. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(EMPTY_PREFS);
    setMinText('');
    setMaxText('');
    setError('');
  };

  if (failed) {
    return (
      <div className="sag-glass px-4 py-8 text-center space-y-3" role="alert">
        <p className="text-sm leading-5 text-ink-muted">We could not load your style profile. Check your connection and try again.</p>
        <button type="button" onClick={retry} className="sag-btn-outline h-11 px-5">Try again</button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="py-16 flex justify-center" role="status" aria-label="Loading your style profile">
        <Loader2 className="w-6 h-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  const anySelected = hasStylePrefs(preview);

  return (
    <section className="space-y-6" aria-labelledby="style-profile-title">
      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex gap-3 border-b border-line pb-5">
          <span className="mt-0.5 shrink-0 text-sale" aria-hidden="true"><StyleIcon className="w-[22px] h-[22px]" /></span>
          <div className="min-w-0">
            <h2 id="style-profile-title" className="font-display text-[19px] leading-6 lg:text-[23px] lg:leading-7 text-ink">Your style profile</h2>
            <p className="mt-1 text-[13px] leading-[19px] text-ink-muted">Optional. Choose what you like and we will show matching in-stock styles on the home page. Saved to your account only.</p>
          </div>
        </div>

        <ChipGroup
          legend="Favourite colours"
          options={Object.keys(COLOUR_FAMILIES).map((c) => ({ value: c, label: c }))}
          selected={draft.colours}
          onToggle={toggle('colours')}
        />
        <ChipGroup
          legend="Your sizes"
          hint="Styles not made in these sizes are left out."
          options={sizes.map((s) => ({ value: s, label: s }))}
          selected={draft.sizes}
          onToggle={toggle('sizes')}
        />
        <fieldset className="space-y-2">
          <legend className={legendClass}>Budget per outfit</legend>
          {priceRange && (
            <p className="sag-num text-[13px] leading-[18px] text-ink-muted">
              In-stock styles right now range from ₹{priceRange.min.toLocaleString('en-IN')} to ₹{priceRange.max.toLocaleString('en-IN')}.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <label className="block">
              <span className="block mb-1.5 text-[12.5px] leading-[18px] text-ink-muted">Minimum (₹)</span>
              <input className={inputClass} inputMode="numeric" placeholder="Any" value={minText} onChange={(e) => { setError(''); setMinText(e.target.value.replace(/\D/g, '').slice(0, 6)); }} />
            </label>
            <label className="block">
              <span className="block mb-1.5 text-[12.5px] leading-[18px] text-ink-muted">Maximum (₹)</span>
              <input className={inputClass} inputMode="numeric" placeholder="Any" value={maxText} onChange={(e) => { setError(''); setMaxText(e.target.value.replace(/\D/g, '').slice(0, 6)); }} />
            </label>
          </div>
        </fieldset>
        <ChipGroup
          legend="Occasions you shop for"
          options={Object.keys(OCCASIONS).map((o) => ({ value: o, label: OCCASION_LABELS[o] || o }))}
          selected={draft.occasions}
          onToggle={toggle('occasions')}
        />
        {categories.length > 0 && (
          <ChipGroup
            legend="Favourite categories"
            options={categories.map((c) => ({ value: c, label: c }))}
            selected={draft.categories}
            onToggle={toggle('categories')}
          />
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 border border-danger px-3.5 py-3 text-[13px] leading-5 text-danger">
            <AlertCircle className="w-[18px] h-[18px] mt-px shrink-0" strokeWidth={1.5} aria-hidden="true" />{error}
          </p>
        )}

        <p className="sag-num border-y border-line py-3 text-[13px] leading-5 text-ink-muted" aria-live="polite">
          {!anySelected
            ? 'Nothing selected yet. Saving with nothing selected removes your style profile.'
            : matches.length === 0
              ? 'No in-stock styles match all of these right now. Try a wider budget or fewer sizes.'
              : `${matches.length} in-stock ${matches.length === 1 ? 'style matches' : 'styles match'} your choices right now.`}
        </p>

        <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-3">
          <button type="submit" disabled={saving} className="sag-btn-primary h-12 px-6 gap-2">
            {saving && <Loader2 className="w-[18px] h-[18px] animate-spin text-current" aria-hidden="true" />}
            {saving ? 'Saving…' : 'Save style profile'}
          </button>
          <button type="button" onClick={reset} disabled={saving} className="sag-btn-outline h-12 px-6">
            Clear selections
          </button>
        </div>
      </form>

      {anySelected && matches.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-[19px] leading-6 text-ink">Matching styles</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
            {matches.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} compact />)}
          </div>
        </div>
      )}
    </section>
  );
};
