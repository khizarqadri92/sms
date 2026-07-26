import { createContext, useContext, useState, useEffect } from "react";

const THEMES = {
  indigo: {
    name:        "Indigo Blue",
    navBg:       "#1e293b",
    navBgDark:   "#0f172a",
    primary:     "#2563eb",
    primaryDark: "#1d4ed8",
    primaryLight:"#eff6ff",
    primaryBorder:"#bfdbfe",
    heroBg:      "linear-gradient(135deg, #1e40af 0%, #3730a3 60%, #1e3a8a 100%)",
    activeLink:  "#2563eb",
  },
  emerald: {
    name:        "Emerald Green",
    navBg:       "#134e3a",
    navBgDark:   "#065f46",
    primary:     "#059669",
    primaryDark: "#047857",
    primaryLight:"#ecfdf5",
    primaryBorder:"#a7f3d0",
    heroBg:      "linear-gradient(135deg, #065f46 0%, #047857 60%, #065f46 100%)",
    activeLink:  "#059669",
  },
  orange: {
    name:        "Orange",
    navBg:       "#7c2d12",
    navBgDark:   "#431407",
    primary:     "#ea580c",
    primaryDark: "#c2410c",
    primaryLight:"#fff7ed",
    primaryBorder:"#fed7aa",
    heroBg:      "linear-gradient(135deg, #7c2d12 0%, #9a3412 60%, #7c2d12 100%)",
    activeLink:  "#ea580c",
  },
  purple: {
    name:        "Purple",
    navBg:       "#3b0764",
    navBgDark:   "#581c87",
    primary:     "#9333ea",
    primaryDark: "#7c3aed",
    primaryLight:"#faf5ff",
    primaryBorder:"#ddd6fe",
    heroBg:      "linear-gradient(135deg, #581c87 0%, #6b21a8 60%, #581c87 100%)",
    activeLink:  "#9333ea",
  },
  sky: {
    name:        "Sky Blue",
    navBg:       "#0c4a6e",
    navBgDark:   "#082f49",
    primary:     "#0284c7",
    primaryDark: "#0369a1",
    primaryLight:"#e0f2fe",
    primaryBorder:"#bae6fd",
    heroBg:      "linear-gradient(135deg, #0c4a6e 0%, #075985 60%, #0c4a6e 100%)",
    activeLink:  "#0284c7",
  },
  rose: {
    name:        "Rose Red",
    navBg:       "#881337",
    navBgDark:   "#4c0519",
    primary:     "#e11d48",
    primaryDark: "#be123c",
    primaryLight:"#fff1f2",
    primaryBorder:"#fecdd3",
    heroBg:      "linear-gradient(135deg, #881337 0%, #9f1239 60%, #881337 100%)",
    activeLink:  "#e11d48",
  },
  teal: {
    name:        "Teal",
    navBg:       "#134e4a",
    navBgDark:   "#042f2e",
    primary:     "#0d9488",
    primaryDark: "#0f766e",
    primaryLight:"#f0fdfa",
    primaryBorder:"#99f6e4",
    heroBg:      "linear-gradient(135deg, #134e4a 0%, #115e59 60%, #134e4a 100%)",
    activeLink:  "#0d9488",
  },
  slate: {
    name:        "Slate Gray",
    navBg:       "#1c1917",
    navBgDark:   "#0c0a09",
    primary:     "#44403c",
    primaryDark: "#292524",
    primaryLight:"#fafaf9",
    primaryBorder:"#d6d3d1",
    heroBg:      "linear-gradient(135deg, #1c1917 0%, #292524 60%, #1c1917 100%)",
    activeLink:  "#44403c",
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeKey, setThemeKey] = useState(
    () => localStorage.getItem("sms_theme") || "indigo"
  );

  const theme = THEMES[themeKey] || THEMES.indigo;

  // Load per-user theme from backend whenever a token is present.
  // Runs on mount (covers page refresh while logged in) and whenever
  // localStorage changes (covers the moment right after login).
  function loadThemeFromApi() {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    fetch("/api/v1/users/profile/theme", {
      headers: { "Authorization": "Bearer " + token }
    })
      .then(r => r.json())
      .then(data => {
        const t = data?.data?.theme;
        if (t && THEMES[t]) {
          setThemeKey(t);
          localStorage.setItem("sms_theme", t);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadThemeFromApi();

    // Also reload theme whenever localStorage changes (e.g., after login sets access_token)
    function onThemeChanged(e) {
      const t = e.detail?.theme;
      if (t && THEMES[t]) {
        setThemeKey(t);
        localStorage.setItem("sms_theme", t);
      }
    }
    window.addEventListener("themeChanged", onThemeChanged);
    return () => window.removeEventListener("themeChanged", onThemeChanged);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [themeKey]);

  function applyTheme(t) {
    const root = document.documentElement;
    root.style.setProperty("--theme-nav",           t.navBg);
    root.style.setProperty("--theme-nav-dark",      t.navBgDark);
    root.style.setProperty("--theme-primary",       t.primary);
    root.style.setProperty("--theme-primary-dark",  t.primaryDark);
    root.style.setProperty("--theme-primary-light", t.primaryLight);
    root.style.setProperty("--theme-primary-border",t.primaryBorder);
    root.style.setProperty("--theme-hero",          t.heroBg);
    root.style.setProperty("--theme-active",        t.activeLink);
  }

  function setTheme(key) {
    setThemeKey(key);
    localStorage.setItem("sms_theme", key);
    const token = localStorage.getItem("access_token");
    if (token) {
      fetch("/api/v1/users/profile/theme", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ theme: key })
      }).catch(() => {});
    }
  }

  return (
    <ThemeContext.Provider value={{ themeKey, theme, themes: THEMES, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { THEMES };
