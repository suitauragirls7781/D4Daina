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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-\[#FAF7F2\] p-5 rounded-2xl border border-rose-100 shadow-xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#8B2635]">
            Visual Merchandising
          </span>
          <h2 className="font-serif text-2xl font-bold text-gray-900">
            Promotional Banners ({banners.length})
          </h2>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] rounded-xl text-xs font-semibold tracking-wider uppercase transition shadow-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Add Banner</span>
        </button>
      </div>

      {/* Banners List */}
      <div className="space-y-4">
        {banners.map((banner) => (
          <div
            key={banner.id}
            className={`bg-\[#FAF7F2\] rounded-2xl border p-5 shadow-xs overflow-hidden transition flex flex-col md:flex-row gap-5 items-center justify-between ${
              banner.isActive ? 'border-rose-100' : 'border-gray-200 opacity-70'
            }`}
          >
            {/* Banner Preview Thumbnail */}
            <div className="w-full md:w-64 h-32 rounded-xl overflow-hidden relative shrink-0 bg-gray-100">
              {banner.image && banner.image.trim() !== "" ? (
                <img
                  src={banner.image}
                  alt={banner.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-black" />
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-3 text-center text-white">
                <span className="font-serif font-bold text-sm leading-tight drop-shadow-sm">
                  {banner.title}
                </span>
              </div>
            </div>

            {/* Banner Info */}
            <div className="flex-1 space-y-1.5 min-w-0">
              {banner.badge && (
                <span className="px-2 py-0.5 bg-[#D8C8B8]/20 border border-rose-200 text-[#211C1A] text-[10px] font-bold uppercase rounded-md">
                  {banner.badge}
                </span>
              )}
              <h4 className="font-serif text-lg font-bold text-gray-900 truncate">
                {banner.title}
              </h4>
              <p className="text-xs text-gray-600 line-clamp-2">
                {banner.subtitle}
              </p>
              <div className="flex items-center gap-3 text-[11px] text-gray-500 pt-1">
                <span>CTA: <strong>{banner.buttonText}</strong></span>
                <span>•</span>
                <span>Target: <strong>{banner.buttonLink}</strong></span>
                <span>•</span>
                <span>Position: <strong className="capitalize">{banner.position}</strong></span>
              </div>
            </div>

            {/* Status & Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  toggleBannerStatus(banner.id);
                  showToast(`Banner "${banner.title}" is now ${!banner.isActive ? 'Active' : 'Disabled'}.`, 'info');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                  banner.isActive
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {banner.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{banner.isActive ? 'Active' : 'Disabled'}</span>
              </button>

              <button
                onClick={() => handleOpenEdit(banner)}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-[#211C1A]"
                title="Edit Banner"
              >
                <Edit3 className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleDelete(banner)}
                className="p-2 hover:bg-[#D8C8B8]/20 rounded-lg text-gray-400 hover:text-\[#800020\]"
                title="Delete Banner"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

          </div>
        ))}
      </div>

      {/* Add / Edit Banner Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-\[#FAF7F2\] rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-gray-200 space-y-4">
            
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-serif text-xl font-bold text-gray-900">
                {editingBannerId ? 'Edit Promotional Banner' : 'Add New Banner'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Banner Headline *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. THE AURA SALE"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Subtitle / Subheading</label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  placeholder="e.g. Up to 40% OFF on Festive Silhouettes"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Eyebrow Badge Text</label>
                <input
                  type="text"
                  value={formData.badge || ''}
                  onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                  placeholder="e.g. Limited Time Offer"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1.5">Banner Image *</label>
                
                {/* Visual Thumbnail & Upload Trigger */}
                <div className="border border-dashed border-gray-200 rounded-xl p-4 bg-[#D8C8B8]/20 space-y-3">
                  {formData.image && formData.image.trim() !== "" ? (
                    <div className="relative w-full h-36 rounded-lg overflow-hidden bg-gray-50 border border-rose-100">
                      <img
                        src={formData.image}
                        alt="Banner Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, image: '' })}
                        className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition"
                        title="Remove Image"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-gray-500">
                      <ImageIcon className="w-8 h-8 text-rose-300 mb-2" />
                      <p className="text-[11px]">No image selected</p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <label className={`w-full sm:w-auto px-4 py-2 border rounded-lg font-bold text-center cursor-pointer transition flex items-center justify-center gap-1.5 ${
                      isUploading 
                        ? 'bg-gray-50 border-gray-100 text-gray-400' 
                        : 'bg-[#241D1B] border-transparent text-[#211C1A] hover:bg-[#241D1B]'
                    }`}>
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          <span>Upload from Gallery</span>
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

                    <span className="text-[10px] text-gray-400 font-medium">Or paste direct link below</span>
                  </div>
                </div>

                <input
                  type="text"
                  required
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="Paste direct image URL"
                  className="w-full px-3 py-2 mt-2 border border-gray-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Button Text</label>
                  <input
                    type="text"
                    value={formData.buttonText}
                    onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                    placeholder="e.g. SHOP SALE"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Target Category / Link</label>
                  <input
                    type="text"
                    value={formData.buttonLink}
                    onChange={(e) => setFormData({ ...formData, buttonLink: e.target.value })}
                    placeholder="e.g. Sale or Festive Wear"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded text-[#211C1A] focus:ring-[#241D1B]"
                  />
                  <span>Enable banner on live store</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] rounded-lg font-bold flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" /> Save Banner
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
