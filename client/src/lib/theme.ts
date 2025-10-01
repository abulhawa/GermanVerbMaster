export type ThemeSetting = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "gvm-theme-preference";

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

const getMediaQuery = () => {
  if (!isBrowser()) return null;
  return window.matchMedia("(prefers-color-scheme: dark)");
};

export const getInitialThemeSetting = (): ThemeSetting => {
  if (!isBrowser()) {
    return "system";
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }

  return "system";
};

export const resolveTheme = (setting: ThemeSetting): "light" | "dark" => {
  if (setting === "system") {
    const mediaQuery = getMediaQuery();
    return mediaQuery?.matches ? "dark" : "light";
  }

  return setting;
};

export const applyThemeSetting = (setting: ThemeSetting) => {
  if (!isBrowser()) return;

  const resolved = resolveTheme(setting);
  const root = document.documentElement;

  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
};

export const subscribeToSystemTheme = (listener: () => void) => {
  const mediaQuery = getMediaQuery();
  if (!mediaQuery) return () => {};

  const handler = () => listener();
  mediaQuery.addEventListener("change", handler);

  return () => mediaQuery.removeEventListener("change", handler);
};
