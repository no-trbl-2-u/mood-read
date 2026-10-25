import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { copyText } from "@/lib/clipboard";
import { useBooks } from "@/lib/library";
import { prescoreList } from "@/lib/owner-tools";
import { OWNER_TOOLS } from "@/lib/owner-tools-config";
import { settings, SOUNDSCAPE_OFF, useSettings } from "@/lib/settings";
import { useStorageMeter } from "@/lib/downloads";
import { DEFAULT_SOUNDSCAPE_ID } from "@/lib/soundscapes";
import { formatBytes } from "@/lib/storage";
import { SOUNDSCAPES } from "@/player/soundscapes";
import { Chip } from "@/ui/Chip";
import { ActionRow, LinkRow, RowDrawer, SettingsSection, SwitchRow, UnavailableRow } from "@/ui/SettingsList";
import { colors, spacing } from "@/ui/theme";
import { TopBar } from "@/ui/TopBar";

// Settings (spec 06, 06.3, A3), from the library's overflow menu: a plain list, each setting saved on the device
// as it changes (src/lib/settings.ts), with no Save button (design/layouts/DECISION.md, Settings). A row for what
// has not shipped (Spotify, 05.13) is shown as "Not available yet" and goes live with its chunk; Credits (05.5)
// pushes /credits. Storage (05.6) links to /downloads, where the storage meter and the queue live. All its copy lives here.
// "Owner tools" (05.21, spec 05 A23) shows only in a build whose app config turns them on (app.config.ts: local dev and
// the preview APK); a store or production build never has the section.

/** "Share what fits" (07.5, spec 07 A6): what the switch sends, in the privacy policy's terms. */
const SHARE_CAPTION =
  "Once a day, your Fits and Doesn't fit go to the scoring proxy as just the piece, the chapter's emotions and the verdict, " +
  "to order every listener's alternates. No book, chapter, device or time. Off, they stay on this device.";

const COMPANION_CAPTION =
  "Plays only Mood Read's soundscape, no narration, beside another app such as Audible. " +
  "While it is on, the lock screen stays with that app.";

/**
 * The default soundscape's choices, the mixer's Layer chips (src/player/LayerPicker.tsx): Off and each bundled loop.
 * A book with no layer of its own plays it; a book's own pick in the mixer always wins (src/lib/bed.ts defaultBedFor).
 */
const SOUNDSCAPE_LABEL = "Default soundscape";
const SOUNDSCAPE_CHOICES: { id: string; label: string }[] = [
  { id: SOUNDSCAPE_OFF, label: "Off" },
  ...SOUNDSCAPES.map((s) => ({ id: s.id, label: s.name })),
];

/** "Copy books for pre-scoring" (05.21, A23): what the row says, and how the copy went. */
const PRESCORE_TITLE = "Copy books for pre-scoring";
const PRESCORE_CAPTION = "Each book's title, author, chapter titles and catalog numbers, as JSON for pnpm prescore.";
const copiedCaption = (n: number) => (n === 1 ? "Copied 1 book." : `Copied ${n} books.`);
const COPY_FAILED = "Couldn't copy. Try again.";

/** The owner's own section: copies every library book's scoring request; the app sends it nowhere itself. */
function OwnerTools() {
  const books = useBooks();
  const [caption, setCaption] = useState(PRESCORE_CAPTION);
  const copy = () => {
    copyText(prescoreList(books)).then(
      () => setCaption(copiedCaption(books.length)),
      () => setCaption(COPY_FAILED),
    );
  };
  return (
    <SettingsSection label="Owner tools">
      <ActionRow testID="setting-prescore-copy" title={PRESCORE_TITLE} caption={caption} onPress={copy} />
    </SettingsSection>
  );
}

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

export default function SettingsScreen() {
  const current = useSettings();
  const meter = useStorageMeter();
  const storageValue = meter.booksBytes === null ? undefined : formatBytes(meter.booksBytes + meter.musicBytes);
  const [choosing, setChoosing] = useState(false);
  // Nothing set, or a loop no longer bundled, plays 01.7's default (Night Wind), so that chip reads as on.
  const chosen =
    SOUNDSCAPE_CHOICES.find((c) => c.id === current.defaultSoundscapeId) ??
    SOUNDSCAPE_CHOICES.find((c) => c.id === DEFAULT_SOUNDSCAPE_ID) ??
    SOUNDSCAPE_CHOICES[0];

  return (
    <View style={styles.screen}>
      <TopBar title="Settings" back={{ label: "Your shelf", a11yLabel: "Back to your shelf", onPress: goBack }} />
      <ScrollView contentContainerStyle={styles.body}>
        <SettingsSection label="Downloads">
          <SwitchRow
            testID="setting-wifi-only"
            title="Downloads on Wi-Fi only"
            value={current.wifiOnly}
            onChange={(wifiOnly) => settings.set({ wifiOnly })}
          />
          <LinkRow testID="setting-storage" title="Storage" value={storageValue} onPress={() => router.push("/downloads")} />
        </SettingsSection>

        <SettingsSection label="Listening">
          <SwitchRow
            testID="setting-companion"
            title="Companion mode"
            caption={COMPANION_CAPTION}
            value={current.companionMode}
            onChange={(companionMode) => settings.set({ companionMode })}
          />
          <SwitchRow
            testID="setting-share-verdicts"
            title="Share what fits"
            caption={SHARE_CAPTION}
            value={current.shareVerdicts}
            onChange={(shareVerdicts) => settings.set({ shareVerdicts })}
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

        {OWNER_TOOLS && <OwnerTools />}

        <SettingsSection label="About">
          <LinkRow testID="setting-credits" title="Credits" onPress={() => router.push("/credits")} />
          <LinkRow testID="setting-privacy" title="Privacy policy" onPress={() => router.push("/privacy")} />
          <LinkRow testID="setting-licenses" title="Open-source licenses" onPress={() => router.push("/licenses")} />
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
