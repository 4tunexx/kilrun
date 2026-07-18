import type {Config} from 'tailwindcss';

const { fontFamily } = require("tailwindcss/defaultTheme")

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "xp-bar-charge": {
          "0%": { transform: "translateX(-40%)" },
          "100%": { transform: "translateX(140%)" },
        },
        "xp-spin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "slow-pulse-horizontal": {
          "0%, 100%": { transform: "translateX(0)" },
          "50%": { transform: "translateX(-4px)" },
        },
        "banner-shimmer": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        "banner-pulse-glow": {
          "0%, 100%": { filter: "brightness(1) saturate(1)" },
          "50%": { filter: "brightness(1.35) saturate(1.2)" },
        },
        "banner-rotate-hue": {
          "0%": { filter: "hue-rotate(0deg)" },
          "100%": { filter: "hue-rotate(360deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "xp-bar-charge": "xp-bar-charge 3.2s linear infinite",
        "xp-spin": "xp-spin 7s linear infinite",
        "slow-pulse-horizontal": "slow-pulse-horizontal 3s ease-in-out infinite",
        "banner-shimmer": "banner-shimmer 3s linear infinite",
        "banner-pulse-glow": "banner-pulse-glow 2.5s ease-in-out infinite",
        "banner-rotate-hue": "banner-rotate-hue 6s linear infinite",
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
