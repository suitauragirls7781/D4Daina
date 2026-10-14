import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Star, X } from 'lucide-react';
import { getCleanImageUrl } from '../../../utils/imageHelper';

/**
 * The product's photos in their order on the store: drag a photo by its handle (mouse or finger) to move it,
 * or use the arrows; "Make cover" puts a photo first. Nothing is saved until the product form is saved.
 * Dragging writes only `transform` on the moving photo; the list itself changes once, when it is let go.
 */

interface PhotoManagerProps {
  images: string[];
  onChange: (next: string[]) => void;
  onRemove: (index: number) => void;
}

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export const PhotoManager: React.FC<PhotoManagerProps> = ({ images, onChange, onRemove }) => {
  const tiles = useRef<Array<HTMLDivElement | null>>([]);
  const drag = useRef<{ from: number; x: number; y: number; centres: Array<{ x: number; y: number }>; pointer: number } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [said, setSaid] = useState('');

  const announce = (text: string) => setSaid(text);
  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    onChange(move(images, from, to));
    announce(to === 0 ? `Photo ${from + 1} is now the cover.` : `Photo ${from + 1} moved to place ${to + 1}.`);
  };

  const onDown = (index: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    const centres = tiles.current.slice(0, images.length).map((el) => {
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 };
    });
    drag.current = { from: index, x: e.clientX, y: e.clientY, centres, pointer: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(index);
    setOver(index);
  };

  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    const el = tiles.current[d.from];
    if (el) el.style.transform = `translate(${e.clientX - d.x}px, ${e.clientY - d.y}px) scale(1.04)`;
    // The place whose centre is nearest the finger
    let best = d.from;
    let bestDistance = Infinity;
    const cx = d.centres[d.from].x + (e.clientX - d.x);
    const cy = d.centres[d.from].y + (e.clientY - d.y);
    d.centres.forEach((c, i) => {
      const distance = Math.hypot(c.x - cx, c.y - cy);
      if (distance < bestDistance) { bestDistance = distance; best = i; }
    });
    if (best !== over) setOver(best);
  };

  const onUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    const el = tiles.current[d.from];
    if (el) el.style.transform = '';
    drag.current = null;
    const target = over ?? d.from;
    setDragging(null);
    setOver(null);
    moveTo(d.from, target);
  };

  const onKey = (index: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); moveTo(index, index - 1); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); moveTo(index, index + 1); }
  };

  if (!images.length) return null;

  return (
    <div>
      <ol id="apf-photo-manager" className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 gap-2.5" aria-label="Photos in their order on the store">
        {images.map((url, i) => {
          const isDragged = dragging === i;
          const isTarget = dragging !== null && over === i && !isDragged;
          return (
            <li key={url} className="min-w-0">
              <div
                ref={(el) => { tiles.current[i] = el; }}
                className={`relative rounded-[16px] ${isDragged ? 'z-10 shadow-[var(--sag-shadow-pop)] opacity-95' : 'motion-safe:transition-transform motion-safe:duration-200'} ${isTarget ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`}
              >
                <img src={getCleanImageUrl(url, 320)} alt={`Product photo ${i + 1}${i === 0 ? ' (cover)' : ''}`} draggable={false}
                  className="w-full aspect-[4/5] rounded-[16px] object-cover object-top bg-sunken select-none" />
                <span className={`absolute top-2 left-2 inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-bold ${i === 0 ? 'bg-ink text-[color:var(--sag-on-gold)]' : 'bg-surface text-ink'}`}>
                  {i === 0 ? <><Star className="w-3 h-3 fill-current" aria-hidden="true" /> Cover</> : <span className="sag-num">{i + 1}</span>}
                </span>
                <button
                  type="button"
                  onPointerDown={onDown(i)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  onKeyDown={onKey(i)}
                  aria-label={`Move photo ${i + 1}: drag, or use the arrow keys`}
                  title="Drag to move"
                  className="absolute top-1.5 right-1.5 w-10 h-10 rounded-full bg-surface/95 text-ink flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
                >
                  <GripVertical className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-1 flex items-center gap-0.5">
                <button type="button" onClick={() => moveTo(i, i - 1)} disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`}
                  className="w-10 h-10 shrink-0 rounded-full text-ink hover:bg-sunken flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default">
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => moveTo(i, i + 1)} disabled={i === images.length - 1} aria-label={`Move photo ${i + 1} later`}
                  className="w-10 h-10 shrink-0 rounded-full text-ink hover:bg-sunken flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default">
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
                {i > 0 && (
                  <button type="button" onClick={() => moveTo(i, 0)} aria-label={`Make photo ${i + 1} the cover`} title="Make cover"
                    className="w-10 h-10 shrink-0 rounded-full text-ink hover:bg-sunken flex items-center justify-center cursor-pointer">
                    <Star className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
                <button type="button" onClick={() => onRemove(i)} title="Remove image" aria-label={`Remove photo ${i + 1}`}
                  className="ml-auto w-10 h-10 shrink-0 rounded-full hover:bg-danger-tint text-danger flex items-center justify-center cursor-pointer">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">{said}</p>
    </div>
  );
};
