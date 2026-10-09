import React, { useEffect, useRef, useState } from 'react';

/** Its children rise in once, the first time they scroll into view (the same sag-reveal / is-in pair as src/utils/reveal.ts). */
export const Reveal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );
    observer.observe(el);
    // Safety net: never leave content hidden (e.g. print, unusual browsers).
    const timer = window.setTimeout(() => setVisible(true), 4000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div ref={ref} className={`sag-reveal${visible ? ' is-in' : ''}`}>
      {children}
    </div>
  );
};
