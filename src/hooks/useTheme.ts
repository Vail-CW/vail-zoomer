import { useEffect } from "react";

export type ThemeSetting = "dark" | "light" | "system";

/** Sets data-theme on <html>. Unknown values fall back to "dark". */
export function useTheme(theme: string | null | undefined): void {
  useEffect(() => {
    const value: ThemeSetting =
      theme === "light" || theme === "system" || theme === "dark" ? theme : "dark";
    document.documentElement.setAttribute("data-theme", value);
  }, [theme]);
}
