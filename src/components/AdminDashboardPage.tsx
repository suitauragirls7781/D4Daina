import React from 'react';
import { useAdmin } from '../context/AdminContext';
import { useRouter } from '../context/RouterContext';
import { AdminLogin } from './admin/AdminLogin';
import { AdminLayout } from './admin/AdminLayout';
import { AdminDashboardOverview } from './admin/AdminDashboardOverview';
import { AdminProducts } from './admin/AdminProducts';
import { AdminProductForm } from './admin/AdminProductForm';
import { AdminCategories } from './admin/AdminCategories';
import { AdminOrders } from './admin/AdminOrders';
import { isAdminAreaPath, isAdminEntryPath } from '../utils/adminEntry';
import { AdminReturns } from './admin/AdminReturns';
import { AdminOrderDetails } from './admin/AdminOrderDetails';
import { AdminCustomers } from './admin/AdminCustomers';
import { AdminCoupons } from './admin/AdminCoupons';
import { AdminLeads } from './admin/AdminLeads';
import { AdminHomepage } from './admin/AdminHomepage';
import { AdminInstagram } from './admin/AdminInstagram';
import { AdminHero } from './admin/AdminHero';
import { AdminBanners } from './admin/AdminBanners';
import { AdminReviews } from './admin/AdminReviews';
import { AdminSettings } from './admin/AdminSettings';
import { AdminComboOffers } from './admin/AdminComboOffers';
import { AdminDiscovery } from './admin/AdminDiscovery';
import { AdminReels } from './admin/AdminReels';
import { AdminLooks } from './admin/AdminLooks';
import { AdminKids } from './admin/AdminKids';
import { AdminToys } from './admin/AdminToys';
import { AdminDealOfTheDay } from './admin/AdminDealOfTheDay';
import { AdminPaymentGateways } from './admin/AdminPaymentGateways';
import { AdminUsage } from './admin/AdminUsage';

export const AdminDashboardPage: React.FC = () => {
  const { isAdminLoggedIn, adminSessionChecked, adminTab, securityConfig } = useAdmin();
  const { currentPath, routeParams, activeAdminTab } = useRouter();


  const isSecretVaultPath = isAdminEntryPath(currentPath, securityConfig?.secretPathSlug);

  // 1. On the private sign-in link: wait for the session check first (a signed-in owner goes straight in,
  //    with no flash of the sign-in form), then show the form to everyone else.
  if (isSecretVaultPath && !isAdminLoggedIn) {
    if (!adminSessionChecked) {
      return (
        <div className="min-h-screen bg-[#FBF7F3] flex items-center justify-center" role="status" aria-label="Loading">
          <span className="w-8 h-8 rounded-full border-2 border-[#4B1D3F]/15 border-t-[#4B1D3F] animate-spin" />
        </div>
      );
    }
    return <AdminLogin />;
  }

  // 2. If on /admin/login and owner explicitly allowed direct /admin access
  if (currentPath === '/admin/login' && securityConfig?.allowDirectAdminRoute) {
    return <AdminLogin />;
  }

  // 3. Anyone else who opens /admin sees the store's ordinary "page not found": nothing on the
  // public site hints that an admin panel exists (the owner signs in from the private link).
  if (!isAdminLoggedIn && !adminSessionChecked) {
    // Still checking the session (a signed-in owner reloading an admin page): a plain loader, no branding
    return (
      <div className="min-h-screen bg-[#FBF7F3] flex items-center justify-center" role="status" aria-label="Loading">
        <span className="w-8 h-8 rounded-full border-2 border-[#4B1D3F]/15 border-t-[#4B1D3F] animate-spin" />
      </div>
    );
  }
  if (!isAdminLoggedIn && isAdminAreaPath(window.location.pathname)) {
    return <AdminLogin />;
  }
  if (!isAdminLoggedIn) {
    return (
      <div id="admin-404-guard" className="min-h-screen bg-[#FBF7F3] flex flex-col items-center justify-center px-6 text-center">
        <img src="/suit-aura-logo-480.webp" alt="Suit Aura Girls" className="h-14 w-auto mb-8" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#9C7A45]">Error 404</p>
        <p className="mt-2 font-serif text-7xl sm:text-8xl font-semibold leading-none text-[#4B1D3F]">404</p>
        <h1 className="mt-4 font-serif text-2xl sm:text-3xl text-[#2A1A26]">This page could not be found</h1>
        <p className="mt-2 max-w-sm text-sm text-[#2A1A26]/65 leading-relaxed">The link may be old or mistyped. Our latest styles are waiting in the store.</p>
        <a href="/" className="mt-8 sag-btn-primary h-12 px-8 inline-flex items-center text-sm font-semibold tracking-wide">Back to the store</a>
      </div>
    );
  }

  // Determine which sub-view to render based on URL route or active admin tab
  const renderSubView = () => {
    // 1. Specific product sub-routes
    if (currentPath === '/admin/products/new') {
      return <AdminProductForm />;
    }
    if (currentPath.startsWith('/admin/products/') && currentPath.endsWith('/edit')) {
      const prodId = routeParams.id || currentPath.split('/')[3];
      return <AdminProductForm productId={prodId} />;
    }

    // 2. Specific order details sub-routes
    if (currentPath.startsWith('/admin/orders/') && currentPath !== '/admin/orders') {
      const orderId = routeParams.id || currentPath.replace('/admin/orders/', '');
      return <AdminOrderDetails orderId={orderId} />;
    }

    // 3. Main tab views
    const effectiveTab = activeAdminTab || adminTab || 'dashboard';

    switch (effectiveTab) {
      case 'products':
        return <AdminProducts />;
      case 'categories':
        return <AdminCategories />;
      case 'orders':
        return <AdminOrders />;
      case 'returns':
        return <AdminReturns />;
      case 'customers':
        return <AdminCustomers />;
      case 'leads':
        return <AdminLeads />;
      case 'coupons':
        return <AdminCoupons />;
      case 'homepage':
        return <AdminHomepage />;
      case 'hero':
        return <AdminHero />;
      case 'comboOffers':
        return <AdminComboOffers />;
      case 'discovery':
        return <AdminDiscovery />;
      case 'reels':
        return <AdminReels />;
      case 'looks':
        return <AdminLooks />;
      case 'kids':
        return <AdminKids />;
      case 'toys':
        return <AdminToys />;
      case 'payments':
        return <AdminPaymentGateways />;
      case 'usage':
        return <AdminUsage />;
      case 'dealOfTheDay':
        return <AdminDealOfTheDay />;
      case 'banners':
        return <AdminBanners />;
      case 'reviews':
        return <AdminReviews />;
      case 'instagram':
        return <AdminInstagram />;
      case 'settings':
        return <AdminSettings />;
      case 'dashboard':
      default:
        return <AdminDashboardOverview />;
    }
  };

  return (
    <AdminLayout>
      {renderSubView()}
    </AdminLayout>
  );
};
