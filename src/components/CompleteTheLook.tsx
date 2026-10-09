import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { Product, ProductColor, ProductSize } from '../types';
import { useDiscovery } from '../utils/discovery';
import { getCleanImageUrl } from '../utils/imageHelper';
import { trackItem } from '../utils/visitorTracker';
import { BagIcon } from './BrandIcons';
import { AuraTitle, Odometer } from '../aura';
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
    <section id="complete-the-look" data-aura aria-labelledby="ctl-title" className="mt-12 lg:mt-16 border-t border-line pt-12 lg:pt-14">
      <AuraTitle id="ctl-title" title="Complete the" accent="look" size="lg" />
      <p className="aura-sub mt-3.5 max-w-2xl">
        Add the matching {kindsLabel(items)} to make it the full {setLabel(setType)} look. These pieces come only with this outfit and can't be bought on their own.
      </p>

      <div className="aura-card mt-7 p-4 sm:p-5 lg:p-7">
      {/* The outfit is always part of the look */}
      <div className="flex items-center gap-3">
        <img src={getCleanImageUrl(firstImage(product), 240)} alt="" loading="lazy"
          className="w-16 shrink-0 aspect-[4/5] rounded-[17px] object-cover object-top bg-sunken" />
        <div className="min-w-0 flex-1">
          <p className="aura-lbl text-[12px]">Your outfit</p>
          <p className="mt-1.5 text-[14.5px] leading-5 font-medium text-ink line-clamp-1">{product.name}</p>
          <p className="aura-num mt-0.5 text-[13px] leading-[19px] text-ink-muted">
            <span className="font-bold text-ink">{inr(product.price)}</span>
            {' · '}
            {outfitInBag ? (
              <span className="inline-flex items-center gap-1 font-bold text-ok"><Check className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" /> In your bag</span>
            ) : outfitSize ? (
              <>Size {outfitSize}{outfitPieces > 1 ? ` · ${outfitPieces} pieces` : ''}</>
            ) : (
              <button type="button" onClick={onNeedSize} className="sag-link text-[13px]">Choose your size above</button>
            )}
          </p>
        </div>
      </div>

      {/* Matching accessories: tap to add them to the look */}
      <ul aria-label="Matching accessories" className="mt-5 border-t border-line pt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-7">
        {items.map((p) => {
          const added = inLook(p);
          const picked = Boolean(picks[p.id]) && !added;
          const mrp = mrpOf(p);
          const sizes = sizesOf(p);
          const colours = coloursOf(p);
          return (
            <li key={p.id} data-rv className="flex flex-col min-w-0">
              <button type="button" onClick={() => toggle(p)} disabled={added} aria-pressed={picked}
                aria-label={added ? `${p.name} is in your bag with this outfit` : `${picked ? 'Remove' : 'Add'} ${p.name} ${picked ? 'from' : 'to'} this look`}
                className="block w-full text-left cursor-pointer disabled:cursor-default active:[transform:none]!">
                <span className={`sag-zoom block overflow-hidden rounded-[20px] bg-sunken outline-2 outline-offset-2 ${picked || added ? 'outline-brand' : 'outline-transparent'}`}>
                  <img src={getCleanImageUrl(firstImage(p), 360)} alt="" loading="lazy" className="w-full aspect-[4/5] rounded-none object-cover object-top" />
                </span>
                <span className="mt-3 flex items-center justify-between gap-2">
                  <span className="aura-lbl text-[12px] truncate">{accessoryTypeOf(p)}</span>
                  <span aria-hidden="true" className={`w-6 h-6 shrink-0 rounded-full border flex items-center justify-center transition-colors duration-300 ${picked || added ? 'bg-brand border-brand text-[color:var(--sag-on-gold)]' : 'bg-surface border-control'}`}>
                    {(picked || added) && <Check className="w-3.5 h-3.5" strokeWidth={2.2} />}
                  </span>
                </span>
                <span className="mt-1.5 block text-[14px] leading-[19px] font-medium text-ink line-clamp-2">{p.name}</span>
                <span className="aura-num mt-1 flex items-baseline gap-[7px]">
                  <span className="text-[15px] leading-5 font-bold text-ink">{inr(p.price)}</span>
                  {mrp > p.price && <span className="text-[13px] text-ink-muted line-through">{inr(mrp)}</span>}
                </span>
              </button>

              {!added && sizes.length > 1 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={`${p.name} size`}>
                  {sizes.map((sz) => (
                    <button key={sz} type="button" onClick={() => choose(p, { size: sz })} aria-pressed={picks[p.id]?.size === sz}
                      className="sag-chip min-w-[46px] px-3.5 text-[13.5px]">
                      {sz}
                    </button>
                  ))}
                </div>
              )}
              {!added && colours.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${p.name} colour`}>
                  {colours.map((c) => (
                    <button key={c.name} type="button" onClick={() => choose(p, { colour: c.name })} aria-pressed={picks[p.id]?.colour === c.name}
                      className="sag-chip min-w-[46px] px-3.5 text-[13.5px] gap-1.5">
                      <span className="w-3.5 h-3.5 shrink-0 rounded-full border border-control bg-sunken" style={c.hex ? { background: c.hex } : undefined} /> {c.name}
                    </button>
                  ))}
                </div>
              )}

              <p className={`mt-auto pt-2 text-[13px] leading-[18px] ${added || picked ? 'text-ink font-bold' : 'text-ink-muted'}`}>
                {added ? 'In your bag with this outfit' : picked ? (needsSizeChoice(p) && !picks[p.id]?.size ? 'Choose a size' : 'Added to your look') : 'Tap to add'}
              </p>
            </li>
          );
        })}
      </ul>

      {/* Summary and the one button that adds the look */}
      <div className="mt-6 border-t border-line pt-5 flex flex-col sm:flex-row sm:items-center gap-4" aria-live="polite">
        <div className="aura-num min-w-0 flex-1 text-[14.5px] leading-[22px] text-ink">
          {count > 0 ? (
            <p>
              {outfitInBag ? '' : <>Outfit {inr(outfitTotal)} + </>}
              {count} {count === 1 ? 'piece' : 'pieces'} {inr(accessoriesTotal)}
              {' = '}<Odometer value={inr(outfitTotal + accessoriesTotal)} roll={false} className="font-extrabold text-ink" />
              <span className="text-ink-muted"> (preview)</span>
            </p>
          ) : (
            <p>Tap the pieces you want in your look.</p>
          )}
          <p className="text-[13px] leading-[19px] text-ink-muted">Final price is confirmed at checkout.</p>
        </div>
        <button type="button" onClick={addLook} disabled={count === 0} className="aura-btn shrink-0 gap-2">

          <BagIcon mono className="w-4 h-4" /> {count === 0 ? 'Choose pieces' : cta}
        </button>
      </div>
      </div>
    </section>
  );
};
