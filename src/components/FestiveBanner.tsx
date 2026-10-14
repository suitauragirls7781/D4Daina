import React, { useEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { getCleanImageUrl } from '../utils/imageHelper';
import { Icon, Odometer } from '../aura';

// Festive month (owner, 2026-10-07; Dussehra replaced by Navratri on 2026-10-08): one sale in two rounds,
// Navratri (till 20 Oct) and Diwali (21 Oct to 8 Nov).
// Each round is a real coupon made in Admin → Coupons. The banner is drawn only while that coupon exists, is
// switched on and today is inside its dates, and every number on it (percent, cap, minimum, last day, the online
// payment percent) is read from the coupon and the store's settings. Outside the dates nothing is shown.

//
// The offers themselves are the owner's list in Admin → Special DOD (storefront_settings/specialDod): each has a
// name, a small label, a coupon and an optional photo. Until that page has been saved once, the two rounds
// below are used.

type Round = { code: string; title: string; eyebrow: string; imageUrl: string };
export const DEFAULT_EYEBROW = 'Festive month';
export const DEFAULT_ROUNDS: Round[] = [
  { code: 'NAVRATRI', title: 'Navratri Sale', eyebrow: DEFAULT_EYEBROW, imageUrl: '' },
  { code: 'DIWALI', title: 'Diwali Sale', eyebrow: DEFAULT_EYEBROW, imageUrl: '' },
];

// The banner's photo: diyas being lit. "Lighting Lamps!" by Framedtwinkles, Wikimedia Commons, CC0 (free for any use).
const PHOTO = { src: '/festive/diyas.webp', small: '/festive/diyas-560.webp', alt: 'Diyas being lit for the festival' };

// Today's date in India as YYYY-MM-DD (coupon dates are saved as plain dates)
const todayInIndia = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
const rupees = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

/** The festive round that is live right now, with the coupon it runs on; null when none is. */
export const useFestiveRound = () => {
  const { coupons, storeOffers, specialDod } = useShop();
  const today = todayInIndia();
  // The owner's list, in the owner's order: the first offer whose coupon is live today is the one shown
  const rounds: Round[] = specialDod
    ? (specialDod.enabled ? specialDod.offers : []).filter((offer) => offer.enabled !== false && offer.couponCode && offer.title).map((offer) => ({
      code: String(offer.couponCode).trim().toUpperCase(),
      title: offer.title,
      eyebrow: offer.eyebrow || DEFAULT_EYEBROW,
      imageUrl: offer.imageUrl || '',
    }))
    : DEFAULT_ROUNDS;
  for (const round of rounds) {
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
export const useTimeLeft = (endsAt: number | null) => {
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

/**
 * `full` is one big round ink block on the homepage: the real festive photo on top with round corners
 * (nothing is written on it), then the label, the big title, the offer, a live countdown to the coupon's real
 * last day as four boxes whose digits roll, and the two buttons. On desktop the photo sits at the right.
 * `strip` is one slim white card for the shop page and the bag.
 * (The announcement line under the header reads the same round, in Header.)
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
  const copyIcon = copied ? <Icon name="check" draw className="in" strokeWidth={2.2} /> : <Icon name="copy" />;
  const spoken = left ? `Offer ends in ${left.days} days, ${left.hours} hours and ${left.minutes} minutes` : undefined;

  if (variant === 'strip') {
    return (
      <aside id="festive-strip" aria-label={round.title} className={`aura-card aura-lt flex items-center gap-3 py-3 pl-5 pr-3 text-ink ${className}`}>
        <p className="min-w-0 flex-1 text-[13px] leading-[18px]">
          <span className="block text-[14.5px] font-bold leading-5">{round.title}: {round.offer.toLowerCase()} with code <span className="text-sale">{round.code}</span></span>
          <span className="aura-num block text-ink-muted">{[round.terms, ends].filter(Boolean).join(' · ')}</span>
          {left && (
            <span role="timer" aria-label={spoken} className="aura-num block font-bold text-sale">
              {left.days}d {two(left.hours)}h {two(left.minutes)}m {two(left.seconds)}s
            </span>
          )}
        </p>
        <button type="button" onClick={copy} aria-label={`Copy code ${round.code}`} className="aura-btn aura-btn-line aura-btn-sm aura-num shrink-0 gap-1.5 px-4">
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
    <section id="festive-banner" aria-labelledby="festive-banner-title" className={`hm-fest aura-blk clay-t-deep ${className}`}>
      {round.imageUrl ? (
        // The owner's own photo (often a banner with words on it): shown whole at its own shape, never cut and
        // never moving. On desktop it sits at the right, centred beside the words.
        <div className="hm-fest-ph hm-fest-own">
          <img
            src={getCleanImageUrl(round.imageUrl, 1100)}
            srcSet={`${getCleanImageUrl(round.imageUrl, 640)} 640w, ${getCleanImageUrl(round.imageUrl, 1100)} 1100w`}
            sizes="(min-width: 1024px) 560px, 96vw"
            alt={round.title}
            decoding="async"
            className="block h-auto w-full"
          />
        </div>
      ) : (
        <div className="hm-fest-ph">
          <img
            src={PHOTO.src}
            srcSet={`${PHOTO.small} 560w, ${PHOTO.src} 1000w`}
            sizes="(min-width: 1024px) 560px, 96vw"
            alt={PHOTO.alt}
            width={1000}
            height={544}
            decoding="async"
            className="sag-drift h-[170px] w-full object-cover sm:h-[240px] lg:h-full lg:min-h-[400px]"
          />
        </div>
      )}

      <div className="min-w-0 flex-1 px-4 pb-6 pt-7 sm:p-9 lg:self-center lg:p-12">
        <p className="aura-lbl">{round.eyebrow}</p>
        <h2 id="festive-banner-title" className="aura-h2 aura-h-lg mt-3">{round.title}</h2>
        <p className="aura-num mt-5 text-[17px] font-semibold leading-6 lg:text-[19px]">
          {round.offer} with code <span className="aura-ac font-extrabold">{round.code}</span>
        </p>
        <ul className="aura-num aura-mu mt-1 space-y-0.5 text-[14px] leading-5">
          {round.terms && <li className="first-letter:uppercase">{round.terms}</li>}
          {round.prepaidPercent > 0 && <li>Plus {round.prepaidPercent}% off when you pay online</li>}
        </ul>

        <p className="aura-lbl aura-num mt-6">{left ? `Offer ends ${round.lastDay}` : ends}</p>
        {/* The clock is drawn only in the browser, after mounting; its space is kept so the panel does not jump */}
        <div role="timer" aria-label={spoken} className="mt-3 flex min-h-[76px] gap-2 lg:max-w-[360px]">
          {boxes.map(([label, value]) => (
            <div key={label} aria-hidden="true" className="hm-ck flex min-w-0 flex-1 flex-col items-center rounded-[18px] pb-2.5 pt-3">
              <Odometer value={value} roll={false} className="text-[28px] font-extrabold" />
              <span className="aura-mu mt-0.5 text-[13px] leading-4">{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-2.5 lg:mt-8">
          <button type="button" onClick={() => { setActivePage('shop'); window.scrollTo(0, 0); }} className="aura-btn min-w-0 flex-1 px-5 sm:flex-none sm:px-9">
            Shop the sale
          </button>
          <button type="button" onClick={copy} aria-label={`Copy code ${round.code}`} className="aura-btn aura-btn-line aura-num min-w-0 flex-1 gap-2 px-5 sm:flex-none sm:px-8">
            {copyIcon}
            {copyLabel}
          </button>
        </div>
      </div>
    </section>
  );
};
