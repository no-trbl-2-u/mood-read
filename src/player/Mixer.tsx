// The mixer, inline in the playing chapter's expanded row (01.5; design/layouts/DECISION.md "Mixer (inline, in the
// expanded row)"), never a sheet: Balance between narration and the layer, Master volume, and Duck under voice
// (On / Off), Quiet opening (On / Off, 07.3, A4: the layer holds silent for each chapter's first 20 s), then the Layer
// chips (01.7, ./LayerPicker.tsx). The setting is the book's, saved per book (A10).
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { balanceText, MIX_STEP, percentText, type Mix } from "@/lib/mix";
import { Chip } from "@/ui/Chip";
import { Slider } from "@/ui/Slider";
import { spacing, typography } from "@/ui/theme";

import { usePlayer } from "./PlayerProvider";

const COPY = {
  heading: "Mixer",
  balance: "Balance",
  narration: "Narration",
  layer: "Layer",
  master: "Master volume",
  duck: "Duck under voice",
  on: "On",
  off: "Off",
  quiet: "Quiet opening",
  quietNote: "The layer waits 20 s into each chapter, so the chapter title lands clean.",
  duckUnsupported: "This chapter's file can't be read for duck yet, so the layer stays level.",
};

export function Mixer({ mix, onChange, layer }: { mix: Mix; onChange: (patch: Partial<Mix>) => void; layer?: ReactNode }) {
  const { duckBlocked } = usePlayer();
  return (
    <View style={styles.mixer} testID="mixer">
      <Text style={styles.heading}>{COPY.heading}</Text>

      <View style={styles.control}>
        <View style={styles.captionRow}>
          <Text style={styles.label}>{COPY.balance}</Text>
          <Text style={styles.value} testID="mix-balance-value">
            {balanceText(mix)}
          </Text>
        </View>
        <Slider
          testID="mix-balance"
          label={COPY.balance}
          value={mix.balance}
          min={-1}
          max={1}
          step={MIX_STEP}
          origin={0}
          valueText={balanceText(mix)}
          onChange={(balance) => onChange({ balance })}
        />
        <View style={styles.ends}>
          <Text style={styles.end}>{COPY.narration}</Text>
          <Text style={styles.end}>{COPY.layer}</Text>
        </View>
      </View>

      <View style={styles.control}>
        <View style={styles.captionRow}>
          <Text style={styles.label}>{COPY.master}</Text>
          <Text style={styles.value} testID="mix-master-value">
            {percentText(mix.master)}
          </Text>
        </View>
        <Slider
          testID="mix-master"
          label={COPY.master}
          value={mix.master}
          min={0}
          max={1}
          step={MIX_STEP}
          valueText={percentText(mix.master)}
          onChange={(master) => onChange({ master })}
        />
      </View>

      <View style={styles.toggleRow} role="group" aria-label={COPY.duck}>
        <Text style={styles.label}>{COPY.duck}</Text>
        <View style={styles.chips}>
          <Chip testID="mix-duck-on" label={COPY.on} a11yLabel={`${COPY.duck}: ${COPY.on}`} on={mix.duck} onPress={() => onChange({ duck: true })} />
          <Chip testID="mix-duck-off" label={COPY.off} a11yLabel={`${COPY.duck}: ${COPY.off}`} on={!mix.duck} onPress={() => onChange({ duck: false })} />
        </View>
      </View>
      {mix.duck && duckBlocked && <Text style={styles.note}>{COPY.duckUnsupported}</Text>}

      <View style={styles.toggleRow} role="group" aria-label={COPY.quiet}>
        <Text style={styles.label}>{COPY.quiet}</Text>
        <View style={styles.chips}>
          <Chip
            testID="mix-quiet-on"
            label={COPY.on}
            a11yLabel={`${COPY.quiet}: ${COPY.on}`}
            on={mix.quietOpening}
            onPress={() => onChange({ quietOpening: true })}
          />
          <Chip
            testID="mix-quiet-off"
            label={COPY.off}
            a11yLabel={`${COPY.quiet}: ${COPY.off}`}
            on={!mix.quietOpening}
            onPress={() => onChange({ quietOpening: false })}
          />
        </View>
      </View>
      {mix.quietOpening && <Text style={styles.note}>{COPY.quietNote}</Text>}
      {layer}
    </View>
  );
}

const styles = StyleSheet.create({
  mixer: { gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.xs },
  heading: { ...typography.caption, fontWeight: typography.label.fontWeight },
  control: { gap: spacing.xxs },
  captionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: spacing.sm },
  label: typography.label,
  value: { ...typography.caption, flexShrink: 1, textAlign: "right" },
  ends: { flexDirection: "row", justifyContent: "space-between" },
  end: typography.meta,
  toggleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  chips: { flexDirection: "row", gap: spacing.sm },
  note: typography.caption,
});
