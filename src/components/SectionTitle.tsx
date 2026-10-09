import React from 'react';

/** The small champagne ornament of the Emerald Heritage look: two thin rules with a diamond between them. */
export const Ornament: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span aria-hidden="true" className={`sag-orn ${className}`}><i /></span>
);

/**
 * A section's heading in the Emerald Heritage look: a small letter-spaced eyebrow, the serif title and the
 * ornament under it, centred. `align="left"` keeps the same pieces at the left (inside panels and forms).
 * `as` picks the heading level (the page title is an h1, a section title an h2).
 */
export const SectionTitle: React.FC<{
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  id?: string;
  as?: 'h1' | 'h2';
  align?: 'center' | 'left';
  ornament?: boolean;
  className?: string;
}> = ({ eyebrow, title, sub, id, as: Tag = 'h2', align = 'center', ornament = true, className = '' }) => (
  <div className={`flex flex-col gap-2.5 ${align === 'center' ? 'items-center text-center' : 'items-start text-left'} ${className}`}>
    {eyebrow && <p className="sag-eyebrow sag-caps text-[10.5px] leading-4 font-semibold uppercase tracking-[0.24em]">{eyebrow}</p>}
    <Tag id={id} className="font-display text-[30px] leading-[1.08] text-ink sm:text-[36px] lg:text-[44px]">{title}</Tag>
    {ornament && <Ornament className={align === 'center' ? '' : 'justify-start!'} />}
    {sub && <p className="max-w-[36ch] text-[13.5px] leading-5 text-ink-muted">{sub}</p>}
  </div>
);
