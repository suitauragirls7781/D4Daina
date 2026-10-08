import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { seedHomeUnderFirstPage } from '../utils/backClose';
import { withPageTransition } from '../utils/pageTransition';
import { isAdminEntryPath, toAppPath, toBrowserPath } from '../utils/adminEntry';

export interface RouteState {
  path: string;
  isAdminRoute: boolean;
  adminTab: string;
  adminAction?: string; // e.g. 'new', 'edit'
  adminEntityId?: string; // e.g. productId, orderId
  customerRoute: string; // e.g. 'home', 'shop', 'product-detail'
  customerParams?: Record<string, string>;
}

export interface RouterContextType {
  currentPath: string;
  routeState: RouteState;
  isAdminRoute: boolean;
  activeAdminTab: string;
  routeParams: { id?: string; [key: string]: string | undefined };
  navigate: (path: string, options?: { replace?: boolean }) => void;
  openAdminTab: (tab: string) => void;
  openAdminProductNew: () => void;
  openAdminProductEdit: (id: string) => void;
  openAdminOrderDetails: (id: string) => void;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

function parsePath(pathname: string, search: string = ''): RouteState {
  const cleanPath = pathname.trim() || '/';
  
  // The private admin sign-in link (/d4daina, or the owner's own slug from Settings → Security)
  const isSecretVault = isAdminEntryPath(cleanPath);
  if (isSecretVault) {
    return {
      path: cleanPath,
      isAdminRoute: true,
      adminTab: 'dashboard',
      customerRoute: 'home',
    };
  }

  if (cleanPath.startsWith('/admin')) {
    const segments = cleanPath.split('/').filter(Boolean); // ['admin', 'products', 'new']
    const subRoute = segments[1] || 'dashboard';
    
    // Check for special nested patterns:
    // /admin/products/new
    if (segments[1] === 'products' && segments[2] === 'new') {
      return {
        path: cleanPath,
        isAdminRoute: true,
        adminTab: 'products',
        adminAction: 'new',
        customerRoute: 'home',
      };
    }
    // /admin/products/:id/edit
    if (segments[1] === 'products' && segments[3] === 'edit') {
      return {
        path: cleanPath,
        isAdminRoute: true,
        adminTab: 'products',
        adminAction: 'edit',
        adminEntityId: segments[2],
        customerRoute: 'home',
      };
    }
    // /admin/orders/:id
    if (segments[1] === 'orders' && segments[2]) {
      return {
        path: cleanPath,
        isAdminRoute: true,
        adminTab: 'orders',
        adminEntityId: segments[2],
        customerRoute: 'home',
      };
    }

    const normalizedTab = 
      subRoute === 'combo-offers' ? 'comboOffers' :
      subRoute === 'special-dod' ? 'specialDod' :
      subRoute === 'deal-of-the-day' ? 'dealOfTheDay' : 
      subRoute === 'ai-controller' || subRoute === 'ai-command' || subRoute === 'command-center' ? 'aiController' : 
      subRoute;

    return {
      path: cleanPath,
      isAdminRoute: true,
      adminTab: normalizedTab,
      customerRoute: 'home',
    };
  }

  // Customer routes
  const segments = cleanPath.split('/').filter(Boolean);
  let customerRoute = 'home';
  const customerParams: Record<string, string> = {};

  if (search) {
    const params = new URLSearchParams(search);
    const productId = params.get('product');
    if (productId) {
      return {
        path: cleanPath,
        isAdminRoute: false,
        adminTab: 'dashboard',
        customerRoute: 'product-detail',
        customerParams: { id: productId }
      };
    }
  }

  if (segments.length === 0 || cleanPath === '/') {
    customerRoute = 'home';
  } else if (segments[0] === 'shop') {
    customerRoute = 'shop';
  } else if ((segments[0] === 'category' || segments[0] === 'categories' || segments[0] === 'c') && segments[1]) {
    customerRoute = 'shop';
    customerParams.category = segments[1];
    customerParams.slug = segments[1];
  } else if ((segments[0] === 'product' || segments[0] === 'products' || segments[0] === 'p') && segments[1]) {
    customerRoute = 'product-detail';
    customerParams.id = segments[1];
  } else if (segments[0] === 'cart') {
    customerRoute = 'cart';
  } else if (segments[0] === 'checkout') {
    customerRoute = 'checkout';
  } else if (segments[0] === 'order-confirmation' || segments[0] === 'order-success') {
    customerRoute = 'order-confirmation';
  } else if (segments[0] === 'wishlist') {
    customerRoute = 'wishlist';
  } else if (segments[0] === 'about') {
    customerRoute = 'about';
  } else if (segments[0] === 'contact') {
    customerRoute = 'contact';
  } else if (segments[0] === 'size-guide') {
    customerRoute = 'size-guide';
  } else if (segments[0] === 'track-order') {
    customerRoute = 'track-order';
  } else if (segments[0] === 'shipping-policy') {
    customerRoute = 'shipping-policy';
  } else if (segments[0] === 'return-policy') {
    customerRoute = 'return-policy';
  } else if (segments[0] === 'privacy-policy') {
    customerRoute = 'privacy-policy';
  } else if (segments[0] === 'terms-policy' || segments[0] === 'terms-conditions') {
    customerRoute = 'terms-policy';
  } else if (segments[0] === 'account' || segments[0] === 'my-orders' || segments[0] === 'my-profile') {
    customerRoute = 'account';
    if (segments[0] === 'my-orders') {
      customerParams.tab = 'orders';
    } else if (segments[0] === 'my-profile') {
      customerParams.tab = 'profile';
    }
  } else if (segments[0] === 'login') {
    customerRoute = 'login';
  } else if (segments[0] === 'cancellation-policy') {
    customerRoute = 'cancellation-policy';
  } else {
    customerRoute = 'not-found';
  }

  return {
    path: cleanPath,
    isAdminRoute: false,
    adminTab: 'dashboard',
    customerRoute,
    customerParams,
  };
}

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return toAppPath(window.location.pathname || '/');
    }
    return '/';
  });

  const [routeState, setRouteState] = useState<RouteState>(() => {
    if (typeof window !== 'undefined') {
      return parsePath(toAppPath(window.location.pathname), window.location.search);
    }
    return parsePath('/');
  });

  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    const target = path.startsWith('/') ? path : `/${path}`;
    if (typeof window !== 'undefined') {
      // Admin pages show under the private link in the address bar (/admin/orders → /drdaina/orders)
      const address = toBrowserPath(target);
      if (options?.replace) {
        window.history.replaceState(null, '', address);
      } else {
        window.history.pushState(null, '', address);
      }
    }
    // Extract pathname and search for parsing
    const url = new URL(target, window.location.origin);
    setCurrentPath(url.pathname);
    setRouteState(parsePath(url.pathname, url.search));
  }, []);

  // A visit that starts on an inner page gets the homepage under it, so Back stays in the store once
  useEffect(() => { seedHomeUnderFirstPage(); }, []);

  // Listen to popstate (browser back / forward buttons)
  useEffect(() => {
    const handlePopState = () => withPageTransition(() => {
      const path = toAppPath(window.location.pathname || '/');
      const search = window.location.search;
      setCurrentPath(path);
      setRouteState(parsePath(path, search));
    });
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openAdminTab = useCallback((tab: string) => {
    const target = tab === 'dashboard' ? '/admin/dashboard' : `/admin/${tab}`;
    navigate(target);
  }, [navigate]);

  const openAdminProductNew = useCallback(() => {
    navigate('/admin/products/new');
  }, [navigate]);

  const openAdminProductEdit = useCallback((id: string) => {
    navigate(`/admin/products/${id}/edit`);
  }, [navigate]);

  const openAdminOrderDetails = useCallback((id: string) => {
    navigate(`/admin/orders/${id}`);
  }, [navigate]);

  const routeParams = useMemo(() => {
    if (routeState.adminEntityId) {
      return { id: routeState.adminEntityId };
    }
    return routeState.customerParams || {};
  }, [routeState]);

  return (
    <RouterContext.Provider
      value={{
        currentPath,
        routeState,
        isAdminRoute: routeState.isAdminRoute,
        activeAdminTab: routeState.adminTab,
        routeParams,
        navigate,
        openAdminTab,
        openAdminProductNew,
        openAdminProductEdit,
        openAdminOrderDetails,
      }}
    >
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = (): RouterContextType => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
};
