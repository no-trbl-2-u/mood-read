import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useCatalog } from "@/lib/catalog-config";
import { buildCredits, type MusicCredit, type ReaderCredit, type SoundscapeCredit } from "@/lib/credits";
import { useBooks } from "@/lib/library";
import { SOUNDSCAPE_INFO } from "@/lib/soundscapes";
import { Icon } from "@/ui/Icon";
import { NOTICES } from "@/ui/licenses";
import { InfoRow, LinkRow, RowDrawer, SettingsSection } from "@/ui/SettingsList";
import { colors, sizes, spacing, typography } from "@/ui/theme";
import { TopBar } from "@/ui/TopBar";

// Credits (spec 05, 05.5, A12; design/layouts/DECISION.md, "Credits"): from the library's overflow menu and Settings'
// About, out of the way of listening (never on the player or the river). Every catalog piece with its license and
// the credit line it asks for, the bundled soundscapes, the readers of each LibriVox book on the device, and the
// open-source notices. What is credited comes from src/lib/credits.ts; all its copy lives here. Nothing is a sheet:
// the soundscapes and each notice open inline.

const COPY = {
  title: "Credits",
  back: "Your shelf",
  backA11y: "Back to your shelf",
  heroLead: "Thanks, ",
  heroWord: "everyone.",
  intro: "Every piece, sound and voice in Mood Read, and the license it plays under.",
  music: "Music",
  musicNone: "No music yet",
  musicNoneCaption: "The music catalog is on its way. Each piece will be credited here, as its license asks.",
  musicLoading: "Loading the music catalog",
  musicFailed: "The music catalog did not load",
  musicFailedCaption: "Its credits show here once it does.",
  source: "Source",
  license: "License",
  soundscapes: "Soundscapes",
  soundscapesCaption: "Each with its source and license",
  owned: "Made for Mood Read from scratch: synthesized, no recordings or samples. Owned by the project.",
  readers: "LibriVox readers",
  readersNote:
    "LibriVox recordings are in the public domain, so nothing is owed. We name the volunteers who read them anyway, as thanks.",
  readersNone: "No LibriVox books yet",
  readersNoneCaption: "Books you download from Browse free books are thanked here, with their readers.",
  notices: "Open-source notices",
  allNotices: "All notices",
};

const readBy = (r: ReaderCredit) =>
  `Read by ${r.readers ?? "LibriVox volunteers"} for LibriVox · public domain`;

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

/** A link out (a piece's source page, its license deed), on its own 44 px line. */
function OutLink(props: { label: string; a11yLabel: string; url: string; testID?: string }) {
  return (
    <Pressable
      testID={props.testID}
      role="link"
      aria-label={props.a11yLabel}
      onPress={() => Linking.openURL(props.url)}
      style={styles.outLink}
    >
      <Text style={styles.outLinkText}>{props.label}</Text>
      <Icon name="external-link" size="small" color={colors.accent} />
    </Pressable>
  );
}

function MusicRow({ piece }: { piece: MusicCredit }) {
  return (
    <InfoRow testID={`credit-piece-${piece.id}`} title={piece.title} captions={[`${piece.artist} · ${piece.license}`, piece.credit]}>
      <View>
        <OutLink label={COPY.source} a11yLabel={`${COPY.source}: ${piece.title}`} url={piece.source} />
        {piece.licenseUrl && (
          <OutLink label={COPY.license} a11yLabel={`${COPY.license}: ${piece.license}, ${piece.title}`} url={piece.licenseUrl} />
        )}
      </View>
    </InfoRow>
  );
}

function MusicSection() {
  const catalog = useCatalog();
  const pieces = catalog.status === "ready" ? buildCredits({ pieces: catalog.pieces, soundscapes: [], books: [] }).music : [];
  return (
    <SettingsSection label={COPY.music}>
      {catalog.status === "loading" ? (
        <InfoRow testID="credits-music-loading" title={COPY.musicLoading} />
      ) : catalog.status === "failed" ? (
        <InfoRow testID="credits-music-failed" title={COPY.musicFailed} captions={[COPY.musicFailedCaption]} />
      ) : pieces.length === 0 ? (
        <InfoRow testID="credits-music-empty" title={COPY.musicNone} captions={[COPY.musicNoneCaption]} />
      ) : (
        pieces.map((p) => <MusicRow key={p.id} piece={p} />)
      )}
    </SettingsSection>
  );
}

function SoundscapesSection({ soundscapes }: { soundscapes: SoundscapeCredit[] }) {
  const [open, setOpen] = useState(false);
  return (
    <SettingsSection label={COPY.soundscapes}>
      <View>
        <LinkRow
          testID="credits-soundscapes"
          title={soundscapes.map((s) => s.name).join(", ")}
          caption={COPY.soundscapesCaption}
          expanded={open}
          onPress={() => setOpen((o) => !o)}
        />
        {open && (
          <RowDrawer>
            {soundscapes.map((s) => (
              <InfoRow key={s.id} testID={`credit-soundscape-${s.id}`} title={s.name} captions={[s.owned ? COPY.owned : s.license]} />
            ))}
          </RowDrawer>
        )}
      </View>
    </SettingsSection>
  );
}

function NoticeRow({ notice }: { notice: (typeof NOTICES)[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <LinkRow testID={`credit-notice-${notice.id}`} title={`${notice.name} · ${notice.license}`} expanded={open} onPress={() => setOpen((o) => !o)} />
      {open && (
        <RowDrawer>
          <Text style={styles.notice} selectable>
            {notice.text.trimEnd()}
          </Text>
        </RowDrawer>
      )}
    </View>
  );
}

export default function CreditsScreen() {
  const books = useBooks();
  const { soundscapes, readers } = buildCredits({ pieces: [], soundscapes: SOUNDSCAPE_INFO, books });

  return (
    <View style={styles.screen}>
      <TopBar title={COPY.title} back={{ label: COPY.back, a11yLabel: COPY.backA11y, onPress: goBack }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.hero}>
          {COPY.heroLead}
          <Text style={styles.pop}>{COPY.heroWord}</Text>
        </Text>
        <Text style={styles.intro}>{COPY.intro}</Text>

        <MusicSection />
        <SoundscapesSection soundscapes={soundscapes} />

        <SettingsSection label={COPY.readers}>
          {readers.length === 0 ? (
            <InfoRow testID="credits-readers-empty" title={COPY.readersNone} captions={[COPY.readersNoneCaption]} />
          ) : (
            readers.map((r) => <InfoRow key={r.bookId} testID={`credit-book-${r.bookId}`} title={r.title} captions={[readBy(r)]} />)
          )}
        </SettingsSection>
        <Text style={styles.note}>{COPY.readersNote}</Text>

        <SettingsSection label={COPY.notices}>
          {NOTICES.map((n) => (
            <NoticeRow key={n.id} notice={n} />
          ))}
          <LinkRow testID="credits-all-notices" title={COPY.allNotices} onPress={() => router.push("/licenses")} />
        </SettingsSection>
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
  note: { ...typography.caption, marginTop: spacing.sm },
  outLink: { minHeight: sizes.touch, minWidth: sizes.touch, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.xs },
  outLinkText: { ...typography.label, color: colors.accent },
  notice: { ...typography.caption, color: colors.text, paddingHorizontal: spacing.md },
});
