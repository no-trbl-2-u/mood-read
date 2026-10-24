import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { NOTICES } from "@/ui/licenses";
import { colors, radii, spacing, strokes, typography } from "@/ui/theme";
import { TopBar } from "@/ui/TopBar";

// Open-source licenses (spec 06, 06.4; design/system/DECISION.md, Iconography): every notice Mood Read must ship,
// word for word, from Settings. The texts come from src/ui/licenses.ts, written from each package's own license
// file by scripts/licenses.mjs; the web build serves the same text at /licenses.txt. All its copy lives here.

const COPY = {
  title: "Open-source licenses",
  intro: "Mood Read is built with the open-source work below. Each notice is its license, word for word.",
  back: "Settings",
  backA11y: "Back to Settings",
};

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/settings"));

export default function LicensesScreen() {
  return (
    <View style={styles.screen}>
      <TopBar title={COPY.title} back={{ label: COPY.back, a11yLabel: COPY.backA11y, onPress: goBack }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.intro}>{COPY.intro}</Text>
        {NOTICES.map((n) => (
          <View key={n.id} style={styles.notice} testID={`license-${n.id}`}>
            <Text style={styles.heading} role="heading" aria-level={2}>
              {n.name}
            </Text>
            <Text style={styles.caption}>
              {n.package} {n.version} · {n.license}
            </Text>
            <View style={styles.card}>
              <Text style={styles.text} selectable>
                {n.text.trimEnd()}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.lg },
  intro: { ...typography.body, color: colors.textMuted },
  notice: { gap: spacing.sm },
  heading: typography.heading,
  caption: typography.caption,
  card: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: strokes.hairline,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  text: { ...typography.caption, color: colors.text },
});
