import React from 'react';
import type { StoreIconProps } from './StoreIcons';

/**
 * Extra marks for the account area, drawn in the same duotone language as StoreIcons
 * (plum outline, lavender fill, champagne-gold accent). `mono` uses the text colour.
 */
export const StyleIcon: React.FC<StoreIconProps> = ({ className = 'w-5 h-5', mono = false, live = true }) => {
  const line = mono ? 'currentColor' : '#4B1D3F';
  const fill = mono ? 'currentColor' : '#E6DDF0';
  const gold = mono ? 'currentColor' : '#C5A46D';
  return (
    <svg viewBox="0 0 24 24" className={`${className} sag-ic ${live ? 'sag-live sag-a-tilt' : ''}`} role="img" aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.4 3.6 12 8.4a2.6 2.6 0 0 0 1.6 1.6l4.8 1.6-4.8 1.6a2.6 2.6 0 0 0-1.6 1.6l-1.6 4.8-1.6-4.8a2.6 2.6 0 0 0-1.6-1.6L2.4 11.6 7.2 10a2.6 2.6 0 0 0 1.6-1.6Z" fill={fill} fillOpacity={mono ? 0.16 : 1} stroke={line} strokeWidth={1.7} />
      <path d="M18.4 2.8v3.6M16.6 4.6h3.6" stroke={mono ? 'currentColor' : gold} strokeWidth={1.7} className={mono ? undefined : 'sag-p-gold'} />
      <circle cx="19.2" cy="18.6" r="1.3" fill={gold} className={mono ? undefined : 'sag-p-gold'} />
    </svg>
  );
};

/** Receipt / invoice sheet with a folded gold corner. */
export const ReceiptIcon: React.FC<StoreIconProps> = ({ className = 'w-5 h-5', mono = false, live = true }) => {
  const line = mono ? 'currentColor' : '#4B1D3F';
  const fill = mono ? 'currentColor' : '#E6DDF0';
  const gold = mono ? 'currentColor' : '#C5A46D';
  return (
    <svg viewBox="0 0 24 24" className={`${className} sag-ic ${live ? 'sag-live sag-a-float' : ''}`} role="img" aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.4 3.4h9.2l4 4v13.6l-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4Z" fill={fill} fillOpacity={mono ? 0.16 : 1} stroke={line} strokeWidth={1.7} />
      <path d="M14.6 3.4v4h4" fill={mono ? 'none' : gold} stroke={line} strokeWidth={1.5} />
      <path d="M8.4 11h6.4M8.4 14.4h4.4" stroke={line} strokeWidth={1.5} />
    </svg>
  );
};
