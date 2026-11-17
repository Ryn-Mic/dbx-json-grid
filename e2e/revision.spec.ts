import { replaceSource } from './editor';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Consumer regressions found by review: these use the actual source editor and
// exported document, rather than committing directly through component mocks.
test('valid source schema replacement clears stale sort and keeps the workbench usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const source = page.locator('.cm-content');
  const view = page.locator('.view-pane');
  await replaceSource(page, source, '[{"a":2},{"a":1}]');
  await view.getByRole('button', { name: '排序 a', exact: true }).click();
  await replaceSource(page, source, '[{"b":2},{"b":1}]');
  await expect(view.getByRole('button', { name: '排序 b', exact: true })).toBeVisible();
  await expect(view.locator('.jg-value')).toHaveText(['2', '1']);
  await expect(view.getByRole('textbox', { name: '筛选 b', exact: true })).toHaveCount(0);
  await view.getByRole('button', { name: '排序 b', exact: true }).click();
  await expect(view.locator('.jg-value')).toHaveText(['1', '2']);
  await expect(source).toContainText('"b"');
  expect(errors).toEqual([]);
});

for (const scenario of [
  { name: 'changed target', before: '{"a":"old"}', target: '"old"', after: '{"a":"oldf"}' },
  { name: 'shifted identical array value', before: '["same","tail"]', target: '"same"', after: '["same","same","tail"]' },
]) {
  test(`source revision cancels inline draft for ${scenario.name} and export preserves source`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    const source = page.locator('.cm-content');
    const view = page.locator('.view-pane');
    await replaceSource(page, source, scenario.before);
    await view.getByText(scenario.target, { exact: true }).dblclick();
    const inline = view.locator('.jg-inline-editor input');
    await inline.fill('stale draft');
    await replaceSource(page, source, scenario.after);
    await expect(inline).toHaveCount(0);
    await expect(source).not.toContainText('stale draft');
    const pendingDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
    const download = await pendingDownload;
    const filename = await download.path();
    expect(filename).not.toBeNull();
    const exported = await readFile(filename!, 'utf8');
    expect(JSON.parse(exported)).toEqual(JSON.parse(scenario.after));
    expect(errors).toEqual([]);
  });
}

test('nested order array has no focus action and expands items with one click', async ({ page }) => {
  await page.goto('/');
  const view = page.locator('.view-pane');
  await view.getByText('orders[3]', { exact: true }).click({ button: 'right' });
  await expect(view.getByRole('menuitem', { name: '聚焦此处', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(view.getByRole('button', { name: /^展开 items\[/ })).toHaveCount(3);
  await expect(view.getByRole('button', { name: /^展开 shipping\{/ })).toHaveCount(3);
  for (const name of ['"Alice Chen"', '"Noah Park"', '"Mia Wilson"']) {
    await expect(view.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(view.getByText('"Mechanical keyboard"', { exact: true })).toHaveCount(0);
  await view.getByRole('button', { name: /^展开 items\[/ }).first().click();
  await expect(view.getByText('"Mechanical keyboard"', { exact: true })).toBeVisible();
});
