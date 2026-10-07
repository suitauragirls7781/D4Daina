import React from 'react';
import { Check, ChevronRight, Lock } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { WhatsAppIcon } from './BrandIcons';
import { LockIcon, ReturnIcon, TruckIcon } from './StoreIcons';

export type AssuranceGateway = 'razorpay' | 'payu';
const GATEWAY_NAME: Record<AssuranceGateway, string> = { razorpay: 'Razorpay', payu: 'PayU' };

/**
 * The four facts the store stands behind, worded in ONE place so they read the same on every page.
 * They are true today: payment is by UPI (in full, or the advance of a cash on delivery order when the owner has that on), returns and exchange within 7 days,
 * delivery across India, help on WhatsApp. Do not add a claim here that the owner has not confirmed.
 * The gateway name is shown only when the caller knows which gateway is active (the pay step does).
 */
export const assuranceFacts = (gateway?: AssuranceGateway) => ({
  payment: `Secure UPI payment${gateway ? ` (${GATEWAY_NAME[gateway]})` : ''}`,
  returns: '7-day returns & exchange',
  delivery: 'Delivery across India',
  help: 'Questions? Chat with us on WhatsApp',
});

/** Short form for the line above a buy, checkout or pay button. */
export const assuranceLine = (gateway?: AssuranceGateway) =>
  gateway ? `Secure payment by ${GATEWAY_NAME[gateway]} · 7-day returns & exchange` : 'Secure online payment · 7-day returns & exchange';

/**
 * "How your order works": three numbered steps on a white card. All three are true today: payment is online
 * only (UPI), the order email goes out once the payment is verified, and every order is tracked in the account.
 * The gateway is named only when the caller knows which one is active.
 */
export const HowOrderWorks: React.FC<{ gateway?: AssuranceGateway; className?: string }> = ({ gateway, className = '' }) => {
  const steps: Array<[string, string]> = [
    ['Pay by UPI', `Google Pay, PhonePe, Paytm or any UPI app.${gateway ? ` Payment is handled by ${GATEWAY_NAME[gateway]}.` : ''}`],
    ['Order confirmed at once', 'The receipt comes to your email.'],
    ['Track it here', 'Every step shows in My orders.'],
  ];
  return (
    <div className={`sag-card p-4 ${className}`}>
      <h3 className="font-sans text-[15px] font-bold leading-5 text-ink">How your order works</h3>
      <ol className="mt-2">
        {steps.map(([title, text], index) => (
          <li key={title} className="flex items-start gap-2.5 py-1.5">
            <span aria-hidden="true" className="sag-num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-peach text-[13px] font-bold text-sale">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold leading-[18px] text-ink">{title}</span>
              <span className="block text-[13px] leading-[18px] text-ink-muted">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};

interface AssuranceProps {
  /** full = the four rows in a tinted block; line = one small line with a lock; grid = the home trust block (dark rows on phones and tablets, round badges on desktop). */
  variant?: 'full' | 'line' | 'grid';
  gateway?: AssuranceGateway;
  /** Text for the WhatsApp message, so the store knows which page the shopper wrote from. */
  whatsappMessage?: string;
  /** Use on a dark surface (footer). */
  onDark?: boolean;
  className?: string;
}

export const Assurance: React.FC<AssuranceProps> = ({ variant = 'full', gateway, whatsappMessage = 'Hi Suit Aura Girls! I have a question.', onDark = false, className = '' }) => {
  const { setActivePage } = useShop();
  const facts = assuranceFacts(gateway);

  if (variant === 'line') {
    return (
      <p className={`flex items-center justify-center gap-1.5 text-xs leading-4 ${onDark ? 'text-on-dark-muted' : 'text-ink-muted'} ${className}`}>
        <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{assuranceLine(gateway)}</span>
      </p>
    );
  }

  const open = (page: 'return-policy' | 'shipping-policy') => { setActivePage(page); window.scrollTo(0, 0); };
  const rows: Array<{ key: string; icon: React.ReactNode; text: string; onClick?: () => void; href?: string }> = [
    { key: 'payment', icon: <LockIcon className="w-5 h-5" mono />, text: facts.payment },
    { key: 'returns', icon: <ReturnIcon className="w-5 h-5" mono />, text: facts.returns, onClick: () => open('return-policy') },
    { key: 'delivery', icon: <TruckIcon className="w-5 h-5" mono />, text: facts.delivery, onClick: () => open('shipping-policy') },
    { key: 'help', icon: <WhatsAppIcon className="w-5 h-5" />, text: facts.help, href: createSupportWhatsAppUrl(whatsappMessage) },
  ];

  if (variant === 'grid') {
    // Desktop: round badges, four white circles on a pale block, each with a thin ring that turns slowly
    const badge = `flex w-full flex-col items-center rounded-control px-0.5 text-center ${onDark ? 'text-on-dark' : 'text-ink'}`;
    const body = (row: (typeof rows)[number], index: number) => (
      <>
        <span className={`sag-ring ${index % 2 ? 'sag-ring-reverse' : ''} mb-1.5 flex h-[42px] w-[42px] sm:h-[52px] sm:w-[52px] shrink-0 items-center justify-center rounded-full bg-white text-brand`}>{row.icon}</span>
        <span className="block text-[11px] sm:text-[13px] font-bold leading-[1.25]">{row.key === 'help' ? 'Chat with us on WhatsApp' : row.text}</span>
      </>
    );
    // Phones and tablets (owner's pick 2): one dark block, each fact a row with a gold icon circle and a tick.
    // Desktop keeps the round badges above.
    const line = 'flex w-full items-center gap-2.5 rounded-control py-1.5 text-left text-on-dark';
    const lineBody = (row: (typeof rows)[number]) => (
      <>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sun text-ink">{row.icon}</span>
        <span className="min-w-0 flex-1 text-[13.5px] font-bold leading-[18px]">{row.text}</span>
        <Check className="h-[17px] w-[17px] shrink-0 text-highlight" strokeWidth={2.25} aria-hidden="true" />
      </>
    );
    return (
      <>
        <ul className={`rounded-[28px] bg-dark px-4 py-2.5 text-on-dark lg:hidden ${className}`}>
          {rows.map((row) => (
            <li key={row.key}>
              {row.href ? (
                <a href={row.href} target="_blank" rel="noopener noreferrer" className={line}>{lineBody(row)}</a>
              ) : row.onClick ? (
                <button type="button" onClick={row.onClick} className={`${line} cursor-pointer`}>{lineBody(row)}</button>
              ) : (
                <div className={line}>{lineBody(row)}</div>
              )}
            </li>
          ))}
        </ul>
        <ul className={`hidden lg:grid grid-cols-4 gap-x-1 rounded-[24px] px-2 pt-5 pb-4 ${onDark ? 'bg-white/10' : 'bg-lilac'} ${className}`}>
          {rows.map((row, index) => (
            <li key={row.key} className="flex">
              {row.href ? (
                <a href={row.href} target="_blank" rel="noopener noreferrer" className={badge}>{body(row, index)}</a>
              ) : row.onClick ? (
                <button type="button" onClick={row.onClick} className={`${badge} cursor-pointer`}>{body(row, index)}</button>
              ) : (
                <span className={badge}>{body(row, index)}</span>
              )}
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className={`rounded-card border border-brand-line bg-brand-wash px-4 ${className}`}>
      {rows.map((row) => {
        const inner = (
          <>
            <span className="shrink-0 flex text-brand">{row.icon}</span>
            <span className="flex-1 min-w-0">{row.text}</span>
            {(row.onClick || row.href) && <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />}
          </>
        );
        if (row.href) return <a key={row.key} href={row.href} target="_blank" rel="noopener noreferrer" className="sag-row border-brand-line">{inner}</a>;
        if (row.onClick) return <button key={row.key} type="button" onClick={row.onClick} className="sag-row border-brand-line w-full text-left cursor-pointer">{inner}</button>;
        return <div key={row.key} className="sag-row border-brand-line">{inner}</div>;
      })}
    </div>
  );
};
