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
  /** An error line, and the fill of a confirming destructive button ("Delete book"). */
  danger: "#ff7a7a",
  /** No paint: a border or fill that is present for layout but not drawn. */
  transparent: "transparent",
} as const;

/** A cover with no art: a muted tile tinted from the book's id (a hue, 0 to 359), so books tell apart. */
export function coverTint(hue: number): string {
  return `hsl(${hue}, 30%, 28%)`;
}

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

/** Fixed control sizes (design/layouts/DECISION.md, v2). No touch target is under `touch`. */
export const sizes = {
  /** The smallest touch target (WCAG 2.2, spec 06 A5). */
  touch: 44,
  /** A menu row and an icon button. */
  menuRow: 48,
  /** A settings row. */
  settingRow: 56,
  /** A popover menu's width. */
  menuWidth: 250,
  /** The settings switch: its track and knob. */
  switchWidth: 52,
  switchHeight: 32,
  switchKnob: 22,
  /** A top bar's title line. */
  topBar: 52,
  /** A primary or secondary button's height. */
  button: 48,
  /** The mini player's play / pause button. */
  play: 48,
  /** A library row's cover (portrait). */
  coverWidth: 52,
  coverHeight: 70,
  /** The mini player's square cover. */
  miniCover: 44,
  /** The play mark on the cover of the book in progress. */
  coverMark: 20,
  /** The import note's file tile. */
  fileTileWidth: 72,
  fileTileHeight: 88,
  /** A bottom sheet's handle. */
  handleWidth: 40,
  handleHeight: 4,
  /** A progress bar or slider track. */
  track: 6,
  /** The slider's thumb. */
  thumb: 24,
  /** The speed readout between Slower and Faster. */
  readout: 48,
  /** The narrowest an inline text field gets before it wraps. */
  inputMin: 160,
} as const;

/** Opacities: a row that is not available yet (and a disabled control), and the list behind an open menu. */
export const opacities = { disabled: 0.55, behindMenu: 0.55 } as const;

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

/** A hard shadow as a React Native `boxShadow` string (zero blur). */
export function hardShadow(s: { offsetX: number; offsetY: number; color: string }): string {
  return `${s.offsetX}px ${s.offsetY}px 0 ${s.color}`;
}

/** A sticker's tilt in degrees, cycled by index so a row of chips never lines up. */
export const tilts = [-3, 2, -1.5, 3, -2, 1] as const;

/** The focus ring: drawn outside the control, never replaced by colour alone. */
export const focusRing = { width: strokes.outline, offset: 2, color: colors.focus } as const;

/**
 * Font families. The display face is Bricolage Grotesque ExtraBold (SIL OFL 1.1, Google Fonts), bundled from
 * `@expo-google-fonts/bricolage-grotesque` and loaded under this name by src/app/_layout.tsx. Body text is the
 * system font (`body` undefined).
 */
export const fonts = {
  display: "BricolageGrotesque_800ExtraBold" as string,
  body: undefined as string | undefined,
} as const;

/**
 * The type scale, in px. Display, title and heading use the display face. Its file is the 800 weight itself, so
 * those styles ask for no extra weight (a weight on top makes browsers draw a fake bold over it).
 */
export const typography = {
  display: { fontFamily: fonts.display, fontSize: 44, lineHeight: 46, letterSpacing: -1, color: colors.text },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.5, color: colors.text },
  heading: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.text },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" as const, color: colors.text },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "700" as const, color: colors.text },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const, color: colors.textMuted },
  /** The mini player's times; the 12 px state chips (design/layouts/DECISION.md, v2). */
  meta: { fontSize: 12, lineHeight: 16, fontWeight: "400" as const, color: colors.textMuted },
} as const;

/** Icons: Lucide (lucide-react-native v1.x), drawn through src/ui/Icon.tsx. */
export const icons = {
  size: 24,
  /** Inline in text, and inside a 44 px control that also holds a label. */
  small: 18,
  /** The play mark inside a cover's 20 px badge. */
  mark: 10,
  strokeWidth: 2.5,
} as const;

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
export const contrastPairs: readonly { name: string; fg: string; bg: string; kind: ContrastKind }[] = [
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
  { name: "onAccent on pop (the Finished chip, the downloads badge)", fg: colors.onAccent, bg: colors.pop, kind: "text" },
  { name: "onAccent on danger (the confirming Delete book)", fg: colors.onAccent, bg: colors.danger, kind: "text" },
  ...EMOTIONS.map((e) => ({ name: `onAccent on ${e}`, fg: colors.onAccent, bg: emotionHues[e], kind: "text" as const })),
  { name: "focus ring on background", fg: colors.focus, bg: colors.background, kind: "ui" },
  { name: "focus ring on surface", fg: colors.focus, bg: colors.surface, kind: "ui" },
  { name: "focus ring on raised", fg: colors.focus, bg: colors.raised, kind: "ui" },
  { name: "edge on background", fg: colors.edge, bg: colors.background, kind: "ui" },
  { name: "edge on surface", fg: colors.edge, bg: colors.surface, kind: "ui" },
  { name: "accent on raised (rule, selected chip)", fg: colors.accent, bg: colors.raised, kind: "ui" },
];
