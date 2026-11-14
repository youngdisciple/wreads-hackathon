// Light / dark theme shared by the landing page and the dashboard.
// The choice is "light", "dark" or "system" (follow the computer's setting).
// The page sets <html data-theme="..."> and the CSS swaps its colours.

import { useState, useEffect } from "https://esm.sh/react@18.3.1";

const KEY = "wreads:theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePref() {
  try { return localStorage.getItem(KEY) || "system"; } catch { return "system"; }
}

export function resolveTheme(pref) {
  return pref === "system" ? (media.matches ? "dark" : "light") : pref;
}

function apply(pref) {
  document.documentElement.dataset.theme = resolveTheme(pref);
}

/** React hook: [theme ("light"|"dark"), pref, setPref, toggle] */
export function useTheme() {
  const [pref, setPrefState] = useState(getThemePref);
  const [theme, setTheme] = useState(() => resolveTheme(getThemePref()));

  useEffect(() => {
    apply(pref);
    setTheme(resolveTheme(pref));
    try { pref === "system" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, pref); } catch { /* ignore */ }
    if (pref !== "system") return;
    const onChange = () => { apply("system"); setTheme(resolveTheme("system")); };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [pref]);

  const toggle = () => setPrefState(theme === "dark" ? "light" : "dark");
  return [theme, pref, setPrefState, toggle];
}
