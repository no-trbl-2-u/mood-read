// The accessibility bar (06.5, spec 06 A5) on the web build, on every route and the key states: the empty shelf,
// its overflow menu, Import, Settings (with the default soundscape open), the privacy policy, Downloads (05.6,
// empty on the web build), the licenses, a book that is not on the device, and a real book's river with the
// playing row expanded (the mixer inline), its Speed & Sleep sheet and its Bookmarks sheet, and a scored book
// (01.4): the playing row's mood card (emotion stickers, the named piece, alternates and the pick chips), a
// reached row's stickers and a locked row. On each one:
//   - axe (WCAG 2.0, 2.1 and 2.2, A and AA) finds no serious or critical issue;
//   - every control (button, link, switch, checkbox, slider, tab, menu item, and any other focusable element, which
//     is what a Pressable is on the web) is at least 44 x 44 CSS px (A5, `sizes.touch`; WCAG 2.5.5);
//   - with text at 200%, no text is clipped.
// Then: a keyboard focus shows the theme's focus ring, and reduce motion stops the press from scaling.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { toneAndSilence, wavFile } from "../src/lib/meta/test-fixtures";
import { sizes } from "../src/ui/theme";

import { guard } from "./guard";
import { scoredBook } from "./scored-book";

/** The smallest touch target, in CSS px: 44, the size A5 holds (WCAG 2.5.5; 2.5.8's AA floor is 24). */
const TOUCH = sizes.touch;
/** The OS text size the app must take without clipping: 200% (A5). */
const TEXT_SCALE = 2;
/** The WCAG tags axe checks. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Controls exempt from the 44 px check, by test id. WCAG 2.5.5 and 2.5.8 exempt only a link inline in a sentence, whose
 * size the line of text sets. None today: every link stands on its own line and is 44 px tall.
 */
const INLINE_LINKS: string[] = [];

const CONTROLS = [
  "[role=button]",
  "[role=link]",
  "[role=switch]",
  "[role=checkbox]",
  "[role=slider]",
  "[role=tab]",
  "[role=menuitem]",
  "a[href]",
  "button",
  "input",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/** A two-chapter book from two WAV files, imported through the Import screen; lands on its river. */
async function importBook(page: Page) {
  const tone = (seconds: number, title: string) =>
    Buffer.from(wavFile(toneAndSilence([[seconds, true]]), 8000, { INAM: title, IART: "A. Reader" }));
  await page.goto("/");
  await page.getByTestId("import-book").click();
  await expect(page).toHaveURL(/\/import$/);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("import-files").click();
  await (
    await chooser
  ).setFiles([
    { name: "Access Book - 01.wav", mimeType: "audio/wav", buffer: tone(20, "Access Book") },
    { name: "Access Book - 02.wav", mimeType: "audio/wav", buffer: tone(20, "Access Book") },
  ]);
  await expect(page).toHaveURL(/\/book\/[a-z0-9]+$/);
  await expect(page.getByTestId("chapter-row-0").getByTestId("chapter-expanded")).toBeVisible();
  await expect(page.getByTestId("mini-play-pause").locator("[role=progressbar]")).toHaveCount(0);
}

type State = { name: string; open: (page: Page) => Promise<void> };

const STATES: State[] = [
  {
    name: "the empty shelf (/)",
    open: async (page) => {
      await page.goto("/");
      await expect(page.getByText("Import a book", { exact: true })).toBeVisible();
    },
  },
  {
    name: "the shelf's overflow menu open",
    open: async (page) => {
      await page.goto("/");
      await page.getByRole("button", { name: "More" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
    },
  },
  {
    name: "/import",
    open: async (page) => {
      await page.goto("/import");
      await expect(page.getByText("Choose files", { exact: true })).toBeVisible();
    },
  },
  {
    name: "/settings with the default soundscape open",
    open: async (page) => {
      await page.goto("/settings");
      await page.getByTestId("setting-soundscape").click();
      await expect(page.getByTestId("soundscape-off")).toBeVisible();
    },
  },
  {
    name: "/privacy",
    open: async (page) => {
      await page.goto("/privacy");
      await expect(page.getByText("What the scoring proxy gets", { exact: true })).toBeVisible();
    },
  },
  {
    name: "/downloads (05.6, empty on the web build)",
    open: async (page) => {
      await page.goto("/downloads");
      await expect(page.getByTestId("downloads-empty")).toBeVisible();
    },
  },
  {
    name: "/licenses",
    open: async (page) => {
      await page.goto("/licenses");
      await expect(page.getByText("Lucide icons", { exact: true }).first()).toBeVisible();
    },
  },
  {
    name: "a book not on this device (/book/<missing>)",
    open: async (page) => {
      await page.goto("/book/not-here");
      await expect(page.getByText("Book not found", { exact: true })).toBeVisible();
    },
  },
  {
    name: "/book/<id>: the river, the playing row expanded with the mixer",
    open: async (page) => {
      await importBook(page);
      await expect(page.getByTestId("chapter-row-0").getByTestId("mixer")).toBeVisible();
    },
  },
  {
    name: "/book/<id>: the Speed & Sleep sheet",
    open: async (page) => {
      await importBook(page);
      await page.getByTestId("open-speed-sleep").click();
      await expect(page.getByTestId("speed-sleep-sheet")).toBeVisible();
    },
  },
  {
    name: "/book/<id>: the Bookmarks sheet, with a bookmark",
    open: async (page) => {
      await importBook(page);
      await page.getByTestId("open-bookmarks").click();
      await page.getByTestId("add-bookmark").click();
      await page.getByTestId("bookmark-name").press("Enter");
      await expect(page.getByTestId("bookmark-jump")).toBeVisible();
    },
  },
  {
    name: "the shelf with a book on it",
    open: async (page) => {
      await importBook(page);
      await page.getByTestId("top-back").click();
      await expect(page.getByRole("link", { name: "Access Book" })).toBeVisible();
    },
  },
  {
    name: "/book/<id> scored: the mood card, a reached row's stickers and a locked row",
    open: async (page) => {
      await scoredBook(page);
      // Reach chapter 2, then go back: chapter 1 plays with its mood card, chapter 2 shows its stickers, 3 is locked.
      await page.getByTestId("chapter-1").click();
      await expect(page.getByTestId("chapter-row-1").getByTestId("mood-card")).toBeVisible();
      await page.getByTestId("chapter-0").click();
      const row0 = page.getByTestId("chapter-row-0");
      await expect(row0.getByTestId("mood-pick")).toBeVisible();
      await expect(row0.getByTestId("mood-alternates")).toBeVisible();
      await expect(page.getByTestId("row-emotions-1")).toBeVisible();
      await expect(page.getByTestId("locked-2")).toBeVisible();
      const play = page.getByTestId("mini-play-pause");
      if ((await play.getAttribute("aria-label")) === "Pause") await play.click();
      await expect(play).toHaveAttribute("aria-label", "Play");
    },
  },
];

/** axe's serious and critical violations, each as "id [impact]: help at target: html summary". */
async function axeProblems(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) => v.nodes.map((n) => `${v.id} [${v.impact}]: ${v.help} at ${n.target.join(" ")}: ${n.html.slice(0, 160)} ${n.failureSummary?.replace(/\s+/g, " ").slice(0, 200)}`));
}

/** Every visible control under 44 x 44 CSS px, but the inline links. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ selector, min, exempt }) => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        if (el.closest("[aria-hidden=true]")) continue;
        // A modal's focus-trap sentinels: focusable, zero height, no role a person meets.
        if (/^(presentation|none)$/.test(el.getAttribute("role") ?? "")) continue;
        const id = el.getAttribute("data-testid") ?? "";
        if (exempt.includes(id)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        // A scroll container is focusable for the keyboard, and is not a touch target.
        if (/(auto|scroll)/.test(style.overflowX + style.overflowY) && el.scrollHeight + el.scrollWidth > 0) {
          if (!el.getAttribute("role")) continue;
        }
        if (r.width < min - 0.5 || r.height < min - 0.5) {
          const name = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? "";
          out.push(`${el.getAttribute("role") ?? el.tagName.toLowerCase()} "${name}" ${id} is ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      return out;
    },
    { selector: CONTROLS, min: TOUCH, exempt: INLINE_LINKS },
  );
}

/**
 * Text at 200%, as React Native's `fontScale` does it: every font size, line height and letter spacing doubled,
 * nothing else (boxes, icons and spacing keep their sizes, so a fixed box that cannot grow is caught).
 */
async function scaleText(page: Page, scale: number) {
  await page.evaluate((k) => {
    const all = [...document.querySelectorAll<HTMLElement>("body *")];
    const sizes = all.map((el) => {
      const s = getComputedStyle(el);
      return { el, fontSize: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing };
    });
    const times = (v: string) => (v.endsWith("px") ? `${parseFloat(v) * k}px` : v);
    for (const { el, fontSize, lineHeight, letterSpacing } of sizes) {
      el.style.setProperty("font-size", times(fontSize), "important");
      el.style.setProperty("line-height", times(lineHeight), "important");
      el.style.setProperty("letter-spacing", times(letterSpacing), "important");
    }
  }, scale);
  // Let layout settle (a ScrollView or a wrapping row re-measures).
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/**
 * Text that does not fit: an element holding text whose content overflows a box that clips it (overflow hidden,
 * which is also how a `numberOfLines` cut works on the web), or a control whose label spills out of it.
 */
async function clippedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const hasText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    const controls = "[role=button], [role=link], [role=switch], [role=menuitem], [role=checkbox], [role=tab]";
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (el.closest("[aria-hidden=true]")) continue;
      const s = getComputedStyle(el);
      const clips = (o: string) => o === "hidden" || o === "clip";
      const text = el.textContent?.trim().slice(0, 50) ?? "";
      if (!text) continue;
      const overX = el.scrollWidth > el.clientWidth + 1;
      const overY = el.scrollHeight > el.clientHeight + 1;
      if (((clips(s.overflowX) && overX) || (clips(s.overflowY) && overY)) && (hasText(el) || el.querySelector("*"))) {
        // A clipping box whose overflow is only decoration (a shadow, a tilted sticker) holds no cut text; only
        // flag it when a text-bearing descendant actually reaches past its edge.
        const box = el.getBoundingClientRect();
        const cut = [el, ...el.querySelectorAll<HTMLElement>("*")].some((t) => {
          if (!hasText(t)) return false;
          if (t === el) return true;
          const r = t.getBoundingClientRect();
          return r.right > box.right + 1 || r.bottom > box.bottom + 1 || r.left < box.left - 1 || r.top < box.top - 1;
        });
        if (cut) out.push(`clipped: "${text}" (${el.getAttribute("data-testid") ?? el.tagName.toLowerCase()})`);
      }
      if (el.matches(controls)) {
        const box = el.getBoundingClientRect();
        for (const t of el.querySelectorAll<HTMLElement>("*")) {
          if (!hasText(t)) continue;
          const r = t.getBoundingClientRect();
          if (r.bottom > box.bottom + 1 || r.top < box.top - 1 || r.right > box.right + 1 || r.left < box.left - 1) {
            out.push(`spills out of its control: "${t.textContent!.trim().slice(0, 50)}" (${el.getAttribute("data-testid") ?? ""})`);
            break;
          }
        }
      }
    }
    return out;
  });
}

test.describe("accessibility", () => {
  // A phone: the app is built for one, and 200% text is hardest on a narrow screen.
  test.use({ viewport: { width: 390, height: 844 } });
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  for (const state of STATES) {
    test(`A5: ${state.name}: axe finds nothing serious, targets are 44 px, text takes 200%`, async ({ page }) => {
      await state.open(page);
      await page.waitForLoadState("networkidle");
      expect.soft(await axeProblems(page), "axe: serious or critical").toEqual([]);
      expect.soft(await smallTargets(page), "touch targets under 44 x 44 px").toEqual([]);
      await scaleText(page, TEXT_SCALE);
      expect.soft(await clippedText(page), "text clipped at 200%").toEqual([]);
    });
  }

  test("A5: a keyboard focus draws the theme's focus ring", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Import a book", { exact: true })).toBeVisible();
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor };
    });
    // colors.focus #4de8ff, strokes.outline 2 (src/ui/theme.ts focusRing).
    expect(ring).toEqual({ style: "solid", width: "2px", color: "rgb(77, 232, 255)" });
  });

  test("A5: with reduce motion on, a pressed button does not scale", async ({ page }) => {
    // Held down, a sticker button is pushed in (its hard shadow gone); it also shrinks unless motion is reduced.
    const pressedTransform = async () => {
      const button = page.getByTestId("import-book");
      const box = (await button.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect.poll(() => button.evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");
      const transform = await button.evaluate((el) => getComputedStyle(el).transform);
      await page.mouse.move(0, 0);
      await page.mouse.up();
      return transform;
    };
    await page.goto("/");
    await expect(page.getByTestId("import-book")).toBeVisible();
    expect(await pressedTransform()).not.toBe("none");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(page.getByTestId("import-book")).toBeVisible();
    expect(await pressedTransform()).toBe("none");
  });
});
