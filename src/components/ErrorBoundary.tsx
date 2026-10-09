import React, { Component, ErrorInfo, ReactNode } from 'react';
import { HelpIcon } from './StoreIcons';
import { WhatsAppIcon } from './BrandIcons';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { SectionTitle } from './SectionTitle';

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
      <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6 py-10 lg:py-16" role="alert">
        <div className="max-w-md w-full sag-glass rounded-xl! px-5 py-9 sm:px-8 text-center">
          <span className="flex justify-center text-sale"><HelpIcon mono className="w-7 h-7" /></span>
          <SectionTitle as="h1" className="mt-3" title="Something went wrong" sub="This page could not be shown. Your bag and account are safe." />
          <div className="flex flex-col min-[420px]:flex-row gap-2.5 mt-6">
            <button type="button" onClick={this.retry} className="sag-btn-primary min-[420px]:flex-1">Try again</button>
            <a href="/" className="sag-btn-outline min-[420px]:flex-1">Homepage</a>
          </div>
          <a href={createSupportWhatsAppUrl('Hi Suit Aura Girls! A page on your website is not opening for me.')} target="_blank" rel="noopener noreferrer"
            className="sag-link mt-4 justify-center gap-2">
            <WhatsAppIcon className="w-[18px] h-[18px]" /> Tell us on WhatsApp
          </a>
        </div>
      </div>
    );
  }
}
