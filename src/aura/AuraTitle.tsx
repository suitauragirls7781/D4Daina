import { Fragment, type ReactNode } from 'react';
import { MaskLines } from './MaskLines';

const SIZE = { xl: '', lg: ' aura-h-lg', md: ' aura-h-md', sm: ' aura-h-sm' } as const;

/**
 * The heading of a page or a section in the Aura look: a small capitals label, the big bold title whose
 * lines rise in (MaskLines), ONE accent word in the serif italic, and an optional line under it.
 *   <AuraTitle label="Collections" title="Shop by" accent="category" />
 * `title` is a string / nodes (one line) or an array (one masked line each). `accent` is added after the
 * last line, or on a line of its own with `accentBreak`. Colours follow the section (data-th).
 */
export const AuraTitle = ({ label, title, accent, accentBreak = false, sub, as = 'h2', align = 'left', size = 'xl', id, className = '', titleClassName = '', delay = 0 }: {
  label?: ReactNode;
  title: ReactNode | ReactNode[];
  accent?: ReactNode;
  accentBreak?: boolean;
  sub?: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  align?: 'left' | 'center';
  /** xl: the big title (default). lg: a rail title. md: a product name or a panel title. sm: a small panel. */
  size?: keyof typeof SIZE;
  /** The id of the heading itself (for aria-labelledby). */
  id?: string;
  className?: string;
  titleClassName?: string;
  delay?: number;
}) => {
  const lines: ReactNode[] = Array.isArray(title) ? [...title] : [title];
  if (accent != null && accent !== '') {
    if (accentBreak || !lines.length) lines.push(<em>{accent}</em>);
    else lines[lines.length - 1] = <Fragment>{lines[lines.length - 1]} <em>{accent}</em></Fragment>;
  }
  const centre = align === 'center';
  return (
    <div className={`flex flex-col ${centre ? 'items-center text-center' : 'items-start text-left'} ${className}`}>
      {label != null && label !== '' && <p className="aura-lbl mb-3">{label}</p>}
      <MaskLines as={as} id={id} lines={lines} delay={delay} className={`${as === 'h1' ? 'aura-h1' : 'aura-h2'}${SIZE[size]} max-w-full ${titleClassName}`} />
      {sub != null && sub !== '' && <p className="aura-sub mt-3.5 max-w-[42ch]">{sub}</p>}
    </div>
  );
};
