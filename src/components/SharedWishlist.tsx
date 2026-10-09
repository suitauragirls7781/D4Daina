import React, { useEffect, useState } from 'react';
import { Heart, Loader2, Share2 } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { apiPost } from '../lib/api';
import { Product } from '../types';
import { ProductCard } from './ProductCard';
import { useDiscovery } from '../utils/discovery';
import { AuraTitle } from '../aura';

export const sharedWishlistId = () => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('shared') || '';

/** Someone opened a shared wishlist link: show those real products (no owner details exist in the link). */
export const SharedWishlistView: React.FC<{ id: string }> = ({ id }) => {
  const { allProducts = [], isInWishlist, toggleWishlist, showToast, navigateToCategory } = useShop();
  const [ids, setIds] = useState<string[] | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    fetch(`/api/alerts?wishlist=${encodeURIComponent(id)}`)
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Could not open this wishlist.'); setIds(j.productIds || []); })
      .catch((e) => setError(e.message || 'Something went wrong. Try again.'));
  };
  useEffect(load, [id]);

  const items = (ids || []).map((pid) => allProducts.find((p) => String(p.id) === pid)).filter(Boolean) as Product[];
  const saveAll = () => {
    const toAdd = items.filter((p) => !isInWishlist(p.id));
    toAdd.forEach((p) => toggleWishlist(p));
    showToast(toAdd.length ? `Saved ${toAdd.length} ${toAdd.length === 1 ? 'style' : 'styles'} to your wishlist.` : 'All of these are already in your wishlist.', 'success');
  };

  return (
    <div data-aura className="px-3 pt-6 pb-16 sm:px-6 sm:pt-8 lg:pb-20">
      <div className="max-w-[1120px] mx-auto">
        <AuraTitle
          as="h1"
          className="px-1"
          label="Shared with you"
          title="A wishlist from a"
          accent="friend"
          sub={ids !== null && !error ? <span className="aura-num">{items.length} {items.length === 1 ? 'style' : 'styles'}</span> : undefined}
        />
        {error ? (
          <div role="alert" className="aura-card aura-blk mt-6 px-5 py-9 text-center">
            <p className="text-[16px] leading-[23px] font-semibold text-ink">{error}</p>
            <div className="mt-5 flex flex-col sm:flex-row justify-center gap-2.5">
              <button onClick={() => navigateToCategory('All')} className="aura-btn">Shop all styles</button>
              <button onClick={load} className="aura-btn aura-btn-line">Try again</button>
            </div>
          </div>
        ) : ids === null ? (
          <div className="py-20 flex justify-center" role="status" aria-label="Loading wishlist"><Loader2 className="w-6 h-6 animate-spin text-ink-muted" /></div>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 px-1 empty:hidden">
              {items.length > 0 && <button onClick={saveAll} className="aura-btn aura-btn-w sm:inline-flex sm:w-auto"><Heart strokeWidth={1.6} /> Save all to my wishlist</button>}
            </div>
            <div className="aura-pc-grid mt-6">
              {items.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
            {items.length === 0 && (
              <div className="aura-card aura-blk mt-6 px-5 py-9 text-center">
                <p className="text-[16px] leading-[23px] font-semibold text-ink">These styles are no longer available.</p>
                <button onClick={() => navigateToCategory('All')} className="aura-btn mt-5 w-full sm:w-auto">Shop all styles</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/** Creates a share link for the shopper's wishlist (product ids only). */
export const ShareWishlistButton: React.FC = () => {
  const { wishlist, showToast } = useShop();
  const { features } = useDiscovery();
  const [busy, setBusy] = useState(false);
  if (!features.shareWishlist || wishlist.length === 0) return null;

  const share = async () => {
    setBusy(true);
    try {
      const { id } = await apiPost<{ id: string }>('/api/alerts', { action: 'share-wishlist', productIds: wishlist.map((w) => String(w.id)) });
      const url = `${window.location.origin}/wishlist?shared=${id}`;
      if (navigator.share) {
        await navigator.share({ title: 'My Suit Aura Girls wishlist', url }).catch(() => {});
      } else {
        await navigator.clipboard.writeText(url);
        showToast('Wishlist link copied. Share it with anyone.', 'success');
      }
    } catch (e: any) {
      showToast(e?.message || 'Could not create the link. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={share} disabled={busy} className="aura-btn aura-btn-line aura-btn-sm">
      {busy ? <Loader2 className="animate-spin" /> : <Share2 strokeWidth={1.6} />} Share wishlist
    </button>
  );
};
