import React from 'react';
import { BadgePercent, Lock, MailCheck, PackageSearch, Truck, Zap } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { LockIcon, OrdersIcon, PackageIcon, TagIcon, TruckIcon } from './StoreIcons';
import { BagIcon } from './BrandIcons';

/** Moving strip of reasons to pay online. Built only from the store's real settings. */
export const PrepaidPerks: React.FC = () => {
  const { storeOffers } = useShop();
  const { prepaidDiscount, freeShippingThreshold, shippingCharge } = storeOffers;

  const perks = [
    prepaidDiscount > 0 && { icon: TagIcon, text: `Extra ₹${prepaidDiscount} off on every online payment` },
    shippingCharge === 0
      ? { icon: TruckIcon, text: 'Free shipping on every order' }
      : freeShippingThreshold > 0 && { icon: TruckIcon, text: `Free shipping above ₹${freeShippingThreshold.toLocaleString('en-IN')}` },
    { icon: BagIcon, text: 'Pay in seconds with UPI, cards or net banking' },
    { icon: LockIcon, text: '100% secure online checkout' },
    { icon: OrdersIcon, text: 'Instant order confirmation on email' },
    { icon: PackageIcon, text: 'Track your order anytime' },
  ].filter(Boolean) as Array<{ icon: React.FC<{ className?: string; mono?: boolean }>; text: string }>;

  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {perks.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-center gap-2 px-6 text-[13px] sm:text-sm whitespace-nowrap">
          <Icon className="w-[18px] h-[18px] text-[#E6DDF0]" mono />
          <span>{text}</span>
          <span className="ml-6 w-1 h-1 rounded-full bg-[#C5A46D]" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-label="Why pay online" className="sag-perks w-full overflow-hidden bg-[#4B1D3F] text-white py-3">
      <div className="sag-perks-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </section>
  );
};
