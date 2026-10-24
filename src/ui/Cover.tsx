import { Image, StyleSheet, Text, View } from "react-native";

import { useFileUri } from "@/lib/library";
import type { Book } from "@/lib/types";

import { Icon } from "./Icon";
import { colors, coverTint, radii, sizes, spacing, strokes, typography } from "./theme";

/**
 * The book's cover from its tags (01.6), or a tile with its initials when it has none. `marked` draws the play mark
 * the library puts on the book in progress.
 */
export function Cover({
  book,
  width,
  height = width,
  marked = false,
}: {
  book: Pick<Book, "id" | "title" | "cover">;
  width: number;
  height?: number;
  marked?: boolean;
}) {
  const box = { width, height, borderRadius: radii.sm };
  const uri = useFileUri(book.cover);
  const initials = book.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const hue = [...book.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return (
    <View style={box}>
      {uri ? (
        <Image testID="cover-image" source={{ uri }} style={box} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.tile, box, { backgroundColor: coverTint(hue) }]}>
          <Text style={styles.initials}>{initials || "?"}</Text>
        </View>
      )}
      {marked && (
        <View style={styles.mark} testID="cover-play-mark">
          <Icon name="play" size="mark" color={colors.onAccent} filled />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center", borderWidth: strokes.outline, borderColor: colors.ink },
  initials: typography.label,
  mark: {
    position: "absolute",
    left: spacing.xs,
    top: spacing.xs,
    width: sizes.coverMark,
    height: sizes.coverMark,
    borderRadius: radii.pill,
    borderWidth: strokes.outline,
    borderColor: colors.ink,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
