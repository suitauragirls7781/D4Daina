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
          <li key={text} className="aura-lt flex h-11 shrink-0 items-center gap-2.5 rounded-full bg-surface pl-1.5 pr-4 text-[14px] leading-[18px] whitespace-nowrap text-ink">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${sale ? 'bg-blush text-ink' : 'bg-sunken text-ink'}`}><Icon className="w-[17px] h-[17px]" mono /></span>
            <span className={sale ? 'font-bold' : 'font-semibold'}>{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
