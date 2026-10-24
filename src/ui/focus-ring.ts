// The focus ring on the web (design/system/DECISION.md, Components, Focus; 06.5): a keyboard focus on any control
// draws the theme's `focusRing`, a 2 px `focus` outline offset 2 px, in place of the browser's own. Only a keyboard
// (or switch) focus shows it (`:focus-visible`), never a tap. On a phone the OS draws its own focus highlight, so
// this is web only.
import { Platform } from "react-native";

import { focusRing } from "./theme";

const ID = "mood-read-focus-ring";

/** The rule the web build adds once, from the theme's tokens. */
export const FOCUS_RING_CSS =
  `:focus-visible { outline: ${focusRing.width}px solid ${focusRing.color} !important; ` +
  `outline-offset: ${focusRing.offset}px !important; }`;

/** Adds the focus ring's rule to the page once; nothing on native. */
export function installFocusRing(): void {
  if (Platform.OS !== "web" || typeof document === "undefined" || document.getElementById(ID)) return;
  const style = document.createElement("style");
  style.id = ID;
  style.textContent = FOCUS_RING_CSS;
  document.head.appendChild(style);
}
