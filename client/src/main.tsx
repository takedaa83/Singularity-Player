import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { BrowserRouter } from 'react-router-dom'
import { getMuiTheme } from './theme/muiTheme'
import { useSettingsStore } from './stores/settingsStore'
import './index.css'
import App from './App.tsx'

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

    // Initial check
    const isLight = document.documentElement.classList.contains('light');
    setThemeMode(isLight ? 'light' : 'dark');

    return () => observer.disconnect();
  }, []);

  const currentTheme = getMuiTheme(themeMode, accentColor);

  return <ThemeProvider theme={currentTheme}>{children}</ThemeProvider>;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DynamicThemeProvider>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </DynamicThemeProvider>
  </StrictMode>,
)
