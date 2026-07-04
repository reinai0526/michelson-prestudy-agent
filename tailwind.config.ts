import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Microsoft YaHei",
          "sans-serif"
        ]
      },
      colors: {
        space: "#eef8ff",
        panel: "#ffffff",
        line: "#b9d7ee",
        cyanbeam: "#0284c7",
        optic: "#38bdf8",
        violetbeam: "#6366f1",
        warm: "#ea580c"
      },
      boxShadow: {
        glow: "0 18px 42px rgba(14, 116, 144, 0.14)"
      }
    }
  },
  plugins: []
} satisfies Config;
