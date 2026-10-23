// The narration's clock (spec 01, Contracts: one audio engine, the narration owns the clock). The player
// publishes every change of position, play state, speed or chapter here; a second layer (the bed, 01.3)
// subscribes and follows. Nothing subscribed can drive the narration back: the clock only reports.

export type ClockEvent = "tick" | "play" | "pause" | "seek" | "rate" | "chapter" | "load" | "stop";

export type ClockState = {
  bookId: string | null;
  /** Seconds within the whole book. */
  position: number;
  playing: boolean;
  /** The narration's speed; the bed reads it only to ignore it (A9). */
  rate: number;
  chapterIndex: number | null;
};

export type ClockListener = (state: ClockState, event: ClockEvent) => void;

export const IDLE_CLOCK: ClockState = { bookId: null, position: 0, playing: false, rate: 1, chapterIndex: null };

export function createClock() {
  let state: ClockState = IDLE_CLOCK;
  const listeners = new Set<ClockListener>();

  return {
    /** The latest state, for a listener that joins late. */
    current: (): ClockState => state,
    subscribe(listener: ClockListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /**
     * Publishes a new state. A plain tick with nothing changed is dropped; a chapter change is reported
     * as "chapter" whatever the caller called it, so a follower can crossfade on it.
     */
    publish(next: ClockState, event: ClockEvent): void {
      const prev = state;
      const same =
        prev.bookId === next.bookId &&
        prev.position === next.position &&
        prev.playing === next.playing &&
        prev.rate === next.rate &&
        prev.chapterIndex === next.chapterIndex;
      if (same && event === "tick") return;
      const kind: ClockEvent =
        event === "tick" && prev.bookId === next.bookId && prev.chapterIndex !== next.chapterIndex ? "chapter" : event;
      state = next;
      listeners.forEach((l) => l(next, kind));
    },
  };
}

export type Clock = ReturnType<typeof createClock>;
