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
    <div className="py-10 sm:py-16 bg-[#FBF7F3]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="sag-eyebrow">Shared with you</p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl text-[#4B1D3F]">A wishlist from a friend</h1>
        {error ? (
          <div className="mt-8 sag-card p-6 text-center">
            <p className="text-[#2A1A26]">{error}</p>
            <div className="mt-4 flex justify-center gap-3">
              <button onClick={load} className="sag-btn-outline h-11 px-6 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">Try again</button>
              <button onClick={() => navigateToCategory('All')} className="sag-btn-primary h-11 px-6 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">Shop all styles</button>
            </div>
          </div>
        ) : ids === null ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#4B1D3F]" /></div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-sm text-[#2A1A26]/70">{items.length} {items.length === 1 ? 'style' : 'styles'}</p>
              {items.length > 0 && <button onClick={saveAll} className="h-10 px-4 rounded-full border border-[#4B1D3F]/20 bg-white text-sm text-[#4B1D3F] inline-flex items-center gap-1.5 hover:bg-[#F3EEF8] cursor-pointer"><Heart className="w-4 h-4" /> Save all to my wishlist</button>}
            </div>
            <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {items.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
            {items.length === 0 && <p className="mt-6 text-sm text-[#2A1A26]/70">These styles are no longer available.</p>}
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
    <button onClick={share} disabled={busy} className="h-10 px-4 rounded-full border border-[#4B1D3F]/20 bg-white text-sm text-[#4B1D3F] inline-flex items-center gap-1.5 hover:bg-[#F3EEF8] disabled:opacity-60 cursor-pointer">
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Share wishlist
    </button>
  );
};
