import type { Config } from "tailwindcss";

// SoulVector design language: charcoal canvas, ember accent, IBM Plex Mono.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0f0f0f",
        surface: "#161616",
        surface2: "#1d1d1d",
        line: "#2a2a2a",
        ember: "#ff6b35",
        emberdim: "#c8551f",
        ash: "#8a8a8a",
        bone: "#ededed",
        ok: "#5fb37a",
        warn: "#e0b341",
        bad: "#e0564b",
      },
      fontFamily: {
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
        sans: ["var(--font-plex-sans)", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
} satisfies Config;
