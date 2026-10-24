// Motion that respects the OS's reduce-motion setting (design/system/DECISION.md, Motion): with it on, nothing
// scales or bounces. One subscription for the whole app, read by every pressable through `useReduceMotion`.
import { useSyncExternalStore } from "react";
import { AccessibilityInfo, StyleSheet } from "react-native";

import { motion } from "./theme";

let reduce = false;
let started = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  reduce = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  if (!started) {
    started = true;
    AccessibilityInfo.isReduceMotionEnabled().then(set, () => {});
    AccessibilityInfo.addEventListener("reduceMotionChanged", set);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while the OS asks for reduced motion. */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reduce, () => reduce);
}

/**
 * A sticker's press (chips, buttons): it is pushed in, its hard shadow gone, and scales to `motion.pressScale`
 * unless motion is reduced. Null when not pressed.
 */
export function pressStyle(pressed: boolean, reduceMotion: boolean) {
  if (!pressed) return null;
  return reduceMotion ? styles.pushed : [styles.pushed, styles.shrunk];
}

const styles = StyleSheet.create({
  pushed: { boxShadow: "none" },
  shrunk: { transform: [{ scale: motion.pressScale }] },
});
