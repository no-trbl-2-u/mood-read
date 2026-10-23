// Design tokens for Mood Read. Dark only (see agents.md Visual & tonal defaults):
// a near-black violet ground, light text, one warm accent. React Native
// `StyleSheet` consumes these directly; no CSS framework.

export const colors = {
  /** Near-black violet ground (the Android icon's background). */
  background: "#14121a",
  /** A slightly lighter surface for cards and raised panels. */
  surface: "#1f1b28",
  /** Primary light text on the dark ground. */
  text: "#f4f1fa",
  /** Secondary text: captions, metadata, muted labels. */
  textMuted: "#b8b0c6",
  /** The one warm accent: a coral used for primary actions and emphasis. */
  accent: "#f2865e",
  /** A hairline border, subtle against the ground. */
  border: "#2d2736",
  /** Text and glyphs drawn on the accent (the play button, a selected chip). */
  onAccent: "#1a1015",
  /** The dim laid over the river while a bottom sheet is open. */
  scrim: "rgba(8, 6, 12, 0.6)",
  /** One plain colour for an error line. */
  danger: "#ff8a8a",
} as const;

/** A 4-point spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 12,
  lg: 20,
} as const;

export const typography = {
  title: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: colors.text,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
    color: colors.text,
  },
  caption: {
    fontSize: 13,
    fontWeight: "400" as const,
    color: colors.textMuted,
  },
} as const;
