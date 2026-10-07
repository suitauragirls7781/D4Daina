import React, { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useShop } from '../context/ShopContext';

// Festive month (owner, 2026-10-07): one sale in two rounds, Dussehra (till 20 Oct) and Diwali (21 Oct to 8 Nov).
// Each round is a real coupon made in Admin → Coupons. The banner is drawn only while that coupon exists, is
// switched on and today is inside its dates, and every number on it (percent, cap, minimum, last day, the online
// payment percent) is read from the coupon and the store's settings. Outside the dates nothing is shown.

type FestiveScene = 'dussehra' | 'diwali';
const ROUNDS: { code: string; title: string; scene: FestiveScene }[] = [
  { code: 'DUSSEHRA', title: 'Dussehra Dhamaka', scene: 'dussehra' },
  { code: 'DIWALI', title: 'Diwali Sale', scene: 'diwali' },
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

// A flame as a teardrop standing on (x, y), h tall and 2w wide
const flame = (x: number, y: number, h: number, w: number) =>
  `M${x} ${y - h}C${x + w * 0.5} ${y - h * 0.6} ${x + w} ${y - h * 0.35} ${x + w} ${y - h * 0.18}C${x + w} ${y + h * 0.06} ${x - w} ${y + h * 0.06} ${x - w} ${y - h * 0.18}C${x - w} ${y - h * 0.35} ${x - w * 0.5} ${y - h * 0.6} ${x} ${y - h}Z`;
const Flame: React.FC<{ x: number; y: number; h: number; w: number; delay?: number; opacity?: number }> = ({ x, y, h, w, delay = 0, opacity = 1 }) => (
  <path className="sag-flame" style={{ animationDelay: `${delay}ms` }} d={flame(x, y, h, w)} fill="currentColor" fillOpacity={opacity} />
);

// Ravan's nine smaller heads: five to the left and four to the right of the large crowned one
const SIDE_HEADS = [236, 226, 216, 206, 196, 264, 274, 284, 294];

/** Dussehra: Ram with a drawn bow on the left, the arrow, and the ten-headed effigy that catches fire (Ravan Dahan). */
const DussehraScene: React.FC = () => (
  <svg viewBox="0 0 320 140" className="h-auto w-full" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {/* Ground */}
    <path d="M6 129H314" strokeWidth="1" strokeOpacity="0.5" />

    {/* Ram: a plain silhouette with a crown, standing, the bow drawn */}
    <g fill="currentColor" stroke="none">
      <path d="M33 43L34.5 35L38 27L41.5 35L43 43Z" />
      <circle cx="38" cy="48" r="6" />
      <path d="M31 57Q38 54 45 57L43.5 91H32.5Z" />
      <path d="M32.5 90H43.5L48 129H40.5L38 102L35.5 129H28Z" />
    </g>
    <path d="M43 62L64 66" strokeWidth="4" />
    <path d="M34 61L23 68L46 66" strokeWidth="3.5" />
    <path d="M60 36Q79 66 60 96" strokeWidth="2.5" />
    <path d="M60 36L46 66L60 96" strokeWidth="0.9" />
    {/* The arrow on the string, and the one that flies */}
    <g>
      <path d="M46 66H84" strokeWidth="1.4" />
      <path d="M90 66L82 62.8V69.2Z" fill="currentColor" stroke="none" />
    </g>
    <g className="sag-arrow" style={{ '--sag-arrow-travel': '142px' } as React.CSSProperties}>
      <path d="M46 66H84" strokeWidth="1.4" />
      <path d="M90 66L82 62.8V69.2Z" fill="currentColor" stroke="none" />
      <path d="M46 66L42 63M46 66L42 69" strokeWidth="1" />
    </g>

    {/* The effigy: ten heads in a row, the middle one larger and crowned, shoulders, arms and a tall body */}
    <g strokeWidth="1.3" fill="currentColor" fillOpacity="0.16">
      {SIDE_HEADS.map((x) => (
        <g key={x}>
          <circle cx={x} cy="43" r="4.5" />
          <path d={`M${x - 3.5} 38L${x} 32L${x + 3.5} 38`} fill="none" />
        </g>
      ))}
      <path d="M192 50H299V55H192Z" />
      <path d="M232 55H268L262 112H238Z" />
      <path d="M238 112L230 129H270L262 112" />
      <path d="M232 60L210 84L214 88L233 70" />
      <path d="M268 60L290 84L286 88L267 70" />
      <circle cx="250" cy="38" r="9.5" fillOpacity="0.3" />
      <path d="M241 31L243 20L247 26L250 16L253 26L257 20L259 31Z" fillOpacity="0.3" />
      <path d="M244 68H256M242 80H258M241 92H259" fill="none" strokeWidth="0.9" strokeOpacity="0.7" />
    </g>

    {/* The fire that is always at the foot of the effigy */}
    <g stroke="none">
      <Flame x={226} y={129} h={16} w={5} />
      <Flame x={238} y={129} h={22} w={6} delay={300} />
      <Flame x={250} y={129} h={27} w={7} delay={700} />
      <Flame x={262} y={129} h={21} w={6} delay={150} />
      <Flame x={274} y={129} h={15} w={5} delay={900} />
    </g>
    {/* The blaze that rises after the arrow lands */}
    <g className="sag-ember" stroke="none">
      <Flame x={232} y={129} h={46} w={10} opacity={0.55} delay={200} />
      <Flame x={250} y={129} h={64} w={12} opacity={0.5} delay={500} />
      <Flame x={268} y={129} h={44} w={10} opacity={0.55} />
      <Flame x={212} y={90} h={14} w={4} opacity={0.8} delay={400} />
      <Flame x={288} y={90} h={14} w={4} opacity={0.8} delay={800} />
      <Flame x={206} y={36} h={9} w={3} opacity={0.8} delay={100} />
      <Flame x={250} y={15} h={11} w={3.5} opacity={0.85} delay={600} />
      <Flame x={284} y={36} h={9} w={3} opacity={0.8} delay={350} />
      <g fill="currentColor">
        <circle cx="222" cy="24" r="1.1" /><circle cx="272" cy="18" r="1.1" /><circle cx="300" cy="66" r="1" />
        <circle cx="200" cy="70" r="1" /><circle cx="238" cy="8" r="0.9" /><circle cx="296" cy="26" r="0.9" />
      </g>
    </g>
  </svg>
);

/** Diwali: three diyas with their flames and a few still sparkles. */
const DiwaliScene: React.FC = () => (
  <svg viewBox="0 0 320 140" className="h-auto w-full" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M20 127H300" strokeWidth="1" strokeOpacity="0.5" />
    {[{ x: 70, s: 0.82 }, { x: 160, s: 1 }, { x: 250, s: 0.82 }].map(({ x, s }, index) => (
      <g key={x} stroke="none" fill="currentColor">
        <path d={`M${x - 34 * s} ${126 - 22 * s}Q${x} ${126 - 14 * s} ${x + 40 * s} ${126 - 26 * s}Q${x + 30 * s} 126 ${x} 126Q${x - 28 * s} 126 ${x - 34 * s} ${126 - 22 * s}Z`} />
        <Flame x={x + 36 * s} y={126 - 27 * s} h={32 * s} w={7 * s} delay={index * 350} />
      </g>
    ))}
    <g fill="currentColor" stroke="none" fillOpacity="0.8">
      <circle cx="30" cy="40" r="1.6" /><circle cx="112" cy="22" r="1.3" /><circle cx="116" cy="70" r="1.1" />
      <circle cx="206" cy="30" r="1.5" /><circle cx="210" cy="78" r="1.1" /><circle cx="300" cy="96" r="1.3" />
      <circle cx="160" cy="12" r="1.2" /><circle cx="56" cy="16" r="1" /><circle cx="244" cy="14" r="1" />
    </g>
  </svg>
);

// Focus ring that reads on the dark panel
const ON_DARK_FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark';

/**
 * `full` is a dark panel with a thin champagne double frame on the homepage: the offer, a live countdown to the
 * coupon's real last day, the two buttons and the festive scene. `strip` is one slim dark row for the shop page
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

      <div className="relative mx-auto mb-4 w-full max-w-[280px] text-highlight lg:order-2 lg:mb-0 lg:w-[320px] lg:max-w-none lg:shrink-0">
        {round.scene === 'dussehra' ? <DussehraScene /> : <DiwaliScene />}
        <span className="sr-only">{round.scene === 'dussehra' ? 'Dussehra: Ravan Dahan' : 'Diwali: three lit diyas'}</span>
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
