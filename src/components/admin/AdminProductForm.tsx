import React, { useState, useEffect } from 'react';
import { deleteImages, uploadImage } from '../../lib/dataStore';
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

const ALL_SIZES: ProductSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const PRESET_COLORS: ProductColor[] = [
  { name: 'Burgundy / Maroon', hex: '#241D1B' },
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
  const { products = [], addProduct, updateProduct } = useAdmin();
  const { showToast } = useShop();
  const { navigate } = useRouter();

  const isEditMode = !!productId;
  const existingProduct = isEditMode ? products.find((p) => p.id === productId) : null;

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ProductCategory>('Suits');
  const [subcategory, setSubcategory] = useState('Cambric Cotton Suit Sets');
  const [description, setDescription] = useState('Crafted with premium artisanal fabric and exquisite hand-finishing for enduring grace.');
  const [price, setPrice] = useState<number>(999);
  const [originalPrice, setOriginalPrice] = useState<number>(1599);
  const [discount, setDiscount] = useState<number>(38);
  const [sku, setSku] = useState(`SAG-COT-${Math.floor(1000 + Math.random() * 9000)}`);
  const [stockQuantity, setStockQuantity] = useState<number>(35);
  const [fabric, setFabric] = useState('100% Pure Cambric Cotton with Kota Doria Dupatta');
  const [fit, setFit] = useState('Relaxed Regular Straight Fit');
  const [occasion, setOccasion] = useState('Everyday Workwear, Festive Get-togethers');
  const [washCare, setWashCare] = useState('Gentle Machine Wash in Cold Water or Hand Wash Separately');
  
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

  const addColor = () => setColors([...colors, { name: 'New Color', hex: '#241D1B' }]);
  const removeColor = (idx: number) => setColors(colors.filter((_, i) => i !== idx));
  const updateColor = (idx: number, field: keyof ProductColor, value: string) => {
    setColors(colors.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  // Flags
  const [isFeatured, setIsFeatured] = useState<boolean>(true);
  const [isNewArrival, setIsNewArrival] = useState<boolean>(true);
  const [isBestSeller, setIsBestSeller] = useState<boolean>(false);
  const [isSale, setIsSale] = useState<boolean>(false);
  const [isTrending, setIsTrending] = useState<boolean>(false);
  const [isFestive, setIsFestive] = useState<boolean>(false);
  const [inStock, setInStock] = useState<boolean>(true);
  const [videoUrl, setVideoUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load existing data if edit mode
  useEffect(() => {
    if (existingProduct) {
      setName(existingProduct.name);
      setCategory(existingProduct.category);
      setSubcategory(existingProduct.subcategory || 'Signature Collection');
      setDescription(existingProduct.description);
      setPrice(existingProduct.price);
      setOriginalPrice(existingProduct.originalPrice);
      setDiscount(existingProduct.discount);
      setSku(existingProduct.sku || existingProduct.id);
      setStockQuantity(existingProduct.stockQuantity ?? 25);
      setFabric(existingProduct.fabric);
      setFit(existingProduct.fit);
      setOccasion(existingProduct.occasion);
      setWashCare(existingProduct.washCare);
      setVideoUrl(existingProduct.videoUrl || '');
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
  }, [existingProduct]);

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

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    if (files.length === 0) return;

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
        setColors((currentColors) => {
          if (!currentColors.some(c => c.imageUrl === imageUrl)) {
            return [...currentColors, { name: `Shade ${currentColors.length + 1}`, hex: '#241D1B', imageUrl }];
          }
          return currentColors;
        });
        showToast(`Image "${file.name}" uploaded successfully.`, 'success');
      }
    }

    event.target.value = '';
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
    } else {
      setSelectedSizes([...selectedSizes, size]);
    }
  };



  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showToast('Product name is required.', 'error');
      return;
    }
    if (price <= 0) {
      showToast('Please enter a valid selling price.', 'error');
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

    const payload: Omit<Product, 'id'> = {
      name: name.trim(),
      category,
      subcategory,
      description,
      price: Number(price),
      originalPrice: Number(originalPrice),
      discount: Number(discount),
      sku: sku.trim() || `SAG-${Date.now().toString().slice(-4)}`,
      rating: existingProduct?.rating || 5.0,
      reviewCount: existingProduct?.reviewCount || 1,
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
      inStock: stockQuantity > 0 && inStock,
      reviews: existingProduct?.reviews || [],
    };

    setIsSaving(true);
    try {
      if (isEditMode && productId) {
        await updateProduct(productId, payload);
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

  return (
    <div id="admin-product-form-page" className="space-y-6 pb-12">
      
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#FAF7F2] p-5 rounded-2xl border border-rose-100 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="p-2 bg-[#D8C8B8]/20 hover:bg-[#D8C8B8]/40 text-[#211C1A] rounded-xl transition"
            title="Back to Products"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#8B2635]">
              <span>Catalog</span>
              <span>/</span>
              <span>{isEditMode ? 'Edit Product' : 'New Product'}</span>
            </div>
            <h2 className="font-serif text-2xl font-bold text-gray-900">
              {isEditMode ? `Edit Product: ${existingProduct?.name || 'Item'}` : 'Add New Ethnic Apparel'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleCancel}
            className="px-4 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold uppercase tracking-wider transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="product-edit-form"
            disabled={isSaving}
            className="px-5 py-2.5 bg-[#241D1B] hover:bg-[#241D1B] disabled:opacity-50 disabled:cursor-not-allowed text-[#211C1A] rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-sm flex items-center gap-2"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{isSaving ? 'Saving...' : 'Save Product'}</span>
          </button>
        </div>
      </div>

      <form id="product-edit-form" onSubmit={handleSave} className="space-y-6">
        
        {/* Section 1: Basic Information */}
        <div className="bg-\[#FAF7F2\] p-6 rounded-2xl border border-rose-100 shadow-xs space-y-5">
          <h3 className="font-serif text-lg font-bold text-gray-900 pb-2 border-b border-rose-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-[#211C1A]" />
            Basic Product Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Product Name <span className="text-\[#B76E79\]">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Gulab Handblock Pure Cotton Anarkali Set"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] text-gray-900 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Category <span className="text-\[#B76E79\]">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-\[#FAF7F2\] text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#241D1B]"
              >
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Subcategory / Collection Tag
              </label>
              <input
                type="text"
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="e.g. Cambric Cotton Suit Sets"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] text-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                SKU (Stock Keeping Unit)
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. SAG-COT-9901"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] text-gray-900 font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
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
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] text-gray-900"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Product Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write full product craftsmanship, silhouette, and drape details..."
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] text-gray-900"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Pricing & Discount */}
        <div className="bg-\[#FAF7F2\] p-6 rounded-2xl border border-rose-100 shadow-xs space-y-5">
          <h3 className="font-serif text-lg font-bold text-gray-900 pb-2 border-b border-rose-100 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[#211C1A]" />
            Pricing & Currency (₹ INR)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Selling Price (₹) <span className="text-\[#B76E79\]">*</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={price}
                onChange={(e) => handlePriceChange(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] text-gray-900 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                MRP / Original Price (₹)
              </label>
              <input
                type="number"
                min="1"
                value={originalPrice}
                onChange={(e) => handleOriginalPriceChange(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] text-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Discount Calculated (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-[#D8C8B8]/50 text-[#211C1A] font-bold focus:outline-none focus:ring-2 focus:ring-[#241D1B]"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-rose-700">% OFF</span>
              </div>
            </div>

            {/* Colors Selection */}
            <div className="pt-6 border-t border-rose-50">
              <div className="flex justify-between items-center mb-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                  Available Colors & Sync Image <span className="text-\[#B76E79\]">*</span>
                </label>
                <button 
                  type="button" 
                  onClick={addColor} 
                  className="text-xs bg-[#241D1B] text-[#211C1A] px-3 py-1.5 rounded-lg hover:bg-opacity-90 font-bold transition shadow-sm"
                >
                  + Add Color
                </button>
              </div>
              
              <div className="space-y-4">
                {colors.map((color, idx) => {
                  const previewHex = color.hex.startsWith('#') ? color.hex : `#${color.hex}`;
                  return (
                    <div key={idx} className="p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-3 relative">
                      <button
                        type="button"
                        onClick={() => removeColor(idx)}
                        className="absolute top-3 right-3 text-\[#B76E79\] hover:text-rose-700 p-1 font-bold text-[10px]"
                        title="Delete Color"
                      >
                        Delete
                      </button>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        {/* Preview and Name */}
                        <div className="md:col-span-6 flex items-center gap-3">
                          <label 
                            className="relative w-10 h-10 rounded-full border-2 border-white shadow-md flex-shrink-0 cursor-pointer overflow-hidden transition-all duration-200 hover:scale-105 ring-1 ring-gray-300"
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
                            <span className="text-[9px] uppercase font-bold text-gray-400 block">Color Name</span>
                            <input
                              type="text"
                              placeholder="e.g. Royal Blue"
                              value={color.name}
                              onChange={(e) => updateColor(idx, 'name', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#241D1B]"
                            />
                          </div>
                        </div>

                        {/* Hex Code Input */}
                        <div className="md:col-span-6 space-y-1">
                          <span className="text-[9px] uppercase font-bold text-gray-400 block">Hex Color Code</span>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-mono">#</span>
                            <input
                              type="text"
                              placeholder="58152D"
                              value={color.hex.replace('#', '')}
                              onChange={(e) => {
                                const typedVal = e.target.value.trim();
                                const finalHex = typedVal.startsWith('#') ? typedVal : `#${typedVal}`;
                                updateColor(idx, 'hex', finalHex);
                              }}
                              className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-[#241D1B]"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Sync Product Image */}
                      <div className="pt-2 border-t border-gray-200/50">
                        <span className="text-[9px] uppercase font-bold text-gray-400 block mb-1.5">
                          Tap an uploaded image to sync with this color:
                        </span>
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
                              className={`relative w-12 h-16 rounded-md overflow-hidden border-2 transition ${
                                color.imageUrl === imgUrl 
                                  ? 'border-[#241D1B] ring-2 ring-[#241D1B]/10 shadow-sm scale-105 opacity-100' 
                                  : 'border-transparent hover:border-gray-200 opacity-60 hover:opacity-100'
                              }`}
                            >
                              <img src={imgUrl} className="w-full h-full object-cover" alt={`Product ${imgIdx + 1}`} referrerPolicy="no-referrer" />
                              {color.imageUrl === imgUrl && (
                                <div className="absolute inset-0 bg-[#241D1B]/10 flex items-center justify-center">
                                  <span className="text-[9px] font-bold text-[#211C1A] bg-[#241D1B] px-1 py-0.5 rounded shadow-sm">Sync</span>
                                </div>
                              )}
                            </button>
                          ))}
                          {images.length === 0 && (
                            <span className="text-xs text-gray-400 italic">Please upload product images below first.</span>
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
        <div className="bg-[#FAFBF7] p-6 rounded-2xl border border-[#9A6A3A]/35 shadow-sm space-y-5">
          <h3 className="font-serif text-lg font-bold text-[#211C1A] pb-2 border-b border-[#9A6A3A]/20 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-[#211C1A]" />
            Product Gallery
          </h3>

          <div className="space-y-6">
            {/* Upload Area */}
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[#9A6A3A]/30 rounded-2xl bg-[#FAFBF7] hover:border-[#241D1B]/50 transition-colors cursor-pointer group">
              <label className="flex flex-col items-center gap-3 cursor-pointer">
                <div className="w-12 h-12 rounded-full bg-[#241D1B]/5 flex items-center justify-center text-[#211C1A] group-hover:scale-105 transition-transform">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#211C1A]">Upload Product Images</span>
                <span className="text-[11px] text-gray-500">Drag & drop or click to browse</span>
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
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {images.map((imgUrl, idx) => (
                <div key={idx} className="relative group rounded-xl overflow-hidden border border-[#9A6A3A]/20 aspect-3/4 bg-white shadow-inner">
                  {imgUrl && imgUrl.trim() !== "" ? (
                    <img src={imgUrl} alt={`Product preview ${idx + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-100" />
                  )}
                  
                  {/* Image Badge */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-[#241D1B]/80 text-[#211C1A] text-[10px] font-bold rounded-md backdrop-blur-sm">
                    {idx === 0 ? 'Cover' : `#${idx + 1}`}
                  </div>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleRemoveImage(idx);
                    }}
                    className="absolute top-2 right-2 p-2 bg-rose-600 text-white rounded-full opacity-100 group-hover:opacity-100 transition-opacity shadow-lg z-20 cursor-pointer"
                    title="Remove image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section 4: Sizes, Colors & Fabric Specs */}
        <div className="bg-\[#FAF7F2\] p-6 rounded-2xl border border-rose-100 shadow-xs space-y-6">
          <h3 className="font-serif text-lg font-bold text-gray-900 pb-2 border-b border-rose-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#211C1A]" />
            Sizes, Colors & Fabric Specifications
          </h3>

          {/* Sizes Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
              Available Sizes <span className="text-\[#B76E79\]">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_SIZES.map((sz) => {
                const isSelected = selectedSizes.includes(sz);
                return (
                  <button
                    type="button"
                    key={sz}
                    onClick={() => toggleSize(sz)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                      isSelected 
                        ? 'bg-[#241D1B] text-[#211C1A] border-[#241D1B] shadow-xs' 
                        : 'bg-\[#FAF7F2\] text-gray-700 border-gray-200 hover:border-rose-300'
                    }`}
                  >
                    {sz} {isSelected && '✓'}
                  </button>
                );
              })}
            </div>
          </div>



          {/* Specifications */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3 border-t border-rose-50">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Fabric Material
              </label>
              <input
                type="text"
                value={fabric}
                onChange={(e) => setFabric(e.target.value)}
                placeholder="e.g. 100% Pure Cambric Cotton with Chiffon Dupatta"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] text-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Fit & Silhouette
              </label>
              <input
                type="text"
                value={fit}
                onChange={(e) => setFit(e.target.value)}
                placeholder="e.g. Regular Straight Cut Anarkali"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] text-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Occasion
              </label>
              <input
                type="text"
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                placeholder="e.g. Festive, Wedding, Office, Daily Wear"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] text-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Wash & Care Instructions
              </label>
              <input
                type="text"
                value={washCare}
                onChange={(e) => setWashCare(e.target.value)}
                placeholder="e.g. Gentle Hand Wash / Dry Clean for First Wash"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#241D1B] text-gray-900"
              />
            </div>
          </div>
        </div>

        {/* Section 5: Storefront Badges & Visibility */}
        <div className="bg-\[#FAF7F2\] p-6 rounded-2xl border border-rose-100 shadow-xs space-y-4">
          <h3 className="font-serif text-lg font-bold text-gray-900 pb-2 border-b border-rose-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#211C1A]" />
            Merchandising Badges & Visibility
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-rose-100 bg-[#D8C8B8]/30 cursor-pointer hover:bg-[#D8C8B8]/20 transition">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="rounded border-gray-300 text-[#211C1A] focus:ring-[#241D1B] w-4 h-4"
              />
              <span className="text-xs font-bold text-gray-800">Featured Product</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-rose-100 bg-[#D8C8B8]/30 cursor-pointer hover:bg-[#D8C8B8]/20 transition">
              <input
                type="checkbox"
                checked={isNewArrival}
                onChange={(e) => setIsNewArrival(e.target.checked)}
                className="rounded border-gray-300 text-[#211C1A] focus:ring-[#241D1B] w-4 h-4"
              />
              <span className="text-xs font-bold text-gray-800">New Arrival</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-rose-100 bg-[#D8C8B8]/30 cursor-pointer hover:bg-[#D8C8B8]/20 transition">
              <input
                type="checkbox"
                checked={isBestSeller}
                onChange={(e) => setIsBestSeller(e.target.checked)}
                className="rounded border-gray-300 text-[#211C1A] focus:ring-[#241D1B] w-4 h-4"
              />
              <span className="text-xs font-bold text-gray-800">Best Seller</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-rose-100 bg-[#D8C8B8]/30 cursor-pointer hover:bg-[#D8C8B8]/20 transition">
              <input
                type="checkbox"
                checked={isSale}
                onChange={(e) => setIsSale(e.target.checked)}
                className="rounded border-gray-300 text-[#211C1A] focus:ring-[#241D1B] w-4 h-4"
              />
              <span className="text-xs font-bold text-rose-700">Sale Item</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-rose-100 bg-[#D8C8B8]/30 cursor-pointer hover:bg-[#D8C8B8]/20 transition">
              <input
                type="checkbox"
                checked={isTrending}
                onChange={(e) => setIsTrending(e.target.checked)}
                className="rounded border-gray-300 text-[#211C1A] focus:ring-[#241D1B] w-4 h-4"
              />
              <span className="text-xs font-bold text-gray-800">Trending Now</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-rose-100 bg-[#D8C8B8]/30 cursor-pointer hover:bg-[#D8C8B8]/20 transition">
              <input
                type="checkbox"
                checked={isFestive}
                onChange={(e) => setIsFestive(e.target.checked)}
                className="rounded border-gray-300 text-[#211C1A] focus:ring-[#241D1B] w-4 h-4"
              />
              <span className="text-xs font-bold text-gray-800">Festive Edit</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-xl border border-rose-100 bg-[#D8C8B8]/30 cursor-pointer hover:bg-[#D8C8B8]/20 transition">
              <input
                type="checkbox"
                checked={inStock}
                onChange={(e) => setInStock(e.target.checked)}
                className="rounded border-gray-300 text-[#211C1A] focus:ring-[#241D1B] w-4 h-4"
              />
              <span className="text-xs font-bold text-emerald-800">In Stock Active</span>
            </label>
          </div>
        </div>

        {/* Bottom Save/Cancel Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleCancel}
            className="px-5 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold uppercase tracking-wider transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-[#241D1B] hover:bg-[#241D1B] disabled:opacity-50 disabled:cursor-not-allowed text-[#211C1A] rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-sm flex items-center gap-2"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{isSaving ? 'Saving Changes...' : (isEditMode ? 'Update Product Everywhere' : 'Publish Product')}</span>
          </button>
        </div>

      </form>

    </div>
  );
};
