/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic theme tokens (see :root in src/index.css)
        app: v("bg"),
        surface: v("surface"),
        surface2: v("surface-2"),
        line: v("border"),
        ink: v("text"),
        muted: v("text-muted"),
        accent: v("accent"),
        "accent-text": v("accent-text"),
      },
    },
  },
  plugins: [],
}
