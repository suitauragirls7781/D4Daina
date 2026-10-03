import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableHomepageSection } from './SortableHomepageSection';
import { HomeIcon } from '../StoreIcons';
import { AdminPageHeader, tone, ui } from './kidsToysShared';
import { 
  Eye, 
  EyeOff, 
  CheckCircle2,
  ExternalLink,
  Layers,
  Sparkles,
  Flame,
  LayoutGrid,
  TrendingUp,
  Award,
  Gift,
  ShieldCheck,
  Star,
  RotateCcw,
  Sliders,
  ChevronRight,
  Check,
  Clapperboard,
  Baby
} from 'lucide-react';
import { AdminTab } from '../../types';

export const AdminHomepage: React.FC = () => {
  const { 
    homepageSections = [], 
    toggleHomepageSection, 
    moveHomepageSection,
    reorderHomepageSections,
    resetHomepageSectionsToDefault,
    setAdminTab
  } = useAdmin();
  const { showToast, setActivePage } = useShop();
  const [isResetting, setIsResetting] = useState(false);

  const getSectionIcon = (key: string) => {
    switch (key) {
      case 'hero':
        return <Sparkles className="w-4 h-4 text-ink" />;
      case 'comboOffers':
      case 'dealOfTheDay':
        return <Gift className="w-4 h-4 text-ink" />;
      case 'categoryGrid':
        return <LayoutGrid className="w-4 h-4 text-ink" />;
      case 'brandHeader':
        return <Sparkles className="w-4 h-4 text-ink" />;
      case 'artisanalPromises':
        return <ShieldCheck className="w-4 h-4 text-ink" />;
      case 'specialOffer':
        return <Flame className="w-4 h-4 text-ink-muted" />;
      case 'auraReels':
        return <Clapperboard className="w-4 h-4 text-ink" />;
      case 'kidsCorner':
        return <Baby className="w-4 h-4 text-ink" />;
      case 'instagram':
      case 'newsletter':
        return <Star className="w-4 h-4 text-ink" />;
      case 'newArrivals':
        return <Sparkles className="w-4 h-4 text-sale" />;
      case 'bestSellers':
        return <Award className="w-4 h-4 text-ink" />;
      case 'trending':
        return <TrendingUp className="w-4 h-4 text-ink" />;
      case 'festive':
        return <Gift className="w-4 h-4 text-ink-muted" />;
      case 'whyShop':
        return <ShieldCheck className="w-4 h-4 text-ink" />;
      case 'reviews':
        return <Star className="w-4 h-4 text-ink-muted fill-star" />;
      default:
        return <Layers className="w-4 h-4 text-ink-muted" />;
    }
  };

  const getSectionDescription = (key: string) => {
    switch (key) {
      case 'hero':
        return 'Square 1:1 luxury showcase slider with direct Buy Now actions.';
      case 'dealOfTheDay':
        return 'Promotional Limited-Time Product Spotlight & Countdown Timer for Meta/Instagram Ads.';
      case 'comboOffers':
        return 'Royal Multi-Buy Combo Offer Builder (Buy 2 Suits Get Extra 15% OFF).';
      case 'categoryGrid':
        return 'Visual image grid linking to Suits, Kurtis, Anarkali & Dresses.';
      case 'brandHeader':
        return 'Announcement ticker and brand messages at the top of the storefront.';
      case 'artisanalPromises':
        return 'Shipping, craftsmanship, exchange, and payment trust promises.';
      case 'specialOffer':
        return 'Promotional campaign banner controlled from Banner Management.';
      case 'auraReels':
        return 'Vertical product videos managed in Aura Reels (upload, order, link products).';
      case 'kidsCorner':
        return 'Baby Girls, Baby Boys and Toys added in Admin → Kids Wear and Toys (shows only when they have styles in stock).';
      case 'instagram':
        return 'Social media lookbook gallery.';
      case 'newsletter':
        return 'Customer newsletter signup form.';
      case 'newArrivals':
        return 'Latest catalog additions with fresh tags and quick view.';
      case 'bestSellers':
        return 'Top customer-favorite suits and bestselling ensembles.';
      case 'trending':
        return 'High-engagement viral styles and trending collections.';
      case 'festive':
        return 'Royal festive edit for weddings and special celebrations.';
      case 'whyShop':
        return 'Four core trust pillars: Express Shipping, Pure Fabric, Easy Exchanges, 100% Prepaid.';
      case 'reviews':
        return 'Verified customer ratings, feedback, and photo reviews carousel.';
      default:
        return 'Storefront content module.';
    }
  };

  const getSectionAdminShortcut = (key: string): { label: string; tab: AdminTab } | null => {
    switch (key) {
      case 'hero':
        return { label: 'Edit Slides', tab: 'hero' };
      case 'dealOfTheDay':
        return { label: 'Edit Deal', tab: 'dealOfTheDay' as AdminTab };
      case 'comboOffers':
        return { label: 'Edit Combo', tab: 'comboOffers' as AdminTab };
      case 'specialOffer':
        return { label: 'Edit Banner', tab: 'banners' };
      case 'reviews':
        return { label: 'Manage Reviews', tab: 'reviews' };
      default:
        return null;
    }
  };

  const moveToExtreme = async (index: number, position: 'top' | 'bottom') => {
    const list = [...homepageSections];
    const item = list.splice(index, 1)[0];
    if (position === 'top') {
      list.unshift(item);
    } else {
      list.push(item);
    }
    await reorderHomepageSections(list);
    showToast(`Moved "${item.title}" to ${position}.`, 'info');
  };

  const handleResetDefaults = async () => {
    if (window.confirm('Reset homepage sections to default order and enable all sections?')) {
      setIsResetting(true);
      try {
        await resetHomepageSectionsToDefault();
        showToast('Homepage layout reset to the default order.', 'success');
      } catch (e) {
        console.error(e);
        showToast('Error resetting layout', 'error');
      } finally {
        setIsResetting(false);
      }
    }
  };

  const enabledCount = homepageSections.filter(s => s.enabled !== false).length;
  const disabledCount = homepageSections.length - enabledCount;

  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = homepageSections.findIndex((item) => item.id === active.id);
      const newIndex = homepageSections.findIndex((item) => item.id === over.id);
      const newSections = arrayMove(homepageSections, oldIndex, newIndex);
      await reorderHomepageSections(newSections);
      showToast('Homepage layout reordered!', 'success');
    }
  };

  return (
    <div id="admin-homepage-page" className="space-y-4 pb-8">
      
      {/* Header */}
      <AdminPageHeader
        eyebrow="Storefront layout"
        title="Homepage sections"
        icon={<HomeIcon live={false} />}
        description="Drag sections to change their order, and show or hide them. The order here is the order visitors see on the homepage."
        actions={<>
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={isResetting}
            className={ui.outline}
            title="Reset to default order"
          >
            <RotateCcw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
            <span>Reset default order</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage('home')}
            className={ui.primary}
          >
            <ExternalLink className="w-4 h-4 text-current" />
            <span>Preview live store</span>
          </button>
        </>}
      />

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="min-w-0 bg-white px-3 py-3 sm:px-4 rounded-2xl border border-line flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className={`block ${ui.eyebrow}`}>Total sections</span>
            <div className={ui.stat}>{homepageSections.length}</div>
          </div>
          <div className="w-9 h-9 rounded-[10px] bg-sunken text-ink flex items-center justify-center shrink-0" aria-hidden="true">
            <Layers className="w-4 h-4 text-current" />
          </div>
        </div>

        <div className="min-w-0 bg-white px-3 py-3 sm:px-4 rounded-2xl border border-line flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className={`block ${ui.eyebrow}`}>Active (visible on home)</span>
            <div className={`${ui.stat} !text-ok`}>{homepageSections.filter(s => s.enabled !== false).length}</div>
          </div>
          <div className="w-9 h-9 rounded-[10px] bg-ok-tint text-ok flex items-center justify-center shrink-0" aria-hidden="true">
            <Eye className="w-4 h-4 text-current" />
          </div>
        </div>

        <div className="min-w-0 bg-white px-3 py-3 sm:px-4 rounded-2xl border border-line flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className={`block ${ui.eyebrow}`}>Hidden sections</span>
            <div className={`${ui.stat} !text-ink-muted`}>{homepageSections.filter(s => s.enabled === false).length}</div>
          </div>
          <div className="w-9 h-9 rounded-[10px] bg-sunken text-ink-muted flex items-center justify-center shrink-0" aria-hidden="true">
            <EyeOff className="w-4 h-4 text-current" />
          </div>
        </div>
      </div>

      {/* Main Section Order Cards */}
      <div className={`${ui.card} space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-[10px] bg-sunken text-ink flex items-center justify-center shrink-0" aria-hidden="true"><Sliders className="w-[18px] h-[18px] text-current" /></span>
            <div>
            <h3 className={ui.h2}>
              Section order
            </h3>
            <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">
              Drag the handle to move a section. Top to bottom order matches exactly how visitors see the homepage.
            </p>
            </div>
          </div>

          <div className={`${ui.badge} ${tone.ok}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-current" />
            <span>Preview Updated</span>
          </div>
        </div>

        {/* List of Sections */}
        <div className="space-y-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={homepageSections.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {homepageSections.map((sec, index) => (
                <SortableHomepageSection
                  key={sec.id}
                  sec={sec}
                  index={index}
                  shortcut={getSectionAdminShortcut(sec.key)}
                  isEnabled={sec.enabled !== false}
                  getSectionIcon={getSectionIcon}
                  getSectionDescription={getSectionDescription}
                  setAdminTab={setAdminTab}
                  toggleHomepageSection={toggleHomepageSection}
                  showToast={showToast}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Live sync helper box */}
        <div className="px-3.5 py-3 bg-page rounded-xl border border-line text-[13px] leading-[18px] text-ink-muted flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-ink shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-ink">Homepage Preview Controls:</span>
            <p className="text-ink-muted">
              Changes apply immediately in this browser and are stored locally. Shared publishing across devices requires secure server-side configuration.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
