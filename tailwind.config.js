/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        glass: {
          DEFAULT: "rgba(255, 255, 255, 0.5)",
          border: "rgba(255, 255, 255, 0.2)",
        },
        indigo: {
          50: "#eef3fb",
          100: "#dce6f7",
          200: "#b8ccee",
          300: "#8daae0",
          400: "#5f85cd",
          500: "#3b5ba6",
          600: "#2b4385",
          700: "#1b2f5c",
          800: "#142445",
          900: "#0e1b35",
          950: "#0a1220",
        },
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.3s ease-in-out",
        slideUp: "slideUp 0.4s ease-out",
        scaleIn: "scaleIn 0.25s ease-out",
      },
    },
  },
  plugins: [],
};