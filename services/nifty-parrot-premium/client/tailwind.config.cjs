/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Inter", "Roboto", "Arial"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "monospace"
        ]
      },
      boxShadow: {
        soft: "0 10px 30px rgba(16,24,40,.08)",
        card: "0 14px 45px rgba(16,24,40,.10)",
        inset: "inset 0 1px 0 rgba(255,255,255,.70)",
        feather: "0 6px 14px rgba(16,24,40,.18)"
      }
    }
  },
  plugins: []
};
