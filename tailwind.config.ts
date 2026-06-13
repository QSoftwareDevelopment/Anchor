import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "qa-bg": "var(--qa-bg)",
        "qa-surface": "var(--qa-surface)",
        "qa-surface-2": "var(--qa-surface-2)",
        "qa-text": "var(--qa-text)",
        "qa-text-2": "var(--qa-text-2)",
        "qa-line": "var(--qa-line)",
        "qa-line-strong": "var(--qa-line-strong)",
        "qa-accent": "var(--qa-accent)",
        "qa-accent-text": "var(--qa-accent-text)",
        "qa-accent-soft": "var(--qa-accent-soft)",
        "qa-success": "var(--qa-success)",
        "qa-success-soft": "var(--qa-success-soft)",
        "qa-warn": "var(--qa-warn)",
      },
      borderRadius: {
        qa: "var(--qa-radius)",
        "qa-sm": "var(--qa-radius-sm)",
      },
      boxShadow: {
        "qa-sm": "var(--qa-shadow-sm)",
        qa: "var(--qa-shadow)",
        "qa-lg": "var(--qa-shadow-lg)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "monospace"],
      },
      keyframes: {
        "qa-rise": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "qa-pop": {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "qa-rise": "qa-rise 160ms cubic-bezier(0.2,0.7,0.2,1) both",
        "qa-pop": "qa-pop 320ms cubic-bezier(0.2,0.7,0.2,1)",
      },
    },
  },
  plugins: [],
};

export default config;
