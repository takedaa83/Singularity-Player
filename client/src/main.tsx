import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { BrowserRouter } from 'react-router-dom'
import { darkTheme, lightTheme } from './theme/muiTheme'
import './index.css'
import App from './App.tsx'

const DynamicThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState(
    document.documentElement.classList.contains('light') ? lightTheme : darkTheme
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isLight = document.documentElement.classList.contains('light');
      setCurrentTheme(isLight ? lightTheme : darkTheme);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // Initial check
    const isLight = document.documentElement.classList.contains('light');
    setCurrentTheme(isLight ? lightTheme : darkTheme);

    return () => observer.disconnect();
  }, []);

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
