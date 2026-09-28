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
      title: 'New Luxury Ethnic Ensemble',
      subtitle: 'Handcrafted zari embellishments with pure organza dupatta',
      badge: '👑 ROYAL EDIT',
      image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=85',
      price: 1299,
      originalPrice: 2499,
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
      originalPrice: product.originalPrice || Math.round(product.price * 1.8),
      linkText: 'BUY NOW',
      link: product.id,
      productId: product.id
    });
    setProductPickerSlideId(null);
    showToast(`Product "${product.name}" linked to slide!`, 'success');
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.category.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div id="admin-hero-page" className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-\[#FAF7F2\] p-5 rounded-2xl border border-rose-100 shadow-xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#8B2635]">
            Storefront Banners
          </span>
          <h2 className="font-serif text-2xl font-bold text-gray-900 flex items-center gap-2 mt-0.5">
            <Sparkles className="w-6 h-6 text-black" />
            Hero Slides Manager (1:1 Square + Real Products Sync)
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            यहाँ से आप होमपेज के मुख्य 1:1 Square स्लाइडर को एडिट कर सकते हैं। आप किसी भी स्लाइड को बदल सकते हैं, नए जोड़ सकते हैं या डिलीट कर सकते हैं।
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Quick Sync Button */}
          <button
            type="button"
            onClick={handleQuickSyncProducts}
            disabled={isSyncing}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            title="Auto-fill slides with top 6 live products from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>⚡ Sync 6 Live Products</span>
          </button>

          <button
            type="button"
            onClick={addSlide}
            className="px-3.5 py-2 bg-gradient-to-r from-[#241D1B] to-[#241D1B] hover:brightness-110 text-[#211C1A] rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Slide</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage('home')}
            className="px-3.5 py-2 bg-[#D8C8B8]/20 hover:bg-[#D8C8B8]/40 text-[#211C1A] border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View Home</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleHeroSubmit} className="space-y-6">
        
        {/* Slides List */}
        <div className="space-y-6">
          {(!heroForm.slides || heroForm.slides.length === 0) ? (
            <div className="text-center py-12 bg-\[#FAF7F2\] rounded-2xl border-2 border-dashed border-gray-200">
              <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-600 font-bold">No custom slides added yet.</p>
              <p className="text-xs text-gray-400 mt-1">Click the button below to auto-populate from your active live products.</p>
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={handleQuickSyncProducts}
                  className="px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Sync 6 Products</span>
                </button>
                <button
                  type="button"
                  onClick={addSlide}
                  className="px-4 py-2 bg-[#241D1B] text-[#211C1A] rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
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
                  className="bg-\[#FAF7F2\] p-5 sm:p-6 rounded-2xl border border-rose-100 shadow-sm space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#241D1B] text-[#211C1A] flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </span>
                      <h3 className="font-serif text-base font-bold text-gray-900">
                        Slide #{index + 1}: {slide.title || 'Untitled Slide'}
                      </h3>
                      {slide.productId && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                          Linked Product
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Move Up/Down */}
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveSlide(index, 'up')}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 rounded-lg transition"
                        title="Move Up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={index === (heroForm.slides?.length || 0) - 1}
                        onClick={() => moveSlide(index, 'down')}
                        className="p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 rounded-lg transition"
                        title="Move Down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>

                      {/* 1-Click Select From Product Catalog */}
                      <button
                        type="button"
                        onClick={() => {
                          setProductPickerSlideId(slide.id);
                          setProductSearch('');
                        }}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-black border border-amber-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <ShoppingBag className="w-3.5 h-3.5 text-black" />
                        <span>Link Product</span>
                      </button>

                      {/* Delete Slide */}
                      <button
                        type="button"
                        onClick={() => removeSlide(slide.id)}
                        className="p-1.5 text-\[#800020\] hover:bg-[#D8C8B8]/20 rounded-lg transition"
                        title="Remove Slide"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    
                    {/* Left: 1:1 Square Image Preview & Upload */}
                    <div className="lg:col-span-4 space-y-3">
                      <div className="w-full aspect-square max-w-[240px] mx-auto bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 relative group shadow-xs">
                        {slideImg ? (
                          <img
                            src={slideImg}
                            alt="Slide Preview"
                            className="w-full h-full object-cover object-top"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                            <ImageIcon className="w-8 h-8 mb-1" />
                            <span className="text-xs">No image provided</span>
                          </div>
                        )}

                        {uploadingSlideId === slide.id && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs font-bold gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Uploading...</span>
                          </div>
                        )}
                      </div>

                      {/* Image actions */}
                      <div className="space-y-2">
                        <label className="w-full py-2 bg-[#D8C8B8]/20 hover:bg-[#D8C8B8]/40 text-[#211C1A] border border-rose-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Banner Photo</span>
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
                          className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:border-rose-300 outline-none"
                        />

                        {slide.bannerImage ? (
                          <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                            <span className="text-[11px] font-bold text-emerald-800">Custom banner photo (not used on the product page)</span>
                            {slide.productId && (
                              <button
                                type="button"
                                onClick={() => updateSlide(slide.id, { bannerImage: undefined })}
                                className="shrink-0 text-[11px] font-bold text-[#800020] underline cursor-pointer"
                              >
                                Use product photo
                              </button>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-500 leading-snug">
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
                          <label className="text-[11px] font-bold text-gray-700 block mb-1">
                            Slide Title (मुख्य नाम):
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Festive Cambric Silk Suit Set"
                            value={slide.title || ''}
                            onChange={(e) => updateSlide(slide.id, { title: e.target.value })}
                            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:border-rose-300 outline-none font-bold"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-gray-700 block mb-1">
                            Golden Badge (बैज टैग):
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 👑 ROYAL FESTIVE EDIT"
                            value={slide.badge || ''}
                            onChange={(e) => updateSlide(slide.id, { badge: e.target.value })}
                            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:border-rose-300 outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-gray-700 block mb-1">
                          Subtitle / Fabric Story:
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Pure breathable cotton cambric with gota patti borders"
                          value={slide.subtitle || ''}
                          onChange={(e) => updateSlide(slide.id, { subtitle: e.target.value })}
                          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:border-rose-300 outline-none"
                        />
                      </div>

                      {/* Pricing Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                        <div>
                          <label className="text-[11px] font-bold text-gray-700 block mb-1">
                            Offer Price (₹):
                          </label>
                          <input
                            type="number"
                            placeholder="1299"
                            value={slide.price || ''}
                            onChange={(e) => updateSlide(slide.id, { price: Number(e.target.value) || 0 })}
                            className="w-full px-3 py-2 text-xs bg-\[#FAF7F2\] border border-gray-200 rounded-xl focus:border-rose-300 outline-none font-black text-black"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-gray-700 block mb-1">
                            Original MRP (₹ strikethrough):
                          </label>
                          <input
                            type="number"
                            placeholder="2499"
                            value={slide.originalPrice || ''}
                            onChange={(e) => updateSlide(slide.id, { originalPrice: Number(e.target.value) || 0 })}
                            className="w-full px-3 py-2 text-xs bg-\[#FAF7F2\] border border-gray-200 rounded-xl focus:border-rose-300 outline-none text-gray-600"
                          />
                        </div>
                      </div>

                      {/* Link & Action Button */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-gray-700 block mb-1">
                            Link Type (Product ID or Category):
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Suits or product UUID"
                            value={slide.link || ''}
                            onChange={(e) => updateSlide(slide.id, { link: e.target.value })}
                            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:border-rose-300 outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-gray-700 block mb-1">
                            Button Text:
                          </label>
                          <input
                            type="text"
                            placeholder="BUY NOW"
                            value={slide.linkText || 'BUY NOW'}
                            onChange={(e) => updateSlide(slide.id, { linkText: e.target.value })}
                            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:border-rose-300 outline-none font-bold"
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
        <div className="sticky bottom-4 z-20 flex items-center justify-between bg-\[#FAF7F2\] p-4 rounded-2xl border border-rose-200 shadow-xl">
          <div className="text-xs text-gray-500">
            Total Slides: <span className="font-bold text-gray-900">{heroForm.slides?.length || 0}</span>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-3 bg-gradient-to-r from-[#241D1B] via-[#241D1B] to-[#241D1B] hover:brightness-110 active:scale-95 text-[#211C1A] font-bold text-sm rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving to database...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 text-black" />
                <span>Save & Publish All Slides</span>
              </>
            )}
          </button>
        </div>

      </form>

      {/* Product Picker Modal */}
      {productPickerSlideId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-\[#FAF7F2\] w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl border border-rose-100 flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-[#D8C8B8]/50">
              <div>
                <h3 className="font-serif text-lg font-bold text-gray-900 flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-[#211C1A]" />
                  Select Product for Slide
                </h3>
                <p className="text-xs text-gray-500">
                  Select any product to automatically populate photo, title, price, and instant checkout link.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProductPickerSlideId(null)}
                className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Box */}
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search products by title or category..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-xl focus:border-rose-300 outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* Product List */}
            <div className="p-4 overflow-y-auto space-y-2.5 flex-1 divide-y divide-gray-50">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">
                  No products matching "{productSearch}"
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const pImg = getCleanImageUrl(p.images?.[0] || p.image);
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelectProductForSlide(productPickerSlideId, p)}
                      className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 p-2.5 hover:bg-[#D8C8B8]/60 rounded-xl cursor-pointer transition group"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={pImg}
                          alt={p.name}
                          className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                        />
                        <div>
                          <h4 className="text-xs font-bold text-gray-900 group-hover:text-[#211C1A] line-clamp-1">
                            {p.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-500 font-medium">{p.category}</span>
                            <span className="text-[10px] font-black text-emerald-600">₹{p.price}</span>
                            {p.originalPrice && p.originalPrice > p.price && (
                              <span className="text-[10px] text-gray-400 line-through">₹{p.originalPrice}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="px-3 py-1.5 bg-[#241D1B] text-[#211C1A] rounded-lg text-xs font-bold group-hover:brightness-110 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
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
