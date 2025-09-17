import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        covex: { bg: "#0b0b0e", panel: "#0f1216", line: "rgba(255,255,255,0.08)" }
      },
      borderRadius: { "2xl": "1rem" }
    }
  },
  plugins: []
};
export default config;
