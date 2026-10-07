import React, { useEffect, useState } from 'react';
import { Heart, Loader2, Share2 } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { apiPost } from '../lib/api';
import { Product } from '../types';
import { ProductCard } from './ProductCard';
import { useDiscovery } from '../utils/discovery';

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
    <div className="pt-6 pb-14 sm:pt-8 lg:pb-20 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="sag-eyebrow">Shared with you</p>
        <h1 className="mt-1 font-display text-[28px] leading-8 lg:text-4xl lg:leading-[1.15] text-ink">A wishlist from a friend</h1>
        {error ? (
          <div role="alert" className="mt-6 sag-card p-5 text-center">
            <p className="text-[15px] leading-[22px] text-ink">{error}</p>
            <div className="mt-4 flex flex-col sm:flex-row justify-center gap-2.5">
              <button onClick={() => navigateToCategory('All')} className="sag-btn-primary h-12 px-6 text-[15px]">Shop all styles</button>
              <button onClick={load} className="sag-btn-outline h-12 px-6 text-[15px]">Try again</button>
            </div>
          </div>
        ) : ids === null ? (
          <div className="py-20 flex justify-center" role="status" aria-label="Loading wishlist"><Loader2 className="w-6 h-6 animate-spin text-ink-muted" /></div>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="sag-num text-sm text-ink-muted">{items.length} {items.length === 1 ? 'style' : 'styles'}</p>
              {items.length > 0 && <button onClick={saveAll} className="sag-btn-outline h-11 px-4 text-sm gap-1.5"><Heart className="w-4 h-4" /> Save all to my wishlist</button>}
            </div>
            <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-x-5 sm:gap-y-9">
              {items.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
            {items.length === 0 && (
              <div className="mt-6 sag-card p-5 text-center">
                <p className="text-[15px] leading-[22px] text-ink">These styles are no longer available.</p>
                <button onClick={() => navigateToCategory('All')} className="mt-4 sag-btn-primary h-12 px-6 text-[15px] w-full sm:w-auto">Shop all styles</button>
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
    <button onClick={share} disabled={busy} className="sag-link gap-1.5 disabled:opacity-60">
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Share wishlist
    </button>
  );
};
