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
import { Button } from "@/ui/Button";
import { colors, sizes, spacing, strokes, typography } from "@/ui/theme";

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
              style={[styles.main, styles.jump]}
              onPress={() => props.onJump(m.position)}
            >
              <Text style={styles.where}>{chapterTimeLabel(book.chapters, m.position)}</Text>
              <Text style={styles.muted}>&ldquo;{m.name}&rdquo;</Text>
            </Pressable>
          )}
          {editing !== m.id && (
            <View style={styles.actions}>
              <Pressable
                role="button"
                testID="bookmark-rename"
                aria-label={`Rename “${m.name}”`}
                onPress={() => {
                  setEditing(m.id);
                  setDraft(m.name);
                }}
                style={styles.actionHit}
              >
                <Text style={styles.action}>Rename</Text>
              </Pressable>
              <Pressable
                role="button"
                testID="bookmark-delete"
                aria-label={`Delete “${m.name}”`}
                onPress={() => library.deleteBookmark(book.id, m.id)}
                style={styles.actionHit}
              >
                <Text style={styles.action}>Delete</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}
      <Button testID="add-bookmark" label={`Add bookmark at ${here}`} icon="plus" onPress={add} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: strokes.hairline,
    borderBottomColor: colors.border,
  },
  main: { flex: 1, gap: spacing.xxs },
  jump: { minHeight: sizes.touch, justifyContent: "center" },
  where: { ...typography.label, fontVariant: ["tabular-nums"] },
  muted: typography.caption,
  input: {
    ...typography.body,
    borderBottomWidth: strokes.outline,
    borderBottomColor: colors.accent,
    paddingVertical: spacing.xs,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  actionHit: {
    minHeight: sizes.touch,
    minWidth: sizes.touch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  action: { ...typography.label, color: colors.textMuted },
});
