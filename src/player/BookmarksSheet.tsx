// The Bookmarks bottom sheet: one row per bookmark ("Ch. N — mm:ss" over its quoted name), tap to jump, and at
// the bottom, in thumb reach, "+ Add bookmark at mm:ss". Adding opens an inline name field in the new row.
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { formatDuration } from "@/lib/format-duration";
import { chapterTimeLabel } from "@/lib/labels";
import { library, useBookmarks } from "@/lib/library";
import { chapterAt } from "@/lib/timeline";
import type { Book } from "@/lib/types";
import { Sheet } from "@/ui/Sheet";
import { colors, radii, spacing } from "@/ui/theme";

export function BookmarksSheet(props: {
  book: Book;
  position: number;
  onJump: (bookSeconds: number) => void;
  onClose: () => void;
}) {
  const { book, position } = props;
  const marks = useBookmarks(book.id);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const chapter = chapterAt(book.chapters, position);
  const here = formatDuration(position - (chapter?.start ?? 0));

  function add() {
    const name = chapter?.title ?? "Bookmark";
    const mark = library.addBookmark(book.id, position, name);
    setEditing(mark.id);
    setDraft(name);
  }

  function commit(markId: string) {
    library.renameBookmark(book.id, markId, draft);
    setEditing(null);
  }

  return (
    <Sheet title="Bookmarks" onClose={props.onClose} testID="bookmarks-sheet">
      {marks.length === 0 && <Text style={styles.muted}>No bookmarks yet.</Text>}
      {marks.map((m) => (
        <View key={m.id} style={styles.row} testID="bookmark-row">
          {editing === m.id ? (
            <View style={styles.main}>
              <Text style={styles.where}>{chapterTimeLabel(book.chapters, m.position)}</Text>
              <TextInput
                testID="bookmark-name"
                aria-label="Bookmark name"
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={() => commit(m.id)}
                onBlur={() => commit(m.id)}
              />
            </View>
          ) : (
            <Pressable
              testID="bookmark-jump"
              role="button"
              aria-label={`Jump to ${m.name}`}
              style={styles.main}
              onPress={() => props.onJump(m.position)}
            >
              <Text style={styles.where}>{chapterTimeLabel(book.chapters, m.position)}</Text>
              <Text style={styles.muted} numberOfLines={2}>
                &ldquo;{m.name}&rdquo;
              </Text>
            </Pressable>
          )}
          {editing !== m.id && (
            <View style={styles.actions}>
              <Pressable
                role="button"
                testID="bookmark-rename"
                onPress={() => {
                  setEditing(m.id);
                  setDraft(m.name);
                }}
                hitSlop={6}
              >
                <Text style={styles.action}>Rename</Text>
              </Pressable>
              <Pressable
                role="button"
                testID="bookmark-delete"
                onPress={() => library.deleteBookmark(book.id, m.id)}
                hitSlop={6}
              >
                <Text style={styles.action}>Delete</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}
      <Pressable testID="add-bookmark" role="button" style={styles.add} onPress={add}>
        <Text style={styles.addText}>+ Add bookmark at {here}</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  main: { flex: 1, gap: 2 },
  where: { color: colors.text, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
  muted: { color: colors.textMuted, fontSize: 13 },
  input: {
    color: colors.text,
    fontSize: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingVertical: spacing.xs,
  },
  actions: { flexDirection: "row", gap: spacing.md },
  action: { color: colors.textMuted, fontSize: 13 },
  add: {
    marginTop: spacing.sm,
    minHeight: 48,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  addText: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
});
