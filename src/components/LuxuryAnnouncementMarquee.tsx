import React from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { prepaidPercentText, prepaidRulesFrom } from '../utils/prepaid';

type Part = { text: string; highlight?: boolean };

/**
 * Announcement bar: one still line on a dark strip above the header (rendered by Header on every page
 * except checkout; it scrolls away with the page). It shows the owner's announcement text or, without one,
 * the first offer that is really live in the store settings. With neither, nothing is rendered.
 * Nothing here is invented and nothing scrolls. (The file keeps its old name so imports stay valid.)
 */
export const LuxuryAnnouncementMarquee: React.FC = () => {
  const { storeOffers, freeShippingThreshold, comboOffer } = useShop();
  const { storeSettings } = useAdmin();

  const adminText = storeSettings?.announcementActive === false ? '' : (storeSettings?.announcementText || '').trim();
  const prepaidDiscount = Number(storeOffers?.prepaidDiscount) || 0;
  const prepaidPercentLine = prepaidPercentText(prepaidRulesFrom(storeOffers));

  let parts: Part[] | null = null;
  if (adminText) parts = [{ text: adminText }];
  else if (prepaidPercentLine) parts = [{ text: prepaidPercentLine }];
  else if (prepaidDiscount > 0) parts = [{ text: `₹${prepaidDiscount} off`, highlight: true }, { text: ' every prepaid order' }];
  else if (freeShippingThreshold > 0) parts = [{ text: 'Free shipping', highlight: true }, { text: ` on orders above ₹${freeShippingThreshold.toLocaleString('en-IN')}` }];
  else if (comboOffer) parts = [{ text: `Buy ${comboOffer.minItems} or more outfits and ` }, { text: `save ${comboOffer.percent}%`, highlight: true }];

  if (!parts) return null;

  return (
    <div id="luxury-announcement-marquee" role="region" aria-label="Store announcement" className="w-full bg-dark text-on-dark">
      <p className="max-w-7xl mx-auto h-8 px-4 flex items-center justify-center text-[13px] font-medium leading-none">
        <span className="truncate">
          {parts.map((part, index) => (
            <span key={index} className={part.highlight ? 'text-highlight font-semibold' : undefined}>{part.text}</span>
          ))}
        </span>
      </p>
    </div>
  );
};
