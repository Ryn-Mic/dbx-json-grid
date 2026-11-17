import { test, expect, type Page } from "@playwright/test";
import { replaceSource } from "./editor";
const fixture = '{"name":"old","other":"second"}';
async function setup(page: Page, tab: "网格" | "树形") {
  await page.goto("/");
  await replaceSource(page, page.locator(".cm-content"), fixture);
  await page.getByRole("tab", { name: tab, exact: true }).click();
  return page.getByRole("tabpanel");
}
for (const tab of ["网格", "树形"] as const) {
  test(`${tab}: clicking another cell or blank area cancels the value draft without changing JSON`, async ({
    page,
  }) => {
    const view = await setup(page, tab);
    await view
      .locator(".jg-value")
      .getByText('"old"', { exact: true })
      .dblclick();
    const input = view.getByRole("textbox", { name: "编辑值", exact: true });
    await input.fill("discard this");
    await view
      .locator(".jg-value")
      .getByText('"second"', { exact: true })
      .click();
    await expect(input).toHaveCount(0);
    await expect(page.locator(".cm-content")).not.toContainText("discard this");
    await view
      .locator(".jg-value")
      .getByText('"old"', { exact: true })
      .dblclick();
    await input.fill("discard again");
    const bounds = (await view.boundingBox())!;
    await page.mouse.click(
      bounds.x + bounds.width - 10,
      bounds.y + bounds.height - 10,
    );
    await expect(input).toHaveCount(0);
    await expect(page.locator(".cm-content")).toHaveText(fixture);
  });
  test(`${tab}: keys cancel on internal focus transfer and values cancel on Tab`, async ({
    page,
  }) => {
    const view = await setup(page, tab);
    await view.locator(".jg-key").getByText("name", { exact: true }).dblclick();
    const key = view.getByRole("textbox", {
      name: "编辑字段名 name",
      exact: true,
    });
    await key.fill("unsaved key");
    await page
      .getByRole("textbox", { name: "搜索键和值…", exact: true })
      .focus();
    await expect(key).toHaveCount(0);
    await expect(page.locator(".cm-content")).toHaveText(fixture);
    await view
      .locator(".jg-value")
      .getByText('"old"', { exact: true })
      .dblclick();
    const input = view.getByRole("textbox", { name: "编辑值", exact: true });
    await input.fill("tab draft");
    await input.press("Tab");
    await expect(input).toHaveCount(0);
    await expect(page.locator(".cm-content")).toHaveText(fixture);
  });
  test(`${tab}: a second double-click replaces the first editor, and switching view tabs cancels drafts`, async ({
    page,
  }) => {
    const view = await setup(page, tab);
    await view
      .locator(".jg-value")
      .getByText('"old"', { exact: true })
      .dblclick();
    const input = view.getByRole("textbox", { name: "编辑值", exact: true });
    await input.fill("first draft");
    await view
      .locator(".jg-value")
      .getByText('"second"', { exact: true })
      .dblclick();
    await expect(input).toHaveCount(1);
    await expect(input).toHaveValue("second");
    await input.fill("second draft");
    await page
      .getByRole("tab", { name: tab === "网格" ? "树形" : "网格", exact: true })
      .click();
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(input).toHaveCount(0);
    await expect(page.locator(".cm-content")).toHaveText(fixture);
  });
  for (const kind of ["value", "key"] as const) {
    test(`${tab}: ${kind} draft survives real document focus loss to another browser page and resumes`, async ({
      page,
      context,
    }) => {
      const view = await setup(page, tab);
      await view
        .locator(kind === "value" ? ".jg-value" : ".jg-key")
        .getByText(kind === "value" ? '"old"' : "name", { exact: true })
        .dblclick();
      const input = view.getByRole("textbox", {
        name: kind === "value" ? "编辑值" : "编辑字段名 name",
        exact: true,
      });
      await input.fill("kept draft");
      // Playwright normally emulates focus even for background pages. Disable
      // that override so this exercises actual Chromium document focus loss.
      const target = await context.newCDPSession(page);
      await target.send("Emulation.setFocusEmulationEnabled", { enabled: false });
      const other = await context.newPage();
      await other.goto("about:blank");
      const otherTarget = await context.newCDPSession(other);
      await otherTarget.send("Emulation.setFocusEmulationEnabled", { enabled: false });
      await other.bringToFront();
      await expect
        .poll(() => page.evaluate(() => document.hasFocus()))
        .toBe(false);
      await expect(input).toHaveValue("kept draft");
      await page.bringToFront();
      await input.click();
      await expect(input).toHaveValue("kept draft");
      await input.fill("continued");
      await input.press("Enter");
      await expect(input).toHaveCount(0);
      await expect(page.locator(".cm-content")).toContainText(
        kind === "value" ? '"name": "continued"' : '"continued": "old"',
      );
      await other.close();
    });
  }
}

test("official sandbox cancels confirmed internal clicks but retains drafts when host chrome takes focus", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5190/");
  await page.getByRole("button", { name: "JSON Grid", exact: true }).click();
  const frame = page.frameLocator("iframe");
  await replaceSource(page, frame.locator(".cm-content"), fixture);
  const view = frame.getByRole("tabpanel");
  await view
    .locator(".jg-value")
    .getByText('"old"', { exact: true })
    .dblclick();
  const input = view.getByRole("textbox", { name: "编辑值", exact: true });
  await input.fill("sandbox draft");
  await page.getByRole("button", { name: "深色主题", exact: true }).click();
  await expect(input).toHaveValue("sandbox draft");
  await input.click();
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await view
    .locator(".jg-value")
    .getByText('"old"', { exact: true })
    .dblclick();
  await input.fill("discard sandbox draft");
  await view
    .locator(".jg-value")
    .getByText('"second"', { exact: true })
    .click();
  await expect(input).toHaveCount(0);
  await expect(frame.locator(".cm-content")).toHaveText(fixture);
});
