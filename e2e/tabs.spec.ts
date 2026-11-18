import { test, expect, type Page } from "@playwright/test";
import { replaceSource } from "./editor";
const panel = (page: Page) => page.locator(".view-content");
const switchTab = (page: Page, name: "网格" | "树形") =>
  page.getByRole("tab", { name, exact: true }).click();
const fixture = JSON.stringify(
  [{ left: { leaf: 1 }, right: { leaf: 2 } }],
  null,
  2,
);
async function openGridLeft(page: Page) {
  await panel(page)
    .getByRole("button", { name: "展开 left{1}", exact: true })
    .click();
  await panel(page).locator(".jg-value").getByText("1", { exact: true }).click();
  await expect(page.locator(".selection-bar code")).toHaveText(
    "$[0].left.leaf",
  );
}
async function openTreeRight(page: Page) {
  await switchTab(page, "树形");
  await panel(page)
    .getByRole("button", { name: "展开 right", exact: true })
    .click();
  await panel(page)
    .locator(".jg-value")
    .getByText("2", { exact: true })
    .click();
  await expect(page.locator(".selection-bar code")).toHaveText(
    "$[0].right.leaf",
  );
}

test("each tab restores its own nested expansion, selection and source highlight", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(page, page.locator(".cm-content"), fixture);
  await openGridLeft(page);
  await openTreeRight(page);
  await switchTab(page, "网格");
  await expect(
    panel(page).getByRole("button", { name: "折叠 left{1}", exact: true }),
  ).toBeVisible();
  await expect(
    panel(page).getByRole("button", { name: "展开 right{1}", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".selection-bar code")).toHaveText(
    "$[0].left.leaf",
  );
  await expect(page.locator(".cm-json-selected")).toContainText('"leaf": 1');
  await page.getByRole("button", { name: "全部折叠", exact: true }).click();
  await switchTab(page, "树形");
  await expect(
    panel(page).getByRole("button", { name: "折叠 right", exact: true }),
  ).toBeVisible();
  await expect(
    panel(page).getByRole("button", { name: "展开 left", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".selection-bar code")).toHaveText(
    "$[0].right.leaf",
  );
  await expect(page.locator(".cm-json-selected")).toContainText('"leaf": 2');
  await switchTab(page, "网格");
  await expect(
    panel(page).getByRole("button", { name: "展开 left{1}", exact: true }),
  ).toBeVisible();
  await expect(panel(page).getByRole("table")).toBeVisible();
  await expect(page.locator(".selection-bar code")).toHaveText(
    "$[0].left.leaf",
  );
});

test("tab searches and match navigation restore independently without selecting the first match again", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(
    page,
    page.locator(".cm-content"),
    '[{"name":"match zero","branch":1},{"name":"match one","branch":2}]',
  );
  const search = page.getByRole("textbox", {
    name: "搜索键和值…",
    exact: true,
  });
  await search.fill("match");
  await page.getByRole("button", { name: "下一个匹配", exact: true }).click();
  await expect(page.locator(".selection-bar code")).toHaveText("$[1].name");
  await switchTab(page, "树形");
  await expect(search).toHaveValue("");
  await search.fill("branch");
  await expect(page.locator(".selection-bar code")).toHaveText("$[0].branch");
  await switchTab(page, "网格");
  await expect(search).toHaveValue("match");
  await expect(page.locator(".match-count")).toHaveText("2/2");
  await expect(page.locator(".selection-bar code")).toHaveText("$[1].name");
  await switchTab(page, "树形");
  await expect(search).toHaveValue("branch");
  await expect(page.locator(".selection-bar code")).toHaveText("$[0].branch");
});

test("grid sorting, column width, filters, page and both scroll positions survive a round trip", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1050, height: 800 });
  await page.goto("/");
  const source = JSON.stringify(
    Array.from({ length: 120 }, (_, i) => ({
      name: `row ${i}`,
      score: i,
      nested: { leaf: i },
    })),
  );
  await replaceSource(page, page.locator(".cm-content"), source);
  const active = page.getByRole("tabpanel");
  await active.getByRole("button", { name: "排序 score", exact: true }).click();
  await active.getByRole("button", { name: "筛选 score", exact: true }).click();
  await active
    .getByRole("textbox", { name: "筛选 score", exact: true })
    .fill(">10");
  await page.keyboard.press("Escape");
  await active
    .getByRole("separator", { name: "调整列宽 name", exact: true })
    .press("ArrowRight");
  await active.getByRole("button", { name: "下一页", exact: true }).click();
  await active.getByText('"row 65"', { exact: true }).click();
  const gridRoot = active.locator(".jg-grid-root");
  await gridRoot.evaluate((el) => {
    el.scrollTop = 250;
    el.scrollLeft = 45;
  });
  const gridPosition = await gridRoot.evaluate((el) => ({
    top: el.scrollTop,
    left: el.scrollLeft,
  }));
  expect(gridPosition.top).toBeGreaterThan(0);
  expect(gridPosition.left).toBeGreaterThan(0);
  await switchTab(page, "树形");
  const tree = active.getByRole("tree");
  await tree.evaluate((el) => {
    el.scrollTop = 1100;
  });
  await expect.poll(() => tree.evaluate((el) => el.scrollTop)).toBe(1100);
  await switchTab(page, "网格");
  await expect(page.locator(".selection-bar code")).toHaveText("$[65].name");
  await expect(
    active.getByRole("separator", { name: "调整列宽 name", exact: true }),
  ).toHaveAttribute("aria-valuenow", "200");
  await expect(
    active.getByRole("button", { name: "排序 score", exact: true }),
  ).toHaveText("↑");
  await expect(active.locator(".jg-pagination > span").last()).toHaveText(
    "2 / 3",
  );
  await expect
    .poll(() => gridRoot.evaluate((el) => el.scrollTop))
    .toBe(gridPosition.top);
  await expect
    .poll(() => gridRoot.evaluate((el) => el.scrollLeft))
    .toBe(gridPosition.left);
  await active.getByRole("button", { name: "筛选 score", exact: true }).click();
  await expect(
    active.getByRole("textbox", { name: "筛选 score", exact: true }),
  ).toHaveValue(">10");
  await page.keyboard.press("Escape");
  await switchTab(page, "树形");
  await expect.poll(() => tree.evaluate((el) => el.scrollTop)).toBe(1100);
});

test("temporary invalid source preserves both tabs; deleted paths are cleared safely", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const source = page.locator(".cm-content");
  await replaceSource(page, source, fixture);
  await openGridLeft(page);
  await openTreeRight(page);
  await replaceSource(page, source, '{"incomplete":');
  await expect(page.getByRole("tabpanel")).toHaveCount(0);
  await expect(page.locator(".parse-error")).toBeVisible();
  await replaceSource(page, source, fixture);
  await expect(
    panel(page).getByRole("button", { name: "折叠 right", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".selection-bar code")).toHaveText(
    "$[0].right.leaf",
  );
  await switchTab(page, "网格");
  await expect(
    panel(page).getByRole("button", { name: "折叠 left{1}", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".selection-bar code")).toHaveText(
    "$[0].left.leaf",
  );
  await switchTab(page, "树形");
  await replaceSource(page, source, '[{"right":{"leaf":2}}]');
  await switchTab(page, "网格");
  await expect(page.locator(".selection-bar code")).toHaveText("$");
  await expect(page.locator(".cm-json-selected")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("opening another file with the same schema resets the remembered tabs", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(page, page.locator(".cm-content"), fixture);
  await openGridLeft(page);
  await openTreeRight(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "打开文件", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "another.json",
    mimeType: "application/json",
    buffer: Buffer.from(fixture.replace("1", "9")),
  });
  await expect(page.locator(".filename")).toContainText("another.json");
  await expect(page.locator(".selection-bar code")).toHaveText("$");
  await expect(
    panel(page).getByRole("button", { name: "展开 right", exact: true }),
  ).toBeVisible();
  await switchTab(page, "网格");
  await expect(page.locator(".selection-bar code")).toHaveText("$");
  await expect(
    panel(page).getByRole("button", { name: "展开 left{1}", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cm-json-selected")).toHaveCount(0);
});
