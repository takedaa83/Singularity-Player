import { Component, ReactNode, StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { HashRouter } from 'react-router-dom'
import { getMuiTheme } from './theme/muiTheme'
import { useSettingsStore } from './stores/settingsStore'
import './index.css'
import App from './App.tsx'

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

// Automatic Vite chunk reload handler on new deployments
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite] Dynamic chunk preload error detected. Auto-refreshing page...');
  const lastReload = sessionStorage.getItem('singularity_chunk_reload');
  const now = Date.now();
  if (!lastReload || now - Number(lastReload) > 8000) {
    sessionStorage.setItem('singularity_chunk_reload', String(now));
    window.location.reload();
  }
});

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[Global ErrorBoundary] Caught error:', error, errorInfo);
    // If a chunk failed to fetch due to a new release, auto-reload once to refresh cache
    if (error?.message && (
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Importing a module script failed') ||
      error.message.includes('text/html')
    )) {
      const lastReload = sessionStorage.getItem('singularity_chunk_reload');
      const now = Date.now();
      if (!lastReload || now - Number(lastReload) > 8000) {
        sessionStorage.setItem('singularity_chunk_reload', String(now));
        window.location.reload();
      }
    }
  }

  handleClearCacheAndReload = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          width: '100vw',
          backgroundColor: '#070707',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          padding: '20px',
          boxSizing: 'border-box'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '8px' }}>Something went wrong loading the app</h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '24px' }}>{this.state.error?.message || 'An unexpected error occurred.'}</p>
          <button
            onClick={this.handleClearCacheAndReload}
            style={{
              padding: '10px 20px',
              backgroundColor: '#f59e0b',
              color: '#000000',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Clear Cache &amp; Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const DynamicThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accentColor = useSettingsStore((s) => s.settings.accentColor);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(
    document.documentElement.classList.contains('light') ? 'light' : 'dark'
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isLight = document.documentElement.classList.contains('light');
      setThemeMode(isLight ? 'light' : 'dark');
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const isLight = document.documentElement.classList.contains('light');
    setThemeMode(isLight ? 'light' : 'dark');

    return () => observer.disconnect();
  }, []);

  const currentTheme = getMuiTheme(themeMode, accentColor);

  return <ThemeProvider theme={currentTheme}>{children}</ThemeProvider>;
};

import { validateAndRepairBaseUrl } from './utils/api'

// Probe the stored custom server URL once on startup. If it's unreachable
// (e.g. leftover localhost:3001 from a dev session), clear it so the app
// falls back to VITE_API_URL / the hardcoded Koyeb default automatically.
validateAndRepairBaseUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <DynamicThemeProvider>
        <CssBaseline />
        <HashRouter>
          <App />
        </HashRouter>
      </DynamicThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// Register Service Worker for PWA Offline Mode
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[PWA] Service Worker registration failed:', err);
    });
  });
}
