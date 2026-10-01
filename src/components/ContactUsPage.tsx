import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { instagramProfile } from '../utils/instagram';
import { CheckCircle2, ChevronRight, Clock, Phone, Send } from 'lucide-react';
import { GmailIcon, InstagramIcon, WhatsAppIcon } from './BrandIcons';
import { PinIcon, SupportIcon } from './StoreIcons';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { markFirestoreQuotaExhausted, isQuotaExhausted } from '../utils/visitorTracker';
import { STORE_ADDRESS_LINES, STORE_INSTAGRAM_URL, STORE_MAPS_URL, SUPPORT_PHONE_DISPLAY, createSupportWhatsAppUrl } from '../utils/storeContact';

const SUPPORT_EMAIL = 'suitauragirls@gmail.com';

export const ContactUsPage: React.FC = () => {
  const { storeSettings } = useAdmin();
  const instagram = instagramProfile(storeSettings?.instagramUrl || STORE_INSTAGRAM_URL);
  const { setActivePage, showToast } = useShop();
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
  const label = 'block text-[13px] font-medium text-[#2A1A26]/80 mb-1.5';
  const field = 'w-full h-12 px-4 rounded-full bg-white border border-[#4B1D3F]/15 text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-4 focus:ring-[#F3EEF8] transition';
  const card = 'sag-card rounded-3xl p-5 sm:p-6';

  return (
    <div id="contact-us-page" className="bg-[#FBF7F3] pb-14 sm:pb-20">
      {/* Title band */}
      <div className="bg-[#F3EEF8] border-b border-[#4B1D3F]/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10 sm:pt-8 sm:pb-14">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-[#2A1A26]/60">
            <button onClick={() => setActivePage('home')} className="hover:text-[#4B1D3F] cursor-pointer">Home</button>
            <ChevronRight className="w-3.5 h-3.5 text-[#4B1D3F]/40" />
            <span className="text-[#4B1D3F] font-medium">Contact us</span>
          </nav>
          <div className="mt-8 sm:mt-10 text-center max-w-2xl mx-auto">
            <p className="sag-eyebrow">Customer care</p>
            <h1 className="font-serif text-[38px] leading-[1.05] sm:text-6xl text-[#4B1D3F] mt-3">We are here to help</h1>
            <p className="mt-4 text-[15px] sm:text-base leading-7 text-[#2A1A26]/75">
              Questions about sizing, styling or an order? Message us and our team will get back to you during support hours.
            </p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white border border-[#4B1D3F]/10 px-4 py-2 text-[13px] text-[#2A1A26]/75">
              <Clock className="w-4 h-4 text-[#4B1D3F]" /> Monday to Saturday · 10:00 AM – 7:00 PM IST
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
        {/* Ways to reach us */}
        <div className="lg:col-span-5 space-y-3 sm:space-y-4">
          {/* WhatsApp & call */}
          <div className={card}>
            <div className="flex items-start gap-4">
              <span className="w-12 h-12 rounded-full bg-[#F3EEF8] flex items-center justify-center shrink-0"><WhatsAppIcon className="w-6 h-6" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-2xl leading-tight text-[#4B1D3F]">WhatsApp &amp; call</h2>
                <a className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#2A1A26] hover:text-[#4B1D3F]" href={telHref}>
                  <Phone className="w-4 h-4 text-[#4B1D3F]" /> {SUPPORT_PHONE_DISPLAY}
                </a>
                <p className="mt-1 text-sm text-[#2A1A26]/65">Monday to Saturday: 10:00 AM - 7:00 PM IST</p>
                <p className="mt-1 text-sm text-[#2A1A26]/65">Sunday: Closed for order fulfillment and scheduled dispatches. Sunday queries are attended to first thing Monday morning.</p>
                <a
                  href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question regarding suits and orders.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sag-btn-primary mt-4 inline-flex items-center gap-2 h-11 px-5 text-sm font-semibold"
                >
                  <WhatsAppIcon mono className="w-[18px] h-[18px] text-white" />
                  <span>Chat on WhatsApp</span>
                </a>
              </div>
            </div>
          </div>

          {/* Email */}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={`${card} flex items-center gap-4 group`}>
            <span className="w-12 h-12 rounded-full bg-[#F3EEF8] flex items-center justify-center shrink-0"><GmailIcon className="w-6 h-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-2xl leading-tight text-[#4B1D3F]">Email</span>
              <span className="block text-[15px] font-semibold text-[#2A1A26] break-all group-hover:text-[#4B1D3F]">{SUPPORT_EMAIL}</span>
              <span className="block text-sm text-[#2A1A26]/65 mt-0.5">Customer Support: Monday to Saturday, 10:00 AM - 7:00 PM IST</span>
            </span>
            <ChevronRight className="w-5 h-5 text-[#4B1D3F]/40 shrink-0" />
          </a>

          {/* Store */}
          <div className={card}>
            <div className="flex items-start gap-4">
              <span className="w-12 h-12 rounded-full bg-[#F3EEF8] flex items-center justify-center shrink-0"><PinIcon className="w-6 h-6" /></span>
              <div className="min-w-0">
                <h2 className="font-serif text-2xl leading-tight text-[#4B1D3F]">Our store</h2>
                <p className="mt-1 text-sm leading-6 text-[#2A1A26]/75">
                  {STORE_ADDRESS_LINES.map((line) => <React.Fragment key={line}>{line}<br /></React.Fragment>)}
                </p>
                <a className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#4B1D3F] hover:underline underline-offset-4" href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer">
                  View on Google Maps <ChevronRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>

          {/* Instagram */}
          <a href={instagram.url} target="_blank" rel="noopener noreferrer" className={`${card} flex items-center gap-4 group`}>
            <span className="w-12 h-12 rounded-full bg-[#F3EEF8] flex items-center justify-center shrink-0"><InstagramIcon className="w-6 h-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-2xl leading-tight text-[#4B1D3F]">Instagram</span>
              <span className="block text-sm text-[#2A1A26]/65">New styles first · <span className="font-semibold text-[#2A1A26] group-hover:text-[#4B1D3F]">{instagram.handle}</span></span>
            </span>
            <ChevronRight className="w-5 h-5 text-[#4B1D3F]/40 shrink-0" />
          </a>
        </div>

        {/* Contact form */}
        <div className="lg:col-span-7 sag-card rounded-3xl p-5 sm:p-8">
          {submitted ? (
            <div className="py-10 sm:py-14 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-700" />
              </div>
              <h2 className="font-serif text-3xl text-[#4B1D3F]">Thank you!</h2>
              <p className="text-[15px] leading-7 text-[#2A1A26]/75 max-w-sm mx-auto">
                We have received your message. Our team will reach out to you during support hours.
              </p>
              <button
                onClick={() => {
                  setSubmitted(false);
                  setName('');
                  setEmail('');
                  setMessage('');
                }}
                className="sag-btn-outline h-11 px-6 text-sm font-semibold cursor-pointer"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-start gap-3.5 mb-2">
                <span className="w-11 h-11 rounded-full bg-[#F3EEF8] flex items-center justify-center shrink-0"><SupportIcon className="w-6 h-6" /></span>
                <div>
                  <h2 className="font-serif text-[28px] leading-tight text-[#4B1D3F]">Send us a message</h2>
                  <p className="text-sm text-[#2A1A26]/65 mt-0.5">Fields marked * are required.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-name-input" className={label}>Your name *</label>
                  <input
                    id="contact-name-input"
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Priya Patel"
                    className={field}
                  />
                </div>

                <div>
                  <label htmlFor="contact-email-input" className={label}>Email address *</label>
                  <input
                    id="contact-email-input"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="priya@example.com"
                    className={field}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-phone-input" className={label}>Phone <span className="text-[#2A1A26]/50 font-normal">(optional, for WhatsApp)</span></label>
                  <input
                    id="contact-phone-input"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="10-digit mobile number"
                    className={field}
                  />
                </div>

                <div>
                  <label htmlFor="contact-order-input" className={label}>Order number <span className="text-[#2A1A26]/50 font-normal">(optional)</span></label>
                  <input
                    id="contact-order-input"
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="e.g. SAG-2026-123456"
                    className={field}
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
                  className="w-full px-4 py-3 rounded-2xl bg-white border border-[#4B1D3F]/15 text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-4 focus:ring-[#F3EEF8] transition resize-y min-h-[140px]"
                />
              </div>

              <button
                id="contact-submit-btn"
                type="submit"
                className="sag-btn-primary w-full h-12 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4 text-white" />
                <span>Send message</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
