import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg))",
        fg: "hsl(var(--fg))",
        card: {
          DEFAULT: "hsl(var(--card))",
          fg: "hsl(var(--card-fg))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          fg: "hsl(var(--popover-fg))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          fg: "hsl(var(--surface-fg))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          fg: "hsl(var(--muted-fg))",
        },
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          fg: "hsl(var(--primary-fg))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          fg: "hsl(var(--success-fg))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          fg: "hsl(var(--warning-fg))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          fg: "hsl(var(--danger-fg))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          fg: "hsl(var(--info-fg))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        sm: "0 1px 2px 0 hsl(var(--shadow) / 0.08)",
        md: "0 10px 30px -12px hsl(var(--shadow) / 0.35)",
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
