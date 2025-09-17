import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        "2xl": "1rem",
      },
      boxShadow: {
        xl: "0 10px 30px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
