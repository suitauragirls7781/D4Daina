import React, { useState } from 'react';
import { Heart, Share2 } from 'lucide-react';
import type { ProductSize } from '../../../types';
import { getCleanImageUrl } from '../../../utils/imageHelper';
import { offOf, rupees } from './catalogueKit';

/**
 * Live previews of a product while it is being edited, drawn from the form's own values with the same rules the
 * store uses: the shop card (ProductCard.tsx), the first screen of the product page on a phone
 * (ProductDetailPage.tsx, `.pdp-top`) and the link preview WhatsApp / Google show (worker/src/linkPreview.js).
 * They are pictures of those parts, not the parts themselves, so nothing in them can be tapped.
 */

export interface PreviewData {
  name: string;
  category: string;
  price: number;
  mrp: number;
  images: string[];
  sizes: ProductSize[];
  stock: number;
  published: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  isTrending: boolean;
  description: string;
  seoTitle: string;
  seoDescription: string;
}

type Tab = 'card' | 'page' | 'link';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'card', label: 'Shop card' },
  { id: 'page', label: 'Phone page' },
  { id: 'link', label: 'Shared link' },
];

const clipText = (text: string, max: number) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : clean;
};

/** The same words the Worker writes into a shared product link (worker/src/linkPreview.js). */
export const linkPreviewText = (d: PreviewData) => {
  const name = clipText(d.name, 110);
  const price = Math.round(d.price) || 0;
  const mrp = Math.max(price, Math.round(d.mrp) || price);
  const off = offOf(price, mrp);
  const sizeText = d.sizes.length > 1 ? `Sizes ${d.sizes[0]} to ${d.sizes[d.sizes.length - 1]}` : d.sizes[0] && d.sizes[0] !== 'Free Size' ? `Size ${d.sizes[0]}` : '';
  const facts = [
    off > 0 ? `${rupees(price)} · ${off}% off (MRP ${rupees(mrp)})` : rupees(price),
    d.category,
    sizeText,
    d.stock <= 0 ? 'Sold out right now' : '',
  ].filter(Boolean).join(' · ');
  const about = clipText(d.seoDescription || d.description, 150);
  return {
    title: `${name} · ${rupees(price)} | Suit Aura Girls`,
    description: clipText(about ? `${facts}. ${about}` : facts, 200),
  };
};

const Photo: React.FC<{ url?: string; width: number; className: string }> = ({ url, width, className }) => (url
  ? <img src={getCleanImageUrl(url, width)} alt="" draggable={false} className={`${className} object-cover object-top bg-sunken`} />
  : <span className={`${className} bg-sunken flex items-center justify-center text-[12px] text-ink-faint`}>No photo yet</span>);

export const ProductPreviews: React.FC<{ data: PreviewData; id?: string }> = ({ data, id = 'apf-previews' }) => {
  const [tab, setTab] = useState<Tab>('card');
  const price = Math.round(data.price) || 0;
  const mrp = Math.max(price, Math.round(data.mrp) || price);
  const off = offOf(price, mrp);
  const soldOut = data.stock <= 0;
  // Same order as ProductCard: the % off sits by the price, so the badge only carries status
  const badge = soldOut ? 'Sold out' : data.isNewArrival ? 'New' : data.isBestSeller ? 'Bestseller' : data.isTrending ? 'Trending' : '';
  const name = data.name.trim() || 'Product name';
  const link = linkPreviewText({ ...data, name });
  const titleLong = data.seoTitle.trim().length > 60;

  return (
    <section id={id} aria-label="How it will look" className="sag-glass p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] leading-4 font-bold uppercase tracking-[0.08em] text-ink-muted">How it will look</p>
        {!data.published && <span className="text-[12px] text-ink-muted">Draft: shoppers do not see it yet</span>}
      </div>
      <div role="tablist" aria-label="Preview" className="mt-2.5 grid grid-cols-3 gap-1 p-1 rounded-full bg-sunken">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`h-9 rounded-full text-[12.5px] font-semibold cursor-pointer transition-colors ${tab === t.id ? 'bg-ink text-[color:var(--sag-on-gold)]' : 'text-ink-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3.5" aria-hidden="true" inert>
        {tab === 'card' && (
          // ProductCard: white 22px card, 3:4 photo with only the heart on it, the label under the photo, name, price row
          <div className="mx-auto w-[min(100%,210px)] rounded-[22px] bg-surface p-2 ring-1 ring-line">
            <div className="relative">
              <Photo url={data.images[0]} width={480} className="w-full aspect-[3/4] rounded-[17px]" />
              <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-surface flex items-center justify-center text-ink"><Heart className="w-4 h-4" strokeWidth={1.8} /></span>
            </div>
            <div className="px-1.5 pt-2.5 pb-1.5">
              <span className={`inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-semibold ${badge === 'Sold out' ? 'bg-danger-tint text-danger' : 'bg-highlight text-ink'}`}>{badge || data.category}</span>
              <p className="mt-1.5 text-[13.5px] leading-[18px] font-semibold text-ink line-clamp-2">{name}</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 sag-num">
                <span className="text-[15px] font-extrabold text-ink">{rupees(price)}</span>
                {mrp > price && <span className="text-[12px] text-ink-muted line-through">{rupees(mrp)}</span>}
                {off > 0 && <span className="text-[12px] font-bold text-sale">{off}% off</span>}
              </p>
              <span className="mt-2 flex items-center justify-center h-9 rounded-full border border-ink text-[13px] font-semibold text-ink">{soldOut ? 'Sold out' : 'Add to bag'}</span>
            </div>
          </div>
        )}

        {tab === 'page' && (
          // Product page on a phone: label · category, the name and the price ABOVE the photo (.pdp-top)
          <div className="mx-auto w-[min(100%,236px)] rounded-[30px] border-[6px] border-ink bg-page overflow-hidden">
            <div className="h-9 bg-page flex items-center justify-center text-[11px] font-extrabold tracking-[0.04em] text-ink">SUIT <em className="mx-1 font-serif font-normal not-italic text-accent">Aura</em> GIRLS</div>
            <div className="px-3 pt-1 pb-2">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-ink-muted">{badge ? `${badge} · ${data.category}` : data.category}</p>
              <div className="mt-1 flex items-start gap-1.5">
                <p className="flex-1 min-w-0 text-[16px] leading-[18px] font-extrabold tracking-[-0.02em] text-ink line-clamp-3">{name}</p>
                <Heart className="w-4 h-4 shrink-0 mt-0.5 text-ink" strokeWidth={1.6} />
                <Share2 className="w-4 h-4 shrink-0 mt-0.5 text-ink" strokeWidth={1.6} />
              </div>
              <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 sag-num">
                <span className="text-[18px] font-extrabold text-ink">{rupees(price)}</span>
                {mrp > price && <span className="text-[11px] text-ink-muted line-through">{rupees(mrp)}</span>}
                {off > 0 && <span className="px-1.5 rounded-full bg-highlight text-[10px] font-semibold text-ink">{off}% off</span>}
              </p>
            </div>
            <div className="px-2">
              <Photo url={data.images[0]} width={640} className="w-full aspect-[4/5] rounded-[18px]" />
              <p className="py-1.5 text-center text-[10px] text-ink-muted sag-num">{data.images.length ? `1 / ${data.images.length}` : ''}</p>
            </div>
            <div className="mx-2 mb-2 h-10 rounded-full bg-ink flex items-center justify-center text-[12px] font-semibold text-[color:var(--sag-on-gold)]">{soldOut ? 'Sold out' : 'Buy now'}</div>
          </div>
        )}

        {tab === 'link' && (
          <div className="space-y-3">
            {/* WhatsApp-style bubble: the 480px photo, the title and the facts line */}
            <div className="ml-auto w-[min(100%,270px)] rounded-[14px] bg-ok-tint ring-1 ring-ok-line p-1 text-ink">
              <div className="rounded-[10px] bg-surface overflow-hidden">
                <Photo url={data.images[0]} width={480} className="w-full aspect-[1.6] rounded-none" />
                <div className="px-2.5 py-2">
                  <p className="text-[13px] leading-[17px] font-semibold line-clamp-2">{link.title}</p>
                  <p className="mt-0.5 text-[12px] leading-4 text-ink-muted line-clamp-3">{link.description}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">suitauragirls.in</p>
                </div>
              </div>
              <p className="px-1.5 pt-1 text-[12.5px] text-ok underline break-all">https://www.suitauragirls.in/product/…</p>
            </div>
            {/* Google result: the page title the product page sets, and its description */}
            <div className="rounded-[16px] bg-surface ring-1 ring-line p-3">
              <p className="text-[11.5px] text-ink-muted">suitauragirls.in › product</p>
              <p className="mt-0.5 text-[15px] leading-5 text-ok font-semibold line-clamp-1">{data.seoTitle.trim() || `${name} | Suit Aura Girls`}</p>
              <p className="mt-0.5 text-[12.5px] leading-[18px] text-ink-muted line-clamp-2">{clipText(data.seoDescription || data.description || `${name} — ${data.category} by Suit Aura Girls.`, 160)}</p>
            </div>
          </div>
        )}
      </div>
      {tab === 'link' && (
        <p className="mt-2.5 text-[12px] leading-4 text-ink-muted">
          WhatsApp, Instagram and Facebook show the first photo, the name with the price, and the line above. {titleLong ? 'Your Google title is longer than 60 characters, so Google may cut it.' : ''}
        </p>
      )}
      {tab !== 'link' && !data.published && (
        <p className="mt-2.5 text-[12px] leading-4 text-ink-muted">This is how it will look once published.</p>
      )}
    </section>
  );
};
