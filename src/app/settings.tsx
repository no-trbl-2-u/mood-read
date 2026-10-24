import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { settings, SOUNDSCAPE_OFF, useSettings } from "@/lib/settings";
import { DEFAULT_SOUNDSCAPE_ID } from "@/lib/soundscapes";
import { SOUNDSCAPES } from "@/player/soundscapes";
import { Chip } from "@/ui/Chip";
import { LinkRow, RowDrawer, SettingsSection, SwitchRow, UnavailableRow } from "@/ui/SettingsList";
import { colors, spacing } from "@/ui/theme";
import { TopBar } from "@/ui/TopBar";

// Settings (spec 06, 06.3, A3), from the library's overflow menu: a plain list, each setting saved on the device
// as it changes (src/lib/settings.ts), with no Save button (design/layouts/DECISION.md, Settings). Rows for what
// has not shipped (Downloads and its storage meter, 05.6; Credits, 05.5; Spotify, 05.13) are shown as "Not
// available yet" and go live with their chunks. All its copy lives here.

const COMPANION_CAPTION =
  "Plays Mood Read's soundscape beside another app. It arrives in a later update; your choice is saved now.";

/**
 * The default soundscape's choices, the mixer's Layer chips (src/player/LayerPicker.tsx): Off and each bundled loop.
 * A book with no layer of its own plays it; a book's own pick in the mixer always wins (src/lib/bed.ts defaultBedFor).
 */
const SOUNDSCAPE_LABEL = "Default soundscape";
const SOUNDSCAPE_CHOICES: { id: string; label: string }[] = [
  { id: SOUNDSCAPE_OFF, label: "Off" },
  ...SOUNDSCAPES.map((s) => ({ id: s.id, label: s.name })),
];

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

export default function SettingsScreen() {
  const current = useSettings();
  const [choosing, setChoosing] = useState(false);
  // Nothing set, or a loop no longer bundled, plays 01.7's default (Night Wind), so that chip reads as on.
  const chosen =
    SOUNDSCAPE_CHOICES.find((c) => c.id === current.defaultSoundscapeId) ??
    SOUNDSCAPE_CHOICES.find((c) => c.id === DEFAULT_SOUNDSCAPE_ID) ??
    SOUNDSCAPE_CHOICES[0];

  return (
    <View style={styles.screen}>
      <TopBar title="Settings" back={{ label: "Library", onPress: goBack }} />
      <ScrollView contentContainerStyle={styles.body}>
        <SettingsSection label="Downloads">
          <SwitchRow
            testID="setting-wifi-only"
            title="Downloads on Wi-Fi only"
            value={current.wifiOnly}
            onChange={(wifiOnly) => settings.set({ wifiOnly })}
          />
          <UnavailableRow testID="setting-storage" title="Storage" />
        </SettingsSection>

        <SettingsSection label="Listening">
          <SwitchRow
            testID="setting-companion"
            title="Companion mode"
            caption={COMPANION_CAPTION}
            value={current.companionMode}
            onChange={(companionMode) => settings.set({ companionMode })}
          />
          <View>
            <LinkRow
              testID="setting-soundscape"
              title={SOUNDSCAPE_LABEL}
              value={chosen.label}
              expanded={choosing}
              onPress={() => setChoosing((open) => !open)}
            />
            {choosing && (
              <RowDrawer>
                <ScrollView horizontal contentContainerStyle={styles.chips} showsHorizontalScrollIndicator={false}>
                  {SOUNDSCAPE_CHOICES.map((c) => (
                    <Chip
                      key={c.id}
                      testID={`soundscape-${c.id}`}
                      label={c.label}
                      a11yLabel={`${SOUNDSCAPE_LABEL}: ${c.label}`}
                      on={c === chosen}
                      onPress={() => settings.set({ defaultSoundscapeId: c.id })}
                    />
                  ))}
                </ScrollView>
              </RowDrawer>
            )}
          </View>
        </SettingsSection>

        <SettingsSection label="Connected accounts">
          <UnavailableRow testID="setting-spotify" title="Spotify" />
        </SettingsSection>

        <SettingsSection label="About">
          <UnavailableRow testID="setting-credits" title="Credits" />
          <LinkRow testID="setting-privacy" title="Privacy policy" onPress={() => router.push("/privacy")} />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.md },
});
