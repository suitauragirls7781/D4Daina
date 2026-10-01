import React, { useState, useMemo, useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { ActivePage } from '../types';

export interface MarqueeMessage {
  id: string;
  badge?: string;
  text: string;
  targetCategory?: string;
  targetPage?: ActivePage;
  actionType?: 'category' | 'page' | 'none';
}

/**
 * Scrolling brand strip (Admin → Homepage → "Brand Marquee"). Every line comes from real data:
 * the admin's announcement, live offers from the store settings, the store's own policies and the
 * collections that actually have products. No invented coupons, discounts or dispatch promises.
 */
export const LuxuryAnnouncementMarquee: React.FC = () => {
  const { activePage, selectedCategory, navigateToCategory, setActivePage, products = [], storeOffers, freeShippingThreshold, comboOffer } = useShop();
  const prepaidDiscount = storeOffers?.prepaidDiscount || 0;
  const { storeSettings } = useAdmin();
  const [isPaused, setIsPaused] = useState(false);

  const adminText = storeSettings?.announcementActive === false ? '' : (storeSettings?.announcementText || '').trim();

  const collections = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => counts.set(p.category, (counts.get(p.category) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [products]);

  const messages: MarqueeMessage[] = useMemo(() => {
    const list: MarqueeMessage[] = [];
    if (adminText) list.push({ id: 'admin', badge: 'Notice', text: adminText, actionType: 'none' });
    if (prepaidDiscount > 0) list.push({ id: 'prepaid', badge: 'Offer', text: `₹${prepaidDiscount} off every prepaid order`, actionType: 'category', targetCategory: 'All' });
    if (freeShippingThreshold > 0) list.push({ id: 'shipping', text: `Free shipping on orders above ₹${freeShippingThreshold.toLocaleString('en-IN')}`, actionType: 'category', targetCategory: 'All' });
    if (comboOffer) list.push({ id: 'combo', badge: 'Offer', text: `Buy ${comboOffer.minItems} or more outfits and save ${comboOffer.percent}%`, actionType: 'category', targetCategory: 'All' });

    list.push({ id: 'brand', text: 'Suit Aura Girls · Elegance That Feels Like You', actionType: 'none' });

    // On a collection page, lead with that collection; otherwise show the biggest real collections
    const current = activePage === 'shop' && selectedCategory && collections.includes(selectedCategory) ? selectedCategory : '';
    const featured = current ? [current] : collections.slice(0, 3);
    featured.forEach((name) => list.push({ id: `col-${name}`, text: `Explore ${name}`, actionType: 'category', targetCategory: name }));

    list.push({ id: 'returns', text: '7-day returns & exchanges', actionType: 'page', targetPage: 'return-policy' });
    list.push({ id: 'secure', text: 'Secure prepaid checkout · UPI, cards & net banking', actionType: 'none' });
    return list;
  }, [adminText, prepaidDiscount, freeShippingThreshold, comboOffer, collections, activePage, selectedCategory]);

  const handleMessageClick = useCallback((msg: MarqueeMessage) => {
    if (msg.actionType === 'category') navigateToCategory((msg.targetCategory || 'All') as any);
    else if (msg.actionType === 'page' && msg.targetPage) setActivePage(msg.targetPage);
  }, [navigateToCategory, setActivePage]);

  const renderMarqueeItem = (msg: MarqueeMessage, index: number, hidden: boolean) => {
    const interactive = msg.actionType && msg.actionType !== 'none';
    const content = (
      <>
        {msg.badge && (
          <span className="shrink-0 h-5 px-2 rounded-full border border-[#C5A46D]/70 text-[11px] font-semibold tracking-[0.04em] text-[#E8D2A4] inline-flex items-center">{msg.badge}</span>
        )}
        <span className="whitespace-nowrap text-white">{msg.text}</span>
        {interactive && <ArrowRight className="w-3.5 h-3.5 text-[#E6DDF0] opacity-70 group-hover/item:opacity-100 group-hover/item:translate-x-0.5 transition-all shrink-0" />}
      </>
    );
    return (
      <span key={`${msg.id}-${index}`} className="inline-flex items-center shrink-0">
        {interactive ? (
          <button type="button" tabIndex={hidden ? -1 : 0} onClick={() => handleMessageClick(msg)}
            className="group/item inline-flex items-center gap-2 text-[12px] sm:text-[13px] font-medium tracking-[0.02em] cursor-pointer hover:underline underline-offset-4 decoration-[#C5A46D]/70">
            {content}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 text-[12px] sm:text-[13px] font-medium tracking-[0.02em]">{content}</span>
        )}
        <span aria-hidden="true" className="mx-5 sm:mx-7 w-1 h-1 rounded-full bg-[#C5A46D] shrink-0" />
      </span>
    );
  };

  return (
    <div
      id="luxury-announcement-marquee"
      role="region"
      aria-label="Store announcements"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      className="relative w-full bg-[#4B1D3F] text-white select-none overflow-hidden group h-10 flex items-center"
    >
      <div className={`inline-flex items-center whitespace-nowrap will-change-transform animate-luxury-marquee ${isPaused ? 'marquee-paused' : ''}`}>
        {/* Track A + identical Track B for a seamless loop */}
        <div className="inline-flex items-center whitespace-nowrap shrink-0 pl-5">
          {messages.map((msg, idx) => renderMarqueeItem(msg, idx, false))}
        </div>
        <div className="inline-flex items-center whitespace-nowrap shrink-0 pl-5" aria-hidden="true">
          {messages.map((msg, idx) => renderMarqueeItem(msg, idx + 100, true))}
        </div>
      </div>
    </div>
  );
};
