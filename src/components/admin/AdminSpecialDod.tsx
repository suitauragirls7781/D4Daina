import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { useShop } from '../../context/ShopContext';
import { useAdmin } from '../../context/AdminContext';
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { Coupon, SpecialDodConfig, SpecialDodOffer } from '../../types';
import { uploadImage } from '../../lib/dataStore';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { DEFAULT_EYEBROW, DEFAULT_ROUNDS } from '../FestiveBanner';
import { AdminPageHeader } from './kidsToysShared';
import { CheckRow, Panel, Pill, SaveBar, Tile, Tiles, kit } from './AdminPaymentGateways';

// Special DOD: the festive offer panel on the homepage (and its slim row on the shop page, the line under the
// header and the clock at checkout). The owner keeps a list of festival offers here. Each offer runs on a real
// coupon from Admin → Coupons: the discount, the minimum order, the dates and the countdown are the coupon's
// own, so nothing on the panel can be made up. The site shows the first offer in the list whose coupon is live.

const DEFAULT_PHOTO = '/festive/diyas-560.webp';
const newId = () => `offer-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
// What the site uses until this page has been saved once
const STARTING: SpecialDodConfig = {
  enabled: true,
  offers: DEFAULT_ROUNDS.map((round, index) => ({ id: `offer-${index + 1}`, enabled: true, eyebrow: round.eyebrow, title: round.title, couponCode: round.code, imageUrl: '' })),
};

const todayInIndia = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const niceDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const rupees = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

type OfferState = { tone: 'live' | 'off' | 'warn'; label: string; detail: string; live: boolean };

/** Where one offer stands today, in plain words. The same checks as the storefront's panel. */
const offerState = (offer: SpecialDodOffer, coupons: Coupon[], pageOn: boolean): OfferState => {
  if (!offer.couponCode) return { tone: 'warn', label: 'No coupon chosen', detail: 'Choose a coupon, or this offer cannot be shown.', live: false };
  const coupon = coupons.find((c) => String(c.code || '').trim().toUpperCase() === offer.couponCode);
  if (!coupon) return { tone: 'warn', label: 'Coupon not found', detail: `There is no coupon ${offer.couponCode} in Coupons any more.`, live: false };
  const start = String(coupon.startDate || '').slice(0, 10);
  const end = String(coupon.expiryDate || '').slice(0, 10);
  const value = Number(coupon.discountValue) || 0;
  const what = [
    coupon.discountType === 'fixed' ? `${rupees(value)} off` : `${value}% off`,
    coupon.discountType !== 'fixed' && Number(coupon.maxDiscount) > 0 ? `up to ${rupees(Number(coupon.maxDiscount))}` : '',
    Number(coupon.minOrderValue) > 0 ? `on orders above ${rupees(Number(coupon.minOrderValue))}` : '',
  ].filter(Boolean).join(', ');
  const today = todayInIndia();
  if (!offer.title.trim()) return { tone: 'warn', label: 'Name missing', detail: 'Give the offer a name.', live: false };
  if (coupon.isActive === false) return { tone: 'warn', label: 'Coupon is switched off', detail: `Switch ${coupon.code} on in Coupons to show this offer.`, live: false };
  if (value <= 0) return { tone: 'warn', label: 'Coupon has no discount', detail: `Set a discount on ${coupon.code} in Coupons.`, live: false };
  if (!end) return { tone: 'warn', label: 'Coupon has no last day', detail: `Give ${coupon.code} an expiry date in Coupons: the countdown runs to that day.`, live: false };
  if (today > end) return { tone: 'off', label: 'Ended', detail: `${what}. Ended on ${niceDate(end)}.`, live: false };
  if (Number(coupon.usageLimit) > 0 && Number(coupon.usageCount) >= Number(coupon.usageLimit)) return { tone: 'off', label: 'Coupon fully used', detail: `${coupon.code} has reached its usage limit.`, live: false };
  if (start && today < start) return { tone: 'off', label: `Starts ${niceDate(start)}`, detail: `${what}. Runs ${niceDate(start)} to ${niceDate(end)}.`, live: false };
  if (!offer.enabled) return { tone: 'off', label: 'Switched off', detail: `${what}. Till ${niceDate(end)}.`, live: false };
  if (!pageOn) return { tone: 'off', label: 'Panel is off', detail: `${what}. Till ${niceDate(end)}.`, live: false };
  return { tone: 'live', label: 'Coupon is live', detail: `${what}. Till ${niceDate(end)}.`, live: true };
};

export const AdminSpecialDod: React.FC = () => {
  const { showToast } = useShop();
  const { coupons = [] } = useAdmin();
  const [form, setForm] = useState<SpecialDodConfig>(STARTING);
  // What the store has saved right now (the form may hold changes not saved yet)
  const [saved, setSaved] = useState<SpecialDodConfig>(STARTING);
  const [everSaved, setEverSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'storefront_settings', 'specialDod'), (snapshot) => {
      try {
        if (snapshot.exists()) {
          const value = JSON.parse(snapshot.data().value_json || '{}');
          const next: SpecialDodConfig = { enabled: value.enabled !== false, offers: Array.isArray(value.offers) ? value.offers : [] };
          setForm(next);
          setSaved(next);
          setEverSaved(true);
        }
      } catch {}
      setLoaded(true);
    }, () => setLoaded(true));
    return unsubscribe;
  }, []);

  const change = (id: string, patch: Partial<SpecialDodOffer>) => setForm((current) => ({ ...current, offers: current.offers.map((offer) => (offer.id === id ? { ...offer, ...patch } : offer)) }));
  const move = (index: number, by: number) => setForm((current) => {
    const offers = [...current.offers];
    const target = index + by;
    if (target < 0 || target >= offers.length) return current;
    [offers[index], offers[target]] = [offers[target], offers[index]];
    return { ...current, offers };
  });
  const remove = (id: string) => setForm((current) => ({ ...current, offers: current.offers.filter((offer) => offer.id !== id) }));
  const add = () => setForm((current) => ({ ...current, offers: [...current.offers, { id: newId(), enabled: true, eyebrow: DEFAULT_EYEBROW, title: '', couponCode: '', imageUrl: '' }] }));

  const upload = async (id: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Only image files can be uploaded.', 'error'); return; }
    setUploadingId(id);
    try {
      const url = await uploadImage(file, 'banners');
      change(id, { imageUrl: url });
      showToast('Photo uploaded. Press "Save" to show it on the site.', 'success');
    } catch (err: any) {
      showToast(`Could not upload the photo: ${err?.message || 'please try again.'}`, 'error');
    } finally {
      setUploadingId('');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const unfinished = form.offers.find((offer) => offer.enabled && (!offer.title.trim() || !offer.couponCode));
    if (unfinished) {
      showToast('Every offer that is switched on needs a name and a coupon.', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/admin-config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { specialDod: form } }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Could not save the offers.');
      }
      showToast('Special DOD saved.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not save the offers.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const states = form.offers.map((offer) => offerState(offer, coupons, form.enabled));
  const savedStates = saved.offers.map((offer) => offerState(offer, coupons, saved.enabled));
  const showing = saved.offers[savedStates.findIndex((state) => state.live)];
  const nextUp = saved.enabled ? saved.offers.find((offer, index) => offer.enabled && savedStates[index].label.startsWith('Starts')) : undefined;
  const unsaved = loaded && JSON.stringify(form) !== JSON.stringify(saved);
  const liveCodes = [...coupons].sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const firstLive = states.findIndex((state) => state.live);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Offers"
        title="Special DOD"
        icon={<Sparkles className="text-current" />}
        description="The festival offer panel on the homepage. Keep your festival offers here: each one has a name, a photo and a coupon. The site shows the offer whose coupon is running today, with a live countdown to that coupon's last day, and hides the panel by itself when no offer is running."
        actions={!loaded
          ? <Pill role="status"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</Pill>
          : <Pill role="status" tone={showing ? 'live' : 'off'}>{showing ? 'Showing on the site' : 'Nothing showing'}</Pill>}
      />

      {loaded && (
        <Tiles className="lg:!grid-cols-3">
          <Tile label="On the site now" value={showing ? showing.title : 'Nothing'} note={showing ? `Coupon ${showing.couponCode}` : 'No offer has a coupon running today'} />
          <Tile label="Coming next" value={nextUp ? nextUp.title : '—'} note={nextUp ? savedStates[saved.offers.indexOf(nextUp)].label : 'No offer is waiting to start'} />
          <Tile label="Offers kept here" value={saved.offers.length} note={everSaved ? 'Saved by you' : 'The two starting offers'} />
        </Tiles>
      )}

      <form onSubmit={save} className="space-y-5">
        <Panel title="The panel" hint="One switch for the whole panel. Off hides it everywhere: the homepage, the shop page row, the line under the header and the clock at checkout. Your coupons keep working.">
          <CheckRow
            label="Show the festival offer on the site"
            hint="On: the first offer below whose coupon is running today is shown. Off: no festival offer is shown."
            checked={form.enabled}
            onChange={(enabled) => setForm({ ...form, enabled })}
          />
        </Panel>

        <Panel
          title="Your festival offers"
          hint="The site goes down this list and shows the first offer whose coupon is running today, so put the one you want first on top. The discount, the dates and the countdown come from the coupon."
          action={<button type="button" onClick={add} disabled={form.offers.length >= 12} className="sag-btn-outline h-10 gap-1.5 px-4 text-sm"><Plus className="w-4 h-4" /> Add offer</button>}
        >
          {form.offers.length === 0 ? (
            <p className={`${kit.inset} ${kit.hint}`}>No offers yet. Press "Add offer", give it a name and choose its coupon.</p>
          ) : (
            <ol className="space-y-4">
              {form.offers.map((offer, index) => {
                const state = states[index];
                const photo = offer.imageUrl ? getCleanImageUrl(offer.imageUrl, 480) : DEFAULT_PHOTO;
                return (
                  <li key={offer.id} className={`${kit.inset} space-y-3.5`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="sag-num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-xs font-semibold text-ink-muted">{index + 1}</span>
                      <p className="min-w-0 flex-1 basis-32 truncate text-sm font-semibold text-ink">{offer.title || 'New offer'}</p>
                      <Pill tone={state.tone === 'live' ? 'live' : 'off'}>{index === firstLive ? (unsaved ? 'Shown on the site after you save' : 'Shown on the site now') : state.label}</Pill>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${offer.title || 'offer'} up`} className="sag-btn-outline h-9 w-9 px-0 disabled:opacity-40"><ArrowUp className="w-4 h-4" /></button>
                        <button type="button" onClick={() => move(index, 1)} disabled={index === form.offers.length - 1} aria-label={`Move ${offer.title || 'offer'} down`} className="sag-btn-outline h-9 w-9 px-0 disabled:opacity-40"><ArrowDown className="w-4 h-4" /></button>
                        <button type="button" onClick={() => { if (window.confirm(`Remove "${offer.title || 'this offer'}" from the list? The coupon itself stays.`)) remove(offer.id); }} aria-label={`Remove ${offer.title || 'offer'}`} className="sag-btn-outline h-9 w-9 px-0 text-danger"><Trash2 className="w-4 h-4" /></button>
                      </span>
                    </div>
                    <p className={`${kit.hint} sag-num ${state.tone === 'warn' ? 'text-danger!' : ''}`}>{state.detail}</p>

                    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[168px_1fr]">
                      <div>
                        <img src={photo} alt="" width={168} height={105} className={`w-full rounded-[16px] border border-line md:w-[168px] ${offer.imageUrl ? 'h-auto' : 'aspect-[16/10] object-cover'}`} />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <label className={`sag-btn-outline h-9 cursor-pointer gap-1.5 px-3 text-xs ${uploadingId ? 'pointer-events-none opacity-60' : ''}`}>
                            {uploadingId === offer.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                            {offer.imageUrl ? 'Change photo' : 'Upload photo'}
                            <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(offer.id, e)} disabled={Boolean(uploadingId)} />
                          </label>
                          {offer.imageUrl && <button type="button" onClick={() => change(offer.id, { imageUrl: '' })} className="sag-link text-xs">Use the diya photo</button>}
                        </div>
                        <p className={`mt-1.5 text-xs leading-4 text-ink-muted`}>{offer.imageUrl ? 'Your photo.' : 'The store\'s diya photo.'} Your photo is shown whole, never cut. A wide photo (about 2 wide to 1 high) looks best. Use a real photo you are allowed to use.</p>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label>
                            <span className="sag-label">Offer name</span>
                            <input type="text" maxLength={60} value={offer.title} onChange={(e) => change(offer.id, { title: e.target.value })} placeholder="Diwali Sale" className="sag-input" />
                          </label>
                          <label>
                            <span className="sag-label">Small label above the name</span>
                            <input type="text" maxLength={40} value={offer.eyebrow} onChange={(e) => change(offer.id, { eyebrow: e.target.value })} placeholder={DEFAULT_EYEBROW} className="sag-input" />
                          </label>
                        </div>
                        <label className="block">
                          <span className="sag-label">Coupon this offer runs on</span>
                          <select value={offer.couponCode} onChange={(e) => change(offer.id, { couponCode: e.target.value })} className="sag-input sag-num">
                            <option value="">Choose a coupon</option>
                            {offer.couponCode && !liveCodes.some((c) => String(c.code).trim().toUpperCase() === offer.couponCode) && <option value={offer.couponCode}>{offer.couponCode} (not in Coupons)</option>}
                            {liveCodes.map((coupon) => {
                              const code = String(coupon.code).trim().toUpperCase();
                              const end = String(coupon.expiryDate || '').slice(0, 10);
                              return <option key={coupon.id} value={code}>{code} · {coupon.discountType === 'fixed' ? `${rupees(Number(coupon.discountValue) || 0)} off` : `${Number(coupon.discountValue) || 0}% off`}{end ? ` · till ${niceDate(end)}` : ''}{coupon.isActive === false ? ' · off' : ''}</option>;
                            })}
                          </select>
                        </label>
                        <CheckRow
                          label="This offer is switched on"
                          hint="Off keeps the offer here for next year without showing it."
                          checked={offer.enabled}
                          onChange={(enabled) => change(offer.id, { enabled })}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <p className={`mt-4 ${kit.hint}`}>
            A new festival? First make its coupon in <span className="font-semibold text-ink">Coupons</span> (in the menu, under Offers) with a start date and a last day, then come back and add the offer here.
          </p>
        </Panel>

        <SaveBar note={!loaded ? 'Loading the saved offers…' : unsaved ? 'You have changes that are not saved yet.' : 'Everything here is saved.'}>
          <button type="submit" disabled={saving || !loaded || Boolean(uploadingId)} className={kit.primary}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />}
            <span>{saving ? 'Saving…' : 'Save'}</span>
          </button>
        </SaveBar>
      </form>
    </div>
  );
};
