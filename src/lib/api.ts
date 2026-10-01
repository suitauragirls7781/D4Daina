import { adminAuth, auth } from './firebase';
import { isAdminAreaPath } from '../utils/adminEntry';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** POST JSON to one of our /api routes, sending the Firebase ID token when someone is signed in. */
export const apiPost = async <T = any>(path: string, body: Record<string, unknown>): Promise<T> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Admin pages send the admin's token; the storefront sends the customer's
  const onAdminPage = isAdminAreaPath(window.location.pathname);
  const current = onAdminPage ? (adminAuth.currentUser || auth.currentUser) : (auth.currentUser || adminAuth.currentUser);
  if (current) {
    try {
      headers.Authorization = `Bearer ${await current.getIdToken()}`;
    } catch {
      // Continue as a guest if the token cannot be refreshed.
    }
  }
  let response: Response;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30000);
  try {
    response = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'same-origin', signal: controller.signal });
  } catch {
    throw new ApiError(controller.signal.aborted ? 'The store is taking too long to answer. Please try again in a minute.' : 'Network error. Check your connection and try again.', 0);
  } finally {
    window.clearTimeout(timer);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(result.error || 'Request failed. Please try again.', response.status);
  return result as T;
};

export const ordersApi = <T = any>(action: string, body: Record<string, unknown> = {}) => apiPost<T>('/api/orders', { action, ...body });
