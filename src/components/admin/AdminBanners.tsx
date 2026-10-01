import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { uploadImage } from '../../lib/dataStore';
import { 
  Image as ImageIcon, 
  Plus, 
  Edit3, 
  Trash2, 
  Eye, 
  EyeOff, 
  X, 
  Save, 
  ExternalLink,
  Sparkles,
  Upload,
  Loader2
} from 'lucide-react';
import { Banner } from '../../types';
import { AdminPageHeader } from './kidsToysShared';

export const AdminBanners: React.FC = () => {
  const { banners = [], addBanner, updateBanner, deleteBanner, toggleBannerStatus } = useAdmin();
  const { showToast } = useShop();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState<Omit<Banner, 'id'>>({
    title: '',
    subtitle: '',
    badge: 'Special Promo',
    image: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?auto=format&fit=crop&w=1200&q=80',
    buttonText: 'SHOP NOW',
    buttonLink: 'Sale',
    isActive: true,
    position: 'midpage',
  });

  const handleOpenAdd = () => {
    setEditingBannerId(null);
    setFormData({
      title: 'SUMMER SOIREE SALE',
      subtitle: 'Flat 30% OFF on Pure Cotton & Handblock Suit Sets',
      badge: 'Limited Time Deal',
      image: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?auto=format&fit=crop&w=1200&q=80',
      buttonText: 'EXPLORE SALE',
      buttonLink: 'Sale',
      isActive: true,
      position: 'midpage',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (banner: Banner) => {
    setEditingBannerId(banner.id);
    setFormData({
      title: banner.title,
      subtitle: banner.subtitle,
      badge: banner.badge,
      image: banner.image,
      buttonText: banner.buttonText,
      buttonLink: banner.buttonLink,
      isActive: banner.isActive,
      position: banner.position,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      showToast('Banner title is required.', 'error');
      return;
    }

    if (editingBannerId) {
      updateBanner(editingBannerId, formData);
      showToast(`Banner "${formData.title}" updated.`, 'success');
    } else {
      addBanner(formData);
      showToast(`Banner "${formData.title}" created.`, 'success');
    }

    setIsModalOpen(false);
  };

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Only image files can be uploaded.', 'error');
      return;
    }

    setIsUploading(true);
    let imageUrl = '';

    try {
      imageUrl = await uploadImage(file, 'banners');
    } catch (err: any) {
      console.error('Cloudinary banner upload failed:', err);
      showToast(`Failed to upload banner image: ${err?.message || 'Please try again.'}`, 'error');
      setIsUploading(false);
      return;
    }

    if (imageUrl) {
      setFormData(prev => ({ ...prev, image: imageUrl }));
      showToast('Banner image uploaded successfully!', 'success');
    }
    setIsUploading(false);
  };

  const handleDelete = (banner: Banner) => {
    deleteBanner(banner.id);
    showToast(`Banner "${banner.title}" deleted.`, 'info');
  };

  return (
    <div id="admin-banners-page" className="space-y-6">
      
      {/* Header */}
      <AdminPageHeader
        eyebrow="Visual merchandising"
        title={<>Promotional banners <span className="text-[#2A1A26]/45 font-normal">({banners.length})</span></>}
        icon={<ImageIcon className="text-current" />}
        description="Wide promo banners with a headline, a button and where it leads. Switch one off to hide it without deleting it."
        actions={
          <button
            onClick={handleOpenAdd}
            className="h-11 px-5 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full text-sm font-semibold transition-colors shadow-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-current" />
            <span>Add banner</span>
          </button>
        }
      />
      {banners.length === 0 && (
        <div className="px-6 py-14 text-center bg-white rounded-3xl border border-dashed border-[#4B1D3F]/20">
          <span className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center"><ImageIcon className="w-6 h-6 text-current" /></span>
          <p className="font-serif text-xl text-[#2A1A26]">No banners yet</p>
          <p className="mt-1 text-sm text-[#2A1A26]/60">Use Add banner to create the first one.</p>
        </div>
      )}

      {/* Banners List */}
      <div className="space-y-4">
        {banners.map((banner) => (
          <div
            key={banner.id}
            className={`bg-white rounded-3xl border p-4 sm:p-5 shadow-[var(--sag-shadow)] overflow-hidden transition-colors flex flex-col md:flex-row gap-4 md:gap-5 md:items-center justify-between ${
              banner.isActive ? 'border-[#4B1D3F]/10' : 'border-dashed border-[#4B1D3F]/20 bg-[#FBF7F3]'
            }`}
          >
            {/* Banner Preview Thumbnail */}
            <div className="w-full md:w-64 aspect-[2/1] md:aspect-auto md:h-32 rounded-2xl overflow-hidden shrink-0 bg-[#F3EEF8] flex items-center justify-center">
              {banner.image && banner.image.trim() !== "" ? (
                <img
                  src={banner.image}
                  alt={banner.title}
                  className={`w-full h-full object-cover ${banner.isActive ? '' : 'opacity-60'}`}
                />
              ) : (
                <ImageIcon className="w-7 h-7 text-[#4B1D3F]/35" aria-hidden="true" />
              )}
            </div>

            {/* Banner Info */}
            <div className="flex-1 space-y-1.5 min-w-0">
              {banner.badge && (
                <span className="inline-flex px-2.5 py-0.5 bg-[#F3EEF8] text-[#9C7A45] text-[11px] font-semibold uppercase tracking-wider rounded-full">
                  {banner.badge}
                </span>
              )}
              <h4 className="font-serif text-xl font-semibold text-[#2A1A26] truncate">
                {banner.title}
              </h4>
              <p className="text-xs text-[#2A1A26]/70 line-clamp-2">
                {banner.subtitle}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#2A1A26]/65 pt-1">
                <span className="px-2 py-0.5 rounded-full bg-[#FBF7F3] border border-[#4B1D3F]/10">Button: <strong className="text-[#2A1A26]">{banner.buttonText}</strong></span>
                <span className="px-2 py-0.5 rounded-full bg-[#FBF7F3] border border-[#4B1D3F]/10 max-w-full truncate">Link: <strong className="text-[#2A1A26]">{banner.buttonLink}</strong></span>
                <span className="px-2 py-0.5 rounded-full bg-[#FBF7F3] border border-[#4B1D3F]/10">Position: <strong className="capitalize text-[#2A1A26]">{banner.position}</strong></span>
              </div>
            </div>

            {/* Status & Actions */}
            <div className="flex items-center gap-1.5 shrink-0 pt-3 md:pt-0 border-t md:border-0 border-[#4B1D3F]/10">
              <button
                onClick={() => {
                  toggleBannerStatus(banner.id);
                  showToast(`Banner "${banner.title}" is now ${!banner.isActive ? 'Active' : 'Disabled'}.`, 'info');
                }}
                className={`h-9 px-3.5 rounded-full border text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer mr-auto md:mr-0 ${
                  banner.isActive
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-[#F3EEF8] text-[#4B1D3F] border-[#4B1D3F]/15'
                }`}
              >
                {banner.isActive ? <Eye className="w-3.5 h-3.5 text-current" /> : <EyeOff className="w-3.5 h-3.5 text-current" />}
                <span>{banner.isActive ? 'Active' : 'Disabled'}</span>
              </button>

              <button
                onClick={() => handleOpenEdit(banner)}
                className="w-9 h-9 inline-flex items-center justify-center hover:bg-[#F3EEF8] rounded-full text-[#4B1D3F] transition-colors cursor-pointer"
                title="Edit Banner"
              >
                <Edit3 className="w-4 h-4 text-current" />
              </button>

              <button
                onClick={() => handleDelete(banner)}
                className="w-9 h-9 inline-flex items-center justify-center hover:bg-rose-50 rounded-full text-rose-700 transition-colors cursor-pointer"
                title="Delete Banner"
              >
                <Trash2 className="w-4 h-4 text-current" />
              </button>
            </div>

          </div>
        ))}
      </div>

      {/* Add / Edit Banner Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#2A1A26]/50 flex items-end sm:items-center justify-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label={editingBannerId ? 'Edit promotional banner' : 'Add new banner'} className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[94dvh] overflow-y-auto p-5 sm:p-7 shadow-2xl border border-[#4B1D3F]/10 space-y-4">
            
            <div className="flex items-center justify-between border-b border-[#4B1D3F]/10 pb-3">
              <h3 className="font-serif text-2xl font-semibold text-[#2A1A26]">
                {editingBannerId ? 'Edit banner' : 'Add a banner'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} aria-label="Close" className="w-10 h-10 rounded-full flex items-center justify-center text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer">
                <X className="w-5 h-5 text-current" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Banner Headline *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. THE AURA SALE"
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Subtitle / Subheading</label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  placeholder="e.g. Up to 40% OFF on Festive Silhouettes"
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Eyebrow Badge Text</label>
                <input
                  type="text"
                  value={formData.badge || ''}
                  onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                  placeholder="e.g. Limited Time Offer"
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Banner Image *</label>
                
                {/* Visual Thumbnail & Upload Trigger */}
                <div className="border-2 border-dashed border-[#4B1D3F]/20 rounded-3xl p-4 bg-[#FBF7F3] space-y-3">
                  {formData.image && formData.image.trim() !== "" ? (
                    <div className="relative w-full aspect-[2/1] rounded-2xl overflow-hidden bg-[#F3EEF8] border border-[#4B1D3F]/10">
                      <img
                        src={formData.image}
                        alt="Banner Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, image: '' })}
                        className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-white/95 hover:bg-white text-rose-700 border border-[#4B1D3F]/10 rounded-full shadow-sm transition cursor-pointer"
                        title="Remove Image"
                      >
                        <X className="w-3.5 h-3.5 text-current" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-[#2A1A26]/60">
                      <span className="w-12 h-12 mb-2 rounded-2xl bg-white border border-[#4B1D3F]/10 text-[#4B1D3F] flex items-center justify-center"><ImageIcon className="w-5 h-5 text-current" /></span>
                      <p className="text-xs">No image selected</p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <label className={`w-full sm:w-auto h-11 px-5 border rounded-full text-sm font-semibold text-center cursor-pointer transition-colors flex items-center justify-center gap-2 ${
                      isUploading 
                        ? 'bg-[#FBF7F3] border-[#4B1D3F]/10 text-[#2A1A26]/50' 
                        : 'bg-[#4B1D3F] border-transparent text-white hover:bg-[#3B1532]'
                    }`}>
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-current" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-current" />
                          <span>Upload from gallery</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isUploading}
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                    </label>

                    <span className="text-xs text-[#2A1A26]/60">Or paste a direct link below</span>
                  </div>
                </div>

                <input
                  type="text"
                  required
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="Paste direct image URL"
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 mt-2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Button Text</label>
                  <input
                    type="text"
                    value={formData.buttonText}
                    onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                    placeholder="e.g. SHOP SALE"
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Target Category / Link</label>
                  <input
                    type="text"
                    value={formData.buttonLink}
                    onChange={(e) => setFormData({ ...formData, buttonLink: e.target.value })}
                    placeholder="e.g. Sale or Festive Wear"
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] cursor-pointer text-sm font-semibold text-[#2A1A26]">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="relative shrink-0 w-11 h-6 rounded-full bg-[#E6DDF0] peer-checked:bg-[#4B1D3F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#4B1D3F]/30 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
                  <span className="order-first">Enable banner on live store</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[#4B1D3F]/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-11 px-5 border border-[#4B1D3F]/20 rounded-full text-[#4B1D3F] font-semibold hover:bg-[#F3EEF8] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-11 px-6 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4 text-current" /> Save banner
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
