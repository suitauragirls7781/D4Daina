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
import { auth, db } from './firebase';

// Firestore collections that replaced the old Supabase tables.
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
  const snapshot = await getDocs(collection(db, name));
  return snapshot.docs.map(withId);
};

export const listDocsWhere = async (name: CollectionName, field: string, value: unknown): Promise<Row[]> => {
  const snapshot = await getDocs(query(collection(db, name), where(field, '==', value)));
  return snapshot.docs.map(withId);
};

export const getDocById = async (name: CollectionName, id: string): Promise<Row | null> => {
  const snapshot = await getDoc(doc(db, name, String(id)));
  return snapshot.exists() ? withId(snapshot) : null;
};

/** Creates or replaces a document. Pass merge=true to keep fields that are not in `data`. */
export const saveDoc = async (name: CollectionName, id: string, data: DocumentData, merge = true) => {
  const { id: _ignored, ...payload } = data;
  await setDoc(doc(db, name, String(id)), { ...payload, updatedAt: new Date().toISOString() }, { merge });
};

export const patchDoc = async (name: CollectionName, id: string, data: DocumentData) => {
  const { id: _ignored, ...payload } = data;
  await updateDoc(doc(db, name, String(id)), { ...payload, updatedAt: new Date().toISOString() });
};

export const removeDoc = async (name: CollectionName, id: string) => {
  await deleteDoc(doc(db, name, String(id)));
};

/** Live listener for a whole collection. Returns the unsubscribe function. */
export const watchCollection = (name: CollectionName, onChange: (rows: Row[]) => void) =>
  onSnapshot(
    collection(db, name),
    (snapshot) => onChange(snapshot.docs.map(withId)),
    (error) => console.warn(`Live updates for ${name} unavailable:`, error.message),
  );

export type ImageFolder = 'product-images' | 'banners' | 'hero';

const adminImageRequest = async (action: 'cloudinary-sign' | 'cloudinary-delete', body: object) => {
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
 * Uploads an image straight from the browser to Cloudinary using a signature from the
 * admin API (the API secret never reaches the browser). Returns the secure delivery URL.
 */
export const uploadImage = async (file: File | Blob, folder: ImageFolder) => {
  const signed = await adminImageRequest('cloudinary-sign', { folder });
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signed.apiKey);
  form.append('timestamp', String(signed.timestamp));
  form.append('folder', signed.folder);
  form.append('signature', signed.signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`, { method: 'POST', body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.secure_url) throw new Error(result.error?.message || 'Cloudinary upload failed.');
  return result.secure_url as string;
};

export const isCloudinaryUrl = (url: string) =>
  typeof url === 'string' && url.startsWith('https://res.cloudinary.com/');

/** Permanently deletes Cloudinary images; non-Cloudinary URLs are ignored. */
export const deleteImages = async (urls: string[]) => {
  const targets = Array.from(new Set(urls.filter(isCloudinaryUrl)));
  if (targets.length === 0) return;
  const result = await adminImageRequest('cloudinary-delete', { urls: targets });
  if (result.failed?.length) console.warn('Some images could not be deleted from Cloudinary:', result.failed);
};

/** Signs the admin into Firebase with the custom token issued by /api/admin-config. */
export const signInAdminToFirebase = async (token?: string) => {
  if (!token) return;
  if (auth.currentUser?.uid === ADMIN_UID) return;
  await signInWithCustomToken(auth, token);
};

export const signOutAdminFromFirebase = async () => {
  if (auth.currentUser?.uid === ADMIN_UID) await signOut(auth);
};
