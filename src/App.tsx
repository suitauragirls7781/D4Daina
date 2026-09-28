import React, { useEffect } from 'react';
import { RouterProvider, useRouter } from './context/RouterContext';
import { ProductProvider } from './context/ProductContext';
import { ShopProvider, useShop } from './context/ShopContext';
import { AdminProvider, useAdmin } from './context/AdminContext';
import { AuthProvider } from './context/AuthContext';
import { ShieldCheck } from 'lucide-react';
import { Header } from './components/Header';
import { HomePage } from './components/HomePage';
import { AccountPage } from './components/AccountPage';
import { LoginPage } from './components/LoginPage';
import { Footer } from './components/Footer';

// Pages & Views
import { ShopPage } from './components/ShopPage';
import { ProductDetailPage } from './components/ProductDetailPage';
import { CartPage } from './components/CartPage';
import { CheckoutPage } from './components/CheckoutPage';
import { OrderConfirmationPage } from './components/OrderConfirmationPage';
import { WishlistPage } from './components/WishlistPage';
import { AboutUsPage } from './components/AboutUsPage';
import { ContactUsPage } from './components/ContactUsPage';
import { TrackOrderPage } from './components/TrackOrderPage';
import { AdminDashboardPage } from './components/AdminDashboardPage';
import { 
  ShippingPolicyPage, 
  ReturnPolicyPage, 
  PrivacyPolicyPage, 
  TermsPage, 
  CancellationPolicyPage, 
  SizeGuidePage 
} from './components/PolicyPages';

// Modals & Overlays
import { QuickViewModal } from './components/QuickViewModal';
import { SizeGuideModal } from './components/SizeGuideModal';
import { LiveVisitorTracker } from './components/LiveVisitorTracker';
import { CartDrawer } from './components/CartDrawer';
import { CouponDrawer } from './components/CouponDrawer';
import { MobileAppNavbar } from './components/MobileAppNavbar';
import { MobileMenuDrawer } from './components/MobileMenuDrawer';
import { PincodeModal } from './components/PincodeModal';
import { Toast } from './components/Toast';
import { LuxuryLoadingScreen } from './components/LuxuryLoadingScreen';
import { ActivePage } from './types';

import { slugToCategory } from './utils/slugHelper';

const LoadingScreen: React.FC = () => {
  return <LuxuryLoadingScreen />;
};

const MainContent: React.FC = () => {
  const { 
    activePage, 
    setActivePage, 
    selectedCategory,
    setSelectedCategory,
    selectedProductId,
    setSelectedProductId, 
    isLoading 
  } = useShop();
  const { isAdminRoute, currentPath, routeState, navigate } = useRouter();
  const { isAdminLoggedIn } = useAdmin();
  const currentPage = isAdminRoute ? activePage : routeState.customerRoute as ActivePage;

  useEffect(() => {
    console.log('App MainContent - Current Page:', currentPage, 'Route State:', routeState);
  }, [currentPage, routeState]);

  useEffect(() => {
    if (!isAdminRoute) {
      if (routeState.customerRoute === 'product-detail') {
        const pId = routeState.customerParams?.id;
        if (pId && pId !== selectedProductId) {
          setSelectedProductId(pId);
        }
      } else if (routeState.customerRoute === 'shop') {
        const catSlug = routeState.customerParams?.category || routeState.customerParams?.slug;
        if (catSlug) {
          const catName = slugToCategory(catSlug);
          if (catName && catName !== selectedCategory) {
            setSelectedCategory(catName);
          }
        }
      }
    }
  }, [isAdminRoute, routeState, selectedProductId, setSelectedProductId, selectedCategory, setSelectedCategory]);

  // Scroll to top when activePage or route changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activePage, currentPath]);

  // Global loading blocker
  if (isLoading) {
    return <LoadingScreen />;
  }

  // If on Admin routes (/admin, /admin/login, /admin/dashboard, etc.) or in admin mode,
  // render the dedicated, isolated Admin back-office interface without customer storefront wrapper
  if (isAdminRoute || activePage === 'admin') {
    return (
      <div id="admin-root-container" className="min-h-screen bg-[#FDF8F9] text-[#211C1A]">
        <AdminDashboardPage />
        <Toast />
      </div>
    );
  }

  // Customer-facing Storefront
  return (
    <main id="app-main-content" className="min-h-screen flex flex-col bg-[#120205] text-[#F7F0E5] w-full max-w-full overflow-x-hidden">
      <Header />
      <MobileMenuDrawer />

      <div className="flex-1">
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
      </div>

      <Footer />

      {/* Mobile Fixed App-Style Navigation Bar */}
      <MobileAppNavbar />

      {/* Global Customer Overlays & Drawers */}
      <CartDrawer />
      <CouponDrawer />
      <QuickViewModal />
      <SizeGuideModal />
      <PincodeModal />
      <LiveVisitorTracker />
      <Toast />

    </main>
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
