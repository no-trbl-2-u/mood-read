// The audio engine: one narration player for the whole app, on a book-wide clock.
// Spec 01 Contracts: the narration owns the clock; the bed (01.3) subscribes to `clock` and follows it, and
// never drives the narration back. The bed's decisions are src/lib/bed.ts; its players are ./bed-engine.ts.
// The mixer (01.5) sets both layers' volumes from the book's Mix (src/lib/mix.ts), saved per book, and ducks the bed
// under the narrator's voice from a level measured on the device (./voice-level.ts); the audio goes nowhere.
// The book's Mix also carries its layer (01.7): a soundscape or off for the book, and any chapter's own; the bed
// plays the chapter's own, else the book's, and a pick crossfades to it while playing.
// Companion mode (01.14, A27): with the listener's setting on, the narration never loads; the clock comes from a
// silent companion clock over the book's chapters (src/lib/companion.ts) that the same bed follows, the session
// mixes with the other app, and nothing claims the lock screen or the Media Session. Turning it off reopens the
// book on the narration's own session, place and lock-screen controls.
// The bed enters and leaves (07.3, A3, A4): it ramps in from silence on play, a resume and a seek; it fades out over
// a sleep timer's last minute (src/lib/bed.ts sleepFade reads SleepTimer); with the book's quiet opening on it holds
// silent for each chapter's first 20 s; and at the book's end, or a companion-mode pause, it fades out over 4 s
// instead of stopping with the clock. The engine samples that envelope from here (bedEnvelope) while the bed plays.
// The bed follows scenes (07.2, A2): on every clock event the playing chapter's scene is planned from its stored
// score (src/lib/bed.ts planScene, sceneContextFor) and a move is handed to the engine, which logs it until 01.10
// plays pieces; a pick saved for the chapter re-plans at once, so its piece covers every scene.
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from "expo-audio";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

import {
  bedEnvelope,
  bedSoundFor,
  defaultBedFor,
  entersNow,
  IDLE_BED,
  NO_SCENE,
  pickLayer,
  planBed,
  planScene,
  sceneContextFor,
  setChapterOnly,
  sleepFade,
  type BedSetting,
  type BedState,
  type LayerPick,
  type SceneSpot,
} from "@/lib/bed";
import { createClock, type Clock, type ClockEvent, type ClockState } from "@/lib/clock";
import {
  bedExitMs,
  companionFinished,
  companionMove,
  companionPause,
  companionPlay,
  companionPosition,
  companionRate,
  rebase,
  runsOn,
  sessionFor,
  startCompanion,
  type CompanionClock,
} from "@/lib/companion";
import { createHandoff } from "@/lib/handoff";
import { createDucker, DEFAULT_MIX, mixLevels, normalizeMix, type Mix } from "@/lib/mix";
import { library, useBooks } from "@/lib/library";
import { scoringStore } from "@/lib/scoring";
import { settings, useSettings } from "@/lib/settings";
import { resolveFile } from "@/lib/media";
import {
  bookPosition,
  chapterAt,
  clamp,
  END_SLACK,
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

import { createBedEngine, type BedEngine } from "./bed-engine";
import { bindMediaSession } from "./media-session";
import { soundscape, SOUNDSCAPE_IDS } from "./soundscapes";
import { listenToVoice, stopVoice } from "./voice-level";

/**
 * The fastest speed this platform plays. expo-audio clamps the rate to 2.0 natively (Android
 * AudioPlayer.kt `rate.coerceIn(0.1f, 2.0f)`, iOS AudioModule.swift `min(rate, 2.0)`); the web goes to 3x.
 */
export const PLATFORM_MAX_SPEED = Platform.OS === "web" ? MAX_SPEED : 2;
const SAVE_EVERY_MS = 500;

/** The narration's volume, from the mix (a property set outside render, where the player is a plain object). */
function setVolume(player: AudioPlayer, volume: number) {
  player.volume = volume;
}

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
  /** The narration's clock, which the bed follows (01.3). */
  clock: Clock;
  /** What the bed plays: the open book's layer, and any chapter's own (01.7, A12); part of its mix. */
  bed: BedSetting;
  /** The open book's mixer setting (01.5, A10): balance, master and duck under voice. */
  mix: Mix;
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
  /** Changes the open book's mix and saves it for that book. */
  setMix: (patch: Partial<Mix>) => void;
  /** A layer chip: sets the playing chapter's own layer if it has one, else the book's; saved with the mix. */
  pickLayer: (pick: LayerPick) => void;
  /** "This chapter only": gives the playing chapter its own layer, or drops it to follow the book's. */
  setChapterOnly: (on: boolean) => void;
  /** The open book plays in companion mode (01.14): the bed only, beside another app, no narration. */
  companion: boolean;
  /** Companion mode's chapter timer: on, the bed moves on by the book's chapter lengths; off, it waits for a tap. */
  companionTimer: boolean;
  setCompanionTimer: (on: boolean) => void;
};

/** A file being loaded: where to land in it. Whether it plays once ready is the handoff's (src/lib/handoff.ts). */
type Target = { bookId: string; fileIndex: number; offset: number };

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
  const { companionMode, companionTimer } = useSettings();

  const [bookId, setBookId] = useState<string | null>(null);
  const [fileIndex, setFileIndex] = useState(0);
  const [target, setTarget] = useState<Target | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [speed, setSpeedState] = useState(1);
  const [sleep, setSleep] = useState<SleepTimer | null>(null);
  const [mix, setMixState] = useState<Mix>(DEFAULT_MIX);
  // The companion clock while the open book plays in companion mode, else null (src/lib/companion.ts).
  const [companion, setCompanion] = useState<CompanionClock | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Mirrors of state for callbacks and event handlers, which must not read stale renders.
  const bookRef = useRef<Book | undefined>(undefined);
  const fileRef = useRef(0);
  const targetRef = useRef<Target | null>(null);
  const speedRef = useRef(1);
  const sleepRef = useRef<SleepTimer | null>(null);
  const narrationLevel = useRef(mixLevels(DEFAULT_MIX).narration);
  const bedLevel = useRef(mixLevels(DEFAULT_MIX).bed);
  const engineRef = useRef<BedEngine | null>(null);
  const bedRef = useRef<BedSetting>(DEFAULT_MIX);
  // The open book's quiet opening (Mix.quietOpening), and when the bed last entered (07.3): read by its envelope.
  const quietRef = useRef(DEFAULT_MIX.quietOpening);
  const enteredAt = useRef<number | null>(null);
  // Re-plans the bed against the clock as it stands, after a layer pick (set by the bed's effect).
  const replanBed = useRef<() => void>(() => {});
  const ducker = useMemo(() => createDucker(), []);
  const lastSave = useRef(0);
  const pendingEvent = useRef<ClockEvent | null>(null);
  // The listener's play or pause while a file loads (A31), from the load's first moment, not once its URI is found.
  // It also keeps the clock saying "playing" across a natural end's handoff, so the bed crossfades into the next
  // chapter instead of stopping for it. `loadPlay` mirrors it for the screen: null when nothing loads.
  const [loadPlay, setLoadPlay] = useState<boolean | null>(null);
  const handoff = useMemo(() => createHandoff(setLoadPlay), []);
  const companionRef = useRef<CompanionClock | null>(null);
  const timerRef = useRef(companionTimer);
  const setTransport = useCallback((next: CompanionClock | null) => {
    companionRef.current = next;
    setCompanion(next);
    setNow(Date.now());
  }, []);

  const book = bookId ? books.find((b) => b.id === bookId) : undefined;
  const position = !book
    ? 0
    : companion
      ? companionPosition(companion, now, book, companionTimer)
      : bookPosition(book.files, fileIndex, target ? target.offset : status.currentTime);
  const chapter = book ? chapterAt(book.chapters, position) : undefined;
  const error = loadError ?? (companion ? null : status.error) ?? null;

  useEffect(() => {
    bookRef.current = book;
  }, [book]);
  useEffect(() => {
    sleepRef.current = sleep;
  }, [sleep]);
  useEffect(() => {
    timerRef.current = companionTimer;
  }, [companionTimer]);

  const livePosition = useCallback((): number => {
    const b = bookRef.current;
    if (!b) return 0;
    const c = companionRef.current;
    if (c) return companionPosition(c, Date.now(), b, timerRef.current);
    const t = targetRef.current;
    return bookPosition(b.files, fileRef.current, t ? t.offset : player.currentTime);
  }, [player]);

  // The narration's place. Companion mode never moves it: the narration resumes where it stopped once it is off.
  // While a file loads, the place is the one goTo saved: a pause then must not save the old file's time over it.
  const persist = useCallback(() => {
    const b = bookRef.current;
    if (b && !handoff.loading() && !companionRef.current) library.savePosition(b.id, livePosition());
    lastSave.current = Date.now();
  }, [livePosition, handoff]);

  // The audio session (src/lib/companion.ts): off, exclusive focus for the narration and its lock screen
  // (expo-audio: doNotMix for lock-screen controls); on, mixed with the other app, no focus asked, nothing ducked.
  useEffect(() => {
    setAudioModeAsync(sessionFor(companionMode).audioMode).catch(() => {});
  }, [companionMode]);

  // The companion clock ticks the screen while it runs.
  const companionRunning = !!companion?.playing;
  useEffect(() => {
    if (!companionRunning) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [companionRunning]);

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
      // Companion mode moves its silent clock; no narration loads and the narration's place stays.
      const c = companionRef.current;
      if (c) {
        setTransport(companionMove(c, Date.now(), bookSeconds, play, b));
        return;
      }
      const { fileIndex: fi, offset } = locate(b.files, bookSeconds);
      library.savePosition(b.id, bookSeconds);
      const sameFile =
        bookRef.current?.id === b.id && fileRef.current === fi && player.isLoaded && !handoff.loading();
      if (sameFile) {
        await player.seekTo(offset);
        if (play) player.play();
        else player.pause();
        return;
      }
      const t: Target = { bookId: b.id, fileIndex: fi, offset };
      setLoadError(null);
      try {
        await handoff.run(play, {
          resolve: () => resolveFile(b.files[fi].ref),
          swap: (uri) => {
            player.pause();
            bookRef.current = b;
            fileRef.current = fi;
            targetRef.current = t;
            setBookId(b.id);
            setFileIndex(fi);
            setTarget(t);
            player.replace({ uri, name: b.files[fi].name });
            bindRemote();
          },
          // Status events are not a reliable "loaded" signal: on web, replace() emits nothing, so the last status
          // (the previous file's) still says loaded. Ask the player directly.
          loaded: (stale) => waitUntilLoaded(() => player.isLoaded && player.duration > 0, stale),
          land: async () => {
            await player.seekTo(offset);
            player.setPlaybackRate(speedRef.current, "high");
            // A new file is a new element on the web, at full volume: the mix applies again.
            setVolume(player, narrationLevel.current);
            targetRef.current = null;
            setTarget(null);
          },
          play: () => player.play(),
        });
      } catch (e) {
        // The handoff throws only for the latest load; a stale one settles quietly.
        targetRef.current = null;
        setTarget(null);
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    },
    [player, bindRemote, setTransport, handoff],
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

  /** Stops what is playing: the companion clock, or the narration. */
  const halt = useCallback(() => {
    const c = companionRef.current;
    const b = bookRef.current;
    if (c) setTransport(b ? companionPause(c, Date.now(), b, timerRef.current) : { ...c, playing: false });
    else player.pause();
  }, [player, setTransport]);

  // Lock screen and media keys: the chapter title over the book title, with 30 s skips (layout: lock screen).
  const lockTitle = chapter?.title ?? book?.title ?? null;
  const lockArtist = book?.title;
  const lockAlbum = book?.author;
  const lockArt = book?.cover ?? undefined;
  // Companion mode claims no lock screen: the other app keeps its own (A27).
  const lockScreen = sessionFor(companionMode).lockScreen && !companion;
  useEffect(() => {
    if (!lockTitle || !lockScreen) return;
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
  }, [lockTitle, lockArtist, lockAlbum, lockArt, lockScreen, player, bindRemote]);

  // End of a file: on to the next one, unless the sleep timer says stop at this chapter's end.
  useEffect(() => {
    const b = bookRef.current;
    if (!status.didJustFinish || !b || targetRef.current || companionRef.current) return;
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
    if (!bookRef.current || targetRef.current || companionRef.current) return;
    if (!status.playing || Date.now() - lastSave.current >= SAVE_EVERY_MS) persist();
  }, [status.currentTime, status.playing, persist]);

  // Sleep timer: minutes on a wall clock, checked every second.
  useEffect(() => {
    if (sleep?.kind !== "minutes") return;
    const check = () => {
      if (sleepDue(sleepRef.current, Date.now(), 0)) {
        halt();
        persist();
        stopForSleep();
      }
    };
    const t = setInterval(check, 1000);
    return () => clearInterval(t);
  }, [sleep, halt, persist, stopForSleep]);

  // The chapter timer has run the book out: the companion clock stops there.
  useEffect(() => {
    const c = companionRef.current;
    const b = bookRef.current;
    if (!c || !b || !companionFinished(c, Date.now(), b, timerRef.current)) return;
    if (sleepRef.current) stopForSleep();
    else pendingEvent.current = "pause";
    halt();
  }, [position, halt, stopForSleep]);

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
    handoff.cancel();
    targetRef.current = null;
    halt();
    player.pause();
    player.clearLockScreenControls();
  }, [removed, player, halt, handoff]);

  // A book opens in the mode the listener's setting says; opening it again in the other mode switches over.
  const open = useCallback(
    async (id: string) => {
      const b = library.getBook(id);
      const toCompanion = settings.get().companionMode;
      const inCompanion = companionRef.current !== null;
      if (!b || (bookRef.current?.id === id && inCompanion === toCompanion)) return;
      if (bookRef.current) persist();
      if (toCompanion && !inCompanion) {
        // The narration stops and lets go of the lock screen and Media Session before the bed plays alone.
        handoff.cancel();
        targetRef.current = null;
        setTarget(null);
        player.pause();
        player.clearLockScreenControls();
      }
      sleepRef.current = null;
      setSleep(null);
      const rate = clamp(library.getSpeed(id), MIN_SPEED, PLATFORM_MAX_SPEED);
      speedRef.current = rate;
      setSpeedState(rate);
      // The book's own layer, else the listener's default soundscape setting (06.3).
      setMixState(library.getMix(id, defaultBedFor(settings.get().defaultSoundscapeId)));
      pendingEvent.current = "load";
      const start = resumeStart(library.getPosition(id), b.duration);
      if (toCompanion) {
        // The companion clock starts where the narration stopped, paused, and no narration file loads.
        setLoadError(null);
        bookRef.current = b;
        setBookId(b.id);
        setTransport(startCompanion(start, rate, Date.now()));
        return;
      }
      setTransport(null);
      await goTo(b, start, false);
    },
    [goTo, persist, player, setTransport, handoff],
  );

  // Companion mode turned on or off while a book is open: it reopens, paused, in the new mode.
  useEffect(() => {
    const id = bookRef.current?.id;
    if (id && (companionRef.current !== null) !== companionMode) void open(id);
  }, [companionMode, open]);

  // The listener's intent, never the web status flag: that reads "paused" whenever the element is short of data
  // (readyState), so the play button would flicker while audio buffers (A31). While a file loads, the handoff's
  // intent; otherwise the player's own flag, which only play, pause, an end or an error moves.
  const playing = companion ? companion.playing : (loadPlay ?? player.playing);

  // Publish the narration's clock on every change; the bed (01.3) follows it.
  const chapterIndex = chapter?.index ?? null;
  useEffect(() => {
    const event = pendingEvent.current ?? "tick";
    pendingEvent.current = null;
    // The listener's intent, not the status flag (as `playing` above), which would stutter the bed; and across a
    // file handoff the book is still playing.
    const c = companionRef.current;
    const intent = c ? c.playing : (handoff.wantsPlay() ?? player.playing);
    clock.publish({ bookId, position, playing: intent, rate: speed, chapterIndex }, event);
  }, [clock, player, handoff, bookId, position, playing, speed, chapterIndex]);

  // The bed follows the narration's clock: its sound for the chapter, play, pause, seek and crossfades (A8). It
  // only listens; nothing it does reaches the narration, and the narration's speed never reaches it (A9).
  useEffect(() => {
    const engine = createBedEngine((id) => soundscape(id)?.loop);
    engine.setLevel(bedLevel.current, ducker.gain());
    // The enter-exit gain, read live: the enter ramp, the quiet opening and its closing fade, the sleep fade.
    engine.setEnvelope(() => {
      const b = bookRef.current;
      if (!b || b.chapters.length === 0) return 1;
      const now = Date.now();
      const pos = livePosition();
      const c = chapterAt(b.chapters, pos);
      if (!c) return 1;
      const last = c.index === b.chapters[b.chapters.length - 1].index;
      return bedEnvelope({
        sinceEnterMs: enteredAt.current === null ? null : now - enteredAt.current,
        intoChapterMs: (pos - c.start) * 1000,
        chapterLeftMs: (Math.min(c.end, b.duration) - pos) * 1000,
        quietOpening: quietRef.current,
        runsOn: runsOn(companionRef.current !== null, timerRef.current, last),
        sleep: sleepFade(sleepRef.current, now, pos, b.chapters),
      });
    });
    engineRef.current = engine;
    let state: BedState = IDLE_BED;
    let scene: SceneSpot = NO_SCENE;
    let wasPlaying = false;
    const follow = (s: ClockState, event: ClockEvent) => {
      const b = bookRef.current?.id === s.bookId ? bookRef.current : undefined;
      const chapters = b?.chapters ?? [];
      // A play, a resume or a seek while playing: the bed ramps in from silence (A3).
      if (entersNow(wasPlaying, s, event)) enteredAt.current = Date.now();
      wasPlaying = s.playing;
      const atBookEnd = !!b && s.position >= b.duration - END_SLACK;
      const plan = planBed(state, s, event, {
        chapterStart: chapters.find((c) => c.index === s.chapterIndex)?.start ?? 0,
        soundFor: (i) => bedSoundFor(i, bedRef.current, SOUNDSCAPE_IDS),
        loopSeconds: (id) => soundscape(id)?.loopSeconds ?? 0,
        exitMs: bedExitMs(companionRef.current !== null, atBookEnd),
      });
      state = plan.state;
      plan.commands.forEach(engine.apply);
      // The playing chapter's scene (07.2): its stored score, while the chapter keeps the title it was scored under.
      const c = chapters.find((ch) => ch.index === s.chapterIndex);
      const score =
        b && c ? (scoringStore.chapters(b.id).find((x) => x.mood.chapterIndex === c.index && x.mood.chapterTitle === c.title) ?? null) : null;
      const next = planScene(scene, s, b && c ? sceneContextFor(score, { start: c.start, end: Math.min(c.end, b.duration) }) : null);
      scene = next.spot;
      if (next.command) engine.apply(next.command);
    };
    const off = clock.subscribe(follow);
    replanBed.current = () => follow(clock.current(), "tick");
    // A pick (or a new score) for the playing chapter changes its scenes' pieces: re-plan now.
    const offScores = scoringStore.subscribe(() => follow(clock.current(), "tick"));
    return () => {
      off();
      offScores();
      replanBed.current = () => {};
      engineRef.current = null;
      engine.dispose();
    };
  }, [clock, ducker, livePosition]);

  // A merge or split moves the chapters' own beds in the store with the chapters (A32); the open book's mix takes
  // them, so the bed follows and the next pick does not save the old ones back.
  useEffect(() => {
    if (!bookId) return;
    return library.subscribe(() => {
      const beds = library.getMix(bookId).chapterBeds;
      setMixState((prev) => (JSON.stringify(prev.chapterBeds) === JSON.stringify(beds) ? prev : { ...prev, chapterBeds: beds }));
    });
  }, [bookId]);

  // A layer pick (or the open book's mix) moves the bed now, crossfading if it is heard (A12).
  useEffect(() => {
    bedRef.current = mix;
    quietRef.current = mix.quietOpening;
    replanBed.current();
  }, [mix]);

  // The mix sets both layers: the narration's volume, and the bed's level under its crossfades (A10).
  useEffect(() => {
    const levels = mixLevels(mix);
    narrationLevel.current = levels.narration;
    bedLevel.current = levels.bed;
    setVolume(player, levels.narration);
    if (!mix.duck) ducker.reset();
    engineRef.current?.setLevel(levels.bed, ducker.gain());
  }, [mix, player, ducker]);

  // Duck under voice (A11): while the narration plays with duck on, its level is measured on the device and the bed
  // dips while the narrator speaks, coming back in the pauses. Sampling starts only once the listener plays (the
  // web's audio graph needs their gesture) and stops with duck off. A pause only stops listening.
  const duckListening = mix.duck && playing && !companion;
  useEffect(() => {
    if (!duckListening) return;
    return listenToVoice(player, (frames) => {
      const gain = ducker.hear(frames, Date.now(), true);
      engineRef.current?.setLevel(bedLevel.current, gain);
    });
  }, [duckListening, player, ducker]);
  useEffect(() => {
    if (!mix.duck) stopVoice(player);
  }, [mix.duck, player]);

  const api = useMemo<PlayerApi>(() => {
    const pause = () => {
      handoff.pause();
      pendingEvent.current = "pause";
      halt();
      persist();
    };
    const play = () => {
      const b = bookRef.current;
      if (!b) return;
      library.markPlayed(b.id);
      pendingEvent.current = "play";
      const c = companionRef.current;
      if (c) setTransport(companionPlay(c, Date.now(), b, timerRef.current));
      else if (handoff.play()) return;
      else if (livePosition() >= b.duration - 0.25) goTo(b, 0, true);
      else player.play();
    };
    const isPlaying = () => companionRef.current?.playing ?? handoff.wantsPlay() ?? player.playing;
    // Changes the open book's layer for the playing chapter and saves it with the mix.
    const updateBed = (change: (bed: BedSetting, chapterIndex: number | null) => BedSetting) => {
      const b = bookRef.current;
      if (!b) return;
      const index = chapterAt(b.chapters, livePosition())?.index ?? null;
      setMixState((prev) => {
        const next = normalizeMix({ ...prev, ...change(prev, index) });
        library.saveMix(b.id, next);
        return next;
      });
    };
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
      loading: loadPlay !== null,
      error,
      speed,
      sleep,
      clock,
      bed: mix,
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
        const c = companionRef.current;
        const b = bookRef.current;
        if (c && b) setTransport(companionRate(c, Date.now(), r, b, timerRef.current));
        else player.setPlaybackRate(r, "high");
        if (bookRef.current) library.saveSpeed(bookRef.current.id, r);
      },
      setSleepMinutes: (m) => setSleep({ kind: "minutes", minutes: m, endsAt: Date.now() + m * 60_000 }),
      setSleepEndOfChapter: () => {
        const b = bookRef.current;
        const c = b ? chapterAt(b.chapters, livePosition()) : undefined;
        if (c) setSleep({ kind: "chapterEnd", chapterIndex: c.index, end: c.end });
      },
      cancelSleep: () => setSleep(null),
      mix,
      setMix: (patch) => {
        const b = bookRef.current;
        setMixState((prev) => {
          const next = normalizeMix({ ...prev, ...patch });
          if (b) library.saveMix(b.id, next);
          return next;
        });
      },
      pickLayer: (pick) => updateBed((bed, i) => pickLayer(bed, i, pick)),
      setChapterOnly: (on) => updateBed((bed, i) => setChapterOnly(bed, i, on)),
      companion: !!companion,
      companionTimer,
      setCompanionTimer: (on) => {
        // Re-anchored under the old timer first, so a clock held at a chapter's end moves on from there.
        const c = companionRef.current;
        const b = bookRef.current;
        if (c && b) setTransport(rebase(c, Date.now(), b, timerRef.current));
        timerRef.current = on;
        settings.set({ companionTimer: on });
      },
    };
  }, [
    book,
    chapter,
    position,
    playing,
    loadPlay,
    error,
    speed,
    sleep,
    clock,
    mix,
    open,
    goTo,
    persist,
    player,
    livePosition,
    followSleep,
    halt,
    companion,
    companionTimer,
    setTransport,
    handoff,
  ]);

  useEffect(() => {
    remote.current = { play: api.play, pause: api.pause, skip: api.skip };
  }, [api]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
