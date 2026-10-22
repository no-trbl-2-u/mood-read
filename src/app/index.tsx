import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getLastBookId, getPosition, importBookFromPicker, removeBook, useBooks } from '@/lib/library';
import { formatTime } from '@/lib/timeline';
import type { Book } from '@/lib/types';
import { usePlayer } from '@/player/PlayerProvider';
import { Cover } from '@/ui/Cover';
import { colors, space } from '@/ui/theme';

export default function Library() {
  const books = useBooks();
  const player = usePlayer();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const lastId = player.book?.id ?? getLastBookId();
  const last = books.find((b) => b.id === lastId);

  async function addBook() {
    setError(null);
    setImporting(true);
    try {
      const book = await importBookFromPicker();
      if (book) router.push(`/book/${book.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={books}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            {last && (
              <Pressable
                testID="continue"
                style={styles.continue}
                onPress={() => router.push(`/book/${last.id}`)}
              >
                <Cover book={last} size={56} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.kicker}>Continue listening</Text>
                  <Text style={styles.title} numberOfLines={1}>{last.title}</Text>
                </View>
                <Text style={styles.chev}>›</Text>
              </Pressable>
            )}
            <Pressable testID="add-book" style={styles.add} onPress={addBook} disabled={importing}>
              {importing ? (
                <ActivityIndicator color={colors.accentText} />
              ) : (
                <Text style={styles.addText}>+ Add a book from files</Text>
              )}
            </Pressable>
            <Text style={styles.hint}>
              Pick one audio file, or several that make one book (one chapter per file, in name order).
              DRM-free files only: M4B, M4A, MP3, WAV, FLAC, OGG.
            </Text>
            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>Your library is empty.</Text>}
        renderItem={({ item }) => (
          <BookRow
            book={item}
            confirming={confirming === item.id}
            onOpen={() => router.push(`/book/${item.id}`)}
            onAskRemove={() => setConfirming(confirming === item.id ? null : item.id)}
            onRemove={() => {
              setConfirming(null);
              removeBook(item.id);
            }}
          />
        )}
      />
    </View>
  );
}

function BookRow(props: {
  book: Book;
  confirming: boolean;
  onOpen: () => void;
  onAskRemove: () => void;
  onRemove: () => void;
}) {
  const { book } = props;
  const pos = getPosition(book.id);
  const pct = book.duration > 0 ? Math.min(1, pos / book.duration) : 0;
  return (
    <View style={styles.row}>
      <Pressable testID={`book-${book.id}`} style={styles.rowMain} onPress={props.onOpen}>
        <Cover book={book} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} numberOfLines={2}>{book.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{book.author}</Text>
          <Text style={styles.meta}>
            {book.chapters.length} {book.chapters.length === 1 ? 'chapter' : 'chapters'} ·{' '}
            {pct >= 0.999 ? 'Finished' : pos > 0 ? `${formatTime(book.duration - pos)} left` : formatTime(book.duration)}
          </Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
          </View>
        </View>
      </Pressable>
      {props.confirming ? (
        <Pressable onPress={props.onRemove} style={styles.removeConfirm}>
          <Text style={styles.removeConfirmText}>Remove</Text>
        </Pressable>
      ) : (
        <Pressable onPress={props.onAskRemove} style={styles.more} accessibilityLabel="Remove book">
          <Text style={styles.meta}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  continue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: 12,
    backgroundColor: colors.surfaceHi,
  },
  kicker: { color: colors.accent, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  chev: { color: colors.muted, fontSize: 28 },
  add: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  addText: { color: colors.accentText, fontWeight: '700', fontSize: 16 },
  hint: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger },
  empty: { color: colors.muted, textAlign: 'center', marginTop: space.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingRight: space.sm,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13 },
  bar: { height: 3, backgroundColor: colors.border, borderRadius: 2, marginTop: space.xs },
  barFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
  more: { padding: space.md },
  removeConfirm: { padding: space.sm, backgroundColor: colors.danger, borderRadius: 8 },
  removeConfirmText: { color: colors.text, fontWeight: '600' },
});
