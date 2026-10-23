// The audio engine: one narration player for the whole app, on a book-wide clock.
// Spec 01 Contracts: the narration owns the clock; the bed (01.3) subscribes to `clock` and follows it, and
// never drives the narration back.
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

import { createClock, type Clock, type ClockEvent } from "@/lib/clock";
import { library, useBooks } from "@/lib/library";
import { resolveFile } from "@/lib/media";
import {
  bookPosition,
  chapterAt,
  clamp,
  locate,
  MAX_SPEED,
  MIN_SPEED,
  resumeStart,
  SKIP_SECONDS,
  skipTarget,
  sleepAfterMove,
  sleepDue,
} from "@/lib/timeline";
import type { Book, Chapter, SleepTimer } from "@/lib/types";

import { bindMediaSession } from "./media-session";

/**
 * The fastest speed this platform plays. expo-audio clamps the rate to 2.0 natively (Android
 * AudioPlayer.kt `rate.coerceIn(0.1f, 2.0f)`, iOS AudioModule.swift `min(rate, 2.0)`); the web goes to 3x.
 */
export const PLATFORM_MAX_SPEED = Platform.OS === "web" ? MAX_SPEED : 2;
const SAVE_EVERY_MS = 500;

export type PlayerApi = {
  book: Book | undefined;
  chapter: Chapter | undefined;
  /** Seconds within the whole book. */
  position: number;
  playing: boolean;
  loading: boolean;
  error: string | null;
  speed: number;
  sleep: SleepTimer | null;
  /** The narration's clock, for a layer that follows it (01.3). */
  clock: Clock;
  open: (bookId: string) => Promise<void>;
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
      if (Date.now() - started > timeoutMs) return reject(new Error("The audio file did not load."));
      setTimeout(tick, 50);
    };
    tick();
  });
}

const Ctx = createContext<PlayerApi | null>(null);

export function usePlayer(): PlayerApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("usePlayer outside PlayerProvider");
  return api;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 250, keepAudioSessionActive: true });
  const status = useAudioPlayerStatus(player);
  const books = useBooks();
  const clock = useMemo(() => createClock(), []);

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
  const pendingEvent = useRef<ClockEvent | null>(null);

  const book = bookId ? books.find((b) => b.id === bookId) : undefined;
  const position = book ? bookPosition(book.files, fileIndex, target ? target.offset : status.currentTime) : 0;
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
    if (b && !targetRef.current) library.savePosition(b.id, livePosition());
    lastSave.current = Date.now();
  }, [livePosition]);

  useEffect(() => {
    // Background playback and the lock screen need exclusive focus (expo-audio: doNotMix for lock-screen controls).
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    }).catch(() => {});
  }, []);

  // The handlers the lock screen and media keys call; a ref, so a binding made once always reaches the latest.
  const remote = useRef({ play: () => {}, pause: () => {}, skip: (_d: number) => {} });
  const bindRemote = useCallback(() => {
    bindMediaSession({
      play: () => remote.current.play(),
      pause: () => remote.current.pause(),
      skip: (d) => remote.current.skip(d),
    });
  }, []);

  /** Points the player at a book position, loading another file if needed. */
  const goTo = useCallback(
    async (b: Book, bookSeconds: number, play: boolean) => {
      const { fileIndex: fi, offset } = locate(b.files, bookSeconds);
      library.savePosition(b.id, bookSeconds);
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
        bindRemote();
        // Status events are not a reliable "loaded" signal: on web, replace() emits nothing, so the last status
        // (the previous file's) still says loaded. Ask the player directly.
        await waitUntilLoaded(() => player.isLoaded && player.duration > 0, () => token !== loadToken.current);
        if (token !== loadToken.current) return;
        await player.seekTo(offset);
        player.setPlaybackRate(speedRef.current, "high");
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
    [player, bindRemote],
  );

  // A user's seek, skip or jump moves an End of chapter timer to the chapter it lands in.
  const followSleep = useCallback((b: Book, to: number) => {
    const next = sleepAfterMove(sleepRef.current, b.chapters, to);
    if (next === sleepRef.current) return;
    sleepRef.current = next;
    setSleep(next);
  }, []);

  const stopForSleep = useCallback(() => {
    sleepRef.current = null;
    setSleep(null);
    pendingEvent.current = "stop";
  }, []);

  // Lock screen and media keys: the chapter title over the book title, with 30 s skips (layout: lock screen).
  const lockTitle = chapter?.title ?? book?.title ?? null;
  const lockArtist = book?.title;
  const lockAlbum = book?.author;
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
    bindRemote();
  }, [lockTitle, lockArtist, lockAlbum, lockArt, player, bindRemote]);

  // End of a file: on to the next one, unless the sleep timer says stop at this chapter's end.
  useEffect(() => {
    const b = bookRef.current;
    if (!status.didJustFinish || !b || targetRef.current) return;
    const fi = fileRef.current;
    if (fi + 1 >= b.files.length) {
      library.savePosition(b.id, b.duration);
      if (sleepRef.current) stopForSleep();
      return;
    }
    const nextStart = bookPosition(b.files, fi + 1, 0);
    const stop = sleepDue(sleepRef.current, Date.now(), nextStart);
    if (stop) stopForSleep();
    goTo(b, nextStart, !stop);
  }, [status.didJustFinish, goTo, stopForSleep]);

  // Save the position often while playing, and right away on pause.
  useEffect(() => {
    if (!bookRef.current || targetRef.current) return;
    if (!status.playing || Date.now() - lastSave.current >= SAVE_EVERY_MS) persist();
  }, [status.currentTime, status.playing, persist]);

  // Sleep timer: minutes on a wall clock, checked every second.
  useEffect(() => {
    if (sleep?.kind !== "minutes") return;
    const check = () => {
      if (sleepDue(sleepRef.current, Date.now(), 0)) {
        player.pause();
        persist();
        stopForSleep();
      }
    };
    const t = setInterval(check, 1000);
    return () => clearInterval(t);
  }, [sleep, player, persist, stopForSleep]);

  // Sleep timer at chapter end, inside a file (chapters from markers, 01.6): stop and park at the chapter's end,
  // so the next listen starts the next chapter. A chapter that ends its file stops in the end-of-file effect.
  useEffect(() => {
    const b = bookRef.current;
    const t = sleepRef.current;
    if (!b || t?.kind !== "chapterEnd" || targetRef.current) return;
    if (sleepDue(t, Date.now(), position)) {
      stopForSleep();
      goTo(b, t.end, false);
    }
  }, [position, goTo, stopForSleep]);

  // Save when the app goes to the background or the page closes.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") persist();
    });
    const onHide = () => persist();
    const g = globalThis as unknown as Partial<Window>;
    if (Platform.OS === "web") {
      g.addEventListener?.("pagehide", onHide);
      g.addEventListener?.("beforeunload", onHide);
    }
    return () => {
      sub.remove();
      if (Platform.OS === "web") {
        g.removeEventListener?.("pagehide", onHide);
        g.removeEventListener?.("beforeunload", onHide);
      }
    };
  }, [persist]);

  // If the open book leaves the library, stop playing it.
  const removed = !!bookId && !book;
  useEffect(() => {
    if (!removed) return;
    loadToken.current++;
    targetRef.current = null;
    player.pause();
    player.clearLockScreenControls();
  }, [removed, player]);

  const open = useCallback(
    async (id: string) => {
      const b = library.getBook(id);
      if (!b || bookRef.current?.id === id) return;
      if (bookRef.current) persist();
      sleepRef.current = null;
      setSleep(null);
      const rate = clamp(library.getSpeed(id), MIN_SPEED, PLATFORM_MAX_SPEED);
      speedRef.current = rate;
      setSpeedState(rate);
      pendingEvent.current = "load";
      await goTo(b, resumeStart(library.getPosition(id), b.duration), false);
    },
    [goTo, persist],
  );

  const playing = status.playing || !!target?.play;

  // Publish the narration's clock on every change; the bed (01.3) follows it.
  const chapterIndex = chapter?.index ?? null;
  useEffect(() => {
    const event = pendingEvent.current ?? "tick";
    pendingEvent.current = null;
    clock.publish({ bookId, position, playing, rate: speed, chapterIndex }, event);
  }, [clock, bookId, position, playing, speed, chapterIndex]);

  const api = useMemo<PlayerApi>(() => {
    const pause = () => {
      if (targetRef.current) targetRef.current = { ...targetRef.current, play: false };
      pendingEvent.current = "pause";
      player.pause();
      persist();
    };
    const play = () => {
      const b = bookRef.current;
      if (!b) return;
      library.markPlayed(b.id);
      pendingEvent.current = "play";
      if (targetRef.current) targetRef.current = { ...targetRef.current, play: true };
      else if (livePosition() >= b.duration - 0.25) goTo(b, 0, true);
      else player.play();
    };
    const isPlaying = () => player.playing || !!targetRef.current?.play;
    const skip = (d: number) => {
      const b = bookRef.current;
      if (!b) return;
      pendingEvent.current = "seek";
      const to = skipTarget(livePosition(), d, b.duration);
      followSleep(b, to);
      goTo(b, to, isPlaying());
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
      clock,
      open,
      play,
      pause,
      toggle: () => (isPlaying() ? pause() : play()),
      seek: (s) => {
        const b = bookRef.current;
        if (!b || !Number.isFinite(s)) return;
        pendingEvent.current = "seek";
        const to = clamp(s, 0, b.duration);
        followSleep(b, to);
        goTo(b, to, isPlaying());
      },
      skip,
      jumpToChapter: (i) => {
        const b = bookRef.current;
        const c = b?.chapters[i];
        if (!b || !c) return;
        library.markPlayed(b.id);
        pendingEvent.current = "seek";
        followSleep(b, c.start);
        goTo(b, c.start, true);
      },
      setSpeed: (rate) => {
        const r = clamp(Math.round(rate * 10) / 10, MIN_SPEED, PLATFORM_MAX_SPEED);
        speedRef.current = r;
        setSpeedState(r);
        pendingEvent.current = "rate";
        player.setPlaybackRate(r, "high");
        if (bookRef.current) library.saveSpeed(bookRef.current.id, r);
      },
      setSleepMinutes: (m) => setSleep({ kind: "minutes", minutes: m, endsAt: Date.now() + m * 60_000 }),
      setSleepEndOfChapter: () => {
        const b = bookRef.current;
        const c = b ? chapterAt(b.chapters, livePosition()) : undefined;
        if (c) setSleep({ kind: "chapterEnd", chapterIndex: c.index, end: c.end });
      },
      cancelSleep: () => setSleep(null),
    };
  }, [book, chapter, position, playing, target, error, speed, sleep, clock, open, goTo, persist, player, livePosition, followSleep]);

  useEffect(() => {
    remote.current = { play: api.play, pause: api.pause, skip: api.skip };
  }, [api]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
