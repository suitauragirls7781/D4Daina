import React, { Component, ErrorInfo, ReactNode } from 'react';
import { HelpIcon } from './StoreIcons';
import { WhatsAppIcon } from './BrandIcons';
import { createSupportWhatsAppUrl } from '../utils/storeContact';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

const RELOAD_FLAG = 'sag_chunk_reload';

/** Keeps one broken page from blanking the whole store. Never touches the shopper's saved data. */
export class ErrorBoundary extends Component<Props, State> {
  public override state: State = { hasError: false };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const message = String(error?.message || '');
    // After a new deploy an open tab may request old code files; one reload fetches the new ones.
    if (/Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(message)) {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          window.location.reload();
          return;
        }
      } catch {}
    }
    console.error('Page error:', message, errorInfo?.componentStack?.split('\n').slice(0, 4).join('\n'));
  }

  private retry = () => this.setState({ hasError: false });

  public override render() {
    if (!this.state.hasError) return this.props.children;
    return (
      // Plain markup on purpose (no hooks, no shared motion pieces): this page must show even when those fail
      <div data-aura className="min-h-[60vh] px-3 sm:px-6 pt-3 pb-14 lg:pt-6" role="alert">
        <div className="aa-band aa-band-blush mx-auto max-w-[1120px]">
          <span className="aa-ic mb-5 h-14 w-14"><HelpIcon mono className="w-7 h-7" /></span>
          <p className="aura-lbl mb-3">Page error</p>
          <h1 className="aura-h1">Something went <em>wrong</em></h1>
          <p className="aura-sub mt-4 max-w-[42ch]">This page could not be shown. Your bag and account are safe.</p>
          <div className="flex flex-col min-[420px]:flex-row gap-2.5 mt-7 max-w-md">
            <button type="button" onClick={this.retry} className="aura-btn min-[420px]:flex-1">Try again</button>
            <a href="/" className="aura-btn aura-btn-line min-[420px]:flex-1">Homepage</a>
          </div>
          <a href={createSupportWhatsAppUrl('Hi Suit Aura Girls! A page on your website is not opening for me.')} target="_blank" rel="noopener noreferrer"
            className="sag-link mt-4 gap-2">
            <WhatsAppIcon className="w-[18px] h-[18px]" /> Tell us on WhatsApp
          </a>
        </div>
      </div>
    );
  }
}
