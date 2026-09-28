import React, { useState } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useRouter } from '../context/RouterContext';
import { AdminLogin } from './admin/AdminLogin';
import { AdminLayout } from './admin/AdminLayout';
import { AdminDashboardOverview } from './admin/AdminDashboardOverview';
import { AdminProducts } from './admin/AdminProducts';
import { AdminProductForm } from './admin/AdminProductForm';
import { AdminCategories } from './admin/AdminCategories';
import { AdminOrders } from './admin/AdminOrders';
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
import { AdminDealOfTheDay } from './admin/AdminDealOfTheDay';
import { ShieldCheck, KeyRound, ArrowRight, Lock } from 'lucide-react';

export const AdminDashboardPage: React.FC = () => {
  const { isAdminLoggedIn, adminTab, securityConfig } = useAdmin();
  const { currentPath, routeParams, activeAdminTab, navigate } = useRouter();

  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');

  const secretSlug = (securityConfig?.secretPathSlug || 'sag-vault').toLowerCase();
  const isSecretVaultPath = 
    currentPath === `/${secretSlug}` || 
    currentPath === '/sag-vault' || 
    currentPath === '/admin-vault';

  // 1. If on secret vault route and not logged in, show the Admin Login Vault
  if (isSecretVaultPath && !isAdminLoggedIn) {
    return <AdminLogin />;
  }

  // 2. If on /admin/login and owner explicitly allowed direct /admin access
  if (currentPath === '/admin/login' && securityConfig?.allowDirectAdminRoute) {
    return <AdminLogin />;
  }

  // 3. If unauthorized visitor attempts to access /admin or /admin/* without authentication,
  // return strict 404 screen to obfuscate administrative presence
  if (!isAdminLoggedIn) {
    const handleVerifyStaffPin = (e: React.FormEvent) => {
      e.preventDefault();
      if (enteredPin.trim() === (securityConfig?.securityPin || '829146').trim()) {
        navigate(`/${secretSlug}`);
      } else {
        setPinError('Invalid Security PIN.');
      }
    };

    return (
      <div id="admin-404-guard" className="min-h-screen bg-[#FFFDFC] flex flex-col items-center justify-center p-6 text-center relative">
        <div className="max-w-md w-full bg-\[#FAF7F2\] border border-[#F3C5D1] rounded-3xl p-8 sm:p-10 shadow-pink-glow">
          <span className="text-6xl font-serif font-black text-[#211C1A] block mb-2">404</span>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Page Not Found</h1>
          <p className="text-xs text-gray-600 mb-6 leading-relaxed">
            The page you are looking for does not exist on Suit Aura Girls or has been moved.
          </p>

          <button
            onClick={() => window.location.href = '/'}
            className="w-full py-3 bg-[#241D1B] hover:bg-[#241D1B] text-[#211C1A] text-xs font-black uppercase tracking-widest rounded-xl transition cursor-pointer shadow-pink-glow mb-4"
          >
            Return to Store
          </button>

          {/* Discrete Staff Access Trigger */}
          <div className="pt-2 border-t border-rose-50 text-center">
            <button
              onClick={() => setStaffModalOpen(true)}
              className="text-[11px] text-gray-400 hover:text-[#211C1A] font-medium transition cursor-pointer inline-flex items-center gap-1"
            >
              <Lock className="w-3 h-3" />
              <span>Authorized Personnel Verification</span>
            </button>
          </div>
        </div>

        {/* Discrete PIN Modal */}
        {staffModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-\[#FAF7F2\] rounded-2xl max-w-xs w-full p-6 border border-rose-100 shadow-2xl text-left">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#D8C8B8]/40 text-[#211C1A] flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Staff Vault</h4>
                  <p className="text-[10px] text-gray-500">Enter your 6-digit PIN</p>
                </div>
              </div>

              {pinError && (
                <div className="p-2 mb-3 bg-[#D8C8B8]/20 text-rose-800 text-[11px] rounded-lg border border-rose-200">
                  {pinError}
                </div>
              )}

              <form onSubmit={handleVerifyStaffPin} className="space-y-3">
                <input
                  type="password"
                  maxLength={6}
                  autoFocus
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-center font-mono tracking-widest text-lg"
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setStaffModalOpen(false); setPinError(''); setEnteredPin(''); }}
                    className="flex-1 py-2 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 text-xs font-bold text-[#211C1A] bg-[#241D1B] rounded-lg hover:bg-[#241D1B] transition"
                  >
                    Verify
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
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
