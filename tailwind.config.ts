import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Display font: DM Sans for bold, geometric headings
        display: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        // Body font: DM Sans for readable body text
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        // Mono font: JetBrains Mono for code and data displays
        mono: ["var(--font-jetbrains-mono)", "Consolas", "monospace"],
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
        // Custom accent colors for the industrial aesthetic
        hydrate: {
          DEFAULT: "hsl(var(--hydrate))",
          foreground: "hsl(var(--hydrate-foreground))",
        },
        terminal: {
          DEFAULT: "hsl(var(--terminal))",
          foreground: "hsl(var(--terminal-foreground))",
        },
        signal: {
          success: "hsl(var(--signal-success))",
          warning: "hsl(var(--signal-warning))",
          error: "hsl(var(--signal-error))",
          info: "hsl(var(--signal-info))",
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
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "terminal-blink": {
          "0%, 50%": { opacity: "1" },
          "51%, 100%": { opacity: "0" },
        },
        "data-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "grid-flow": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(40px)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "counter-increment": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px hsl(var(--hydrate) / 0.3)" },
          "50%": { boxShadow: "0 0 40px hsl(var(--hydrate) / 0.6)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "scan-line": "scan-line 8s linear infinite",
        "terminal-blink": "terminal-blink 1s step-end infinite",
        "data-pulse": "data-pulse 2s ease-in-out infinite",
        "grid-flow": "grid-flow 20s linear infinite",
        "slide-up": "slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 0.4s ease-out",
        "counter-increment": "counter-increment 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
      },
      backgroundImage: {
        "grid-pattern": `linear-gradient(hsl(var(--border) / 0.5) 1px, transparent 1px),
                         linear-gradient(90deg, hsl(var(--border) / 0.5) 1px, transparent 1px)`,
        "diagonal-lines": `repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 10px,
          hsl(var(--border) / 0.3) 10px,
          hsl(var(--border) / 0.3) 11px
        )`,
      },
      backgroundSize: {
        "grid-40": "40px 40px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
