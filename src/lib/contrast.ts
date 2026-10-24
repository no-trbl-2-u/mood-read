// WCAG 2.2 contrast ratio between two opaque sRGB colours written as "#rrggbb".
// Used by the theme's contrast test (design/system/DECISION.md lists the same ratios).

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a "#rrggbb" colour, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not an opaque #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The WCAG contrast ratio of two colours, from 1 to 21, order-free. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** `hex` drawn at `opacity` over `ground`, as one opaque "#rrggbb" colour (a dimmed screen's colours). */
export function blend(hex: string, ground: string, opacity: number): string {
  luminance(hex);
  luminance(ground);
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [rgb(hex), rgb(ground)];
  return `#${a.map((c, i) => Math.round(opacity * c + (1 - opacity) * b[i]).toString(16).padStart(2, "0")).join("")}`;
}

/** The AA minimum for a pair: 4.5 for body text, 3 for large text and UI components. */
export function aaMinimum(kind: "text" | "large" | "ui"): number {
  return kind === "text" ? 4.5 : 3;
}
