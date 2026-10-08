import React, { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useShop } from '../context/ShopContext';

// Festive month (owner, 2026-10-07; Dussehra replaced by Navratri on 2026-10-08): one sale in two rounds,
// Navratri (till 20 Oct) and Diwali (21 Oct to 8 Nov).
// Each round is a real coupon made in Admin → Coupons. The banner is drawn only while that coupon exists, is
// switched on and today is inside its dates, and every number on it (percent, cap, minimum, last day, the online
// payment percent) is read from the coupon and the store's settings. Outside the dates nothing is shown.

const ROUNDS: { code: string; title: string }[] = [
  { code: 'NAVRATRI', title: 'Navratri Sale' },
  { code: 'DIWALI', title: 'Diwali Sale' },
];

// The banner's photo: diyas being lit. "Lighting Lamps!" by Framedtwinkles, Wikimedia Commons, CC0 (free for any use).
const PHOTO = { src: '/festive/diyas.webp', small: '/festive/diyas-560.webp', alt: 'Diyas being lit for the festival' };

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
    // The offer ends with the coupon's last day in India; the countdown runs to this moment and never restarts
    const endsAt = Date.parse(`${end}T23:59:59+05:30`);
    return { ...round, offer, terms, lastDay, daysLeft, endsAt, prepaidPercent: storeOffers.prepaidPercent };
  }
  return null;
};

/** Time left to `endsAt`, updated every second. null until the component has mounted. */
const useTimeLeft = (endsAt: number | null) => {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (endsAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  if (endsAt === null || now === null || !Number.isFinite(endsAt)) return null;
  const total = Math.max(0, Math.floor((endsAt - now) / 1000));
  return {
    over: endsAt <= now,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
};
const two = (value: number) => String(value).padStart(2, '0');

// Focus ring that reads on the dark panel
const ON_DARK_FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark';

/**
 * `full` is a dark panel with a thin champagne double frame on the homepage: the offer, a live countdown to the
 * coupon's real last day, the two buttons and a real festive photo (nothing is written on the photo). `strip` is one slim dark row for the shop page
 * and the bag. (The thin dark line above the header reads the same round, in Header.)
 */
export const FestiveBanner: React.FC<{ variant?: 'full' | 'strip'; className?: string }> = ({ variant = 'full', className = '' }) => {
  const { setActivePage } = useShop();
  const round = useFestiveRound();
  const [copied, setCopied] = useState(false);
  const left = useTimeLeft(round ? round.endsAt : null);
  if (!round || left?.over) return null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(round.code); } catch { /* the code is still readable on the button */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const ends = round.daysLeft <= 0 ? 'Ends today' : round.daysLeft === 1 ? `Ends tomorrow, ${round.lastDay}` : `Till ${round.lastDay}`;
  const copyLabel = copied ? 'Copied' : round.code;
  const copyIcon = copied ? <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" /> : <Copy className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />;
  const spoken = left ? `Offer ends in ${left.days} days, ${left.hours} hours and ${left.minutes} minutes` : undefined;

  if (variant === 'strip') {
    return (
      <aside id="festive-strip" aria-label={round.title} className={`flex items-center gap-3 bg-dark px-3 py-2.5 text-on-dark ${className}`}>
        <p className="min-w-0 flex-1 text-[12.5px] leading-[18px]">
          <span className="block text-[13.5px] leading-5 font-medium">{round.title}: {round.offer.toLowerCase()} with code <span className="text-highlight">{round.code}</span></span>
          <span className="sag-num block text-on-dark-muted">{[round.terms, ends].filter(Boolean).join(' · ')}</span>
          {left && (
            <span role="timer" aria-label={spoken} className="sag-num block font-semibold text-highlight">
              {left.days}d {two(left.hours)}h {two(left.minutes)}m {two(left.seconds)}s
            </span>
          )}
        </p>
        <button type="button" onClick={copy} aria-label={`Copy code ${round.code}`} className={`sag-sheen sag-num inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 border border-highlight px-3 text-[13px] font-semibold tracking-[0.04em] text-highlight ${ON_DARK_FOCUS}`}>
          {copyIcon}
          {copyLabel}
        </button>
      </aside>
    );
  }

  const boxes: [string, string][] = left
    ? [['Days', two(left.days)], ['Hours', two(left.hours)], ['Min', two(left.minutes)], ['Sec', two(left.seconds)]]
    : [];

  return (
    <section id="festive-banner" aria-labelledby="festive-banner-title" className={`relative border border-highlight/60 bg-dark p-5 text-on-dark sm:p-8 lg:flex lg:items-center lg:gap-10 lg:p-10 ${className}`}>
      <div className="pointer-events-none absolute inset-1.5 border border-highlight/60" aria-hidden="true" />

      <div className="relative mb-5 overflow-hidden lg:order-2 lg:mb-0 lg:w-[440px] lg:shrink-0">
        <img
          src={PHOTO.src}
          srcSet={`${PHOTO.small} 560w, ${PHOTO.src} 1000w`}
          sizes="(min-width: 1024px) 440px, 92vw"
          alt={PHOTO.alt}
          width={1000}
          height={544}
          decoding="async"
          className="sag-drift h-[170px] w-full object-cover sm:h-[230px] lg:h-[300px]"
        />
      </div>

      <div className="relative min-w-0 flex-1">
        <p className="sag-caps text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-highlight">Festive month</p>
        <h2 id="festive-banner-title" className="mt-2 font-display text-[23px] leading-[1.18] font-medium text-on-dark sm:text-[30px]">{round.title}</h2>
        <p className="sag-num mt-2 text-[15px] leading-6 text-on-dark">
          {round.offer} with code <span className="font-semibold text-highlight">{round.code}</span>
        </p>
        <ul className="sag-num mt-1 space-y-0.5 text-[13px] leading-5 text-on-dark-muted">
          {round.terms && <li className="first-letter:uppercase">{round.terms}</li>}
          {round.prepaidPercent > 0 && <li>Plus {round.prepaidPercent}% off when you pay online</li>}
        </ul>

        <p className="sag-num mt-4 text-[11px] leading-4 font-semibold uppercase tracking-[0.14em] text-highlight">{left ? `Offer ends ${round.lastDay}` : ends}</p>
        {/* The clock is drawn only in the browser, after mounting; its space is kept so the panel does not jump */}
        <div role="timer" aria-label={spoken} className="mt-2 flex min-h-[58px] gap-2">
          {boxes.map(([label, value]) => (
            <div key={label} aria-hidden="true" className="flex w-[58px] flex-col items-center border border-highlight/40 py-2">
              <span className="sag-digit text-[20px] leading-6 font-semibold text-on-dark">{value}</span>
              <span className="mt-0.5 text-[9.5px] leading-3 font-semibold uppercase tracking-[0.14em] text-on-dark-muted">{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <button type="button" onClick={() => { setActivePage('shop'); window.scrollTo(0, 0); }} className={`inline-flex h-12 min-w-0 flex-1 cursor-pointer items-center justify-center bg-surface px-5 text-[14px] font-semibold tracking-[0.04em] text-ink sm:flex-none ${ON_DARK_FOCUS}`}>
            Shop the sale
          </button>
          <button type="button" onClick={copy} aria-label={`Copy code ${round.code}`} className={`sag-sheen sag-num inline-flex h-12 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 border border-highlight px-5 text-[14px] font-semibold tracking-[0.04em] text-highlight ${ON_DARK_FOCUS} sm:flex-none`}>
            {copyIcon}
            {copyLabel}
          </button>
        </div>
      </div>
    </section>
  );
};
