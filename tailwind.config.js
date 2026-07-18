/** @type {import('tailwindcss').Config} */
// Designsystemet för NudgeMe: alviskt, natur, romantasy.
// Palett: mossgrönt, gammelguld, dimblått, varm off-white ("pergament").
// Färgerna speglas mot CSS-variabler i src/theme/tokens.css så att teman
// (ljus/mörk skog) kan bytas utan att bygga om komponenter.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        moss: {
          50: "#eef2ea",
          100: "#d9e2d0",
          300: "#9db98a",
          500: "#5c7a4b",
          600: "#47603a",
          700: "#2f4a3c", // primär skogsgrön
          900: "#1c2e24",
        },
        gold: {
          300: "#e8d3a0",
          500: "#c9a24b", // gammelguld / filigran
          700: "#9c7a30",
        },
        mist: {
          300: "#cdd8de",
          500: "#8faab6", // dimblått
          700: "#5c7480",
        },
        parchment: {
          50: "#faf6ec",
          100: "#f4efe4", // varm off-white bakgrund
          200: "#e9e0cb",
        },
        blush: {
          400: "#d9a1a6", // romantasy-rosa accent
          600: "#b9727a",
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "Georgia", "serif"],
        body: ['"Nunito Sans"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        petal: "1.75rem",
      },
      boxShadow: {
        leaf: "0 10px 30px -12px rgba(28, 46, 36, 0.35)",
        glow: "0 0 24px -6px rgba(201, 162, 75, 0.5)",
      },
      keyframes: {
        "gentle-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "gentle-float": "gentle-float 5s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.5s ease-out both",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};
