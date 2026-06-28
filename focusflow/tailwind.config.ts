import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          primary: "#1E1B18", // Warm Charcoal
          secondary: "#2A2520", // Smoked Walnut
          tertiary: "#3A322B", // Dusty Clay
          vault: "#141210", // Deep Obsidian
          // Dynamic base — swaps between charcoal (surface) and obsidian (vault)
          base: "var(--bg-base)",
        },
        accent: {
          terracotta: "#C4654A",
          ember: "#A8503A",
          teal: "#38BEC9",
          sage: "#7A9E7E",
          ochre: "#D4A843",
          // Dynamic accent — terracotta on surface, teal in vault
          primary: "var(--accent-primary)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
        },
        text: {
          parchment: "#EDE6DB",
          bone: "#A89F93",
          stone: "#6B6259",
        },
        border: {
          ash: "#3E3730",
          accent: "var(--accent-primary)",
        },
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-dm-sans)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      // Softer, more generous radii throughout — controls feel tactile and
      // rounded rather than rectangular. Existing class names render rounder.
      borderRadius: {
        sm: "0.5rem",
        DEFAULT: "0.75rem",
        md: "1rem",
        lg: "1.25rem",
        xl: "1.75rem",
        "2xl": "2.25rem",
      },
      spacing: {
        gutter: "20px",
      },
      // Soft, warm elevation — diffuse and deep rather than a hard black drop.
      boxShadow: {
        lg: "0 10px 30px -14px rgba(0, 0, 0, 0.55)",
        xl: "0 16px 40px -18px rgba(0, 0, 0, 0.6)",
        "2xl": "0 26px 60px -22px rgba(0, 0, 0, 0.65)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        shimmer: "shimmer 2.5s linear infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
