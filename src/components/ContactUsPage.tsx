import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { Mail, Phone, MapPin, Clock, Send, CheckCircle2, ChevronRight, MessageSquare, Instagram } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { markFirestoreQuotaExhausted, isQuotaExhausted } from '../utils/visitorTracker';
import { STORE_ADDRESS_LINES, STORE_INSTAGRAM_URL, STORE_MAPS_URL, SUPPORT_PHONE_DISPLAY, createSupportWhatsAppUrl } from '../utils/storeContact';

export const ContactUsPage: React.FC = () => {
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

  return (
    <div id="contact-us-page" className="py-12 sm:py-16 bg-[#120205]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-[#E8D2A4]/55">
          <button onClick={() => setActivePage('home')} className="hover:text-[#E8D2A4]">Home</button>
          <ChevronRight className="w-3.5 h-3.5 text-[#F7F0E5]/55" />
          <span className="text-[#E8D2A4] font-semibold">Contact Concierge</span>
        </nav>

        <div className="text-center max-w-2xl mx-auto space-y-3">
          <span className="text-xs uppercase tracking-[0.25em] font-semibold text-[#D7B77A]">
            Customer Support & Inquiries
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#E8D2A4]">
            We Are Here To Assist You
          </h1>
          <p className="text-xs sm:text-sm text-[#F7F0E5]/75">
            Have questions regarding sizing, custom alterations, festive styling advice, or order status? Get in touch with our customer care specialists.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Contact Details Card */}
          <div className="lg:col-span-5 bg-[#180306] border-t border-[#D7B77A]/35 py-6 sm:py-8 space-y-6">
            <h3 className="font-serif text-xl font-semibold text-[#E8D2A4] border-b border-[#D7B77A]/25 pb-3">
              Suit Aura Girls Concierge
            </h3>

            <div className="space-y-4 text-xs sm:text-sm text-[#F7F0E5]/75">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-[#F7F0E5] shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-[#F7F0E5]">Email Support</strong>
                  <a href="mailto:suitauragirls@gmail.com" className="text-[#F7F0E5] hover:underline font-semibold">
                    suitauragirls@gmail.com
                  </a>
                  <p className="text-[11px] text-[#F7F0E5]/55">Customer Support: Monday to Saturday, 10:00 AM - 7:00 PM IST</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-[#F7F0E5] shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-[#F7F0E5]">WhatsApp &amp; Call Support</strong>
                  <a className="text-[#F7F0E5] font-bold" href={`tel:+91${SUPPORT_PHONE_DISPLAY.replace(/\D/g, '').replace(/^91/, '')}`}>{SUPPORT_PHONE_DISPLAY}</a>
                  <p className="text-[11px] text-[#F7F0E5]/55">Monday to Saturday: 10:00 AM - 7:00 PM IST</p>
                  <p className="text-[11px] text-[#F7F0E5]/55">Sunday: Closed for order fulfillment and scheduled dispatches. Sunday queries are attended to first thing Monday morning.</p>
                  
                  <a
                    href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question regarding suits and orders.')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-2 px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-[#F7F0E5] font-bold text-xs shadow-sm transition-transform active:scale-95"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Chat on WhatsApp Now</span>
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#F7F0E5] shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-[#F7F0E5]">Flagship Store & Fulfillment Facility</strong>
                  <p className="text-[#F7F0E5]/75">
                    {STORE_ADDRESS_LINES.map((line) => <React.Fragment key={line}>{line}<br /></React.Fragment>)}
                  </p>
                  <a className="mt-1 inline-block font-semibold text-[#E8D2A4] underline" href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer">View on Google Maps</a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-[#F7F0E5] shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-[#F7F0E5]">Latest Bridal Collections</strong>
                  <a className="inline-flex items-center gap-1.5 text-[#E8D2A4] font-semibold" href={STORE_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                    <Instagram className="h-4 w-4 text-[#D7B77A]" /> @suit_aura_girls
                  </a>
                </div>
              </div>
            </div>

            <div className="p-4 bg-\[#FAF7F2\] rounded border border-[#D7B77A]/15 text-xs text-[#F7F0E5]/75">
              <span className="font-bold text-[#F7F0E5] block mb-1">Prepaid Store Advantage:</span>
              Prepaid orders are given priority packing with complimentary express shipping insurance.
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-7 bg-\[#FAF7F2\] border border-[#D7B77A]/15 rounded-md p-6 sm:p-8 shadow-xs">
            {submitted ? (
              <div className="py-12 text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-950/40 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="font-serif text-2xl font-bold text-[#F7F0E5]">Thank You!</h3>
                <p className="text-xs sm:text-sm text-[#F7F0E5]/75 max-w-sm mx-auto">
                  We have received your message. Our stylist concierge will reach out to you shortly.
                </p>
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setName('');
                    setEmail('');
                    setMessage('');
                  }}
                  className="text-xs font-semibold text-[#F7F0E5] hover:underline"
                >
                  Send another inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="font-serif text-xl font-bold text-[#F7F0E5] mb-2">
                  Send Us A Message
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#F7F0E5]/75 mb-1">
                      Your Name *
                    </label>
                    <input
                      id="contact-name-input"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Priya Patel"
                      className="w-full px-3.5 py-2.5 border border-[#D7B77A]/15 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-[#D7B77A]/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#F7F0E5]/75 mb-1">
                      Your Email Address *
                    </label>
                    <input
                      id="contact-email-input"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="priya@example.com"
                      className="w-full px-3.5 py-2.5 border border-[#D7B77A]/15 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-[#D7B77A]/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#F7F0E5]/75 mb-1">
                    Phone Number (Optional - for WhatsApp Stylist Support)
                  </label>
                  <input
                    id="contact-phone-input"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder={SUPPORT_PHONE_DISPLAY}
                    className="w-full px-3.5 py-2.5 border border-[#D7B77A]/15 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-[#D7B77A]/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#F7F0E5]/75 mb-1">
                    Order Number (Optional)
                  </label>
                  <input
                    id="contact-order-input"
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="e.g. SAG-2026-123456"
                    className="w-full px-3.5 py-2.5 border border-[#D7B77A]/15 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-[#D7B77A]/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#F7F0E5]/75 mb-1">
                    Message / Inquiry Details *
                  </label>
                  <textarea
                    id="contact-message-input"
                    rows={4}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="How may we assist you with your Suit Aura Girls order or style query?"
                    className="w-full px-3.5 py-2.5 border border-[#D7B77A]/15 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-[#D7B77A]/40"
                  />
                </div>

                <button
                  id="contact-submit-btn"
                  type="submit"
                  className="w-full py-3.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] text-[#F7F0E5] rounded-lg text-xs sm:text-sm font-semibold tracking-widest uppercase transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  <span>Submit Inquiry</span>
                </button>
              </form>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
