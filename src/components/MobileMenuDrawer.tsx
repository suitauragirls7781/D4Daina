import React, { useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { ChevronRight, Package, User, Info, Headphones, X, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createSupportWhatsAppUrl } from '../utils/storeContact';

export const MobileMenuDrawer: React.FC = () => {
  const { 
    isMobileMenuOpen, 
    setIsMobileMenuOpen, 
    products = [], 
    navigateToCategory, 
    setActivePage 
  } = useShop();

  // Lock body scroll and prevent background shifting
  useEffect(() => {
    if (isMobileMenuOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.documentElement.style.overscrollBehavior = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.documentElement.style.overscrollBehavior = '';
    };
  }, [isMobileMenuOpen]);

  const getCategoryCount = (categoryName: string) => {
    if (!products) return 0;
    const activeProds = products.filter(p => p.inStock);
    if (categoryName === 'Sale') {
      return activeProds.filter(p => p.isSale || p.discount >= 36).length;
    }
    if (categoryName === 'Festive Wear') {
      return activeProds.filter(p => p.category === 'Festive Wear' || p.isFestive).length;
    }
    if (categoryName === 'Dupatta Sets') {
      return activeProds.filter(p => p.category === 'Dupatta Sets' || p.subcategory?.toLowerCase().includes('dupatta')).length;
    }
    return activeProds.filter(p => p.category === categoryName).length;
  };

  return (
    <AnimatePresence>
      {isMobileMenuOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            id="mobile-menu-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden fixed inset-0 bg-[#5C0B1B]/60 backdrop-blur-xs z-[9999] touch-none"
          />

          {/* Left Slide-over Drawer Panel */}
          <motion.div
            id="mobile-menu-drawer-panel"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
            className="lg:hidden fixed top-0 bottom-0 left-0 w-[85vw] max-w-[360px] bg-[#120205] z-[10000] flex flex-col h-full border-r border-[#D7B77A]/30 overscroll-contain select-none text-[#E8D2A4]"
          >
            {/* Drawer Header Area with Close button and Brand Logo */}
            <div className="p-5 border-b border-[#D7B77A]/30 bg-[#180306] flex items-center justify-between shrink-0">
              <div className="flex flex-col items-start">
                <img src="/suit-aura-logo.png" alt="Suit Aura Girls logo" className="w-36 h-[72px] object-contain object-left" />
                <span className="text-[9px] uppercase tracking-[0.15em] text-[#D7B77A] font-semibold mt-0.5">
                  House of Artisan Couture
                </span>
              </div>
              <button
                id="close-mobile-menu"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-10 h-10 bg-transparent hover:bg-[#D7B77A] hover:text-[#F7F0E5] text-[#E8D2A4] transition-colors flex items-center justify-center border border-[#D7B77A]/35 cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content Region */}
            <div className="flex-1 overflow-y-auto p-5 pb-16 space-y-6 scrollbar-thin">
              
              {/* Couture Statement Badge */}
              <div className="bg-[#2A0710] text-[#E8D2A4] p-3 border border-[#D7B77A]/25 text-center">
                <p className="text-[9px] text-[#E8D2A4] tracking-wider uppercase font-semibold">
                  Handcrafted Silhouettes • Authentic Artisan Couture
                </p>
              </div>

              {/* Collections Navigation Group */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#F7F0E5] px-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D7B77A]"></span>
                  Shop Collections
                </p>

                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { name: 'Suits', label: 'Suits', desc: `${getCategoryCount('Suits')}+ Silk & Cotton` },
                    { name: 'Kurtis', label: 'Kurtis', desc: `${getCategoryCount('Kurtis')}+ Classics` },
                    { name: 'Anarkali', label: 'Anarkali', desc: `${getCategoryCount('Anarkali')}+ Kalis` },
                    { name: 'Dresses', label: 'Dresses', desc: `${getCategoryCount('Dresses')}+ Ensembles` },
                    { name: 'Dupatta Sets', label: 'Dupatta Sets', desc: `${getCategoryCount('Dupatta Sets')}+ Weaves` },
                    { name: 'Co-ord Sets', label: 'Co-ord Sets', desc: `${getCategoryCount('Co-ord Sets')}+ Flares` },
                    { name: 'Festive Wear', label: 'Festive Wear', desc: `${getCategoryCount('Festive Wear')}+ Luminous` },
                    { name: 'Sale', label: 'Sale', desc: `${getCategoryCount('Sale')}+ Special Sale`, isSale: true }
                  ].map((cat) => (
                    <button
                      key={cat.name}
                      id={`mobile-drawer-cat-${cat.name.toLowerCase().replace(/\s+/g, '-')}`}
                      onClick={() => {
                        navigateToCategory(cat.name as any);
                        setIsMobileMenuOpen(false);
                      }}
                      className="relative overflow-hidden p-3.5 text-left bg-[#180306] hover:bg-[#120205] border border-[#D7B77A]/25 transition-colors cursor-pointer flex flex-col justify-between min-h-[82px] group"
                    >
                      <div>
                        <p className={`text-[8px] font-extrabold uppercase tracking-wider ${cat.isSale ? 'text-red-600' : 'text-[#F7F0E5]'}`}>
                          {cat.desc}
                        </p>
                        <h4 className="font-serif text-sm font-semibold mt-0.5 text-[#E8D2A4]">
                          {cat.label}
                        </h4>
                      </div>

                      <div className="mt-1 flex items-center justify-end w-full">
                        <span className="p-0.5 rounded-full text-xs bg-[#5C0B1B] group-hover:bg-[#D7B77A] text-[#F7F0E5] group-hover:text-[#F7F0E5] transition-colors duration-200">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Utility / Customer Service Section */}
              <div className="pt-5 border-t border-[#D7B77A]/20 space-y-3">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#F7F0E5] px-1">
                  Customer Experience
                </p>
                
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    id="mobile-nav-track-order"
                    onClick={() => {
                      setActivePage('track-order');
                      setIsMobileMenuOpen(false);
                    }}
                    className="p-3 bg-[#180306] hover:bg-[#5C0B1B]/5 text-[#F7F0E5] rounded border border-[#D7B77A]/25 shadow-2xs flex flex-col items-start gap-1 transition-all text-left cursor-pointer group"
                  >
                    <Package className="w-4 h-4 text-[#F7F0E5] group-hover:text-[#F7F0E5] transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-wider">Track Order</span>
                  </button>

                  <button
                    id="mobile-nav-profile"
                    onClick={() => {
                      setActivePage('account');
                      setIsMobileMenuOpen(false);
                    }}
                    className="p-3 bg-[#180306] hover:bg-[#5C0B1B]/5 text-[#F7F0E5] rounded border border-[#D7B77A]/25 shadow-2xs flex flex-col items-start gap-1 transition-all text-left cursor-pointer group"
                  >
                    <User className="w-4 h-4 text-[#F7F0E5] group-hover:text-[#F7F0E5] transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-wider">My Profile</span>
                  </button>

                  <button
                    id="mobile-nav-about"
                    onClick={() => {
                      setActivePage('about');
                      setIsMobileMenuOpen(false);
                    }}
                    className="p-3 bg-[#180306] hover:bg-[#5C0B1B]/5 text-[#F7F0E5] rounded border border-[#D7B77A]/25 shadow-2xs flex flex-col items-start gap-1 transition-all text-left cursor-pointer group"
                  >
                    <Info className="w-4 h-4 text-[#F7F0E5] group-hover:text-[#F7F0E5] transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-wider">About Us</span>
                  </button>

                  <button
                    id="mobile-nav-contact"
                    onClick={() => {
                      setActivePage('contact');
                      setIsMobileMenuOpen(false);
                    }}
                    className="p-3 bg-[#180306] hover:bg-[#5C0B1B]/5 text-[#F7F0E5] rounded border border-[#D7B77A]/25 shadow-2xs flex flex-col items-start gap-1 transition-all text-left cursor-pointer group"
                  >
                    <Headphones className="w-4 h-4 text-[#F7F0E5] group-hover:text-[#F7F0E5] transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-wider">VIP Support</span>
                  </button>
                </div>

                {/* Suit Aura Girls Official WhatsApp Concierge Card */}
                <a
                  id="mobile-menu-whatsapp-concierge"
                  href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I need assistance with sizing or my order.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center justify-between p-3.5 bg-gradient-to-r from-[#5C0B1B] to-[#2B0914] text-[#F7F0E5] rounded-md border border-[#D7B77A]/40 shadow-md transition-all active:scale-[0.98] cursor-pointer group hover:border-[#D7B77A]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded bg-[#25D366]/20 border border-[#25D366]/50 flex items-center justify-center shrink-0 text-[#25D366]">
                      <MessageSquare className="w-4.5 h-4.5 fill-[#25D366]/30 stroke-[2]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold tracking-wide flex items-center gap-1.5 text-[#F7F0E5] truncate">
                        Suit Aura Girls Support Desk
                        <span className="text-[8px] bg-emerald-500/25 text-emerald-300 font-extrabold px-1.5 py-0.5 rounded-full border border-emerald-400/30 uppercase tracking-widest flex items-center gap-1 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                          ONLINE
                        </span>
                      </div>
                      <div className="text-[10px] text-[#F7F0E5]/55 font-medium mt-0.5 truncate">Direct WhatsApp Connect • Sizing & Orders</div>
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-[#2A0710]/10 group-hover:bg-[#D7B77A] group-hover:text-[#F7F0E5] text-[#F7F0E5] flex items-center justify-center shrink-0 transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                </a>
              </div>

              {/* Aesthetic Footer Note */}
              <div className="pt-6 text-center space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-[#F7F0E5] font-extrabold">
                        Suit Aura Girls
                </p>
                <p className="text-[8px] text-[#F7F0E5]/55">
                  Version 2.4.0 • Secured Checkout Guaranteed
                </p>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
