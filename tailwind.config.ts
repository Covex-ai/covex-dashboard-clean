import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Covex theme palette
        covex: {
          bg: "#0a0a0b",        // page background
          panel: "#0f1115",     // card / panel bg
          border: "#22262e",    // subtle borders
          text: "#dcdfe6",      // body text (silver)
          mute: "#9aa2ad",      // secondary text
          brand: "#e5e7eb",     // near-white
          accent: "#7f8aa3",    // slate-ish accent
          blue: "#3b82f6",
        },
      },
      boxShadow: {
        soft: "0 6px 24px rgba(0,0,0,.35)",
        ring: "0 0 0 1px rgba(255,255,255,.06), 0 10px 30px rgba(0,0,0,.45)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
export default config;
