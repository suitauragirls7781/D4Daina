import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { deleteImages, uploadImage } from '../../lib/dataStore';
import { 
  Save, 
  Sparkles, 
  Plus,
  Trash2,
  ExternalLink,
  Upload,
  Image as ImageIcon,
  X,
  Loader2,
  CheckCircle2,
  Eye,
  ShoppingBag,
  Search,
  Check,
  RefreshCw,
  Zap,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { HeroBannerConfig } from '../../types';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { AdminPageHeader } from './kidsToysShared';

const AVAILABLE_CATEGORIES = [
  'All',
  'Suits',
  'Kurtis',
  'Dresses',
  'Dupatta Sets',
  'Co-ord Sets',
  'Anarkali',
  'Festive Wear',
  'Party Wear',
  'New Arrivals'
];

export const AdminHero: React.FC = () => {
  const { 
    products,
    heroConfig, 
    updateHeroConfig,
    syncHeroWithLiveProducts,
    dealOfTheDay
  } = useAdmin();
  const { showToast, setActivePage } = useShop();

  const [heroForm, setHeroForm] = useState<HeroBannerConfig>(heroConfig || { slides: [] });
  const [uploadingSlideId, setUploadingSlideId] = useState<string | null>(null);
  const [productPickerSlideId, setProductPickerSlideId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (heroConfig?.slides) {
      setHeroForm(heroConfig);
    }
  }, [heroConfig]);

  const handleHeroSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const previousBanners = (heroConfig?.slides || []).map((slide) => slide.bannerImage).filter(Boolean) as string[];
      await updateHeroConfig(heroForm);
      showToast('Hero banner slides saved & synced to the database successfully!', 'success');
      // Delete banner photos that were replaced or removed, unless something else still shows them
      const stillUsed = new Set<string>([
        ...heroForm.slides.map((slide) => slide.bannerImage || ''),
        dealOfTheDay?.bannerImage || '',
        ...products.flatMap((product) => product.images || []),
      ]);
      const removed = previousBanners.filter((url) => !stillUsed.has(url));
      if (removed.length > 0) {
        deleteImages(removed).catch((error) => console.error('Error deleting old banner photos:', error));
      }
    } catch (err) {
      console.error(err);
      showToast('Error saving hero slides.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickSyncProducts = async () => {
    setIsSyncing(true);
    try {
      await syncHeroWithLiveProducts();
      showToast('6 live products synchronized with Hero Slides & the database!', 'success');
    } catch (e) {
      console.error(e);
      showToast('Error syncing products with hero slides', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImageUpload = async (slideId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Only image files can be uploaded.', 'error');
      return;
    }

    setUploadingSlideId(slideId);
    showToast('Uploading banner image...', 'info');

    let imageUrl = '';

    try {
      imageUrl = await uploadImage(file, 'hero');
    } catch (err: any) {
      console.error('Cloudinary hero upload failed:', err);
      showToast(`Failed to upload banner image: ${err?.message || 'Please try again.'}`, 'error');
      setUploadingSlideId(null);
      return;
    }

    if (imageUrl) {
      // Stored separately from the product photo so product sync never replaces it
      updateSlide(slideId, { bannerImage: imageUrl });
      showToast('Banner photo uploaded. Click "Save" to publish it.', 'success');
    }
    setUploadingSlideId(null);
  };

  const addSlide = () => {
    const newSlide = {
      id: `slide-${Date.now()}`,
      title: '',
      subtitle: '',
      badge: '',
      image: '',
      price: 0,
      originalPrice: 0,
      customText: true,
      linkText: 'BUY NOW',
      link: 'Suits'
    };
    setHeroForm(prev => ({
      ...prev,
      slides: [...(prev.slides || []), newSlide]
    }));
  };

  const updateSlide = (id: string, updated: any) => {
    setHeroForm(prev => ({
      ...prev,
      slides: (prev.slides || []).map(s => s.id === id ? { ...s, ...updated } : s)
    }));
  };

  const removeSlide = (id: string) => {
    setHeroForm(prev => ({
      ...prev,
      slides: (prev.slides || []).filter(s => s.id !== id)
    }));
    showToast('Slide removed from list (Click Save to finalize)', 'info');
  };

  const moveSlide = (index: number, direction: 'up' | 'down') => {
    const slides = [...(heroForm.slides || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= slides.length) return;

    const temp = slides[index];
    slides[index] = slides[targetIndex];
    slides[targetIndex] = temp;

    setHeroForm({ ...heroForm, slides });
  };

  const handleSelectProductForSlide = (slideId: string, product: any) => {
    const productImg = getCleanImageUrl(product.images?.[0] || product.image);
    updateSlide(slideId, {
      title: product.name,
      subtitle: product.fabric || product.shortDescription || product.description || 'Pure handcrafted ethnic ensemble',
      badge: '🔥 POPULAR PICK',
      image: productImg,
      price: product.price,
      originalPrice: Math.max(product.price, Number(product.originalPrice) || product.price),
      linkText: 'BUY NOW',
      link: product.id,
      productId: product.id,
      customText: false
    });
    setProductPickerSlideId(null);
    showToast(`Product "${product.name}" linked to slide!`, 'success');
  };

  const filteredProducts = products.filter(p => p.productType !== 'accessory' && (
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.category.toLowerCase().includes(productSearch.toLowerCase())
  ));

  return (
    <div id="admin-hero-page" className="space-y-6 pb-12">
      
      {/* Header */}
      <AdminPageHeader
        eyebrow="Storefront banners"
        title="Hero slides"
        icon={<Sparkles className="text-current" />}
        description="The main square (1:1) slider at the top of the homepage. Change, add, reorder or delete slides, or link a slide to a real product."
        actions={<>
          {/* Quick Sync Button */}
          <button
            type="button"
            onClick={handleQuickSyncProducts}
            disabled={isSyncing}
            className="h-11 px-4 bg-white border-[1.5px] border-control hover:bg-sunken text-ink rounded-xl text-sm font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="Auto-fill slides with top 6 live products from database"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync 6 live products</span>
          </button>

          <button
            type="button"
            onClick={addSlide}
            className="h-11 px-5 sag-btn-primary text-sm inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4 text-current" />
            <span>Add slide</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage('home')}
            className="h-11 px-4 bg-sunken hover:bg-sunken-deep text-ink rounded-xl text-sm font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <Eye className="w-4 h-4 text-current" />
            <span>View home</span>
          </button>
        </>}
      />

      <form onSubmit={handleHeroSubmit} className="space-y-6">
        
        {/* Slides List */}
        <div className="space-y-6">
          {(!heroForm.slides || heroForm.slides.length === 0) ? (
            <div className="text-center px-6 py-14 bg-white rounded-2xl border-2 border-dashed border-line">
              <span className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-sunken text-ink flex items-center justify-center"><ImageIcon className="w-6 h-6 text-current" /></span>
              <p className="text-base text-ink">No custom slides added yet</p>
              <p className="text-sm text-ink-muted mt-1">Click the button below to auto-populate from your active live products.</p>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
                <button
                  type="button"
                  onClick={handleQuickSyncProducts}
                  className="h-11 px-5 bg-white border-[1.5px] border-control text-ink hover:bg-sunken rounded-xl text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 text-current" />
                  <span>Sync 6 Products</span>
                </button>
                <button
                  type="button"
                  onClick={addSlide}
                  className="h-11 px-5 sag-btn-primary text-sm inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-current" />
                  <span>Add Manual Slide</span>
                </button>
              </div>
            </div>
          ) : (
            heroForm.slides.map((slide, index) => {
              const slideImg = getCleanImageUrl(slide.bannerImage || slide.image);

              return (
                <div 
                  key={slide.id || index}
                  className="bg-white p-4 sm:p-6 rounded-2xl border border-line space-y-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-64">
                      <span className="w-8 h-8 shrink-0 rounded-full bg-ink text-white flex items-center justify-center text-base font-semibold">
                        {index + 1}
                      </span>
                      <h3 className="text-lg font-semibold text-ink min-w-0 truncate">
                        {slide.title || 'Untitled slide'}
                      </h3>
                      {slide.productId && (
                        <span className="shrink-0 px-2.5 py-0.5 rounded-md bg-ok-tint text-ok text-[11px] font-semibold border border-ok-line">
                          Linked Product
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Move Up/Down */}
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveSlide(index, 'up')}
                        className="w-11 h-11 inline-flex items-center justify-center text-ink hover:bg-sunken disabled:opacity-30 rounded-full transition-colors cursor-pointer"
                        title="Move Up"
                        aria-label="Move slide up"
                      >
                        <ArrowUp className="w-4 h-4 text-current" />
                      </button>
                      <button
                        type="button"
                        disabled={index === (heroForm.slides?.length || 0) - 1}
                        onClick={() => moveSlide(index, 'down')}
                        className="w-11 h-11 inline-flex items-center justify-center text-ink hover:bg-sunken disabled:opacity-30 rounded-full transition-colors cursor-pointer"
                        title="Move Down"
                        aria-label="Move slide down"
                      >
                        <ArrowDown className="w-4 h-4 text-current" />
                      </button>

                      {/* 1-Click Select From Product Catalog */}
                      <button
                        type="button"
                        onClick={() => {
                          setProductPickerSlideId(slide.id);
                          setProductSearch('');
                        }}
                        className="h-11 px-3.5 bg-white hover:bg-sunken text-ink border-[1.5px] border-control rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5 text-current" />
                        <span>Link product</span>
                      </button>

                      {/* Delete Slide */}
                      <button
                        type="button"
                        onClick={() => removeSlide(slide.id)}
                        className="w-11 h-11 inline-flex items-center justify-center text-danger hover:bg-danger-tint rounded-full transition-colors cursor-pointer"
                        title="Remove Slide"
                        aria-label="Remove slide"
                      >
                        <Trash2 className="w-4 h-4 text-current" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    
                    {/* Left: 1:1 Square Image Preview & Upload */}
                    <div className="lg:col-span-4 space-y-3">
                      <div className="w-full aspect-square max-w-[260px] mx-auto bg-sunken rounded-2xl overflow-hidden border border-line relative group">
                        {slideImg ? (
                          <img
                            src={slideImg}
                            alt="Slide Preview"
                            className="w-full h-full object-cover object-top"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-ink-faint p-4 text-center">
                            <ImageIcon className="w-8 h-8 mb-1 text-current" />
                            <span className="text-[13px]">No image provided</span>
                          </div>
                        )}

                        {uploadingSlideId === slide.id && (
                          <div className="absolute inset-0 bg-ink/50 flex items-center justify-center text-white text-xs font-bold gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-current" />
                            <span>Uploading...</span>
                          </div>
                        )}
                      </div>

                      {/* Image actions */}
                      <div className="space-y-2">
                        <label className="w-full h-11 bg-sunken hover:bg-sunken-deep text-ink border border-dashed border-control rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer">
                          <Upload className="w-4 h-4 text-current" />
                          <span>Upload banner photo</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleImageUpload(slide.id, e)}
                            className="hidden"
                          />
                        </label>

                        <input
                          type="text"
                          placeholder="Or paste banner image URL..."
                          value={slide.bannerImage || ''}
                          onChange={(e) => updateSlide(slide.id, { bannerImage: e.target.value.trim() || undefined })}
                          className="sag-input h-12"
                        />

                        {slide.bannerImage ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ok-tint border border-ok-line px-3 py-2">
                            <span className="text-[11px] font-bold text-ok">Custom banner photo (not used on the product page)</span>
                            {slide.productId && (
                              <button
                                type="button"
                                onClick={() => updateSlide(slide.id, { bannerImage: undefined })}
                                className="shrink-0 h-11 px-3 rounded-xl bg-white border border-ok-line text-sm font-semibold text-ink hover:bg-sunken cursor-pointer"
                              >
                                Use product photo
                              </button>
                            )}
                          </div>
                        ) : (
                          <p className="text-[13px] text-ink-muted leading-snug">
                            {slide.productId
                              ? "Showing the product's own photo. Upload a banner photo to use a different image here only."
                              : 'Upload a banner photo for this slide.'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Slide Text & Link Controls */}
                    <div className="lg:col-span-8 space-y-4">
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="sag-label">
                            Slide title
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Festive Cambric Silk Suit Set"
                            value={slide.title || ''}
                            onChange={(e) => updateSlide(slide.id, { title: e.target.value, customText: true })}
                            className="sag-input h-12 font-bold"
                          />
                        </div>

                        <div>
                          <label className="sag-label">
                            Badge
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. New arrival"
                            value={slide.badge || ''}
                            onChange={(e) => updateSlide(slide.id, { badge: e.target.value })}
                            className="sag-input h-12"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="sag-label">
                          Subtitle / fabric story
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Pure breathable cotton cambric with gota patti borders"
                          value={slide.subtitle || ''}
                          onChange={(e) => updateSlide(slide.id, { subtitle: e.target.value, customText: true })}
                          className="sag-input h-12"
                        />
                      </div>

                      {/* Pricing Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-page rounded-2xl border border-line">
                        <div>
                          <label className="sag-label">
                            Offer price (₹)
                          </label>
                          <input
                            type="number"
                            placeholder="1299"
                            value={slide.price || ''}
                            onChange={(e) => updateSlide(slide.id, { price: Number(e.target.value) || 0 })}
                            className="sag-input h-12 font-bold"
                          />
                        </div>

                        <div>
                          <label className="sag-label">
                            Original MRP (₹, shown struck through)
                          </label>
                          <input
                            type="number"
                            placeholder="2499"
                            value={slide.originalPrice || ''}
                            onChange={(e) => updateSlide(slide.id, { originalPrice: Number(e.target.value) || 0 })}
                            className="sag-input h-12 text-ink-muted"
                          />
                        </div>
                      </div>

                      {/* Link & Action Button */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="sag-label">
                            Link (product ID or category)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Suits or product UUID"
                            value={slide.link || ''}
                            onChange={(e) => updateSlide(slide.id, { link: e.target.value })}
                            className="sag-input h-12"
                          />
                        </div>

                        <div>
                          <label className="sag-label">
                            Button text
                          </label>
                          <input
                            type="text"
                            placeholder="BUY NOW"
                            value={slide.linkText || 'BUY NOW'}
                            onChange={(e) => updateSlide(slide.id, { linkText: e.target.value })}
                            className="sag-input h-12 font-bold"
                          />
                        </div>
                      </div>

                    </div>

                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Save Bar */}
        <div className="sticky bottom-3 z-20 flex items-center justify-between gap-3 bg-white pl-5 pr-2 py-2 rounded-xl border border-line shadow-[var(--sag-shadow-bar)]">
          <div className="text-sm text-ink-muted">
            <span className="text-lg font-semibold text-ink">{heroForm.slides?.length || 0}</span> slides
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="h-11 px-5 sm:px-6 sag-btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-current" />
                <span>Saving to database...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 text-current" />
                <span>Save & publish slides</span>
              </>
            )}
          </button>
        </div>

      </form>

      {/* Product Picker Modal */}
      {productPickerSlideId && (
        <div className="fixed inset-0 bg-ink/50 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div role="dialog" aria-modal="true" aria-label="Select product for slide" className="bg-white w-full max-w-xl rounded-t-[20px] sm:rounded-2xl overflow-hidden shadow-[var(--sag-shadow-pop)] border border-line flex flex-col max-h-[90dvh] sm:max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-line flex items-start justify-between gap-3 bg-white">
              <div>
                <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-ink" />
                  Select Product for Slide
                </h3>
                <p className="text-[13px] text-ink-muted">
                  Select any product to automatically populate photo, title, price, and instant checkout link.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProductPickerSlideId(null)}
                aria-label="Close" className="w-11 h-11 shrink-0 flex items-center justify-center text-ink rounded-full hover:bg-sunken cursor-pointer"
              >
                <X className="w-5 h-5 text-current" />
              </button>
            </div>

            {/* Search Box */}
            <div className="p-3 border-b border-line">
              <div className="relative">
                <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search products by title or category..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="sag-input h-12 pl-10 pr-4 bg-page focus:bg-white"
                  autoFocus
                />
              </div>
            </div>

            {/* Product List */}
            <div className="p-3 overflow-y-auto space-y-1 flex-1">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-8 text-ink-muted text-sm">
                  No products matching "{productSearch}"
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const pImg = getCleanImageUrl(p.images?.[0] || p.image);
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelectProductForSlide(productPickerSlideId, p)}
                      className="flex items-center justify-between gap-3 p-2.5 hover:bg-sunken rounded-2xl cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={pImg}
                          alt={p.name}
                          className="w-12 aspect-[4/5] rounded-xl object-cover object-top border border-line shrink-0"
                        />
                        <div>
                          <h4 className="text-sm font-semibold text-ink group-hover:text-ink line-clamp-1">
                            {p.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[13px] text-ink-muted font-medium">{p.category}</span>
                            <span className="text-[11px] font-bold text-ink">₹{p.price}</span>
                            {p.originalPrice && p.originalPrice > p.price && (
                              <span className="text-[13px] text-ink-faint line-through">₹{p.originalPrice}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="shrink-0 h-11 px-3.5 sag-btn-primary flex items-center gap-1 text-sm"
                      >
                        <Check className="w-3.5 h-3.5 text-current" />
                        <span>Select</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
