import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import { 
  LayoutDashboard, 
  Package, 
  PlusCircle,
  Layers, 
  ShoppingBag, 
  Users, 
  Tag, 
  LayoutTemplate, 
  Image as ImageIcon, 
  MessageSquare, 
  Instagram,
  Settings, 
  LogOut, 
  Store, 
  Menu, 
  X, 
  Sparkles, 
  Flame,
  Activity,
  Bell, 
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  PanelLeftClose,
  PanelLeft
} from 'lucide-react';
import { AdminTab } from '../../types';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { 
    logoutAdmin, 
    adminEmail, 
    orders = [], 
    products = [], 
    categories = [], 
    coupons = [], 
    reviews = [] 
  } = useAdmin();
  const { showToast, setActivePage } = useShop();
  const { currentPath, activeAdminTab, openAdminTab, openAdminProductNew, navigate } = useRouter();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const pendingOrdersCount = orders.filter((o) => o.status === 'Pending' || o.status === 'Paid' || o.status === 'Processing').length;
  const lowStockCount = products.filter((p) => (p.stockQuantity !== undefined && p.stockQuantity < 10) || !p.inStock).length;

  const navItems: { id: AdminTab | 'add-product'; label: string; route: string; icon: React.FC<{ className?: string }>; badge?: number; badgeColor?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', route: '/admin/dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Products', route: '/admin/products', icon: Package, badge: products.length },
    { id: 'add-product', label: 'Add Product', route: '/admin/products/new', icon: PlusCircle },
    { id: 'categories', label: 'Categories', route: '/admin/categories', icon: Layers, badge: categories.length },
    { id: 'orders', label: 'Orders', route: '/admin/orders', icon: ShoppingBag, badge: pendingOrdersCount, badgeColor: 'bg-amber-100 text-black' },
    { id: 'customers', label: 'Customers', route: '/admin/customers', icon: Users },
    { id: 'leads', label: 'Captured Leads', route: '/admin/leads', icon: MessageSquare },
    { id: 'coupons', label: 'Coupons', route: '/admin/coupons', icon: Tag, badge: coupons.length },
    { id: 'dealOfTheDay', label: 'Deal of the Day', route: '/admin/deal-of-the-day', icon: Flame, badgeColor: 'bg-amber-100 text-black' },
    { id: 'comboOffers', label: 'Combo & Story Reels', route: '/admin/combo-offers', icon: Flame, badgeColor: 'bg-[#D8C8B8]/40 text-rose-800' },
    { id: 'homepage', label: 'Homepage', route: '/admin/homepage', icon: LayoutTemplate },
    { id: 'hero', label: 'Hero Slides', route: '/admin/hero', icon: Sparkles },
    { id: 'banners', label: 'Banners', route: '/admin/banners', icon: ImageIcon },
    { id: 'reviews', label: 'Reviews', route: '/admin/reviews', icon: MessageSquare, badge: reviews.length },
    { id: 'instagram', label: 'Instagram Reels', route: '/admin/instagram', icon: Instagram },
    { id: 'settings', label: 'Settings', route: '/admin/settings', icon: Settings },
  ];

  const handleNavClick = (tabId: AdminTab | 'add-product') => {
    if (tabId === 'add-product') {
      openAdminProductNew();
    } else {
      openAdminTab(tabId as AdminTab);
    }
    setMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = () => {
    logoutAdmin();
    showToast('Signed out securely from Suit Aura Girls Vault.', 'info');
    setActivePage('home');
    navigate('/');
  };

  const handleViewStorefront = () => {
    setActivePage('home');
    navigate('/');
  };

  return (
    <div id="admin-layout" className="min-h-screen bg-[#F1E8DF] flex flex-col font-sans text-gray-900">
      
      {/* Top Admin Header Bar */}
      <header className="bg-[#FDFBF7] border-b border-[#9A6A3A]/20 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Mobile menu trigger + Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-[#9A6A3A]/10 hover:text-[#211C1A] transition cursor-pointer"
              aria-label="Toggle mobile admin sidebar"
            >
              {mobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
 
            <div 
              className="flex items-center gap-2 cursor-pointer" 
              onClick={() => openAdminTab('dashboard')}
            >
              <div className="w-9 h-9 rounded-xl bg-[#241D1B] text-[#211C1A] flex items-center justify-center border border-[#9A6A3A]/35 shadow-sm">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-serif font-bold text-base text-[#211C1A] tracking-tight leading-none">
                  SUIT AURA GIRLS
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-widest text-black">
                  Admin Dashboard
                </span>
              </div>
            </div>
 
            {/* Desktop toggle collapse sidebar button */}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden lg:flex p-1.5 rounded-lg text-gray-400 hover:text-[#211C1A] hover:bg-[#9A6A3A]/10 transition ml-2 cursor-pointer"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>
 
          {/* Quick Actions & Profile */}
          <div className="flex items-center gap-2 sm:gap-4">
            
            {/* View Live Storefront Button */}
            <button
              id="admin-view-storefront-btn"
              onClick={handleViewStorefront}
              className="px-3 sm:px-3.5 py-1.5 bg-[#9A6A3A]/10 hover:bg-[#241D1B] hover:text-[#211C1A] text-[#211C1A] border border-[#9A6A3A]/25 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Return to customer-facing shop"
            >
              <Store className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">View Storefront</span>
              <ExternalLink className="w-3 h-3 hidden sm:inline" />
            </button>

            {/* Quick Notification Bell */}
            <div className="relative">
              <button
                onClick={() => showToast(`Store Operational: ${pendingOrdersCount} pending orders, ${lowStockCount} low stock alerts.`, 'info')}
                className="p-2 rounded-lg text-gray-600 hover:bg-[#9A6A3A]/10 hover:text-[#211C1A] transition relative cursor-pointer"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {pendingOrdersCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#241D1B] ring-2 ring-white" />
                )}
              </button>
            </div>

            {/* Admin Profile Pill */}
            <div className="flex items-center gap-2 pl-2 border-l border-[#9A6A3A]/20">
              <div className="w-8 h-8 rounded-full bg-[#241D1B] text-[#211C1A] border border-[#9A6A3A]/35 flex items-center justify-center text-xs font-bold font-serif shadow-xs">
                {adminEmail ? adminEmail[0].toUpperCase() : 'A'}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-bold text-gray-900 leading-none">
                  Admin User
                </p>
                <p className="text-[10px] text-gray-500 font-mono leading-tight">
                  {adminEmail || 'admin@suitauragirls.com'}
                </p>
              </div>
            </div>

          </div>

        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 flex gap-6">
        
        {/* Desktop Sticky Sidebar */}
        <aside className={`hidden lg:block shrink-0 transition-all duration-300 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          <div className="bg-[#FDFBF7] rounded-2xl border border-[#9A6A3A]/25 p-3 sm:p-4 shadow-xs sticky top-22 space-y-6">
            
            <div className="space-y-1">
              {!isSidebarCollapsed && (
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Navigation
                </div>
              )}

              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeAdminTab === item.id || (item.id === 'products' && currentPath.startsWith('/admin/products')) || (item.id === 'orders' && currentPath.startsWith('/admin/orders'));
                
                return (
                  <button
                    key={item.id}
                    id={`admin-nav-${item.id}`}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5'} rounded-xl text-xs font-semibold transition group cursor-pointer ${
                      isActive
                        ? 'bg-[#241D1B] text-[#211C1A] shadow-sm'
                        : 'text-gray-600 hover:bg-[#9A6A3A]/10 hover:text-[#211C1A]'
                    }`}
                    title={isSidebarCollapsed ? item.label : undefined}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-black' : 'text-gray-500 group-hover:text-[#211C1A]'}`} />
                      {!isSidebarCollapsed && <span>{item.label}</span>}
                    </div>

                    {!isSidebarCollapsed && item.badge !== undefined && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isActive 
                          ? 'bg-[#F1E8DF]/20 text-white' 
                          : item.badgeColor || 'bg-[#9A6A3A]/15 text-[#211C1A]'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* System Status Summary & Logout */}
            <div className="pt-4 border-t border-[#9A6A3A]/20 space-y-3">
              {!isSidebarCollapsed && (
                <div className="p-3 bg-[#F1E8DF]/50 rounded-xl border border-[#9A6A3A]/20">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#211C1A]">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Store Operational</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">
                    100% Prepaid Only • Secure Card & UPI
                  </p>
                </div>
              )}

              {/* Logout Button */}
              <button
                id="admin-sidebar-logout-btn"
                onClick={handleLogout}
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2 px-3 py-2'} text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-xl transition cursor-pointer`}
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
                {!isSidebarCollapsed && <span>Logout</span>}
              </button>
            </div>

          </div>
        </aside>

        {/* Mobile Slide-over Sidebar Drawer */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden bg-black/40 backdrop-blur-xs flex animate-in fade-in">
            <div className="w-72 bg-[#F1E8DF] h-full shadow-2xl p-5 flex flex-col justify-between overflow-y-auto border-r border-[#9A6A3A]/25">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#9A6A3A]/20">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#241D1B] text-[#211C1A] flex items-center justify-center border border-[#9A6A3A]/35">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-serif font-bold text-sm text-[#211C1A]">Suit Aura Girls</h3>
                      <p className="text-[9px] uppercase tracking-widest text-black">Admin Navigation</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setMobileSidebarOpen(false)} 
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-[#9A6A3A]/10 hover:text-[#211C1A] transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeAdminTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavClick(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                          isActive
                            ? 'bg-[#241D1B] text-[#211C1A]'
                            : 'text-gray-600 hover:bg-[#9A6A3A]/10 hover:text-[#211C1A]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isActive ? 'bg-[#F1E8DF]/20 text-white' : item.badgeColor || 'bg-[#9A6A3A]/15 text-[#211C1A]'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-[#9A6A3A]/20 space-y-2">
                <button
                  onClick={handleViewStorefront}
                  className="w-full py-2.5 px-3 bg-[#9A6A3A]/10 text-[#211C1A] border border-[#9A6A3A]/25 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Store className="w-4 h-4" /> View Storefront
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full py-2.5 px-3 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileSidebarOpen(false)} />
          </div>
        )}

        {/* Content Area */}
        <main className="flex-1 min-w-0 space-y-6">
          {children}
        </main>

      </div>

    </div>
  );
};
