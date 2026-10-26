// Sums the progress of several files into the one `Download` row's (bytes, totalBytes) (05.8; A25). Pure, so the
// rule is tested where it is made: bytes are reported the moment they arrive, and the total only once every
// file's size is known (files download one after another, and archive.org redirects can report no size at all),
// so an unknown total never hides the bytes.
export function createProgressSum(slots: number, report: (bytes: number, totalBytes: number | null) => void) {
  const bytes = new Array<number>(slots).fill(0);
  const totals = new Array<number | null>(slots).fill(null);
  const emit = () => {
    const total = totals.every((t) => t != null) ? totals.reduce<number>((s, t) => s + (t as number), 0) : null;
    report(
      bytes.reduce((s, b) => s + b, 0),
      total,
    );
  };
  return {
    /** The progress callback for slot `i`. */
    at: (i: number) => (b: number, t: number | null) => {
      bytes[i] = b;
      totals[i] = t;
      emit();
    },
    /** Reports the current sum again: work that moves no bytes (probing, lookups) is still the download alive. */
    tick: emit,
  };
}
