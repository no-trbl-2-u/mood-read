import { router } from "expo-router";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "@/ui/theme";
import { TopBar } from "@/ui/TopBar";

// The privacy policy (spec 06, 06.6, A6): `/privacy` on the web build and a screen in the app. It is what the
// stores' data-safety forms are filled from, so every line here must stay true of the code (agents.md rule 6).
// Headings may play (design/system/DECISION.md, Voice); the statements stay plain. All its copy lives here.

const EFFECTIVE = "23 October 2026";
const ISSUES_URL = "https://github.com/no-trbl-2-u/mood-read/issues";

type Section = { heading: string; lines: string[] };

const SECTIONS: Section[] = [
  {
    heading: "The short version",
    lines: [
      "Mood Read has no account, no sign-in, no ads, no analytics and no tracking. It contains no advertising, analytics or crash-reporting code.",
      "Your audiobooks and everything about how you listen stay on your device.",
      "Mood Read decrypts nothing. It opens only DRM-free files and never opens Audible's AAX or AAXC files.",
    ],
  },
  {
    heading: "Your books stay home",
    lines: [
      "When you import a book, Mood Read copies its audio files onto your device: into the app's own storage on a phone, and into your browser's storage on the web.",
      "The book's details (title, author, narrator, cover and chapters), your listening position, your bookmarks, your playback speed and your settings are stored on your device too.",
      "None of this is sent anywhere, except a book's title, author and chapter titles when you ask Mood Read to score that book (below). Your audio never leaves your device and is never transcribed. Uninstalling the app, or clearing your browser's data for the site, removes it.",
      "A scored book's chapter moods and named pieces are kept on your device in the same way, and features still to come, such as picks, will be too.",
    ],
  },
  {
    heading: "What the scoring proxy gets",
    lines: [
      "Mood Read scores a book only when you ask it to. Its scoring proxy then receives that book's title, author and chapter titles, nothing more.",
      "The proxy uses those details to search the web for what is written about the book, such as chapter summaries and reviews, and to name each chapter's mood and a piece of music to match. To do that it passes the title, author and chapter titles on to Brave Search and OpenAI.",
      "It never receives your audio, your files, your listening position, your bookmarks or anything that identifies you. Cloudflare, which runs the proxy, handles the connection your device makes to it, as any web host does; the proxy keeps no log of those requests.",
      "A scored book's moods and pieces are kept by the proxy and shared with anyone who scores the same book, so each book is researched once. They hold the book's details and what was found about it, nothing about who asked.",
    ],
  },
  {
    heading: "What we keep: nothing about you",
    lines: [
      "Mood Read keeps no listener data. There is no account to keep it in, and the scoring proxy keeps no record of who asked about which book and no log of the requests it gets.",
    ],
  },
  {
    heading: "Spotify",
    lines: [
      "Mood Read does not connect to Spotify today, and shares nothing with it.",
      "If a Spotify connection arrives, this section will say exactly what it shares before you can connect an account.",
    ],
  },
  {
    heading: "The web version",
    lines: [
      "The web version of Mood Read is served by Cloudflare Pages. Like any website host, Cloudflare handles the requests your browser makes to load the page. Mood Read adds no analytics or tracking to it.",
    ],
  },
  {
    heading: "Changes and questions",
    lines: [
      "If this policy changes, this page changes with it and shows the new effective date.",
      "Questions about privacy go to Mood Read's issue tracker on GitHub:",
    ],
  },
];

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

export default function PrivacyScreen() {
  return (
    <View style={styles.screen}>
      <TopBar title="Privacy policy" back={{ label: "Back", onPress: goBack }} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.caption}>Effective {EFFECTIVE}</Text>
        {SECTIONS.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading} role="heading" aria-level={2}>
              {section.heading}
            </Text>
            {section.lines.map((line) => (
              <Text key={line} style={styles.text}>
                {line}
              </Text>
            ))}
          </View>
        ))}
        <Text
          testID="privacy-contact"
          role="link"
          style={styles.link}
          onPress={() => Linking.openURL(ISSUES_URL)}
        >
          {ISSUES_URL}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  heading: typography.heading,
  text: typography.body,
  caption: typography.caption,
  link: { ...typography.body, color: colors.accent, textDecorationLine: "underline" },
});
