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
        "banner-wave": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "banner-breathe": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.03)" },
        },
        "banner-sparkle": {
          "0%, 100%": { filter: "brightness(1)" },
          "25%": { filter: "brightness(1.25)" },
          "50%": { filter: "brightness(0.95)" },
          "75%": { filter: "brightness(1.2)" },
        },
        "frame-pulse": {
          "0%, 100%": { filter: "brightness(1)" },
          "50%": { filter: "brightness(1.35)" },
        },
        "frame-spin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "nick-rainbow": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        "nick-shimmer": {
          "0%": { filter: "brightness(1)" },
          "50%": { filter: "brightness(1.4)" },
          "100%": { filter: "brightness(1)" },
        },
        "nick-fire": {
          "0%, 100%": { textShadow: "0 0 6px #f97316, 0 0 12px #ef4444" },
          "50%": { textShadow: "0 0 12px #fbbf24, 0 0 22px #ef4444" },
        },
        "nick-ice": {
          "0%, 100%": { textShadow: "0 0 6px #67e8f9" },
          "50%": { textShadow: "0 0 14px #a5f3fc" },
        },
        "nick-neon": {
          "0%, 100%": { filter: "brightness(1)" },
          "50%": { filter: "brightness(1.3)" },
        },
        "nick-glitch": {
          "0%, 100%": { transform: "translate(0)" },
          "20%": { transform: "translate(-1px, 1px)" },
          "40%": { transform: "translate(1px, -1px)" },
          "60%": { transform: "translate(-1px, 0)" },
          "80%": { transform: "translate(1px, 1px)" },
        },
        "nick-glow": {
          "0%, 100%": { filter: "brightness(1)" },
          "50%": { filter: "brightness(1.15)" },
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
        "banner-wave": "banner-wave 4s ease-in-out infinite",
        "banner-breathe": "banner-breathe 3.5s ease-in-out infinite",
        "banner-sparkle": "banner-sparkle 1.8s ease-in-out infinite",
        "frame-pulse": "frame-pulse 2.2s ease-in-out infinite",
        "frame-spin": "frame-spin 8s linear infinite",
        "nick-rainbow": "nick-rainbow 3s linear infinite",
        "nick-shimmer": "nick-shimmer 2s ease-in-out infinite",
        "nick-fire": "nick-fire 1.4s ease-in-out infinite",
        "nick-ice": "nick-ice 2s ease-in-out infinite",
        "nick-neon": "nick-neon 1.6s ease-in-out infinite",
        "nick-glitch": "nick-glitch 0.45s steps(2) infinite",
        "nick-glow": "nick-glow 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
