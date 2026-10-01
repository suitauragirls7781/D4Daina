import React, { useEffect, useMemo, useState } from 'react';
import { Check, ShoppingBag, Sparkles } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { Product, ProductColor, ProductSize } from '../types';
import { useDiscovery } from '../utils/discovery';
import { getCleanImageUrl } from '../utils/imageHelper';
import { trackItem } from '../utils/visitorTracker';
import { BagIcon } from './BrandIcons';
import {
  ACCESSORY_TYPES, SET_TYPES, accessoryTypeOf, colourByName, coloursOf, defaultSizeFor, inr, lookFor, needsSizeChoice, outfitQtyIn,
  setTypeOf, sizesOf, useLookRelations,
} from '../utils/looks';

interface CompleteTheLookProps {
  product: Product;
  /** The outfit size and colour chosen on the product page (the look adds the outfit in these). */
  selectedSize?: ProductSize | null;
  selectedColor?: ProductColor | null;
  /** Outfit pieces chosen on the product page. */
  quantity?: number;
  /** Marks the product page's size picker and scrolls to it when the outfit size is still missing. */
  onNeedSize?: () => void;
}

type Pick = { size: string; colour: string };

const mrpOf = (p: Product) => Math.max(p.price, Number(p.originalPrice) || p.price);
const firstImage = (p: Product) => p.images?.find(Boolean) || p.image || '';

/** "5 piece set", "full combo" or the admin's own words. */
const setLabel = (setType: string) => {
  if (!(SET_TYPES as readonly string[]).includes(setType)) return setType;
  return /piece$/i.test(setType) ? `${setType.toLowerCase()} set` : setType.toLowerCase();
};

/** "bag, heels and jewellery" from the kinds on offer (in the usual order). */
const kindsLabel = (items: Product[]) => {
  const kinds = [...new Set(items.map(accessoryTypeOf))]
    .sort((a, b) => {
      const ia = (ACCESSORY_TYPES as readonly string[]).indexOf(a);
      const ib = (ACCESSORY_TYPES as readonly string[]).indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map((k) => (k === 'Other' ? 'accessories' : k.toLowerCase()));
  if (kinds.length <= 1) return kinds[0] || 'accessories';
  return `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`;
};

/**
 * "Complete the look": its own section on combo / set product pages. The shopper ticks the matching
 * accessories the admin added (bag, heels, jewellery...) and adds them together with this outfit.
 * Accessories are never sold on their own: they have no page, can't be added without the outfit, and
 * leave the bag with it (ShopContext.enforceLooks; the server checks the same at checkout).
 */
export const CompleteTheLook: React.FC<CompleteTheLookProps> = ({ product, selectedSize, selectedColor, quantity = 1, onNeedSize }) => {
  const { accessories = [], cart = [], addLookToBag, showToast } = useShop();
  const { features } = useDiscovery();
  const setType = setTypeOf(product);
  const relations = useLookRelations(Boolean(setType) && features.completeLook);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  useEffect(() => { setPicks({}); }, [product.id]);

  const items = useMemo(
    () => (relations ? lookFor(product, relations, accessories).items : []),
    [product, relations, accessories],
  );
  if (!features.completeLook || !setType || items.length === 0) return null;

  const parentId = String(product.id);
  const outfitInBag = outfitQtyIn(cart, parentId) > 0;
  const inLook = (p: Product) => cart.some((item) => String(item.product?.id) === String(p.id) && item.lookParentId === parentId);
  const firstColour = (p: Product) => coloursOf(p)[0]?.name || '';

  const toggle = (p: Product) => {
    if (inLook(p)) return;
    setPicks((prev) => {
      const next = { ...prev };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = { size: String(defaultSizeFor(p) || ''), colour: firstColour(p) };
      return next;
    });
  };
  const choose = (p: Product, change: Partial<Pick>) =>
    setPicks((prev) => ({ ...prev, [p.id]: { size: prev[p.id]?.size ?? String(defaultSizeFor(p) || ''), colour: prev[p.id]?.colour ?? firstColour(p), ...change } }));

  const chosen = items.filter((p) => picks[p.id] && !inLook(p));
  const missingSize = chosen.find((p) => needsSizeChoice(p) && !picks[p.id]?.size);
  const accessoriesTotal = chosen.reduce((sum, p) => sum + p.price, 0);
  const outfitPieces = Math.max(1, quantity);
  const outfitTotal = outfitInBag ? 0 : product.price * outfitPieces;
  const outfitSize = selectedSize || (defaultSizeFor(product) as ProductSize) || null;

  const addLook = () => {
    if (chosen.length === 0) return;
    if (missingSize) {
      showToast(`Choose a size for ${missingSize.name}.`, 'info');
      return;
    }
    if (!outfitInBag && !outfitSize) {
      onNeedSize?.();
      showToast('Choose your outfit size first, then add the look.', 'info');
      return;
    }
    const added = addLookToBag(
      product,
      (outfitSize || 'Free Size') as ProductSize,
      selectedColor || undefined,
      outfitPieces,
      chosen.map((p) => ({ product: p, size: (picks[p.id]?.size || defaultSizeFor(p) || 'Free Size') as ProductSize, color: colourByName(p, picks[p.id]?.colour || '') })),
    );
    if (added) {
      setPicks({});
      trackItem('feature_use', 'complete_look_add');
    }
  };

  const count = chosen.length;
  const cta = outfitInBag
    ? `Add ${count || ''} ${count === 1 ? 'piece' : 'pieces'} to my look`.replace('  ', ' ')
    : 'Add complete look to bag';

  return (
    <section id="complete-the-look" aria-labelledby="ctl-title" className="mt-14 sm:mt-20 rounded-3xl bg-[#F3EEF8] border border-[#4B1D3F]/10 px-4 py-6 sm:px-8 sm:py-9">
      <div className="max-w-3xl">
        <p className="sag-eyebrow inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-[#9C7A45]" /> Complete the look</p>
        <h2 id="ctl-title" className="mt-2 font-serif text-3xl sm:text-4xl text-[#4B1D3F] leading-tight">Make it the full {setLabel(setType)} look</h2>
        <p className="mt-2 text-sm sm:text-base text-[#2A1A26]/75">
          Add the matching {kindsLabel(items)} to this outfit. These pieces come only with this outfit and can't be bought on their own.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] items-start">
        {/* The outfit is always part of the look */}
        <div className="rounded-2xl bg-white border border-[#4B1D3F]/10 p-3 flex lg:flex-col gap-3">
          <img src={getCleanImageUrl(firstImage(product), 480)} alt="" loading="lazy"
            className="w-24 sm:w-28 lg:w-full shrink-0 aspect-[4/5] rounded-xl object-cover object-top bg-[#F3EEF8]" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9C7A45]">Your outfit</p>
            <p className="mt-0.5 font-serif text-lg text-[#2A1A26] leading-snug line-clamp-2">{product.name}</p>
            <p className="mt-1 text-sm font-semibold text-[#4B1D3F]">{inr(product.price)}</p>
            <p className="mt-1.5 text-xs text-[#2A1A26]/70">
              {outfitInBag ? (
                <span className="inline-flex items-center gap-1 text-emerald-800"><Check className="w-3.5 h-3.5" /> In your bag</span>
              ) : outfitSize ? (
                <>Size {outfitSize}{outfitPieces > 1 ? ` · ${outfitPieces} pieces` : ''}</>
              ) : (
                <button type="button" onClick={onNeedSize} className="underline underline-offset-2 text-[#4B1D3F] cursor-pointer">Choose your size above</button>
              )}
            </p>
          </div>
        </div>

        {/* Matching accessories: tap to add them to the look */}
        <ul aria-label="Matching accessories" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((p) => {
            const added = inLook(p);
            const picked = Boolean(picks[p.id]) && !added;
            const mrp = mrpOf(p);
            const sizes = sizesOf(p);
            const colours = coloursOf(p);
            return (
              <li key={p.id} className={`rounded-2xl bg-white p-2.5 flex flex-col border transition-colors ${picked ? 'border-[#4B1D3F] ring-1 ring-[#4B1D3F]' : 'border-[#4B1D3F]/10'}`}>
                <button type="button" onClick={() => toggle(p)} disabled={added} aria-pressed={picked}
                  aria-label={added ? `${p.name} is in your bag with this outfit` : `${picked ? 'Remove' : 'Add'} ${p.name} ${picked ? 'from' : 'to'} this look`}
                  className="group block w-full text-left cursor-pointer disabled:cursor-default">
                  <span className="block overflow-hidden rounded-xl bg-[#F3EEF8]">
                    <img src={getCleanImageUrl(firstImage(p), 360)} alt="" loading="lazy"
                      className="w-full aspect-[4/5] object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]" />
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9C7A45] truncate">{accessoryTypeOf(p)}</span>
                    <span aria-hidden="true" className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center transition-colors ${picked || added ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'bg-white border-[#4B1D3F]/30'}`}>
                      {(picked || added) && <Check className="w-3 h-3" strokeWidth={3} />}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-[#2A1A26] leading-snug line-clamp-2">{p.name}</span>
                  <span className="mt-1 block text-sm">
                    <span className="font-semibold text-[#4B1D3F]">{inr(p.price)}</span>
                    {mrp > p.price && <span className="ml-1.5 text-xs text-[#2A1A26]/50 line-through">{inr(mrp)}</span>}
                  </span>
                </button>

                {!added && sizes.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${p.name} size`}>
                    {sizes.map((sz) => (
                      <button key={sz} type="button" onClick={() => choose(p, { size: sz })} aria-pressed={picks[p.id]?.size === sz}
                        className={`h-8 min-w-[44px] px-2 rounded-full border text-xs cursor-pointer transition-colors ${picks[p.id]?.size === sz ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'bg-white border-[#4B1D3F]/20 text-[#2A1A26] hover:border-[#4B1D3F]/50'}`}>
                        {sz}
                      </button>
                    ))}
                  </div>
                )}
                {!added && colours.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${p.name} colour`}>
                    {colours.map((c) => (
                      <button key={c.name} type="button" onClick={() => choose(p, { colour: c.name })} aria-pressed={picks[p.id]?.colour === c.name}
                        className={`h-8 px-2.5 rounded-full border text-xs inline-flex items-center gap-1.5 cursor-pointer ${picks[p.id]?.colour === c.name ? 'border-[#4B1D3F] bg-[#F3EEF8] text-[#4B1D3F]' : 'bg-white border-[#4B1D3F]/20 text-[#2A1A26]'}`}>
                        <span className="w-3 h-3 rounded-full border border-black/10" style={{ background: c.hex || '#ccc' }} /> {c.name}
                      </button>
                    ))}
                  </div>
                )}

                <p className={`mt-auto pt-2 text-xs ${added ? 'text-emerald-800' : picked ? 'text-[#4B1D3F] font-medium' : 'text-[#2A1A26]/60'}`}>
                  {added ? 'In your bag with this outfit' : picked ? (needsSizeChoice(p) && !picks[p.id]?.size ? 'Choose a size' : 'Added to your look') : 'Tap to add'}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Summary and the one button that adds the look */}
      <div className="mt-6 rounded-2xl bg-white border border-[#4B1D3F]/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3" aria-live="polite">
        <div className="min-w-0 flex-1 text-sm text-[#2A1A26]">
          {count > 0 ? (
            <p>
              {outfitInBag ? '' : <>Outfit {inr(outfitTotal)} + </>}
              {count} {count === 1 ? 'piece' : 'pieces'} {inr(accessoriesTotal)}
              {' = '}<span className="font-semibold text-[#4B1D3F]">{inr(outfitTotal + accessoriesTotal)}</span>
              <span className="text-[#2A1A26]/60"> (preview)</span>
            </p>
          ) : (
            <p>Tap the pieces you want in your look.</p>
          )}
          <p className="text-xs text-[#2A1A26]/60">Final price is confirmed at checkout.</p>
        </div>
        <button type="button" onClick={addLook} disabled={count === 0}
          className="sag-btn-primary shrink-0 h-12 px-6 text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
          <BagIcon mono className="w-[18px] h-[18px]" /> {count === 0 ? 'Choose pieces' : cta}
        </button>
      </div>
    </section>
  );
};
