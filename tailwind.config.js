/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      colors: {
        ink: "#14181f",
        paper: "#faf7f2",
        muted: "#5b6472",
        line: "#e7e2d9",
        brand: { DEFAULT: "#2563eb", soft: "#e8effd", dark: "#1d4ed8" },
      },
    },
  },
  plugins: [],
};