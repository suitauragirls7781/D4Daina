import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
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
    <section id="complete-the-look" aria-labelledby="ctl-title" className="mt-10 border-t border-line pt-7 lg:mt-14 lg:pt-10">
      <h2 id="ctl-title" className="font-display text-[19px] leading-6 font-medium text-ink">Complete the look</h2>
      <p className="mt-2 max-w-2xl text-[13.5px] leading-5 text-ink-muted">
        Add the matching {kindsLabel(items)} to make it the full {setLabel(setType)} look. These pieces come only with this outfit and can't be bought on their own.
      </p>

      {/* The outfit is always part of the look */}
      <div className="mt-5 flex items-center gap-3">
        <img src={getCleanImageUrl(firstImage(product), 240)} alt="" loading="lazy"
          className="w-14 shrink-0 aspect-[4/5] object-cover object-top bg-sunken" />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale">Your outfit</p>
          <p className="mt-1 text-[13px] leading-5 text-ink line-clamp-1">{product.name}</p>
          <p className="sag-num text-[12.5px] leading-[18px] text-ink-muted">
            <span className="font-semibold text-ink">{inr(product.price)}</span>
            {' · '}
            {outfitInBag ? (
              <span className="inline-flex items-center gap-1 font-medium text-ink"><Check className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" /> In your bag</span>
            ) : outfitSize ? (
              <>Size {outfitSize}{outfitPieces > 1 ? ` · ${outfitPieces} pieces` : ''}</>
            ) : (
              <button type="button" onClick={onNeedSize} className="sag-link text-[12.5px] underline-offset-4 decoration-1">Choose your size above</button>
            )}
          </p>
        </div>
      </div>

      {/* Matching accessories: tap to add them to the look */}
      <ul aria-label="Matching accessories" className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-6">
        {items.map((p) => {
          const added = inLook(p);
          const picked = Boolean(picks[p.id]) && !added;
          const mrp = mrpOf(p);
          const sizes = sizesOf(p);
          const colours = coloursOf(p);
          return (
            <li key={p.id} className="flex flex-col min-w-0">
              <button type="button" onClick={() => toggle(p)} disabled={added} aria-pressed={picked}
                aria-label={added ? `${p.name} is in your bag with this outfit` : `${picked ? 'Remove' : 'Add'} ${p.name} ${picked ? 'from' : 'to'} this look`}
                className="block w-full text-left cursor-pointer disabled:cursor-default active:[transform:none]!">
                <span className="block overflow-hidden bg-sunken">
                  <img src={getCleanImageUrl(firstImage(p), 360)} alt="" loading="lazy" className="w-full aspect-[4/5] object-cover object-top" />
                </span>
                <span className="mt-[9px] flex items-center justify-between gap-2">
                  <span className="text-[10.5px] leading-4 font-semibold uppercase tracking-[0.12em] text-ink-muted truncate">{accessoryTypeOf(p)}</span>
                  <span aria-hidden="true" className={`w-5 h-5 shrink-0 border flex items-center justify-center ${picked || added ? 'bg-ink border-ink text-white' : 'bg-surface border-control'}`}>
                    {(picked || added) && <Check className="w-3.5 h-3.5" strokeWidth={2} />}
                  </span>
                </span>
                <span className="mt-1 block text-[13px] leading-[18px] font-normal text-ink line-clamp-2">{p.name}</span>
                <span className="sag-num mt-1 flex items-baseline gap-[7px]">
                  <span className="text-[14.5px] leading-5 font-semibold text-ink">{inr(p.price)}</span>
                  {mrp > p.price && <span className="text-[12.5px] text-ink-muted line-through">{inr(mrp)}</span>}
                </span>
              </button>

              {!added && sizes.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${p.name} size`}>
                  {sizes.map((sz) => (
                    <button key={sz} type="button" onClick={() => choose(p, { size: sz })} aria-pressed={picks[p.id]?.size === sz}
                      className="h-[38px] sm:h-11 min-w-11 px-2.5 text-[13px] leading-5 inline-flex items-center justify-center border border-line bg-surface text-ink cursor-pointer transition-colors hover:border-control aria-pressed:border-ink aria-pressed:font-semibold aria-pressed:shadow-[inset_0_0_0_1px_var(--sag-ink)]">
                      {sz}
                    </button>
                  ))}
                </div>
              )}
              {!added && colours.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${p.name} colour`}>
                  {colours.map((c) => (
                    <button key={c.name} type="button" onClick={() => choose(p, { colour: c.name })} aria-pressed={picks[p.id]?.colour === c.name}
                      className="h-[38px] sm:h-11 min-w-11 px-2.5 text-[13px] leading-5 gap-1.5 inline-flex items-center justify-center border border-line bg-surface text-ink cursor-pointer transition-colors hover:border-control aria-pressed:border-ink aria-pressed:font-semibold aria-pressed:shadow-[inset_0_0_0_1px_var(--sag-ink)]">
                      <span className="w-3.5 h-3.5 shrink-0 rounded-full border border-line" style={{ background: c.hex || '#ccc' }} /> {c.name}
                    </button>
                  ))}
                </div>
              )}

              <p className={`mt-auto pt-2 text-[12.5px] leading-[18px] ${added || picked ? 'text-ink font-medium' : 'text-ink-muted'}`}>
                {added ? 'In your bag with this outfit' : picked ? (needsSizeChoice(p) && !picks[p.id]?.size ? 'Choose a size' : 'Added to your look') : 'Tap to add'}
              </p>
            </li>
          );
        })}
      </ul>

      {/* Summary and the one button that adds the look */}
      <div className="mt-6 border-t border-line pt-5 flex flex-col sm:flex-row sm:items-center gap-3.5" aria-live="polite">
        <div className="sag-num min-w-0 flex-1 text-[13.5px] leading-5 text-ink">
          {count > 0 ? (
            <p>
              {outfitInBag ? '' : <>Outfit {inr(outfitTotal)} + </>}
              {count} {count === 1 ? 'piece' : 'pieces'} {inr(accessoriesTotal)}
              {' = '}<span className="font-semibold text-ink">{inr(outfitTotal + accessoriesTotal)}</span>
              <span className="text-ink-muted"> (preview)</span>
            </p>
          ) : (
            <p>Tap the pieces you want in your look.</p>
          )}
          <p className="text-[12.5px] leading-[18px] text-ink-muted">Final price is confirmed at checkout.</p>
        </div>
        <button type="button" onClick={addLook} disabled={count === 0} className="sag-btn-outline shrink-0 h-12 px-6 gap-2">
          <BagIcon mono className="w-4 h-4" /> {count === 0 ? 'Choose pieces' : cta}
        </button>
      </div>
    </section>
  );
};
