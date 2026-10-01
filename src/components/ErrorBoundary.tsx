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
      <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6 py-16" role="alert">
        <div className="max-w-md w-full text-center sag-card rounded-3xl px-6 py-9 sm:p-10">
          <span className="mx-auto w-16 h-16 rounded-full bg-[#F3EEF8] flex items-center justify-center">
            <HelpIcon className="w-8 h-8" />
          </span>
          <h1 className="font-serif text-[32px] leading-tight text-[#4B1D3F] mt-5">Something went wrong</h1>
          <p className="text-[15px] leading-7 text-[#2A1A26]/70 mt-2">This page could not be shown. Your bag and account are safe.</p>
          <div className="flex flex-col min-[420px]:flex-row gap-2.5 justify-center mt-6">
            <button onClick={this.retry} className="sag-btn-primary h-12 px-7 text-sm font-semibold cursor-pointer">Try again</button>
            <a href="/" className="sag-btn-outline h-12 px-7 inline-flex items-center justify-center text-sm font-semibold">Homepage</a>
          </div>
          <a href={createSupportWhatsAppUrl('Hi Suit Aura Girls! A page on your website is not opening for me.')} target="_blank" rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#4B1D3F] hover:underline underline-offset-4">
            <WhatsAppIcon className="w-4 h-4" /> Tell us on WhatsApp
          </a>
        </div>
      </div>
    );
  }
}
