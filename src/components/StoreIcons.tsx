import React from 'react';

/**
 * Suit Aura Girls icon set: one outline in the colour of the text around it (currentColor), so an icon is
 * ink in a list, teal on the active tab and white on a teal button without any extra work.
 * `mono` (the default look for inactive things) is the bare outline; without it the main shape gets a faint
 * tint of the same colour. Icons never move: `live` and `strokeWidth` are accepted for older call sites and ignored.
 */
type Fill = 'lav' | 'blush' | 'gold' | 'plum' | 'none' | 'white';
type Part =
  | { d: string; fill?: Fill; stroke?: boolean; width?: number; cls?: string }
  | { circle: [number, number, number]; fill?: Fill; stroke?: boolean; width?: number; cls?: string }
  | { rect: [number, number, number, number, number]; fill?: Fill; stroke?: boolean; width?: number; cls?: string };

export type StoreIconProps = { className?: string; mono?: boolean; strokeWidth?: number; live?: boolean };

const make = (name: string, parts: Part[], _motion = '') => {
  const Icon: React.FC<StoreIconProps> = ({ className = 'w-5 h-5', mono = false }) => (
    <svg viewBox="0 0 24 24" className={`${className} sag-ic`} role="img" aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {parts.map((part, index) => {
        const fillKey = part.fill || 'none';
        const soft = fillKey === 'lav' || fillKey === 'blush';
        const outlined = part.stroke !== false;
        // Soft areas: a faint tint (or nothing when mono). Accent parts: solid only when they have no outline of their own.
        const fill = fillKey === 'none' || fillKey === 'white' ? 'none' : soft ? (mono ? 'none' : 'currentColor') : outlined ? 'none' : 'currentColor';
        const fillOpacity = soft && !mono ? 0.14 : undefined;
        const stroke = outlined ? 'currentColor' : 'none';
        const common = { fill, fillOpacity, stroke, strokeWidth: part.width ?? 1.75 };
        if ('circle' in part) return <circle key={index} cx={part.circle[0]} cy={part.circle[1]} r={part.circle[2]} {...common} />;
        if ('rect' in part) return <rect key={index} x={part.rect[0]} y={part.rect[1]} width={part.rect[2]} height={part.rect[3]} rx={part.rect[4]} {...common} />;
        return <path key={index} d={part.d} {...common} />;
      })}
    </svg>
  );
  Icon.displayName = name;
  return Icon;
};

export const HomeIcon = make('HomeIcon', [
  { d: 'M4 10.4 12 3.8l8 6.6V19.2A1.8 1.8 0 0 1 18.2 21H5.8A1.8 1.8 0 0 1 4 19.2Z', fill: 'lav' },
  { rect: [9.8, 13.6, 4.4, 7.4, 1.2], fill: 'gold', stroke: false },
  { d: 'M9.8 21v-6.2a1.2 1.2 0 0 1 1.2-1.2h2a1.2 1.2 0 0 1 1.2 1.2V21' },
], 'sag-a-bob');

export const ShopIcon = make('ShopIcon', [
  { rect: [3.5, 3.5, 7, 7, 2], fill: 'lav' },
  { rect: [13.5, 3.5, 7, 7, 2], fill: 'gold', stroke: false },
  { rect: [13.5, 3.5, 7, 7, 2] },
  { rect: [3.5, 13.5, 7, 7, 2] },
  { rect: [13.5, 13.5, 7, 7, 2], fill: 'lav' },
], 'sag-a-tilt');

export const HeartIcon = make('HeartIcon', [
  { d: 'M12 20.2s-7.6-4.6-7.6-10.1A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.6 2.7c0 5.5-7.6 10.1-7.6 10.1Z', fill: 'blush' },
  { d: 'M7.4 9.6a2 2 0 0 1 1.7-1.5', stroke: true, width: 1.4 },
  { circle: [18.6, 5.2, 1.2], fill: 'gold', stroke: false },
], 'sag-a-beat');

export const UserIcon = make('UserIcon', [
  { circle: [12, 8.2, 3.9], fill: 'lav' },
  { d: 'M4.6 20.4a7.4 7.4 0 0 1 14.8 0Z', fill: 'lav' },
  { circle: [18.4, 4.6, 1.2], fill: 'gold', stroke: false },
], 'sag-a-nod');

export const SearchIcon = make('SearchIcon', [
  { circle: [10.6, 10.6, 6.4], fill: 'lav' },
  { d: 'M8.2 8.4a3.2 3.2 0 0 1 2.6-1.3', width: 1.4 },
  { d: 'm15.4 15.4 4.8 4.8', width: 2.4 },
  { circle: [20.2, 20.2, 0.9], fill: 'gold', stroke: false },
], 'sag-a-search');

export const TruckIcon = make('TruckIcon', [
  { d: 'M2.8 6.6A1.6 1.6 0 0 1 4.4 5h8.8a1.6 1.6 0 0 1 1.6 1.6V17H2.8Z', fill: 'lav' },
  { d: 'M14.8 9.2h3.3a1.6 1.6 0 0 1 1.3.7l1.6 2.4a1.6 1.6 0 0 1 .3.9V17h-6.5Z', fill: 'white' },
  { circle: [7.2, 17.6, 2], fill: 'gold' },
  { circle: [17.4, 17.6, 2], fill: 'gold' },
  { d: 'M5.8 9.6h5', width: 1.4, cls: 'sag-p-lines' },
], 'sag-a-drive');

export const ReturnIcon = make('ReturnIcon', [
  { circle: [12, 12, 9], fill: 'lav' },
  { d: 'M8.2 10h6.1a3.1 3.1 0 0 1 0 6.2H10.4', width: 1.9, cls: 'sag-p-spin' },
  { d: 'M10.6 7.6 8.2 10l2.4 2.4', width: 1.9, cls: 'sag-p-spin' },
  { circle: [10.4, 16.2, 1.15], fill: 'gold', stroke: false, cls: 'sag-p-spin' },
]);

export const SupportIcon = make('SupportIcon', [
  { d: 'M4.6 13.2V12a7.4 7.4 0 0 1 14.8 0v1.2', fill: 'none' },
  { rect: [3.4, 12.4, 4, 6.2, 1.8], fill: 'gold' },
  { rect: [16.6, 12.4, 4, 6.2, 1.8], fill: 'gold' },
  { d: 'M18.6 18.6c0 1.6-1.6 2.4-4.4 2.4', width: 1.5 },
  { rect: [11.4, 19.8, 3.2, 2.2, 1.1], fill: 'lav' },
], 'sag-a-sway');

export const LockIcon = make('LockIcon', [
  { d: 'M7.8 10.4V7.6a4.2 4.2 0 0 1 8.4 0v2.8', cls: 'sag-p-shackle' },
  { rect: [4.6, 10.4, 14.8, 10.6, 2.6], fill: 'lav' },
  { circle: [12, 15, 1.7], fill: 'gold', stroke: false },
  { d: 'M12 16.4v1.8', width: 1.8 },
]);

export const QualityIcon = make('QualityIcon', [
  { d: 'M12 2.8 19 5.6v5.6c0 4.6-3 8.3-7 9.9-4-1.6-7-5.3-7-9.9V5.6Z', fill: 'lav' },
  { d: 'm8.6 11.8 2.4 2.4 4.6-4.8', width: 2, cls: 'sag-p-draw' },
  { circle: [17.8, 4.2, 1.2], fill: 'gold', stroke: false },
]);

export const PackageIcon = make('PackageIcon', [
  { d: 'M3.6 7.6 12 3.4l8.4 4.2v8.8L12 20.6l-8.4-4.2Z', fill: 'lav' },
  { d: 'M3.6 7.6 12 11.8l8.4-4.2M12 11.8v8.8' },
  { d: 'm7.8 5.5 8.4 4.2', width: 1.3 },
  { circle: [12, 11.8, 1], fill: 'gold', stroke: false },
], 'sag-a-float');

export const OrdersIcon = make('OrdersIcon', [
  { rect: [4.6, 3.4, 14.8, 17.6, 2.4], fill: 'lav' },
  { d: 'M8.4 8.4h7.2M8.4 12h7.2M8.4 15.6h4.4', width: 1.5 },
  { circle: [16.6, 16.4, 1.3], fill: 'gold', stroke: false },
], 'sag-a-float');

export const TagIcon = make('TagIcon', [
  { d: 'M3.6 4.8A1.2 1.2 0 0 1 4.8 3.6h6.4a1.2 1.2 0 0 1 .85.35l8.2 8.2a1.2 1.2 0 0 1 0 1.7l-6.4 6.4a1.2 1.2 0 0 1-1.7 0l-8.2-8.2a1.2 1.2 0 0 1-.35-.85Z', fill: 'lav' },
  { circle: [8.2, 8.2, 1.6], fill: 'gold' },
], 'sag-a-tag');

export const HelpIcon = make('HelpIcon', [
  { circle: [12, 12, 8.6], fill: 'lav' },
  { d: 'M9.6 9.6a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6', width: 1.8 },
  { circle: [12, 17, 1.05], fill: 'gold', stroke: false },
], 'sag-a-tilt');

export const PinIcon = make('PinIcon', [
  { d: 'M12 21.2s-6.6-5.8-6.6-11a6.6 6.6 0 0 1 13.2 0c0 5.2-6.6 11-6.6 11Z', fill: 'lav' },
  { circle: [12, 10, 2.4], fill: 'gold' },
], 'sag-a-float');
