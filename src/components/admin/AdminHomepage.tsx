import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableHomepageSection } from './SortableHomepageSection';
import { HomeIcon } from '../StoreIcons';
import { AdminPageHeader } from './kidsToysShared';
import { Empty, Panel, Tile, Tiles, kit } from './AdminPaymentGateways';
import {
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
  Clapperboard,
  Baby
} from 'lucide-react';
import { AdminTab } from '../../types';

const ICON = 'w-5 h-5 text-brand';

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
      case 'brandHeader':
      case 'newArrivals':
        return <Sparkles className={ICON} />;
      case 'comboOffers':
      case 'dealOfTheDay':
      case 'festive':
        return <Gift className={ICON} />;
      case 'categoryGrid':
        return <LayoutGrid className={ICON} />;
      case 'artisanalPromises':
      case 'whyShop':
        return <ShieldCheck className={ICON} />;
      case 'specialOffer':
        return <Flame className={ICON} />;
      case 'auraReels':
        return <Clapperboard className={ICON} />;
      case 'kidsCorner':
        return <Baby className={ICON} />;
      case 'instagram':
      case 'newsletter':
      case 'reviews':
        return <Star className={ICON} />;
      case 'bestSellers':
        return <Award className={ICON} />;
      case 'trending':
        return <TrendingUp className={ICON} />;
      default:
        return <Layers className={ICON} />;
    }
  };

  // One plain line per section: what a visitor sees there and where it is managed
  const getSectionDescription = (key: string) => {
    switch (key) {
      case 'hero':
        return 'The big photo slides at the top of the homepage. Change them in Hero slides.';
      case 'dealOfTheDay':
        return 'One product shown as today\'s deal, with a countdown when you set one. Change it in Deal of the Day.';
      case 'comboOffers':
        return 'The combo offer: a discount when a shopper buys enough outfits. Change it in Combo offer.';
      case 'categoryGrid':
        return 'Photos of your categories; a tap opens that category.';
      case 'brandHeader':
        return 'The announcement line and brand messages at the top of the store.';
      case 'artisanalPromises':
        return 'The short promises about shipping, quality, exchange and payment.';
      case 'specialOffer':
        return 'The wide offer banner. Change it in Banners.';
      case 'auraReels':
        return 'Your product videos. Upload and arrange them in Aura Reels.';
      case 'kidsCorner':
        return 'Baby Girls, Baby Boys and Toys added in Admin → Kids Wear and Toys (shows only when they have styles in stock).';
      case 'instagram':
        return 'Your Instagram reels and posts. Add them in Instagram reels.';
      case 'newsletter':
        return 'The box where a visitor leaves an email address for news and offers.';
      case 'newArrivals':
        return 'The newest products in the catalogue.';
      case 'bestSellers':
        return 'The products marked as best sellers.';
      case 'trending':
        return 'The products marked as trending.';
      case 'festive':
        return 'The festive collection for weddings and celebrations.';
      case 'whyShop':
        return 'The four reasons to shop with you (delivery, fabric, exchange, payment).';
      case 'reviews':
        return 'Customer ratings and reviews. Manage them in Reviews.';
      default:
        return 'A part of the homepage.';
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
    <div id="admin-homepage-page" className="space-y-5 pb-8">

      {/* Header */}
      <AdminPageHeader
        eyebrow="Storefront layout"
        title="Homepage sections"
        icon={<HomeIcon live={false} />}
        description="Choose which parts of the homepage are shown and in what order. The order here is the order visitors see, top to bottom."
        actions={
          <button
            type="button"
            onClick={() => setActivePage('home')}
            className={kit.primary}
          >
            <ExternalLink className="w-4 h-4 text-current" />
            <span>Preview live store</span>
          </button>
        }
      />

      {/* Key numbers */}
      <Tiles className="!grid-cols-3 lg:!grid-cols-3">
        <Tile label="Sections in all" value={homepageSections.length} />
        <Tile label="Shown on the homepage" value={enabledCount} />
        <Tile label="Hidden" value={disabledCount} />
      </Tiles>

      {/* Section order */}
      <Panel
        title="Section order"
        hint="Hold the dots at the left and drag a section up or down. Use the switch at the right to show or hide it. Every change saves by itself."
      >
        {homepageSections.length === 0 ? (
          <Empty icon={<Layers />} title="No sections to show yet">The homepage sections are still loading, or none have been set up. Try "Reset default order" below.</Empty>
        ) : (
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
        )}

        {/* Saved to storefront_settings/homepageSections; shoppers get it in the shared catalogue (5-minute cache, src/lib/catalog.ts) */}
        <p className={`mt-4 ${kit.note} flex items-start gap-2.5`}>
          <Sparkles className="w-4 h-4 text-brand shrink-0 mt-0.5" />
          <span>Changes are saved for every shopper. The store shows them within about 5 minutes.</span>
        </p>
      </Panel>

      {/* Start again: kept apart from the list, and asks first */}
      <Panel
        title="Start again"
        hint="Puts every section back in the original order and switches all of them on. You will be asked to confirm."
        action={
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={isResetting}
            className={kit.outline}
            title="Reset to default order"
          >
            <RotateCcw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
            <span>Reset default order</span>
          </button>
        }
      />
    </div>
  );
};
