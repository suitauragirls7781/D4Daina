import React, { useEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { Check, ChevronRight } from 'lucide-react';
import { SIZE_CHART } from '../utils/sizeChart';
import { DEFAULT_SUPPORT_EMAIL, SUPPORT_PHONE_DISPLAY, createSupportWhatsAppUrl } from '../utils/storeContact';
import { useAdmin } from '../context/AdminContext';
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
  /** "In short": two to four points, each one a statement the policy text below already makes. */
  short?: string[];
  /** Small gold label above the title. */
  eyebrow?: string;
  sections: PolicySection[];
  intro?: React.ReactNode;
}

/** The support email the owner saved in Admin -> Settings -> Store Details. */
const useSupportEmail = () => useAdmin().storeSettings?.storeEmail || DEFAULT_SUPPORT_EMAIL;

const POLICY_LINKS: Array<[ActivePage, string]> = [
  ['shipping-policy', 'Shipping & delivery'],
  ['return-policy', 'Returns & exchanges'],
  ['cancellation-policy', 'Cancellation'],
  ['privacy-policy', 'Privacy'],
  ['terms-policy', 'Terms & conditions'],
  ['size-guide', 'Size guide'],
];

/* Shared text styles for policy copy */
const P = 'text-sm leading-[22px] text-ink lg:text-[15px] lg:leading-6';
const S: React.FC<{ children: React.ReactNode }> = ({ children }) => <strong className="font-semibold text-ink">{children}</strong>;
const List: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="space-y-2">
    {items.map((item, i) => (
      <li key={i} className={`${P} flex gap-3`}>
        <span aria-hidden="true" className="mt-[11px] h-px w-2.5 bg-brand shrink-0" />
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
    <div className="">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-1 pb-2 lg:pt-3 lg:pb-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] leading-[18px] text-ink-muted -ml-2">
          <button type="button" onClick={() => setActivePage('home')} className="inline-flex items-center min-h-11 px-2 hover:text-ink cursor-pointer">Home</button>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span aria-current="page" className="text-ink truncate px-2">{crumb}</span>
        </nav>
        {eyebrow && <p className="mt-3 text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale">{eyebrow}</p>}
        <h1 className={`font-display font-medium text-[23px] leading-7 lg:text-[36px] lg:leading-[44px] text-ink ${eyebrow ? 'mt-1.5' : 'mt-2'}`}>{title}</h1>
        {subtitle && <p className="mt-1.5 text-[13px] leading-[18px] lg:text-[15px] lg:leading-[22px] text-ink-muted max-w-2xl">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
};

/** "Still have a question?" card: WhatsApp, email and the contact page. Sits at the foot of the info pages. */
export const HelpCard: React.FC<{ topic: string; showContactLink?: boolean }> = ({ topic, showContactLink = true }) => {
  const { setActivePage } = useShop();
  const SUPPORT_EMAIL = useSupportEmail();
  return (
    <section aria-labelledby="info-help-title" className="sag-glass p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="shrink-0 flex text-sale"><WhatsAppIcon mono className="w-[22px] h-[22px]" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="info-help-title" className="font-sans text-sm leading-5 font-semibold text-ink">Need help?</h2>
          <p className="text-[11.5px] leading-4 text-ink-muted">Chat with us on WhatsApp. Our team replies during support hours.</p>
        </div>
        <a href={createSupportWhatsAppUrl(`Hi Suit Aura Girls! I have a question about your ${topic}.`)} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className="sag-btn-primary shrink-0 h-10 px-4">
          Chat
        </a>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 border-t border-line pt-1">
        <a href={`mailto:${SUPPORT_EMAIL}`} className="sag-link gap-1.5 text-[12.5px]">
          <GmailIcon mono className="w-4 h-4" /> Email us
        </a>
        {showContactLink && (
          <button type="button" onClick={() => setActivePage('contact')} className="sag-link text-[12.5px]">All contact details</button>
        )}
      </div>
    </section>
  );
};

const PolicyWrapper: React.FC<PolicyWrapperProps> = ({ page, title, subtitle, facts = [], short = [], eyebrow = 'Policy', sections, intro }) => {
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
    <div id={`${page}-page`} className="pb-12 lg:pb-16">
      <InfoPageHeader crumb={title} eyebrow={eyebrow} title={title} subtitle={subtitle} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 lg:pt-8 lg:grid lg:grid-cols-12 lg:gap-10">
        {/* Contents: chips on phones, sticky list on desktop */}
        {sections.length > 1 && (
          <aside className="lg:col-span-4 mb-4 lg:mb-0 min-w-0">
            <div className="lg:sticky lg:top-20">
              <p className="hidden lg:block text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale mb-3">On this page</p>
              <nav aria-label="On this page" className="flex lg:flex-col gap-2 lg:gap-0 overflow-x-auto sag-scroll-x -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:overflow-visible lg:border-l lg:border-line">
                {sections.map((s, i) => {
                  const active = activeId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => jump(s.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`shrink-0 text-left cursor-pointer transition-colors inline-flex items-center h-[34px] px-3.5 max-lg:rounded-full border text-[12.5px] whitespace-nowrap lg:h-auto lg:min-h-11 lg:py-2 lg:pl-4 lg:pr-2 lg:border-0 lg:border-l lg:-ml-px lg:text-sm lg:whitespace-normal ${
                        active
                          ? 'bg-brand-wash border-brand font-semibold text-sale lg:bg-transparent lg:border-brand'
                          : 'bg-surface border-line text-ink lg:text-ink-muted lg:border-transparent hover:text-ink'
                      }`}
                    >
                      <span className="hidden lg:inline font-normal mr-2.5 text-[11.5px] text-ink-muted sag-num">{i + 1}</span>{s.title}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
        )}

        <div className={`${sections.length > 1 ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-5 min-w-0`}>
          {/* The short answers first: "In short" on phones and tablets, the facts table on desktop */}
          {short.length > 0 && (
            <section aria-labelledby={`${page}-short-title`} className={`sag-glass sag-glass-strong p-4 sm:p-5 ${facts.length > 0 ? 'lg:hidden' : ''}`}>
              <h2 id={`${page}-short-title`} className="font-sans text-[13.5px] leading-5 font-semibold text-ink">In short</h2>
              <ul className="mt-2 space-y-2">
                {short.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-[13.5px] leading-5 text-ink">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sale" strokeWidth={1.5} />
                    <span className="min-w-0">{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {facts.length > 0 && (
            <section aria-label="Key facts" className={`sag-glass sag-glass-strong px-4 sm:px-6 ${short.length > 0 ? 'hidden lg:block' : ''}`}>
              <dl>
                {facts.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="sag-row border-line items-start py-3">
                    <span className="shrink-0 flex text-sale mt-0.5"><Icon mono className="w-5 h-5" /></span>
                    <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-6">
                      <dt className="text-[13px] leading-[18px] font-normal text-ink-muted">{label}</dt>
                      <dd className="text-sm leading-5 font-medium text-ink sm:text-right">{value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {intro && <div className="sag-glass p-4 sm:p-6">{intro}</div>}

          <div className="border-b border-line">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="border-t border-line py-5 sm:py-6 scroll-mt-20">
                <h2 id={`${s.id}-title`} className="flex items-baseline gap-3 font-sans text-[15px] leading-[22px] lg:text-[17px] lg:leading-6 font-medium text-ink">
                  <span className="w-[18px] shrink-0 text-[11.5px] font-normal text-ink-muted sag-num">{i + 1}</span><span className="min-w-0">{s.title}</span>
                </h2>
                <div className="mt-3 space-y-4 pl-[30px]">{s.body}</div>
              </section>
            ))}
          </div>

          <HelpCard topic={title} />

          <nav aria-labelledby={`${page}-more-title`} className="sag-glass px-4 pt-4 pb-1">
            <h2 id={`${page}-more-title`} className="font-sans text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale pb-1">More policies</h2>
            {POLICY_LINKS.filter(([p]) => p !== page).map(([p, label]) => (
              <button key={p} type="button" onClick={() => setActivePage(p)} className="sag-row w-full text-left font-normal cursor-pointer !border-t-0 border-b border-line last:border-b-0">
                <span className="flex-1 min-w-0">{label}</span>
                <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
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
      short={[
        "We deliver across India through our courier partners",
        "Most orders are dispatched within 24 to 48 business hours",
        "Your courier name and AWB tracking number are emailed at dispatch",
      ]}
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
          body: <><p className={P}>{shippingText}</p><p className={P}>Where cash on delivery is offered, the cash on delivery charge shown at checkout is paid online to confirm the order, and the rest is paid in cash when the parcel arrives. Orders paid in full online do not carry this charge.</p></>,
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
            <dl className="border border-line divide-y divide-line overflow-hidden">
              {[
                ['Metro cities (Delhi NCR, Mumbai, Bengaluru, Hyderabad, Chennai, Kolkata)', '2 to 4 business days.'],
                ['Rest of India (tier 2 and tier 3 cities)', '3 to 6 business days.'],
                ['Northeast and remote locations', '5 to 7 business days.'],
              ].map(([where, days]) => (
                <div key={where} className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 sm:gap-6 bg-surface px-4 py-3">
                  <dt className="text-sm leading-5 text-ink-muted">{where}</dt>
                  <dd className="text-sm leading-5 font-medium text-ink shrink-0">{days}</dd>
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
      short={[
        "Request a return or exchange within 7 days of delivery",
        "The garment must be unused, unwashed and unstained, with tags intact",
        "Request it from My account → Orders",
        "Refund to your original payment method after our quality check",
      ]}
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
          body: <p className={P}>Once the returned item reaches us and passes our quality check, the refund is made to your original payment method, or your exchange piece is sent to you. For a cash on delivery order, the refund is sent to the UPI ID you give in the return request. You can follow every step of your request in My account.</p>,
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
      short={[
        "We never see or store your card numbers, UPI PINs or net banking passwords",
        "We never sell, lease or rent your contact information",
        "Your data is used only for fulfilling orders and communicating updates",
      ]}
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
      short={[
        "All prices are in Indian Rupees (INR) and inclusive of GST",
        "If an order is cancelled and you order again, the first order's refund starts once the new payment is successful",
        "Colours can look slightly different on different screens",
        "Photographs and designs are the intellectual property of Suit Aura Girls",
      ]}
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
        id: 'cancelled-reorder',
        title: 'If an order is cancelled and you order again',
        body: <p className={P}>If your order is cancelled because of a technical issue or for any other reason and you place the order again, the refund for the first order is started as soon as the payment for the new order is successful. If you do not order again, the first order is still refunded as described in our Cancellation policy.</p>,
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

export const CancellationPolicyPage: React.FC = () => {
  const SUPPORT_EMAIL = useSupportEmail();
  return (
  <PolicyWrapper
    page="cancellation-policy"
    title="Cancellation policy"
    subtitle="How to cancel an order that has not been dispatched yet"
      short={[
        "Cancel free of cost before the order is handed to the courier",
        "Cancel from My account → Orders, or email or WhatsApp us with your Order ID",
        "The full amount is refunded to your original payment method",
        "Banks usually take 5–7 working days to show the refund",
      ]}
    facts={[
      { icon: PackageIcon, label: 'Cancel for free', value: 'Any time before dispatch' },
      { icon: SupportIcon, label: 'How', value: 'My account → Orders, or message us' },
      { icon: ReturnIcon, label: 'Refund', value: 'Full amount to source account' },
    ]}
    sections={[
      {
        id: 'window',
        title: 'Cancellation window',
        body: <p className={P}>You can cancel your order free of cost while it is <S>still with us</S> — that is, before it is handed to the courier.</p>,
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
        body: <p className={P}>For orders cancelled before dispatch, the full amount you paid is refunded to your original payment method. We start the refund as soon as the cancellation is processed; banks usually take 5–7 working days to show it. For a cash on delivery order this is the charge you paid online. That charge is not refunded if the parcel is refused at delivery.</p>,
      },
    ]}
  />
  );
};

// Built from the one store chart (src/utils/sizeChart.ts), the same numbers as the size popup and "Find my size"
const SIZE_ROWS: Array<[string, string, string, string, string, string]> = SIZE_CHART.map((row) => [
  `${row.size} (${row.bust})`, `${row.bust}"`, `${row.waist}"`, `${row.hips}"`, `${row.kurtaLength}"`, `${row.bottomLength}"`,
]);

export const SizeGuidePage: React.FC = () => (
  <PolicyWrapper
    page="size-guide"
    title="Size guide"
    subtitle="Garment measurements in inches for every size we make"
    eyebrow="Guide"
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
            <div className="overflow-x-auto border border-line">
              <table className="w-full min-w-[540px] text-left text-sm border-collapse">
                <caption className="sr-only">Garment measurements in inches by size</caption>
                <thead>
                  <tr className="bg-sunken">
                    {['Size', 'Bust', 'Waist', 'Hip', 'Kurta length', 'Bottom length'].map((h, i) => (
                      <th key={h} scope="col" className={`px-3.5 py-3 text-[11.5px] leading-4 font-normal uppercase tracking-[0.06em] text-ink-muted whitespace-nowrap ${i === 0 ? 'sticky left-0 bg-[color:var(--sag-glass-sheet)] border-r border-line' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {SIZE_ROWS.map(([size, ...cells]) => (
                    <tr key={size} className="bg-surface">
                      <th scope="row" className="px-3.5 py-3 font-medium text-ink whitespace-nowrap sticky left-0 bg-surface border-r border-line">{size}</th>
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
              <div key={k} className="sag-glass p-4">
                <dt className="text-sm leading-5 font-semibold text-ink">{k}</dt>
                <dd className="mt-1 text-sm leading-5 text-ink-muted">{v}</dd>
              </div>
            ))}
          </dl>
        ),
      },
    ]}
  />
);
