import { Image, StyleSheet, Text, View } from 'react-native';
import type { Book } from '@/lib/types';
import { colors } from './theme';

/** The book's cover, or a tile with its initials until 01.6 reads covers from tags. */
export function Cover({ book, size }: { book: Book; size: number }) {
  if (book.cover) {
    return <Image source={{ uri: book.cover }} style={{ width: size, height: size, borderRadius: size / 12 }} />;
  }
  const initials = book.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const hue = [...book.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size / 12, backgroundColor: `hsl(${hue}, 35%, 30%)` },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size / 3 }]}>{initials || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  initials: { color: colors.text, fontWeight: '700' },
});
