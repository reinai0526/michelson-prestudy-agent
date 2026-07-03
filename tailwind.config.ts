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
        space: "#07111f",
        panel: "#0f1f35",
        line: "#223b5d",
        cyanbeam: "#5eead4",
        optic: "#60a5fa",
        violetbeam: "#a78bfa",
        warm: "#facc15"
      },
      boxShadow: {
        glow: "0 0 32px rgba(94, 234, 212, 0.22)"
      }
    }
  },
  plugins: []
} satisfies Config;
