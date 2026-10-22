// The audio engine: one narration player for the whole app, driven by a book-wide clock.
// Spec 01 Contracts: the narration owns the clock; the music bed (01.3) will follow it.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getBook, getPosition, getSpeed, savePosition, saveSpeed, setLastBookId, useBooks } from '@/lib/library';
import { resolveFile } from '@/lib/media';
import { bookPosition, chapterAt, clamp, locate, MAX_SPEED, MIN_SPEED, SKIP_SECONDS, sleepDue } from '@/lib/timeline';
import type { Book, Chapter, SleepTimer } from '@/lib/types';

/** expo-audio clamps Android to 2x (AudioPlayer.kt); iOS and web go to 3x. */
export const PLATFORM_MAX_SPEED = Platform.OS === 'android' ? 2 : MAX_SPEED;
const SAVE_EVERY_MS = 500;
const END_SLACK = 0.25;

type PlayerApi = {
  book: Book | undefined;
  chapter: Chapter | undefined;
  /** Seconds within the whole book. */
  position: number;
  playing: boolean;
  loading: boolean;
  error: string | null;
  speed: number;
  sleep: SleepTimer | null;
  open: (bookId: string, opts?: { autoplay?: boolean }) => Promise<void>;
  close: () => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (bookSeconds: number) => void;
  skip: (deltaSeconds: number) => void;
  jumpToChapter: (index: number) => void;
  setSpeed: (rate: number) => void;
  setSleepMinutes: (minutes: number) => void;
  setSleepEndOfChapter: () => void;
  cancelSleep: () => void;
};

/** A file being loaded: where to land in it and whether to play once it is ready. */
type Target = { bookId: string; fileIndex: number; offset: number; play: boolean };

function waitUntilLoaded(ready: () => boolean, cancelled: () => boolean, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (cancelled() || ready()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('The audio file did not load'));
      setTimeout(tick, 50);
    };
    tick();
  });
}

const Ctx = createContext<PlayerApi | null>(null);

export function usePlayer(): PlayerApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('usePlayer outside PlayerProvider');
  return api;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 250, keepAudioSessionActive: true });
  const status = useAudioPlayerStatus(player);
  const books = useBooks();

  const [bookId, setBookId] = useState<string | null>(null);
  const [fileIndex, setFileIndex] = useState(0);
  const [target, setTarget] = useState<Target | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [speed, setSpeedState] = useState(1);
  const [sleep, setSleep] = useState<SleepTimer | null>(null);

  // Mirrors of state for callbacks and event handlers, which must not read stale renders.
  const bookRef = useRef<Book | undefined>(undefined);
  const fileRef = useRef(0);
  const targetRef = useRef<Target | null>(null);
  const speedRef = useRef(1);
  const sleepRef = useRef<SleepTimer | null>(null);
  const lastSave = useRef(0);
  const loadToken = useRef(0);

  const book = bookId ? books.find((b) => b.id === bookId) : undefined;
  const position = book
    ? bookPosition(book.files, fileIndex, target ? target.offset : status.currentTime)
    : 0;
  const chapter = book ? chapterAt(book.chapters, position) : undefined;
  const error = loadError ?? status.error ?? null;

  useEffect(() => {
    bookRef.current = book;
  }, [book]);
  useEffect(() => {
    sleepRef.current = sleep;
  }, [sleep]);

  const livePosition = useCallback((): number => {
    const b = bookRef.current;
    if (!b) return 0;
    const t = targetRef.current;
    return bookPosition(b.files, fileRef.current, t ? t.offset : player.currentTime);
  }, [player]);

  const persist = useCallback(() => {
    const b = bookRef.current;
    if (b && !targetRef.current) savePosition(b.id, livePosition());
    lastSave.current = Date.now();
  }, [livePosition]);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch(() => {});
  }, []);

  /** Points the player at a book position, loading another file if needed. */
  const goTo = useCallback(
    async (b: Book, bookSeconds: number, play: boolean) => {
      const { fileIndex: fi, offset } = locate(b.files, bookSeconds);
      savePosition(b.id, bookSeconds);
      const sameFile =
        bookRef.current?.id === b.id && fileRef.current === fi && player.isLoaded && !targetRef.current;
      if (sameFile) {
        await player.seekTo(offset);
        if (play) player.play();
        else player.pause();
        return;
      }
      const token = ++loadToken.current;
      const t: Target = { bookId: b.id, fileIndex: fi, offset, play };
      setLoadError(null);
      try {
        const uri = await resolveFile(b.files[fi].ref);
        if (token !== loadToken.current) return;
        player.pause();
        bookRef.current = b;
        fileRef.current = fi;
        targetRef.current = t;
        setBookId(b.id);
        setFileIndex(fi);
        setTarget(t);
        player.replace({ uri, name: b.files[fi].name });
        // Status events are not a reliable "loaded" signal: on web, replace() emits nothing, so
        // the last status (the previous file's) still says loaded. Ask the player directly.
        await waitUntilLoaded(() => player.isLoaded && player.duration > 0, () => token !== loadToken.current);
        if (token !== loadToken.current) return;
        await player.seekTo(offset);
        player.setPlaybackRate(speedRef.current, 'high');
        // A pause during the load flips the live target's `play`.
        if (targetRef.current?.play) player.play();
        targetRef.current = null;
        setTarget(null);
      } catch (e) {
        if (token === loadToken.current) {
          targetRef.current = null;
          setTarget(null);
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      }
    },
    [player],
  );

  // Lock screen and media keys, refreshed when the book or chapter changes.
  const lockTitle = book ? (chapter ? `${chapter.title} · ${book.title}` : book.title) : null;
  const lockArtist = book?.author;
  const lockAlbum = book?.title;
  const lockArt = book?.cover ?? undefined;
  useEffect(() => {
    if (!lockTitle) return;
    player.setActiveForLockScreen(
      true,
      { title: lockTitle, artist: lockArtist, albumTitle: lockAlbum, artworkUrl: lockArt },
      {
        showSeekBackward: true,
        showSeekForward: true,
        seekBackwardIntervalSeconds: SKIP_SECONDS,
        seekForwardIntervalSeconds: SKIP_SECONDS,
      },
    );
  }, [lockTitle, lockArtist, lockAlbum, lockArt, player]);

  // End of a file: on to the next one, unless the sleep timer says stop at chapter end.
  useEffect(() => {
    const b = bookRef.current;
    if (!status.didJustFinish || !b || targetRef.current) return;
    const fi = fileRef.current;
    if (fi + 1 >= b.files.length) {
      savePosition(b.id, b.duration);
      sleepRef.current = null;
      setTimeout(() => setSleep(null), 0);
      return;
    }
    const nextStart = bookPosition(b.files, fi + 1, 0);
    const nextChapter = chapterAt(b.chapters, nextStart)?.index;
    const stop = sleepDue(sleepRef.current, Date.now(), nextChapter);
    if (stop) {
      sleepRef.current = null;
      setTimeout(() => setSleep(null), 0);
    }
    goTo(b, nextStart, !stop);
  }, [status.didJustFinish, goTo]);

  // Save position often while playing, and right away on pause.
  useEffect(() => {
    if (!bookRef.current || targetRef.current) return;
    if (!status.playing || Date.now() - lastSave.current >= SAVE_EVERY_MS) persist();
  }, [status.currentTime, status.playing, persist]);

  // Sleep timer: minutes are checked on a clock; chapter end on position.
  const chapterIndex = chapter?.index;
  useEffect(() => {
    if (!sleep) return;
    const check = () => {
      if (sleepDue(sleep, Date.now(), chapterIndex)) {
        player.pause();
        persist();
        setSleep(null);
      }
    };
    const first = setTimeout(check, 0);
    const t = setInterval(check, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [sleep, chapterIndex, player, persist]);

  // Save when the app goes to the background or the page closes.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') persist();
    });
    const onHide = () => persist();
    const g = globalThis as unknown as Partial<Window>;
    if (Platform.OS === 'web') {
      g.addEventListener?.('pagehide', onHide);
      g.addEventListener?.('beforeunload', onHide);
    }
    return () => {
      sub.remove();
      if (Platform.OS === 'web') {
        g.removeEventListener?.('pagehide', onHide);
        g.removeEventListener?.('beforeunload', onHide);
      }
    };
  }, [persist]);

  // If the open book is removed from the library, stop playing it.
  const removed = !!bookId && !book;
  useEffect(() => {
    if (!removed) return;
    loadToken.current++;
    targetRef.current = null;
    player.pause();
    player.clearLockScreenControls();
  }, [removed, player]);

  const open = useCallback(
    async (id: string, opts?: { autoplay?: boolean }) => {
      const b = getBook(id);
      if (!b) return;
      if (bookRef.current?.id === id) {
        if (opts?.autoplay) player.play();
        return;
      }
      if (bookRef.current) persist();
      setLastBookId(id);
      sleepRef.current = null;
      setSleep(null);
      const rate = clamp(getSpeed(id), MIN_SPEED, PLATFORM_MAX_SPEED);
      speedRef.current = rate;
      setSpeedState(rate);
      let start = getPosition(id);
      if (start >= b.duration - END_SLACK) start = 0; // a finished book starts over
      await goTo(b, start, !!opts?.autoplay);
    },
    [goTo, persist, player],
  );

  const playing = status.playing || !!target?.play;
  const api = useMemo<PlayerApi>(() => {
    const atEnd = (b: Book) => livePosition() >= b.duration - END_SLACK;
    const pause = () => {
      if (targetRef.current) targetRef.current = { ...targetRef.current, play: false };
      player.pause();
      persist();
    };
    const play = () => {
      const b = bookRef.current;
      if (!b) return;
      if (atEnd(b)) goTo(b, 0, true);
      else player.play();
    };
    return {
      book,
      chapter,
      position,
      playing,
      loading: !!target,
      error,
      speed,
      sleep,
      open,
      close: () => {
        pause();
        player.clearLockScreenControls();
      },
      play,
      pause,
      toggle: () => (player.playing ? pause() : play()),
      seek: (s) => {
        const b = bookRef.current;
        if (b && Number.isFinite(s)) goTo(b, clamp(s, 0, b.duration), player.playing);
      },
      skip: (d) => {
        const b = bookRef.current;
        if (b) goTo(b, clamp(livePosition() + d, 0, Math.max(0, b.duration - END_SLACK)), player.playing);
      },
      jumpToChapter: (i) => {
        const b = bookRef.current;
        const c = b?.chapters[i];
        if (b && c) goTo(b, c.start, true);
      },
      setSpeed: (rate) => {
        const r = clamp(rate, MIN_SPEED, PLATFORM_MAX_SPEED);
        speedRef.current = r;
        setSpeedState(r);
        player.setPlaybackRate(r, 'high');
        if (bookRef.current) saveSpeed(bookRef.current.id, r);
      },
      setSleepMinutes: (m) => setSleep({ kind: 'minutes', minutes: m, endsAt: Date.now() + m * 60_000 }),
      setSleepEndOfChapter: () => {
        const b = bookRef.current;
        const c = b ? chapterAt(b.chapters, livePosition()) : undefined;
        if (c) setSleep({ kind: 'chapterEnd', chapterIndex: c.index });
      },
      cancelSleep: () => setSleep(null),
    };
  }, [book, chapter, position, playing, target, error, speed, sleep, open, goTo, persist, player, livePosition]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
