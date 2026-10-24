import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { browseRowCaption } from "@/lib/librivox-labels";
import { search, type LibriVoxSearchResult } from "@/lib/librivox-api";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { colors, coverTint, radii, sizes, spacing, strokes, typography } from "@/ui/theme";
import { TopBar } from "@/ui/TopBar";

// Browse (spec 05, 05.8; design/layouts/DECISION.md "Browse"): search LibriVox by title, author or genre at
// once (src/lib/librivox-api.ts's search scopes one archive.org call to all three) and push a result's page.
// Before any search, the design's default is a "Popular on LibriVox" list, which needs 05.10's pre-scoring cache
// (not built); this screen shows a plain prompt instead (a decision recorded in this chunk's commit). A row's
// "Scored" chip and "On your shelf" check (05.10, needs scoring) are out of scope too: every row reads as
// unscored. A row shows no cover thumbnail: fetching one would be a metadata call per row, and Browse makes at
// most one archive.org call per keystroke (debounced) plus one per opened book, never one per result.
const COPY = {
  title: "Browse",
  back: "Your shelf",
  backA11y: "Back to your shelf",
  placeholder: "Title, author or genre",
  fieldCaption: "Title, author or genre. Free public-domain recordings from LibriVox.",
  clear: "Clear search",
  prompt: "Search LibriVox for a free audiobook.",
  searching: "Searching LibriVox…",
  noResults: (q: string) => `No LibriVox books match "${q}". Try a title, an author or a genre.`,
  errorTitle: "Browse needs a connection.",
  errorBody: "Your shelf still plays offline.",
  tryAgain: "Try again",
};

/** Typing fires at most one archive.org search per this long a pause (the brief's "~400ms", never per keystroke). */
const DEBOUNCE_MS = 400;

export default function BrowseScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibriVoxSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const runSearch = (q: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setResults(null);
    search((url, init) => fetch(url, init), q).then(
      (found) => {
        if (requestId.current !== id) return;
        setResults(found);
        setLoading(false);
      },
      (e) => {
        if (requestId.current !== id) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
    );
  };

  // Typing fires at most one search, after a quiet pause; an empty field needs no request at all, so the render
  // below reads the prompt state straight off `trimmed` rather than this effect resetting state for it.
  useEffect(() => {
    const trimmed = query.trim();
    requestId.current++; // any in-flight request for the old query no longer matters
    if (!trimmed) return;
    const timer = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const trimmed = query.trim();

  return (
    <View style={styles.screen}>
      <TopBar title={COPY.title} back={{ label: COPY.back, a11yLabel: COPY.backA11y, onPress: goBack }} />
      <View style={styles.body}>
        <View style={styles.field}>
          <Icon name="search" size="small" color={colors.textMuted} />
          <TextInput
            testID="browse-query"
            aria-label={COPY.placeholder}
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder={COPY.placeholder}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable testID="browse-clear" role="button" aria-label={COPY.clear} onPress={() => setQuery("")} style={styles.clear}>
              <Icon name="x" size="small" color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Text style={styles.fieldCaption}>{COPY.fieldCaption}</Text>

        {error ? (
          <View style={styles.centered} testID="browse-error">
            <Text style={styles.errorTitle} role="alert">
              {COPY.errorTitle}
            </Text>
            <Text style={styles.muted}>{COPY.errorBody}</Text>
            <Button testID="browse-retry" kind="secondary" label={COPY.tryAgain} onPress={() => runSearch(trimmed)} />
          </View>
        ) : !trimmed ? (
          <View style={styles.centered} testID="browse-prompt">
            <Text style={styles.muted}>{COPY.prompt}</Text>
          </View>
        ) : loading && !results ? (
          <Text style={styles.muted} role="status" testID="browse-loading">
            {COPY.searching}
          </Text>
        ) : results && results.length === 0 ? (
          <Text style={styles.muted} testID="browse-empty">
            {COPY.noResults(trimmed)}
          </Text>
        ) : (
          <FlatList
            data={results ?? []}
            keyExtractor={(r) => r.identifier}
            renderItem={({ item }) => <ResultRow result={item} />}
          />
        )}
      </View>
    </View>
  );
}

function ResultRow({ result }: { result: LibriVoxSearchResult }) {
  const hue = [...result.identifier].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  const initials = result.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <Pressable
      testID={`browse-result-${result.identifier}`}
      role="link"
      style={styles.row}
      onPress={() => router.push(`/browse/${result.identifier}`)}
    >
      <View style={[styles.tile, { backgroundColor: coverTint(hue) }]}>
        <Text style={styles.tileText}>{initials || "?"}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{result.title}</Text>
        <Text style={styles.rowCaption}>{browseRowCaption(result.creator, result.runtime)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, padding: spacing.md, gap: spacing.sm },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: sizes.touch,
    paddingHorizontal: spacing.md,
    borderWidth: strokes.outline,
    borderColor: colors.edge,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, minHeight: sizes.touch, ...typography.body, paddingVertical: spacing.sm },
  clear: { minWidth: sizes.touch, minHeight: sizes.touch, alignItems: "center", justifyContent: "center", marginRight: -spacing.sm },
  fieldCaption: typography.caption,
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingTop: spacing.xl },
  muted: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  errorTitle: { ...typography.body, color: colors.danger, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: strokes.hairline,
    borderBottomColor: colors.border,
  },
  tile: {
    width: sizes.coverWidth,
    height: sizes.coverHeight,
    borderRadius: radii.sm,
    borderWidth: strokes.outline,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: typography.label,
  rowText: { flex: 1, gap: spacing.xxs },
  rowTitle: { ...typography.body, fontWeight: typography.label.fontWeight },
  rowCaption: typography.caption,
});
