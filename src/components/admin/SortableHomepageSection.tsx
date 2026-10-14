import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { AdminTab } from '../../types';
import { Pill, Switch, kit } from './AdminPaymentGateways';

interface SortableSectionProps {
  sec: any; // Using any for now based on previous code
  index: number;
  shortcut: { label: string; tab: AdminTab } | null;
  isEnabled: boolean;
  getSectionIcon: (key: string) => React.ReactNode;
  getSectionDescription: (key: string) => string;
  setAdminTab: (tab: AdminTab) => void;
  toggleHomepageSection: (id: string) => Promise<void>;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
  /** Moves the section one place up or down (buttons for a phone and the keyboard; drag stays). */
  onMove?: (direction: 'up' | 'down') => void;
  isFirst?: boolean;
  isLast?: boolean;
  /** Why a switched-on section is still not drawn on the home page (the storefront's own rules). */
  notDrawn?: string;
  /** Where the home page puts a switched-on section when that is not its place in the list. */
  placeNote?: string;
}

export const SortableHomepageSection: React.FC<SortableSectionProps> = ({
  sec, index, shortcut, isEnabled, getSectionIcon, getSectionDescription, setAdminTab, toggleHomepageSection, showToast, onMove, isFirst, isLast, notDrawn, placeNote
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sec.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      id={`homepage-row-${sec.id}`}
      style={style}
      className={`pl-1 pr-3 py-2.5 rounded-[16px] border transition-colors duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-x-3 gap-y-2 ${
        isDragging ? 'shadow-[var(--sag-shadow-pop)] border-brand-line' : 'border-line'
      } ${isEnabled ? 'bg-sunken-deep' : 'bg-sunken'}`}
    >
      <div className="flex items-center gap-1 min-w-0">
        <div {...attributes} {...listeners} title="Drag to reorder" aria-label={`Drag to reorder ${sec.title}`} className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing text-ink-muted hover:text-ink hover:bg-sunken-deep transition-colors touch-none">
          <GripVertical className="w-5 h-5 text-current" />
        </div>

        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-7 text-center text-lg leading-7 font-semibold sag-num shrink-0 ${isEnabled ? 'text-brand' : 'text-ink-faint'}`}>
            {index + 1}
          </div>

          <div aria-hidden="true" className={`w-9 h-9 hidden min-[420px]:flex items-center justify-center shrink-0 ${isEnabled ? '' : 'opacity-50'}`}>
            {getSectionIcon(sec.key)}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <h4 className={`text-[15px] leading-5 font-semibold min-w-0 break-words ${isEnabled ? 'text-ink' : 'text-ink-muted'}`}>
                {sec.title}
              </h4>
              <Pill tone={isEnabled ? (notDrawn ? 'soon' : 'live') : 'off'}>{isEnabled ? (notDrawn ? 'On, but not drawn' : 'Live on the site') : 'Off'}</Pill>
            </div>
            <p className={`${kit.hint} mt-1 line-clamp-2`}>
              {getSectionDescription(sec.key)}
            </p>
            {isEnabled && notDrawn && <p className="mt-1 text-[13px] leading-[18px] font-medium text-brand">{notDrawn}</p>}
            {isEnabled && !notDrawn && placeNote && <p className="mt-1 text-[13px] leading-[18px] text-ink">{placeNote}</p>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pl-11 sm:pl-0 shrink-0">
        {onMove && (
          <span className="inline-flex">
            <button type="button" onClick={() => onMove('up')} disabled={isFirst} className={kit.iconBtn} aria-label={`Move ${sec.title} up`} title="Move up">
              <ArrowUp className="w-4 h-4 text-current" />
            </button>
            <button type="button" onClick={() => onMove('down')} disabled={isLast} className={kit.iconBtn} aria-label={`Move ${sec.title} down`} title="Move down">
              <ArrowDown className="w-4 h-4 text-current" />
            </button>
          </span>
        )}
        {shortcut && isEnabled && (
          <button
            type="button"
            onClick={() => setAdminTab(shortcut.tab)}
            className={`${kit.small} whitespace-nowrap`}
          >
            <span>{shortcut.label}</span>
            <ChevronRight className="w-3.5 h-3.5 text-current" />
          </button>
        )}

        <span title={isEnabled ? 'Visible: tap to hide' : 'Hidden: tap to show'} className="inline-flex">
          <Switch
            checked={isEnabled}
            label={`Show ${sec.title} on the homepage`}
            onChange={async () => {
              await toggleHomepageSection(sec.id);
              showToast(`Section "${sec.title}" is now ${!isEnabled ? 'Visible' : 'Hidden'} on storefront.`, 'info');
            }}
          />
        </span>
      </div>
    </div>
  );
};
