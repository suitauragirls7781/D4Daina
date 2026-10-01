import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useShop } from '../context/ShopContext';
import { GOOGLE_LOGIN_ENABLED, exchangeGoogleCredential, getGoogleId } from '../utils/googleSignIn';
import { useDiscovery } from '../utils/discovery';

const PAGES = new Set(['home', 'shop', 'product-detail', 'wishlist', 'cart', 'account']);
const DISMISSED_KEY = 'sag_onetap_dismissed';

/** Google One Tap: offers signed-out shoppers a one-tap sign-in with their Google account. */
export const GoogleOneTap: React.FC = () => {
  const { user, loading, signInWithOtpToken } = useAuth();
  const { activePage, syncCustomerOrders, showToast } = useShop();
  const { features } = useDiscovery();

  useEffect(() => {
    if (user) {
      try { (window as any).google?.accounts?.id?.cancel(); } catch {}
      return;
    }
    if (!GOOGLE_LOGIN_ENABLED || !features.googleOneTap || loading || !PAGES.has(activePage)) return;
    try { if (sessionStorage.getItem(DISMISSED_KEY)) return; } catch {}
    let cancelled = false;

    const onCredential = async (credential: string) => {
      try {
        const result = await exchangeGoogleCredential(credential);
        await signInWithOtpToken(result.firebaseToken, result.customer);
        await syncCustomerOrders(result.email);
        const name = result.customer?.name;
        showToast(`Welcome${name ? `, ${String(name).split(' ')[0]}` : ''}! You are signed in.`, 'success');
      } catch (err: any) {
        showToast(err?.message || 'Google sign-in failed. Please try again.', 'error');
      }
    };

    // Wait a moment so the prompt never covers the page while it is still loading
    const timer = window.setTimeout(() => {
      getGoogleId(onCredential)
        .then((g) => {
          if (cancelled) return;
          // Offer it once per visit; Google also waits longer each time a shopper closes it
          try { sessionStorage.setItem(DISMISSED_KEY, '1'); } catch {}
          g.prompt();
        })
        .catch(() => {});
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user, loading, activePage, features.googleOneTap]);

  return null;
};
