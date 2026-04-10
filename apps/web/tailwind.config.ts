import type { Config } from "tailwindcss";

const config: Config = {
  plugins: [require("@tailwindcss/typography")],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        shell: "rgb(var(--pw-bg-shell) / <alpha-value>)",
        surface: "rgb(var(--pw-bg-surface) / <alpha-value>)",
        muted: "rgb(var(--pw-bg-muted) / <alpha-value>)",
        accent: {
          primary: "rgb(var(--pw-accent-primary) / <alpha-value>)",
          subtle: "rgb(var(--pw-accent-subtle) / <alpha-value>)",
          strong: "rgb(var(--pw-accent-strong) / <alpha-value>)",
          secondary: "rgb(var(--pw-accent-secondary) / <alpha-value>)",
          foreground: "rgb(var(--pw-accent-foreground) / <alpha-value>)",
        },
        text: {
          primary: "rgb(var(--pw-text-primary) / <alpha-value>)",
          muted: "rgb(var(--pw-text-muted) / <alpha-value>)",
          inverse: "rgb(var(--pw-text-inverse) / <alpha-value>)",
        },
        border: {
          subtle: "rgb(var(--pw-border-subtle) / <alpha-value>)",
          strong: "rgb(var(--pw-border-strong) / <alpha-value>)",
        },
        status: {
          ok: "rgb(var(--pw-status-ok) / <alpha-value>)",
          warn: "rgb(var(--pw-status-warn) / <alpha-value>)",
          danger: "rgb(var(--pw-status-danger) / <alpha-value>)",
          info: "rgb(var(--pw-status-info) / <alpha-value>)",
        },
        // Legacy support for pw-* tokens used in marketing site
        "pw-primary": "rgb(var(--pw-accent-primary) / <alpha-value>)",
        "pw-primary-soft": "rgb(var(--pw-accent-subtle) / <alpha-value>)",
        "pw-surface": "rgb(var(--pw-bg-surface) / <alpha-value>)",
        "pw-border": "rgb(var(--pw-border-subtle) / <alpha-value>)",
        "pw-text": "rgb(var(--pw-text-primary) / <alpha-value>)",
        "pw-text-muted": "rgb(var(--pw-text-muted) / <alpha-value>)",
        "pw-success": "rgb(var(--pw-status-ok) / <alpha-value>)",
        "pw-warning": "rgb(var(--pw-status-warn) / <alpha-value>)",
        "pw-danger": "rgb(var(--pw-status-danger) / <alpha-value>)",
      },
      fontFamily: {
        heading: ["var(--font-heading)", "Segoe UI", "system-ui", "-apple-system", "sans-serif"],
        body: ["var(--font-body)", "Segoe UI", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        card: "0px 10px 30px rgba(15, 23, 42, 0.06)",
        soft: "0px 4px 12px rgba(15, 23, 42, 0.04)",
      },
      typography: {
        DEFAULT: {
          css: {
            "--tw-prose-body": "rgb(var(--pw-text-primary))",
            "--tw-prose-headings": "rgb(var(--pw-text-primary))",
            "--tw-prose-links": "rgb(var(--pw-accent-strong))",
            maxWidth: "none",
            "p, ul, ol, blockquote": {
              marginTop: "1.25em",
              marginBottom: "1.25em",
            },
            img: {
              borderRadius: "12px",
              marginTop: "1.5em",
              marginBottom: "1.5em",
            },
            blockquote: {
              borderLeftColor: "rgb(var(--pw-accent-secondary))",
              fontStyle: "italic",
            },
          },
        },
      },
    },
  },
};

export default config;
