import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[React Global ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  private handleClearCacheAndReload = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen bg-slate-950 flex items-center justify-center p-6 font-sans text-white">
          <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 animate-in fade-in duration-300">
            {/* Header Icon */}
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">Something Went Wrong</h1>
                <p className="text-sm text-slate-400 mt-0.5">The application encountered an unexpected UI render error.</p>
              </div>
            </div>

            {/* Error Message Box */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-2 overflow-x-auto">
              <p className="text-rose-400 font-semibold">{this.state.error?.toString() || 'Unknown Error'}</p>
              {this.state.errorInfo && (
                <details className="mt-2 text-slate-500 cursor-pointer">
                  <summary className="hover:text-slate-300 transition-colors text-[11px]">View Component Stack Trace</summary>
                  <pre className="mt-2 text-[10px] text-slate-400 whitespace-pre-wrap font-mono">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="w-full sm:w-auto flex-1 px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm shadow-lg shadow-purple-500/25 flex items-center justify-center space-x-2 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>

              <button
                onClick={this.handleClearCacheAndReload}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-sm border border-slate-700 flex items-center justify-center space-x-2 transition-all"
              >
                <Trash2 className="w-4 h-4 text-slate-400" />
                <span>Reset Cache</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
