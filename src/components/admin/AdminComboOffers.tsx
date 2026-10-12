import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { useShop } from '../../context/ShopContext';
import { Gift, Loader2, Save } from 'lucide-react';
import { ComboOfferConfig } from '../../types';
import { AdminPageHeader } from './adminShared';
import { CheckRow, Panel, Pill, SaveBar, Tile, Tiles, kit } from './AdminPaymentGateways';

const DEFAULTS: ComboOfferConfig = { enabled: false, percent: 15, minItems: 2, title: 'Festive combo', subtitle: '' };

export const AdminComboOffers: React.FC = () => {
  const { showToast } = useShop();
  const [form, setForm] = useState<ComboOfferConfig>(DEFAULTS);
  // What the store has saved right now (the form above it may hold changes not saved yet)
  const [live, setLive] = useState<ComboOfferConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'storefront_settings', 'comboOffer'), (snapshot) => {
      try {
        if (snapshot.exists()) {
          const saved = { ...DEFAULTS, ...JSON.parse(snapshot.data().value_json || '{}') };
          setForm(saved);
          setLive(saved);
        }
      } catch {}
      setLoaded(true);
    }, () => setLoaded(true));
    return unsubscribe;
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.enabled && (form.percent < 1 || form.percent > 50)) {
      showToast('Discount must be between 1% and 50%.', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/admin-config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { comboOffer: form } }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Could not save the combo offer.');
      }
      showToast(form.enabled ? `Combo offer live: ${form.percent}% off ${form.minItems}+ outfits.` : 'Combo offer turned off.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not save the combo offer.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const liveOn = Boolean(live?.enabled);
  const unsaved = loaded && JSON.stringify(form) !== JSON.stringify(live || DEFAULTS);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Offers"
        title="Combo offer"
        icon={<Gift className="text-current" />}
        description="A percentage off the whole bag when a customer buys enough outfits. It is applied automatically in the bag and re-checked by the server at checkout. Accessories from Complete the look don't count towards the minimum; the % comes off the whole bag."
        actions={!loaded
          ? <Pill role="status"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</Pill>
          : <Pill role="status" tone={liveOn ? 'live' : 'off'}>{liveOn ? 'Live on the site' : 'Off'}</Pill>}
      />

      {loaded && (
        <Tiles className="lg:!grid-cols-2 max-w-2xl">
          <Tile label="On the site now" value={liveOn ? `${live?.percent}% off` : 'Off'} note={liveOn ? 'Taken off the whole bag' : 'Shoppers get no combo discount'} />
          <Tile label="Pieces needed" value={liveOn ? `${live?.minItems} or more` : '—'} note="Outfits in the bag" />
        </Tiles>
      )}

      <form onSubmit={save} className="space-y-5">
        <Panel title="Offer rules" hint="Set the discount and how many outfits a shopper must buy to get it.">
          <div className="space-y-4">
            <CheckRow
              label="Offer is live on the store"
              hint="On: the discount is applied by itself in the bag when the bag has enough outfits. Off: no combo discount."
              checked={form.enabled}
              onChange={(enabled) => setForm({ ...form, enabled })}
              onText={liveOn ? 'Live on the site' : 'Live after you save'}
              offText={liveOn ? 'Off after you save' : 'Off'}
            />

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <label>
                <span className="sag-label">Discount (%)</span>
                <input type="number" inputMode="numeric" min={1} max={50} value={form.percent} onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })} className="sag-input sag-num" />
                <span className={`mt-1.5 block ${kit.hint}`}>From 1 to 50.</span>
              </label>
              <label>
                <span className="sag-label">Minimum pieces in bag</span>
                <input type="number" inputMode="numeric" min={2} max={10} value={form.minItems} onChange={(e) => setForm({ ...form, minItems: Number(e.target.value) })} className="sag-input sag-num" />
                <span className={`mt-1.5 block ${kit.hint}`}>From 2 to 10 outfits.</span>
              </label>
            </div>

            <p className="rounded-[16px] border border-brand-line bg-brand-wash px-4 py-3 text-sm leading-5 text-ink sag-num">
              Example: with {form.percent}% and {form.minItems} pieces, two ₹1,499 suits cost ₹{Math.round(2998 * (1 - form.percent / 100)).toLocaleString('en-IN')} before any coupon.
            </p>
          </div>
        </Panel>

        <Panel title="Words shown on the site" hint="The name and the short line shoppers see with the offer.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <label>
              <span className="sag-label">Section label</span>
              <input type="text" maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="sag-input" />
            </label>
            <label>
              <span className="sag-label">Description (optional)</span>
              <input type="text" maxLength={200} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="sag-input" />
            </label>
          </div>
        </Panel>

        <SaveBar note={!loaded ? 'Loading the saved offer…' : unsaved ? 'You have changes that are not saved yet.' : 'Everything here is saved.'}>
          <button
            type="submit"
            disabled={saving || !loaded}
            className={kit.primary}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />}
            <span>{saving ? 'Saving…' : 'Save combo offer'}</span>
          </button>
        </SaveBar>
      </form>
    </div>
  );
};
