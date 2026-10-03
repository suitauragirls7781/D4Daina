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
import { AdminPageHeader, tone, ui } from './kidsToysShared';

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
    <div id="admin-banners-page" className="space-y-4">
      
      {/* Header */}
      <AdminPageHeader
        eyebrow="Visual merchandising"
        title={<>Promotional banners <span className="text-ink-faint font-normal">({banners.length})</span></>}
        icon={<ImageIcon className="text-current" />}
        description="Wide promo banners with a headline, a button and where it leads. Switch one off to hide it without deleting it."
        actions={
          <button
            onClick={handleOpenAdd}
            className={ui.primary}
          >
            <Plus className="w-4 h-4 text-current" />
            <span>Add banner</span>
          </button>
        }
      />
      {banners.length === 0 && (
        <div className={ui.empty}>
          <span className="mx-auto mb-3 w-11 h-11 rounded-xl bg-sunken text-ink flex items-center justify-center"><ImageIcon className="w-5 h-5 text-current" /></span>
          <p className="font-display text-xl leading-7 text-ink">No banners yet</p>
          <p className="mt-1 text-sm text-ink-muted">Use Add banner to create the first one.</p>
        </div>
      )}

      {/* Banners List */}
      <div className="space-y-3">
        {banners.map((banner) => (
          <div
            key={banner.id}
            className={`rounded-2xl border border-line p-4 sm:p-5 overflow-hidden flex flex-col md:flex-row gap-4 md:gap-5 md:items-center justify-between ${
              banner.isActive ? 'bg-white' : 'bg-page'
            }`}
          >
            {/* Banner Preview Thumbnail */}
            <div className="w-full md:w-64 aspect-[2/1] md:aspect-auto md:h-32 rounded-xl overflow-hidden shrink-0 bg-sunken flex items-center justify-center">
              {banner.image && banner.image.trim() !== "" ? (
                <img
                  src={banner.image}
                  alt={banner.title}
                  className={`w-full h-full object-cover ${banner.isActive ? '' : 'opacity-60'}`}
                />
              ) : (
                <ImageIcon className="w-7 h-7 text-ink-faint" aria-hidden="true" />
              )}
            </div>

            {/* Banner Info */}
            <div className="flex-1 space-y-1.5 min-w-0">
              {banner.badge && (
                <span className={`${ui.badge} ${tone.muted}`}>
                  {banner.badge}
                </span>
              )}
              <h4 className="text-base leading-[22px] font-semibold text-ink truncate">
                {banner.title}
              </h4>
              <p className="text-[13px] leading-[18px] text-ink-muted line-clamp-2">
                {banner.subtitle}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-xs leading-4 text-ink-muted pt-1">
                <span className="px-2 py-1 rounded-md bg-page border border-line">Button: <strong className="font-semibold text-ink">{banner.buttonText}</strong></span>
                <span className="px-2 py-1 rounded-md bg-page border border-line max-w-full truncate">Link: <strong className="font-semibold text-ink">{banner.buttonLink}</strong></span>
                <span className="px-2 py-1 rounded-md bg-page border border-line">Position: <strong className="font-semibold capitalize text-ink">{banner.position}</strong></span>
              </div>
            </div>

            {/* Status & Actions */}
            <div className="flex items-center gap-1 shrink-0 pt-3 md:pt-0 border-t md:border-0 border-line">
              <button
                onClick={() => {
                  toggleBannerStatus(banner.id);
                  showToast(`Banner "${banner.title}" is now ${!banner.isActive ? 'Active' : 'Disabled'}.`, 'info');
                }}
                aria-pressed={banner.isActive}
                className={`h-11 md:h-9 px-3 rounded-[10px] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer mr-auto md:mr-0 ${
                  banner.isActive ? tone.ok : tone.muted
                }`}
              >
                {banner.isActive ? <Eye className="w-3.5 h-3.5 text-current" /> : <EyeOff className="w-3.5 h-3.5 text-current" />}
                <span>{banner.isActive ? 'Active' : 'Disabled'}</span>
              </button>

              <button
                onClick={() => handleOpenEdit(banner)}
                className={`${ui.iconBtn} hover:bg-sunken text-ink`}
                title="Edit Banner"
                aria-label={`Edit banner ${banner.title}`}
              >
                <Edit3 className="w-4 h-4 text-current" />
              </button>

              <button
                onClick={() => handleDelete(banner)}
                className={`${ui.iconBtn} hover:bg-danger-tint text-danger`}
                title="Delete Banner"
                aria-label={`Delete banner ${banner.title}`}
              >
                <Trash2 className="w-4 h-4 text-current" />
              </button>
            </div>

          </div>
        ))}
      </div>

      {/* Add / Edit Banner Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[80] bg-ink/50 flex items-end sm:items-center justify-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label={editingBannerId ? 'Edit promotional banner' : 'Add new banner'} className="bg-white rounded-t-[20px] sm:rounded-2xl max-w-lg w-full max-h-[92dvh] overflow-y-auto overscroll-contain px-4 sm:px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 space-y-4">
            
            <div className="flex items-center justify-between gap-3 border-b border-line py-1 -mr-2">
              <h3 className="font-display text-xl leading-7 text-ink">
                {editingBannerId ? 'Edit banner' : 'Add a banner'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} aria-label="Close" className={`${ui.iconBtn} hover:bg-sunken text-ink`}>
                <X className="w-5 h-5 text-current" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              
              <div>
                <label className={ui.label}>Banner Headline *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. THE AURA SALE"
                  className={ui.field}
                />
              </div>

              <div>
                <label className={ui.label}>Subtitle / Subheading</label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  placeholder="e.g. Up to 40% OFF on Festive Silhouettes"
                  className={ui.field}
                />
              </div>

              <div>
                <label className={ui.label}>Eyebrow Badge Text</label>
                <input
                  type="text"
                  value={formData.badge || ''}
                  onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                  placeholder="e.g. Limited Time Offer"
                  className={ui.field}
                />
              </div>

              <div>
                <label className={ui.label}>Banner Image *</label>
                
                {/* Visual Thumbnail & Upload Trigger */}
                <div className="border-[1.5px] border-dashed border-control rounded-xl p-3 bg-page space-y-3">
                  {formData.image && formData.image.trim() !== "" ? (
                    <div className="relative w-full aspect-[2/1] rounded-[10px] overflow-hidden bg-sunken border border-line">
                      <img
                        src={formData.image}
                        alt="Banner Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, image: '' })}
                        className="absolute top-1.5 right-1.5 w-11 h-11 flex items-center justify-center bg-white hover:bg-danger-tint text-danger border border-line rounded-full cursor-pointer"
                        title="Remove Image"
                        aria-label="Remove image"
                      >
                        <X className="w-4 h-4 text-current" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-ink-muted">
                      <span className="w-11 h-11 mb-2 rounded-xl bg-white border border-line text-ink flex items-center justify-center"><ImageIcon className="w-5 h-5 text-current" /></span>
                      <p className="text-[13px] leading-[18px]">No image selected</p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <label className={`w-full sm:w-auto ${ui.outline} focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink ${
                      isUploading 
                        ? 'opacity-60 cursor-wait' 
                        : ''
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
                        className="sr-only"
                      />
                    </label>

                    <span className="text-[13px] leading-[18px] text-ink-muted">Or paste a direct link below</span>
                  </div>
                </div>

                <input
                  type="text"
                  required
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="Paste direct image URL"
                  className={`${ui.field} mt-2`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={ui.label}>Button Text</label>
                  <input
                    type="text"
                    value={formData.buttonText}
                    onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                    placeholder="e.g. SHOP SALE"
                    className={ui.field}
                  />
                </div>

                <div>
                  <label className={ui.label}>Target Category / Link</label>
                  <input
                    type="text"
                    value={formData.buttonLink}
                    onChange={(e) => setFormData({ ...formData, buttonLink: e.target.value })}
                    placeholder="e.g. Sale or Festive Wear"
                    className={ui.field}
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center justify-between gap-3 min-h-[52px] px-3.5 py-2.5 rounded-xl border border-line bg-white cursor-pointer text-sm font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="relative shrink-0 w-12 h-7 rounded-full bg-control peer-checked:bg-brand peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
                  <span className="order-first">Enable banner on live store</span>
                </label>
              </div>

              <div className="flex gap-3 pt-3 border-t border-line sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={ui.outline}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`${ui.primary} flex-1 sm:flex-none`}
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
