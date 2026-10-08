import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { uploadImage } from '../../lib/dataStore';
import {
  Image as ImageIcon,
  Plus,
  Edit3,
  Trash2,
  X,
  Save,
  Upload,
  Loader2
} from 'lucide-react';
import { Banner } from '../../types';
import { AdminPageHeader } from './kidsToysShared';
import { CheckRow, Empty, Pill, Switch, Tile, Tiles, kit } from './AdminPaymentGateways';

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
      console.error('Banner upload failed:', err);
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

  const liveCount = banners.filter((banner) => banner.isActive).length;

  return (
    <div id="admin-banners-page" className="space-y-5">

      {/* Header */}
      <AdminPageHeader
        eyebrow="Visual merchandising"
        title={<>Promotional banners <span className="text-ink-faint font-normal">({banners.length})</span></>}
        icon={<ImageIcon className="text-current" />}
        description="Wide offer banners with a headline, a button and where the button leads. Switch one off to hide it without deleting it."
        actions={
          <button
            onClick={handleOpenAdd}
            className={kit.primary}
          >
            <Plus className="w-4 h-4 text-current" />
            <span>Add banner</span>
          </button>
        }
      />

      {banners.length > 0 && (
        <Tiles className="!grid-cols-3 lg:!grid-cols-3">
          <Tile label="Banners in all" value={banners.length} />
          <Tile label="Live on the site" value={liveCount} />
          <Tile label="Switched off" value={banners.length - liveCount} />
        </Tiles>
      )}

      {banners.length === 0 && (
        <Empty
          icon={<ImageIcon />}
          title="No banners yet"
          action={<button type="button" onClick={handleOpenAdd} className={kit.primary}><Plus className="w-4 h-4 text-current" /> Add banner</button>}
        >
          Use Add banner to create the first one.
        </Empty>
      )}

      {/* Banners List */}
      <div className="space-y-3">
        {banners.map((banner) => (
          <div
            key={banner.id}
            className={`${kit.panel} overflow-hidden flex flex-col md:flex-row gap-4 md:gap-5 md:items-center justify-between`}
          >
            {/* Banner Preview Thumbnail */}
            <div className="w-full md:w-64 aspect-[2/1] md:aspect-auto md:h-32 rounded-2xl overflow-hidden shrink-0 bg-sunken flex items-center justify-center">
              {banner.image && banner.image.trim() !== "" ? (
                <img
                  src={banner.image}
                  alt={banner.title}
                  className={`w-full h-full object-cover ${banner.isActive ? '' : 'opacity-50'}`}
                />
              ) : (
                <ImageIcon className="w-7 h-7 text-ink-faint" aria-hidden="true" />
              )}
            </div>

            {/* Banner Info */}
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={banner.isActive ? 'live' : 'off'}>{banner.isActive ? 'Live on the site' : 'Off'}</Pill>
                {banner.badge && <span className="text-xs leading-4 font-semibold uppercase tracking-[0.08em] text-brand">{banner.badge}</span>}
              </div>
              <h4 className="text-[17px] leading-6 font-semibold text-ink break-words">
                {banner.title}
              </h4>
              <p className={`${kit.hint} line-clamp-2`}>
                {banner.subtitle}
              </p>
              <dl className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-[13px] leading-[18px]">
                <div className="flex gap-1.5"><dt className="text-ink-muted">Button</dt><dd className="font-medium text-ink">{banner.buttonText}</dd></div>
                <div className="flex gap-1.5 min-w-0"><dt className="text-ink-muted shrink-0">Opens</dt><dd className="font-medium text-ink truncate">{banner.buttonLink}</dd></div>
                <div className="flex gap-1.5"><dt className="text-ink-muted">Position</dt><dd className="font-medium text-ink capitalize">{banner.position}</dd></div>
              </dl>
            </div>

            {/* Status & Actions */}
            <div className="flex items-center gap-1 shrink-0 pt-3 md:pt-0 border-t md:border-0 border-line">
              <span className="mr-auto md:mr-1 inline-flex items-center gap-2">
                <Switch
                  checked={banner.isActive}
                  label={`Show banner ${banner.title} on the site`}
                  onChange={() => {
                    toggleBannerStatus(banner.id);
                    showToast(`Banner "${banner.title}" is now ${!banner.isActive ? 'Active' : 'Disabled'}.`, 'info');
                  }}
                />
                <span className="md:hidden text-[13px] text-ink-muted">{banner.isActive ? 'Shown to shoppers' : 'Hidden from shoppers'}</span>
              </span>

              <button
                onClick={() => handleOpenEdit(banner)}
                className={kit.iconBtn}
                title="Edit Banner"
                aria-label={`Edit banner ${banner.title}`}
              >
                <Edit3 className="w-4 h-4 text-current" />
              </button>

              <button
                onClick={() => handleDelete(banner)}
                className={kit.iconBtnDanger}
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
        <div className={kit.scrim}>
          <div role="dialog" aria-modal="true" aria-label={editingBannerId ? 'Edit promotional banner' : 'Add new banner'} className={`${kit.sheet} max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain px-4 sm:px-6 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6 space-y-4`}>

            <div className="flex items-center justify-between gap-3 border-b border-line py-1 -mr-2">
              <h3 className="font-display text-xl leading-7 text-ink">
                {editingBannerId ? 'Edit banner' : 'Add a banner'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} aria-label="Close" className={kit.iconBtn}>
                <X className="w-5 h-5 text-current" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">

              <fieldset className={`${kit.inset} space-y-4`}>
                <legend className="float-left w-full text-sm leading-5 font-semibold text-ink">1. Words on the banner</legend>
                <div className="clear-both">
                  <label className="sag-label">Banner Headline *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. THE AURA SALE"
                    className="sag-input"
                  />
                </div>

                <div>
                  <label className="sag-label">Subtitle / Subheading</label>
                  <input
                    type="text"
                    value={formData.subtitle}
                    onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                    placeholder="e.g. Up to 40% OFF on Festive Silhouettes"
                    className="sag-input"
                  />
                </div>

                <div>
                  <label className="sag-label">Eyebrow Badge Text</label>
                  <input
                    type="text"
                    value={formData.badge || ''}
                    onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                    placeholder="e.g. Limited Time Offer"
                    className="sag-input"
                  />
                  <p className={`mt-1.5 ${kit.hint}`}>The small line above the headline.</p>
                </div>
              </fieldset>

              <fieldset className={`${kit.inset} space-y-3`}>
                <legend className="float-left w-full text-sm leading-5 font-semibold text-ink">2. Photo</legend>
                <div className="clear-both">
                  <label className="sag-label">Banner Image *</label>

                  {/* Visual Thumbnail & Upload Trigger */}
                  <div className="space-y-3">
                    {formData.image && formData.image.trim() !== "" ? (
                      <div className="relative w-full aspect-[2/1] rounded-2xl overflow-hidden bg-sunken border border-line">
                        <img
                          src={formData.image}
                          alt="Banner Preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, image: '' })}
                          className="absolute top-1.5 right-1.5 w-11 h-11 flex items-center justify-center bg-[color:var(--sag-glass-sheet)] text-danger border border-line rounded-full cursor-pointer"
                          title="Remove Image"
                          aria-label="Remove image"
                        >
                          <X className="w-4 h-4 text-current" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 text-center text-ink-muted rounded-2xl border border-dashed border-control">
                        <ImageIcon className="w-6 h-6 mb-2 text-ink-faint" />
                        <p className="text-[13px] leading-[18px]">No image selected</p>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <label className={`w-full sm:w-auto sag-btn-outline h-11 px-4 text-sm gap-2 cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand ${
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

                      <span className={kit.hint}>Or paste a direct link below</span>
                    </div>
                  </div>

                  <input
                    type="text"
                    required
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    placeholder="Paste direct image URL"
                    className="sag-input mt-2"
                  />
                </div>
              </fieldset>

              <fieldset className={`${kit.inset} space-y-3`}>
                <legend className="float-left w-full text-sm leading-5 font-semibold text-ink">3. Button</legend>
                <div className="clear-both grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="sag-label">Button Text</label>
                    <input
                      type="text"
                      value={formData.buttonText}
                      onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                      placeholder="e.g. SHOP SALE"
                      className="sag-input"
                    />
                  </div>

                  <div>
                    <label className="sag-label">Target Category / Link</label>
                    <input
                      type="text"
                      value={formData.buttonLink}
                      onChange={(e) => setFormData({ ...formData, buttonLink: e.target.value })}
                      placeholder="e.g. Sale or Festive Wear"
                      className="sag-input"
                    />
                    <p className={`mt-1.5 ${kit.hint}`}>Where a tap on the button takes the shopper.</p>
                  </div>
                </div>
              </fieldset>

              <CheckRow
                label="Enable banner on live store"
                hint="Off: the banner is kept here but shoppers do not see it."
                checked={formData.isActive}
                onChange={(isActive) => setFormData({ ...formData, isActive })}
                onText="Shown to shoppers"
              />

              <div className="flex gap-3 pt-3 border-t border-line sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={kit.outline}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`${kit.primary} flex-1 sm:flex-none`}
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
