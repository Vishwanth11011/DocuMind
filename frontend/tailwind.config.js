/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        primary: {
          DEFAULT: "#7c3aed",
          hover: "#6d28d9",
          light: "#ede9fe",
        },
      },
      borderRadius: {
        xl: "0.75rem",
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
