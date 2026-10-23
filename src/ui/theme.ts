// Design tokens for Mood Read: option A, "acid sticker" (design/system/DECISION.md).
// Dark only. This file is the only place a colour or size lives; React Native `StyleSheet`
// consumes these directly, no CSS framework. The contrast pairs at the bottom are asserted
// by src/lib/contrast.test.ts and listed in DECISION.md.

/** The fixed emotion set the scoring agent names (spec 01, 01.2). */
export const EMOTIONS = ["tension", "sorrow", "wonder", "joy", "dread", "calm", "romance", "triumph"] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const colors = {
  /** Near-black violet ground (the Android icon's family). */
  background: "#0e0b14",
  /** Cards, rows and sheets. */
  surface: "#1a1524",
  /** One step up from surface: the expanded row, a pressed card, a sheet's header. */
  raised: "#262035",
  /** Primary light text. */
  text: "#fbf8ff",
  /** Secondary text: captions, metadata, the "Unscored" chip. */
  textMuted: "#c4bad6",
  /** Acid lime: primary actions, the selected chip, the playing row's rule. */
  accent: "#c6ff3d",
  /** Text and glyphs drawn on the accent and on every emotion hue. */
  onAccent: "#0e0b14",
  /** Hot pink: the clash colour. Hard shadows under buttons, the display word's second hue. */
  pop: "#ff4fa3",
  /** The sticker's ink outline (same as the ground, so a sticker reads as cut out). */
  ink: "#0e0b14",
  /** The sticker's die-cut edge and chip shadow: off-white. A control's visible boundary. */
  edge: "#fbf8ff",
  /** A decorative hairline between rows. Never a control's only boundary. */
  border: "#3a3150",
  /** The keyboard / switch-access focus ring. */
  focus: "#4de8ff",
  /** The dim laid over the river while a bottom sheet is open. */
  scrim: "rgba(5, 4, 9, 0.72)",
  /** An error line. */
  danger: "#ff7a7a",
} as const;

/** One saturated hue per emotion. A chip always carries its label too: never colour alone. */
export const emotionHues: Record<Emotion, string> = {
  tension: "#ff6a3d",
  sorrow: "#6f93ff",
  wonder: "#4de8ff",
  joy: "#ffe03d",
  dread: "#c77dff",
  calm: "#5dffb0",
  romance: "#ff6fb5",
  triumph: "#ffb22e",
};

/** A 4-point spacing scale. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 22,
  /** Chips and pill buttons. */
  pill: 999,
} as const;

/** Outline and rule widths. */
export const strokes = {
  hairline: 1,
  /** A chip's ink outline, the focus ring. */
  outline: 2,
  /** A button's ink outline. */
  heavy: 3,
  /** The playing row's left rule. */
  rule: 6,
} as const;

/** Hard, unblurred offset shadows (React Native `boxShadow`, blur 0). */
export const shadows = {
  chip: { offsetX: 3, offsetY: 3, color: colors.edge },
  button: { offsetX: 4, offsetY: 4, color: colors.pop },
  card: { offsetX: 6, offsetY: 6, color: colors.pop },
} as const;

/** A sticker's tilt in degrees, cycled by index so a row of chips never lines up. */
export const tilts = [-3, 2, -1.5, 3, -2, 1] as const;

/** The focus ring: drawn outside the control, never replaced by colour alone. */
export const focusRing = { width: strokes.outline, offset: 2, color: colors.focus } as const;

/**
 * Font families. The display face is Bricolage Grotesque (SIL OFL 1.1, Google Fonts), bundled by
 * 06.4; until then `display` is undefined and React Native falls back to the system font.
 */
export const fonts = {
  display: undefined as string | undefined,
  body: undefined as string | undefined,
  plannedDisplay: "Bricolage Grotesque",
} as const;

/** The type scale, in px. Display and title use the display face once bundled. */
export const typography = {
  display: { fontSize: 44, lineHeight: 46, fontWeight: "800" as const, letterSpacing: -1, color: colors.text },
  title: { fontSize: 30, lineHeight: 34, fontWeight: "800" as const, letterSpacing: -0.5, color: colors.text },
  heading: { fontSize: 20, lineHeight: 24, fontWeight: "800" as const, color: colors.text },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" as const, color: colors.text },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "700" as const, color: colors.text },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const, color: colors.textMuted },
} as const;

/** Icons: Lucide (lucide-react-native v1.x), installed by 06.4. */
export const icons = { size: 24, small: 18, strokeWidth: 2.5 } as const;

/** Cubic-bezier control points. */
export const easings = {
  /** Most UI motion. */
  standard: [0.2, 0, 0, 1],
  /** Row expand and chip pop: a small overshoot, the "boing". */
  bounce: [0.34, 1.56, 0.64, 1],
  /** Leaving the screen. */
  exit: [0.4, 0, 1, 1],
} as const;

/** Durations in ms. With the OS's reduce-motion setting on, every visual duration is 0 and nothing bounces. */
export const motion = {
  /** The soundscape / piece crossfade at a chapter boundary (audio, not affected by reduce motion). */
  audioCrossfade: 2000,
  /** A visual crossfade between two states of one screen (empty to list, unscored to scored). */
  crossfade: 180,
  /** The river's row expanding or collapsing in place. */
  rowExpand: 260,
  /** A chip or button press: scale to `pressScale` and back. */
  press: 90,
  pressScale: 0.94,
  /** A chip popping in when scoring lands. */
  chipPop: 220,
  /** A bottom sheet rising. */
  sheet: 240,
} as const;

/** Text sizes for contrast: body text needs 4.5:1, large text (24px, or 18.66px bold) and UI parts 3:1. */
export type ContrastKind = "text" | "large" | "ui";

/** Every foreground/background pair the app draws, with the AA bar it must clear. */
export const contrastPairs: ReadonlyArray<{ name: string; fg: string; bg: string; kind: ContrastKind }> = [
  { name: "text on background", fg: colors.text, bg: colors.background, kind: "text" },
  { name: "text on surface", fg: colors.text, bg: colors.surface, kind: "text" },
  { name: "text on raised", fg: colors.text, bg: colors.raised, kind: "text" },
  { name: "textMuted on background", fg: colors.textMuted, bg: colors.background, kind: "text" },
  { name: "textMuted on surface", fg: colors.textMuted, bg: colors.surface, kind: "text" },
  { name: "textMuted on raised", fg: colors.textMuted, bg: colors.raised, kind: "text" },
  { name: "onAccent on accent", fg: colors.onAccent, bg: colors.accent, kind: "text" },
  { name: "accent on background", fg: colors.accent, bg: colors.background, kind: "text" },
  { name: "accent on surface", fg: colors.accent, bg: colors.surface, kind: "text" },
  { name: "pop on background", fg: colors.pop, bg: colors.background, kind: "text" },
  { name: "pop on surface", fg: colors.pop, bg: colors.surface, kind: "text" },
  { name: "danger on background", fg: colors.danger, bg: colors.background, kind: "text" },
  { name: "danger on surface", fg: colors.danger, bg: colors.surface, kind: "text" },
  { name: "danger on raised", fg: colors.danger, bg: colors.raised, kind: "text" },
  ...EMOTIONS.map((e) => ({ name: `onAccent on ${e}`, fg: colors.onAccent, bg: emotionHues[e], kind: "text" as const })),
  { name: "focus ring on background", fg: colors.focus, bg: colors.background, kind: "ui" },
  { name: "focus ring on surface", fg: colors.focus, bg: colors.surface, kind: "ui" },
  { name: "focus ring on raised", fg: colors.focus, bg: colors.raised, kind: "ui" },
  { name: "edge on background", fg: colors.edge, bg: colors.background, kind: "ui" },
  { name: "edge on surface", fg: colors.edge, bg: colors.surface, kind: "ui" },
  { name: "accent on raised (rule, selected chip)", fg: colors.accent, bg: colors.raised, kind: "ui" },
];
