/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
// Font sizes are written in px in the design (text-13 = 13px) but emitted as rem, so the A/A/A text-size
// control can scale the whole interface by changing the root font size.
const SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 48, 88, 120]
const fontSize = Object.fromEntries(SIZES.map((px) => [px, `${px / 16}rem`]))

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Noto Sans: the face recommended by India's GIGW web guidelines (covers Devanagari too).
        // IBM Plex Sans for headings and big numbers; IBM Plex Mono for case numbers, IDs and hashes (the "ledger" feel).
        sans: ['"Noto Sans"', '"Noto Sans Devanagari"', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['"IBM Plex Sans"', '"Noto Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Consolas', 'monospace'],
        deva: ['"Noto Sans Devanagari"', '"Noto Sans"', 'sans-serif'],
      },
      fontSize,
      colors: {
        ink: { 950: v('ink-950'), 900: v('ink-900'), 800: v('ink-800'), 700: v('ink-700'), 500: v('ink-500'), 100: v('ink-100'), 50: v('ink-50') },
        paper: v('paper'), surface: v('surface'), line: v('line'), text: v('text'), muted: v('muted'), stamp: v('stamp'),
        good: { DEFAULT: v('good'), soft: v('good-soft') },
        tape: { DEFAULT: v('tape'), soft: v('tape-soft') },
        turmeric: { DEFAULT: v('turmeric'), soft: v('turmeric-soft') },
        // Unit colours by unit kind (same everywhere: lanes, pills, charts)
        unit: { gr: v('unit-gr'), rb: v('unit-rb'), ro: v('unit-ro'), other: v('unit-other'), none: v('unit-none') },
      },
      borderRadius: { chip: '8px', panel: '14px' },
      boxShadow: {
        card: '0 1px 2px rgb(14 26 51 / 0.04), 0 6px 20px -10px rgb(14 26 51 / 0.10)',
      },
    },
  },
  plugins: [],
}
