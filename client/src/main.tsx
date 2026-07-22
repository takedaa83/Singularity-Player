import { Component, ReactNode, StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { BrowserRouter } from 'react-router-dom'
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
  }

  handleClearCacheAndReload = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
      }
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn('Failed to clear cache:', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#070707',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'sans-serif'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>Something went wrong loading the app</h2>
          <p style={{ fontSize: '13px', color: '#a3a3a3', maxWidth: '400px', marginBottom: '20px' }}>
            {this.state.error?.message || 'A script or asset failed to load.'}
          </p>
          <button
            onClick={this.handleClearCacheAndReload}
            style={{
              padding: '12px 24px',
              backgroundColor: '#f59e0b',
              color: '#000',
              fontWeight: 'bold',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Clear Cache & Reload
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <DynamicThemeProvider>
        <CssBaseline />
        <BrowserRouter>
          <App />
        </BrowserRouter>
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
