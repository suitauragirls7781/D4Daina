import React from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { ActivePage } from '../types';
import { STORE_ADDRESS, STORE_INSTAGRAM_URL, STORE_MAPS_URL, SUPPORT_PHONE_DISPLAY } from '../utils/storeContact';
import {
  Mail,
  Phone,
  Instagram,
  Facebook,
  Twitter,
  CreditCard,
  Lock,
  MessageSquare,
  MapPin,
} from 'lucide-react';

export const Footer: React.FC = () => {
  const { setActivePage } = useShop();
  const { storeSettings } = useAdmin();
  const whatsappDigits = (storeSettings?.whatsapp || SUPPORT_PHONE_DISPLAY).replace(/\D/g, '');
  const whatsappNumber = whatsappDigits.length === 10 ? `91${whatsappDigits}` : whatsappDigits;

  const handleLinkClick = (page: ActivePage) => {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer
      id="main-footer"
      className="w-full bg-[#3D0F1F] text-[#FAF5EB] pt-10 pb-20 border-t border-[#B8935A]/35 relative overflow-hidden"
    >
      {/* Editorial Mughal Mandala Backdrop Accent */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

        {/* Grid Section for Curated Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-12 border-b border-[#B8935A]/25">

          {/* Card 1: Brand Heritage & Core Contact details */}
          <div className="space-y-5 flex flex-col justify-between">
            <div className="space-y-3.5">
              <div className="space-y-1">
                <span className="font-serif text-2xl sm:text-3xl font-semibold text-[#FAF5EB] block">
                  {storeSettings?.storeName || 'Suit Aura Girls'}
                </span>
                <p className="font-serif italic text-xs text-[#DFBE65] tracking-widest uppercase">
                  &ldquo;{storeSettings?.tagline || 'Elegance That Feels Like You'}&rdquo;
                </p>
              </div>
              <p className="text-xs text-[#FAF5EB]/75 leading-relaxed font-normal">
                Regal, handcrafted ethnic wear tailored to perfection. Experience pure Artisan cottons, Chanderi silks, and Banarasi drapes designed for every milestone.
              </p>
            </div>

            <div className="space-y-3 pt-4 border-t border-[#B8935A]/25 text-xs text-[#FAF5EB]/85 font-medium">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4.5 h-4.5 text-[#DFBE65] shrink-0" />
                <a href={`mailto:${storeSettings?.storeEmail || 'suitauragirls@gmail.com'}`} className="hover:text-[#DFBE65] hover:underline transition truncate">
                  {storeSettings?.storeEmail || 'suitauragirls@gmail.com'}
                </a>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4.5 h-4.5 text-[#DFBE65] shrink-0" />
                <a
                  href={`https://wa.me/${whatsappNumber}?text=Hi%20Suit%20Aura%20Girls!%20I%20have%20a%20question.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#DFBE65] font-semibold hover:underline transition"
                >
                  {storeSettings?.phone || SUPPORT_PHONE_DISPLAY} (WhatsApp Order Help)
                </a>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4.5 h-4.5 text-[#DFBE65] shrink-0" />
                <div>
                  <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="hover:text-[#DFBE65] hover:underline transition">{STORE_ADDRESS}</a>
                  <p className="mt-1 text-[10px] text-[#FAF5EB]/70">Support: Mon-Sat, 10:00 AM - 7:00 PM IST. Sunday queries are answered Monday morning.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Support Concierge (Clickable Interactive Links) */}
          <div className="space-y-4 border-t border-[#B8935A]/25 pt-6 md:border-t-0 md:pt-0">
            <h4 className="font-serif font-semibold text-[#DFBE65] text-xs tracking-[0.2em] uppercase border-b border-[#B8935A]/20 pb-2.5">
              Concierge Desk
            </h4>

            <div className="flex flex-col space-y-2.5 text-xs font-normal">
              {([
                { label: 'Track Your Order', page: 'track-order' },
                { label: 'Returns & Exchanges', page: 'return-policy' },
                { label: 'Shipping & Delivery', page: 'shipping-policy' },
                { label: 'Size Guide', page: 'size-guide' },
                { label: 'Contact Us', page: 'contact' }
              ] as { label: string; page: ActivePage }[]).map((item) => (
                <button
                  key={item.page}
                  type="button"
                  onClick={() => handleLinkClick(item.page)}
                  className="text-left text-[#FAF5EB]/80 hover:text-[#DFBE65] transition-colors duration-200 flex items-center gap-2 group cursor-pointer py-1.5"
                >
                  <span className="w-1 h-1 rounded-full bg-[#B8935A]/50 group-hover:bg-[#DFBE65] transition"></span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Card 3: Socials & Direct WhatsApp Chat */}
          <div className="space-y-5 flex flex-col justify-between border-t border-[#B8935A]/25 pt-6 md:border-t-0 md:pt-0">
            <div className="space-y-4">
              <h4 className="font-serif font-semibold text-[#DFBE65] text-xs tracking-[0.2em] uppercase border-b border-[#B8935A]/20 pb-2.5">
                Join Our Community
              </h4>
              <p className="text-xs text-[#FAF5EB]/75 leading-relaxed font-normal">
                Follow our dressmaking journey, Artisan loom stories, and real client diaries.
              </p>

              {/* Circular Social Icons */}
              <div className="flex items-center gap-3 pt-1">
                {[
                  { icon: Instagram, href: storeSettings?.instagramUrl || STORE_INSTAGRAM_URL, label: 'Instagram' },
                  { icon: Facebook, href: storeSettings?.facebookUrl || '', label: 'Facebook' },
                  { icon: Twitter, href: storeSettings?.twitterUrl || '', label: 'Twitter' }
                ].filter((soc) => soc.href).map((soc, sIdx) => {
                  const IconComp = soc.icon;
                  return (
                    <a
                      key={sIdx}
                      href={soc.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={soc.label}
                      className="w-10 h-10 bg-transparent hover:bg-[#B8935A] text-[#DFBE65] hover:text-[#3D0F1F] border border-[#B8935A]/35 flex items-center justify-center transition-colors"
                    >
                      <IconComp className="w-4 h-4" />
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Direct Instant Concierge Contact */}
            <a
              href={`https://wa.me/${whatsappNumber}?text=Hi%20Suit%20Aura%20Girls!%20I%20have%20a%20question.`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#B8935A] hover:bg-[#DFBE65] text-[#3D0F1F] py-3.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors flex items-center justify-center gap-2 cursor-pointer border border-[#B8935A]"
            >
              <MessageSquare className="w-4.5 h-4.5" />
              <span>Chat on WhatsApp</span>
            </a>
          </div>

        </div>

        {/* Bottom Bar: Copyright & Payment Security */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-[#F1E8DF]/70">
          <div className="space-y-1 text-center md:text-left font-normal">
            <p>© 2026 {storeSettings?.storeName || 'Suit Aura Girls'}. All Rights Reserved.</p>
            <p className="text-gray-400">Designed for Handcrafted Grace and Uncompromised Elegance.</p>
          </div>

          {/* Trust Payment Security Tag */}
          <div className="flex items-center gap-3 px-4 py-2 border border-[#B8935A]/30">
            <Lock className="w-3.5 h-3.5 text-[#DFBE65]" />
            <span className="uppercase tracking-widest text-[9px] font-black text-[#FDFBF7]">256-Bit SSL • 100% Prepaid</span>
            <div className="flex items-center gap-1 text-[#DFBE65]">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
        </div>

      </div>

    </footer>
  );
};
