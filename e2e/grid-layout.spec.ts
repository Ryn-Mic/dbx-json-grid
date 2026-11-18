import { test, expect, type Page } from "@playwright/test";
import { replaceSource } from "./editor";

const gridAt = (page: Page, path: (string | number)[]) =>
  page.locator(`[data-grid-path='${JSON.stringify(path)}']`);
const outerTable = ":scope > .jg-grid-scroll > table";

test("objects use headerless key/value tables and keep both columns resizable", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(
    page,
    page.locator(".cm-content"),
    '{"a":1,"b":{"x":2}}',
  );
  const root = gridAt(page, []);
  const table = root.locator(outerTable);
  await expect(table.locator(":scope > thead, :scope > tfoot")).toHaveCount(
    0,
  );
  await expect(table.locator(":scope > tbody > tr > th")).toHaveText([
    "a",
    "b",
  ]);
  await expect(page.getByText("JSON 数据", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "表格分页" }),
  ).toHaveCount(0);
  await expect(root.getByText(/^[12] 行$/)).toHaveCount(0);
  for (const column of ["键", "值"]) {
    const grip = root
      .getByRole("separator", { name: `调整列宽 ${column}`, exact: true })
      .first();
    const start = Number(await grip.getAttribute("aria-valuenow"));
    await grip.press("ArrowRight");
    await expect(grip).toHaveAttribute("aria-valuenow", String(start + 20));
  }
  const child = gridAt(page, ["b"]);
  await root.getByRole("button", { name: "展开 b{1}", exact: true }).click();
  await expect(child.locator("thead, tfoot")).toHaveCount(0);
  await expect(child.locator(".jg-row-key")).toHaveText("x");
});

test("root and nested arrays show one-based numbers while retaining zero-based paths", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(
    page,
    page.locator(".cm-content"),
    '[{"list":["first","second"],"rank":2},{"list":[],"rank":1}]',
  );
  const root = gridAt(page, []),
    table = root.locator(outerTable);
  const numbers = table.locator(":scope > tbody > tr > th");
  await expect(
    table.locator(":scope > thead > tr > th").first(),
  ).toHaveText("#");
  await expect(numbers).toHaveText(["1", "2"]);
  await root
    .getByRole("button", { name: "展开 list[2]", exact: true })
    .click();
  const nested = gridAt(page, [0, "list"]).locator(outerTable);
  await expect(
    nested.locator(":scope > thead > tr > th").first(),
  ).toHaveText("#");
  const second = nested.getByRole("rowheader", { name: "2", exact: true });
  await second.getByRole("button").click();
  await expect(page.locator(".selection-bar code")).toHaveText(
    "$[0].list[1]",
  );
  await root
    .getByRole("button", { name: "排序 rank", exact: true })
    .click();
  await expect(numbers).toHaveText(["2", "1"]);
});

test("multi-page tables paginate above the data without a bottom row", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(
    page,
    page.locator(".cm-content"),
    JSON.stringify(Array.from({ length: 51 }, (_, i) => `item-${i}`)),
  );
  const root = gridAt(page, []);
  const topPager = root
    .locator(":scope > nav + .jg-grid-scroll")
    .locator("..")
    .getByRole("navigation", { name: "表格分页" });
  await expect(topPager).toContainText("1 / 2");
  await expect(
    root.locator(":scope > .jg-grid-scroll:last-child"),
  ).toHaveCount(1);
  await topPager
    .getByRole("button", { name: "下一页", exact: true })
    .click();
  await expect(root.getByRole("rowheader")).toHaveText("51");
  await expect(root.locator(".jg-value")).toHaveText('"item-50"');
  await expect(root.getByText("51 行", { exact: true })).toHaveCount(0);
});

test("array header and row-number backgrounds match and contrast with content in both themes", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(page, page.locator(".cm-content"), '[{"a":1}]');
  await page.mouse.move(0, 0);
  const table = gridAt(page, []).locator(outerTable);
  async function colors() {
    return table.evaluate((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      return Array.from(
        el.querySelectorAll("thead th, tbody th, tbody td"),
        (cell) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = getComputedStyle(cell).backgroundColor;
          ctx.fillRect(0, 0, 1, 1);
          return Array.from(
            ctx.getImageData(0, 0, 1, 1).data.slice(0, 3),
          ).reduce((sum, channel) => sum + channel, 0);
        },
      );
    });
  }
  const [lightHead, lightCol, lightIndex, lightData] = await colors();
  expect(lightHead).toBe(lightCol);
  expect(lightHead).toBe(lightIndex);
  expect(lightHead).toBeLessThan(lightData);
  await page.getByRole("button", { name: "切换主题", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    "dark",
  );
  const [darkHead, darkCol, darkIndex, darkData] = await colors();
  expect(darkHead).toBe(darkCol);
  expect(darkHead).toBe(darkIndex);
  expect(darkHead).toBeGreaterThan(darkData);
});

test("source chevrons align with line numbers through fold/unfold on wrapped lines", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/");
  await replaceSource(
    page,
    page.locator(".cm-content"),
    `{\n  "${"long".repeat(40)}": {\n    "x": 1\n  }\n}`,
  );
  const marker = page
    .locator(".cm-foldGutter .jg-fold-marker:visible")
    .nth(1);
  async function assertAligned() {
    await expect
      .poll(() =>
        marker.evaluate((el) => {
          const icon = el.querySelector("svg")!.getBoundingClientRect();
          const row = el
            .closest(".cm-gutterElement")!
            .getBoundingClientRect();
          const numbers = Array.from(
            document.querySelectorAll(".cm-lineNumbers .cm-gutterElement"),
          );
          const line = numbers.find(
            (number) =>
              number.textContent === "2" &&
              Math.abs(number.getBoundingClientRect().top - row.top) < 1,
          );
          if (!line) return Infinity;
          const firstLineCenter =
            line.getBoundingClientRect().top +
            parseFloat(getComputedStyle(line).lineHeight) / 2;
          return Math.abs(icon.top + icon.height / 2 - firstLineCenter);
        }),
      )
      .toBeLessThan(1);
  }
  await expect(marker).toHaveAttribute("title", "折叠此行");
  await assertAligned();
  await marker.click();
  await expect(marker).toHaveAttribute("title", "展开此行");
  await assertAligned();
  await marker.click();
  await expect(marker).toHaveAttribute("title", "折叠此行");
});
