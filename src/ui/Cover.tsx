import { Image, StyleSheet, Text, View } from "react-native";

import { useFileUri } from "@/lib/library";
import type { Book } from "@/lib/types";

import { PlayGlyph } from "./glyphs";
import { colors, radii } from "./theme";

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
        <View style={[styles.tile, box, { backgroundColor: `hsl(${hue}, 30%, 28%)` }]}>
          <Text style={[styles.initials, { fontSize: Math.min(width, height) / 3 }]}>{initials || "?"}</Text>
        </View>
      )}
      {marked && (
        <View style={styles.mark} testID="cover-play-mark">
          <PlayGlyph size={8} color={colors.onAccent} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  initials: { color: colors.text, fontWeight: "700" },
  mark: {
    position: "absolute",
    left: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
  },
});
