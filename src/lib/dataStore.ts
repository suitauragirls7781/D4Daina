import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { adminAuth, adminDb, db as customerDb } from './firebase';
import { isStoreMediaUrl, toMediaUrl, uploadImageWithGrant } from './media';

/** Admin reads/writes go through the admin's Firebase app; everyone else uses the storefront one. */
const store = () => (adminAuth.currentUser ? adminDb : customerDb);

// Firestore collections used by the store.
export const COLLECTIONS = {
  products: 'products',
  categories: 'categories',
  orders: 'orders',
  coupons: 'coupons',
  reviews: 'reviews',
  profiles: 'profiles',
  heroSlides: 'hero_slides',
  abandonedCheckouts: 'abandoned_checkouts',
  storefrontSettings: 'storefront_settings',
  // Admin only (firestore.rules): private admin preferences and the stock change log
  adminSettings: 'admin_settings',
  inventoryLog: 'inventory_log',
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];

export const ADMIN_UID = 'sag-admin';

type Row = DocumentData & { id: string };

const withId = (snapshot: { id: string; data: () => DocumentData | undefined }): Row => ({
  ...(snapshot.data() || {}),
  id: snapshot.id,
});

/** Generates a sortable, collision-resistant document id. */
export const newDocId = (prefix = '') =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Profiles and other per-customer documents are keyed by the normalized email. */
export const emailKey = (email: string) => String(email || '').trim().toLowerCase();

export const listDocs = async (name: CollectionName): Promise<Row[]> => {
  const snapshot = await getDocs(collection(store(), name));
  return snapshot.docs.map(withId);
};

export const listDocsWhere = async (name: CollectionName, field: string, value: unknown): Promise<Row[]> => {
  const snapshot = await getDocs(query(collection(store(), name), where(field, '==', value)));
  return snapshot.docs.map(withId);
};

export const getDocById = async (name: CollectionName, id: string): Promise<Row | null> => {
  const snapshot = await getDoc(doc(store(), name, String(id)));
  return snapshot.exists() ? withId(snapshot) : null;
};

/** Creates or replaces a document. Pass merge=true to keep fields that are not in `data`. */
export const saveDoc = async (name: CollectionName, id: string, data: DocumentData, merge = true) => {
  const { id: _ignored, ...payload } = data;
  await setDoc(doc(store(), name, String(id)), { ...payload, updatedAt: new Date().toISOString() }, { merge });
};

export const patchDoc = async (name: CollectionName, id: string, data: DocumentData) => {
  const { id: _ignored, ...payload } = data;
  await updateDoc(doc(store(), name, String(id)), { ...payload, updatedAt: new Date().toISOString() });
};

export const removeDoc = async (name: CollectionName, id: string) => {
  await deleteDoc(doc(store(), name, String(id)));
};

/** Live listener for a whole collection. Returns the unsubscribe function. */
// meta.fromCache: the rows came from the browser's local cache, not the server (e.g. while offline)
export const watchCollection = (name: CollectionName, onChange: (rows: Row[], meta: { fromCache: boolean }) => void, onError?: (error: Error) => void) =>
  onSnapshot(
    collection(store(), name),
    (snapshot) => onChange(snapshot.docs.map(withId), { fromCache: snapshot.metadata.fromCache }),
    (error) => {
      console.warn(`Live updates for ${name} unavailable:`, error.message);
      onError?.(error);
    },
  );

export type ImageFolder = 'product-images' | 'banners' | 'hero' | 'deals' | 'categories' | 'reviews';

const adminImageRequest = async (action: 'media-grant' | 'media-delete', body: object) => {
  const response = await fetch(`/api/admin-config?action=${action}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 207) throw new Error(result.error || 'Image service unavailable.');
  return result;
};

/**
 * Uploads a photo to the store's own storage. The browser first makes every size the site shows (small
 * WebP files), so a 5 MB phone photo goes up as well under 1 MB in all. Returns the address to save.
 */
export const uploadImage = async (file: File | Blob, folder: ImageFolder) => {
  const grant = await adminImageRequest('media-grant', { folder, kind: 'image' });
  return uploadImageWithGrant(file, grant);
};

/** A photo or reel in the store's own storage (other URLs are never deleted by the admin). */
export const isStoredMediaUrl = (url: string) => typeof url === 'string' && isStoreMediaUrl(url);

/** Permanently deletes stored photos (every size of each); other URLs are ignored. */
export const deleteImages = async (urls: string[]) => {
  const targets = Array.from(new Set(urls.filter(isStoredMediaUrl).map(toMediaUrl)));
  if (targets.length === 0) return;
  const result = await adminImageRequest('media-delete', { urls: targets });
  if (result.failed?.length) console.warn('Some photos could not be deleted from storage:', result.failed);
};

/** Signs the admin into Firebase with the custom token issued by /api/admin-config. */
export const signInAdminToFirebase = async (token?: string) => {
  if (!token) return;
  if (adminAuth.currentUser?.uid === ADMIN_UID) return;
  await signInWithCustomToken(adminAuth, token);
};

export const signOutAdminFromFirebase = async () => {
  if (adminAuth.currentUser?.uid === ADMIN_UID) await signOut(adminAuth);
};
