import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithCustomToken, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

type CustomerUser = { email: string; uid: string; displayName?: string; name?: string; phone?: string };

interface AuthContextType {
  user: CustomerUser | null;
  loading: boolean;
  /** Completes sign-in with the token returned by /api/customer-auth after the OTP is verified. */
  signInWithOtpToken: (token: string, customer?: { name?: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithOtpToken: async () => {},
  logout: async () => {},
});

// Customer sessions are Firebase custom-token sessions (uid prefix `c_`, claim `customerEmail`).
const isCustomerUid = (uid?: string) => Boolean(uid && uid.startsWith('c_'));
const CACHE_KEY = 'sag_custom_user';

const readCachedName = (email: string) => {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached?.email === email) return { name: cached.displayName || cached.name || '', phone: cached.phone || '' };
  } catch {}
  return { name: '', phone: '' };
};

const CUSTOMER_KEYS = [
  CACHE_KEY, 'sag_orders_v1', 'sag_guest_orders', 'sag_last_guest_email', 'sag_last_guest_phone', 'sag_last_guest_name',
  'sag_user_profile_current', 'sag_cart_v1', 'sag_cart_backup', 'sag_cart_owner', 'sag_wishlist_v1', 'sag_wishlist_owner', 'recentOrders', 'sag_registered_accounts',
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Plaintext password accounts from the old device-only login are no longer used.
    try { localStorage.removeItem('sag_registered_accounts'); } catch {}

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      // An admin session left in the storefront login by the old shared setup is cleared once
      if (fbUser && !isCustomerUid(fbUser.uid)) {
        fbSignOut(auth).catch(() => {});
      }
      if (fbUser && isCustomerUid(fbUser.uid)) {
        try {
          let email = '';
          try {
            const token = await fbUser.getIdTokenResult();
            email = String(token.claims.customerEmail || '');
          } catch {
            // Slow or no network while the token refreshes: stay signed in with the saved details
            const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            if (cached?.uid === fbUser.uid && cached?.email) email = String(cached.email);
          }
          if (email) {
            const cached = readCachedName(email);
            const next = { email, uid: fbUser.uid, displayName: cached.name, name: cached.name, phone: cached.phone };
            localStorage.setItem(CACHE_KEY, JSON.stringify(next));
            setUser(next);
            setLoading(false);
            window.dispatchEvent(new Event('sag-auth-state-change'));
            return;
          }
        } catch {}
      }
      // No verified customer session: drop any stale or hand-made cache entry.
      try { localStorage.removeItem(CACHE_KEY); } catch {}
      setUser(null);
      setLoading(false);
      window.dispatchEvent(new Event('sag-auth-state-change'));
    });
    return unsubscribe;
  }, []);

  const signInWithOtpToken = async (token: string, customer?: { name?: string; phone?: string }) => {
    const credential = await signInWithCustomToken(auth, token);
    const result = await credential.user.getIdTokenResult();
    const email = String(result.claims.customerEmail || '');
    const next = {
      email,
      uid: credential.user.uid,
      displayName: customer?.name || '',
      name: customer?.name || '',
      phone: customer?.phone || '',
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    setUser(next);
    window.dispatchEvent(new Event('sag-auth-state-change'));
  };

  const logout = async () => {
    try {
      CUSTOMER_KEYS.forEach((key) => localStorage.removeItem(key));
      Object.keys(localStorage).filter((key) => key.startsWith('sag_user_profile_')).forEach((key) => localStorage.removeItem(key));
      sessionStorage.clear();
    } catch {}
    try {
      if (isCustomerUid(auth.currentUser?.uid)) await fbSignOut(auth);
    } catch {}
    setUser(null);
    window.dispatchEvent(new Event('sag-auth-state-change'));
    window.dispatchEvent(new Event('sag-customer-logout'));
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithOtpToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
