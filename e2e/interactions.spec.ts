import { test, expect, type Locator, type Page } from "@playwright/test";
import { replaceSource } from "./editor";
const grid = (page: Page, path: (string | number)[]) =>
  page.locator(`[data-grid-path='${JSON.stringify(path)}']`);
const table = (root: Locator) =>
  root.locator(":scope > .jg-grid-scroll > table");
async function drag(
  page: Page,
  handle: Locator,
  delta: number,
  vertical = false,
) {
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + Math.min(12, box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(
    x + (vertical ? 0 : delta),
    y + (vertical ? delta : 0),
    { steps: 5 },
  );
  await page.mouse.up();
}

test("grid and tree selection highlight all object lines and the correct duplicate scalar", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const source =
    '{\n  "rows": [\n    {\n      "a.b": 9007199254740993,\n      "same": true\n    },\n    { "a.b": 9007199254740993, "same": true }\n  ],\n  "tail": null\n}';
  await replaceSource(page, page.locator(".cm-content"), source);
  await page.getByRole("button", { name: "展开 rows[2]", exact: true }).click();
  await table(grid(page, ["rows"]))
    .locator(":scope > tbody > tr")
    .first()
    .locator(":scope > th button")
    .click();
  await expect(page.locator(".selection-bar code")).toHaveText("$.rows[0]");
  await expect(page.locator(".cm-json-selected")).toHaveText([
    "    {",
    '      "a.b": 9007199254740993,',
    '      "same": true',
    "    },",
  ]);
  await table(grid(page, ["rows"]))
    .locator(":scope > tbody > tr")
    .nth(1)
    .locator(".jg-value")
    .first()
    .click();
  await expect(page.locator(".cm-json-selected")).toHaveText([
    '    { "a.b": 9007199254740993, "same": true }',
  ]);
  await page.getByRole("tab", { name: "树形", exact: true }).click();
  await page
    .getByRole("treeitem")
    .filter({ has: page.locator(".jg-key").getByText("rows", { exact: true }) })
    .first()
    .locator(".jg-key")
    .click();
  await expect(page.locator(".selection-bar code")).toHaveText("$.rows");
  await expect(page.locator(".cm-json-selected")).toHaveCount(7);
  await replaceSource(page, page.locator(".cm-content"), '{"x":');
  await expect(page.locator(".cm-json-selected")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("tree and grid field names edit with collision protection, undo and stale-draft cancellation", async ({
  page,
}) => {
  await page.goto("/");
  const source = page.locator(".cm-content"),
    view = page.getByRole("tabpanel");
  await replaceSource(page, source, '{"old":9007199254740993,"taken":2}');
  await view
    .locator(".jg-row-key .jg-key")
    .getByText("old", { exact: true })
    .dblclick();
  let input = view.getByRole("textbox", {
    name: "编辑字段名 old",
    exact: true,
  });
  await input.fill("taken");
  await input.press("Enter");
  await expect(view.getByRole("alert")).toContainText("Duplicate");
  await expect(source).toContainText('"old"');
  await input.fill("a.b");
  await input.press("Enter");
  await expect(source).toContainText('"a.b": 9007199254740993');
  await expect(page.locator(".selection-bar code")).toHaveText('$["a.b"]');
  await page.getByRole("tab", { name: "树形", exact: true }).click();
  await view.locator(".jg-key").getByText("a.b", { exact: true }).dblclick();
  input = view.getByRole("textbox", { name: "编辑字段名 a.b", exact: true });
  await input.fill("__proto__");
  await input.press("Enter");
  await expect(source).toContainText('"__proto__": 9007199254740993');
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(source).toContainText('"a.b": 9007199254740993');
  await view.locator(".jg-key").getByText("a.b", { exact: true }).dblclick();
  await view
    .getByRole("textbox", { name: "编辑字段名 a.b", exact: true })
    .fill("stale");
  await replaceSource(page, source, '{"a.b":9007199254740994}');
  await expect(
    view.getByRole("textbox", { name: "编辑字段名 a.b", exact: true }),
  ).toHaveCount(0);
  await expect(source).not.toContainText("stale");
});

test("column header rename includes filtered rows and rejects any destination collision", async ({
  page,
}) => {
  await page.goto("/");
  const source = page.locator(".cm-content"),
    view = page.getByRole("tabpanel");
  await replaceSource(page, source, '[{"a":1},{"a":2,"taken":3}]');
  await view.getByRole("button", { name: "筛选 a", exact: true }).click();
  await view.getByRole("textbox", { name: "筛选 a", exact: true }).fill("=1");
  await page.keyboard.press("Escape");
  await view
    .locator("thead .jg-key")
    .getByText("a", { exact: true })
    .dblclick();
  const input = view.getByRole("textbox", {
    name: "编辑字段名 a",
    exact: true,
  });
  await input.fill("taken");
  await input.press("Enter");
  await expect(view.getByRole("alert")).toContainText("Duplicate");
  await input.fill("renamed");
  await input.press("Enter");
  await expect(source).not.toContainText('"a"');
  await expect(
    view.locator("thead .jg-key").getByText("renamed", { exact: true }),
  ).toBeVisible();
  await expect(
    table(grid(page, [])).locator(":scope > tbody > tr"),
  ).toHaveCount(2);
  await expect(source).toContainText('"taken": 3');
});

test("divider and every grid column resize by real pointer drags; index stays narrow by default", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(page, page.locator(".cm-content"), '[{"a":1,"b":2}]');
  const source = page.locator(".source-pane");
  const before = (await source.boundingBox())!.width;
  await drag(
    page,
    page.getByRole("separator", { name: "分栏视图", exact: true }),
    100,
  );
  expect((await source.boundingBox())!.width).toBeGreaterThan(before + 95);
  await drag(
    page,
    page.getByRole("separator", { name: "分栏视图", exact: true }),
    -100,
  );
  const rootTable = table(grid(page, []));
  const headers = rootTable.locator(":scope > thead > tr > th");
  expect((await headers.nth(0).boundingBox())!.width).toBeLessThan(60);
  for (const [index, name] of ["#", "a", "b"].entries()) {
    const start = (await headers.nth(index).boundingBox())!.width;
    await drag(
      page,
      rootTable.getByRole("separator", {
        name: `调整列宽 ${name}`,
        exact: true,
      }),
      55,
    );
    expect((await headers.nth(index).boundingBox())!.width).toBeGreaterThan(
      start + 50,
    );
    await drag(
      page,
      rootTable.getByRole("separator", {
        name: `调整列宽 ${name}`,
        exact: true,
      }),
      -35,
    );
    expect((await headers.nth(index).boundingBox())!.width).toBeLessThan(
      start + 25,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const height = (await source.boundingBox())!.height;
  await drag(
    page,
    page.getByRole("separator", { name: "分栏视图", exact: true }),
    45,
    true,
  );
  expect((await source.boundingBox())!.height).toBeGreaterThan(height + 40);
});

test("filters start as icons, keep predicates when closed, clear explicitly, and include index", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(
    page,
    page.locator(".cm-content"),
    '[{"score":2},{"score":1}]',
  );
  const view = page.getByRole("tabpanel");
  await expect(view.locator("thead input")).toHaveCount(0);
  await view.getByRole("button", { name: "筛选 score", exact: true }).click();
  await view
    .getByRole("textbox", { name: "筛选 score", exact: true })
    .fill("<2");
  await expect(view.locator(".jg-value")).toHaveText(["1"]);
  await page.keyboard.press("Escape");
  await expect(view.locator("thead input")).toHaveCount(0);
  await expect(view.locator(".jg-value")).toHaveText(["1"]);
  await view.getByRole("button", { name: "筛选 score", exact: true }).click();
  await view.getByRole("button", { name: "清除筛选", exact: true }).click();
  await expect(view.locator(".jg-value")).toHaveText(["2", "1"]);
  await view.getByRole("button", { name: "筛选 #", exact: true }).click();
  await expect(
    view.getByRole("textbox", { name: "筛选 score", exact: true }),
  ).toHaveCount(0);
  await view.getByRole("textbox", { name: "筛选 #", exact: true }).fill("=1");
  await expect(view.locator(".jg-value")).toHaveText(["2"]);
});

test("single nested toggles grow the parent column and push later columns, including child resizes", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(
    page,
    page.locator(".cm-content"),
    '[{"nested":[{"x":1,"y":2}],"object":{"leaf":3},"tail":4}]',
  );
  const root = table(grid(page, [])),
    headers = root.locator(":scope > thead > tr > th");
  const before = (await headers.nth(2).boundingBox())!.x;
  await root
    .getByRole("button", { name: "展开 nested[1]", exact: true })
    .click();
  const child = grid(page, [0, "nested"]);
  await expect(child.locator(".jg-value")).toHaveText(["1", "2"]);
  await expect(child.locator(".jg-grid-caption")).toHaveCount(0);
  const parentCell = root.locator(":scope > tbody > tr > td").nth(0);
  const parentBox = (await parentCell.boundingBox())!,
    childBox = (await child.boundingBox())!;
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(
    parentBox.x + parentBox.width - 1,
  );
  expect((await headers.nth(2).boundingBox())!.x).toBeGreaterThan(before + 200);
  const width = (await parentCell.boundingBox())!.width;
  await drag(
    page,
    child.getByRole("separator", { name: "调整列宽 x", exact: true }),
    60,
  );
  expect((await parentCell.boundingBox())!.width).toBeGreaterThan(width + 55);
  await root
    .getByRole("button", { name: "折叠 nested[1]", exact: true })
    .click();
  await expect(child).toHaveCount(0);
  await root
    .getByRole("button", { name: "展开 object{1}", exact: true })
    .click();
  await expect(grid(page, [0, "object"]).locator(".jg-value")).toHaveText([
    "3",
  ]);
  await expect(page.locator(".jg-grid-caption")).toHaveCount(0);
  await replaceSource(page, page.locator(".cm-content"), '[[1],{"z":2}]');
  await expect(
    page.getByRole("button", { name: "展开 list[1]", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "展开 object[1]", exact: true }),
  ).toBeVisible();
});
