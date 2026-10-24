// Browse and a LibriVox book's page (spec 05, 05.8, A9; 05.10, A11; 05.20, A22) on the web build, hermetic:
// archive.org (search, the popular list, metadata and the chapter/cover downloads) and the scoring proxy's read-only
// routes are route stubs (e2e/librivox-fixtures.ts), so nothing leaves localhost (librivox.org's own API is never
// called at all, agents.md rule 6).
import { expect, test } from "@playwright/test";

import { guard } from "./guard";
import { CATALOG_ID, IDENTIFIER, METADATA_BODY, POPULAR_DOC, PRESCORED_ONLY_DOC, PROXY, stubArchiveOrg, stubOverall, stubPrescored } from "./librivox-fixtures";

const NOT_JSON = { status: 200, headers: { "access-control-allow-origin": "*" }, body: "not json" };

test.describe("browse", () => {
  let problems: string[] = [];
  test.beforeEach(async ({ page }) => {
    problems = await guard(page);
    await stubArchiveOrg(page);
  });
  test.afterEach(() => {
    expect(problems).toEqual([]);
  });

  test("A9: search by title, author or genre finds the book, and its page shows its chapters", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Browse free books" }).click();
    await expect(page).toHaveURL(/\/browse$/);
    await expect(page.getByTestId("browse-popular")).toBeVisible();

    await page.getByTestId("browse-query").fill("Wind in the Willows");
    await expect(page.getByTestId(`browse-result-${IDENTIFIER}`)).toBeVisible();
    await expect(page.getByTestId(`browse-result-${IDENTIFIER}`)).toContainText("Kenneth Grahame");

    // Clearing the field goes back to the popular list rather than showing stale results.
    await page.getByTestId("browse-clear").click();
    await expect(page.getByTestId("browse-popular")).toBeVisible();
    await page.getByTestId("browse-query").fill("Kenneth Grahame"); // the same book, found by author this time
    await expect(page.getByTestId(`browse-result-${IDENTIFIER}`)).toBeVisible();

    await page.getByTestId(`browse-result-${IDENTIFIER}`).click();
    await expect(page).toHaveURL(new RegExp(`/browse/${IDENTIFIER}$`));
    await expect(page.getByRole("heading", { name: "The Wind in the Willows" })).toBeVisible();
    await expect(page.getByText("Read by Pat Reader")).toBeVisible();
    await expect(page.getByText(/Not scored yet\./)).toBeVisible();
    await expect(page.getByTestId("browse-chapter-0")).toContainText("The River Bank");
    await expect(page.getByTestId("browse-chapter-1")).toContainText("The Open Road");
    await page.waitForLoadState("networkidle");
  });

  test("A11: a pre-scored row shows Scored and the book's overall emotions; an unscored row shows none", async ({ page }) => {
    const docs = [
      { identifier: "scored_book_librivox", title: "Scored Book", creator: "A. Author", runtime: "1:00:00", description: null, call_number: "101" },
      { identifier: "plain_book_librivox", title: "Plain Book", creator: "A. Author", runtime: "1:00:00", description: null, call_number: "202" },
    ];
    await page.route("https://archive.org/advancedsearch.php*", (route) => route.fulfill({ status: 200, json: { response: { numFound: 2, docs } } }));
    await page.route("https://archive.org/metadata/scored_book_librivox", (route) =>
      route.fulfill({ status: 200, json: { ...METADATA_BODY, metadata: { ...METADATA_BODY.metadata, identifier: "scored_book_librivox", title: "Scored Book", call_number: "101" } } }),
    );
    const asked = await stubOverall(page, ["101"]);

    await page.goto("/browse");
    await expect(page.getByTestId("browse-popular")).toBeVisible();
    await page.getByTestId("browse-query").fill("Book");
    await expect(page.getByTestId("browse-popular")).toHaveCount(0);
    const scored = page.getByTestId("browse-result-scored_book_librivox");
    const plain = page.getByTestId("browse-result-plain_book_librivox");
    await expect(plain).toBeVisible();
    await expect(page.getByTestId("browse-scored-scored_book_librivox")).toBeVisible();
    await expect(scored).toContainText("Scored");
    // The top two overall emotions with their intensity, the book's own; the third is for the book's page.
    await expect(scored).toContainText("Wonder 80%");
    await expect(scored).toContainText("Joy 60%");
    await expect(scored).not.toContainText("Calm");
    await expect(page.getByTestId("browse-scored-plain_book_librivox")).toHaveCount(0);
    await expect(plain).not.toContainText("Scored");
    // One batched read for the search's page, with the LibriVox numbers only (the popular list made its own).
    expect(asked.at(-1)).toEqual(["101", "202"]);
    expect(asked.flat().every((id) => /^[0-9]+$/.test(id))).toBe(true);

    // The book's page shows the whole book's mood: Scored and at most three overall emotions, never a chapter's.
    await scored.click();
    await expect(page.getByRole("heading", { name: "Scored Book" })).toBeVisible();
    await expect(page.getByTestId("browse-book-scored")).toContainText("Scored");
    await expect(page.getByTestId("browse-book-scored")).toContainText("Calm 30%");
    await expect(page.getByText("Chapters stay a surprise until you reach them.")).toBeVisible();
    await expect(page.getByText(/Not scored yet\./)).toHaveCount(0);
    await expect(page.getByTestId("browse-chapter-0")).not.toContainText("%");
    await page.waitForLoadState("networkidle");
  });

  test("A22: Browse opens on Popular on LibriVox, pre-scored books first; a search replaces it, clearing restores it", async ({ page }) => {
    // The listing names a pre-scored book archive.org's popular page lacks (found by its number) and the fixture book.
    const limits = await stubPrescored(page, [PRESCORED_ONLY_DOC.call_number, CATALOG_ID]);
    await page.goto("/browse");
    const popular = page.getByTestId("browse-popular");
    await expect(popular).toBeVisible();
    await expect(page.getByRole("heading", { name: "Popular on LibriVox" })).toBeVisible();
    const rows = popular.locator('[data-testid^="browse-result-"]');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute("data-testid", `browse-result-${PRESCORED_ONLY_DOC.identifier}`);
    await expect(rows.nth(1)).toHaveAttribute("data-testid", `browse-result-${IDENTIFIER}`);
    await expect(rows.nth(2)).toHaveAttribute("data-testid", `browse-result-${POPULAR_DOC.identifier}`);
    // The pre-scored rows carry Scored and the book's overall emotions; the popular book after them carries none.
    await expect(page.getByTestId(`browse-scored-${PRESCORED_ONLY_DOC.identifier}`)).toBeVisible();
    await expect(page.getByTestId(`browse-scored-${IDENTIFIER}`)).toContainText("Wonder 80%");
    await expect(page.getByTestId(`browse-scored-${POPULAR_DOC.identifier}`)).toHaveCount(0);
    expect(limits).toEqual(["20"]);

    await page.getByTestId("browse-query").fill("Kenneth Grahame");
    await expect(page.getByTestId("browse-popular")).toHaveCount(0);
    await expect(page.getByTestId(`browse-result-${IDENTIFIER}`)).toBeVisible();
    await expect(page.getByTestId(`browse-result-${POPULAR_DOC.identifier}`)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Popular on LibriVox" })).toHaveCount(0);

    await page.getByTestId("browse-clear").click();
    await expect(popular).toBeVisible();
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute("data-testid", `browse-result-${PRESCORED_ONLY_DOC.identifier}`);
    expect(limits).toEqual(["20"]); // loaded once per visit
    await page.waitForLoadState("networkidle");
  });

  test("A22: a failed listing still shows the popular list, unscored and in download order", async ({ page }) => {
    await page.route(`${PROXY}/v1/prescored*`, (route) => route.fulfill(NOT_JSON));
    await page.goto("/browse");
    const rows = page.getByTestId("browse-popular").locator('[data-testid^="browse-result-"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute("data-testid", `browse-result-${POPULAR_DOC.identifier}`);
    await expect(rows.nth(1)).toHaveAttribute("data-testid", `browse-result-${IDENTIFIER}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid^="browse-scored-"]')).toHaveCount(0);
  });

  test("A22: with the listing and archive.org both failing, Browse shows its plain prompt", async ({ page }) => {
    await page.route(`${PROXY}/v1/prescored*`, (route) => route.fulfill(NOT_JSON));
    await page.route("https://archive.org/advancedsearch.php*", (route) => route.fulfill(NOT_JSON));
    await page.goto("/browse");
    await expect(page.getByTestId("browse-prompt")).toBeVisible();
    await expect(page.getByTestId("browse-popular")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
  });

  test("Browse still works when the proxy's overall read fails: every row reads unscored", async ({ page }) => {
    await page.route(`${PROXY}/v1/overall*`, (route) => route.fulfill(NOT_JSON));
    await page.route(`${PROXY}/v1/prescored*`, (route) => route.fulfill(NOT_JSON));
    await page.goto("/browse");
    await page.getByTestId("browse-query").fill("Wind in the Willows");
    await expect(page.getByTestId(`browse-result-${IDENTIFIER}`)).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId(`browse-scored-${IDENTIFIER}`)).toHaveCount(0);
  });

  test("No LibriVox books match a search with no results", async ({ page }) => {
    await page.goto("/browse");
    await page.getByTestId("browse-query").fill("zzz_no_such_book_zzz");
    await expect(page.getByText('No LibriVox books match "zzz_no_such_book_zzz".')).toBeVisible();
    await page.waitForLoadState("networkidle");
  });

  test("A9: Download builds the book with its chapters, cover, title and author", async ({ page }) => {
    await page.goto(`/browse/${IDENTIFIER}`);
    await expect(page.getByTestId("browse-book-download")).toBeVisible();
    await page.getByTestId("browse-book-download").click();
    await expect(page.getByTestId("browse-book-downloading")).toBeVisible();
    await expect(page.getByTestId("browse-book-open")).toBeVisible({ timeout: 15_000 });

    const book = await page.evaluate(() => {
      const books = JSON.parse(localStorage.getItem("books") ?? "[]");
      return books[0];
    });
    expect(book.title).toBe("The Wind in the Willows");
    expect(book.author).toBe("Kenneth Grahame");
    expect(book.source).toEqual({ kind: "librivox", librivoxId: IDENTIFIER });
    expect(book.onDevice).toBe(true);
    expect(book.cover).not.toBeNull();
    expect(book.chapters).toHaveLength(2);
    expect(book.chapters.map((c: { title: string }) => c.title)).toEqual(["The River Bank", "The Open Road"]);
    expect(book.files).toHaveLength(2);
    for (const f of book.files) expect(f.duration).toBeGreaterThan(0);

    await page.getByTestId("browse-book-open").click();
    await expect(page).toHaveURL(/\/book\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { name: "The Wind in the Willows" })).toBeVisible();
    await page.waitForLoadState("networkidle");
  });
});
