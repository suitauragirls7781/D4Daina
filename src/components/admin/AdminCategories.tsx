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
import { AdminPageHeader, EmptyState, SCRIM, SWITCH_TRACK, StatRow, StatTile, tone, ui } from './kidsToysShared';
import { getCleanImageUrl } from '../../utils/imageHelper';

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

  // A stored photo is removed only when nothing else on the store still shows it
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

  const activeCount = categories.filter((c) => c.isActive).length;
  const noPhotoCount = categories.filter((c) => !c.image).length;

  return (
    <div id="admin-categories-page" className="space-y-6">

      {/* Header */}
      <AdminPageHeader
        eyebrow="Catalogue"
        title="Categories"
        icon={<Layers className="text-current" />}
        description="The groups shoppers browse by (Suits, Kurtis, Kids…). Give each one a photo. The store shows a category only when it has products."
        actions={
          <button
            onClick={handleOpenAdd}
            className="sag-btn-primary h-12 px-5 text-[15px] gap-2 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 text-current" />
            <span>Add category</span>
          </button>
        }
      />
      <StatRow label="Categories in numbers">
        <StatTile label="Categories" value={categories.length} note="in total" />
        <StatTile label="Shown on the store" value={activeCount} note="switched on" tone="gold" />
        <StatTile label="Switched off" value={categories.length - activeCount} note="hidden from shoppers" />
        <StatTile label="No photo yet" value={noPhotoCount} note={noPhotoCount ? 'the store uses a product photo' : 'every category has a photo'} />
      </StatRow>

      {categories.length === 0 && (
        <div className="sag-glass">
          <EmptyState icon={<Layers />} title="No categories yet">Use Add category to create the first one.</EmptyState>
        </div>
      )}

      {/* Categories Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {categories.map((cat) => {
          const liveCount = getActualProductCount(cat.name);
          return (
            <div
              key={cat.id}
              className="min-w-0 sag-glass overflow-hidden flex flex-col"
            >
              {/* Category Image Banner */}
              <div className="m-2.5 mb-0 aspect-[4/5] overflow-hidden rounded-[16px] bg-sunken flex items-center justify-center">
                <img
                  src={cat.image ? getCleanImageUrl(cat.image, 480) : undefined}
                  alt={cat.title}
                  loading="lazy"
                  className={`w-full h-full object-cover object-top ${!cat.image ? 'hidden' : ''}`}
                />
                {!cat.image && <ImageIcon className="w-7 h-7 text-ink-faint" aria-hidden="true" />}
              </div>
              <div className="px-3.5 sm:px-4 pt-3.5">
                <span className={`${ui.badge} ${cat.isActive ? tone.ok : tone.muted}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cat.isActive ? 'bg-ok' : 'bg-ink-faint'}`} aria-hidden="true" />
                  {cat.isActive ? 'On the store' : 'Switched off'}
                </span>
                <h4 className="mt-2 text-base font-semibold leading-snug text-ink break-words">
                  {cat.title}
                </h4>
                {cat.tagline && (
                  <p className="mt-0.5 text-[13px] text-ink-muted line-clamp-2">
                    {cat.tagline}
                  </p>
                )}
              </div>

              {/* Body stats & controls */}
              <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between space-y-3 text-[13px]">
                <p className="flex items-baseline gap-1.5 text-ink-muted">
                  <span className="text-xl leading-7 font-semibold text-ink sag-num">{liveCount}</span>
                  <span>{liveCount === 1 ? 'product' : 'products'} in this category</span>
                </p>
                {!cat.image && <p className="text-xs leading-4 text-ink-muted">No photo yet: the store uses the first product photo.</p>}

                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-3 border-t border-line">
                  <button
                    onClick={() => handleOpenEdit(cat)}
                    className={`${ui.small} !border-brand-line !text-brand`}
                    title="Edit category"
                    aria-label={`Edit ${cat.title}`}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-current" /> Edit
                  </button>
                  <button
                    onClick={() => {
                      updateCategory(cat.id, { isActive: !cat.isActive })
                        .then(() => showToast(`Category "${cat.title}" ${!cat.isActive ? 'enabled' : 'hidden'}.`, 'info'))
                        .catch((err: any) => showToast(err?.message || 'Could not save. Please try again.', 'error'));
                    }}
                    className={ui.small}
                  >
                    {cat.isActive ? 'Switch off' : 'Switch on'}
                  </button>

                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      onClick={() => handleDelete(cat)}
                      className="w-11 h-11 inline-flex items-center justify-center hover:bg-danger-tint rounded-full text-danger transition-colors cursor-pointer"
                      title="Delete category"
                      aria-label={`Delete ${cat.title}`}
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
        <div className={`fixed inset-0 z-50 ${SCRIM} flex items-end sm:items-center justify-center sm:p-4`}>
          <div role="dialog" aria-modal="true" aria-label={editingCatId ? 'Edit category' : 'Add new category'} className="bg-surface rounded-t-[28px] sm:rounded-[28px] sm:max-w-lg w-full max-h-[92dvh] overflow-y-auto overscroll-contain p-5 sm:p-7 shadow-[var(--sag-shadow-pop)] space-y-4 animate-in fade-in slide-in-from-bottom-5">

            <div className="sticky top-0 z-10 -mx-5 sm:-mx-7 -mt-5 sm:-mt-7 px-5 sm:px-7 py-3 bg-surface flex items-center justify-between border-b border-line">
              <h3 className="font-display text-[20px] leading-7 text-ink">
                {editingCatId ? 'Edit category' : 'Add a category'}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Close" className="w-11 h-11 rounded-full flex items-center justify-center text-ink hover:bg-sunken-deep cursor-pointer">
                <X className="w-5 h-5 text-current" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              <div>
                <label htmlFor="cat-title" className="sag-label">Name shown on the store <span className="text-danger">*</span></label>
                <input
                  id="cat-title"
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Festive Wear"
                  className="sag-input"
                />
              </div>

              <div>
                <label htmlFor="cat-name" className="sag-label">Products it shows <span className="text-danger">*</span></label>
                <select
                  id="cat-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value as ProductCategory })}
                  className="sag-input"
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
                <p className="mt-1.5 text-[13px] text-ink-muted">Products saved with this category appear under it.</p>
              </div>

              <div>
                <p className="sag-label">Category photo <span className="font-normal text-ink-muted">(optional)</span></p>
                <div className="flex items-start gap-3">
                  {/* The whole photo is shown, uncropped, so you can check what was uploaded */}
                  <div className="w-28 aspect-[4/5] shrink-0 rounded-[16px] overflow-hidden border border-line bg-sunken flex items-center justify-center">
                    {formData.image ? (
                      <img src={getCleanImageUrl(formData.image, 320)} alt="Category photo preview" className="w-full h-full object-contain" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-ink-faint" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label className={`sag-btn-outline h-11 px-4 text-sm gap-1.5 ${isUploading ? 'opacity-60 cursor-wait' : ''}`}>
                      <ImageIcon className="w-4 h-4 text-current" />
                      {isUploading ? 'Uploading…' : formData.image ? 'Change photo' : 'Upload photo'}
                      <input type="file" accept="image/*" className="sr-only" disabled={isUploading} onChange={handleImageFile} />
                    </label>
                    {formData.image && (
                      <button type="button" onClick={() => setFormData({ ...formData, image: '' })} className="sag-link text-danger hover:text-danger">
                        Remove
                      </button>
                    )}
                    <input
                      type="url"
                      value={formData.image}
                      onChange={(e) => setFormData({ ...formData, image: e.target.value.trim() })}
                      placeholder="…or paste an image link"
                      aria-label="Category photo link"
                      className="sag-input basis-full"
                    />
                    <p className="basis-full text-[13px] text-ink-muted">Without a photo, the store uses the first product photo of this category.</p>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="cat-tagline" className="sag-label">Short line under the name <span className="font-normal text-ink-muted">(optional)</span></label>
                <input
                  id="cat-tagline"
                  type="text"
                  value={formData.tagline}
                  onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                  placeholder="e.g. Royal zari, banarasi weaves & lehengas"
                  className="sag-input"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center justify-between gap-3 min-h-[56px] px-3.5 py-2.5 rounded-[16px] border border-transparent bg-page cursor-pointer text-sm font-semibold text-ink has-[:checked]:border-brand-line has-[:checked]:bg-brand-wash">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className={SWITCH_TRACK} aria-hidden="true" />
                  <span className="order-first">Show this category on the store</span>
                </label>
              </div>

              <div className="sticky bottom-0 z-10 -mx-5 sm:-mx-7 -mb-5 sm:-mb-7 px-5 sm:px-7 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-surface flex gap-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="sag-btn-outline h-12 flex-1 sm:flex-none sm:ml-auto sm:px-6 text-[15px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || isSaving}
                  className="sag-btn-primary h-12 flex-[2] sm:flex-none sm:px-8 gap-2"
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
