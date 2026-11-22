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
    navBgDarkMode: "#0a0f1c",
    heroBgDarkMode: "linear-gradient(135deg, #05070d 0%, #0a0a1f 60%, #030308 100%)",
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
    navBgDarkMode: "#042f2a",
    heroBgDarkMode: "linear-gradient(135deg, #010b09 0%, #041f19 60%, #010b09 100%)",
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
    navBgDarkMode: "#2a0e05",
    heroBgDarkMode: "linear-gradient(135deg, #0d0402 0%, #1a0904 60%, #0d0402 100%)",
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
    navBgDarkMode: "#2e0854",
    heroBgDarkMode: "linear-gradient(135deg, #0d0219 0%, #170a2a 60%, #0d0219 100%)",
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
    navBgDarkMode: "#041f31",
    heroBgDarkMode: "linear-gradient(135deg, #010c13 0%, #04192b 60%, #010c13 100%)",
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
    navBgDarkMode: "#31091a",
    heroBgDarkMode: "linear-gradient(135deg, #0d0207 0%, #1a0510 60%, #0d0207 100%)",
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
    navBgDarkMode: "#021917",
    heroBgDarkMode: "linear-gradient(135deg, #000b0a 0%, #021716 60%, #000b0a 100%)",
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
    navBgDarkMode: "#050403",
    heroBgDarkMode: "linear-gradient(135deg, #020202 0%, #050505 60%, #020202 100%)",
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeKey, setThemeKey] = useState(
    () => localStorage.getItem("sms_theme") || "indigo"
  );
  const [colorMode, setColorModeState] = useState(
    () => localStorage.getItem("sms_color_mode") || "light"
  );

  const theme = THEMES[themeKey] || THEMES.indigo;

  // Load per-user theme from backend whenever a token is present.
  // Runs on mount (covers page refresh while logged in) and whenever
  // localStorage changes (covers the moment right after login).
  function loadThemeFromApi() {
    const token = sessionStorage.getItem("access_token");
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

  function loadColorModeFromApi() {
    const token = sessionStorage.getItem("access_token");
    if (!token) return;
    fetch("/api/v1/users/profile/color-mode", {
      headers: { "Authorization": "Bearer " + token }
    })
      .then(r => r.json())
      .then(data => {
        const m = data?.data?.color_mode;
        if (m === "light" || m === "dark") {
          setColorModeState(m);
          localStorage.setItem("sms_color_mode", m);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadThemeFromApi();
    loadColorModeFromApi();

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
    applyTheme(theme, colorMode);
  }, [themeKey, colorMode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-color-mode", colorMode);
  }, [colorMode]);

  function applyTheme(t, mode) {
    const root = document.documentElement;
    const isDark = mode === "dark";
    // In dark mode the header/hero switch to a darker variant of the same
    // theme color (navBgDarkMode/heroBgDarkMode) instead of staying pinned
    // to the light-mode brand color, so they visually sync with the rest
    // of the app rather than looking like a leftover light-mode element.
    root.style.setProperty("--theme-nav",           isDark ? (t.navBgDarkMode || t.navBgDark) : t.navBg);
    root.style.setProperty("--theme-nav-dark",      t.navBgDark);
    root.style.setProperty("--theme-primary",       t.primary);
    root.style.setProperty("--theme-primary-dark",  t.primaryDark);
    root.style.setProperty("--theme-primary-light", t.primaryLight);
    root.style.setProperty("--theme-primary-border",t.primaryBorder);
    root.style.setProperty("--theme-hero",          isDark ? (t.heroBgDarkMode || t.heroBg) : t.heroBg);
    root.style.setProperty("--theme-active",        t.activeLink);
  }

  function setTheme(key) {
    setThemeKey(key);
    localStorage.setItem("sms_theme", key);
    const token = sessionStorage.getItem("access_token");
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

  function setColorMode(mode) {
    if (mode !== "light" && mode !== "dark") return;
    setColorModeState(mode);
    localStorage.setItem("sms_color_mode", mode);
    const token = sessionStorage.getItem("access_token");
    if (token) {
      fetch("/api/v1/users/profile/color-mode", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ color_mode: mode })
      }).catch(() => {});
    }
  }

  function toggleColorMode() {
    setColorMode(colorMode === "light" ? "dark" : "light");
  }

  return (
    <ThemeContext.Provider value={{ themeKey, theme, themes: THEMES, setTheme, colorMode, setColorMode, toggleColorMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { THEMES };
