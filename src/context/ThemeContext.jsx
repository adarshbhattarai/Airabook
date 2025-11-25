import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext();
const STORAGE_KEY = 'airabook-theme';
const SUPPORTED_THEMES = ['light', 'matrix'];

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_THEMES.includes(stored) ? stored : 'light';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    SUPPORTED_THEMES.forEach((value) => root.classList.remove(`theme-${value}`));
    root.classList.add(`theme-${theme}`);
    root.style.setProperty('color-scheme', theme === 'matrix' ? 'dark' : 'light');
    localStorage.setItem(STORAGE_KEY, theme);

    return () => {
      SUPPORTED_THEMES.forEach((value) => root.classList.remove(`theme-${value}`));
      root.classList.add('theme-light');
      root.style.setProperty('color-scheme', 'light');
    };
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: (next) => {
        if (!SUPPORTED_THEMES.includes(next)) return;
        setTheme(next);
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
