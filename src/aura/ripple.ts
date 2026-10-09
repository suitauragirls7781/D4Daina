import { prefersReducedMotion } from './scroll';

// The ripple that spreads from the tap point of a pill button, and the origin of a field's focus line.
// startRipple() (called once when src/aura is loaded) listens on the document, so every .aura-btn, .aura-rnd
// and the re-skinned old buttons ripple without any wiring. ripple(event) is for anything else.

const AUTO = '.aura-btn, .aura-rnd, .sag-btn-primary, .sag-btn-outline, .sag-btn-light, [data-ripple]';

const spawn = (host: HTMLElement, clientX: number, clientY: number) => {
  if (prefersReducedMotion() || (host as HTMLButtonElement).disabled) return;
  const rect = host.getBoundingClientRect();
  const dot = document.createElement('span');
  dot.className = 'aura-rp';
  dot.setAttribute('aria-hidden', 'true');
  dot.style.left = `${clientX - rect.left}px`;
  dot.style.top = `${clientY - rect.top}px`;
  host.append(dot);
  window.setTimeout(() => dot.remove(), 720);
};

/**
 * Ripple from the pointer on the element that handles the event: <button onPointerDown={ripple}>.
 * The element needs position: relative, overflow: hidden and isolation: isolate (aura-btn has them).
 */
export const ripple = (event: { currentTarget: EventTarget | null; clientX: number; clientY: number }) => {
  if (event.currentTarget instanceof HTMLElement) spawn(event.currentTarget, event.clientX, event.clientY);
};

let started = false;
/** Start the automatic ripple (safe to call many times). */
export const startRipple = () => {
  if (started || typeof document === 'undefined') return;
  started = true;
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Element | null;
    if (!target?.closest) return;
    const host = target.closest<HTMLElement>(AUTO);
    if (host) spawn(host, event.clientX, event.clientY);
    // A field's ink line grows from where it was tapped
    const field = target.closest<HTMLElement>('.aura-field');
    if (field) {
      const rect = field.getBoundingClientRect();
      const at = Math.min(1, Math.max(0, (event.clientX - rect.left - 16) / Math.max(1, rect.width - 32)));
      field.style.setProperty('--ox', `${Math.round(at * 100)}%`);
    }
  }, { passive: true });
};
