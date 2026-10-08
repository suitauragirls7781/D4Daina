import React from 'react';
import { useShop } from '../context/ShopContext';
import { prepaidPercentText, prepaidRulesFrom } from '../utils/prepaid';
import { LockIcon, OrdersIcon, PackageIcon, TagIcon, TruckIcon } from './StoreIcons';
import { BagIcon } from './BrandIcons';

/** Still strip of reasons to pay online (swipe sideways on phones). Built only from the store's real settings. */
export const PrepaidPerks: React.FC = () => {
  const { storeOffers } = useShop();
  const { prepaidDiscount, freeShippingThreshold, shippingCharge } = storeOffers;
  const prepaidPercentLine = prepaidPercentText(prepaidRulesFrom(storeOffers));

  const perks = [
    prepaidDiscount > 0 && { icon: TagIcon, text: `Extra ₹${prepaidDiscount} off on every online payment`, sale: true },
    prepaidPercentLine && { icon: TagIcon, text: prepaidPercentLine, sale: true },
    shippingCharge === 0
      ? { icon: TruckIcon, text: 'Free shipping on every order', sale: true }
      : freeShippingThreshold > 0 && { icon: TruckIcon, text: `Free shipping above ₹${freeShippingThreshold.toLocaleString('en-IN')}`, sale: true },
    { icon: BagIcon, text: 'Pay in seconds with any UPI app' },
    { icon: LockIcon, text: 'Secure online checkout' },
    { icon: OrdersIcon, text: 'Order confirmation on email' },
    { icon: PackageIcon, text: 'Track your order anytime' },
  ].filter(Boolean) as Array<{ icon: React.FC<{ className?: string; mono?: boolean }>; text: string; sale?: boolean }>;

  return (
    <section aria-label="Why pay online" className="w-full py-2">
      <ul className="sag-scroll-x sag-num max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {perks.map(({ icon: Icon, text, sale }) => (
          <li key={text} className="flex h-9 shrink-0 items-center gap-2 rounded-full! border border-line bg-white/[0.08] px-3.5 text-[12.5px] leading-[18px] whitespace-nowrap text-ink">
            <span className="flex shrink-0 text-sale"><Icon className="w-[18px] h-[18px]" mono /></span>
            <span className={sale ? 'font-medium' : undefined}>{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
