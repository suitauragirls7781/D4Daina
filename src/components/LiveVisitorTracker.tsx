import React, { useEffect, useRef } from 'react';
import { useShop } from '../context/ShopContext';
import { recordHeartbeat, touchActivity } from '../utils/visitorTracker';
import { captureUtmParams } from '../utils/utmTracker';

export const LiveVisitorTracker: React.FC = () => {
  const { activePage } = useShop();
  const pageRef = useRef('home');

  useEffect(() => {
    captureUtmParams();
    const currentPage = activePage || (typeof window !== 'undefined' ? window.location.pathname : 'home');
    pageRef.current = currentPage;
    recordHeartbeat(currentPage);
  }, [activePage]);

  // While the tab is open and visible the shopper is still active; coming back to the tab
  // after 30+ minutes away starts a new visit.
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') touchActivity(); }, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') recordHeartbeat(pageRef.current); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
};
