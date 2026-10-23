// A minimal accessible slider for web and native, no dependency: a track you tap or drag, a keyboard (arrows,
// Page Up/Down, Home, End) on the web, and screen-reader increment and decrement everywhere. The mixer's balance and
// master volume (01.5) use it.
import { useRef, useState } from "react";
import { StyleSheet, View, type AccessibilityActionEvent, type GestureResponderEvent, type KeyDownEvent } from "react-native";

import { colors, focusRing, radii } from "./theme";

const THUMB = 24;

export function Slider(props: {
  /** What it sets, for assistive tech ("Balance"). */
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value in words ("Narration 100%, layer 60%"). */
  valueText: string;
  onChange: (value: number) => void;
  /** Where the fill starts: the minimum (a level) or a middle value (a balance). */
  origin?: number;
  testID?: string;
}) {
  const { min, max, step } = props;
  const width = useRef(0);
  const left = useRef(0);
  const [focused, setFocused] = useState(false);

  const snap = (v: number) => {
    const s = Math.round((v - min) / step) * step + min;
    return Math.round(Math.min(max, Math.max(min, s)) * 1000) / 1000;
  };
  const set = (v: number) => {
    const next = snap(v);
    if (next !== props.value) props.onChange(next);
  };
  const fromX = (pageX: number) => {
    if (width.current <= 0) return;
    set(min + ((pageX - left.current) / width.current) * (max - min));
  };
  const grant = (e: GestureResponderEvent) => {
    // The children take no touches, so locationX is within the track; pageX then follows the finger anywhere.
    left.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
    fromX(e.nativeEvent.pageX);
  };
  const onKeyDown = (e: KeyDownEvent) => {
    const big = (max - min) / 4;
    const moves: Record<string, number> = {
      ArrowRight: props.value + step,
      ArrowUp: props.value + step,
      ArrowLeft: props.value - step,
      ArrowDown: props.value - step,
      PageUp: props.value + big,
      PageDown: props.value - big,
      Home: min,
      End: max,
    };
    const next = moves[e.nativeEvent.key];
    if (next === undefined) return;
    (e as unknown as { preventDefault?: () => void }).preventDefault?.();
    set(next);
  };
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === "increment") set(props.value + step);
    if (e.nativeEvent.actionName === "decrement") set(props.value - step);
  };

  const span = max - min || 1;
  const at = (Math.min(max, Math.max(min, props.value)) - min) / span;
  const origin = ((props.origin ?? min) - min) / span;
  const fillLeft = Math.min(at, origin);
  const fillWidth = Math.abs(at - origin);

  return (
    <View
      testID={props.testID}
      role="slider"
      aria-label={props.label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={props.value}
      aria-valuetext={props.valueText}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={onAction}
      focusable
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onLayout={(e) => (width.current = e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={grant}
      onResponderMove={(e) => fromX(e.nativeEvent.pageX)}
      style={[styles.hit, focused && styles.focused]}
    >
      <View pointerEvents="none" style={styles.track}>
        <View style={[styles.fill, { left: `${fillLeft * 100}%`, width: `${fillWidth * 100}%` }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: `${at * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { minHeight: 44, justifyContent: "center", marginHorizontal: THUMB / 2, borderRadius: radii.sm },
  focused: { outlineWidth: focusRing.width, outlineColor: focusRing.color, outlineStyle: "solid", outlineOffset: focusRing.offset },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
  fill: { position: "absolute", top: 0, bottom: 0, backgroundColor: colors.accent },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    marginTop: -THUMB / 2,
    top: "50%",
    borderRadius: radii.pill,
    backgroundColor: colors.edge,
    borderWidth: 2,
    borderColor: colors.ink,
  },
});
