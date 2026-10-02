import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableHomepageSection } from './SortableHomepageSection';
import { HomeIcon } from '../StoreIcons';
import { AdminPageHeader } from './kidsToysShared';
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
    <div id="admin-homepage-page" className="space-y-6 pb-12">
      
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
            className="h-11 px-4 bg-white hover:bg-sunken text-ink border border-line rounded-full text-sm font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer"
            title="Reset to default order"
          >
            <RotateCcw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
            <span>Reset default order</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage('home')}
            className="h-11 px-5 bg-brand hover:bg-brand-dark text-white rounded-full text-sm font-semibold transition-colors inline-flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <ExternalLink className="w-4 h-4 text-current" />
            <span>Preview live store</span>
          </button>
        </>}
      />

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-line shadow-[var(--sag-shadow)] flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Total Sections</span>
            <div className="font-serif text-2xl sm:text-3xl leading-tight text-ink">{homepageSections.length}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-sunken text-ink flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4 text-current" />
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-line shadow-[var(--sag-shadow)] flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Active (Visible on Home)</span>
            <div className="font-serif text-2xl sm:text-3xl leading-tight text-emerald-700">{homepageSections.filter(s => s.enabled !== false).length}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <Eye className="w-4 h-4 text-current" />
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-line shadow-[var(--sag-shadow)] flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Hidden Sections</span>
            <div className="font-serif text-2xl sm:text-3xl leading-tight text-ink-faint">{homepageSections.filter(s => s.enabled === false).length}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-sunken text-ink-muted flex items-center justify-center shrink-0">
            <EyeOff className="w-4 h-4 text-current" />
          </div>
        </div>
      </div>

      {/* Main Section Order Cards */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-line shadow-[var(--sag-shadow)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-sunken text-ink flex items-center justify-center shrink-0"><Sliders className="w-4 h-4 text-current" /></span>
            <div>
            <h3 className="font-serif text-xl font-semibold text-ink">
              Section order
            </h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Drag the handle to move a section. Top to bottom order matches exactly how visitors see the homepage.
            </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 h-8 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-current" />
            <span>Preview Updated</span>
          </div>
        </div>

        {/* List of Sections */}
        <div className="space-y-2.5">
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
        <div className="p-4 bg-sunken rounded-2xl border border-line text-xs text-ink-muted flex items-start gap-3 mt-4">
          <Sparkles className="w-4 h-4 text-ink shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-ink">Homepage Preview Controls:</span>
            <p className="text-ink-muted text-[11px]">
              Changes apply immediately in this browser and are stored locally. Shared publishing across devices requires secure server-side configuration.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
