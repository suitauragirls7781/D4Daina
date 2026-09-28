import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { ADMIN_UID } from '../lib/dataStore';

interface AuthContextType {
  user: { email: string; uid: string; displayName?: string; name?: string } | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, logout: async () => {} });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ email: string; uid: string; displayName?: string; name?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check custom pattern login first
    const localUser = localStorage.getItem('sag_custom_user');
    if (localUser) {
      try {
        setUser(JSON.parse(localUser));
        setLoading(false);
      } catch (e) {
        // Fallback
      }
    }

    // 2. Also listen to firebase auth
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      const hasLocalUser = localStorage.getItem('sag_custom_user');
      if (hasLocalUser) {
        return; // Pattern user is active, prefer that
      }
      // The admin panel's Firebase session is not a storefront customer.
      if (fbUser && fbUser.uid !== ADMIN_UID) {
        setUser({
          email: fbUser.email || '',
          uid: fbUser.uid,
          displayName: fbUser.displayName || ''
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    const handleAuthChange = () => {
      const updatedUser = localStorage.getItem('sag_custom_user');
      if (updatedUser) {
        setUser(JSON.parse(updatedUser));
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    window.addEventListener('sag-auth-state-change', handleAuthChange);

    return () => {
      unsubscribe();
      window.removeEventListener('sag-auth-state-change', handleAuthChange);
    };
  }, []);

  const logout = async () => {
    try {
      localStorage.removeItem('sag_custom_user');
      localStorage.removeItem('sag_orders_v1');
      localStorage.removeItem('sag_guest_orders');
      localStorage.removeItem('sag_last_guest_email');
      localStorage.removeItem('sag_last_guest_phone');
      localStorage.removeItem('sag_last_guest_name');
      localStorage.removeItem('sag_user_profile_current');
      localStorage.removeItem('sag_cart_v1');
      localStorage.removeItem('sag_cart_backup');
      localStorage.removeItem('sag_wishlist_v1');
      sessionStorage.clear();
    } catch {}

    try {
      if (auth.currentUser?.uid !== ADMIN_UID) await fbSignOut(auth);
    } catch (e) {
      // Ignored
    }
    setUser(null);
    window.dispatchEvent(new Event('sag-auth-state-change'));
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
