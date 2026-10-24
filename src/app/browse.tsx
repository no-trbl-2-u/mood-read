import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { browseRowCaption } from "@/lib/librivox-labels";
import { search, type LibriVoxSearchResult } from "@/lib/librivox-api";
import { EMOTION_NAMES } from "@/lib/mood-card";
import { fetchOverall, type Overall } from "@/lib/overall-api";
import { loadPopular, type PopularList } from "@/lib/popular-list";
import { SCORING_PROXY_URL } from "@/lib/scoring";
import type { EmotionScore } from "@/lib/types";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { ScoredChip } from "@/ui/ScoredChip";
import { Sticker } from "@/ui/Sticker";
import { colors, coverTint, radii, sizes, spacing, strokes, typography } from "@/ui/theme";
import { TopBar } from "@/ui/TopBar";

// Browse (spec 05, 05.8; design/layouts/DECISION.md "Browse"): search LibriVox by title, author or genre at
// once (src/lib/librivox-api.ts's search scopes one archive.org call to all three) and push a result's page.
// Before any search, Browse lists "Popular on LibriVox" (05.20, A22): the pre-scored books first, then archive.org's
// most-downloaded LibriVox books, each once (src/lib/popular-list.ts), loaded once per visit; a search replaces it and
// clearing the field brings it back. If the proxy is down the list shows unscored; if archive.org is down too (or
// answers nothing) the plain prompt stands in. A pre-scored
// book's row (05.10, A11) shows "Scored" and its top two overall emotions, the whole book's and never a chapter's,
// from one batched proxy read per page of results (src/lib/overall-api.ts: LibriVox numbers only, no run started);
// if that read fails every row simply reads as unscored. A row shows no cover thumbnail: fetching one would be a
// metadata call per row, and Browse makes at most one archive.org call per keystroke (debounced) plus one per
// opened book, never one per result.
const COPY = {
  title: "Browse",
  back: "Your shelf",
  backA11y: "Back to your shelf",
  placeholder: "Title, author or genre",
  fieldCaption: "Title, author or genre. Free public-domain recordings from LibriVox.",
  clear: "Clear search",
  prompt: "Search LibriVox for a free audiobook.",
  popular: "Popular on LibriVox",
  popularLoading: "Loading popular books…",
  searching: "Searching LibriVox…",
  noResults: (q: string) => `No LibriVox books match "${q}". Try a title, an author or a genre.`,
  errorTitle: "Browse needs a connection.",
  errorBody: "Your shelf still plays offline.",
  tryAgain: "Try again",
  scored: "Scored",
};

/** A row shows this many of a pre-scored book's overall emotions (the design's "top two"). */
const ROW_EMOTIONS = 2;

/** Typing fires at most one archive.org search per this long a pause (the brief's "~400ms", never per keystroke). */
const DEBOUNCE_MS = 400;

export default function BrowseScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibriVoxSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overall, setOverall] = useState<Overall>({});
  /** The default list: undefined while it loads, null when there is none to show (the prompt stands in). */
  const [popularList, setPopularList] = useState<PopularList | null | undefined>(undefined);
  const requestId = useRef(0);

  // The default list loads once per visit, whatever the field holds, so clearing a search shows it at once.
  useEffect(() => {
    let live = true;
    loadPopular(SCORING_PROXY_URL, (url, init) => fetch(url, init)).then(
      (list) => live && setPopularList(list.rows.length ? list : null),
      () => live && setPopularList(null),
    );
    return () => {
      live = false;
    };
  }, []);

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
        setOverall({});
        // One read for the whole page; a failure reads as nothing scored (fetchOverall never throws).
        fetchOverall(SCORING_PROXY_URL, (url, init) => fetch(url, init), found.map((r) => r.catalogId)).then((o) => {
          if (requestId.current === id) setOverall(o);
        });
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

        {error && trimmed ? (
          <View style={styles.centered} testID="browse-error">
            <Text style={styles.errorTitle} role="alert">
              {COPY.errorTitle}
            </Text>
            <Text style={styles.muted}>{COPY.errorBody}</Text>
            <Button testID="browse-retry" kind="secondary" label={COPY.tryAgain} onPress={() => runSearch(trimmed)} />
          </View>
        ) : !trimmed && popularList === undefined ? (
          <Text style={styles.muted} role="status" testID="browse-popular-loading">
            {COPY.popularLoading}
          </Text>
        ) : !trimmed && popularList ? (
          <FlatList
            testID="browse-popular"
            data={popularList.rows}
            keyExtractor={(r) => r.identifier}
            ListHeaderComponent={
              <Text style={styles.sectionTitle} role="heading" aria-level={2}>
                {COPY.popular}
              </Text>
            }
            renderItem={({ item }) => <ResultRow result={item} emotions={item.catalogId ? popularList.overall[item.catalogId] : undefined} />}
          />
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
            renderItem={({ item }) => <ResultRow result={item} emotions={item.catalogId ? overall[item.catalogId] : undefined} />}
          />
        )}
      </View>
    </View>
  );
}

function ResultRow({ result, emotions }: { result: LibriVoxSearchResult; emotions?: EmotionScore[] }) {
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
        {emotions && emotions.length > 0 && (
          <View style={styles.chips} testID={`browse-scored-${result.identifier}`}>
            <ScoredChip label={COPY.scored} />
            {emotions.slice(0, ROW_EMOTIONS).map((e, i) => (
              <Sticker key={e.emotion} emotion={e.emotion} label={EMOTION_NAMES[e.emotion]} intensity={e.intensity} index={i} />
            ))}
          </View>
        )}
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
  sectionTitle: { ...typography.label, fontSize: typography.body.fontSize, paddingTop: spacing.sm, paddingBottom: spacing.xxs },
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
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, paddingTop: spacing.xxs },
});
