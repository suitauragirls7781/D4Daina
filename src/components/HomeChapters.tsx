import React, { useEffect, useRef, useState } from 'react';

interface Chapter { id: string; label: string; dark: boolean; }

/**
 * Aura Kinetic, homepage (desktop with a mouse only): a quiet rail of dots at the right edge, one per section of
 * the scroll story, named with that section's own title. The dot of the section under the reader's eye grows
 * into a short line and shows its name; a dot jumps to its section. Which section is current comes from one
 * IntersectionObserver (a thin band 45% down the screen, the same line the backdrop uses), so nothing runs
 * while scrolling and React state changes only when the section changes. Phones do not get it (the gutters
 * there belong to the thread).
 */
export const HomeChapters: React.FC<{ hostRef: React.RefObject<HTMLElement | null> }> = ({ hostRef }) => {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [current, setCurrent] = useState('');
  const signature = useRef('');

  // The list: every titled section the page really shows right now (sections arrive as the catalogue loads)
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !window.matchMedia?.('(min-width: 1024px) and (pointer: fine)').matches) return undefined;
    const read = () => {
      const next: Chapter[] = [];
      host.querySelectorAll<HTMLElement>('section[id][data-th]').forEach((section) => {
        if (section.offsetHeight < 80) return;
        const titled = section.getAttribute('aria-labelledby');
        // innerText keeps the space between a title's separate lines
        const raw = (titled && document.getElementById(titled)?.innerText) || section.getAttribute('aria-label') || '';
        const label = raw.replace(/\s+/g, ' ').trim();
        if (!label || label.length > 40) return;
        next.push({ id: section.id, label, dark: ['ink', 'forest'].includes(section.dataset.th || '') });
      });
      const sig = next.map((c) => `${c.id}:${c.label}`).join('|');
      if (sig !== signature.current) { signature.current = sig; setChapters(next); }
    };
    read();
    const timer = window.setInterval(read, 2500);
    return () => window.clearInterval(timer);
  }, [hostRef]);

  useEffect(() => {
    if (chapters.length < 3 || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id);
    }, { rootMargin: '-45% 0px -54% 0px', threshold: 0 });
    chapters.forEach((c) => { const el = document.getElementById(c.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [chapters]);

  if (chapters.length < 3) return null;
  const now = chapters.find((c) => c.id === current);
  return (
    <nav aria-label="Sections of this page" className={`kx-ch${now ? ' on' : ''}${now?.dark ? ' dk' : ''}`}>
      {chapters.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-label={`Go to ${c.label}`}
          aria-current={c.id === current ? 'true' : undefined}
          onClick={() => document.getElementById(c.id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}
        >
          <span>{c.label}</span>
          <i aria-hidden="true" />
        </button>
      ))}
    </nav>
  );
};
