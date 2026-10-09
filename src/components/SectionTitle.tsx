import React from 'react';
import { AuraTitle } from '../aura/AuraTitle';

/** The ornament of the earlier look. It is not part of Aura: the export stays and draws nothing. */
export const Ornament: React.FC<{ className?: string }> = () => null;

// "Shop by category" -> "Shop by" + the accent word "category". Only for a plain text title of two words or
// more whose last word is a real word; anything else is shown as it is, without an accent.
const splitAccent = (title: React.ReactNode): [React.ReactNode, string | undefined] => {
  if (typeof title !== 'string') return [title, undefined];
  const text = title.trim();
  const cut = text.lastIndexOf(' ');
  if (cut < 1) return [title, undefined];
  const last = text.slice(cut + 1);
  if (!/^[\p{L}][\p{L}'’-]{2,}[?!.]?$/u.test(last)) return [title, undefined];
  return [text.slice(0, cut), last];
};

/**
 * A page's or a section's heading. It is a thin wrapper around the Aura title (src/aura/AuraTitle.tsx) with
 * the props it always had: the small capitals label (`eyebrow`), the big bold title whose last word is set in
 * the serif italic, and an optional line under it. Left-aligned unless `align="center"`. `as` picks the
 * heading level, `id` goes on the heading itself. `ornament` is accepted and ignored.
 * A title inside a panel or a form (it used to pass align="left") is set one step smaller.
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
}> = ({ eyebrow, title, sub, id, as = 'h2', align, className = '' }) => {
  const [main, accent] = splitAccent(title);
  return <AuraTitle label={eyebrow} title={main} accent={accent} sub={sub} id={id} as={as} align={align ?? 'left'} size={align === 'left' ? 'lg' : 'xl'} className={className} />;
};
