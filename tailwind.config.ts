import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        covexBg: "#0b1115",
        covexPanel: "#0f151a"
      },
      borderColor: {
        DEFAULT: "rgba(255,255,255,0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
