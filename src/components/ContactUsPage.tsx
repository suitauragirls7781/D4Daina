import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { instagramProfile } from '../utils/instagram';
import { Check, ChevronRight, Clock, Phone } from 'lucide-react';
import { GmailIcon, InstagramIcon, WhatsAppIcon } from './BrandIcons';
import { PinIcon, TruckIcon } from './StoreIcons';
import { InfoPageHeader } from './PolicyPages';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { markFirestoreQuotaExhausted, isQuotaExhausted } from '../utils/visitorTracker';
import { DEFAULT_SUPPORT_EMAIL, STORE_ADDRESS_LINES, STORE_INSTAGRAM_URL, STORE_MAPS_URL, SUPPORT_PHONE_DISPLAY, createSupportWhatsAppUrl } from '../utils/storeContact';


export const ContactUsPage: React.FC = () => {
  const { storeSettings } = useAdmin();
  const SUPPORT_EMAIL = storeSettings?.storeEmail || DEFAULT_SUPPORT_EMAIL;
  const instagram = instagramProfile(storeSettings?.instagramUrl || STORE_INSTAGRAM_URL);
  const { showToast, setActivePage } = useShop();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    try {
      if (!isQuotaExhausted()) {
        await addDoc(collection(db, 'leads'), {
          name,
          email,
          phone: phone || null,
          source: 'contact',
          message,
          orderNumber: orderNumber || null,
          createdAt: new Date().toISOString(),
          offerSent: false
        });
      }
      setSubmitted(true);
      showToast('Your message has been received. Our team will reply during support hours.', 'success');
    } catch (error: any) {
      if (error?.code === 'resource-exhausted' || error?.message?.includes('Quota')) {
        markFirestoreQuotaExhausted();
      }
      setSubmitted(true);
      showToast('Your message has been received. Our team will reply during support hours.', 'success');
    }
  };

  const telHref = `tel:+91${SUPPORT_PHONE_DISPLAY.replace(/\D/g, '').replace(/^91/, '')}`;
  const optional = <span className="normal-case tracking-normal">(optional)</span>;
  const row = 'flex items-start gap-3 border-b border-line py-[15px]';
  const rowIcon = 'shrink-0 flex text-sale mt-0.5';
  const rowTitle = 'block font-sans text-sm leading-5 font-normal text-ink';
  const rowSub = 'block text-[11.5px] leading-4 font-normal text-ink-muted mt-0.5';
  const chevron = <ChevronRight className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" strokeWidth={1.5} aria-hidden="true" />;
  const label = 'sag-label text-[11.5px] leading-4 font-normal uppercase tracking-[0.06em] text-ink-muted';

  return (
    <div id="contact-us-page" className="bg-page pb-12 lg:pb-16">
      <InfoPageHeader
        crumb="Contact us"
        eyebrow="Customer care"
        title="We are here to help"
        subtitle="Questions about sizing, styling or an order? Message us and our team will get back to you during support hours."
      >
        <p className="mt-3 flex items-center gap-2 text-[13px] leading-[18px] text-ink">
          <Clock className="w-4 h-4 shrink-0 text-sale" strokeWidth={1.5} aria-hidden="true" /> Monday to Saturday · 10:00 AM – 7:00 PM IST
        </p>
      </InfoPageHeader>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 lg:pt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
        {/* Ways to reach us */}
        <div className="lg:col-span-5 min-w-0">
          {/* WhatsApp & call come first */}
          <section className="border border-line bg-surface p-4 sm:p-5" aria-labelledby="contact-whatsapp-title">
            <div className="flex items-start gap-3">
              <span className="shrink-0 flex text-sale mt-0.5"><WhatsAppIcon mono className="w-[22px] h-[22px]" /></span>
              <div className="min-w-0 flex-1">
                <h2 id="contact-whatsapp-title" className="font-sans text-sm leading-5 font-semibold text-ink">WhatsApp &amp; call</h2>
                <p className="mt-0.5 text-[11.5px] leading-4 text-ink-muted">Monday to Saturday: 10:00 AM - 7:00 PM IST</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5">
              <a
                href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question regarding suits and orders.')}
                target="_blank"
                rel="noopener noreferrer"
                className="sag-btn-primary h-12 px-4"
              >
                <span>Chat on WhatsApp</span>
              </a>
              <a className="sag-btn-outline sag-num h-12 px-4 gap-2" href={telHref} aria-label={`Call ${SUPPORT_PHONE_DISPLAY}`}>
                <Phone className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" /> {SUPPORT_PHONE_DISPLAY}
              </a>
            </div>
            <p className="mt-3 text-[11.5px] leading-4 text-ink-muted">Sunday: Closed for order fulfillment and scheduled dispatches. Sunday queries are attended to first thing Monday morning.</p>
          </section>

          {/* Email */}
          <section className="mt-2" aria-label="Email us">
            <a href={`mailto:${SUPPORT_EMAIL}`} className={row}>
              <span className={rowIcon}><GmailIcon mono className="w-5 h-5" /></span>
              <span className="min-w-0 flex-1">
                <span className={rowTitle}>Email</span>
                <span className="block text-[13px] leading-[18px] text-ink underline decoration-1 underline-offset-4 break-all">{SUPPORT_EMAIL}</span>
                <span className={rowSub}>Customer Support: Monday to Saturday, 10:00 AM - 7:00 PM IST</span>
              </span>
              {chevron}
            </a>
          </section>

          {/* Track order */}
          <section aria-label="Track your order">
            <button type="button" onClick={() => { setActivePage('track-order'); window.scrollTo(0, 0); }} className={`${row} w-full text-left cursor-pointer`}>
              <span className={rowIcon}><TruckIcon mono live={false} className="w-5 h-5" /></span>
              <span className="min-w-0 flex-1">
                <span className={rowTitle}>Track order</span>
                <span className={rowSub}>Enter the order number from your confirmation email.</span>
              </span>
              {chevron}
            </button>
          </section>

          {/* Store, Instagram */}
          <section aria-label="Other ways to reach us">
            <div className={row}>
              <span className={rowIcon}><PinIcon mono className="w-5 h-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 className={rowTitle}>Our store</h2>
                <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">
                  {STORE_ADDRESS_LINES.map((line) => <React.Fragment key={line}>{line}<br /></React.Fragment>)}
                </p>
                <a className="sag-link text-[12.5px]" href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer">
                  View on Google Maps
                </a>
              </div>
            </div>

            <a href={instagram.url} target="_blank" rel="noopener noreferrer" className={row}>
              <span className={rowIcon}><InstagramIcon mono className="w-5 h-5" /></span>
              <span className="min-w-0 flex-1">
                <span className={rowTitle}>Instagram</span>
                <span className={rowSub}>New styles first · <span className="font-medium text-ink">{instagram.handle}</span></span>
              </span>
              {chevron}
            </a>
          </section>
        </div>

        {/* Contact form */}
        <div className="lg:col-span-7 border border-line bg-surface p-4 sm:p-6 min-w-0">
          {submitted ? (
            <div className="py-8 sm:py-12 text-center" role="status">
              <div className="w-[54px] h-[54px] rounded-full border border-ink text-ink flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <h2 className="mt-4 font-display text-[22px] leading-7 font-medium text-ink">Thank you!</h2>
              <p className="mt-2 text-[13px] leading-[18px] text-ink-muted max-w-sm mx-auto">
                We have received your message. Our team will reach out to you during support hours.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setName('');
                  setEmail('');
                  setMessage('');
                }}
                className="sag-btn-outline mt-5 h-12"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="font-display text-[19px] leading-6 font-medium text-ink">Send us a message</h2>
                <p className="text-[11.5px] leading-4 text-ink-muted mt-1">Fields marked * are required.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-name-input" className={label}>Your name *</label>
                  <input
                    id="contact-name-input"
                    type="text"
                    required
                    autoComplete="name"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Priya Patel"
                    className="sag-input"
                  />
                </div>

                <div>
                  <label htmlFor="contact-email-input" className={label}>Email address *</label>
                  <input
                    id="contact-email-input"
                    type="email"
                    inputMode="email"
                    required
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="next"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="priya@example.com"
                    className="sag-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-phone-input" className={label}>Phone <span className="normal-case tracking-normal">(optional, for WhatsApp)</span></label>
                  <input
                    id="contact-phone-input"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    enterKeyHint="next"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="10-digit mobile number"
                    className="sag-input"
                  />
                </div>

                <div>
                  <label htmlFor="contact-order-input" className={label}>Order number {optional}</label>
                  <input
                    id="contact-order-input"
                    type="text"
                    enterKeyHint="next"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="e.g. SAG-2026-123456"
                    className="sag-input"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contact-message-input" className={label}>Your message *</label>
                <textarea
                  id="contact-message-input"
                  rows={5}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="How can we help with your order or style question?"
                  className="sag-input resize-y min-h-[136px]"
                />
              </div>

              <button
                id="contact-submit-btn"
                type="submit"
                className="sag-btn-primary w-full gap-2"
              >
                <span>Send message</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
