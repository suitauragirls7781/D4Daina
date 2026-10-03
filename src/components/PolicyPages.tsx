import React, { useEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { ChevronRight } from 'lucide-react';
import { SIZE_CHART } from '../utils/sizeChart';
import { SUPPORT_PHONE_DISPLAY, createSupportWhatsAppUrl } from '../utils/storeContact';
import { ActivePage } from '../types';
import { GmailIcon, WhatsAppIcon } from './BrandIcons';
import {
  HelpIcon, LockIcon, OrdersIcon, PackageIcon, PinIcon, QualityIcon, ReturnIcon, StoreIconProps, SupportIcon, TagIcon, TruckIcon, UserIcon,
} from './StoreIcons';

type IconType = React.FC<StoreIconProps>;

interface PolicySection {
  id: string;
  title: string;
  body: React.ReactNode;
}

interface KeyFact {
  icon: IconType;
  label: string;
  value: string;
}

interface PolicyWrapperProps {
  page: ActivePage;
  title: string;
  subtitle: string;
  facts?: KeyFact[];
  sections: PolicySection[];
  intro?: React.ReactNode;
}

const SUPPORT_EMAIL = 'suitauragirls@gmail.com';

const POLICY_LINKS: Array<[ActivePage, string]> = [
  ['shipping-policy', 'Shipping & delivery'],
  ['return-policy', 'Returns & exchanges'],
  ['cancellation-policy', 'Cancellation'],
  ['privacy-policy', 'Privacy'],
  ['terms-policy', 'Terms & conditions'],
  ['size-guide', 'Size guide'],
];

/* Shared text styles for policy copy */
const P = 'text-[15px] leading-[24px] text-ink';
const S: React.FC<{ children: React.ReactNode }> = ({ children }) => <strong className="font-semibold text-ink">{children}</strong>;
const List: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="space-y-2">
    {items.map((item, i) => (
      <li key={i} className={`${P} flex gap-3`}>
        <span aria-hidden="true" className="mt-[10px] w-1.5 h-1.5 rounded-full bg-ink-muted shrink-0" />
        <span className="min-w-0">{item}</span>
      </li>
    ))}
  </ul>
);
const ActionLink: React.FC<{ onClick?: () => void; href?: string; children: React.ReactNode }> = ({ onClick, href, children }) => {
  const cls = 'sag-btn-outline h-11 px-4 gap-2 text-sm';
  return href
    ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={cls}>{children}</a>
    : <button type="button" onClick={onClick} className={cls}>{children}</button>;
};

/**
 * Title band shared by the policy, About and Contact pages: breadcrumb, serif page title and one plain sentence.
 * Anything passed as children (support hours, for example) sits under the sentence.
 */
export const InfoPageHeader: React.FC<{ crumb: string; eyebrow?: string; title: string; subtitle?: React.ReactNode; children?: React.ReactNode }> = ({ crumb, eyebrow, title, subtitle, children }) => {
  const { setActivePage } = useShop();
  return (
    <div className="bg-surface border-b border-line">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-1 pb-6 lg:pt-3 lg:pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] leading-[18px] text-ink-muted -ml-2">
          <button type="button" onClick={() => setActivePage('home')} className="inline-flex items-center min-h-11 px-2 rounded-control hover:text-ink cursor-pointer">Home</button>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span aria-current="page" className="text-ink font-medium truncate px-2">{crumb}</span>
        </nav>
        {eyebrow && <p className="sag-eyebrow mt-2">{eyebrow}</p>}
        <h1 className={`font-display text-[28px] leading-8 lg:text-[40px] lg:leading-[46px] text-ink ${eyebrow ? 'mt-1' : 'mt-2'}`}>{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] leading-[22px] text-ink-muted max-w-2xl">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
};

/** "Still have a question?" card: WhatsApp, email and the contact page. Sits at the foot of the info pages. */
export const HelpCard: React.FC<{ topic: string; showContactLink?: boolean }> = ({ topic, showContactLink = true }) => {
  const { setActivePage } = useShop();
  const helpBtn = 'inline-flex items-center justify-center gap-2 h-12 px-4 rounded-control bg-surface border-[1.5px] border-control text-[15px] font-semibold text-ink hover:bg-sunken transition-colors';
  return (
    <section aria-labelledby="info-help-title" className="sag-card p-4 sm:p-6">
      <h2 id="info-help-title" className="text-[17px] leading-6 font-semibold text-ink">Still have a question?</h2>
      <p className="mt-1 text-sm leading-5 text-ink-muted">Write to us and our team will reply during support hours.</p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:max-w-md">
        <a href={createSupportWhatsAppUrl(`Hi Suit Aura Girls! I have a question about your ${topic}.`)} target="_blank" rel="noopener noreferrer" className={helpBtn}>
          <WhatsAppIcon className="w-5 h-5" /> Chat on WhatsApp
        </a>
        <a href={`mailto:${SUPPORT_EMAIL}`} className={helpBtn}>
          <GmailIcon mono className="w-[18px] h-[18px]" /> Email us
        </a>
      </div>
      {showContactLink && (
        <button type="button" onClick={() => setActivePage('contact')} className="sag-link mt-2">All contact details</button>
      )}
    </section>
  );
};

const PolicyWrapper: React.FC<PolicyWrapperProps> = ({ page, title, subtitle, facts = [], sections, intro }) => {
  const { setActivePage } = useShop();
  const [activeId, setActiveId] = useState(sections[0]?.id || '');

  // Highlight the section being read in the contents list
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveId(visible[0].target.id);
    }, { rootMargin: '-120px 0px -55% 0px' });
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  const jump = (id: string) => {
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div id={`${page}-page`} className="bg-page pb-12 lg:pb-16">
      <InfoPageHeader crumb={title} eyebrow="Suit Aura Girls policy" title={title} subtitle={subtitle} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 lg:pt-8 lg:grid lg:grid-cols-12 lg:gap-10">
        {/* Contents: chips on phones, sticky list on desktop */}
        {sections.length > 1 && (
          <aside className="lg:col-span-4 mb-4 lg:mb-0 min-w-0">
            <div className="lg:sticky lg:top-20">
              <p className="hidden lg:block sag-eyebrow mb-2">On this page</p>
              <nav aria-label="On this page" className="flex lg:flex-col gap-2 lg:gap-0 overflow-x-auto sag-scroll-x -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:overflow-visible lg:border-l lg:border-line">
                {sections.map((s, i) => {
                  const active = activeId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => jump(s.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`shrink-0 text-left cursor-pointer transition-colors inline-flex items-center h-11 px-3.5 rounded-chip border-[1.5px] text-sm whitespace-nowrap lg:h-auto lg:min-h-11 lg:py-2 lg:pl-4 lg:pr-2 lg:rounded-none lg:border-0 lg:border-l-2 lg:-ml-px lg:whitespace-normal ${
                        active
                          ? 'max-lg:bg-ink max-lg:text-white border-ink font-semibold lg:border-brand lg:text-ink'
                          : 'max-lg:bg-surface border-control text-ink lg:text-ink-muted lg:border-transparent hover:text-ink'
                      }`}
                    >
                      <span className="hidden lg:inline font-normal mr-2 sag-num">{i + 1}.</span>{s.title}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
        )}

        <div className={`${sections.length > 1 ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-4 min-w-0`}>
          {/* The short answers first */}
          {facts.length > 0 && (
            <section aria-label="Key facts" className="rounded-card border border-brand-line bg-brand-wash px-4 sm:px-6">
              <dl>
                {facts.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="sag-row border-brand-line items-start py-3">
                    <span className="shrink-0 flex text-brand mt-0.5"><Icon mono className="w-5 h-5" /></span>
                    <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-6">
                      <dt className="text-[13px] leading-[18px] font-normal text-ink-muted">{label}</dt>
                      <dd className="text-[15px] leading-[22px] font-semibold text-ink sm:text-right">{value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {intro && <div className="sag-card p-4 sm:p-6">{intro}</div>}

          <div className="sag-card px-4 sm:px-6">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className={`py-5 sm:py-6 scroll-mt-20 ${i > 0 ? 'border-t border-line' : ''}`}>
                <h2 id={`${s.id}-title`} className="text-[17px] leading-6 lg:text-[20px] lg:leading-7 font-semibold text-ink">
                  <span className="text-ink-muted font-medium mr-2 sag-num">{i + 1}.</span>{s.title}
                </h2>
                <div className="mt-3 space-y-4">{s.body}</div>
              </section>
            ))}
          </div>

          <HelpCard topic={title} />

          <nav aria-labelledby={`${page}-more-title`} className="sag-card px-4 sm:px-6 pt-4 pb-1">
            <h2 id={`${page}-more-title`} className="text-[17px] leading-6 font-semibold text-ink pb-2">More policies</h2>
            {POLICY_LINKS.filter(([p]) => p !== page).map(([p, label]) => (
              <button key={p} type="button" onClick={() => setActivePage(p)} className="sag-row w-full text-left cursor-pointer !border-t !border-line">
                <span className="flex-1 min-w-0">{label}</span>
                <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
};

export const ShippingPolicyPage: React.FC = () => {
  const { setActivePage, storeOffers } = useShop();
  // Shipping wording follows the owner's live settings (Admin -> Settings -> Checkout)
  const charge = Number(storeOffers?.shippingCharge) || 0;
  const freeAbove = Number(storeOffers?.freeShippingThreshold) || 0;
  const shippingValue = charge === 0 ? 'Free on all orders' : freeAbove > 0 ? 'Free above ₹' + freeAbove.toLocaleString('en-IN') : '₹' + charge + ' per order';
  const shippingText = charge === 0
    ? 'Shipping is free on every order, anywhere in India.'
    : 'A shipping charge of ₹' + charge + ' applies' + (freeAbove > 0 ? ', and shipping is free on orders above ₹' + freeAbove.toLocaleString('en-IN') : '') + '. The exact amount is shown in your bag before you pay.';
  return (
    <PolicyWrapper
      page="shipping-policy"
      title="Shipping & delivery policy"
      subtitle="Prepaid shipping across India, tracked from dispatch to your door"
      facts={[
        { icon: TruckIcon, label: 'Shipping charges', value: shippingValue },
        { icon: PackageIcon, label: 'Dispatch', value: 'Within 24–48 business hours' },
        { icon: PinIcon, label: 'Metro cities', value: '2 to 4 business days' },
        { icon: LockIcon, label: 'Payment', value: 'All orders are prepaid' },
      ]}
      sections={[
        {
          id: 'coverage',
          title: 'Delivery across India',
          body: <p className={P}>Suit Aura Girls delivers across India through our courier partners. Enter your PIN code on any product page to check delivery to your area before you order.</p>,
        },
        {
          id: 'charges',
          title: 'Shipping charges',
          body: <p className={P}>{shippingText}</p>,
        },
        {
          id: 'dispatch',
          title: 'Order processing and dispatch',
          body: <p className={P}>Since all orders are prepaid, your parcel enters priority packing immediately. Most orders are dispatched within <S>24 to 48 business hours</S> from our studio.</p>,
        },
        {
          id: 'delivery-days',
          title: 'Estimated delivery days',
          body: (
            <dl className="rounded-control border border-line divide-y divide-line overflow-hidden">
              {[
                ['Metro cities (Delhi NCR, Mumbai, Bengaluru, Hyderabad, Chennai, Kolkata)', '2 to 4 business days.'],
                ['Rest of India (tier 2 and tier 3 cities)', '3 to 6 business days.'],
                ['Northeast and remote locations', '5 to 7 business days.'],
              ].map(([where, days]) => (
                <div key={where} className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 sm:gap-6 bg-surface px-4 py-3">
                  <dt className="text-sm leading-5 text-ink-muted">{where}</dt>
                  <dd className="text-[15px] leading-[22px] font-semibold text-ink shrink-0">{days}</dd>
                </div>
              ))}
            </dl>
          ),
        },
        {
          id: 'tracking',
          title: 'Tracking your parcel',
          body: (
            <>
              <p className={P}>As soon as your parcel is dispatched, your courier name and AWB tracking number are emailed to you. You can also track your parcel anytime on our website via the <S>Track Order</S> page.</p>
              <ActionLink onClick={() => setActivePage('track-order')}><TruckIcon mono className="w-[18px] h-[18px]" /> Track order</ActionLink>
            </>
          ),
        },
      ]}
    />
  );
};

export const ReturnPolicyPage: React.FC = () => {
  const { setActivePage } = useShop();
  return (
    <PolicyWrapper
      page="return-policy"
      title="Returns & exchanges policy"
      subtitle="Request a return or an exchange within 7 days of delivery"
      facts={[
        { icon: ReturnIcon, label: 'Return window', value: '7 days from delivery' },
        { icon: TagIcon, label: 'Condition', value: 'Unused, tags intact' },
        { icon: OrdersIcon, label: 'How to request', value: 'My account → Orders' },
        { icon: LockIcon, label: 'Refunds', value: 'To original payment method' },
      ]}
      sections={[
        {
          id: 'window',
          title: '7-day return and exchange window',
          body: <p className={P}>We want you to love what you order from Suit Aura Girls. If the size does not fit or if you wish to exchange it for another design, you may request an exchange or return within <S>7 days of delivery</S>.</p>,
        },
        {
          id: 'eligibility',
          title: 'Eligibility conditions',
          body: <List items={[
            'The garment must be unused, unwashed, and unstained.',
            'All original brand tags, labels, and packaging must be intact.',
            'Items purchased on Final Clearance (50%+ off) are eligible for size exchange only.',
          ]} />,
        },
        {
          id: 'how-to',
          title: 'How to request a return or exchange',
          body: (
            <>
              <p className={P}>Sign in and open <S>My account → Orders</S> (or the Track order page), choose <S>Return / exchange</S>, pick the pieces, tell us the reason and add photos. Photos are required if an item arrived damaged or the wrong item was sent.</p>
              <p className={P}>Our team reviews every request and emails you the decision. If it is approved, the email tells you exactly how the item will be collected or sent back.</p>
              <div className="flex flex-wrap gap-2.5">
                <ActionLink onClick={() => setActivePage('account')}><UserIcon mono className="w-[18px] h-[18px]" /> My account</ActionLink>
                <ActionLink onClick={() => setActivePage('track-order')}><TruckIcon mono className="w-[18px] h-[18px]" /> Track order</ActionLink>
              </div>
            </>
          ),
        },
        {
          id: 'refunds',
          title: 'Refunds and exchanges',
          body: <p className={P}>Once the returned item reaches us and passes our quality check, the refund is made to your original payment method, or your exchange piece is sent to you. You can follow every step of your request in My account.</p>,
        },
      ]}
    />
  );
};

export const PrivacyPolicyPage: React.FC = () => (
  <PolicyWrapper
    page="privacy-policy"
    title="Privacy policy"
    subtitle="What we collect, how payments are handled and how your details are used"
    facts={[
      { icon: LockIcon, label: 'Payment details', value: 'Never stored on our servers' },
      { icon: QualityIcon, label: 'Your data', value: 'Never sold or rented' },
      { icon: PackageIcon, label: 'Used for', value: 'Orders and order updates' },
    ]}
    sections={[
      {
        id: 'collect',
        title: 'Information we collect',
        body: <p className={P}>We collect personal information that you provide when placing an order, creating an account, or subscribing to our newsletter (such as your Name, Phone Number, Email, and Delivery Address).</p>,
      },
      {
        id: 'encryption',
        title: 'Secure payments',
        body: <p className={P}>We never see or store your card numbers, UPI PINs or net banking passwords. Payments are handled on the secure, encrypted pages of our payment partners (Razorpay and PayU), and we only receive the payment confirmation.</p>,
      },
      {
        id: 'no-selling',
        title: 'We do not sell customer data',
        body: <p className={P}>Suit Aura Girls will never sell, lease, or rent your personal contact information to any third-party marketing companies. Your data is used strictly for fulfilling orders and communicating updates.</p>,
      },
    ]}
  />
);

export const TermsPage: React.FC = () => (
  <PolicyWrapper
    page="terms-policy"
    title="Terms & conditions"
    subtitle="The terms that apply when you use this website and place an order"
    facts={[
      { icon: TagIcon, label: 'Pricing', value: 'In INR, inclusive of GST' },
      { icon: LockIcon, label: 'Orders', value: 'Prepaid store policies apply' },
      { icon: QualityIcon, label: 'Colours', value: 'May vary slightly by screen' },
    ]}
    sections={[
      {
        id: 'general',
        title: 'General store terms',
        body: <p className={P}>By accessing and placing orders on Suit Aura Girls, you agree to abide by our terms of service, pricing guidelines, and prepaid store policies.</p>,
      },
      {
        id: 'colour',
        title: 'Colour accuracy and small variations',
        body: <p className={P}>We photograph every style as accurately as we can, but colours can look slightly different on different screens, and small differences in embroidery or print placement can occur from piece to piece.</p>,
      },
      {
        id: 'pricing-ip',
        title: 'Pricing and intellectual property',
        body: <p className={P}>All prices are listed in Indian Rupees (INR) and are inclusive of GST. All photographs, lookbooks, slogans ("Elegance That Feels Like You"), and designs are the intellectual property of Suit Aura Girls.</p>,
      },
    ]}
  />
);

export const CancellationPolicyPage: React.FC = () => (
  <PolicyWrapper
    page="cancellation-policy"
    title="Cancellation policy"
    subtitle="How to cancel an order that has not been dispatched yet"
    facts={[
      { icon: PackageIcon, label: 'Cancel for free', value: 'Any time before dispatch' },
      { icon: SupportIcon, label: 'How', value: 'My account → Orders, or message us' },
      { icon: ReturnIcon, label: 'Refund', value: 'Full amount to source account' },
    ]}
    sections={[
      {
        id: 'window',
        title: 'Cancellation window',
        body: <p className={P}>You can cancel your order free of cost while it is <S>still being processed</S> — that is, before it is packed and handed to the courier.</p>,
      },
      {
        id: 'how-to',
        title: 'How to request a cancellation',
        body: (
          <>
            <p className={P}>Signed in? Open <S>My account → Orders</S> and tap <S>Cancel</S> on the order. You can also email <S>{SUPPORT_EMAIL}</S> or WhatsApp our support team ({SUPPORT_PHONE_DISPLAY}) with your Order ID.</p>
            <div className="flex flex-wrap gap-2.5">
              <ActionLink href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I would like to cancel my order. Order ID: ')}><WhatsAppIcon className="w-[18px] h-[18px]" /> WhatsApp us</ActionLink>
              <ActionLink href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Order cancellation')}`}><GmailIcon mono className="w-[18px] h-[18px]" /> Email us</ActionLink>
            </div>
          </>
        ),
      },
      {
        id: 'refund',
        title: 'Full refund for cancelled orders',
        body: <p className={P}>For orders cancelled before dispatch, the full amount you paid is refunded to your original payment method. We start the refund as soon as the cancellation is processed; banks usually take 5–7 working days to show it.</p>,
      },
    ]}
  />
);

// Built from the one store chart (src/utils/sizeChart.ts), the same numbers as the size popup and "Find my size"
const SIZE_ROWS: Array<[string, string, string, string, string, string]> = SIZE_CHART.map((row) => [
  `${row.size} (${row.bust})`, `${row.bust}"`, `${row.waist}"`, `${row.hips}"`, `${row.kurtaLength}"`, `${row.bottomLength}"`,
]);

export const SizeGuidePage: React.FC = () => (
  <PolicyWrapper
    page="size-guide"
    title="Size guide"
    subtitle="Garment measurements in inches for every size we make"
    facts={[
      { icon: TagIcon, label: 'Units', value: 'All measurements in inches' },
      { icon: HelpIcon, label: 'Between two sizes?', value: 'Choose the larger size' },
    ]}
    sections={[
      {
        id: 'chart',
        title: 'Size chart',
        body: (
          <>
            <p className={P}>To find your size, measure yourself with a flexible tape over your undergarments. If your measurements fall between two sizes, we recommend choosing the larger size for a relaxed, comfortable fit.</p>
            <div className="overflow-x-auto rounded-control border border-line">
              <table className="w-full min-w-[540px] text-left text-sm border-collapse">
                <caption className="sr-only">Garment measurements in inches by size</caption>
                <thead>
                  <tr className="bg-sunken">
                    {['Size', 'Bust', 'Waist', 'Hip', 'Kurta length', 'Bottom length'].map((h, i) => (
                      <th key={h} scope="col" className={`px-3.5 py-3 text-[13px] leading-[18px] font-semibold text-ink whitespace-nowrap ${i === 0 ? 'sticky left-0 bg-sunken border-r border-line' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {SIZE_ROWS.map(([size, ...cells]) => (
                    <tr key={size} className="bg-surface">
                      <th scope="row" className="px-3.5 py-3 font-semibold text-ink whitespace-nowrap sticky left-0 bg-surface border-r border-line">{size}</th>
                      {cells.map((c, i) => <td key={i} className="px-3.5 py-3 text-ink sag-num">{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] leading-[18px] text-ink-muted sm:hidden">Swipe the table sideways to see every measurement.</p>
          </>
        ),
      },
      {
        id: 'measure',
        title: 'How to measure',
        body: (
          <dl className="grid gap-2.5 sm:grid-cols-3">
            {[
              ['Bust', 'Measure around the fullest part of your chest, keeping the tape comfortably horizontal.'],
              ['Waist', 'Measure around your natural waistline, typically an inch above the belly button.'],
              ['Hips', 'Measure around the fullest part of your hips and seat area.'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-control bg-sunken p-4">
                <dt className="text-base leading-[22px] font-semibold text-ink">{k}</dt>
                <dd className="mt-1 text-sm leading-5 text-ink-muted">{v}</dd>
              </div>
            ))}
          </dl>
        ),
      },
    ]}
  />
);
