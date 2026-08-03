/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        soft: "0 10px 30px rgba(15, 23, 42, 0.10)",
        softer: "0 6px 18px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
