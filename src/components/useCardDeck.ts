import { useEffect, useMemo, useRef, type RefObject } from 'react';

// The hero's deck of photo cards: the physics.
//   - The cards are the children of the deck element marked `data-card`, in slide order. Each has a place in the
//     deck (its slot: 0 = the top card, 1 and 2 peek out behind it, the rest lie under the top card, covered by it).
//   - Every card is moved by springs, in one animation-frame loop that sleeps when nothing moves. It writes only
//     `transform` (and z-index when a card changes its place in the pile), never layout, and no React state:
//     React hears about a deal once, through `onChange`.
//   - A drag follows the finger exactly. The gesture's axis is decided first: only a sideways move takes the
//     card; an up / down move is left to the page (the deck has `touch-action: pan-y`), so the deck never
//     blocks scrolling. Let go past a third of the card, or with a flick, and the card is dealt: it slides off
//     to that side and tucks back in under the pile while the next one rises. Otherwise it springs back.
//   - The fan follows `var(--f)` (1 = fanned, 0 = tucked together), which the scroll engine writes on the deck:
//     the slot's offset and turn are multiplied by it inside the transform, so scrolling costs no JavaScript here.

interface Spring { v: number; s: number; t: number }
interface Card {
  el: HTMLElement; slot: number; z: number; text: string;
  px: Spring; py: Spring; pr: Spring; ps: Spring;   // the place in the pile
  dx: Spring; dy: Spring; dr: Spring;               // the drag / the deal
  /** 0 at rest, 1 sliding off the top, 2 tucking in under the pile, 3 sliding out from under, 4 landing on top */
  phase: 0 | 1 | 2 | 3 | 4; since: number;
}
interface Pointer { id: number; x0: number; y0: number; dx: number; dy: number; drag: boolean; card: Card; samples: Array<[number, number]> }

// x and y as a share of the card's width / height, the turn in degrees, the scale
const POSES: Array<[number, number, number, number]> = [
  [0, 0, 0, 1],
  [0.105, -0.016, 6.5, 0.94],
  [-0.095, 0.006, -6, 0.885],
  [0, 0, 0, 0.86],
];
const spring = (v: number): Spring => ({ v, s: 0, t: v });
const step = (a: Spring, k: number, c: number, dt: number, eps: number) => {
  a.s += (-k * (a.v - a.t) - c * a.s) * dt;
  a.v += a.s * dt;
  if (Math.abs(a.t - a.v) < eps && Math.abs(a.s) < eps * 12) { a.v = a.t; a.s = 0; return false; }
  return true;
};

export interface CardDeck {
  /** Deal the top card (it leaves to the left with -1, to the right with 1). */
  next: (dir?: number) => void;
  /** Bring the last dealt card back on top. */
  prev: () => void;
  /** True right after a drag: the click that ends a drag must not open the card. */
  dragged: () => boolean;
  /** Read the card's size again (call it from the scroll engine's measure pass, never on a frame). */
  measure: () => void;
}

export function useCardDeck(
  deckRef: RefObject<HTMLElement | null>,
  /** The cards' identity (their keys joined): the deck starts over when the slides change. */
  signature: string,
  enabled: boolean,
  onChange: (index: number, stepDir: 1 | -1) => void,
  onDrag?: (active: boolean) => void,
): CardDeck {
  const api = useRef<CardDeck>({ next: () => {}, prev: () => {}, dragged: () => false, measure: () => {} });
  const changed = useRef(onChange);
  const dragCb = useRef(onDrag);
  changed.current = onChange;
  dragCb.current = onDrag;

  useEffect(() => {
    const deck = deckRef.current;
    if (!deck || !enabled) return undefined;
    const els = Array.from(deck.querySelectorAll<HTMLElement>('[data-card]'));
    const n = els.length;
    if (n < 2) return undefined;

    let index = 0;
    let W = 0, H = 0;
    let raf = 0, last = 0, opened = false;
    let ptr: Pointer | null = null;
    let dragEnd = 0;
    const fan = spring(1);
    const pose = (slot: number, out: [number, number, number, number]) => {
      const s = Math.max(0, Math.min(POSES.length - 1, slot));
      const a = POSES[Math.floor(s)], b = POSES[Math.ceil(s)], t = s - Math.floor(s);
      out[0] = (a[0] + (b[0] - a[0]) * t) * W * fan.v;
      out[1] = (a[1] + (b[1] - a[1]) * t) * H * fan.v;
      out[2] = (a[2] + (b[2] - a[2]) * t) * fan.v;
      out[3] = a[3] + (b[3] - a[3]) * t;
      return out;
    };
    const tmp: [number, number, number, number] = [0, 0, 0, 1];
    // The cards start tucked together under the top one (what the CSS shows before this runs) and fan out
    const cards: Card[] = els.map((el, i) => ({
      el, slot: i, z: -1, text: '',
      px: spring(0), py: spring(0), pr: spring(0), ps: spring(POSES[Math.min(i, 3)][3]),
      dx: spring(0), dy: spring(0), dr: spring(0), phase: 0, since: 0,
    }));
    const setZ = (card: Card, z: number) => { if (card.z !== z) { card.z = z; card.el.style.zIndex = String(z); } };
    const place = () => cards.forEach((card, i) => {
      card.slot = (i - index + n) % n;
      card.el.dataset.slot = String(Math.min(card.slot, 3));
    });
    const restZ = (card: Card) => setZ(card, n - card.slot);
    const flyX = () => W * 1.06;

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.034, last ? (now - last) / 1000 : 0.016);
      last = now;
      let busy = step(fan, 130, 19, dt, 0.002);
      let lift = 0;
      if (ptr?.drag) {
        const c = ptr.card;
        c.dx.v = c.dx.t = ptr.dx; c.dx.s = 0;
        c.dy.v = c.dy.t = ptr.dy * 0.16; c.dy.s = 0;
        c.dr.v = c.dr.t = (ptr.dx / Math.max(1, W)) * 11; c.dr.s = 0;
        lift = Math.min(1, Math.abs(ptr.dx) / (W * 0.5)) * 0.62;
      }
      for (const card of cards) {
        // where this card belongs in the pile right now
        const at = card.phase === 1 || card.phase === 4 ? 0 : card.phase === 3 ? n - 1 : card.slot > 0 ? card.slot - lift : 0;
        pose(at, tmp);
        card.px.t = tmp[0]; card.py.t = tmp[1]; card.pr.t = tmp[2]; card.ps.t = tmp[3];
        let moving = false;
        moving = step(card.px, 150, 19, dt, 0.05) || moving;
        moving = step(card.py, 150, 19, dt, 0.05) || moving;
        moving = step(card.pr, 150, 19, dt, 0.01) || moving;
        moving = step(card.ps, 170, 22, dt, 0.0004) || moving;
        if (!(ptr?.drag && ptr.card === card)) {
          const fast = card.phase === 1 || card.phase === 3;
          const k = fast ? 210 : card.phase === 0 ? 250 : 165;
          const c = fast ? 25 : card.phase === 0 ? 21 : 22;
          moving = step(card.dx, k, c, dt, 0.05) || moving;
          moving = step(card.dy, k, c, dt, 0.05) || moving;
          moving = step(card.dr, k, c, dt, 0.01) || moving;
          if (fast && (Math.abs(card.dx.v) >= Math.abs(card.dx.t) * 0.93 || now - card.since > 460)) {
            // clear of the pile: under it (a dealt card) or on top of it (a card that comes back), then home
            card.phase = card.phase === 1 ? 2 : 4;
            if (card.phase === 2) restZ(card); else setZ(card, n + 2);
            card.dx.t = 0; card.dy.t = 0; card.dr.t = 0;
            moving = true;
          } else if (!moving && card.phase !== 0) {
            card.phase = 0;
            restZ(card);
          }
        }
        busy = moving || busy;
        const text = `translate3d(calc(${card.dx.v.toFixed(1)}px + ${card.px.v.toFixed(1)}px * var(--f, 1)), calc(${card.dy.v.toFixed(1)}px + ${card.py.v.toFixed(1)}px * var(--f, 1)), 0) rotate(calc(${card.dr.v.toFixed(2)}deg + ${card.pr.v.toFixed(2)}deg * var(--f, 1))) scale(${card.ps.v.toFixed(4)})`;
        if (text !== card.text) { card.text = text; card.el.style.transform = text; }
      }
      if (busy) raf = requestAnimationFrame(tick);
      else { last = 0; deck.classList.remove('mv'); }
    };
    const wake = () => {
      if (raf || W <= 0) return;
      deck.classList.add('mv');
      raf = requestAnimationFrame(tick);
    };

    const deal = (stepDir: 1 | -1, dir: number, speed = 0) => {
      if (W <= 0) return;
      const now = performance.now();
      if (stepDir === 1) {
        const top = cards[index];
        index = (index + 1) % n;
        place();
        cards.forEach(restZ);
        top.phase = 1; top.since = now;
        setZ(top, n + 2);
        top.dx.t = dir * flyX(); top.dy.t = -H * 0.02; top.dr.t = dir * 9;
        if (Math.sign(speed) === dir) top.dx.s = Math.max(-3200, Math.min(3200, speed));
      } else {
        index = (index - 1 + n) % n;
        const back = cards[index];
        place();
        cards.forEach(restZ);
        back.phase = 3; back.since = now;
        setZ(back, 0);
        back.dx.t = dir * flyX(); back.dy.t = -H * 0.02; back.dr.t = dir * 9;
      }
      changed.current(index, stepDir);
      wake();
    };

    const measure = () => {
      const w = els[0].offsetWidth, h = els[0].offsetHeight;
      if (!w || !h) return;
      const first = W <= 0;
      W = w; H = h;
      if (first && !opened) { opened = true; place(); cards.forEach(restZ); }
      wake();
    };

    // ---- the drag ----
    const onDown = (event: PointerEvent) => {
      if (ptr || (event.pointerType === 'mouse' && event.button !== 0) || W <= 0) return;
      if (!(event.target instanceof Element) || !event.target.closest('[data-card]')) return;
      ptr = { id: event.pointerId, x0: event.clientX, y0: event.clientY, dx: 0, dy: 0, drag: false, card: cards[index], samples: [] };
    };
    const onMove = (event: PointerEvent) => {
      if (!ptr || event.pointerId !== ptr.id) return;
      const dx = event.clientX - ptr.x0, dy = event.clientY - ptr.y0;
      if (!ptr.drag) {
        if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
        // An up / down move belongs to the page
        if (Math.abs(dx) <= Math.abs(dy) * 1.15) { ptr = null; return; }
        ptr.drag = true;
        ptr.card = cards[index];
        // start from where the card is now (it may still be settling), without a jump
        ptr.x0 = event.clientX - ptr.card.dx.v; ptr.y0 = event.clientY;
        ptr.card.phase = 0;
        setZ(ptr.card, n + 2);
        try { deck.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
        deck.classList.add('dg');
        dragCb.current?.(true);
      }
      ptr.dx = event.clientX - ptr.x0;
      ptr.dy = event.clientY - ptr.y0;
      ptr.samples.push([event.timeStamp, event.clientX]);
      if (ptr.samples.length > 6) ptr.samples.shift();
      wake();
    };
    const finish = (event: PointerEvent, cancelled: boolean) => {
      if (!ptr || event.pointerId !== ptr.id) return;
      const p = ptr;
      ptr = null;
      if (!p.drag) return;
      deck.classList.remove('dg');
      dragEnd = performance.now();
      dragCb.current?.(false);
      // speed over the last few moves (px per second)
      let speed = 0;
      const recent = p.samples.filter((sample) => event.timeStamp - sample[0] < 110);
      if (recent.length > 1) {
        const a = recent[0], b = recent[recent.length - 1];
        if (b[0] > a[0]) speed = ((b[1] - a[1]) / (b[0] - a[0])) * 1000;
      }
      const far = Math.abs(p.dx) > W * 0.3;
      const flick = Math.abs(speed) > 620 && Math.abs(p.dx) > 18 && Math.sign(speed) === Math.sign(p.dx);
      if (!cancelled && (far || flick) && p.card === cards[index]) deal(1, p.dx < 0 ? -1 : 1, speed);
      else {
        p.card.dx.t = 0; p.card.dy.t = 0; p.card.dr.t = 0;
        p.card.dx.s = Math.max(-2400, Math.min(2400, speed));
        // it springs back to its place in the pile
        p.card.phase = p.card.slot === 0 ? 0 : 2;
        restZ(p.card);
        wake();
      }
    };
    const onUp = (event: PointerEvent) => finish(event, false);
    const onCancel = (event: PointerEvent) => finish(event, true);
    const noDrag = (event: Event) => event.preventDefault();
    // A mouse over the deck opens the fan a little
    const onEnter = (event: PointerEvent) => { if (event.pointerType === 'mouse') { fan.t = 1.42; wake(); } };
    const onLeave = (event: PointerEvent) => { if (event.pointerType === 'mouse') { fan.t = 1; wake(); } };

    deck.addEventListener('pointerdown', onDown, { passive: true });
    deck.addEventListener('pointermove', onMove, { passive: true });
    deck.addEventListener('pointerup', onUp, { passive: true });
    deck.addEventListener('pointercancel', onCancel, { passive: true });
    deck.addEventListener('dragstart', noDrag);
    deck.addEventListener('pointerenter', onEnter, { passive: true });
    deck.addEventListener('pointerleave', onLeave, { passive: true });

    api.current = {
      next: (dir = -1) => deal(1, dir < 0 ? -1 : 1),
      prev: () => deal(-1, -1),
      dragged: () => performance.now() - dragEnd < 400,
      measure,
    };
    measure();

    return () => {
      cancelAnimationFrame(raf);
      deck.removeEventListener('pointerdown', onDown);
      deck.removeEventListener('pointermove', onMove);
      deck.removeEventListener('pointerup', onUp);
      deck.removeEventListener('pointercancel', onCancel);
      deck.removeEventListener('dragstart', noDrag);
      deck.removeEventListener('pointerenter', onEnter);
      deck.removeEventListener('pointerleave', onLeave);
      deck.classList.remove('mv', 'dg');
      for (const card of cards) { card.el.style.removeProperty('transform'); card.el.style.removeProperty('z-index'); }
      api.current = { next: () => {}, prev: () => {}, dragged: () => false, measure: () => {} };
      if (index !== 0) changed.current(0, 1);
    };
  }, [deckRef, signature, enabled]);

  return useMemo<CardDeck>(() => ({
    next: (dir) => api.current.next(dir),
    prev: () => api.current.prev(),
    dragged: () => api.current.dragged(),
    measure: () => api.current.measure(),
  }), []);
}
