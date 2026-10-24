// Companion mode's line under the top bar (01.14, A27), inline in the river like the scoring band, never a sheet:
// it says that only the layer plays here, beside the listener's other app, and holds the chapter timer. The river
// and the mini player stay as they are: tapping a chapter moves the bed to it, the 30 s skips and the scrubber nudge
// its clock, and play/pause plays the bed alone. Its copy lives here.
import { StyleSheet, Text, View } from "react-native";

import { SwitchRow } from "@/ui/SettingsList";
import { colors, spacing, strokes, typography } from "@/ui/theme";

const COPY = {
  title: "Companion mode",
  body: "Only the layer plays here, no narration, beside your other app. Tap a chapter to move it along.",
  timer: "Chapter timer",
  timerCaption: "Moves to the next chapter when this one's length runs out, at the speed you set.",
} as const;

export function CompanionBand(props: { timer: boolean; onTimer: (on: boolean) => void }) {
  return (
    <View style={styles.band} testID="companion-band">
      <View style={styles.text}>
        <Text style={styles.title} role="heading" aria-level={2}>
          {COPY.title}
        </Text>
        <Text style={styles.caption}>{COPY.body}</Text>
      </View>
      <SwitchRow
        testID="companion-timer"
        title={COPY.timer}
        caption={COPY.timerCaption}
        value={props.timer}
        onChange={props.onTimer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    paddingTop: spacing.sm,
    borderBottomWidth: strokes.hairline,
    borderBottomColor: colors.border,
    borderStyle: "dashed",
  },
  text: { gap: spacing.xxs, paddingHorizontal: spacing.md },
  title: { ...typography.label, color: colors.accent },
  caption: typography.caption,
});
