import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import {
  Layers,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Image as ImageIcon,
  Sparkles,
  Eye,
  Save,
  ArrowRight
} from 'lucide-react';
import { CategoryItem, ProductCategory } from '../../types';
import { deleteImages, uploadImage } from '../../lib/dataStore';
import { AdminPageHeader } from './kidsToysShared';

const MAX_UPLOAD_MB = 10;

export const AdminCategories: React.FC = () => {
  const { categories = [], addCategory, updateCategory, deleteCategory, products = [], heroConfig, dealOfTheDay } = useAdmin();
  const { showToast, navigateToCategory } = useShop();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<Omit<CategoryItem, 'id'>>({
    name: 'Suits',
    title: 'Suits',
    image: '',
    itemCount: '',
    tagline: '',
    isActive: true,
  });

  const handleOpenAdd = () => {
    setEditingCatId(null);
    setFormData({
      name: 'Suits',
      title: '',
      image: '',
      itemCount: '',
      tagline: '',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cat: CategoryItem) => {
    setEditingCatId(cat.id);
    setFormData({
      name: cat.name,
      title: cat.title,
      image: cat.image,
      itemCount: cat.itemCount,
      tagline: cat.tagline,
      isActive: cat.isActive,
    });
    setIsModalOpen(true);
  };

  // A Cloudinary photo is removed only when nothing else on the store still shows it
  const removeUnusedImage = (url: string | undefined, keep: string[] = [], ignoreCategoryId = '') => {
    if (!url) return;
    const stillUsed = new Set<string>([
      ...keep,
      ...categories.filter((c) => c.id !== ignoreCategoryId).map((c) => c.image || ''),
      ...products.flatMap((p) => [...(p.images || []), (p as any).image || '']),
      ...(heroConfig?.slides || []).flatMap((s) => [s.image || '', s.bannerImage || '']),
      dealOfTheDay?.bannerImage || '',
    ]);
    if (stillUsed.has(url)) return;
    deleteImages([url]).catch((error) => console.error('Could not delete old category photo:', error));
  };

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Only image files can be uploaded.', 'error');
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      showToast(`Photo is larger than ${MAX_UPLOAD_MB} MB. Please choose a smaller one.`, 'error');
      return;
    }
    setIsUploading(true);
    try {
      const url = await uploadImage(file, 'categories');
      // A photo uploaded in this form but replaced before saving is not used anywhere
      const replaced = formData.image;
      const saved = editingCatId ? categories.find((c) => c.id === editingCatId)?.image : '';
      setFormData((prev) => ({ ...prev, image: url }));
      if (replaced && replaced !== saved) removeUnusedImage(replaced, [url]);
      showToast('Photo uploaded. Click "Save Category" to publish it.', 'success');
    } catch (err: any) {
      showToast(`Upload failed: ${err?.message || 'Please try again.'}`, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      showToast('Category title is required.', 'error');
      return;
    }
    if (isUploading) return;
    setIsSaving(true);
    try {
      if (editingCatId) {
        const previousImage = categories.find((c) => c.id === editingCatId)?.image;
        await updateCategory(editingCatId, formData);
        if (previousImage && previousImage !== formData.image) removeUnusedImage(previousImage, [formData.image], editingCatId);
        showToast(`Category "${formData.title}" updated.`, 'success');
      } else {
        await addCategory(formData);
        showToast(`Category "${formData.title}" created.`, 'success');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      showToast(err?.message || 'Could not save. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (cat: CategoryItem) => {
    if (categories.length <= 1) {
      showToast('Storefront requires at least 1 category.', 'error');
      return;
    }
    if (!window.confirm(`Delete the category "${cat.title}"? Products keep their category name.`)) return;
    deleteCategory(cat.id)
      .then(() => {
        showToast(`Category "${cat.title}" removed.`, 'info');
        removeUnusedImage(cat.image, [], cat.id);
      })
      .catch((err: any) => showToast(err?.message || 'Could not save. Please try again.', 'error'));
  };

  const getActualProductCount = (catName: ProductCategory) => {
    return products.filter((p) => p.category === catName).length;
  };

  return (
    <div id="admin-categories-page" className="space-y-6">

      {/* Header */}
      <AdminPageHeader
        eyebrow="Taxonomy & Navigation"
        title={<>Categories <span className="text-[#2A1A26]/45 font-normal">({categories.length})</span></>}
        icon={<Layers className="text-current" />}
        description="The category tiles and menu links shoppers browse by. The store shows only categories that have products."
        actions={
          <button
            onClick={handleOpenAdd}
            className="h-11 px-5 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full text-sm font-semibold transition-colors shadow-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-current" />
            <span>Add category</span>
          </button>
        }
      />
      {categories.length === 0 && (
        <div className="px-6 py-14 text-center bg-white rounded-3xl border border-dashed border-[#4B1D3F]/20">
          <span className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center"><Layers className="w-6 h-6 text-current" /></span>
          <p className="font-serif text-xl text-[#2A1A26]">No categories yet</p>
          <p className="mt-1 text-sm text-[#2A1A26]/60">Use Add category to create the first one.</p>
        </div>
      )}

      {/* Categories Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {categories.map((cat) => {
          const liveCount = getActualProductCount(cat.name);
          return (
            <div
              key={cat.id}
              className="min-w-0 bg-white rounded-3xl border border-[#4B1D3F]/10 overflow-hidden shadow-[var(--sag-shadow)] hover:border-[#4B1D3F]/25 transition-colors flex flex-col group"
            >
              {/* Category Image Banner */}
              <div className="aspect-[4/5] overflow-hidden bg-[#F3EEF8] flex items-center justify-center">
                <img
                  src={cat.image}
                  alt={cat.title}
                  className={`w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500 ${!cat.image ? 'hidden' : ''}`}
                />
                {!cat.image && <ImageIcon className="w-7 h-7 text-[#4B1D3F]/35" aria-hidden="true" />}
              </div>
              <div className="px-3.5 sm:px-4 pt-3.5">
                <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-[11px] font-semibold uppercase tracking-wide ${
                  cat.isActive ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-[#F3EEF8] text-[#4B1D3F] border-[#4B1D3F]/15'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cat.isActive ? 'bg-emerald-600' : 'bg-[#4B1D3F]/40'}`} aria-hidden="true" />
                  {cat.isActive ? 'Active' : 'Disabled'}
                </span>
                <h4 className="mt-2 font-serif text-lg sm:text-xl font-semibold leading-snug text-[#2A1A26] break-words">
                  {cat.title}
                </h4>
                {cat.tagline && (
                  <p className="text-xs text-[#2A1A26]/60 line-clamp-2">
                    {cat.tagline}
                  </p>
                )}
              </div>

              {/* Body stats & controls */}
              <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-1 text-[#2A1A26]/65">
                  <span>Products</span>
                  <span className="font-semibold text-[#4B1D3F]">
                    {liveCount} live
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#4B1D3F]/10">
                  <button
                    onClick={() => {
                      updateCategory(cat.id, { isActive: !cat.isActive })
                        .then(() => showToast(`Category "${cat.title}" ${!cat.isActive ? 'enabled' : 'hidden'}.`, 'info'))
                        .catch((err: any) => showToast(err?.message || 'Could not save. Please try again.', 'error'));
                    }}
                    className={`h-8 px-3 text-xs font-semibold rounded-full border transition-colors cursor-pointer ${
                      cat.isActive ? 'text-[#4B1D3F] border-[#4B1D3F]/20 hover:bg-[#F3EEF8]' : 'text-emerald-800 border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    {cat.isActive ? 'Disable' : 'Enable'}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(cat)}
                      className="w-8 h-8 inline-flex items-center justify-center hover:bg-[#F3EEF8] rounded-full text-[#4B1D3F] transition-colors cursor-pointer"
                      title="Edit Category"
                    >
                      <Edit3 className="w-4 h-4 text-current" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat)}
                      className="w-8 h-8 inline-flex items-center justify-center hover:bg-rose-50 rounded-full text-rose-700 transition-colors cursor-pointer"
                      title="Delete Category"
                    >
                      <Trash2 className="w-4 h-4 text-current" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#2A1A26]/50 flex items-end sm:items-center justify-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label={editingCatId ? 'Edit category' : 'Add new category'} className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[94dvh] overflow-y-auto p-5 sm:p-7 shadow-2xl border border-[#4B1D3F]/10 space-y-4">

            <div className="flex items-center justify-between border-b border-[#4B1D3F]/10 pb-3">
              <h3 className="font-serif text-2xl font-semibold text-[#2A1A26]">
                {editingCatId ? 'Edit category' : 'Add a category'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} aria-label="Close" className="w-10 h-10 rounded-full flex items-center justify-center text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer">
                <X className="w-5 h-5 text-current" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Category Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Festive Wear"
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Category Slug / Enum Name *</label>
                <select
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value as ProductCategory })}
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 cursor-pointer"
                >
                  <option value="Suits">Suits</option>
                  <option value="Kurtis">Kurtis</option>
                  <option value="Dresses">Dresses</option>
                  <option value="Anarkali">Anarkali</option>
                  <option value="Dupatta Sets">Dupatta Sets</option>
                  <option value="Co-ord Sets">Co-ord Sets</option>
                  <option value="Festive Wear">Festive Wear</option>
                  <option value="Party Wear">Party Wear</option>
                  <option value="Baby Girls">Baby Girls (Kids)</option>
                  <option value="Baby Boys">Baby Boys (Kids)</option>
                  <option value="Toys">Toys</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Category Photo</label>
                <div className="flex items-center gap-3">
                  <div className="w-20 aspect-[4/5] shrink-0 rounded-2xl overflow-hidden border border-[#4B1D3F]/15 bg-[#F3EEF8] flex items-center justify-center">
                    {formData.image ? (
                      <img src={formData.image} alt="Category preview" className="w-full h-full object-cover object-top" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-[#2A1A26]/50" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className={`inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-[#4B1D3F]/20 bg-white text-sm font-semibold text-[#4B1D3F] ${isUploading ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:bg-[#F3EEF8]'}`}>
                      <ImageIcon className="w-4 h-4 text-current" />
                      {isUploading ? 'Uploading…' : formData.image ? 'Change photo' : 'Upload photo'}
                      <input type="file" accept="image/*" className="sr-only" disabled={isUploading} onChange={handleImageFile} />
                    </label>
                    {formData.image && (
                      <button type="button" onClick={() => setFormData({ ...formData, image: '' })} className="ml-2 h-10 px-3 rounded-full text-sm font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer">
                        Remove
                      </button>
                    )}
                    <input
                      type="url"
                      value={formData.image}
                      onChange={(e) => setFormData({ ...formData, image: e.target.value.trim() })}
                      placeholder="…or paste an image link"
                      className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                    />
                    <p className="text-[11px] text-[#2A1A26]/60">Without a photo, the store uses the first product photo of this category.</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Tagline / Short Summary</label>
                <input
                  type="text"
                  value={formData.tagline}
                  onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                  placeholder="e.g. Royal zari, banarasi weaves & lehengas"
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] cursor-pointer text-sm font-semibold text-[#2A1A26]">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="relative shrink-0 w-11 h-6 rounded-full bg-[#E6DDF0] peer-checked:bg-[#4B1D3F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#4B1D3F]/30 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
                  <span className="order-first">Category visible in store navigation</span>
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
                  disabled={isUploading || isSaving}
                  className="h-11 px-6 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full font-semibold flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  <Save className="w-4 h-4 text-current" /> {isSaving ? 'Saving…' : 'Save category'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
