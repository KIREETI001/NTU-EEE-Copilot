import type { Config } from "tailwindcss";

// Handbook design language: a well-set student handbook. Cool paper, ink, one deep-teal
// accent; green/amber/red are reserved for data confidence and warnings.
// Colours are CSS variables (see app/globals.css) so light and dark share one set of names.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        surface2: v("surface2"),
        line: v("line"),
        ember: v("accent"), // historical name: the single accent colour
        emberdim: v("accent-strong"),
        ash: v("muted"),
        bone: v("ink"),
        ok: v("ok"),
        warn: v("warn"),
        bad: v("bad"),
      },
      fontFamily: {
        // Codes and figures use the body face with tabular numerals rather than a monospace.
        mono: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
