import React from 'react';
import type { StoreIconProps } from './StoreIcons';

/**
 * Extra marks for the account area, drawn like StoreIcons: one outline in the colour of the text around it.
 * Without `mono` the main shape gets a faint tint of the same colour. They never move.
 */
export const StyleIcon: React.FC<StoreIconProps> = ({ className = 'w-5 h-5', mono = false }) => (
  <svg viewBox="0 0 24 24" className={`${className} sag-ic`} role="img" aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.4 3.6 12 8.4a2.6 2.6 0 0 0 1.6 1.6l4.8 1.6-4.8 1.6a2.6 2.6 0 0 0-1.6 1.6l-1.6 4.8-1.6-4.8a2.6 2.6 0 0 0-1.6-1.6L2.4 11.6 7.2 10a2.6 2.6 0 0 0 1.6-1.6Z" fill={mono ? 'none' : 'currentColor'} fillOpacity={mono ? undefined : 0.14} stroke="currentColor" strokeWidth={1.75} />
    <path d="M18.4 2.8v3.6M16.6 4.6h3.6" stroke="currentColor" strokeWidth={1.75} />
    <circle cx="19.2" cy="18.6" r="1.3" fill="currentColor" />
  </svg>
);

/** Receipt / invoice sheet with a folded corner. */
export const ReceiptIcon: React.FC<StoreIconProps> = ({ className = 'w-5 h-5', mono = false }) => (
  <svg viewBox="0 0 24 24" className={`${className} sag-ic`} role="img" aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.4 3.4h9.2l4 4v13.6l-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4Z" fill={mono ? 'none' : 'currentColor'} fillOpacity={mono ? undefined : 0.14} stroke="currentColor" strokeWidth={1.75} />
    <path d="M14.6 3.4v4h4" stroke="currentColor" strokeWidth={1.5} />
    <path d="M8.4 11h6.4M8.4 14.4h4.4" stroke="currentColor" strokeWidth={1.5} />
  </svg>
);
