import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { instagramProfile } from '../utils/instagram';
import { ChevronRight, Clock, Phone } from 'lucide-react';
import { GmailIcon, InstagramIcon, WhatsAppIcon } from './BrandIcons';
import { PinIcon, TruckIcon } from './StoreIcons';
import { InfoPageHeader } from './PolicyPages';
import { Icon } from '../aura';
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
  const optional = <span className="font-normal">(optional)</span>;
  const chevron = <ChevronRight strokeWidth={1.6} aria-hidden="true" />;
  const label = 'aa-flbl';

  return (
    <div id="contact-us-page" data-aura className="pb-14 lg:pb-20">
      <InfoPageHeader
        crumb="Contact us"
        eyebrow="Customer care"
        title="We are here to help"
        subtitle="Questions about sizing, styling or an order? Message us and our team will get back to you during support hours."
      >
        <p className="aa-pill mt-4 bg-surface whitespace-normal">
          <Clock className="w-4 h-4 shrink-0" strokeWidth={1.6} aria-hidden="true" /> Monday to Saturday · 10:00 AM – 7:00 PM IST
        </p>
      </InfoPageHeader>

      <div className="max-w-[1120px] mx-auto px-3 sm:px-6 pt-4 lg:pt-8 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-start">
        {/* Ways to reach us */}
        <div className="lg:col-span-5 min-w-0 space-y-2">
          {/* WhatsApp & call come first */}
          <section className="aa-tlc aura-dk sm:p-7" aria-labelledby="contact-whatsapp-title">
            <div className="flex items-start gap-3.5">
              <span className="aa-ic aa-ic-blush"><WhatsAppIcon mono className="w-[22px] h-[22px]" /></span>
              <div className="min-w-0 flex-1">
                <h2 id="contact-whatsapp-title" className="text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em]">WhatsApp &amp; call</h2>
                <p className="mt-1.5 text-[13.5px] leading-[19px] text-on-dark-muted">Monday to Saturday: 10:00 AM - 7:00 PM IST</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
              <a
                href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question regarding suits and orders.')}
                target="_blank"
                rel="noopener noreferrer"
                className="aura-btn px-4"
              >
                <span>Chat on WhatsApp</span>
              </a>
              <a className="aura-btn aura-btn-line aura-num px-4" href={telHref} aria-label={`Call ${SUPPORT_PHONE_DISPLAY}`}>
                <Phone strokeWidth={1.6} aria-hidden="true" /> {SUPPORT_PHONE_DISPLAY}
              </a>
            </div>
            <p className="mt-4 text-[13.5px] leading-[19px] text-on-dark-muted">Sunday: Closed for order fulfillment and scheduled dispatches. Sunday queries are attended to first thing Monday morning.</p>
          </section>

          {/* Email */}
          <section aria-label="Email us">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="aa-row items-start">
              <span className="aa-ic"><GmailIcon mono className="w-5 h-5" /></span>
              <span className="aa-row-t">
                <b>Email</b>
                <span className="block text-[14px] leading-5 text-ink underline decoration-[1.5px] underline-offset-4 break-all">{SUPPORT_EMAIL}</span>
                <small>Customer Support: Monday to Saturday, 10:00 AM - 7:00 PM IST</small>
              </span>
              {chevron}
            </a>
          </section>

          {/* Track order */}
          <section aria-label="Track your order">
            <button type="button" onClick={() => { setActivePage('track-order'); window.scrollTo(0, 0); }} className="aa-row">
              <span className="aa-ic"><TruckIcon mono live={false} className="w-5 h-5" /></span>
              <span className="aa-row-t">
                <b>Track order</b>
                <small>Enter the order number from your confirmation email.</small>
              </span>
              {chevron}
            </button>
          </section>

          {/* Store, Instagram */}
          <section aria-label="Other ways to reach us" className="space-y-2">
            <div className="aa-row cursor-default items-start">
              <span className="aa-ic"><PinIcon mono className="w-5 h-5" /></span>
              <div className="aa-row-t">
                <h2 className="text-[15.5px] leading-5 font-bold tracking-normal text-ink">Our store</h2>
                <p className="mt-0.5 text-[13.5px] leading-[19px] text-ink-muted">
                  {STORE_ADDRESS_LINES.map((line) => <React.Fragment key={line}>{line}<br /></React.Fragment>)}
                </p>
                <a className="sag-link text-[13.5px]" href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer">
                  View on Google Maps
                </a>
              </div>
            </div>

            <a href={instagram.url} target="_blank" rel="noopener noreferrer" className="aa-row">
              <span className="aa-ic"><InstagramIcon mono className="w-5 h-5" /></span>
              <span className="aa-row-t">
                <b>Instagram</b>
                <small>New styles first · <span className="font-semibold text-ink">{instagram.handle}</span></small>
              </span>
              {chevron}
            </a>
          </section>
        </div>

        {/* Contact form */}
        <div className="lg:col-span-7 aura-card aura-blk px-4 pt-6 pb-5 sm:p-8 min-w-0">
          {submitted ? (
            <div className="py-8 sm:py-12 text-center" role="status">
              <div className="aa-ic aa-ic-ink mx-auto h-14 w-14">
                <Icon name="check" draw className="in" />
              </div>
              <h2 className="aura-h2 aura-h-md mt-5">Thank <em>you!</em></h2>
              <p className="mt-3 text-[14.5px] leading-[21px] text-ink-muted max-w-sm mx-auto">
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
                className="aura-btn aura-btn-line mt-6"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="aura-h2 aura-h-md">Send us a <em>message</em></h2>
                <p className="text-[13.5px] leading-[19px] text-ink-muted mt-2">Fields marked * are required.</p>
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
                  <label htmlFor="contact-phone-input" className={label}>Phone <span className="font-normal">(optional, for WhatsApp)</span></label>
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
                className="aura-btn aura-btn-w"
              >
                <span>Send message</span>
                <Icon name="arrow" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
