/** @type {import('tailwindcss').Config} */
// Designsystemet för NudgeMe: alviskt, natur, romantasy.
// Palett: mossgrönt, gammelguld, dimblått, varm off-white ("pergament").
// Färgerna speglas mot CSS-variabler i src/theme/tokens.css så att teman
// (ljus/mörk skog) kan bytas utan att bygga om komponenter.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Palett: "Sylvan Grace" (se DESIGN.md) – skogsgrön, gammelguld, dimblått
      // och varm pergament. Skalnamnen behålls; värdena speglar designsystemet.
      colors: {
        moss: {
          50: "#eaf0ea",
          100: "#d3e8d5", // ljus grön (badge-bg)
          300: "#b7ccb9",
          500: "#506354", // dämpad text
          600: "#4a5d4e", // primary-container
          700: "#334537", // primär skogsgrön
          900: "#1b1c19", // on-surface (djup text)
        },
        gold: {
          300: "#fed488", // secondary-container (ljus guld)
          500: "#e9c176", // medelguld
          700: "#775a19", // mörk guldtext
        },
        mist: {
          300: "#cee6f5", // ljus dimblå
          500: "#455b67", // tertiary-container
          700: "#2e444f", // mörk dimblå text
        },
        parchment: {
          50: "#fbf9f4", // yta / kort
          100: "#f4f2ec", // varm sidbakgrund
          200: "#dcdad3", // fina kanter
        },
        blush: {
          400: "#e6a5a1", // mjuk röd accent
          600: "#ba1a1a", // fel/ta bort
        },
      },
      fontFamily: {
        display: ['"EB Garamond"', "Georgia", "serif"],
        body: ['"Be Vietnam Pro"', "system-ui", "sans-serif"],
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
