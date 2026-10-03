import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { instagramProfile } from '../utils/instagram';
import { CheckCircle2, ChevronRight, Clock, Phone, Send } from 'lucide-react';
import { GmailIcon, InstagramIcon, WhatsAppIcon } from './BrandIcons';
import { PinIcon } from './StoreIcons';
import { InfoPageHeader } from './PolicyPages';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { markFirestoreQuotaExhausted, isQuotaExhausted } from '../utils/visitorTracker';
import { STORE_ADDRESS_LINES, STORE_INSTAGRAM_URL, STORE_MAPS_URL, SUPPORT_PHONE_DISPLAY, createSupportWhatsAppUrl } from '../utils/storeContact';

const SUPPORT_EMAIL = 'suitauragirls@gmail.com';

export const ContactUsPage: React.FC = () => {
  const { storeSettings } = useAdmin();
  const instagram = instagramProfile(storeSettings?.instagramUrl || STORE_INSTAGRAM_URL);
  const { showToast } = useShop();
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
  const optional = <span className="font-normal text-ink-muted">(optional)</span>;
  const helpBtn = 'inline-flex items-center justify-center gap-2 h-12 px-4 rounded-control bg-surface border-[1.5px] border-control text-[15px] font-semibold text-ink hover:bg-sunken transition-colors';
  const rowTitle = 'block font-sans text-sm leading-5 font-semibold text-ink';
  const rowSub = 'block text-[13px] leading-[18px] font-normal text-ink-muted mt-0.5';

  return (
    <div id="contact-us-page" className="bg-page pb-12 lg:pb-16">
      <InfoPageHeader
        crumb="Contact us"
        eyebrow="Customer care"
        title="We are here to help"
        subtitle="Questions about sizing, styling or an order? Message us and our team will get back to you during support hours."
      >
        <p className="mt-3 flex items-center gap-2 text-sm leading-5 font-semibold text-ink">
          <Clock className="w-[18px] h-[18px] shrink-0 text-ink-muted" aria-hidden="true" /> Monday to Saturday · 10:00 AM – 7:00 PM IST
        </p>
      </InfoPageHeader>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 lg:pt-8 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-start">
        {/* Ways to reach us */}
        <div className="lg:col-span-5 space-y-4 min-w-0">
          {/* WhatsApp & call */}
          <section className="sag-card p-4 sm:p-5" aria-labelledby="contact-whatsapp-title">
            <h2 id="contact-whatsapp-title" className="text-[17px] leading-6 font-semibold text-ink">WhatsApp &amp; call</h2>
            <p className="mt-1 text-sm leading-5 text-ink-muted">Monday to Saturday: 10:00 AM - 7:00 PM IST</p>
            <div className="mt-4 grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5">
              <a
                href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question regarding suits and orders.')}
                target="_blank"
                rel="noopener noreferrer"
                className={helpBtn}
              >
                <WhatsAppIcon className="w-5 h-5" />
                <span>Chat on WhatsApp</span>
              </a>
              <a className={`${helpBtn} sag-num`} href={telHref} aria-label={`Call ${SUPPORT_PHONE_DISPLAY}`}>
                <Phone className="w-[18px] h-[18px]" aria-hidden="true" /> {SUPPORT_PHONE_DISPLAY}
              </a>
            </div>
            <p className="mt-3 text-[13px] leading-[18px] text-ink-muted">Sunday: Closed for order fulfillment and scheduled dispatches. Sunday queries are attended to first thing Monday morning.</p>
          </section>

          {/* Email, store, Instagram */}
          <section className="sag-card px-4 sm:px-5" aria-label="Other ways to reach us">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="sag-row items-start py-3.5">
              <span className="shrink-0 flex mt-0.5"><GmailIcon mono className="w-5 h-5" /></span>
              <span className="min-w-0 flex-1">
                <span className={rowTitle}>Email</span>
                <span className="block text-[15px] leading-[22px] font-semibold text-brand underline underline-offset-[3px] break-all">{SUPPORT_EMAIL}</span>
                <span className={rowSub}>Customer Support: Monday to Saturday, 10:00 AM - 7:00 PM IST</span>
              </span>
              <ChevronRight className="w-4 h-4 text-ink-muted shrink-0 mt-1" aria-hidden="true" />
            </a>

            <div className="sag-row items-start py-3.5">
              <span className="shrink-0 flex mt-0.5"><PinIcon mono className="w-5 h-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 className={rowTitle}>Our store</h2>
                <p className="mt-0.5 text-sm leading-5 font-normal text-ink-muted">
                  {STORE_ADDRESS_LINES.map((line) => <React.Fragment key={line}>{line}<br /></React.Fragment>)}
                </p>
                <a className="sag-link" href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer">
                  View on Google Maps
                </a>
              </div>
            </div>

            <a href={instagram.url} target="_blank" rel="noopener noreferrer" className="sag-row items-start py-3.5">
              <span className="shrink-0 flex mt-0.5"><InstagramIcon mono className="w-5 h-5" /></span>
              <span className="min-w-0 flex-1">
                <span className={rowTitle}>Instagram</span>
                <span className={rowSub}>New styles first · <span className="font-semibold text-ink">{instagram.handle}</span></span>
              </span>
              <ChevronRight className="w-4 h-4 text-ink-muted shrink-0 mt-1" aria-hidden="true" />
            </a>
          </section>
        </div>

        {/* Contact form */}
        <div className="lg:col-span-7 sag-card p-4 sm:p-6 min-w-0">
          {submitted ? (
            <div className="py-8 sm:py-12 text-center" role="status">
              <div className="w-14 h-14 rounded-full bg-ok-tint border border-ok-line flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-ok" aria-hidden="true" />
              </div>
              <h2 className="mt-4 font-display text-[22px] leading-7 text-ink">Thank you!</h2>
              <p className="mt-2 text-[15px] leading-[22px] text-ink-muted max-w-sm mx-auto">
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
                className="sag-btn-outline mt-5 h-12 text-[15px]"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="text-[17px] leading-6 font-semibold text-ink">Send us a message</h2>
                <p className="text-[13px] leading-[18px] text-ink-muted mt-1">Fields marked * are required.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-name-input" className="sag-label">Your name *</label>
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
                  <label htmlFor="contact-email-input" className="sag-label">Email address *</label>
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
                  <label htmlFor="contact-phone-input" className="sag-label">Phone <span className="font-normal text-ink-muted">(optional, for WhatsApp)</span></label>
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
                  <label htmlFor="contact-order-input" className="sag-label">Order number {optional}</label>
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
                <label htmlFor="contact-message-input" className="sag-label">Your message *</label>
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
                <Send className="w-[18px] h-[18px]" aria-hidden="true" />
                <span>Send message</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
