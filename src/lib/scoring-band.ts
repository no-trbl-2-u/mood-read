// What the scoring band's error state keeps on screen beside the error (A26). Pure, so the rule is tested where it
// is made: a failed or unreachable job never replaces the band's other controls (the scored line, "Set the mood"),
// and it can always be dismissed. The copy lives with the band (src/player/ScoringBand.tsx, agents.md rule 7).
export type ErrorBandView = {
  error: "failed" | "unreachable";
  /** "Not now": clears the stored error and returns the band to its normal start state. */
  dismiss: true;
  /** The "Scored: n of m chapters" line stays while the book has scores (a failed rescore). */
  scoredLine: boolean;
  /** "Set the mood" stays offered while the book is unscored and the listener can seed it. */
  setMood: boolean;
};

export function errorBand(error: ErrorBandView["error"], have: { scored: boolean; canSetMood: boolean }): ErrorBandView {
  return { error, dismiss: true, scoredLine: have.scored, setMood: have.canSetMood };
}
