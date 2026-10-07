import React, { useState } from 'react';
import { Check, Copy, Sparkles } from 'lucide-react';
import { useShop } from '../context/ShopContext';

// Festive month (owner, 2026-10-07): one sale in two rounds, Dussehra (till 20 Oct) and Diwali (21 Oct to 8 Nov).
// Each round is a real coupon made in Admin → Coupons. The banner is drawn only while that coupon exists, is
// switched on and today is inside its dates, and every number on it (percent, cap, minimum, last day, the online
// payment percent) is read from the coupon and the store's settings. Outside the dates nothing is shown.

const ROUNDS = [
  { code: 'DUSSEHRA', title: 'Dussehra Dhamaka' },
  { code: 'DIWALI', title: 'Diwali Sale' },
];

// Today's date in India as YYYY-MM-DD (coupon dates are saved as plain dates)
const todayInIndia = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
const rupees = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

/** The festive round that is live right now, with the coupon it runs on; null when none is. */
export const useFestiveRound = () => {
  const { coupons, storeOffers } = useShop();
  const today = todayInIndia();
  for (const round of ROUNDS) {
    const coupon = coupons.find((c) => String(c.code || '').trim().toUpperCase() === round.code);
    if (!coupon || coupon.isActive === false) continue;
    const start = String(coupon.startDate || '').slice(0, 10);
    const end = String(coupon.expiryDate || '').slice(0, 10);
    if (!end || (start && today < start) || today > end) continue;
    if (Number(coupon.usageLimit) > 0 && Number(coupon.usageCount) >= Number(coupon.usageLimit)) continue;
    const value = Number(coupon.discountValue) || 0;
    if (value <= 0) continue;
    const daysLeft = dayNumber(end) - dayNumber(today);
    const lastDay = new Date(`${end}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const offer = coupon.discountType === 'fixed' ? `${rupees(value)} off` : `Extra ${value}% off`;
    const terms = [
      coupon.discountType !== 'fixed' && Number(coupon.maxDiscount) > 0 ? `up to ${rupees(Number(coupon.maxDiscount))}` : '',
      Number(coupon.minOrderValue) > 0 ? `on orders above ${rupees(Number(coupon.minOrderValue))}` : '',
    ].filter(Boolean).join(' ');
    return { ...round, offer, terms, lastDay, daysLeft, prepaidPercent: storeOffers.prepaidPercent };
  }
  return null;
};

/**
 * `full` is the dark block on the homepage; `strip` is one slim pale gold row for the shop page and the bag.
 */
export const FestiveBanner: React.FC<{ variant?: 'full' | 'strip'; className?: string }> = ({ variant = 'full', className = '' }) => {
  const { setActivePage } = useShop();
  const round = useFestiveRound();
  const [copied, setCopied] = useState(false);
  if (!round) return null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(round.code); } catch { /* the code is still readable on the button */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const ends = round.daysLeft <= 0 ? 'Ends today' : round.daysLeft === 1 ? `Ends tomorrow, ${round.lastDay}` : `Till ${round.lastDay} · ${round.daysLeft} days left`;
  const copyLabel = copied ? 'Copied' : round.code;

  if (variant === 'strip') {
    return (
      <aside id="festive-strip" aria-label={round.title} className={`flex items-center gap-2.5 rounded-card bg-peach p-2.5 text-ink ${className}`}>
        <Sparkles className="h-5 w-5 shrink-0 text-peach-ink" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[13px] leading-[18px]">
          <span className="block text-sm leading-5 font-bold">{round.title}: {round.offer.toLowerCase()} with code {round.code}</span>
          <span className="sag-num block text-peach-ink">{[round.terms, ends].filter(Boolean).join(' · ')}</span>
        </p>
        <button type="button" onClick={copy} aria-label={`Copy code ${round.code}`} className="sag-num inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-dark px-3.5 text-[13px] font-bold tracking-wide text-on-dark cursor-pointer">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copyLabel}
        </button>
      </aside>
    );
  }

  return (
    <section id="festive-banner" aria-labelledby="festive-banner-title" className={`rounded-sheet bg-dark p-4 text-on-dark sm:p-6 lg:flex lg:items-center lg:gap-8 lg:p-8 ${className}`}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] leading-4 font-extrabold uppercase tracking-[0.1em] text-highlight">
          <Sparkles className="h-4 w-4" aria-hidden="true" /> Festive month
        </p>
        <h2 id="festive-banner-title" className="mt-1.5 font-display text-[26px] leading-[1.15] font-bold text-on-dark sm:text-[32px]">{round.title}</h2>
        <p className="sag-num mt-2 text-[17px] leading-6 font-bold text-on-dark">
          {round.offer} with code <span className="text-highlight">{round.code}</span>
        </p>
        <ul className="sag-num mt-1.5 space-y-0.5 text-sm leading-5 text-on-dark-muted">
          {round.terms && <li className="first-letter:uppercase">{round.terms}</li>}
          {round.prepaidPercent > 0 && <li>Plus {round.prepaidPercent}% off when you pay online</li>}
          <li className="font-bold text-highlight">{ends}</li>
        </ul>
      </div>
      <div className="mt-4 flex gap-2.5 lg:mt-0 lg:w-[320px] lg:shrink-0 lg:flex-col">
        <button type="button" onClick={() => { setActivePage('shop'); window.scrollTo(0, 0); }} className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-sun px-4 text-[15px] font-bold text-ink cursor-pointer lg:flex-none focus-visible:outline-white">
          Shop the sale
        </button>
        <button type="button" onClick={copy} aria-label={`Copy code ${round.code}`} className="sag-num inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed border-highlight px-4 text-[15px] font-bold tracking-wide text-on-dark cursor-pointer lg:flex-none focus-visible:outline-white">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copyLabel}
        </button>
      </div>
    </section>
  );
};
