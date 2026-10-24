import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { soundtrack, useSoundtrack } from "@/lib/soundtrack";
import type { SoundtrackGroup } from "@/lib/soundtrack-store";
import { Icon } from "@/ui/Icon";
import { InfoRow, SettingsSection } from "@/ui/SettingsList";
import { colors, radii, sizes, spacing, strokes, typography } from "@/ui/theme";
import { TopBar } from "@/ui/TopBar";

// Your soundtrack (07.8, spec 07 A9), from the library's overflow menu: every piece that has played for a chapter the
// listener reached, grouped by book in the shelf's order, each with its title and artist (src/lib/soundtrack-store.ts).
// It plays nothing by itself, and one row clears it. Link-outs join each piece when 01.11 lands. All its copy lives
// here.
const COPY = {
  title: "Your soundtrack",
  back: "Your shelf",
  backA11y: "Back to your shelf",
  heroLead: "Every piece ",
  heroWord: "so far.",
  intro: "The music that has played for the chapters you reached, by book. Nothing plays from here.",
  empty: "Nothing has played yet: each piece shows here, under its book, the first time its chapter plays.",
  clear: "Clear your soundtrack",
};

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

function BookGroup({ group }: { group: SoundtrackGroup }) {
  return (
    <View testID={`soundtrack-book-${group.bookId}`}>
      <SettingsSection label={group.title}>
        {group.pieces.map((p) => (
          <InfoRow key={p.id} testID={`soundtrack-piece-${group.bookId}-${p.id}`} title={p.title} captions={[p.artist]} />
        ))}
      </SettingsSection>
    </View>
  );
}

export default function SoundtrackScreen() {
  const groups = useSoundtrack();

  return (
    <View style={styles.screen}>
      <TopBar title={COPY.title} back={{ label: COPY.back, a11yLabel: COPY.backA11y, onPress: goBack }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.hero}>
          {COPY.heroLead}
          <Text style={styles.pop}>{COPY.heroWord}</Text>
        </Text>
        <Text style={styles.intro}>{COPY.intro}</Text>

        {groups.length === 0 ? (
          <Text testID="soundtrack-empty" style={styles.empty}>
            {COPY.empty}
          </Text>
        ) : (
          <>
            {groups.map((g) => (
              <BookGroup key={g.bookId} group={g} />
            ))}
            <Pressable
              testID="soundtrack-clear"
              role="button"
              aria-label={COPY.clear}
              onPress={() => soundtrack.clear()}
              style={styles.clear}
            >
              <Icon name="x" size="small" color={colors.danger} />
              <Text style={styles.clearTitle}>{COPY.clear}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl },
  hero: typography.title,
  pop: { color: colors.pop },
  intro: { ...typography.caption, marginTop: spacing.xs },
  empty: { ...typography.body, marginTop: spacing.lg },
  clear: {
    minHeight: sizes.settingRow,
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: strokes.hairline,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  clearTitle: { flex: 1, minWidth: 0, ...typography.label, fontSize: typography.body.fontSize, color: colors.danger },
});
