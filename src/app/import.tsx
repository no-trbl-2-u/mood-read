import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { importFiles, pickFiles, pickFolder, type ImportOutcome, type ImportStep } from "@/lib/library";
import type { DrmKind } from "@/lib/meta/types";
import { colors, radii, spacing, typography } from "@/ui/theme";
import { TopBar } from "@/ui/TopBar";

// Import (spec 01 A5-A7; design/layouts/DECISION.md "Import note"): a full screen pushed from the library. The
// listener picks DRM-free files or a folder of them and they become one book. An AAX/AAXC file turns the screen
// into the import note: what the file is, why it cannot open, and where a DRM-free copy comes from. It never
// suggests converting the file (A7, spec 01 Open questions 2 as revised by 01.13).

const STEPS: Record<ImportStep, string> = {
  reading: "Reading the tags",
  copying: "Copying onto this device",
  chapters: "Finding the chapters",
};

const FORMATS = "M4B, M4A, MP3, WAV, FLAC, OGG or Opus";

const DRM_NAME: Record<DrmKind, string> = {
  aax: "an Audible-encrypted audiobook (AAX)",
  aaxc: "an Audible-encrypted audiobook (AAXC)",
  protected: "locked by DRM",
};

const TILE: Record<DrmKind, string> = { aax: "AAX", aaxc: "AAXC", protected: "DRM" };

type Note = { fileName: string; drm: DrmKind };

const backToLibrary = () => (router.canGoBack() ? router.back() : router.replace("/"));

export default function ImportScreen() {
  const [step, setStep] = useState<ImportStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  async function choose(kind: "files" | "folder") {
    // The picker opens first, inside the tap: a browser only opens a file dialog from a user gesture.
    const picking = kind === "files" ? pickFiles() : pickFolder();
    setError(null);
    let outcome: ImportOutcome;
    try {
      outcome = await importFiles(await picking, setStep);
    } catch {
      outcome = { kind: "unsupported", fileName: "" };
    } finally {
      setStep(null);
    }
    switch (outcome.kind) {
      case "book":
        router.replace(`/book/${outcome.book.id}`);
        return;
      case "drm":
        setNote({ fileName: outcome.fileName, drm: outcome.drm });
        return;
      case "unsupported":
        setError(
          outcome.fileName
            ? `"${outcome.fileName}" is not an audio file Mood Read can open. Pick an audiobook in ${FORMATS}.`
            : `That file could not be opened. Pick a DRM-free audiobook in ${FORMATS}.`,
        );
        return;
      case "empty":
        setError(`That folder has no audio files. Pick a folder of ${FORMATS} files.`);
        return;
      case "cancelled":
        return;
    }
  }

  if (note) return <ImportNote note={note} onChooseAnother={() => {
          setNote(null);
          choose("files");
        }} />;

  const busy = step !== null;
  return (
    <View style={styles.screen}>
      <TopBar title="Import" back={{ label: "Library", onPress: backToLibrary }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.heading}>Import a book</Text>
        <Text style={styles.text}>
          Pick an audiobook you own as DRM-free files: {FORMATS}. One file, several files, or a folder that holds one
          book.
        </Text>
        <Text style={styles.muted}>
          The title, author and cover come from the files&apos; tags, and the chapters from their chapter markers. The
          files stay on this device.
        </Text>
        <Pressable testID="privacy-link" role="link" style={styles.link} onPress={() => router.push("/privacy")}>
          <Text style={styles.linkText}>Privacy policy</Text>
        </Pressable>
        {error && (
          <Text style={styles.error} role="alert">
            {error}
          </Text>
        )}
        {busy && (
          <Text style={styles.muted} testID="import-step" role="status">
            {STEPS[step]}
          </Text>
        )}
        <View style={styles.actions}>
          <Pressable
            testID="import-files"
            role="button"
            style={[styles.primary, busy && styles.busy]}
            disabled={busy}
            onPress={() => choose("files")}
          >
            <Text style={styles.primaryText}>Choose files</Text>
          </Pressable>
          <Pressable
            testID="import-folder"
            role="button"
            style={[styles.secondary, busy && styles.busy]}
            disabled={busy}
            onPress={() => choose("folder")}
          >
            <Text style={styles.secondaryText}>Choose a folder</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

/** The import note (A7): a full-screen state of Import for an AAX/AAXC (or other DRM-locked) file. */
function ImportNote({ note, onChooseAnother }: { note: Note; onChooseAnother: () => void }) {
  const [more, setMore] = useState(false);
  return (
    <View style={styles.screen} testID="import-note">
      <TopBar title="Import" back={{ label: "Library", onPress: backToLibrary }} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.tile}>
          <Text style={styles.tileText}>{TILE[note.drm]}</Text>
        </View>
        <Text style={styles.heading} role="heading">
          Can&apos;t open this file
        </Text>
        <Text style={styles.text} testID="import-note-text">
          &quot;{note.fileName}&quot; is {DRM_NAME[note.drm]}.{" "}
          {note.drm === "protected"
            ? "Mood Read never decrypts locked files."
            : "Mood Read never decrypts Audible files and never asks for your Audible password."}
        </Text>
        <Text style={styles.muted}>
          Bring a DRM-free copy instead: from a DRM-free store such as Libro.fm, or from the public domain on LibriVox.
          Or keep the book in the Audible app: companion mode, coming in a later update, plays Mood Read&apos;s
          soundscape beside it.
        </Text>
        {more && (
          <View style={styles.more} testID="import-note-more">
            <Text style={styles.muted}>
              Audible locks its downloads with DRM, and no app but Audible&apos;s may play them. Mood Read opens only
              DRM-free files, so it cannot open this one, and it has no Audible sign-in.
            </Text>
            <Text style={styles.muted}>
              DRM-free audiobooks: Libro.fm sells them, and LibriVox and Project Gutenberg have free public-domain
              recordings. Download the M4B or MP3 and import that file.
            </Text>
          </View>
        )}
        <View style={styles.actions}>
          <Pressable testID="choose-another" role="button" style={styles.primary} onPress={onChooseAnother}>
            <Text style={styles.primaryText}>Choose another file</Text>
          </Pressable>
          <Pressable
            testID="learn-more"
            role="button"
            aria-expanded={more}
            style={styles.secondary}
            onPress={() => setMore(!more)}
          >
            <Text style={styles.secondaryText}>{more ? "Show less" : "Learn more"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.md },
  heading: { color: colors.text, fontSize: 20, fontWeight: "700" },
  text: { color: colors.text, fontSize: 16, lineHeight: 22 },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  link: { alignSelf: "flex-start", minHeight: spacing.xxl, justifyContent: "center" },
  linkText: { ...typography.label, color: colors.accent, textDecorationLine: "underline" },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  more: { gap: spacing.sm },
  tile: {
    width: 72,
    height: 88,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: { color: colors.textMuted, fontSize: 15, fontWeight: "700" },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  primary: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  secondary: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  busy: { opacity: 0.6 },
});
