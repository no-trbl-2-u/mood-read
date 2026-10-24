// A file handoff (spec 01, A31): the narration moving to another file of the book, from a seek, a chapter jump or a
// file's natural end. The listener's play or pause is held here from the moment the load starts, before its first
// await, so a pause pressed while the next file's URI is still being found (IndexedDB on the web) or while the file
// loads holds once it is ready. The player's steps are passed in; this module owns only the order and the intent.

export type HandoffSteps = {
  /** Finds the file's playable URI. */
  resolve: () => Promise<string>;
  /** Points the player at the file; called only while this load is the latest. */
  swap: (uri: string) => void;
  /** Settles once the file has loaded (or `stale()` turns true); rejects if it never loads. */
  loaded: (stale: () => boolean) => Promise<void>;
  /** Puts the loaded file at its offset, speed and volume. */
  land: () => Promise<void>;
  /** Plays the landed file. */
  play: () => void;
};

/** How a load ended: playing, held paused, or overtaken by a newer load (or cancelled). */
export type HandoffResult = "played" | "held" | "stale";

/** `onChange` hears the load's intent each time it changes: play or pause while loading, null once settled. */
export function createHandoff(onChange: (play: boolean | null) => void = () => {}) {
  let token = 0;
  let play: boolean | null = null;
  const set = (next: boolean | null) => {
    if (next === play) return;
    play = next;
    onChange(next);
  };

  return {
    /** True while a file loads. */
    loading: (): boolean => play !== null,
    /** Whether the loading file plays once ready; null when nothing loads. */
    wantsPlay: (): boolean | null => play,
    /** The listener's pause; true if a load took it (the player is still paused by the caller). */
    pause(): boolean {
      if (play === null) return false;
      set(false);
      return true;
    },
    /** The listener's play; true if a load took it, false if the player should play now. */
    play(): boolean {
      if (play === null) return false;
      set(true);
      return true;
    },
    /** Drops the load in flight: it never swaps, lands or plays. */
    cancel(): void {
      token++;
      set(null);
    },
    /** Loads a file and plays it once ready if the listener still wants it then. Throws only for the latest load. */
    async run(wantPlay: boolean, steps: HandoffSteps): Promise<HandoffResult> {
      const mine = ++token;
      const stale = () => mine !== token;
      set(wantPlay);
      try {
        const uri = await steps.resolve();
        if (stale()) return "stale";
        steps.swap(uri);
        await steps.loaded(stale);
        if (stale()) return "stale";
        await steps.land();
        if (stale()) return "stale";
        const go = play === true;
        set(null);
        if (go) steps.play();
        return go ? "played" : "held";
      } catch (e) {
        if (stale()) return "stale";
        set(null);
        throw e;
      }
    },
  };
}

export type Handoff = ReturnType<typeof createHandoff>;
