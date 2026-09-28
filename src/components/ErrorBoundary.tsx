import React, { Component, ErrorInfo, ReactNode } from 'react';
import { safeLocalStorage } from '../utils/safeStorage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Suit Aura Girls ErrorBoundary caught an error:', error, errorInfo);
    try {
      safeLocalStorage.removeItem('sag_cart_v1');
      safeLocalStorage.removeItem('sag_cart_backup');
    } catch {}
  }

  private handleAutoRecover = () => {
    try {
      safeLocalStorage.clear();
    } catch {}
    this.setState({ hasError: false, error: undefined });
  };

  private handleReload = () => {
    try {
      safeLocalStorage.clear();
      window.location.href = window.location.origin + window.location.pathname;
    } catch {
      this.setState({ hasError: false, error: undefined });
    }
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#2A0710] flex flex-col items-center justify-center p-6 text-center text-[#F7F0E5]">
          <div className="max-w-md w-full bg-[#180306] p-6 sm:p-8 rounded-md border border-[#D7B77A]/30 shadow-xl space-y-4">
            <div className="w-16 h-16 mx-auto bg-[#5C0B1B] text-[#F7F0E5] rounded-full flex items-center justify-center text-2xl font-black shadow-md">
              👑
            </div>
            <h1 className="font-serif text-2xl font-bold text-[#F7F0E5]">Suit Aura Girls</h1>
            <p className="text-xs text-[#F7F0E5]/75 leading-relaxed">
              Updating store view for your browser. Click below to continue shopping our latest Heritage ethnic collection!
            </p>
            <div className="space-y-2.5 pt-2">
              <button
                onClick={this.handleAutoRecover}
                className="w-full py-3.5 bg-[#5C0B1B] hover:bg-[#5C0B1B] active:scale-95 text-[#F7F0E5] font-bold text-xs uppercase tracking-widest rounded shadow-md transition duration-200 cursor-pointer border border-[#D7B77A]/30"
              >
                OPEN STORE NOW 🌸
              </button>
              <button
                onClick={this.handleReload}
                className="w-full py-2.5 bg-transparent text-[#F7F0E5] font-semibold text-[11px] uppercase tracking-wider rounded-lg hover:bg-[#D7B77A]/10 cursor-pointer"
              >
                Reset Store Cache
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
