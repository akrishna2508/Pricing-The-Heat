/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 5-step colorblind-safe sequential scale (ColorBrewer OrRd), used
        // ONLY for heat/index severity choropleths -- never as a general UI
        // accent color. Chrome elsewhere uses Tailwind's built-in neutral gray.
        heat: {
          1: "#fef0d9",
          2: "#fdcc8a",
          3: "#fc8d59",
          4: "#e34a33",
          5: "#b30000",
        },
      },
      fontFamily: {
        // Inter for UI text, JetBrains Mono for numeric/tabular figures
        // (premiums, indices, dates) -- loaded via next/font/google in
        // app/layout.tsx and exposed as CSS variables.
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
