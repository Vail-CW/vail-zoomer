/** @type {import('tailwindcss').Config} */
// Design tokens live in src/index.css as space-separated RGB triplets so
// Tailwind opacity modifiers work (bg-success/10). Spacing is re-based so one
// unit is 4px at the 14px root: p-2 = 8px, h-8 = 32px, h-9 = 36px. All sizes
// are rem, so the ui_scale setting (root font-size) scales everything.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

const spacingKeys = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20,
  24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];
const spacing = { px: "1px" };
for (const k of spacingKeys) spacing[String(k)] = k === 0 ? "0px" : `${(k * 4) / 14}rem`;

const status = (name) => ({
  DEFAULT: v(name),
  fg: v(`${name}-fg`),
});

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    spacing,
    fontSize: {
      xs: ["0.8571rem", { lineHeight: "1.25" }], // 12px
      sm: ["0.9286rem", { lineHeight: "1.35" }], // 13px
      base: ["1rem", { lineHeight: "1.4" }], // 14px
      lg: ["1.0714rem", { lineHeight: "1.35" }], // 15px
      xl: ["1.4286rem", { lineHeight: "1.25" }], // 20px
      "2xl": ["1.2857rem", { lineHeight: "1.45" }], // 18px (decoder)
    },
    borderRadius: {
      none: "0px",
      sm: "0.2857rem",
      DEFAULT: "0.4286rem", // 6px
      md: "0.5714rem", // 8px
      lg: "0.8571rem", // 12px
      full: "9999px",
    },
    boxShadow: {
      none: "none",
      sm: "var(--shadow-1)",
      DEFAULT: "var(--shadow-1)",
      md: "var(--shadow-2)",
      lg: "var(--shadow-3)",
      glow: "0 0 0 3px rgb(var(--accent) / 0.22), 0 0 12px rgb(var(--accent) / 0.55)",
    },
    transitionDuration: {
      DEFAULT: "150ms",
      0: "0ms",
      75: "75ms",
      150: "150ms",
    },
    transitionTimingFunction: {
      DEFAULT: "cubic-bezier(0, 0, 0.2, 1)",
      out: "cubic-bezier(0, 0, 0.2, 1)",
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"],
      },
      colors: {
        app: v("bg"),
        surface: v("surface"),
        surface2: v("surface-2"),
        surface3: v("surface-3"),
        line: "rgb(var(--border) / var(--border-a))",
        "line-strong": "rgb(var(--border) / var(--border-strong-a))",
        ink: v("text"),
        muted: v("text-muted"),
        faint: v("text-faint"),
        accent: v("accent"),
        "accent-hover": v("accent-hover"),
        "accent-fg": v("accent-fg"),
        "accent-text": v("accent-text"),
        success: status("success"),
        warn: status("warn"),
        danger: status("danger"),
        info: status("info"),
      },
    },
  },
  plugins: [],
};
