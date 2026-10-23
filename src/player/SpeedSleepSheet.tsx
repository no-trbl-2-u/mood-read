// The Speed & Sleep bottom sheet: speed presets (0.5x to 3x where the platform plays it) with 0.1 steps, and the
// sleep timer (15, 30, 45 min, End of chapter, Off). The chosen chip shows which timer is set; what is left of it
// reads in the mini player docked below (A28), never here.
import { Pressable, StyleSheet, Text, View } from "react-native";

import { speedLabel } from "@/lib/labels";
import { MAX_SPEED, MIN_SPEED, SLEEP_MINUTES, speedPresets, stepSpeed } from "@/lib/timeline";
import { Chip } from "@/ui/Chip";
import { Sheet } from "@/ui/Sheet";
import { colors, spacing } from "@/ui/theme";

import { PLATFORM_MAX_SPEED, type PlayerApi } from "./PlayerProvider";

export function SpeedSleepSheet({ player, onClose }: { player: PlayerApi; onClose: () => void }) {
  const { speed, sleep } = player;
  return (
    <Sheet title="Speed & Sleep" onClose={onClose} testID="speed-sleep-sheet">
      <View style={styles.section}>
        <Text style={styles.label}>Speed</Text>
        <View style={styles.chips}>
          {speedPresets(PLATFORM_MAX_SPEED).map((s) => (
            <Chip
              key={s}
              testID={`speed-${s}`}
              label={speedLabel(s)}
              on={Math.abs(speed - s) < 0.001}
              onPress={() => player.setSpeed(s)}
            />
          ))}
        </View>
        <View style={styles.stepper}>
          <StepButton
            label="Slower"
            disabled={speed <= MIN_SPEED}
            onPress={() => player.setSpeed(stepSpeed(speed, -1, PLATFORM_MAX_SPEED))}
            testID="speed-slower"
          />
          <Text style={styles.speedNow} testID="speed-now">
            {speedLabel(speed)}
          </Text>
          <StepButton
            label="Faster"
            disabled={speed >= PLATFORM_MAX_SPEED}
            onPress={() => player.setSpeed(stepSpeed(speed, 1, PLATFORM_MAX_SPEED))}
            testID="speed-faster"
          />
        </View>
        {PLATFORM_MAX_SPEED < MAX_SPEED && (
          <Text style={styles.muted}>This device plays up to {speedLabel(PLATFORM_MAX_SPEED)}.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Sleep timer</Text>
        <View style={styles.chips}>
          {SLEEP_MINUTES.map((m) => (
            <Chip
              key={m}
              testID={`sleep-${m}`}
              label={`${m} min`}
              on={sleep?.kind === "minutes" && sleep.minutes === m}
              onPress={() => player.setSleepMinutes(m)}
            />
          ))}
          <Chip
            testID="sleep-chapter"
            label="End of chapter"
            on={sleep?.kind === "chapterEnd"}
            onPress={player.setSleepEndOfChapter}
          />
          <Chip testID="sleep-off" label="Off" on={!sleep} onPress={player.cancelSleep} />
        </View>
      </View>
    </Sheet>
  );
}

function StepButton(props: { label: string; disabled: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={props.testID}
      role="button"
      aria-disabled={props.disabled}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.step, props.disabled && styles.stepOff]}
    >
      <Text style={styles.stepText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: "600", textTransform: "uppercase" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  speedNow: { color: colors.text, fontSize: 16, fontWeight: "700", minWidth: 48, textAlign: "center" },
  step: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepOff: { opacity: 0.4 },
  stepText: { color: colors.text, fontSize: 14 },
  muted: { color: colors.textMuted, fontSize: 13 },
});
