// Browse and a LibriVox book's page (spec 05, 05.8, A9) on the web build, hermetic: archive.org (search,
// metadata and the chapter/cover downloads) is a route stub (e2e/librivox-fixtures.ts), so nothing leaves
// localhost (librivox.org's own API is never called at all, agents.md rule 6).
import { expect, test } from "@playwright/test";

import { guard } from "./guard";
import { IDENTIFIER, stubArchiveOrg } from "./librivox-fixtures";

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
    await expect(page.getByTestId("browse-prompt")).toBeVisible();

    await page.getByTestId("browse-query").fill("Wind in the Willows");
    await expect(page.getByTestId(`browse-result-${IDENTIFIER}`)).toBeVisible();
    await expect(page.getByTestId(`browse-result-${IDENTIFIER}`)).toContainText("Kenneth Grahame");

    // Clearing the field goes back to the prompt rather than showing stale results.
    await page.getByTestId("browse-clear").click();
    await expect(page.getByTestId("browse-prompt")).toBeVisible();
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
