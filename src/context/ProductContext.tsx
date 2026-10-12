import React, { createContext, useContext, useState, useEffect } from 'react';
import { COLLECTIONS, deleteImages, newDocId, removeDoc, saveDoc, watchCollection } from '../lib/dataStore';
import { doc, runTransaction } from 'firebase/firestore';
import { adminAuth, adminDb as db } from '../lib/firebase';
import { apiPost } from '../lib/api';

// After the admin changes a product, the server compares it with its last known price/stock and
// sends any real price-drop or back-in-stock emails (see api/alerts.js).
const checkAlerts = (productId: string) => {
  if (!adminAuth.currentUser) return;
  apiPost('/api/alerts', { action: 'check-product', productId }).catch(() => {});
};
import { Product, ProductSize } from '../types';
import { ACCESSORY_SIZE, FOOTWEAR_SIZES } from '../utils/looks';
import { isRemovedSection } from '../utils/removedSections';
import { fromCatalogOrLive } from '../lib/catalog';

const LOCAL_STORAGE_KEY = 'sag_custom_products_v1';

export interface ProductContextType {
  isLoading: boolean;
  products: Product[];
  allProducts: Product[];
  activeProducts: Product[];
  addProduct: (productData: Omit<Product, 'id'>) => Promise<Product>;
  /** reason: shown in Admin → Products → Stock history when the update changes stock. */
  updateProduct: (id: string, updated: Partial<Product>, reason?: string) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  duplicateProduct: (id: string) => Promise<Product | undefined>;
  toggleProductStatus: (id: string) => Promise<void>;
  /** Atomically changes stock by delta (never below zero). */
  adjustStock: (id: string, delta: number, reason?: string) => Promise<number>;
  getProductById: (id: string | null | undefined) => Product | undefined;
  resetToDefaultProducts: () => Promise<void>;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

// Every size a product can be saved with (Admin → Add product offers S–5XL and Free Size; XS is
// kept for older products; heels and other footwear accessories use UK shoe sizes). Sizes outside
// this list are dropped as invalid data.
const ALL_STANDARD_SIZES: ProductSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free Size', ...FOOTWEAR_SIZES];
// Shown when a product has no valid sizes saved (unchanged long-standing default for outfits).
const FALLBACK_SIZES: ProductSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
// Accessories without valid sizes are sold as one size (never offered in clothing sizes).
const ACCESSORY_FALLBACK_SIZES: ProductSize[] = [ACCESSORY_SIZE];
const fallbackSizesFor = (p: any): ProductSize[] => (p?.productType === 'accessory' ? ACCESSORY_FALLBACK_SIZES : FALLBACK_SIZES);
// outfit (women's wear) or accessory ("Complete the look")
const PRODUCT_TYPES = ['outfit', 'accessory'] as const;
const productTypeOf = (p: any): (typeof PRODUCT_TYPES)[number] => (PRODUCT_TYPES.includes(p?.productType) ? p.productType : 'outfit');

// Helper to retrieve any products saved in local storage across version keys
const getLocalStorageProducts = (): Product[] => {
  const keysToTry = [LOCAL_STORAGE_KEY];
  for (const key of keysToTry) {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = parsed
            .filter((p) => p && p.id != null && !isRemovedSection(p))
            .map((p) => {
              let imgs = p.images ?? p.image_urls ?? p.imageUrls ?? p.product_images ?? p.photos;
              if (typeof imgs === 'string') {
                try {
                  const parsed = JSON.parse(imgs);
                  imgs = Array.isArray(parsed) ? parsed : [imgs];
                } catch {
                  imgs = [imgs];
                }
              }
              if (Array.isArray(imgs)) {
                imgs = imgs.filter(imgUrl => typeof imgUrl === 'string' && imgUrl.trim().length > 0);
              }
              const stockValue = Number(p.stockQuantity ?? p.stock);
              const stockQuantity = Number.isFinite(stockValue) && stockValue >= 0 ? stockValue : 0;
              const sizes = Array.isArray(p.sizes)
                ? p.sizes.filter((size: unknown): size is ProductSize => ALL_STANDARD_SIZES.includes(size as ProductSize))
                : [];
              return {
                ...p,
                images: Array.isArray(imgs) && imgs.length > 0 ? imgs : (p.image ? [p.image] : []),
                image: (Array.isArray(imgs) && imgs.length > 0 ? imgs[0] : '') || p.image || p.image_url || p.imageUrl || '',
                sizes: sizes.length > 0 ? sizes : fallbackSizesFor(p),
                inStock: p.inStock ?? (p.status ? p.status === 'active' && stockQuantity > 0 : stockQuantity > 0),
                stockQuantity,
              };
            });
          if (cleaned.length > 0) return cleaned;
        }
      }
    } catch (e) {
      console.warn(`Error loading products from ${key}:`, e);
    }
  }
  return [];
};

const saveLocalStorageProducts = (prods: Product[]) => {
  try {
    const onlyReal = prods.filter(p => p && p.id != null);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(onlyReal));
  } catch (e) {
    console.error('Failed to save products to localStorage:', e);
  }
};

const hasRealProductImage = (product: Product): boolean =>
  Array.isArray(product.images) && product.images.some(
    (image) => typeof image === 'string' && image.trim() !== '' && !image.startsWith('data:image/svg+xml') && !image.includes('placeholder.com')
  );

const productImageUrls = (product: Product) =>
  [...product.images, ...product.colors.map((color) => color.imageUrl || '')].filter(Boolean);

// Short admin labels (set type "3 piece", accessory type "Bag"); anything else is dropped.
const shortLabel = (value: unknown) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40) : '');
// SEO / search text fields: plain single-line text, trimmed to a sensible length.
const plainText = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
// hidden stays the one visibility switch the store and server read; status only says why a hidden product is hidden.
const productStatusOf = (p: any): 'draft' | 'published' | 'archived' => (!p?.hidden ? 'published' : p.status === 'archived' ? 'archived' : 'draft');
const lowStockOverride = (value: unknown) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(9999, n) : 0;
};

/**
 * Appends one entry to the admin-only inventory_log collection. Only called for changes made in the admin
 * panel (never from the storefront); a failed log write never undoes the stock change.
 */
const logStockChange = (product: { id: string; name?: string }, from: number, to: number, reason: string) => {
  if (!adminAuth.currentUser || from === to) return;
  saveDoc(COLLECTIONS.inventoryLog, newDocId('inv-'), {
    at: new Date().toISOString(),
    by: 'admin',
    productId: String(product.id),
    productName: String(product.name || '').slice(0, 160),
    from,
    to,
    reason: String(reason || 'Stock updated').slice(0, 120),
  }, false).catch((error) => console.warn('Stock history entry not saved:', error?.message || error));
};

export const ProductProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>(() => {
    const local = getLocalStorageProducts();
    return local;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Normalises a product for the Firestore `products` collection (frontend Product shape).
  const mapProductToDb = (p: any) => {
    const stockQuantity = Math.max(0, Number(p.stockQuantity) || 0);
    const images: string[] = Array.isArray(p.images)
      ? p.images.filter((img: unknown) => typeof img === 'string' && img.trim().length > 0)
      : [];
    return {
      name: p.name || 'Untitled Product',
      sku: p.sku || `SAG-${Date.now().toString().slice(-6)}`,
      category: p.category || 'Suits',
      subcategory: p.subcategory || '',
      image: images[0] || p.image || '',
      price: Number(p.price) || 0,
      originalPrice: Number(p.originalPrice ?? p.price) || 0,
      discount: Number(p.discount) || 0,
      rating: Number(p.rating) || 0,
      reviewCount: Number(p.reviewCount) || 0,
      images,
      colors: Array.isArray(p.colors) ? p.colors : [],
      sizes: Array.isArray(p.sizes) ? p.sizes : [],
      stockQuantity,
      inStock: p.inStock !== false && stockQuantity > 0,
      description: p.description || '',
      fabric: p.fabric || '',
      fit: p.fit || '',
      occasion: p.occasion || '',
      washCare: p.washCare || '',
      isNewArrival: p.isNewArrival ?? false,
      isBestSeller: p.isBestSeller ?? false,
      isTrending: p.isTrending ?? false,
      isFestive: p.isFestive ?? false,
      isSale: p.isSale ?? false,
      isFeatured: p.isFeatured ?? false,
      tags: Array.isArray(p.tags) ? p.tags : [],
      videoUrl: p.videoUrl || '',
      hidden: Boolean(p.hidden),
      status: productStatusOf(p),
      seoTitle: plainText(p.seoTitle, 120),
      seoDescription: plainText(p.seoDescription, 320),
      searchKeywords: plainText(p.searchKeywords, 300),
      lowStockThreshold: lowStockOverride(p.lowStockThreshold),
      // Accessories are sold only in "Complete the look"; a set type marks combo / set outfits.
      productType: productTypeOf(p),
      accessoryType: productTypeOf(p) === 'accessory' ? shortLabel(p.accessoryType) : '',
      // Only women's outfits can be combos; accessories never are
      setType: productTypeOf(p) === 'outfit' ? shortLabel(p.setType) : '',
    };
  };

  // Tolerant normaliser for product documents read from Firestore.
  const mapProductFromDb = (p: any): Product => {
    let images: string[] = Array.isArray(p.images) ? p.images : [];

    let colors: any[] = Array.isArray(p.colors) ? p.colors : [];
    colors = colors
      .map((color: any, index: number) => {
        if (typeof color === 'string' && color.trim()) {
          return {
            name: color.trim(),
            hex: ['#241D1B', '#9A6A3A', '#211C1A', '#D8C8B8'][index % 4],
          };
        }
        return color;
      })
      .filter((color: any) => color && typeof color === 'object' && typeof color.name === 'string');

    // If images array is empty, fall back to colour images
    if (images.length === 0) {
      images = colors
        .map((c: any) => (typeof c.imageUrl === 'string' ? c.imageUrl.trim() : ''))
        .filter(Boolean);
    }

    // Check single image field if still empty
    if (images.length === 0 && typeof p.image === 'string' && p.image.trim()) {
      images = [p.image.trim()];
    }

    // Filter out invalid/empty strings
    images = images.filter((img) => typeof img === 'string' && img.trim().length > 0);

    const availableSizes = Array.isArray(p.sizes)
      ? p.sizes.filter((size: unknown): size is ProductSize => ALL_STANDARD_SIZES.includes(size as ProductSize))
      : [];
    const sizes = availableSizes.length > 0 ? availableSizes : fallbackSizesFor(p);

    if (colors.length === 0) {
      colors = [{ name: 'Standard', hex: '#241D1B' }];
    }

    const stockValue = Number(p.stockQuantity);
    const stockQuantity = Number.isFinite(stockValue) && stockValue >= 0 ? stockValue : 0;
    const inStock = p.inStock !== false && stockQuantity > 0;

    return {
      id: String(p.id),
      name: p.name || '',
      category: p.category || 'Suits',
      subcategory: p.subcategory || '',
      image: images[0] || p.image || '',
      price: Number(p.price) || 0,
      originalPrice: Number(p.originalPrice) || Number(p.price) || 0,
      discount: Number(p.discount) || 0,
      description: p.description || '',
      images,
      sizes,
      colors,
      inStock,
      sku: p.sku || '',
      stockQuantity,
      fabric: p.fabric || '',
      fit: p.fit || '',
      occasion: p.occasion || '',
      washCare: p.washCare || '',
      rating: Number(p.rating) || 0,
      reviewCount: Number(p.reviewCount) || 0,
      reviews: Array.isArray(p.reviews) ? p.reviews : [],
      isNewArrival: p.isNewArrival ?? false,
      isBestSeller: p.isBestSeller ?? false,
      isTrending: p.isTrending ?? false,
      isFestive: p.isFestive ?? false,
      isSale: p.isSale ?? false,
      isFeatured: p.isFeatured ?? false,
      tags: Array.isArray(p.tags) ? p.tags : [],
      videoUrl: p.videoUrl || '',
      hidden: Boolean(p.hidden),
      status: productStatusOf(p),
      seoTitle: plainText(p.seoTitle, 120),
      seoDescription: plainText(p.seoDescription, 320),
      searchKeywords: plainText(p.searchKeywords, 300),
      lowStockThreshold: lowStockOverride(p.lowStockThreshold) || undefined,
      productType: productTypeOf(p),
      accessoryType: productTypeOf(p) === 'accessory' ? shortLabel(p.accessoryType) : '',
      // Only women's outfits can be combos; accessories never are
      setType: productTypeOf(p) === 'outfit' ? shortLabel(p.setType) : '',
    };
  };

  // Applies a fresh set of product documents (from a fetch or a live snapshot) to state.
  // Only called after a successful read, so the database is the source of truth: products
  // deleted by the admin must disappear even if an older copy is cached in the browser.
  const applyProductRows = (rows: any[]) => {
    // Newest first by createdAt
    // Kids wear and toys are no longer part of the store (utils/removedSections): their saved rows are left out
    const sortedRows = (rows || []).filter((row) => !isRemovedSection(row)).sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    const productsWithImages = sortedRows.map(mapProductFromDb).filter(hasRealProductImage);
    setProducts(productsWithImages);
    saveLocalStorageProducts(productsWithImages);
  };

  // One live listener is the only product read: its first snapshot replaces the browser cache.
  useEffect(() => {
    const cached = getLocalStorageProducts();
    if (cached.length) {
      setProducts(cached);
      setIsLoading(false); // show the cached catalogue immediately; the snapshot refreshes it
    }
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        setIsLoading(false);
      }
    };
    const timer = window.setTimeout(settle, 6000);
    // Shoppers: the shared cached catalogue (one CDN request). Admins and fallback: the live listener.
    const stop = fromCatalogOrLive(
      (catalog) => {
        applyProductRows(catalog.products);
        settle();
      },
      () => watchCollection(
        COLLECTIONS.products,
        (rows, meta) => {
          // Unreachable database (offline, blocked network): an empty answer from the local cache must not
          // wipe the catalogue the shopper already has; the live answer replaces it when the connection is back.
          if (meta?.fromCache && rows.length === 0) {
            settle();
            return;
          }
          applyProductRows(rows);
          settle();
        },
        (error) => {
          console.warn('Live product updates unavailable:', error);
          settle();
        },
      ),
    );
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, []);

  // Only show active, in-stock products that have real names, valid prices, and real images (never untitled/0-price)
  const activeProducts = products.filter(
    (p) =>
      p.inStock &&
      p.name &&
      p.name.trim() !== '' &&
      p.name !== 'Untitled Product' &&
      p.price > 0 &&
      Array.isArray(p.images) &&
      p.images.length > 0
  );

  const addProduct = async (productData: Omit<Product, 'id'>): Promise<Product> => {
    // Strict validation to avoid empty or corrupt database entries
    if (!productData.name || productData.name.trim() === '' || productData.name === 'Untitled Product') {
      throw new Error('Product name is required');
    }
    if (!productData.price || Number(productData.price) <= 0) {
      throw new Error('Valid product price is required');
    }
    if (!productData.images || productData.images.length === 0) {
      throw new Error('At least one product image is required');
    }

    const newId = newDocId('p');
    const payload = {
      ...mapProductToDb(productData),
      rating: productData.rating || 0,
      reviewCount: productData.reviewCount || 0,
    };
    const newProduct = mapProductFromDb({ ...payload, id: newId });

    // 1. Immediately update state and localStorage
    setProducts((prev) => {
      const updated = [newProduct, ...prev];
      saveLocalStorageProducts(updated);
      return updated;
    });

    try {
      await saveDoc(COLLECTIONS.products, newId, { ...payload, createdAt: new Date().toISOString() }, false);
      logStockChange(newProduct, 0, payload.stockQuantity, 'New product');
      return newProduct;
    } catch (error) {
      setProducts((prev) => {
        const updated = prev.filter((p) => p.id !== newId);
        saveLocalStorageProducts(updated);
        return updated;
      });
      throw error;
    }
  };

  const updateProduct = async (id: string, updated: Partial<Product>, reason = 'Edited in admin') => {
    const existingProduct = products.find((product) => product.id === id);
    if (!existingProduct) throw new Error('Product not found in the active catalog.');
    const nextProduct = { ...existingProduct, ...updated };
    // Setting only a status also sets visibility: published = shown; draft / archived = hidden
    if ('status' in updated && !('hidden' in updated)) nextProduct.hidden = updated.status !== 'published';

    try {
      // Write only the fields that changed, so a stale copy never overwrites stock the server deducted.
      const full = mapProductToDb(nextProduct);
      const keys = new Set(Object.keys(updated));
      if (keys.has('images')) keys.add('image');
      if (keys.has('stockQuantity')) keys.add('inStock');
      if (keys.has('hidden') || keys.has('status')) {
        keys.add('hidden');
        keys.add('status');
      }
      const payload = Object.fromEntries(Object.entries(full).filter(([key]) => keys.has(key)));
      if (Object.keys(payload).length) await saveDoc(COLLECTIONS.products, id, payload);
      if ('stockQuantity' in payload) logStockChange(existingProduct, Math.max(0, Number(existingProduct.stockQuantity) || 0), Number(payload.stockQuantity) || 0, reason);

      if ('price' in updated || 'stockQuantity' in updated || 'inStock' in updated || 'hidden' in updated) checkAlerts(id);
      const freshProduct = mapProductFromDb({ ...mapProductToDb(existingProduct), ...payload, id });
      setProducts((prev) => {
        const synced = prev.map((product) => product.id === id ? freshProduct : product);
        saveLocalStorageProducts(synced);
        return synced;
      });
    } catch (error) {
      setProducts((prev) => {
        const rolledBack = prev.map((product) => product.id === id ? existingProduct : product);
        saveLocalStorageProducts(rolledBack);
        return rolledBack;
      });
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    if (id.startsWith('sag-prod-')) {
      setProducts((prev) => {
        const updatedList = prev.filter((product) => product.id !== id);
        saveLocalStorageProducts(updatedList);
        return updatedList;
      });
      return;
    }

    const target = products.find((product) => product.id === id);
    await removeDoc(COLLECTIONS.products, id);
    if (target) {
      // Duplicated products share image URLs, so keep any image another product still uses
      const stillUsed = new Set(products.filter((product) => product.id !== id).flatMap(productImageUrls));
      const imageUrls = productImageUrls(target).filter((url) => !stillUsed.has(url));
      deleteImages(imageUrls).catch((error) => console.error('Error deleting product photos from storage:', error));
    }

    setProducts((prev) => {
      const updatedList = prev.filter((product) => product.id !== id);
      saveLocalStorageProducts(updatedList);
      return updatedList;
    });
  };

  const duplicateProduct = async (id: string): Promise<Product | undefined> => {
    const target = products.find((p) => p.id === id);
    if (!target) return undefined;
    const { id: _, ...rest } = target;
    // Copies start hidden and without stock so they are never sold by accident.
    return await addProduct({ ...rest, name: `${target.name} (Copy)`, hidden: true, status: 'draft', stockQuantity: 0, inStock: false });
  };

  const toggleProductStatus = async (id: string) => {
    const target = products.find((p) => p.id === id);
    if (!target) return;
    await updateProduct(id, { hidden: !target.hidden });
  };

  const adjustStock = async (id: string, delta: number, reason = delta > 0 ? 'Quick adjust (+)' : 'Quick adjust (−)'): Promise<number> => {
    const ref = doc(db, COLLECTIONS.products, id);
    const moved = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Product not found.');
      const current = Math.max(0, Number(snap.data().stockQuantity) || 0);
      const value = Math.max(0, current + delta);
      tx.update(ref, { stockQuantity: value, inStock: value > 0, updatedAt: new Date().toISOString() });
      return { current, value, name: String(snap.data().name || '') };
    });
    logStockChange({ id, name: moved.name }, moved.current, moved.value, reason);
    const next = moved.value;
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, stockQuantity: next, inStock: next > 0 } : p)));
    checkAlerts(id);
    return next;
  };

  const getProductById = (id: string | null | undefined): Product | undefined => {
    if (!id) return undefined;
    return products.find((p) => p.id === id);
  };

  const resetToDefaultProducts = async () => {
    setProducts([]);
    saveLocalStorageProducts([]);
  };

  return (
    <ProductContext.Provider
      value={{
        products,
        allProducts: products,
        activeProducts,
        isLoading,
        addProduct,
        updateProduct,
        deleteProduct,
        duplicateProduct,
        toggleProductStatus,
        adjustStock,
        getProductById,
        resetToDefaultProducts,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
};

export const useProducts = () => {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error('useProducts must be used within a ProductProvider');
  }
  return context;
};
