import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ChunkErrorBoundaryProps {
  label: string;
  fullViewport?: boolean;
  onRetry?: () => void;
  children: React.ReactNode;
}

interface ChunkErrorBoundaryState {
  hasError: boolean;
  retryCount: number;
}

export class ChunkErrorBoundary extends React.Component<
  ChunkErrorBoundaryProps,
  ChunkErrorBoundaryState
> {
  state: ChunkErrorBoundaryState = {
    hasError: false,
    retryCount: 0
  };

  static getDerivedStateFromError(): Partial<ChunkErrorBoundaryState> {
    return { hasError: true };
  }

  private handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      retryCount: prev.retryCount + 1
    }));
    this.props.onRetry?.();
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className={
            this.props.fullViewport
              ? 'h-[100dvh] w-full flex items-center justify-center p-6 bg-[#070b14] text-slate-100'
              : 'min-h-[55vh] w-full flex items-center justify-center p-6 text-slate-100'
          }
          role="alert"
        >
          <div className="max-w-md w-full rounded-2xl bg-slate-900/90 border border-red-500/40 p-6 text-center shadow-2xl space-y-4">
            <div className="mx-auto w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/35 flex items-center justify-center text-red-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="font-cinzel font-bold text-base text-white">
                Failed to load {this.props.label}
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                A network interruption prevented this view chunk from loading cleanly.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Retry
              </button>
              {this.state.retryCount > 0 && (
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Reload App
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
