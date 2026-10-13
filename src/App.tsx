import { useScrollReveal } from './utils/reveal';
import { usePresence } from './utils/presence';
import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RouterProvider, useRouter } from './context/RouterContext';
import { ProductProvider } from './context/ProductContext';
import { ShopProvider, useShop } from './context/ShopContext';
import { AdminProvider, useAdmin } from './context/AdminContext';
import { AuthProvider } from './context/AuthContext';
import { ShieldCheck } from 'lucide-react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { CategoryDirectory } from './components/CategoryDirectory';

// Pages & Views


// Modals & Overlays
import { LiveVisitorTracker } from './components/LiveVisitorTracker';
import { CartDrawer } from './components/CartDrawer';
import { MobileAppNavbar } from './components/MobileAppNavbar';
import { GoogleOneTap } from './components/GoogleOneTap';
import { SmartAssistant } from './components/SmartAssistant';
import { CompareTray } from './components/CompareTray';
import { MobileMenuDrawer } from './components/MobileMenuDrawer';
import { Toast } from './components/Toast';
import { LuxuryLoadingScreen } from './components/LuxuryLoadingScreen';
import { ActivePage } from './types';

import { slugToCategory } from './utils/slugHelper';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Backdrop, enterPage } from './aura';

// Pages other than home load on demand so shoppers never download the admin panel.
const AccountPage = lazy(() => import('./components/AccountPage').then((m) => ({ default: m.AccountPage })));
const LoginPage = lazy(() => import('./components/LoginPage').then((m) => ({ default: m.LoginPage })));
// The pages a visit usually STARTS on. Their code is asked for the moment the app starts when the address says
// that page is the one to show (startPage below), side by side with the catalogue request, so the page is drawn
// in the app's first frame instead of after a placeholder and one more round trip. A page that is already here
// is drawn directly; one that is not behaves like every other lazy page.
const here = new Map<string, React.ComponentType>();
// The code of the page this visit starts on, while it is still on its way (see the loader in MainContent)
let startArriving: Promise<void> | null = null;
const firstPage = (key: string, load: () => Promise<React.ComponentType>) => {
  const Late = lazy(() => load().then((component) => ({ default: component })));
  const Page: React.FC = () => {
    // Decided once per visit of the page, so the page is never swapped (and its state lost) half way
    const [Ready] = useState<React.ComponentType | undefined>(() => here.get(key));
    return Ready ? <Ready /> : <Late />;
  };
  return Object.assign(Page, { warm: () => load().then((component) => { here.set(key, component); }).catch(() => {}) });
};
const HomePage = firstPage('home', () => import('./components/HomePage').then((m) => m.HomePage));
const ShopPage = firstPage('shop', () => import('./components/ShopPage').then((m) => m.ShopPage));
const ProductDetailPage = firstPage('product', () => import('./components/ProductDetailPage').then((m) => m.ProductDetailPage));
const CartPage = firstPage('cart', () => import('./components/CartPage').then((m) => m.CartPage));
const CheckoutPage = firstPage('checkout', () => import('./components/CheckoutPage').then((m) => m.CheckoutPage));
if (typeof window !== 'undefined') {
  const path = window.location.pathname;
  const startPage = path === '/' ? HomePage : path.startsWith('/product/') ? ProductDetailPage
    : /^\/(shop|category\/)/.test(path) ? ShopPage : path.startsWith('/checkout') ? CheckoutPage : path.startsWith('/cart') ? CartPage : null;
  if (startPage) startArriving = startPage.warm();
}
const OrderConfirmationPage = lazy(() => import('./components/OrderConfirmationPage').then((m) => ({ default: m.OrderConfirmationPage })));
const WishlistPage = lazy(() => import('./components/WishlistPage').then((m) => ({ default: m.WishlistPage })));
const AboutUsPage = lazy(() => import('./components/AboutUsPage').then((m) => ({ default: m.AboutUsPage })));
const ContactUsPage = lazy(() => import('./components/ContactUsPage').then((m) => ({ default: m.ContactUsPage })));
const TrackOrderPage = lazy(() => import('./components/TrackOrderPage').then((m) => ({ default: m.TrackOrderPage })));
const AdminDashboardPage = lazy(() => import('./components/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const ShippingPolicyPage = lazy(() => import('./components/PolicyPages').then((m) => ({ default: m.ShippingPolicyPage })));
const ReturnPolicyPage = lazy(() => import('./components/PolicyPages').then((m) => ({ default: m.ReturnPolicyPage })));
const PrivacyPolicyPage = lazy(() => import('./components/PolicyPages').then((m) => ({ default: m.PrivacyPolicyPage })));
const TermsPage = lazy(() => import('./components/PolicyPages').then((m) => ({ default: m.TermsPage })));
const CancellationPolicyPage = lazy(() => import('./components/PolicyPages').then((m) => ({ default: m.CancellationPolicyPage })));
const SizeGuidePage = lazy(() => import('./components/PolicyPages').then((m) => ({ default: m.SizeGuidePage })));
const SizeGuideModal = lazy(() => import('./components/SizeGuideModal').then((m) => ({ default: m.SizeGuideModal })));
const CouponDrawer = lazy(() => import('./components/CouponDrawer').then((m) => ({ default: m.CouponDrawer })));

// Fetch the most used pages quietly after the first paint, so page changes animate without a loading spinner
if (typeof window !== 'undefined') {
  // Never while the first page is still arriving: only once the browser has finished loading it and is idle
  const warm = () => {
    ProductDetailPage.warm();
    ShopPage.warm();
    CartPage.warm();
    HomePage.warm();
    import('./components/WishlistPage');
    import('./components/AccountPage');
  };
  const whenIdle = () => {
    if ('requestIdleCallback' in window) (window as any).requestIdleCallback(warm, { timeout: 6000 });
    else setTimeout(warm, 3500);
  };
  if (document.readyState === 'complete') whenIdle(); else window.addEventListener('load', () => setTimeout(whenIdle, 1200), { once: true });
}

const NotFoundPage = lazy(() => import('./components/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

const PageFallback: React.FC = () => (
  // The shape of a page (label, title, sub line, pills, cards) instead of a spinning ring
  <div className="min-h-[70vh]" role="status" aria-label="Loading">
    <div className="kx-skel" aria-hidden="true">
      <i className="h-3.5 w-28" />
      <i className="mt-5 h-12 w-3/4" />
      <i className="mt-4 h-4 w-2/5" />
      <i className="mt-7 h-[54px] w-full max-w-[480px]" />
      <div><i /><i /><i className="max-[899px]:hidden" /><i className="max-[899px]:hidden" /></div>
    </div>
  </div>
);

const LoadingScreen: React.FC = () => {
  return <LuxuryLoadingScreen />;
};

const MainContent: React.FC = () => {
  const { 
    activePage, 
    syncActivePage: setActivePageRaw,
    setActivePage, 
    selectedCategory,
    setSelectedCategory,
    selectedProductId,
    setSelectedProductId,
    products,
    searchQuery,
    isLoading: storeLoading,
    isCouponDrawerOpen,
    isSizeGuideOpen
  } = useShop();
  const { isAdminRoute, currentPath, routeState, navigate } = useRouter();
  const { isAdminLoggedIn } = useAdmin();
  const currentPage = isAdminRoute ? activePage : routeState.customerRoute as ActivePage;

  // The loader stays until the first page's own code is here too (it is asked for at the very start, so this is
  // usually no wait at all, and never more than a second and a half): the page is then drawn once, complete,
  // instead of a placeholder first and the page a moment later, which cost a phone two full layouts.
  const [startHere, setStartHere] = useState(() => !startArriving);
  useEffect(() => {
    if (startHere || !startArriving) return undefined;
    let live = true;
    const done = () => { if (live) setStartHere(true); };
    startArriving.then(done);
    const timer = window.setTimeout(done, 1500);
    return () => { live = false; window.clearTimeout(timer); };
  }, [startHere]);
  const isLoading = storeLoading || !startHere;

  // What is not on the first screen (the menu panel, the category directory, the footer, the drawers) is put on
  // the page right AFTER the first screen has been painted, once per visit: the first frame then has about a
  // third of the page to lay out, and the name, the price and the photo are on a phone's screen sooner.
  const [restShown, setRestShown] = useState(false);
  useEffect(() => {
    if (isLoading || restShown) return undefined;
    let timer = 0;
    const frame = window.requestAnimationFrame(() => { timer = window.setTimeout(() => setRestShown(true), 0); });
    // A tab in the background gets no animation frame
    const late = window.setTimeout(() => setRestShown(true), 1500);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); window.clearTimeout(late); };
  }, [isLoading, restShown]);

  useEffect(() => {
  }, [currentPage, routeState]);

  useEffect(() => {
    if (!isAdminRoute) {
      if (routeState.customerRoute === 'product-detail') {
        const pId = routeState.customerParams?.id;
        if (pId && pId !== selectedProductId) {
          setSelectedProductId(pId);
        }
      } else if (routeState.customerRoute === 'shop') {
        // The URL decides the category: /shop is everything, /category/:slug is one category.
        const catSlug = routeState.customerParams?.category || routeState.customerParams?.slug;
        const catName = catSlug ? slugToCategory(catSlug) : 'All';
        if (catName && catName !== selectedCategory) {
          setSelectedCategory(catName);
        }
      }
    }
  }, [isAdminRoute, routeState, selectedProductId, setSelectedProductId, selectedCategory, setSelectedCategory]);

  // Back/Forward: keep the header's active page in step with the URL.
  useEffect(() => {
    if (!isAdminRoute && routeState.customerRoute && routeState.customerRoute !== activePage && routeState.customerRoute !== 'not-found') {
      setActivePageRaw(routeState.customerRoute as ActivePage);
    }
  }, [routeState]);

  // Page titles for routes without their own (product and shop pages set theirs).
  useEffect(() => {
    if (isAdminRoute) {
      document.title = 'Suit Aura Girls';
      document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, nofollow');
      return;
    }
    const titles: Record<string, string> = {
      home: "Suit Aura Girls | Women's Suits, Kurtis & Ethnic Fashion",
      cart: 'Your bag | Suit Aura Girls',
      checkout: 'Checkout | Suit Aura Girls',
      account: 'My account | Suit Aura Girls',
      login: 'Sign in | Suit Aura Girls',
      wishlist: 'Wishlist | Suit Aura Girls',
      about: 'About us | Suit Aura Girls',
      contact: 'Contact us | Suit Aura Girls',
      'track-order': 'Track your order | Suit Aura Girls',
      'order-confirmation': 'Order confirmed | Suit Aura Girls',
      'shipping-policy': 'Shipping policy | Suit Aura Girls',
      'return-policy': 'Returns & exchanges | Suit Aura Girls',
      'privacy-policy': 'Privacy policy | Suit Aura Girls',
      'terms-policy': 'Terms & conditions | Suit Aura Girls',
      'cancellation-policy': 'Cancellation policy | Suit Aura Girls',
      'size-guide': 'Size guide | Suit Aura Girls',
      'not-found': 'Page not found | Suit Aura Girls',
    };
    const title = titles[routeState.customerRoute];
    if (title) document.title = title;
    const canonical = document.querySelector('link[rel="canonical"]');
    const url = `https://www.suitauragirls.in${routeState.path === '/' ? '/' : routeState.path}`;
    if (canonical) canonical.setAttribute('href', url);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
    const robots = document.querySelector('meta[name="robots"]');
    const noindex = ['cart', 'checkout', 'account', 'login', 'order-confirmation', 'not-found', 'track-order'].includes(routeState.customerRoute);
    if (robots) robots.setAttribute('content', noindex ? 'noindex, follow' : 'index, follow');
  }, [routeState, isAdminRoute]);

  // Scroll to top when activePage or route changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activePage, currentPath]);

  // Global loading blocker
  // Sections rise in once as they come into view (storefront only; the hook itself skips nothing else)
  useScrollReveal();

  // Live presence for the owner's dashboard (src/utils/presence.ts): the page this visitor is on now.
  // Storefront only, never the admin panel; the rules and caps are in that file.
  const onStorefront = !isLoading && !isAdminRoute && activePage !== 'admin';
  const viewedProductId = currentPage === 'product-detail' ? String(routeState.customerParams?.id || selectedProductId || '') : '';
  usePresence(onStorefront, currentPath, {
    route: String(currentPage || 'home'),
    category: selectedCategory,
    productName: viewedProductId ? products.find((p) => String(p.id) === viewedProductId)?.name : undefined,
    search: currentPage === 'shop' ? searchQuery : '',
  });

  // The loader never waits for its own animation: the moment the store has loaded the page is shown, and the
  // loader's two ink panels part over it once (about half a second, taps go through to the page)
  const sawLoader = useRef(isLoading);
  const [loaderLeaving, setLoaderLeaving] = useState(false);
  useLayoutEffect(() => {
    if (isLoading) { sawLoader.current = true; return undefined; }
    if (!sawLoader.current) return undefined;
    sawLoader.current = false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    setLoaderLeaving(true);
    const timer = window.setTimeout(() => setLoaderLeaving(false), 650);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  // Aura Kinetic: the first screen of every new page arrives piece by piece (storefront only)
  const pageKey = currentPage === 'product-detail' ? 'pdp-' + selectedProductId : currentPage;
  // Not for the page a visit lands on: that one is simply there the moment its data is (the loader's panels
  // part over it). An entrance there only kept the name and the price out of sight for longer.
  const landed = useRef(false);
  useLayoutEffect(() => {
    if (isLoading || isAdminRoute || activePage === 'admin') return;
    if (!landed.current) { landed.current = true; return; }
    enterPage(40);
  }, [pageKey, isLoading, isAdminRoute]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  // If on Admin routes (/admin, /admin/login, /admin/dashboard, etc.) or in admin mode,
  // render the dedicated, isolated Admin back-office interface without customer storefront wrapper
  if (isAdminRoute || activePage === 'admin') {
    return (
      <div id="admin-root-container" className="min-h-screen bg-page text-ink">
        <Suspense fallback={<PageFallback />}>
          <AdminDashboardPage />
        </Suspense>
        <Toast />
      </div>
    );
  }

  // Customer-facing Storefront
  return (
    <div id="app-main-content" className="min-h-screen flex flex-col w-full max-w-full overflow-x-hidden supports-[overflow:clip]:overflow-x-clip">
      {/* The one fixed layer behind the page: it takes the colour of the section under the reader's eye (data-th) */}
      <Backdrop watch={`${currentPage}|${currentPath}`} />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[10001] focus:rounded-full focus:bg-brand focus:px-5 focus:py-3 focus:text-on-dark">Skip to content</a>
      <Header />
      {restShown && <MobileMenuDrawer />}

      <main id="main-content" tabIndex={-1} key={currentPage === 'product-detail' ? 'pdp-' + selectedProductId : currentPage} className="flex-1 sag-page focus:outline-none">
        <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
        {currentPage === 'home' && <HomePage />}
        {currentPage === 'account' && <AccountPage />}
        {currentPage === 'login' && <LoginPage />}
        {currentPage === 'shop' && <ShopPage />}
        {currentPage === 'product-detail' && <ProductDetailPage />}
        {currentPage === 'cart' && <CartPage />}
        {currentPage === 'checkout' && <CheckoutPage />}
        {currentPage === 'order-confirmation' && <OrderConfirmationPage />}
        {currentPage === 'wishlist' && <WishlistPage />}
        {currentPage === 'about' && <AboutUsPage />}
        {currentPage === 'contact' && <ContactUsPage />}
        {currentPage === 'track-order' && <TrackOrderPage />}
        {currentPage === 'shipping-policy' && <ShippingPolicyPage />}
        {currentPage === 'return-policy' && <ReturnPolicyPage />}
        {currentPage === 'privacy-policy' && <PrivacyPolicyPage />}
        {currentPage === 'terms-policy' && <TermsPage />}
        {currentPage === 'terms-conditions' && <TermsPage />}
        {currentPage === 'cancellation-policy' && <CancellationPolicyPage />}
        {currentPage === 'size-guide' && <SizeGuidePage />}
        {(currentPage as string) === 'not-found' && <NotFoundPage />}
        </Suspense>
        </ErrorBoundary>
      </main>

      {/* The whole range of categories, above the footer on the pages where people shop */}
      {['home', 'shop', 'product-detail', 'wishlist', 'about', 'not-found'].includes(currentPage as string) && restShown && <CategoryDirectory />}
      {/* Footer on every page except checkout (checkout stays focused on paying) */}
      {currentPage !== 'checkout' && restShown && <Footer />}
      {/* Phones: room for the fixed bottom tab bar (the product page leaves room for its own buy bar) */}
      {currentPage === 'checkout' && <div aria-hidden="true" className="md:hidden shrink-0 h-[calc(4.5rem+env(safe-area-inset-bottom))]" />}

      {/* Mobile Fixed App-Style Navigation Bar */}
      <MobileAppNavbar />
      {restShown && <><GoogleOneTap /><SmartAssistant /><CompareTray /></>}

      {/* Global Customer Overlays & Drawers */}
      {restShown && <CartDrawer />}
      <Suspense fallback={null}>
        {isCouponDrawerOpen && <CouponDrawer />}
        {isSizeGuideOpen && <SizeGuideModal />}
      </Suspense>
      <LiveVisitorTracker />
      <Toast />
      {loaderLeaving && <LuxuryLoadingScreen leaving />}
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <RouterProvider>
        <ProductProvider>
          <ShopProvider>
            <AdminProvider>
              <MainContent />
            </AdminProvider>
          </ShopProvider>
        </ProductProvider>
      </RouterProvider>
    </AuthProvider>
  );
}

export default App;
