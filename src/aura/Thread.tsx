import { useLayoutEffect, useRef, type RefObject } from 'react';
import { clamp, prefersReducedMotion, useScrollFx } from './scroll';

// The rose thread: one thin line that runs down a page and is drawn by scrolling, so that its tip stays at
// about 62% of the screen height. It lives in an SVG laid over its host (behind the host's content), and it
// is built from anchors measured in the host:
//
//   <div ref={host}>                         the host: Thread makes it position: relative
//     <Thread containerRef={host} />
//     <section data-thread="left"> ...       the line runs down the LEFT gutter beside this block
//     <section data-thread="right"> ...      ... down the RIGHT gutter (it crosses over in the first 48px)
//     <span data-thread="arch" />            a small arch is drawn where this (empty) marker sits
//     <span data-thread="knot" />            a small loop is drawn where this marker sits
//     <div data-thread="around"> photo </div> the line goes once around this box, 6px outside it
//     <section data-thread="center"> ...     the line runs down the middle (only between blocks, not over a photo)
//   </div>
//
// The line only changes sides in the gap between two anchors (the first 48px of the next one), and "left" /
// "right" run in the page gutter, so it never crosses a photo. Instead of anchors you can pass `points`:
// a function that returns the points (in the host's own px) to join with soft S-curves.
// Colour: var(--th) of the section under the reader's eye. With reduced motion the whole line is simply there.

export interface ThreadPoint { x: number; y: number; }
interface Leg { y0: number; y1: number; path: SVGPathElement; len: number; f: number; }

const NS = 'http://www.w3.org/2000/svg';
const n = (v: number) => +v.toFixed(1);
// A soft S between two points: it leaves and arrives vertically
const S = (x0: number, y0: number, x1: number, y1: number) => ` C${n(x0)} ${n((y0 + y1) / 2)} ${n(x1)} ${n((y0 + y1) / 2)} ${n(x1)} ${n(y1)}`;

// An element's box inside the host, from the layout (not changed by transforms)
const boxIn = (el: HTMLElement, host: HTMLElement) => {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== host) { x += node.offsetLeft; y += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
  return { l: x, t: y, r: x + el.offsetWidth, b: y + el.offsetHeight };
};

const legsFromAnchors = (host: HTMLElement, gutter: number, maxWidth: number) => {
  const W = host.offsetWidth;
  const L = Math.max(gutter, (W - maxWidth) / 2 - 8);
  const R = W - L;
  const out: { y0: number; y1: number; d: string }[] = [];
  let cur: ThreadPoint | null = null;
  // Start a leg: from where the last one ended, with an S to the new point (or just there, for the first one)
  const reach = (x: number, y: number) => {
    if (!cur) return { d: `M${n(x)} ${n(y)}`, y0: y, y };
    const to = Math.max(y, cur.y + (Math.abs(x - cur.x) > 1 ? 48 : 0));
    return { d: `M${n(cur.x)} ${n(cur.y)}${S(cur.x, cur.y, x, to)}`, y0: cur.y, y: to };
  };
  host.querySelectorAll<HTMLElement>('[data-thread]').forEach((el) => {
    const kind = el.dataset.thread || 'left';
    const b = boxIn(el, host);
    const cx = (b.l + b.r) / 2;
    if (kind === 'arch') {
      const fx = cx - 20;
      const fy = b.t + 42;
      const a = reach(fx, fy);
      out.push({ y0: a.y0, y1: Math.max(a.y, a.y0 + 1), d: `${a.d}v-32a20 20 0 0 1 40 0v32h-40` });
      cur = { x: fx, y: a.y };
    } else if (kind === 'knot') {
      const a = reach(cx, b.t);
      out.push({ y0: a.y0, y1: a.y + 36, d: `${a.d}c16 2 26 14 22 28c-4 14-22 18-30 8c-7-9-1-21 9-21c8 0 12 8 8 13` });
      cur = { x: cx + 9, y: a.y + 28 };
    } else if (kind === 'around') {
      const g = 6;
      const xl = b.l - g;
      const xr = b.r + g;
      const yt = b.t - g;
      const yb = b.b + g;
      const r = Math.max(0, Math.min(28, (xr - xl) / 2, (yb - yt) / 2));
      const a = reach(xl, yt + r);
      const loop = `V${n(yb - r)}a${r} ${r} 0 0 0 ${r} ${r}H${n(xr - r)}a${r} ${r} 0 0 0 ${r} ${-r}V${n(yt + r)}a${r} ${r} 0 0 0 ${-r} ${-r}H${n(xl + r)}a${r} ${r} 0 0 0 ${-r} ${r}`;
      out.push({ y0: a.y0, y1: Math.max(yb, a.y0 + 1), d: a.d + loop });
      // It leaves from the lower left corner, straight down
      cur = { x: xl, y: yb - r };
    } else {
      const x = kind === 'right' ? R : kind === 'center' ? W / 2 : L;
      const a = reach(x, b.t);
      const end = Math.max(b.b, a.y);
      out.push({ y0: a.y0, y1: Math.max(end, a.y0 + 1), d: `${a.d}V${n(end)}` });
      cur = { x, y: end };
    }
  });
  return out;
};

const legsFromPoints = (pts: ThreadPoint[]) => pts.slice(1).map((p, i) => ({ y0: pts[i].y, y1: Math.max(p.y, pts[i].y + 1), d: `M${n(pts[i].x)} ${n(pts[i].y)}${S(pts[i].x, pts[i].y, p.x, p.y)}` }));

export const Thread = ({ containerRef, points, gutter = 10, maxWidth = 1120, tip = 0.62, dot = true, className = '' }: {
  /** The host the line is drawn over. Render <Thread> as a child of it. */
  containerRef: RefObject<HTMLElement | null>;
  /** Your own points (in the host's px) instead of data-thread anchors. Called on every re-measure. */
  points?: () => ThreadPoint[];
  /** Distance of the "left" / "right" runs from the host's edge, in px. */
  gutter?: number;
  /** The page's content width: on a wide screen the runs sit just outside it. */
  maxWidth?: number;
  /** How far down the screen the tip of the line is (0.62 = 62%). */
  tip?: number;
  /** A small dot at the tip while it is being drawn. */
  dot?: boolean;
  className?: string;
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const legs = useRef<Leg[]>([]);
  const tipDot = useRef<SVGCircleElement | null>(null);
  const getPoints = useRef(points);
  getPoints.current = points;

  useLayoutEffect(() => {
    const host = containerRef.current;
    host?.classList.add('aura-thread-host');
    return () => host?.classList.remove('aura-thread-host');
  }, [containerRef]);

  // Build the path from the measured anchors. Runs when the engine re-measures (resize, photos, fonts), not on scroll.
  const build = (host: HTMLElement) => {
    const svg = svgRef.current;
    if (!svg) return;
    const W = host.offsetWidth;
    const H = host.offsetHeight;
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const still = prefersReducedMotion();
    const plan = getPoints.current ? legsFromPoints(getPoints.current()) : legsFromAnchors(host, gutter, maxWidth);
    svg.replaceChildren();
    legs.current = plan.map((leg) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', leg.d);
      svg.append(path);
      let len = 0;
      try { len = path.getTotalLength(); } catch { len = 0; }
      if (!still && len) { path.style.strokeDasharray = String(len); path.style.strokeDashoffset = String(len); }
      return { y0: leg.y0, y1: leg.y1, path, len, f: -1 };
    });
    tipDot.current = null;
    if (dot && !still) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', '4');
      c.style.opacity = '0';
      svg.append(c);
      tipDot.current = c;
    }
  };

  useScrollFx(containerRef, ({ y, vh, top }) => {
    if (prefersReducedMotion() || !legs.current.length) return;
    const at = y + vh * tip - top;
    let active: Leg | null = null;
    for (const leg of legs.current) {
      const f = clamp((at - leg.y0) / (leg.y1 - leg.y0));
      if (Math.abs(f - leg.f) > 0.0004) { leg.f = f; leg.path.style.strokeDashoffset = String(leg.len * (1 - f)); }
      if (f > 0 && f < 1) active = leg;
    }
    const c = tipDot.current;
    if (!c) return;
    if (active && active.len) {
      const p = active.path.getPointAtLength(active.len * active.f);
      c.style.opacity = '1';
      c.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    } else c.style.opacity = '0';
  }, [gutter, maxWidth, tip, dot], { measure: build });

  return <svg ref={svgRef} className={`aura-thr ${className}`} aria-hidden="true" focusable="false" />;
};
