import React, { useState, useEffect, useRef } from 'react';
import { deleteImages, uploadImage } from '../../lib/dataStore';
import { detectColourFromFile, detectColourFromUrl } from '../../utils/detectColour';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import {
  ArrowLeft,
  Save,
  X,
  Image as ImageIcon,
  Sparkles,
  Check,
  Layers,
  IndianRupee,
  Package,
  Plus,
  RefreshCw
} from 'lucide-react';
import { Product, ProductCategory, ProductSize, ProductColor } from '../../types';
import { ACCESSORY_CATEGORY, FOOTWEAR_SIZES, SET_TYPES, isAccessory, setTypeHint } from '../../utils/looks';
import { KIDS_CATEGORIES, TOYS, departmentOf } from '../../utils/kids';
import { AiProductFill, type AiDraft } from './AiProductFill';
import { SectionTitle, tone, ui } from './kidsToysShared';

// On / off switch drawn after a hidden checkbox (same switch as the other admin pages)
const SWITCH_TRACK = "relative shrink-0 w-12 h-7 rounded-full bg-control peer-checked:bg-brand peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5";

/** Page header with a back button, in the same layout as the order details page. */
const FormHeader: React.FC<{ crumb: string; title: React.ReactNode; description?: React.ReactNode; onBack: () => void; actions?: React.ReactNode }> = ({ crumb, title, description, onBack, actions }) => (
  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 pb-4 border-b border-line">
    <div className="flex items-start gap-2 min-w-0">
      <button
        type="button"
        onClick={onBack}
        className="w-11 h-11 -ml-2 shrink-0 flex items-center justify-center hover:bg-sunken text-ink rounded-full transition-colors cursor-pointer"
        title="Back to Products"
        aria-label="Back to Products"
      >
        <ArrowLeft className="w-5 h-5 text-current" />
      </button>
      <div className="min-w-0">
        <div className={`flex items-center gap-1.5 ${ui.eyebrow} min-w-0`}>
          <span>Catalog</span>
          <span aria-hidden="true">/</span>
          <span className="truncate">{crumb}</span>
        </div>
        <h2 className={`mt-0.5 ${ui.h1} break-words`}>{title}</h2>
        {description && <p className="mt-1 text-sm leading-5 text-ink-muted max-w-2xl">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

// Kids wear and toys are added only in Admin → Kids Wear / Toys, never from this women's product form.
const KIDS_AND_TOY_CATEGORIES: readonly string[] = [...KIDS_CATEGORIES, TOYS];

const ALL_CATEGORIES: ProductCategory[] = [
  'Suits',
  'Kurtis',
  'Dresses',
  'Anarkali',
  'Dupatta Sets',
  'Co-ord Sets',
  'Festive Wear',
  'Party Wear'
];

// S to 5XL, plus Free Size. XS is only offered on older products that already use it.
const ALL_SIZES: ProductSize[] = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free Size'];
const CLOTHING_SIZES_WITH_XS: ProductSize[] = ['XS', ...ALL_SIZES];
// Any UK shoe size already saved on a product still sorts after the clothing sizes.
const SIZE_ORDER: ProductSize[] = [...CLOTHING_SIZES_WITH_XS, ...FOOTWEAR_SIZES];
const RANGE_SIZES: ProductSize[] = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
const sortSizes = (list: ProductSize[]) => [...list].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));

// Colour rows nobody has named yet ("+ Add Color" default, or the "Standard" stand-in for products
// saved without colours). An auto-detected colour may fill these in.
const PLACEHOLDER_COLOUR_NAMES = new Set(['', 'new color', 'new colour', 'standard', 'default']);
const isPlaceholderColour = (color: ProductColor) => PLACEHOLDER_COLOUR_NAMES.has(String(color.name || '').trim().toLowerCase());

const PRESET_COLORS: ProductColor[] = [
  { name: 'Burgundy / Maroon', hex: '#800020' },
  { name: 'Blush Pink', hex: '#E8A598' },
  { name: 'Emerald Green', hex: '#1B4D3E' },
  { name: 'Mustard Yellow', hex: '#D4AF37' },
  { name: 'Royal Navy Blue', hex: '#1D2A44' },
  { name: 'Ivory White', hex: '#FDFBF7' },
  { name: 'Deep Rust Orange', hex: '#A8482A' },
  { name: 'Plum Purple', hex: '#4A154B' },
];

interface AdminProductFormProps {
  productId?: string; // If present, edit mode; otherwise create mode
}

export const AdminProductForm: React.FC<AdminProductFormProps> = ({ productId }) => {
  const { products = [], addProduct, updateProduct, categories = [] } = useAdmin();
  const { showToast } = useShop();
  const { navigate, openAdminTab } = useRouter();

  const isEditMode = !!productId;
  const existingProduct = isEditMode ? products.find((p) => p.id === productId) : null;
  // Complete the Look accessories (bags, heels, jewellery...) are a separate section: this form only
  // edits outfits and never creates an accessory.
  const editingAccessory = isAccessory(existingProduct);
  // Kids wear and toys have their own sections too: this form never edits them or turns them into outfits.
  const otherSection = existingProduct && !editingAccessory ? departmentOf(existingProduct) : 'women';
  const editingKidsOrToy = otherSection !== 'women';

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ProductCategory>('Suits');
  // Admin-managed categories first, then the built-in list, without duplicates. "Accessories" belongs to
  // Complete the Look and "Baby Girls" / "Baby Boys" / "Toys" to Kids Wear / Toys, so they are not offered
  // here; the product's own saved category is always kept.
  const categoryOptions = Array.from(new Set([
    ...[...categories.map((c) => c.name), ...ALL_CATEGORIES].filter((c) => c && c !== ACCESSORY_CATEGORY && !KIDS_AND_TOY_CATEGORIES.includes(c)),
    category,
  ].filter(Boolean))) as ProductCategory[];
  // Set / combo type ('' = not a set). "Complete the look" shows only on products that have one.
  const [setType, setSetType] = useState('');
  const [customSetType, setCustomSetType] = useState(false);
  const nameHint = setTypeHint(name);
  const [subcategory, setSubcategory] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [originalPrice, setOriginalPrice] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [sku, setSku] = useState(`SAG-${Date.now().toString(36).toUpperCase().slice(-6)}`);
  const [stockQuantity, setStockQuantity] = useState<number>(0);
  const [fabric, setFabric] = useState('');
  const [fit, setFit] = useState('');
  const [occasion, setOccasion] = useState('');
  const [washCare, setWashCare] = useState('');

  // Images - start empty, never use fake stock images
  const [images, setImages] = useState<string[]>([]);
  // Images uploaded in this editing session (not yet referenced by a saved product)
  const [sessionUploads, setSessionUploads] = useState<string[]>([]);
  // Previously saved images the admin removed; deleted from Cloudinary only after a successful save
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);

  // Sizes - standard available sizes
  const [selectedSizes, setSelectedSizes] = useState<ProductSize[]>(['S', 'M', 'L', 'XL', 'XXL']);

  // Colors
  const [colors, setColors] = useState<ProductColor[]>(existingProduct?.colors || []);
  // Latest colours for the async colour detection (it finishes after the upload loop moved on).
  const colorsRef = useRef(colors);
  useEffect(() => { colorsRef.current = colors; }, [colors]);
  // Colour read from a newly uploaded photo, offered (not added) when the product already has colours.
  const [colourSuggestion, setColourSuggestion] = useState<ProductColor | null>(null);
  const [detectingIdx, setDetectingIdx] = useState<number | null>(null);

  const addColor =() => setColors([...colors, { name: 'New Color', hex: '#241D1B' }]);
  const removeColor = (idx: number) => setColors(colors.filter((_, i) => i !== idx));
  const updateColor = (idx: number, field: keyof ProductColor, value: string) => {
    setColors(colors.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  // Flags
  const [isFeatured, setIsFeatured] = useState<boolean>(false);
  const [isNewArrival, setIsNewArrival] = useState<boolean>(true);
  const [isBestSeller, setIsBestSeller] = useState<boolean>(false);
  const [isSale, setIsSale] = useState<boolean>(false);
  const [isTrending, setIsTrending] = useState<boolean>(false);
  const [isFestive, setIsFestive] = useState<boolean>(false);
  const [inStock, setInStock] = useState<boolean>(true);
  const [published, setPublished] = useState<boolean>(true);
  // Stock as it was when the form opened; unchanged stock is not written back (orders may have changed it since).
  const [loadedStock, setLoadedStock] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // SEO (optional) and the product's own low-stock alert level ('' = store default)
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [searchKeywords, setSearchKeywords] = useState('');
  const [lowStockOverride, setLowStockOverride] = useState('');

  // Load existing data if edit mode
  useEffect(() => {
    if (existingProduct) {
      setName(existingProduct.name);
      setCategory(existingProduct.category);
      const savedSetType = existingProduct.setType || '';
      setSetType(savedSetType);
      setCustomSetType(Boolean(savedSetType) && !(SET_TYPES as readonly string[]).includes(savedSetType));
      setSubcategory(existingProduct.subcategory || '');
      setDescription(existingProduct.description);
      setPrice(existingProduct.price);
      setOriginalPrice(existingProduct.originalPrice);
      setDiscount(existingProduct.discount);
      setSku(existingProduct.sku || existingProduct.id);
      setStockQuantity(existingProduct.stockQuantity ?? 0);
      setLoadedStock(existingProduct.stockQuantity ?? 0);
      setPublished(!existingProduct.hidden);
      setFabric(existingProduct.fabric);
      setFit(existingProduct.fit);
      setOccasion(existingProduct.occasion);
      setWashCare(existingProduct.washCare);
      setVideoUrl(existingProduct.videoUrl || '');
      setSeoTitle(existingProduct.seoTitle || '');
      setSeoDescription(existingProduct.seoDescription || '');
      setSearchKeywords(existingProduct.searchKeywords || '');
      setLowStockOverride(existingProduct.lowStockThreshold ? String(existingProduct.lowStockThreshold) : '');
      setImages(
        existingProduct.images && existingProduct.images.length > 0
          ? existingProduct.images.filter(img => !img.includes('unsplash.com'))
          : []
      );
      setSelectedSizes(
        existingProduct.sizes && existingProduct.sizes.length > 0
          ? existingProduct.sizes
          : ['S', 'M', 'L', 'XL', 'XXL']
      );
      setColors(existingProduct.colors && existingProduct.colors.length > 0 ? existingProduct.colors : []);

      setIsFeatured(!!existingProduct.isFeatured);
      setIsNewArrival(!!existingProduct.isNewArrival);
      setIsBestSeller(!!existingProduct.isBestSeller);
      setIsSale(!!existingProduct.isSale);
      setIsTrending(!!existingProduct.isTrending);
      setIsFestive(!!existingProduct.isFestive);
      setInStock(existingProduct.inStock);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingProduct?.id]);

  // Auto-calculate discount when price or originalPrice changes
  const handlePriceChange = (val: number) => {
    setPrice(val);
    if (originalPrice > val) {
      setDiscount(Math.round(((originalPrice - val) / originalPrice) * 100));
    }
  };

  const handleOriginalPriceChange = (val: number) => {
    setOriginalPrice(val);
    if (val > price) {
      setDiscount(Math.round(((val - price) / val) * 100));
    }
  };

  // Reads the garment colour from the first photo of an upload batch, in the browser from the local
  // file. No colours yet: it is filled in. Otherwise it is only offered as a suggestion chip.
  // A failed read stays silent; the admin can always pick the colour by hand.
  const suggestColourFromPhoto = async (file: File, imageUrl: string) => {
    const detected = await detectColourFromFile(file);
    if (!detected) return;
    const colour: ProductColor = { name: detected.name, hex: detected.hex, imageUrl };
    const current = colorsRef.current;
    if (current.length === 0) {
      setColors([colour]);
    } else if (current.every(isPlaceholderColour)) {
      setColors(current.map((c, i) => (i === 0 ? { ...c, name: colour.name, hex: colour.hex, imageUrl: c.imageUrl || imageUrl } : c)));
    } else {
      setColourSuggestion(colour);
      return;
    }
    setColourSuggestion(null);
    showToast(`Colour detected: ${detected.name} — change it if needed`, 'info');
  };

  const addSuggestedColour = () => {
    if (!colourSuggestion) return;
    const suggestion = colourSuggestion;
    setColors((current) => [...current, suggestion]);
    setColourSuggestion(null);
    showToast(`Colour "${suggestion.name}" added — change it if needed`, 'success');
  };

  // Re-reads the colour from the photo linked to a colour row (loaded from Cloudinary with CORS).
  const detectColourForRow = async (idx: number) => {
    const imageUrl = colors[idx]?.imageUrl;
    if (!imageUrl || detectingIdx !== null) return;
    setDetectingIdx(idx);
    const detected = await detectColourFromUrl(imageUrl);
    setDetectingIdx(null);
    if (!detected) {
      showToast('Could not read a colour from this photo. Please pick it by hand.', 'info');
      return;
    }
    setColors((current) => current.map((c, i) => (i === idx && c.imageUrl === imageUrl ? { ...c, name: detected.name, hex: detected.hex } : c)));
    showToast(`Colour detected: ${detected.name} — change it if needed`, 'info');
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    if (files.length === 0) return;
    let colourChecked = false;

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        showToast('Only image files can be uploaded.', 'error');
        continue;
      }

      let imageUrl = '';
      try {
        imageUrl = await uploadImage(file, 'product-images');
      } catch (err: any) {
        console.error('Cloudinary upload failed:', err);
        showToast(`Failed to upload "${file.name}": ${err?.message || 'Please try again.'}`, 'error');
        continue;
      }

      if (imageUrl) {
        setSessionUploads((current) => [...current, imageUrl]);
        setImages((currentImages) => [...currentImages, imageUrl]);
        showToast(`Image "${file.name}" uploaded successfully.`, 'success');
        if (!colourChecked) {
          colourChecked = true;
          suggestColourFromPhoto(file, imageUrl).catch(() => undefined);
        }
      }
    }

    event.target.value = '';
  };

  const [aiUploading, setAiUploading] = useState(false);
  const handleAiUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setAiUploading(true);
    try { await handleImageUpload(event); } finally { setAiUploading(false); }
  };
  const applyAiDraft = (draft: AiDraft) => {
    if (draft.name) setName(draft.name);
    if (draft.category && categoryOptions.includes(draft.category as ProductCategory)) setCategory(draft.category as ProductCategory);
    setCustomSetType(false);
    setSetType(draft.setType || '');
    if (draft.subcategory) setSubcategory(draft.subcategory);
    if (draft.description) setDescription(draft.description);
    if (draft.fabric) setFabric(draft.fabric);
    if (draft.fit) setFit(draft.fit);
    if (draft.occasion) setOccasion(draft.occasion);
    if (draft.washCare) setWashCare(draft.washCare);
    if (draft.colors.length) setColors(draft.colors.map((c, i) => ({ name: c.name, hex: c.hex, ...(i === 0 && images[0] ? { imageUrl: images[0] } : {}) })));
    if (draft.seoTitle) setSeoTitle(draft.seoTitle);
    if (draft.seoDescription) setSeoDescription(draft.seoDescription);
    if (draft.searchKeywords) setSearchKeywords(draft.searchKeywords);
    setColourSuggestion(null);
    showToast('Details filled by Gemini. Add price, MRP, sizes and stock, then save.', 'success');
  };

  const handleRemoveImage = async (index: number) => {
    const imageUrlToRemove = images[index];

    if (sessionUploads.includes(imageUrlToRemove)) {
      // Never saved on a product, so it can be deleted from Cloudinary right away
      setSessionUploads((current) => current.filter((url) => url !== imageUrlToRemove));
      deleteImages([imageUrlToRemove]).catch((error) => console.error('Error deleting image from Cloudinary:', error));
    } else {
      setPendingDeletes((current) => [...current, imageUrlToRemove]);
    }

    setImages(images.filter((_, i) => i !== index));
    setColors(colors.map(c => c.imageUrl === imageUrlToRemove ? { ...c, imageUrl: undefined } : c));
    if (colourSuggestion?.imageUrl === imageUrlToRemove) setColourSuggestion(null);
  };

  // Leaving without saving discards any images uploaded during this session
  const handleCancel = () => {
    if (sessionUploads.length > 0) {
      deleteImages(sessionUploads).catch((error) => console.error('Error deleting unsaved images:', error));
    }
    navigate('/admin/products');
  };

  const toggleSize = (size: ProductSize) => {
    if (selectedSizes.includes(size)) {
      if (selectedSizes.length <= 1) {
        showToast('Select at least one size.', 'error');
        return;
      }
      setSelectedSizes(selectedSizes.filter((s) => s !== size));
    } else if (size === 'Free Size') {
      // One size fits all: the measured sizes no longer apply.
      setSelectedSizes(['Free Size']);
    } else {
      setSelectedSizes(sortSizes([...selectedSizes.filter((s) => s !== 'Free Size'), size]));
    }
  };

  // XS stays visible on older products that already use it. Any other saved size is listed too, so saved
  // sizes are never lost or hidden.
  const baseSizeOptions: ProductSize[] = existingProduct?.sizes?.includes('XS') || selectedSizes.includes('XS') ? CLOTHING_SIZES_WITH_XS : ALL_SIZES;
  const sizeOptions: ProductSize[] = [...baseSizeOptions, ...selectedSizes.filter((s) => !baseSizeOptions.includes(s))];



  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingAccessory) {
      showToast('This is a Complete the Look accessory — edit it in Complete the Look.', 'error');
      return;
    }
    if (editingKidsOrToy) {
      showToast(otherSection === 'toys' ? 'This is a toy — edit it in Toys.' : 'This is kids wear — edit it in Kids Wear.', 'error');
      return;
    }
    if (KIDS_AND_TOY_CATEGORIES.includes(category)) {
      showToast('Kids wear and toys are added in Kids Wear and Toys. Choose a women\'s category here.', 'error');
      return;
    }
    if (!name.trim()) {
      showToast('Product name is required.', 'error');
      return;
    }
    if (price <= 0) {
      showToast('Please enter a valid selling price.', 'error');
      return;
    }
    if (originalPrice > 0 && originalPrice < price) {
      showToast('MRP cannot be lower than the selling price.', 'error');
      return;
    }
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      showToast('Stock must be a whole number of 0 or more.', 'error');
      return;
    }
    if (images.length === 0) {
      showToast('Please upload at least one product photo from your device.', 'error');
      return;
    }
    if (selectedSizes.length === 0) {
      showToast('Please select at least one available size.', 'error');
      return;
    }
    if (customSetType && !setType.trim()) {
      showToast('Type the set / combo type, or choose "Not a set".', 'error');
      return;
    }
    const lowStockValue = lowStockOverride.trim() === '' ? 0 : Number(lowStockOverride);
    if (!Number.isInteger(lowStockValue) || lowStockValue < 0) {
      showToast('Low-stock alert must be a whole number, or leave it empty to use the store default.', 'error');
      return;
    }

    const payload: Omit<Product, 'id'> = {
      name: name.trim(),
      category,
      subcategory,
      description,
      price: Number(price),
      originalPrice: Math.max(Number(price), Number(originalPrice) || 0),
      discount: Number(discount),
      sku: sku.trim() || `SAG-${Date.now().toString().slice(-4)}`,
      rating: existingProduct?.rating || 0,
      reviewCount: existingProduct?.reviewCount || 0,
      images,
      colors: colors,
      sizes: selectedSizes,
      stockQuantity: Number(stockQuantity),
      fabric,
      fit,
      occasion,
      washCare,
      videoUrl: videoUrl.trim(),
      isFeatured,
      isNewArrival,
      isBestSeller,
      isSale,
      isTrending,
      isFestive,
      inStock: stockQuantity > 0,
      hidden: !published,
      reviews: existingProduct?.reviews || [],
      // Always sent, so an edit never drops them: this form saves outfits only (accessories are added in
      // Complete the Look), and a set / combo type keeps the product a combo.
      productType: 'outfit',
      accessoryType: '',
      setType: setType.trim(),
      seoTitle: seoTitle.trim(),
      seoDescription: seoDescription.trim(),
      searchKeywords: searchKeywords.trim(),
      lowStockThreshold: lowStockValue,
    };

    setIsSaving(true);
    try {
      if (isEditMode && productId) {
        const changes: Partial<typeof payload> = { ...payload };
        if (loadedStock !== null && stockQuantity === loadedStock) {
          delete changes.stockQuantity;
          delete changes.inStock;
        }
        await updateProduct(productId, changes, 'Edited in product form');
        showToast(`Product "${name}" updated successfully across the site.`, 'success');
      } else {
        await addProduct(payload);
        showToast(`Product "${name}" added to catalog successfully.`, 'success');
      }
      // Duplicated products share image URLs, so keep any image another product still uses
      const usedElsewhere = new Set(
        products
          .filter((product) => product.id !== productId)
          .flatMap((product) => [...product.images, ...product.colors.map((color) => color.imageUrl || '')]),
      );
      const removedImages = pendingDeletes.filter((url) => !images.includes(url) && !usedElsewhere.has(url));
      if (removedImages.length > 0) {
        deleteImages(removedImages).catch((error) => console.error('Error deleting removed images from Cloudinary:', error));
      }
      setSessionUploads([]);
      setPendingDeletes([]);
      navigate('/admin/products');
    } catch (err: any) {
      console.error('Failed to save product:', err);
      showToast(err?.message || 'Failed to save changes. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Opened on an accessory (e.g. /admin/products/<id>/edit): accessories are edited only in Complete the Look.
  if (editingAccessory && existingProduct) {
    return (
      <div id="admin-product-form-page" className="space-y-4 sm:space-y-5 pb-10">
        <FormHeader crumb="Accessory" title={existingProduct.name} onBack={() => navigate('/admin/products')} />

        <div id="admin-accessory-notice" role="status" className={`${ui.card} space-y-3`}>
          <p className={ui.h2}>This is a Complete the Look accessory — edit it in Complete the Look</p>
          <p className="text-sm leading-5 text-ink-muted">
            Accessories are shown only on combo product pages, inside "Complete the look", and customers buy them only together with that outfit.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => openAdminTab('looks')} className={ui.primary}>
              Open Complete the Look
            </button>
            <button type="button" onClick={() => navigate('/admin/products')} className={ui.outline}>
              Back to Products
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Opened on kids wear or a toy (e.g. /admin/products/<id>/edit): they are edited only in Kids Wear / Toys.
  if (editingKidsOrToy && existingProduct) {
    const isToyItem = otherSection === 'toys';
    const sectionName = isToyItem ? 'Toys' : 'Kids Wear';
    return (
      <div id="admin-product-form-page" className="space-y-4 sm:space-y-5 pb-10">
        <FormHeader crumb={isToyItem ? 'Toy' : 'Kids wear'} title={existingProduct.name} onBack={() => navigate('/admin/products')} />

        <div id="admin-kids-toys-notice" role="status" className={`${ui.card} space-y-3`}>
          <p className={ui.h2}>
            {isToyItem ? 'This is a toy — edit it in Toys' : 'This is kids wear — edit it in Kids Wear'}
          </p>
          <p className="text-sm leading-5 text-ink-muted">
            {isToyItem
              ? 'Toys have their own section, with the kind of toy and a suitable age, and are sold as one piece. This women\'s product form is not used for them.'
              : 'Kids wear has its own section for Baby Girls and Baby Boys, with sizes by age (1-2 Y to 14-15 Y). This women\'s product form is not used for it.'}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => openAdminTab(isToyItem ? 'toys' : 'kids')} className={ui.primary}>
              Open {sectionName}
            </button>
            <button type="button" onClick={() => navigate('/admin/products')} className={ui.outline}>
              Back to Products
            </button>
          </div>
        </div>
      </div>
    );
  }

  const flagToggles: Array<{ id: string; label: string; checked: boolean; onChange: (next: boolean) => void }> = [
    { id: 'apf-flag-featured', label: 'Featured Product', checked: isFeatured, onChange: setIsFeatured },
    { id: 'apf-flag-new', label: 'New Arrival', checked: isNewArrival, onChange: setIsNewArrival },
    { id: 'apf-flag-bestseller', label: 'Best Seller', checked: isBestSeller, onChange: setIsBestSeller },
    { id: 'apf-flag-sale', label: 'Sale Item', checked: isSale, onChange: setIsSale },
    { id: 'apf-flag-trending', label: 'Trending Now', checked: isTrending, onChange: setIsTrending },
    { id: 'apf-flag-festive', label: 'Festive Edit', checked: isFestive, onChange: setIsFestive },
    { id: 'apf-flag-published', label: 'Published on store', checked: published, onChange: setPublished },
  ];

  return (
    <div id="admin-product-form-page" className="space-y-4 sm:space-y-5 pb-10">

      {/* Header: back, where you are, and the save action */}
      <FormHeader
        crumb={isEditMode ? 'Edit product' : 'New product'}
        title={isEditMode ? (existingProduct?.name || 'Edit product') : 'Add a new product'}
        description={isEditMode ? 'Changes go live on the store as soon as you save.' : "A women's outfit for the store. Kids wear, toys and accessories have their own sections."}
        onBack={handleCancel}
        actions={
          <>
            <button type="button" disabled={isSaving} onClick={handleCancel} className={ui.outline}>
              Cancel
            </button>
            <button type="submit" form="product-edit-form" disabled={isSaving} className={ui.primary}>
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />}
              <span>{isSaving ? 'Saving...' : 'Save product'}</span>
            </button>
          </>
        }
      />

      <form id="product-edit-form" onSubmit={handleSave} className="space-y-4 sm:space-y-5">

        {/* Gemini: drafts the listing text from the product photos */}
        <AiProductFill
          images={images}
          uploading={aiUploading}
          onUpload={handleAiUpload}
          categories={categoryOptions}
          setTypes={SET_TYPES}
          currentName={name}
          hasDetails={Boolean(name.trim() || description.trim())}
          onApply={applyAiDraft}
        />

        {/* Section 1: Basic Information */}
        <section className={ui.card}>
          <SectionTitle icon={<Package className="text-current" />} title="Basic Product Information" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="apf-name" className={ui.label}>Product Name *</label>
              <input
                id="apf-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Gulab Handblock Pure Cotton Anarkali Set"
                className={ui.field}
              />
            </div>

            <div>
              <label htmlFor="apf-category" className={ui.label}>Category *</label>
              <select
                id="apf-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                className={`${ui.select} pl-3.5`}
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="apf-subcategory" className={ui.label}>Subcategory / Collection Tag <span className={ui.optional}>(optional)</span></label>
              <input
                id="apf-subcategory"
                type="text"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="e.g. Cambric Cotton Suit Sets"
                className={ui.field}
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="apf-set-type" className={ui.label}>Set / combo type</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  id="apf-set-type"
                  value={customSetType ? '__custom' : setType}
                  onChange={(e) => {
                    if (e.target.value === '__custom') {
                      setCustomSetType(true);
                      if ((SET_TYPES as readonly string[]).includes(setType)) setSetType('');
                    } else {
                      setCustomSetType(false);
                      setSetType(e.target.value);
                    }
                  }}
                  className={`${ui.select} pl-3.5`}
                >
                  <option value="">Not a set</option>
                  {SET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  <option value="__custom">Other (type your own)</option>
                </select>
                {customSetType && (
                  <input
                    type="text"
                    maxLength={40}
                    value={setType}
                    onChange={(e) => setSetType(e.target.value)}
                    placeholder="e.g. Kurti + palazzo + dupatta"
                    aria-label="Your own set / combo type"
                    className={ui.field}
                  />
                )}
              </div>
              <p className={ui.hint}>
                "Complete the look" (bags, heels, jewellery... from Complete the Look in the menu) shows only on the pages of products with a set / combo type.
              </p>
              {!setType.trim() && !customSetType && nameHint.looksLikeSet && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-sale-tint border border-sale-line pl-3.5 pr-1.5 py-1.5 text-[13px] leading-[18px] text-ink">
                  <span className="min-w-0 flex-1 basis-56 py-1">This name looks like a set. Choose its set / combo type so accessories show on its page.</span>
                  {nameHint.suggestion && (
                    <button type="button" onClick={() => setSetType(nameHint.suggestion)} className={ui.small}>
                      Mark as "{nameHint.suggestion}"
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="apf-sku" className={ui.label}>SKU (Stock Keeping Unit)</label>
              <input
                id="apf-sku"
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. SAG-COT-9901"
                className={`${ui.field} font-mono`}
              />
            </div>

            <div>
              <label htmlFor="apf-stock" className={ui.label}>Inventory Stock Quantity</label>
              <input
                id="apf-stock"
                type="number"
                min="0"
                value={stockQuantity}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setStockQuantity(val);
                  if (val === 0) setInStock(false);
                  else setInStock(true);
                }}
                className={`${ui.field} sag-num`}
              />
            </div>

            <div>
              <label htmlFor="apf-low-stock" className={ui.label}>Low-stock alert at (pieces) <span className={ui.optional}>(optional)</span></label>
              <input
                id="apf-low-stock"
                type="number"
                min="0"
                step="1"
                value={lowStockOverride}
                onChange={(e) => setLowStockOverride(e.target.value)}
                placeholder="Store default"
                className={`${ui.field} sag-num`}
              />
              <p className={ui.hint}>Leave empty to use the store setting in Products.</p>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="apf-description" className={ui.label}>Product Description</label>
              <textarea
                id="apf-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write full product craftsmanship, silhouette, and drape details..."
                className={ui.textarea}
              />
            </div>
          </div>
        </section>

        {/* Section 2: Pricing & Discount */}
        <section className={ui.card}>
          <SectionTitle icon={<IndianRupee className="text-current" />} title="Pricing & Currency (₹ INR)" />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="apf-price" className={ui.label}>Selling Price (₹) *</label>
              <input
                id="apf-price"
                type="number"
                min="1"
                required
                value={price}
                onChange={(e) => handlePriceChange(Number(e.target.value))}
                className={`${ui.field} font-semibold sag-num`}
              />
            </div>

            <div>
              <label htmlFor="apf-mrp" className={ui.label}>MRP / Original Price (₹)</label>
              <input
                id="apf-mrp"
                type="number"
                min="1"
                value={originalPrice}
                onChange={(e) => handleOriginalPriceChange(Number(e.target.value))}
                className={`${ui.field} sag-num`}
              />
            </div>

            <div>
              <label htmlFor="apf-discount" className={ui.label}>Discount Calculated (%)</label>
              <div className="relative">
                <input
                  id="apf-discount"
                  type="number"
                  min="0"
                  max="100"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className={`${ui.field} pr-20 font-semibold sag-num`}
                />
                <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 ${ui.badge} ${tone.warn}`}>% OFF</span>
              </div>
            </div>

            {/* Colors Selection */}
            <div className="pt-4 border-t border-line sm:col-span-3">
              <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                <p className={`${ui.label} !mb-0`}>Available Colors & Sync Image *</p>
                <button type="button" onClick={addColor} className={ui.small}>
                  <Plus className="w-4 h-4 text-current" /> Add colour
                </button>
              </div>

              {colourSuggestion && (
                <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl bg-brand-wash border border-brand-line pl-3 pr-1 py-1.5">
                  <span
                    className="w-8 h-8 rounded-full border-[1.5px] border-white ring-1 ring-line shrink-0"
                    style={{ backgroundColor: colourSuggestion.hex }}
                    aria-hidden="true"
                  />
                  {colourSuggestion.imageUrl && (
                    <img src={colourSuggestion.imageUrl} alt="" className="w-7 aspect-[4/5] rounded-md object-cover object-top bg-sunken" referrerPolicy="no-referrer" />
                  )}
                  <div className="min-w-0 grow">
                    <span className={`block ${ui.eyebrow}`}>Detected colour</span>
                    <span className="text-sm font-semibold text-ink">{colourSuggestion.name}</span>
                    <span className="ml-2 text-xs font-mono text-ink-muted">{colourSuggestion.hex}</span>
                  </div>
                  <button type="button" onClick={addSuggestedColour} className={ui.small}>
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setColourSuggestion(null)}
                    className={`${ui.iconBtn} hover:bg-white text-ink`}
                    title="Dismiss"
                    aria-label="Dismiss detected colour"
                  >
                    <X className="w-4 h-4 text-current" />
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {colors.map((color, idx) => {
                  const previewHex = color.hex.startsWith('#') ? color.hex : `#${color.hex}`;
                  return (
                    <div key={idx} className="rounded-xl border border-line bg-page p-3 sm:p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 -mt-1 -mr-1">
                        <p className={ui.eyebrow}>Colour {idx + 1}</p>
                        <button
                          type="button"
                          onClick={() => removeColor(idx)}
                          className="h-11 md:h-9 px-3 rounded-[10px] text-[13px] font-semibold text-danger hover:bg-danger-tint transition-colors cursor-pointer"
                          title="Delete Color"
                        >
                          Delete
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                        {/* Preview and Name */}
                        <div className="flex items-end gap-2.5">
                          <label
                            className="relative w-12 h-12 sm:w-11 sm:h-11 shrink-0 rounded-full border-[1.5px] border-control overflow-hidden cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink"
                            title="Click to open color picker"
                          >
                            <input
                              type="color"
                              value={previewHex.length === 7 ? previewHex : '#241D1B'}
                              onChange={(e) => updateColor(idx, 'hex', e.target.value.toUpperCase())}
                              aria-label={`Colour ${idx + 1} swatch`}
                              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                            />
                            <span
                              className="block w-full h-full"
                              style={{ backgroundColor: previewHex || '#e2e8f0' }}
                            />
                          </label>
                          <div className="flex-grow min-w-0">
                            <label htmlFor={`apf-colour-name-${idx}`} className={ui.label}>Color Name</label>
                            <input
                              id={`apf-colour-name-${idx}`}
                              type="text"
                              placeholder="e.g. Royal Blue"
                              value={color.name}
                              onChange={(e) => updateColor(idx, 'name', e.target.value)}
                              className={ui.field}
                            />
                          </div>
                        </div>

                        {/* Hex Code Input */}
                        <div>
                          <label htmlFor={`apf-colour-hex-${idx}`} className={ui.label}>Hex Color Code</label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm font-mono" aria-hidden="true">#</span>
                            <input
                              id={`apf-colour-hex-${idx}`}
                              type="text"
                              placeholder="58152D"
                              value={color.hex.replace('#', '')}
                              onChange={(e) => {
                                const typedVal = e.target.value.trim();
                                const finalHex = typedVal.startsWith('#') ? typedVal : `#${typedVal}`;
                                updateColor(idx, 'hex', finalHex);
                              }}
                              className={`${ui.field} !pl-8 font-mono`}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Sync Product Image */}
                      <div className="pt-3 border-t border-line">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <span className="text-[13px] leading-[18px] font-semibold text-ink">
                            Tap an uploaded image to sync with this color:
                          </span>
                          {color.imageUrl && (
                            <button
                              type="button"
                              onClick={() => detectColourForRow(idx)}
                              disabled={detectingIdx !== null}
                              className={`${ui.small} disabled:cursor-wait`}
                              title="Read this colour from the synced photo"
                            >
                              {detectingIdx === idx ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-current" /> : <Sparkles className="w-3.5 h-3.5 text-current" />}
                              {detectingIdx === idx ? 'Detecting…' : 'Detect'}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {images.map((imgUrl, imgIdx) => {
                            const synced = color.imageUrl === imgUrl;
                            return (
                              <button
                                key={imgIdx}
                                type="button"
                                aria-pressed={synced}
                                onClick={() => {
                                  // If already selected, clicking again toggles/deselects it
                                  if (synced) {
                                    updateColor(idx, 'imageUrl', '');
                                  } else {
                                    updateColor(idx, 'imageUrl', imgUrl);
                                  }
                                }}
                                className="w-12 flex flex-col items-center gap-0.5 cursor-pointer"
                              >
                                <span className={`block w-full aspect-[4/5] rounded-[10px] overflow-hidden border-2 transition-colors ${synced ? 'border-brand' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                                  <img src={imgUrl} className="w-full h-full object-cover object-top bg-sunken" alt={`Product ${imgIdx + 1}`} referrerPolicy="no-referrer" />
                                </span>
                                <span className={`text-[11px] leading-[14px] font-bold ${synced ? 'text-brand' : 'invisible'}`}>Sync</span>
                              </button>
                            );
                          })}
                          {images.length === 0 && (
                            <span className="text-[13px] leading-[18px] text-ink-muted">Please upload product images below first.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Product Imagery */}
        <section className={ui.card}>
          <SectionTitle icon={<ImageIcon className="text-current" />} title="Product Gallery" hint="The first photo is the cover. Portrait (4:5) photos look best." />

          <div className="space-y-4">
            {/* Upload Area */}
            <label className="w-full flex flex-col items-center justify-center gap-1.5 px-4 py-8 rounded-xl border-[1.5px] border-dashed border-control bg-page hover:bg-sunken text-center cursor-pointer transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
              <span className="w-11 h-11 mb-1 rounded-xl bg-white border border-line text-ink flex items-center justify-center" aria-hidden="true">
                <ImageIcon className="w-5 h-5 text-current" />
              </span>
              <span className="text-[15px] leading-[22px] font-semibold text-ink">Upload product photos</span>
              <span className="text-[13px] leading-[18px] text-ink-muted">Tap to choose photos · the first photo is the cover · portrait (4:5) looks best</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="sr-only"
              />
            </label>

            {/* Gallery Grid Preview */}
            {images.length > 0 && (
              <div className="grid grid-cols-3 min-[480px]:grid-cols-4 sm:grid-cols-5 gap-2.5">
                {images.map((imgUrl, idx) => (
                  <div key={idx} className="min-w-0">
                    {imgUrl && imgUrl.trim() !== "" ? (
                      <img src={imgUrl} alt={`Product preview ${idx + 1}`} className="w-full aspect-[4/5] rounded-xl object-cover object-top bg-sunken" />
                    ) : (
                      <div className="w-full aspect-[4/5] rounded-xl bg-sunken" />
                    )}
                    <div className="mt-1 flex items-center justify-between gap-1">
                      {/* Image Badge */}
                      <span className={`${ui.badge} ${idx === 0 ? tone.brand : tone.muted}`}>
                        {idx === 0 ? 'Cover' : `Photo ${idx + 1}`}
                      </span>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRemoveImage(idx);
                        }}
                        className="w-10 h-10 shrink-0 rounded-full hover:bg-danger-tint text-danger flex items-center justify-center cursor-pointer"
                        title="Remove image"
                        aria-label={`Remove photo ${idx + 1}`}
                      >
                        <X className="w-4 h-4 text-current" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Sizes, Colors & Fabric Specs */}
        <section className={ui.card}>
          <SectionTitle icon={<Layers className="text-current" />} title="Sizes, Colors & Fabric Specifications" />

          {/* Sizes Selection */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p id="apf-sizes-label" className={`${ui.label} !mb-0`}>Available Sizes *</p>
              <button
                type="button"
                onClick={() => setSelectedSizes(sortSizes([...RANGE_SIZES, ...selectedSizes.filter((s) => s === 'XS')]))}
                className={ui.small}
              >
                Select S – 5XL
              </button>
            </div>
            <div role="group" aria-labelledby="apf-sizes-label" className="flex flex-wrap gap-2">
              {sizeOptions.map((sz) => {
                const isSelected = selectedSizes.includes(sz);
                return (
                  <button
                    type="button"
                    key={sz}
                    aria-pressed={isSelected}
                    onClick={() => toggleSize(sz)}
                    className={`${ui.chip(isSelected)} min-w-12 sag-num`}
                  >
                    {sz} {isSelected && <Check className="w-3.5 h-3.5 text-current" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <p className={ui.hint}>
              Choosing Free Size replaces the other sizes.
            </p>
          </div>

          {/* Specifications */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 mt-4 border-t border-line">
            <div>
              <label htmlFor="apf-fabric" className={ui.label}>Fabric Material</label>
              <input
                id="apf-fabric"
                type="text"
                value={fabric}
                onChange={(e) => setFabric(e.target.value)}
                placeholder="e.g. 100% Pure Cambric Cotton with Chiffon Dupatta"
                className={ui.field}
              />
            </div>

            <div>
              <label htmlFor="apf-fit" className={ui.label}>Fit & Silhouette</label>
              <input
                id="apf-fit"
                type="text"
                value={fit}
                onChange={(e) => setFit(e.target.value)}
                placeholder="e.g. Regular Straight Cut Anarkali"
                className={ui.field}
              />
            </div>

            <div>
              <label htmlFor="apf-occasion" className={ui.label}>Occasion</label>
              <input
                id="apf-occasion"
                type="text"
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                placeholder="e.g. Festive, Wedding, Office, Daily Wear"
                className={ui.field}
              />
            </div>

            <div>
              <label htmlFor="apf-wash-care" className={ui.label}>Wash & Care Instructions</label>
              <input
                id="apf-wash-care"
                type="text"
                value={washCare}
                onChange={(e) => setWashCare(e.target.value)}
                placeholder="e.g. Gentle Hand Wash / Dry Clean for First Wash"
                className={ui.field}
              />
            </div>
          </div>
        </section>

        {/* Section 5: Storefront Badges & Visibility */}
        <section className={ui.card}>
          <SectionTitle icon={<Sparkles className="text-current" />} title="Merchandising Badges & Visibility" />

          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {flagToggles.map((flag) => (
              <label key={flag.id} className="flex items-center justify-between gap-3 min-h-[52px] px-3.5 py-2.5 rounded-xl border border-line bg-white cursor-pointer text-sm font-semibold text-ink transition-colors has-[:checked]:border-brand has-[:checked]:bg-brand-wash">
                <input
                  id={flag.id}
                  type="checkbox"
                  checked={flag.checked}
                  onChange={(e) => flag.onChange(e.target.checked)}
                  className="peer sr-only"
                />
                <span className={SWITCH_TRACK} aria-hidden="true" />
                <span className="order-first">{flag.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Section 6: SEO (optional, collapsible) */}
        <details className={`group ${ui.card}`} open={Boolean(seoTitle || seoDescription || searchKeywords)}>
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2 min-h-11 -my-1">
            <span className={ui.h2}>SEO &amp; search (optional)</span>
            <span className="h-9 px-3 rounded-[10px] border-[1.5px] border-control inline-flex items-center text-[13px] font-semibold text-ink group-open:hidden">Show</span>
            <span className="h-9 px-3 rounded-[10px] border-[1.5px] border-control items-center text-[13px] font-semibold text-ink hidden group-open:inline-flex">Hide</span>
          </summary>
          <div className="mt-4 pt-4 border-t border-line grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="apf-seo-title" className={ui.label}>Page title</label>
              <input
                id="apf-seo-title"
                type="text"
                maxLength={120}
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                placeholder={name ? `${name} | Suit Aura Girls` : 'Used as the browser / Google title'}
                className={ui.field}
              />
              <p className={`${ui.hint} sag-num`}>{seoTitle.trim().length}/60 recommended characters. Empty = product name.</p>
            </div>
            <div>
              <label htmlFor="apf-seo-description" className={ui.label}>Meta description</label>
              <textarea
                id="apf-seo-description"
                rows={2}
                maxLength={320}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                placeholder="Short summary shown under the title in search results"
                className={ui.textarea}
              />
              <p className={`${ui.hint} sag-num`}>{seoDescription.trim().length}/160 characters are shown. Empty = product description.</p>
            </div>
            <div>
              <label htmlFor="apf-search-keywords" className={ui.label}>Search keywords</label>
              <input
                id="apf-search-keywords"
                type="text"
                maxLength={300}
                value={searchKeywords}
                onChange={(e) => setSearchKeywords(e.target.value)}
                placeholder="e.g. chikankari, lucknowi, office wear"
                className={ui.field}
              />
              <p className={ui.hint}>Comma separated. Shoppers searching these words on the store will find this product.</p>
            </div>
          </div>
        </details>

        {/* Bottom Save/Cancel Actions */}
        <div className="sticky bottom-0 z-20 -mx-4 sm:mx-0 flex items-center gap-3 sm:justify-end px-4 sm:px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:py-3 bg-white border-t sm:border border-line sm:rounded-2xl shadow-[var(--sag-shadow-bar)]">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleCancel}
            className={ui.outline}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={`${ui.primary} flex-1 sm:flex-none`}
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin text-current" />
            ) : (
              <Save className="w-4 h-4 text-current" />
            )}
            <span>{isSaving ? 'Saving changes...' : (isEditMode ? 'Update product' : 'Publish product')}</span>
          </button>
        </div>

      </form>

    </div>
  );
};
