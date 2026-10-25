import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import type { ImportResult } from "@/lib/backup";
import { copyText } from "@/lib/clipboard";
import { exportLibraryFile, importLibraryFile } from "@/lib/library-backup";
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
// the preview APK); a store or production build never has the section. "Your library" (05.17, A19) exports the library
// to one file and imports it back.

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

/**
 * "Export library" and "Import library" (05.17, A19): one file of what the listener made of each book, never its audio,
 * which they keep or send themselves; read back onto the books on this shelf that match it (title, author, length).
 */
const EXPORT_TITLE = "Export library";
const EXPORT_CAPTION = "One file of your places, bookmarks, moods, picks and mixes. Never the audio.";
const IMPORT_TITLE = "Import library";
const IMPORT_CAPTION = "Puts a library file's places, bookmarks, moods, picks and mixes back on the matching books here.";
const books = (n: number) => (n === 1 ? "1 book" : `${n} books`);
const exportedCaption = (n: number) => `Exported ${books(n)}. No audio in it.`;
const EXPORT_FAILED = "Couldn't export. Try again.";
const IMPORT_FAILED = "Couldn't read that file. Try again.";

function importedCaption(result: ImportResult): string {
  if (!result.ok) {
    return result.reason === "newer"
      ? "That file is from a newer Mood Read. Update the app, then import it again."
      : "That isn't a Mood Read library file. Nothing changed.";
  }
  const restored = `Restored ${books(result.restored.length)}.`;
  const n = result.unmatched.length;
  if (n === 0) return restored;
  const titles = result.unmatched.join(", ");
  return n === 1
    ? `${restored} 1 book isn't on this shelf: ${titles}. Import its audio, then the library again.`
    : `${restored} ${n} books aren't on this shelf: ${titles}. Import their audio, then the library again.`;
}

/** The listener's library as one file: out to the share sheet (a download on the web), and back in. */
function Backup() {
  const [exported, setExported] = useState(EXPORT_CAPTION);
  const [imported, setImported] = useState(IMPORT_CAPTION);
  const exportNow = () => {
    exportLibraryFile().then(
      (n) => setExported(exportedCaption(n)),
      () => setExported(EXPORT_FAILED),
    );
  };
  const importNow = () => {
    importLibraryFile().then(
      (result) => result && setImported(importedCaption(result)),
      () => setImported(IMPORT_FAILED),
    );
  };
  return (
    <SettingsSection label="Your library">
      <ActionRow testID="setting-export-library" title={EXPORT_TITLE} caption={exported} onPress={exportNow} />
      <ActionRow testID="setting-import-library" title={IMPORT_TITLE} caption={imported} onPress={importNow} />
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

        <Backup />

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
