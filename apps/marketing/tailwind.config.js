/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        soft: "var(--soft)",
        cream: "var(--cream)",
        canvas: "var(--canvas)",
        "ink-panel": "var(--ink-panel)",
        forest: "var(--forest)",
        lime: "var(--lime)",
        "text-1": "var(--text-1)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        "text-4": "var(--text-4)",
      },
      fontFamily: {
        display: "var(--font-fraunces)",
        body: "var(--font-inter)",
        mono: "var(--font-jetbrains)",
      },
    },
  },
  plugins: [],
}
