import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg, 210 20% 98%))",
        fg: "hsl(var(--fg, 222 47% 12%))",
        card: {
          DEFAULT: "hsl(var(--card, 0 0% 100%))",
          fg: "hsl(var(--card-fg, 222 47% 12%))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover, 0 0% 100%))",
          fg: "hsl(var(--popover-fg, 222 47% 12%))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface, 210 20% 99%))",
          fg: "hsl(var(--surface-fg, 217 19% 27%))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted, 214 20% 94%))",
          fg: "hsl(var(--muted-fg, 217 19% 27%))",
        },
        border: "hsl(var(--border, 214 17% 82%))",
        ring: "hsl(var(--ring, 221 83% 54%))",
        primary: {
          DEFAULT: "hsl(var(--primary, 221 83% 54%))",
          fg: "hsl(var(--primary-fg, 210 20% 98%))",
        },
        success: {
          DEFAULT: "hsl(var(--success, 160 84% 36%))",
          fg: "hsl(var(--success-fg, 98 100% 96%))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning, 32 95% 44%))",
          fg: "hsl(var(--warning-fg, 34 100% 96%))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger, 0 69% 52%))",
          fg: "hsl(var(--danger-fg, 0 0% 100%))",
        },
        info: {
          DEFAULT: "hsl(var(--info, 199 89% 48%))",
          fg: "hsl(var(--info-fg, 210 20% 98%))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        sm: "0 1px 2px 0 hsl(var(--shadow, 221 83% 15%) / 0.08)",
        md: "0 10px 30px -12px hsl(var(--shadow, 221 83% 15%) / 0.35)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
      zIndex: {
        overlay: 50,
        modal: 60,
        popover: 70,
        toast: 80,
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
