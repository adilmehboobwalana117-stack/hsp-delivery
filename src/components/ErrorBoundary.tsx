import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
  isChunkError: boolean;
}

const CHUNK_RELOAD_KEY = 'hsp_chunk_reload_once';

function isDynamicImportError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('failed to fetch dynamically imported module') ||
    lower.includes('importing a module script failed') ||
    lower.includes('loading chunk') ||
    lower.includes('chunkloaderror')
  );
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    const message = error?.message || 'An unexpected error occurred.';
    return {
      hasError: true,
      message,
      isChunkError: isDynamicImportError(message),
    };
  }

  componentDidCatch(error: Error) {
    console.error('HSP food ErrorBoundary caught:', error);
    const message = error?.message || '';
    if (isDynamicImportError(message) && typeof window !== 'undefined') {
      try {
        if (!window.sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          window.sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          window.location.reload();
        }
      } catch {
        // ignore storage errors
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[320px] flex flex-col items-center justify-center p-8 text-center bg-[#111114]/80 backdrop-blur-md border border-amber-500/30 rounded-2xl m-4 shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-yellow-400 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-extrabold text-white mb-2">
            {this.state.isChunkError ? 'App Update Available' : 'Something went wrong'}
          </h2>
          <p className="text-sm font-semibold text-zinc-300 max-w-md mb-6 break-words">
            {this.state.isChunkError
              ? 'A workspace module refreshed in the background. Reload to load the latest version cleanly.'
              : this.state.message}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                try {
                  window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
                } catch {
                  // ignore
                }
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-400 text-zinc-950 text-sm font-extrabold hover:bg-yellow-300 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reload App
            </button>
            {!this.state.isChunkError && (
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '', isChunkError: false })}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm font-bold hover:border-amber-400 transition-colors"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
