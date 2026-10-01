import React, { useEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { ChevronRight, Ruler } from 'lucide-react';
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
  icon: React.ReactNode;
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
const P = 'text-[15px] leading-7 text-[#2A1A26]/80';
const S: React.FC<{ children: React.ReactNode }> = ({ children }) => <strong className="font-semibold text-[#2A1A26]">{children}</strong>;
const List: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="space-y-2.5">
    {items.map((item, i) => (
      <li key={i} className={`${P} flex gap-3`}>
        <span aria-hidden="true" className="mt-[11px] w-1.5 h-1.5 rounded-full bg-[#C5A46D] shrink-0" />
        <span className="min-w-0">{item}</span>
      </li>
    ))}
  </ul>
);
const ActionLink: React.FC<{ onClick?: () => void; href?: string; children: React.ReactNode }> = ({ onClick, href, children }) => {
  const cls = 'inline-flex items-center gap-2 h-10 px-4 rounded-full bg-[#F3EEF8] text-sm font-medium text-[#4B1D3F] hover:bg-[#E6DDF0] transition-colors cursor-pointer';
  return href
    ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={cls}>{children}</a>
    : <button type="button" onClick={onClick} className={cls}>{children}</button>;
};

const PolicyWrapper: React.FC<PolicyWrapperProps> = ({ page, title, subtitle, icon, facts = [], sections, intro }) => {
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
    <div id={`${page}-page`} className="bg-[#FBF7F3] pb-14 sm:pb-20">
      {/* Title band */}
      <div className="bg-[#F3EEF8] border-b border-[#4B1D3F]/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 sm:pt-8 sm:pb-12">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-[#2A1A26]/60">
            <button onClick={() => setActivePage('home')} className="hover:text-[#4B1D3F] cursor-pointer">Home</button>
            <ChevronRight className="w-3.5 h-3.5 text-[#4B1D3F]/40" />
            <span className="text-[#4B1D3F] font-medium truncate">{title}</span>
          </nav>

          <div className="mt-6 sm:mt-8 flex items-start gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] flex items-center justify-center shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <p className="sag-eyebrow">Suit Aura Girls policy</p>
              <h1 className="font-serif text-[32px] leading-[1.1] sm:text-5xl text-[#4B1D3F] mt-1.5">{title}</h1>
              <p className="text-[15px] text-[#2A1A26]/70 mt-2 max-w-2xl">{subtitle}</p>
            </div>
          </div>

          {facts.length > 0 && (
            <ul className={`mt-7 sm:mt-9 grid gap-2.5 sm:gap-3 grid-cols-1 min-[420px]:grid-cols-2 ${facts.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`} aria-label="Key facts">
              {facts.map(({ icon: Icon, label, value }) => (
                <li key={label} className="flex items-center gap-3 rounded-2xl bg-white border border-[#4B1D3F]/10 px-4 py-3.5">
                  <span className="w-10 h-10 rounded-full bg-[#F3EEF8] flex items-center justify-center shrink-0"><Icon className="w-[22px] h-[22px]" /></span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold tracking-[0.08em] text-[#9C7A45]">{label}</span>
                    <span className="block text-sm font-semibold text-[#2A1A26] leading-snug">{value}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 lg:grid lg:grid-cols-12 lg:gap-10">
        {/* Contents: chips on phones, sticky list on desktop */}
        {sections.length > 1 && (
          <aside className="lg:col-span-3 mb-6 lg:mb-0">
            <div className="lg:sticky lg:top-40">
              <p className="hidden lg:block sag-eyebrow mb-3">On this page</p>
              <nav aria-label="On this page" className="flex lg:flex-col gap-2 lg:gap-0.5 overflow-x-auto sag-scroll-x -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-visible lg:border-l lg:border-[#4B1D3F]/10">
                {sections.map((s, i) => {
                  const active = activeId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => jump(s.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`shrink-0 text-left cursor-pointer transition-colors rounded-full lg:rounded-none px-4 h-10 lg:h-auto lg:py-2 lg:pl-4 lg:pr-2 text-[13px] lg:text-sm border lg:border-0 lg:border-l-2 lg:-ml-px whitespace-nowrap lg:whitespace-normal ${
                        active
                          ? 'max-lg:bg-[#4B1D3F] max-lg:text-white border-[#4B1D3F] lg:text-[#4B1D3F] lg:font-semibold'
                          : 'max-lg:bg-white border-[#4B1D3F]/12 text-[#2A1A26]/75 lg:border-transparent hover:text-[#4B1D3F]'
                      }`}
                    >
                      <span className="lg:hidden">{s.title}</span>
                      <span className="hidden lg:inline"><span className="text-[#9C7A45] mr-1.5 tabular-nums">{String(i + 1).padStart(2, '0')}</span>{s.title}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
        )}

        <div className={`${sections.length > 1 ? 'lg:col-span-9' : 'lg:col-span-12'} space-y-4 sm:space-y-5 min-w-0`}>
          {intro && <div className="sag-card rounded-3xl p-5 sm:p-8">{intro}</div>}
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="sag-card rounded-3xl p-5 sm:p-8 scroll-mt-28">
              <div className="flex items-start gap-3.5">
                <span aria-hidden="true" className="w-9 h-9 rounded-full bg-[#F3EEF8] text-[#4B1D3F] text-sm font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                <h2 id={`${s.id}-title`} className="font-serif text-[26px] sm:text-[28px] leading-tight text-[#4B1D3F] pt-0.5">{s.title}</h2>
              </div>
              <div className="mt-4 sm:pl-[50px] space-y-4">{s.body}</div>
            </section>
          ))}

          {/* Help + other policies */}
          <div className="rounded-3xl bg-[#4B1D3F] text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <span className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0"><SupportIcon mono className="w-6 h-6 text-white" /></span>
              <div>
                <p className="font-serif text-2xl leading-tight text-white">Still have a question?</p>
                <p className="text-sm text-white/75 mt-1">Write to us and our team will reply during support hours.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <a href={createSupportWhatsAppUrl(`Hi Suit Aura Girls! I have a question about your ${title}.`)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-white text-[#4B1D3F] text-sm font-semibold hover:bg-[#F3EEF8] transition-colors">
                <WhatsAppIcon className="w-[18px] h-[18px]" /> WhatsApp
              </a>
              <a href={`mailto:${SUPPORT_EMAIL}`}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-white/35 text-white text-sm font-semibold hover:bg-white/10 transition-colors">
                <GmailIcon mono className="w-[18px] h-[18px] text-white" /> Email us
              </a>
            </div>
          </div>

          <nav aria-label="Other policies" className="pt-2">
            <p className="sag-eyebrow mb-3">More policies</p>
            <div className="flex flex-wrap gap-2">
              {POLICY_LINKS.filter(([p]) => p !== page).map(([p, label]) => (
                <button key={p} type="button" onClick={() => setActivePage(p)}
                  className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-white border border-[#4B1D3F]/12 text-sm text-[#2A1A26]/80 hover:border-[#4B1D3F]/35 hover:text-[#4B1D3F] transition-colors cursor-pointer">
                  {label} <ChevronRight className="w-3.5 h-3.5 text-[#4B1D3F]/45" />
                </button>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
};

const pageIcon = (Icon: IconType) => <Icon className="w-8 h-8 sm:w-9 sm:h-9" />;

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
      title="Shipping & Delivery Policy"
      subtitle="Prepaid shipping across India, tracked from dispatch to your door"
      icon={pageIcon(TruckIcon)}
      facts={[
        { icon: TruckIcon, label: 'Shipping charges', value: shippingValue },
        { icon: PackageIcon, label: 'Dispatch', value: 'Within 24–48 business hours' },
        { icon: PinIcon, label: 'Metro cities', value: '2 to 4 business days' },
        { icon: LockIcon, label: 'Payment', value: 'All orders are prepaid' },
      ]}
      sections={[
        {
          id: 'coverage',
          title: 'Pan-India Delivery Coverage',
          body: <p className={P}>Suit Aura Girls delivers across India through our courier partners. Enter your PIN code on any product page to check delivery to your area before you order.</p>,
        },
        {
          id: 'charges',
          title: 'Shipping Charges',
          body: <p className={P}>{shippingText}</p>,
        },
        {
          id: 'dispatch',
          title: 'Order Processing & Dispatch Timelines',
          body: <p className={P}>Since all orders are prepaid, your parcel enters priority packing immediately. Most orders are dispatched within <S>24 to 48 business hours</S> from our studio.</p>,
        },
        {
          id: 'delivery-days',
          title: 'Estimated Delivery Days',
          body: (
            <div className="grid gap-2.5">
              {[
                ['Metro Cities (Delhi NCR, Mumbai, Bengaluru, Hyderabad, Chennai, Kolkata)', '2 to 4 business days.'],
                ['Rest of India (Tier 2 & Tier 3 cities)', '3 to 6 business days.'],
                ['Northeast & Remote Locations', '5 to 7 business days.'],
              ].map(([where, days]) => (
                <div key={where} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 rounded-2xl bg-[#FBF7F3] border border-[#4B1D3F]/8 px-4 py-3">
                  <span className="text-[15px] text-[#2A1A26]/80">{where}:</span>
                  <span className="text-[15px] font-semibold text-[#4B1D3F] shrink-0">{days}</span>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: 'tracking',
          title: 'Real-Time Tracking',
          body: (
            <>
              <p className={P}>As soon as your parcel is dispatched, your courier name and AWB tracking number are emailed to you. You can also track your parcel anytime on our website via the <S>Track Order</S> page.</p>
              <ActionLink onClick={() => setActivePage('track-order')}><TruckIcon className="w-[18px] h-[18px]" /> Track order</ActionLink>
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
      title="Returns & Exchanges Policy"
      subtitle="7-day hassle-free exchange and return commitment"
      icon={pageIcon(ReturnIcon)}
      facts={[
        { icon: ReturnIcon, label: 'Return window', value: '7 days from delivery' },
        { icon: TagIcon, label: 'Condition', value: 'Unused, tags intact' },
        { icon: OrdersIcon, label: 'How to request', value: 'My account → Orders' },
        { icon: LockIcon, label: 'Refunds', value: 'To original payment method' },
      ]}
      sections={[
        {
          id: 'window',
          title: '7-Day Easy Return / Exchange Window',
          body: <p className={P}>We want you to fall in love with your Suit Aura Girls ensemble. If the size does not fit or if you wish to exchange it for another design, you may request an exchange or return within <S>7 days of delivery</S>.</p>,
        },
        {
          id: 'eligibility',
          title: 'Eligibility Conditions',
          body: <List items={[
            'The garment must be unused, unwashed, and unstained.',
            'All original brand tags, labels, and packaging must be intact.',
            'Items purchased on Final Clearance (50%+ off) are eligible for size exchange only.',
          ]} />,
        },
        {
          id: 'how-to',
          title: 'How to Request a Return or Exchange',
          body: (
            <>
              <p className={P}>Sign in and open <S>My account → Orders</S> (or the Track order page), choose <S>Return / exchange</S>, pick the pieces, tell us the reason and add photos. Photos are required if an item arrived damaged or the wrong item was sent.</p>
              <p className={P}>Our team reviews every request and emails you the decision. If it is approved, the email tells you exactly how the item will be collected or sent back.</p>
              <div className="flex flex-wrap gap-2">
                <ActionLink onClick={() => setActivePage('account')}><UserIcon className="w-[18px] h-[18px]" /> My account</ActionLink>
                <ActionLink onClick={() => setActivePage('track-order')}><TruckIcon className="w-[18px] h-[18px]" /> Track order</ActionLink>
              </div>
            </>
          ),
        },
        {
          id: 'refunds',
          title: 'Refunds & Exchanges',
          body: <p className={P}>Once the returned item reaches us and passes our quality check, the refund is made to your original payment method, or your exchange piece is sent to you. You can follow every step of your request in My account.</p>,
        },
      ]}
    />
  );
};

export const PrivacyPolicyPage: React.FC = () => (
  <PolicyWrapper
    page="privacy-policy"
    title="Privacy Policy"
    subtitle="How we safeguard your personal data and digital privacy"
    icon={pageIcon(LockIcon)}
    facts={[
      { icon: LockIcon, label: 'Payment details', value: 'Never stored on our servers' },
      { icon: QualityIcon, label: 'Your data', value: 'Never sold or rented' },
      { icon: PackageIcon, label: 'Used for', value: 'Orders and order updates' },
    ]}
    sections={[
      {
        id: 'collect',
        title: 'Information We Collect',
        body: <p className={P}>We collect personal information that you provide when placing an order, creating an account, or subscribing to our newsletter (such as your Name, Phone Number, Email, and Delivery Address).</p>,
      },
      {
        id: 'encryption',
        title: 'Secure Payments',
        body: <p className={P}>We never see or store your card numbers, UPI PINs or net banking passwords. Payments are handled on the secure, encrypted pages of our payment partners (Razorpay and PayU), and we only receive the payment confirmation.</p>,
      },
      {
        id: 'no-selling',
        title: 'No Selling of Customer Data',
        body: <p className={P}>Suit Aura Girls will NEVER sell, lease, or rent your personal contact information to any third-party marketing companies. Your data is used strictly for fulfilling orders and communicating updates.</p>,
      },
    ]}
  />
);

export const TermsPage: React.FC = () => (
  <PolicyWrapper
    page="terms-policy"
    title="Terms & Conditions"
    subtitle="Standard terms governing use of Suit Aura Girls digital platform"
    icon={pageIcon(OrdersIcon)}
    facts={[
      { icon: TagIcon, label: 'Pricing', value: 'In INR, inclusive of GST' },
      { icon: LockIcon, label: 'Orders', value: 'Prepaid store policies apply' },
      { icon: QualityIcon, label: 'Colours', value: 'May vary slightly by screen' },
    ]}
    sections={[
      {
        id: 'general',
        title: 'General Store Terms',
        body: <p className={P}>By accessing and placing orders on Suit Aura Girls, you agree to abide by our terms of service, pricing guidelines, and prepaid store policies.</p>,
      },
      {
        id: 'colour',
        title: 'Colour Accuracy & Small Variations',
        body: <p className={P}>We photograph every style as accurately as we can, but colours can look slightly different on different screens, and small differences in embroidery or print placement can occur from piece to piece.</p>,
      },
      {
        id: 'pricing-ip',
        title: 'Pricing & Intellectual Property',
        body: <p className={P}>All prices are listed in Indian Rupees (INR) and are inclusive of GST. All photographs, lookbooks, slogans ("Elegance That Feels Like You"), and designs are the intellectual property of Suit Aura Girls.</p>,
      },
    ]}
  />
);

export const CancellationPolicyPage: React.FC = () => (
  <PolicyWrapper
    page="cancellation-policy"
    title="Cancellation Policy"
    subtitle="Guidelines for cancelling or modifying an un-dispatched order"
    icon={pageIcon(PackageIcon)}
    facts={[
      { icon: PackageIcon, label: 'Cancel for free', value: 'Any time before dispatch' },
      { icon: SupportIcon, label: 'How', value: 'My account → Orders, or message us' },
      { icon: ReturnIcon, label: 'Refund', value: 'Full amount to source account' },
    ]}
    sections={[
      {
        id: 'window',
        title: 'Cancellation Window',
        body: <p className={P}>You can cancel your order free of cost while it is <S>still being processed</S> — that is, before it is packed and handed to the courier.</p>,
      },
      {
        id: 'how-to',
        title: 'How to Request Cancellation',
        body: (
          <>
            <p className={P}>Signed in? Open <S>My account → Orders</S> and tap <S>Cancel</S> on the order. You can also email <S>{SUPPORT_EMAIL}</S> or WhatsApp our support team ({SUPPORT_PHONE_DISPLAY}) with your Order ID.</p>
            <div className="flex flex-wrap gap-2">
              <ActionLink href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I would like to cancel my order. Order ID: ')}><WhatsAppIcon className="w-[18px] h-[18px]" /> WhatsApp us</ActionLink>
              <ActionLink href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Order cancellation')}`}><GmailIcon className="w-[18px] h-[18px]" /> Email us</ActionLink>
            </div>
          </>
        ),
      },
      {
        id: 'refund',
        title: 'Full Refund for Cancelled Orders',
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
    title="Comprehensive Size Guide"
    subtitle="Garment body measurements in inches and standard Indian size conversions"
    icon={<Ruler className="w-8 h-8 sm:w-9 sm:h-9 text-[#4B1D3F]" strokeWidth={1.6} />}
    facts={[
      { icon: TagIcon, label: 'Units', value: 'All measurements in inches' },
      { icon: HelpIcon, label: 'Between two sizes?', value: 'Choose the larger size' },
    ]}
    sections={[
      {
        id: 'chart',
        title: 'Size Chart',
        body: (
          <>
            <p className={P}>To find your flawless silhouette, measure yourself with a flexible tape over your undergarments. If your measurements fall between two sizes, we recommend choosing the larger size for a relaxed, comfortable ethnic drape.</p>
            <div className="overflow-x-auto sag-scroll-x rounded-2xl border border-[#4B1D3F]/12 -mx-1 sm:mx-0">
              <table className="w-full min-w-[560px] text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-[#4B1D3F] text-white">
                    {['Brand Size', 'Bust (Inches)', 'Waist (Inches)', 'Hip (Inches)', 'Kurta Length', 'Bottom Length'].map((h, i) => (
                      <th key={h} scope="col" className={`px-4 py-3.5 text-[12px] font-semibold tracking-[0.04em] text-white whitespace-nowrap ${i === 0 ? 'sticky left-0 bg-[#4B1D3F]' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#4B1D3F]/10">
                  {SIZE_ROWS.map(([size, ...cells], r) => (
                    <tr key={size} className={`${r % 2 ? 'bg-[#FBF7F3]' : 'bg-white'} hover:bg-[#F3EEF8] transition-colors`}>
                      <th scope="row" className={`px-4 py-3 font-semibold text-[#4B1D3F] whitespace-nowrap sticky left-0 ${r % 2 ? 'bg-[#FBF7F3]' : 'bg-white'}`}>{size}</th>
                      {cells.map((c, i) => <td key={i} className="px-4 py-3 text-[#2A1A26]/80 tabular-nums">{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-[#2A1A26]/55 sm:hidden">Swipe the table sideways to see every measurement.</p>
          </>
        ),
      },
      {
        id: 'measure',
        title: 'How To Measure Correctly',
        body: (
          <div className="grid gap-2.5 sm:grid-cols-3">
            {[
              ['Bust', 'Measure around the fullest part of your chest, keeping the tape comfortably horizontal.'],
              ['Waist', 'Measure around your natural waistline, typically an inch above the belly button.'],
              ['Hips', 'Measure around the fullest part of your hips and seat area.'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-[#F3EEF8] p-4">
                <p className="font-serif text-xl text-[#4B1D3F]">{k}</p>
                <p className="mt-1 text-sm leading-6 text-[#2A1A26]/75">{v}</p>
              </div>
            ))}
          </div>
        ),
      },
    ]}
  />
);
