"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Language = "th" | "en";
type Theme = "light" | "dark";

type AppPreferencesContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: (th: string, en: string) => string;
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

export function AppPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("th");
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const savedLanguage = localStorage.getItem("app-language");
    const savedTheme = localStorage.getItem("app-theme");
    if (savedLanguage === "th" || savedLanguage === "en") {
      setLanguageState(savedLanguage);
    } else {
      setLanguageState("th");
      localStorage.setItem("app-language", "th");
    }
    if (savedTheme === "light" || savedTheme === "dark") {
      setThemeState(savedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem("app-language", language);
  }, [language]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("app-theme", theme);
  }, [theme]);

  const value = useMemo<AppPreferencesContextValue>(
    () => ({
      language,
      setLanguage: setLanguageState,
      theme,
      setTheme: setThemeState,
      t: (th: string, en: string) => (language === "th" ? th : en),
    }),
    [language, theme]
  );

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences() {
  const ctx = useContext(AppPreferencesContext);
  if (!ctx) {
    throw new Error("useAppPreferences must be used within AppPreferencesProvider");
  }
  return ctx;
}

