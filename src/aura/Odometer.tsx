import { useEffect, useState } from 'react';
import { useReducedMotion } from './scroll';

/**
 * A number that rolls to its value like an odometer: <Odometer value="₹1,299" />.
 * Every digit is a column of 0-9 that slides to its place (the columns are drawn by CSS); other characters
 * (₹ , . space) just change. The element's own text is only the plain value (for screen readers, tests and
 * copying), and aria-label carries it too. With reduced motion it simply shows the value.
 * `roll={false}` shows the first value at once and only rolls on later changes.
 */
export const Odometer = ({ value, className = '', roll = true }: { value: string | number; className?: string; roll?: boolean }) => {
  const text = String(value);
  const reduced = useReducedMotion();
  // The first paint shows zeros, the next frame rolls to the value
  const [ready, setReady] = useState(!roll);
  useEffect(() => {
    if (ready) return undefined;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [ready]);

  if (reduced) return <span className={`aura-num ${className}`} aria-label={text}>{text}</span>;

  return (
    <span className={`aura-odo ${className}`} aria-label={text}>
      <span className="sr-only">{text}</span>
      {[...text].map((ch, i) => (/\d/.test(ch)
        ? <span key={i} className="aura-od" aria-hidden="true"><span style={{ transform: `translateY(${ready ? -Number(ch) * 10 : 0}%)`, transitionDelay: `${i * 40}ms` }} /></span>
        : <span key={i} className="aura-oc" aria-hidden="true" data-c={ch === ' ' ? ' ' : ch} />))}
    </span>
  );
};
