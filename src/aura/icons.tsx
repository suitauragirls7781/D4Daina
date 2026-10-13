import type { SVGProps } from 'react';

// The Aura icon set: thin (1.6) round-ended outlines on a 24px grid. For anything that is not here use
// lucide-react with strokeWidth={1.6}: it sits well beside these.
// Every path has pathLength="1", so an icon can DRAW itself: <Icon name="check" draw /> starts undrawn and
// is drawn when it (or its parent) gets class "in" / "ok" (see .aura-draw in src/index.css).

const PATHS = {
  menu: 'M4 8.5h16|M4 15.5h11',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z|M20 20l-3.7-3.7',
  bag: 'M5.5 8.5h13l1 11.5h-15l1-11.5z|M9 8.5V7a3 3 0 0 1 6 0v1.5',
  heart: 'M12 20.2s-7.2-4.5-7.2-10.1A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.2 2.7c0 5.6-7.2 10.1-7.2 10.1z',
  lock: 'M6 10.5h12v9.5H6z|M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5|M12 14v2.5',
  shield: 'M12 3l7.5 3v5.6c0 4.6-3.1 8-7.5 9.4-4.4-1.4-7.5-4.8-7.5-9.4V6L12 3z|M8.8 12.2l2.3 2.3 4.2-4.6',
  returns: 'M4 9h11.5a4.5 4.5 0 0 1 0 9H8|M7.5 5.5L4 9l3.5 3.5',
  truck: 'M2.5 6.5h11v10h-11z|M13.5 10h4l3 3v3.5h-7|M7 19.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z|M17 19.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z',
  chat: 'M4 5h16v11H10l-4.5 3.5V16H4z|M8 9.5h8|M8 12.5h5',
  arrow: 'M5 12h14|M13 6l6 6-6 6',
  up: 'M12 19V5|M6 11l6-6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14|M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12|M18 6L6 18',
  play: 'M8 5.5v13l11-6.5z',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z|M12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z',
  copy: 'M9 9h10v11H9z|M5 15V4h10',
  trash: 'M5 7h14|M9 7V4.5h6V7|M7 7l1 13h8l1-13',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4.5 20.5a7.5 7.5 0 0 1 15 0',
  box: 'M3.5 8L12 3.5 20.5 8v8L12 20.5 3.5 16z|M3.5 8L12 12.5 20.5 8|M12 12.5v8',
  home: 'M4 11l8-7 8 7v9h-5.5v-6h-5v6H4z',
  grid: 'M4 4h7v7H4z|M13 4h7v7h-7z|M4 13h7v7H4z|M13 13h7v7h-7z',
  pinch: 'M8 11l-4-4|M4 10.5V7h3.5|M16 13l4 4|M20 13.5V17h-3.5|M10 14l4-4',
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

/**
 * <Icon name="bag" /> at 22px in the text colour. `size` in px, `draw` for an icon that draws itself,
 * `filled` for the heart of a saved style. Decorative by default (aria-hidden); pass `title` to name it.
 */
export const Icon = ({ name, size = 22, draw = false, filled = false, title, className = '', strokeWidth = 1.6, ...rest }: {
  name: IconName;
  size?: number;
  draw?: boolean;
  filled?: boolean;
  title?: string;
} & Omit<SVGProps<SVGSVGElement>, 'name'>) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    focusable="false"
    data-ic={name}
    className={`${draw ? 'aura-draw ' : ''}shrink-0 ${className}`}
    {...rest}
  >
    {PATHS[name].split('|').map((d, i) => <path key={i} pathLength={1} d={d} />)}
  </svg>
);
