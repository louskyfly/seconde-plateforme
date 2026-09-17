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
          50: "rgb(var(--i-50) / <alpha-value>)",
          100: "rgb(var(--i-100) / <alpha-value>)",
          200: "rgb(var(--i-200) / <alpha-value>)",
          300: "rgb(var(--i-300) / <alpha-value>)",
          400: "rgb(var(--i-400) / <alpha-value>)",
          500: "rgb(var(--i-500) / <alpha-value>)",
          600: "rgb(var(--i-600) / <alpha-value>)",
          700: "rgb(var(--i-700) / <alpha-value>)",
          800: "rgb(var(--i-800) / <alpha-value>)",
          900: "rgb(var(--i-900) / <alpha-value>)",
          950: "rgb(var(--i-950) / <alpha-value>)",
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