import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { addBookmark, deleteBookmark, renameBookmark, useBook, useBookmarks } from '@/lib/library';
import { chapterAt, clamp, formatTime, SKIP_SECONDS, SPEEDS } from '@/lib/timeline';
import type { Book } from '@/lib/types';
import { PLATFORM_MAX_SPEED, usePlayer } from '@/player/PlayerProvider';
import { Cover } from '@/ui/Cover';
import { colors, space } from '@/ui/theme';

const SLEEP_MINUTES = [5, 15, 30, 45, 60];

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const book = useBook(id);
  const p = usePlayer();
  const [tab, setTab] = useState<'chapters' | 'bookmarks'>('chapters');
  const { open } = p;

  useEffect(() => {
    if (id) open(id);
  }, [id, open]);

  if (!book) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>This book is not in your library.</Text>
      </View>
    );
  }

  const active = p.book?.id === book.id;
  const position = active ? p.position : 0;
  const chapter = active ? p.chapter : book.chapters[0];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: book.title }} />
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Cover book={book} size={200} />
        <Text style={styles.bookTitle} testID="book-title">{book.title}</Text>
        <Text style={styles.muted}>{book.author}</Text>
        <Text style={styles.chapterTitle} testID="chapter-title">{chapter?.title ?? ''}</Text>
      </View>

      <Scrubber
        start={chapter?.start ?? 0}
        end={chapter?.end ?? book.duration}
        position={position}
        onSeek={(s) => active && p.seek(s)}
      />
      <Text style={[styles.muted, { textAlign: 'center' }]} testID="book-left">
        {formatTime(Math.max(0, book.duration - position))} left in the book
      </Text>

      <View style={styles.controls}>
        <RoundButton testID="back-30" label={`↺ ${SKIP_SECONDS}`} onPress={() => p.skip(-SKIP_SECONDS)} />
        <Pressable testID="play-pause" style={styles.play} onPress={p.toggle} disabled={!active}>
          {p.loading && active ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={styles.playText}>{active && p.playing ? '❚❚' : '▶'}</Text>
          )}
        </Pressable>
        <RoundButton testID="fwd-30" label={`${SKIP_SECONDS} ↻`} onPress={() => p.skip(SKIP_SECONDS)} />
      </View>
      {p.error && active && <Text style={styles.error}>{p.error}</Text>}

      <Section title="Speed">
        <View style={styles.chips}>
          {SPEEDS.filter((s) => s <= PLATFORM_MAX_SPEED).map((s) => (
            <Chip key={s} testID={`speed-${s}`} label={`${s}×`} on={p.speed === s} onPress={() => p.setSpeed(s)} />
          ))}
        </View>
      </Section>

      <Section title="Sleep timer">
        <View style={styles.chips}>
          <Chip label="Off" on={!p.sleep} onPress={p.cancelSleep} />
          {SLEEP_MINUTES.map((m) => (
            <Chip
              key={m}
              testID={`sleep-${m}`}
              label={`${m} min`}
              on={p.sleep?.kind === 'minutes' && p.sleep.minutes === m}
              onPress={() => p.setSleepMinutes(m)}
            />
          ))}
          <Chip
            testID="sleep-chapter"
            label="End of chapter"
            on={p.sleep?.kind === 'chapterEnd'}
            onPress={p.setSleepEndOfChapter}
          />
        </View>
        {p.sleep?.kind === 'minutes' && <SleepCountdown endsAt={p.sleep.endsAt} />}
      </Section>

      <View style={styles.tabs}>
        <Chip label="Chapters" on={tab === 'chapters'} onPress={() => setTab('chapters')} />
        <Chip testID="tab-bookmarks" label="Bookmarks" on={tab === 'bookmarks'} onPress={() => setTab('bookmarks')} />
      </View>
      {tab === 'chapters' ? (
        <Chapters book={book} currentIndex={chapter?.index} onJump={(i) => active && p.jumpToChapter(i)} />
      ) : (
        <Bookmarks book={book} position={position} onJump={(s) => active && p.seek(s)} />
      )}
    </ScrollView>
  );
}

function Scrubber(props: { start: number; end: number; position: number; onSeek: (s: number) => void }) {
  const [width, setWidth] = useState(0);
  const len = Math.max(0.001, props.end - props.start);
  const pct = Math.min(1, Math.max(0, (props.position - props.start) / len));
  return (
    <View style={{ gap: space.xs }}>
      <Pressable
        testID="scrubber"
        style={styles.track}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          // Native gives locationX; react-native-web passes the DOM click, which has offsetX.
          const ne = e.nativeEvent as { locationX?: number; offsetX?: number };
          const x = Number.isFinite(ne.locationX) ? ne.locationX! : ne.offsetX ?? NaN;
          if (width > 0 && Number.isFinite(x)) props.onSeek(props.start + clamp(x / width, 0, 1) * len);
        }}
      >
        <View style={styles.trackBg} pointerEvents="none">
          <View style={[styles.trackFill, { width: `${pct * 100}%` }]} />
        </View>
      </Pressable>
      <View style={styles.times}>
        <Text style={styles.muted} testID="chapter-elapsed">{formatTime(props.position - props.start)}</Text>
        <Text style={styles.muted}>{formatTime(-(props.end - props.position))}</Text>
      </View>
    </View>
  );
}

function SleepCountdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <Text style={styles.muted}>Stops in {formatTime(Math.max(0, (endsAt - now) / 1000))}</Text>;
}

function Chapters(props: { book: Book; currentIndex: number | undefined; onJump: (i: number) => void }) {
  return (
    <View style={{ gap: 2 }}>
      {props.book.chapters.map((c) => (
        <Pressable
          key={c.index}
          testID={`chapter-${c.index}`}
          style={[styles.listRow, c.index === props.currentIndex && styles.listRowOn]}
          onPress={() => props.onJump(c.index)}
        >
          <Text style={[styles.listTitle, c.index === props.currentIndex && { color: colors.accent }]} numberOfLines={1}>
            {c.title}
          </Text>
          <Text style={styles.muted}>{formatTime(c.end - c.start)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Bookmarks(props: { book: Book; position: number; onJump: (s: number) => void }) {
  const marks = useBookmarks(props.book.id);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  function add() {
    const c = chapterAt(props.book.chapters, props.position);
    const name = `${c?.title ?? 'Bookmark'} · ${formatTime(props.position - (c?.start ?? 0))}`;
    const m = addBookmark(props.book.id, props.position, name);
    setEditing(m.id);
    setDraft(m.name);
  }

  function commit(markId: string) {
    const name = draft.trim();
    if (name) renameBookmark(props.book.id, markId, name);
    setEditing(null);
  }

  return (
    <View style={{ gap: 2 }}>
      <Pressable testID="add-bookmark" style={styles.addMark} onPress={add}>
        <Text style={{ color: colors.accent, fontWeight: '600' }}>+ Bookmark at {formatTime(props.position)}</Text>
      </Pressable>
      {marks.length === 0 && <Text style={styles.muted}>No bookmarks yet.</Text>}
      {marks.map((m) => (
        <View key={m.id} style={styles.listRow}>
          {editing === m.id ? (
            <TextInput
              testID="bookmark-name"
              style={[styles.listTitle, styles.input]}
              value={draft}
              onChangeText={setDraft}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={() => commit(m.id)}
              onBlur={() => commit(m.id)}
            />
          ) : (
            <Pressable testID={`bookmark-${m.id}`} style={{ flex: 1 }} onPress={() => props.onJump(m.position)}>
              <Text style={styles.listTitle} numberOfLines={1}>{m.name}</Text>
              <Text style={styles.muted}>{formatTime(m.position)}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              setEditing(m.id);
              setDraft(m.name);
            }}
            style={styles.iconBtn}
            accessibilityLabel="Rename bookmark"
          >
            <Text style={styles.muted}>✎</Text>
          </Pressable>
          <Pressable onPress={() => deleteBookmark(props.book.id, m.id)} style={styles.iconBtn} accessibilityLabel="Delete bookmark">
            <Text style={styles.muted}>✕</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip(props: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={props.testID} onPress={props.onPress} style={[styles.chip, props.on && styles.chipOn]}>
      <Text style={[styles.chipText, props.on && styles.chipTextOn]}>{props.label}</Text>
    </Pressable>
  );
}

function RoundButton(props: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={props.testID} onPress={props.onPress} style={styles.round}>
      <Text style={styles.roundText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  bookTitle: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  chapterTitle: { color: colors.accent, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  muted: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, textAlign: 'center' },
  track: { paddingVertical: space.sm },
  trackBg: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  trackFill: { height: 6, backgroundColor: colors.accent },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl },
  play: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { color: colors.accentText, fontSize: 28, fontWeight: '700' },
  round: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sectionTitle: { color: colors.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextOn: { color: colors.accentText, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: space.sm },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  listRowOn: { backgroundColor: colors.surfaceHi },
  listTitle: { flex: 1, color: colors.text, fontSize: 15 },
  input: { borderBottomWidth: 1, borderBottomColor: colors.accent, paddingVertical: 2 },
  iconBtn: { padding: space.sm },
  addMark: { padding: space.md },
});
