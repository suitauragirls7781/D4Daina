import React, { createContext, useContext, useState, useEffect } from 'react';
import { COLLECTIONS, deleteImages, listDocs, newDocId, removeDoc, saveDoc, watchCollection } from '../lib/dataStore';
import { Product, ProductSize } from '../types';

const LOCAL_STORAGE_KEY = 'sag_custom_products_v1';

export interface ProductContextType {
  isLoading: boolean;
  products: Product[];
  allProducts: Product[];
  activeProducts: Product[];
  addProduct: (productData: Omit<Product, 'id'>) => Promise<Product>;
  updateProduct: (id: string, updated: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  duplicateProduct: (id: string) => Promise<Product | undefined>;
  toggleProductStatus: (id: string) => Promise<void>;
  getProductById: (id: string | null | undefined) => Product | undefined;
  resetToDefaultProducts: () => Promise<void>;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

const ALL_STANDARD_SIZES: ProductSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

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
            .filter((p) => p && p.id != null)
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
                image: p.image || p.image_url || p.imageUrl || (Array.isArray(imgs) && imgs.length > 0 ? imgs[0] : ''),
                sizes: sizes.length > 0 ? sizes : ALL_STANDARD_SIZES,
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
      image: p.image || images[0] || '',
      price: Number(p.price) || 0,
      originalPrice: Number(p.originalPrice ?? p.price) || 0,
      discount: Number(p.discount) || 0,
      rating: Number(p.rating) || 4.5,
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
    const sizes = availableSizes.length > 0 ? availableSizes : ALL_STANDARD_SIZES;

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
      image: p.image || images[0] || '',
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
      rating: Number(p.rating) || 4.5,
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
    };
  };

  const mergeProducts = (dbProds: Product[], localProds: Product[]): Product[] => {
    if (dbProds && dbProds.length > 0) {
      // Find any newly created unsynced local products.
      const unsyncedNewLocal = localProds.filter(
        (lp) => lp && lp.id != null && String(lp.id).startsWith('sag-prod-') && !dbProds.some((sp) => sp.name === lp.name || sp.sku === lp.sku)
      );
      return [...dbProds, ...unsyncedNewLocal];
    }

    // Only fallback to real local data if the database returned 0 items
    const nonDefaultLocal = localProds.filter((p) => p && p.id != null);
    if (nonDefaultLocal.length > 0) {
      return nonDefaultLocal;
    }
    return [];
  };

  // Applies a fresh set of product documents (from a fetch or a live snapshot) to state.
  const applyProductRows = (rows: any[]) => {
    const localCache = getLocalStorageProducts();
    if (!rows || rows.length === 0) {
      setProducts(localCache);
      saveLocalStorageProducts(localCache);
      return;
    }
    // Newest first by createdAt
    const sortedRows = [...rows].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    const productsWithImages = sortedRows.map(mapProductFromDb).filter(hasRealProductImage);
    const merged = productsWithImages.length > 0
      ? mergeProducts(productsWithImages, localCache)
      : localCache;
    setProducts(merged);
    saveLocalStorageProducts(merged);
  };

  const fetchProducts = async () => {
    const localCache = getLocalStorageProducts();

    // Immediately unblock UI with local cache if available
    setProducts(localCache);

    // Background fetch from Firestore with 5s timeout protection
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Database fetch timeout')), 5000)
      );
      const rows = await Promise.race([listDocs(COLLECTIONS.products), timeoutPromise]);
      applyProductRows(rows);
    } catch (err) {
      console.warn('Background database fetch products notice:', err);
      setProducts(localCache);
      saveLocalStorageProducts(localCache);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();

    const unsubscribe = watchCollection(COLLECTIONS.products, (rows) => {
      applyProductRows(rows);
    });

    return () => {
      unsubscribe();
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
      rating: productData.rating || 5.0,
      reviewCount: productData.reviewCount || 1,
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

  const updateProduct = async (id: string, updated: Partial<Product>) => {
    const existingProduct = products.find((product) => product.id === id);
    if (!existingProduct) throw new Error('Product not found in the active catalog.');
    const nextProduct = { ...existingProduct, ...updated };

    try {
      const payload = mapProductToDb(nextProduct);
      await saveDoc(COLLECTIONS.products, id, payload);

      const freshProduct = mapProductFromDb({ ...payload, id });
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
      deleteImages(imageUrls).catch((error) => console.error('Error deleting product images from Cloudinary:', error));
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
    return await addProduct({ ...rest, name: `${target.name} (Copy)` });
  };

  const toggleProductStatus = async (id: string) => {
    const target = products.find((p) => p.id === id);
    if (!target) return;
    await updateProduct(id, { inStock: !target.inStock });
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
