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
  Tag,
  Info,
  DollarSign,
  Package,
  RefreshCw
} from 'lucide-react';
import { Product, ProductCategory, ProductSize, ProductColor } from '../../types';
import { ACCESSORY_CATEGORY, FOOTWEAR_SIZES, SET_TYPES, isAccessory, setTypeHint } from '../../utils/looks';
import { KIDS_CATEGORIES, TOYS, departmentOf } from '../../utils/kids';
import { AiProductFill, type AiDraft } from './AiProductFill';

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
      <div id="admin-product-form-page" className="space-y-6 pb-12">
        <div className="flex items-center gap-3.5 bg-white p-5 sm:p-6 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)]">
          <button
            type="button"
            onClick={() => navigate('/admin/products')}
            className="w-11 h-11 shrink-0 flex items-center justify-center bg-[#F3EEF8] hover:bg-[#E6DDF0] text-[#4B1D3F] rounded-full transition-colors cursor-pointer"
            title="Back to Products"
            aria-label="Back to Products"
          >
            <ArrowLeft className="w-5 h-5 text-current" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#9C7A45]">
              <span>Catalog</span>
              <span>/</span>
              <span>Accessory</span>
            </div>
            <h2 className="font-serif text-[26px] sm:text-3xl leading-tight font-semibold text-[#2A1A26] break-words">{existingProduct.name}</h2>
          </div>
        </div>

        <div id="admin-accessory-notice" role="status" className="rounded-3xl border border-[#4B1D3F]/10 bg-[#F3EEF8] p-5 sm:p-7 space-y-4">
          <p className="font-serif text-xl font-semibold text-[#4B1D3F]">This is a Complete the Look accessory — edit it in Complete the Look</p>
          <p className="text-sm text-[#2A1A26]/75">
            Accessories are shown only on combo product pages, inside "Complete the look", and customers buy them only together with that outfit.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => openAdminTab('looks')}
              className="h-11 px-5 rounded-full bg-[#4B1D3F] hover:bg-[#3B1532] text-white text-sm font-semibold transition cursor-pointer"
            >
              Open Complete the Look
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/products')}
              className="h-11 px-5 rounded-full border border-[#4B1D3F]/25 bg-white text-sm font-semibold text-[#4B1D3F] hover:bg-[#E6DDF0] transition cursor-pointer"
            >
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
      <div id="admin-product-form-page" className="space-y-6 pb-12">
        <div className="flex items-center gap-3.5 bg-white p-5 sm:p-6 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)]">
          <button
            type="button"
            onClick={() => navigate('/admin/products')}
            className="w-11 h-11 shrink-0 flex items-center justify-center bg-[#F3EEF8] hover:bg-[#E6DDF0] text-[#4B1D3F] rounded-full transition-colors cursor-pointer"
            title="Back to Products"
            aria-label="Back to Products"
          >
            <ArrowLeft className="w-5 h-5 text-current" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#9C7A45]">
              <span>Catalog</span>
              <span>/</span>
              <span>{isToyItem ? 'Toy' : 'Kids wear'}</span>
            </div>
            <h2 className="font-serif text-[26px] sm:text-3xl leading-tight font-semibold text-[#2A1A26] break-words">{existingProduct.name}</h2>
          </div>
        </div>

        <div id="admin-kids-toys-notice" role="status" className="rounded-3xl border border-[#4B1D3F]/10 bg-[#F3EEF8] p-5 sm:p-7 space-y-4">
          <p className="font-serif text-xl font-semibold text-[#4B1D3F]">
            {isToyItem ? 'This is a toy — edit it in Toys' : 'This is kids wear — edit it in Kids Wear'}
          </p>
          <p className="text-sm text-[#2A1A26]/75">
            {isToyItem
              ? 'Toys have their own section, with the kind of toy and a suitable age, and are sold as one piece. This women\'s product form is not used for them.'
              : 'Kids wear has its own section for Baby Girls and Baby Boys, with sizes by age (1-2 Y to 14-15 Y). This women\'s product form is not used for it.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => openAdminTab(isToyItem ? 'toys' : 'kids')}
              className="h-11 px-5 rounded-full bg-[#4B1D3F] hover:bg-[#3B1532] text-white text-sm font-semibold transition cursor-pointer"
            >
              Open {sectionName}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/products')}
              className="h-11 px-5 rounded-full border border-[#4B1D3F]/25 bg-white text-sm font-semibold text-[#4B1D3F] hover:bg-[#E6DDF0] transition cursor-pointer"
            >
              Back to Products
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="admin-product-form-page" className="space-y-6 pb-12">

      {/* Top Header & Breadcrumb */}
      <div className="relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)]">
        <span className="pointer-events-none absolute -right-10 -top-12 w-40 h-40 rounded-full bg-[#F3EEF8]" aria-hidden="true" />
        <div className="relative flex items-start gap-3.5 min-w-0">
          <button
            type="button"
            onClick={handleCancel}
            className="w-11 h-11 shrink-0 flex items-center justify-center bg-[#F3EEF8] hover:bg-[#E6DDF0] text-[#4B1D3F] rounded-full transition-colors cursor-pointer"
            title="Back to Products"
            aria-label="Back to Products"
          >
            <ArrowLeft className="w-5 h-5 text-current" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9C7A45]">
              <span>Catalog</span>
              <span aria-hidden="true">/</span>
              <span>{isEditMode ? 'Edit product' : 'New product'}</span>
            </div>
            <h2 className="mt-0.5 font-serif text-[26px] sm:text-3xl leading-tight font-semibold text-[#2A1A26] break-words">
              {isEditMode ? (existingProduct?.name || 'Edit product') : 'Add a new product'}
            </h2>
            <p className="mt-1 text-sm text-[#2A1A26]/65">{isEditMode ? 'Changes go live on the store as soon as you save.' : "A women's outfit for the store. Kids wear, toys and accessories have their own sections."}</p>
          </div>
        </div>

        <div className="relative flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleCancel}
            className="h-11 px-5 border border-[#4B1D3F]/20 bg-white hover:bg-[#F3EEF8] text-[#4B1D3F] rounded-full text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="product-edit-form"
            disabled={isSaving}
            className="h-11 px-5 bg-[#4B1D3F] hover:bg-[#3B1532] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full text-sm font-semibold transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin text-current" />
            ) : (
              <Save className="w-4 h-4 text-current" />
            )}
            <span>{isSaving ? 'Saving...' : 'Save product'}</span>
          </button>
        </div>
      </div>

      <form id="product-edit-form" onSubmit={handleSave} className="space-y-6">

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
        <div className="bg-white p-5 sm:p-7 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-5">
          <h3 className="font-serif text-xl font-semibold text-[#2A1A26] pb-3 border-b border-[#4B1D3F]/10 flex items-center gap-3">
            <Package className="w-9 h-9 p-2 rounded-xl bg-[#F3EEF8] text-[#4B1D3F] shrink-0" aria-hidden="true" />
            Basic Product Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Product Name <span className="text-[#8A2E55]">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Gulab Handblock Pure Cotton Anarkali Set"
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26] font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Category <span className="text-[#8A2E55]">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26] cursor-pointer"
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Subcategory / Collection Tag
              </label>
              <input
                type="text"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="e.g. Cambric Cotton Suit Sets"
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="apf-set-type" className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Set / combo type
              </label>
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
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26] cursor-pointer"
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
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
                  />
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-[#2A1A26]/60">
                "Complete the look" (bags, heels, jewellery... from Complete the Look in the menu) shows only on the pages of products with a set / combo type.
              </p>
              {!setType.trim() && !customSetType && nameHint.looksLikeSet && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-[#F3EEF8] px-3 py-2.5 text-xs text-[#4B1D3F]">
                  <span>This name looks like a set. Choose its set / combo type so accessories show on its page.</span>
                  {nameHint.suggestion && (
                    <button
                      type="button"
                      onClick={() => setSetType(nameHint.suggestion)}
                      className="h-8 px-3 rounded-full bg-[#4B1D3F] text-white font-bold hover:bg-[#3B1532] transition cursor-pointer"
                    >
                      Mark as "{nameHint.suggestion}"
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                SKU (Stock Keeping Unit)
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. SAG-COT-9901"
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26] font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Inventory Stock Quantity
              </label>
              <input
                type="number"
                min="0"
                value={stockQuantity}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setStockQuantity(val);
                  if (val === 0) setInStock(false);
                  else setInStock(true);
                }}
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Low-stock alert at (pieces)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={lowStockOverride}
                onChange={(e) => setLowStockOverride(e.target.value)}
                placeholder="Store default"
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
              />
              <p className="mt-1 text-[11px] text-[#2A1A26]/60">Optional. Leave empty to use the store setting in Products.</p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Product Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write full product craftsmanship, silhouette, and drape details..."
                className="w-full px-4 py-3 border border-[#4B1D3F]/15 rounded-2xl text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Pricing & Discount */}
        <div className="bg-white p-5 sm:p-7 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-5">
          <h3 className="font-serif text-xl font-semibold text-[#2A1A26] pb-3 border-b border-[#4B1D3F]/10 flex items-center gap-3">
            <DollarSign className="w-9 h-9 p-2 rounded-xl bg-[#F3EEF8] text-[#4B1D3F] shrink-0" aria-hidden="true" />
            Pricing & Currency (₹ INR)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Selling Price (₹) <span className="text-[#8A2E55]">*</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={price}
                onChange={(e) => handlePriceChange(Number(e.target.value))}
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26] font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                MRP / Original Price (₹)
              </label>
              <input
                type="number"
                min="1"
                value={originalPrice}
                onChange={(e) => handleOriginalPriceChange(Number(e.target.value))}
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Discount Calculated (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-full h-11 pl-4 pr-16 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-[#F3EEF8] text-[#2A1A26] font-semibold focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-2.5 rounded-full bg-[#F7E4EA] inline-flex items-center text-[11px] font-bold text-[#8A2E55]">% OFF</span>
              </div>
            </div>

            {/* Colors Selection */}
            <div className="pt-6 border-t border-[#4B1D3F]/10 sm:col-span-3">
              <div className="flex justify-between items-center mb-3">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70">
                  Available Colors & Sync Image <span className="text-[#8A2E55]">*</span>
                </label>
                <button
                  type="button"
                  onClick={addColor}
                  className="h-9 px-4 text-sm bg-white border border-[#4B1D3F]/20 text-[#4B1D3F] rounded-full hover:bg-[#F3EEF8] font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  + Add colour
                </button>
              </div>

              {colourSuggestion && (
                <div className="mb-4 flex flex-wrap items-center gap-3 p-3 bg-[#F3EEF8] border border-[#4B1D3F]/10 rounded-2xl">
                  <span
                    className="w-9 h-9 rounded-full border-2 border-white shadow-md ring-1 ring-[#4B1D3F]/20 shrink-0"
                    style={{ backgroundColor: colourSuggestion.hex }}
                    aria-hidden="true"
                  />
                  {colourSuggestion.imageUrl && (
                    <img src={colourSuggestion.imageUrl} alt="" className="w-7 h-9 rounded-md object-cover object-top border border-[#4B1D3F]/15" referrerPolicy="no-referrer" />
                  )}
                  <div className="min-w-0 grow">
                    <span className="block text-[11px] uppercase font-bold tracking-wider text-[#2A1A26]/60">Detected colour</span>
                    <span className="text-sm font-semibold text-[#2A1A26]">{colourSuggestion.name}</span>
                    <span className="ml-2 text-xs font-mono text-[#2A1A26]/60">{colourSuggestion.hex}</span>
                  </div>
                  <button
                    type="button"
                    onClick={addSuggestedColour}
                    className="h-9 px-4 text-sm bg-[#4B1D3F] text-white rounded-full hover:bg-[#3B1532] font-semibold transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setColourSuggestion(null)}
                    className="w-9 h-9 flex items-center justify-center text-[#4B1D3F] hover:bg-white rounded-full transition-colors cursor-pointer"
                    title="Dismiss"
                    aria-label="Dismiss detected colour"
                  >
                    <X className="w-4 h-4 text-current" />
                  </button>
                </div>
              )}

              <div className="space-y-4">
                {colors.map((color, idx) => {
                  const previewHex = color.hex.startsWith('#') ? color.hex : `#${color.hex}`;
                  return (
                    <div key={idx} className="p-4 bg-[#FBF7F3] border border-[#4B1D3F]/10 rounded-2xl space-y-3 relative">
                      <button
                        type="button"
                        onClick={() => removeColor(idx)}
                        className="absolute top-3 right-3 h-8 px-3 rounded-full text-rose-700 hover:bg-rose-50 font-semibold text-xs transition-colors cursor-pointer"
                        title="Delete Color"
                      >
                        Delete
                      </button>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        {/* Preview and Name */}
                        <div className="md:col-span-6 flex items-center gap-3">
                          <label
                            className="relative w-10 h-10 rounded-full border-2 border-white shadow-md flex-shrink-0 cursor-pointer overflow-hidden transition-all duration-200 hover:scale-105 ring-1 ring-[#4B1D3F]/20"
                            title="Click to open color picker"
                          >
                            <input
                              type="color"
                              value={previewHex.length === 7 ? previewHex : '#241D1B'}
                              onChange={(e) => updateColor(idx, 'hex', e.target.value.toUpperCase())}
                              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                            />
                            <div
                              className="w-full h-full rounded-full"
                              style={{ backgroundColor: previewHex || '#e2e8f0' }}
                            />
                          </label>
                          <div className="flex-grow space-y-1">
                            <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[#2A1A26]/60 block">Color Name</span>
                            <input
                              type="text"
                              placeholder="e.g. Royal Blue"
                              value={color.name}
                              onChange={(e) => updateColor(idx, 'name', e.target.value)}
                              className="w-full h-10 px-4 text-base sm:text-sm bg-white border border-[#4B1D3F]/15 rounded-full focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                            />
                          </div>
                        </div>

                        {/* Hex Code Input */}
                        <div className="md:col-span-6 space-y-1">
                          <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[#2A1A26]/60 block">Hex Color Code</span>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2A1A26]/50 text-sm font-mono">#</span>
                            <input
                              type="text"
                              placeholder="58152D"
                              value={color.hex.replace('#', '')}
                              onChange={(e) => {
                                const typedVal = e.target.value.trim();
                                const finalHex = typedVal.startsWith('#') ? typedVal : `#${typedVal}`;
                                updateColor(idx, 'hex', finalHex);
                              }}
                              className="w-full h-10 pl-8 pr-4 text-base sm:text-sm bg-white border border-[#4B1D3F]/15 rounded-full font-mono focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Sync Product Image */}
                      <div className="pt-2 border-t border-[#4B1D3F]/10">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[#2A1A26]/60 block">
                            Tap an uploaded image to sync with this color:
                          </span>
                          {color.imageUrl && (
                            <button
                              type="button"
                              onClick={() => detectColourForRow(idx)}
                              disabled={detectingIdx !== null}
                              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-[#2A1A26]/80 bg-white border border-[#4B1D3F]/15 rounded-full hover:border-[#4B1D3F] transition disabled:opacity-50 disabled:cursor-wait"
                              title="Read this colour from the synced photo"
                            >
                              {detectingIdx === idx ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-current" /> : <Sparkles className="w-3.5 h-3.5 text-current" />}
                              {detectingIdx === idx ? 'Detecting…' : 'Detect'}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {images.map((imgUrl, imgIdx) => (
                            <button
                              key={imgIdx}
                              type="button"
                              onClick={() => {
                                // If already selected, clicking again toggles/deselects it
                                if (color.imageUrl === imgUrl) {
                                  updateColor(idx, 'imageUrl', '');
                                } else {
                                  updateColor(idx, 'imageUrl', imgUrl);
                                }
                              }}
                              className={`relative w-12 h-15 rounded-lg overflow-hidden border-2 transition cursor-pointer ${
                                color.imageUrl === imgUrl
                                  ? 'border-[#4B1D3F] ring-2 ring-[#4B1D3F]/10 shadow-sm scale-105 opacity-100'
                                  : 'border-transparent hover:border-[#4B1D3F]/20 opacity-60 hover:opacity-100'
                              }`}
                            >
                              <img src={imgUrl} className="w-full h-full object-cover object-top" alt={`Product ${imgIdx + 1}`} referrerPolicy="no-referrer" />
                              {color.imageUrl === imgUrl && (
                                <div className="absolute inset-0 bg-[#4B1D3F]/10 flex items-center justify-center">
                                  <span className="text-[11px] font-bold text-white bg-[#4B1D3F] px-1 py-0.5 rounded shadow-sm">Sync</span>
                                </div>
                              )}
                            </button>
                          ))}
                          {images.length === 0 && (
                            <span className="text-xs text-[#2A1A26]/50 italic">Please upload product images below first.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Product Imagery */}
        <div className="bg-white p-5 sm:p-7 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-5">
          <h3 className="font-serif text-xl font-semibold text-[#2A1A26] pb-3 border-b border-[#4B1D3F]/10 flex items-center gap-3">
            <ImageIcon className="w-9 h-9 p-2 rounded-xl bg-[#F3EEF8] text-[#4B1D3F] shrink-0" aria-hidden="true" />
            Product Gallery
          </h3>

          <div className="space-y-6">
            {/* Upload Area */}
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-[#4B1D3F]/20 rounded-3xl bg-[#FBF7F3] hover:border-[#4B1D3F]/45 hover:bg-[#F3EEF8] transition-colors cursor-pointer group">
              <label className="w-full flex flex-col items-center gap-2.5 px-6 py-10 cursor-pointer text-center">
                <div className="w-14 h-14 rounded-2xl bg-white border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] flex items-center justify-center text-[#4B1D3F] group-hover:scale-105 transition-transform">
                  <ImageIcon className="w-6 h-6 text-current" />
                </div>
                <span className="font-serif text-lg font-semibold text-[#2A1A26]">Upload product photos</span>
                <span className="text-xs text-[#2A1A26]/60">Tap to choose photos · the first photo is the cover · portrait (4:5) looks best</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="sr-only"
                />
              </label>
            </div>

            {/* Gallery Grid Preview */}
            <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {images.map((imgUrl, idx) => (
                <div key={idx} className="min-w-0">
                  <div className="rounded-2xl overflow-hidden border border-[#4B1D3F]/10 aspect-[4/5] bg-[#F3EEF8]">
                  {imgUrl && imgUrl.trim() !== "" ? (
                    <img src={imgUrl} alt={`Product preview ${idx + 1}`} className="w-full h-full object-cover object-top" />
                  ) : (
                    <div className="w-full h-full bg-[#F3EEF8]" />
                  )}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                  {/* Image Badge */}
                  <span className={`h-6 px-2.5 rounded-full inline-flex items-center text-[11px] font-semibold ${idx === 0 ? 'bg-[#4B1D3F] text-white' : 'bg-[#F3EEF8] text-[#4B1D3F]'}`}>
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
                    className="w-8 h-8 flex items-center justify-center text-rose-700 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
                    title="Remove image"
                    aria-label={`Remove photo ${idx + 1}`}
                  >
                    <X className="w-4 h-4 text-current" />
                  </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section 4: Sizes, Colors & Fabric Specs */}
        <div className="bg-white p-5 sm:p-7 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-6">
          <h3 className="font-serif text-xl font-semibold text-[#2A1A26] pb-3 border-b border-[#4B1D3F]/10 flex items-center gap-3">
            <Layers className="w-9 h-9 p-2 rounded-xl bg-[#F3EEF8] text-[#4B1D3F] shrink-0" aria-hidden="true" />
            Sizes, Colors & Fabric Specifications
          </h3>

          {/* Sizes Selection */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70">
                Available Sizes <span className="text-[#8A2E55]">*</span>
              </label>
              <button
                type="button"
                onClick={() => setSelectedSizes(sortSizes([...RANGE_SIZES, ...selectedSizes.filter((s) => s === 'XS')]))}
                className="h-8 px-3 text-xs font-semibold text-[#4B1D3F] border border-[#4B1D3F]/20 bg-white rounded-full hover:bg-[#F3EEF8] transition-colors cursor-pointer"
              >
                Select S – 5XL
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {sizeOptions.map((sz) => {
                const isSelected = selectedSizes.includes(sz);
                return (
                  <button
                    type="button"
                    key={sz}
                    onClick={() => toggleSize(sz)}
                    className={`h-10 min-w-12 px-4 rounded-full text-sm font-semibold border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#4B1D3F] text-white border-[#4B1D3F] shadow-[var(--sag-shadow)]'
                        : 'bg-white text-[#2A1A26]/80 border-[#4B1D3F]/15 hover:border-[#4B1D3F]/40'
                    }`}
                  >
                    {sz} {isSelected && '✓'}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-[#2A1A26]/60">
              Choosing Free Size replaces the other sizes.
            </p>
          </div>



          {/* Specifications */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-5 border-t border-[#4B1D3F]/10">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Fabric Material
              </label>
              <input
                type="text"
                value={fabric}
                onChange={(e) => setFabric(e.target.value)}
                placeholder="e.g. 100% Pure Cambric Cotton with Chiffon Dupatta"
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Fit & Silhouette
              </label>
              <input
                type="text"
                value={fit}
                onChange={(e) => setFit(e.target.value)}
                placeholder="e.g. Regular Straight Cut Anarkali"
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Occasion
              </label>
              <input
                type="text"
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                placeholder="e.g. Festive, Wedding, Office, Daily Wear"
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">
                Wash & Care Instructions
              </label>
              <input
                type="text"
                value={washCare}
                onChange={(e) => setWashCare(e.target.value)}
                placeholder="e.g. Gentle Hand Wash / Dry Clean for First Wash"
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
              />
            </div>
          </div>
        </div>

        {/* Section 5: Storefront Badges & Visibility */}
        <div className="bg-white p-5 sm:p-7 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-4">
          <h3 className="font-serif text-xl font-semibold text-[#2A1A26] pb-3 border-b border-[#4B1D3F]/10 flex items-center gap-3">
            <Sparkles className="w-9 h-9 p-2 rounded-xl bg-[#F3EEF8] text-[#4B1D3F] shrink-0" aria-hidden="true" />
            Merchandising Badges & Visibility
          </h3>

          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] cursor-pointer hover:bg-[#F3EEF8] transition-colors has-[:checked]:border-[#4B1D3F]/25 has-[:checked]:bg-[#F3EEF8]">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="peer sr-only"
              />
              <span className="relative shrink-0 w-11 h-6 rounded-full bg-[#E6DDF0] peer-checked:bg-[#4B1D3F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#4B1D3F]/30 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
              <span className="order-first text-sm font-semibold text-[#2A1A26]">Featured Product</span>
            </label>

            <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] cursor-pointer hover:bg-[#F3EEF8] transition-colors has-[:checked]:border-[#4B1D3F]/25 has-[:checked]:bg-[#F3EEF8]">
              <input
                type="checkbox"
                checked={isNewArrival}
                onChange={(e) => setIsNewArrival(e.target.checked)}
                className="peer sr-only"
              />
              <span className="relative shrink-0 w-11 h-6 rounded-full bg-[#E6DDF0] peer-checked:bg-[#4B1D3F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#4B1D3F]/30 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
              <span className="order-first text-sm font-semibold text-[#2A1A26]">New Arrival</span>
            </label>

            <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] cursor-pointer hover:bg-[#F3EEF8] transition-colors has-[:checked]:border-[#4B1D3F]/25 has-[:checked]:bg-[#F3EEF8]">
              <input
                type="checkbox"
                checked={isBestSeller}
                onChange={(e) => setIsBestSeller(e.target.checked)}
                className="peer sr-only"
              />
              <span className="relative shrink-0 w-11 h-6 rounded-full bg-[#E6DDF0] peer-checked:bg-[#4B1D3F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#4B1D3F]/30 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
              <span className="order-first text-sm font-semibold text-[#2A1A26]">Best Seller</span>
            </label>

            <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] cursor-pointer hover:bg-[#F3EEF8] transition-colors has-[:checked]:border-[#4B1D3F]/25 has-[:checked]:bg-[#F3EEF8]">
              <input
                type="checkbox"
                checked={isSale}
                onChange={(e) => setIsSale(e.target.checked)}
                className="peer sr-only"
              />
              <span className="relative shrink-0 w-11 h-6 rounded-full bg-[#E6DDF0] peer-checked:bg-[#4B1D3F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#4B1D3F]/30 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
              <span className="order-first text-sm font-semibold text-rose-700">Sale Item</span>
            </label>

            <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] cursor-pointer hover:bg-[#F3EEF8] transition-colors has-[:checked]:border-[#4B1D3F]/25 has-[:checked]:bg-[#F3EEF8]">
              <input
                type="checkbox"
                checked={isTrending}
                onChange={(e) => setIsTrending(e.target.checked)}
                className="peer sr-only"
              />
              <span className="relative shrink-0 w-11 h-6 rounded-full bg-[#E6DDF0] peer-checked:bg-[#4B1D3F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#4B1D3F]/30 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
              <span className="order-first text-sm font-semibold text-[#2A1A26]">Trending Now</span>
            </label>

            <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] cursor-pointer hover:bg-[#F3EEF8] transition-colors has-[:checked]:border-[#4B1D3F]/25 has-[:checked]:bg-[#F3EEF8]">
              <input
                type="checkbox"
                checked={isFestive}
                onChange={(e) => setIsFestive(e.target.checked)}
                className="peer sr-only"
              />
              <span className="relative shrink-0 w-11 h-6 rounded-full bg-[#E6DDF0] peer-checked:bg-[#4B1D3F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#4B1D3F]/30 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
              <span className="order-first text-sm font-semibold text-[#2A1A26]">Festive Edit</span>
            </label>

            <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] cursor-pointer hover:bg-[#F3EEF8] transition-colors has-[:checked]:border-[#4B1D3F]/25 has-[:checked]:bg-[#F3EEF8]">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="peer sr-only"
              />
              <span className="relative shrink-0 w-11 h-6 rounded-full bg-[#E6DDF0] peer-checked:bg-[#4B1D3F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#4B1D3F]/30 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
              <span className="order-first text-sm font-semibold text-emerald-800">Published on store</span>
            </label>
          </div>
        </div>

        {/* Section 6: SEO (optional, collapsible) */}
        <details className="group bg-white p-5 sm:p-7 rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)]" open={Boolean(seoTitle || seoDescription || searchKeywords)}>
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2 font-serif text-xl font-semibold text-[#2A1A26]">
            <span>SEO &amp; search (optional)</span>
            <span className="h-8 px-3.5 rounded-full border border-[#4B1D3F]/20 inline-flex items-center text-xs font-sans font-semibold text-[#4B1D3F] group-open:hidden">Show</span>
            <span className="h-8 px-3.5 rounded-full border border-[#4B1D3F]/20 items-center text-xs font-sans font-semibold text-[#4B1D3F] hidden group-open:inline-flex">Hide</span>
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">Page title</label>
              <input
                type="text"
                maxLength={120}
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                placeholder={name ? `${name} | Suit Aura Girls` : 'Used as the browser / Google title'}
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
              />
              <p className="mt-1 text-[11px] text-[#2A1A26]/60">{seoTitle.trim().length}/60 recommended characters. Empty = product name.</p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">Meta description</label>
              <textarea
                rows={2}
                maxLength={320}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                placeholder="Short summary shown under the title in search results"
                className="w-full px-4 py-3 border border-[#4B1D3F]/15 rounded-2xl text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
              />
              <p className="mt-1 text-[11px] text-[#2A1A26]/60">{seoDescription.trim().length}/160 characters are shown. Empty = product description.</p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1">Search keywords</label>
              <input
                type="text"
                maxLength={300}
                value={searchKeywords}
                onChange={(e) => setSearchKeywords(e.target.value)}
                placeholder="e.g. chikankari, lucknowi, office wear"
                className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26]"
              />
              <p className="mt-1 text-[11px] text-[#2A1A26]/60">Comma separated. Shoppers searching these words on the store will find this product.</p>
            </div>
          </div>
        </details>

        {/* Bottom Save/Cancel Actions */}
        <div className="sticky bottom-3 z-20 flex items-center justify-end gap-2.5 p-2 sm:p-2.5 rounded-full bg-white/95 border border-[#4B1D3F]/10 shadow-[0_8px_30px_-12px_rgba(42,26,38,0.25)]">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleCancel}
            className="h-11 px-5 border border-[#4B1D3F]/20 bg-white hover:bg-[#F3EEF8] text-[#4B1D3F] rounded-full text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="h-11 px-6 bg-[#4B1D3F] hover:bg-[#3B1532] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer"
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
