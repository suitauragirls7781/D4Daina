import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { PhoneFrame } from './storefrontPreview';
import { SortableHomepageSection } from './SortableHomepageSection';
import { HomeIcon } from '../StoreIcons';
import { AdminPageHeader } from './adminShared';
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
  Clapperboard
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
      case 'instagram':
        return 'Instagram reels. This section is no longer drawn on the home page (taken off at your request); the reels stay in Instagram reels.';
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

  // Mouse, finger (a short hold, so the page still scrolls) and keyboard (space to lift, arrows to move)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const moveOne = async (id: string, title: string, direction: 'up' | 'down') => {
    try {
      await moveHomepageSection(id, direction);
      showToast(`Moved "${title}" ${direction}.`, 'info');
    } catch {
      showToast('Could not save the new order. Please try again.', 'error');
    }
  };

  // What the home page really draws, top to bottom, with the storefront's own rules (HomePage.tsx): the hero
  // always opens the page; right under it come the festive offer (when a round is live), the store facts band
  // and the deal; Instagram is never drawn; the four promises are left out while the hero is on.
  const onKeys = new Set(homepageSections.filter((s) => s.enabled !== false).map((s) => s.key));
  const heroOn = onKeys.has('hero');
  const dealOn = heroOn && onKeys.has('dealOfTheDay');
  const notDrawnWhy = (key: string): string => {
    if (key === 'instagram') return 'Never drawn on the home page now, even when switched on.';
    if (key === 'artisanalPromises' && heroOn) return 'Not drawn while the hero is on: the band under the hero shows the same facts.';
    return '';
  };
  const placeWhy = (key: string): string => {
    if (key === 'dealOfTheDay' && dealOn) return 'Drawn straight under the hero, wherever it sits in this list.';
    if (key === 'hero' && heroOn && homepageSections.findIndex((s) => s.key === 'hero') > 0) return 'Always drawn first on the page, wherever it sits in this list.';
    return '';
  };
  type Block = { id: string; title: string; key: string; extra?: boolean };
  const drawn: Block[] = [];
  const rest = homepageSections.filter((s) => s.enabled !== false && s.key !== 'instagram' && s.key !== 'hero' && !(dealOn && s.key === 'dealOfTheDay') && !(heroOn && s.key === 'artisanalPromises'));
  if (heroOn) {
    const hero = homepageSections.find((s) => s.key === 'hero');
    drawn.push({ id: hero?.id || 'hero', title: hero?.title || 'Hero', key: 'hero' });
    drawn.push({ id: 'x-festive', title: 'Festive offer (only while a round is live)', key: 'festive-notice', extra: true });
    drawn.push({ id: 'x-facts', title: 'Store facts band', key: 'facts', extra: true });
    if (dealOn) {
      const deal = homepageSections.find((s) => s.key === 'dealOfTheDay');
      drawn.push({ id: deal?.id || 'deal', title: deal?.title || 'Deal of the day', key: 'dealOfTheDay' });
    }
  } else {
    drawn.push({ id: 'x-festive', title: 'Festive offer (only while a round is live)', key: 'festive-notice', extra: true });
  }
  rest.forEach((s) => drawn.push({ id: s.id, title: s.title, key: s.key }));
  const blockLook = (key: string) => {
    if (key === 'hero') return 'h-28 bg-surface';
    if (key === 'dealOfTheDay' || key === 'specialOffer' || key === 'comboOffers') return 'h-14 bg-sunken-deep';
    if (key === 'whyShop' || key === 'artisanalPromises') return 'h-12 bg-ok-tint';
    if (key === 'reviews' || key === 'newsletter') return 'h-12 bg-blush';
    if (key === 'facts' || key === 'festive-notice') return 'h-7 bg-sunken border border-dashed border-line';
    return 'h-16 bg-surface';
  };
  const jumpTo = (id: string) => {
    const row = document.getElementById(`homepage-row-${id}`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    row.animate?.([{ opacity: 0.4 }, { opacity: 1 }], { duration: 500 });
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
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

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      {/* Phone mock-up: the home page as it is drawn now, top to bottom */}
      <aside aria-label="Home page outline" className="xl:order-2 xl:sticky xl:top-24 sag-glass p-4 min-w-0">
        <h3 className={kit.h2}>The home page, top to bottom</h3>
        <p className={`mt-1 ${kit.hint}`}>What visitors get right now. Tap a part to find it in the list.</p>
        <div className="mt-4">
          <PhoneFrame label="Outline of the home page on a phone">
            <ol className="px-3 pb-4 pt-1 space-y-2 max-h-[560px] overflow-y-auto overscroll-contain">
              <li aria-hidden="true" className="h-6 rounded-full bg-surface flex items-center px-3 text-[10px] font-extrabold tracking-[0.12em] text-ink">SUIT <em className="font-display mx-1 text-[12px]">Aura</em> GIRLS</li>
              {drawn.map((block) => (
                <li key={block.id}>
                  {block.extra ? (
                    <span className={`w-full rounded-[12px] px-2.5 flex items-center text-[11px] leading-4 text-ink-muted ${blockLook(block.key)}`}>{block.title}</span>
                  ) : (
                    <button type="button" onClick={() => jumpTo(block.id)} className={`w-full rounded-[14px] px-2.5 py-2 flex items-start justify-between gap-2 text-left cursor-pointer transition-transform motion-safe:hover:-translate-y-0.5 ${blockLook(block.key)}`}>
                      <span className="min-w-0 text-[12px] leading-4 font-bold text-ink line-clamp-2">{block.title}</span>
                    </button>
                  )}
                </li>
              ))}
              <li aria-hidden="true" className="h-10 rounded-[14px] flex items-center px-3 text-[10px] font-bold tracking-[0.12em]" style={{ background: 'var(--aura-ink)', color: 'var(--aura-paper)' }}>FOOTER</li>
            </ol>
          </PhoneFrame>
        </div>
      </aside>
      <div className="space-y-5 min-w-0">
      {/* Section order */}
      <Panel
        title="Section order"
        hint="Drag a section by the dots at the left (on a phone: hold, then drag), or use the arrows. The switch shows or hides it. Every change saves by itself."
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
                    onMove={(direction) => moveOne(sec.id, sec.title, direction)}
                    isFirst={index === 0}
                    isLast={index === homepageSections.length - 1}
                    notDrawn={notDrawnWhy(sec.key)}
                    placeNote={placeWhy(sec.key)}
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
      </div>
    </div>
  );
};
