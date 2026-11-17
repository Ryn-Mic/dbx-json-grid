import { test, expect } from '@playwright/test';

test('real source, inline grid edit and shared undo preserve large integers', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const view = page.locator('.view-pane');
  await expect(view.getByText('9007199254740993', { exact: true })).toBeVisible();
  await view.getByText('"Alice Chen"', { exact: true }).dblclick();
  const inline = view.locator('.jg-inline-editor input');
  await inline.fill('Alice Updated'); await inline.press('Enter');
  await expect(page.locator('.cm-content')).toContainText('Alice Updated');
  await expect(page.locator('.cm-content')).toContainText('9007199254740993');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(view.getByText('"Alice Chen"', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(view.getByText('"Alice Updated"', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('tree search, literal special-key path copy, invalid source and undo', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.locator('.cm-content').fill('{"a.b":[{"weird key":9007199254740993}],"other":null}');
  await page.getByRole('tab', { name: '树形', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索键和值…' }).fill('weird key');
  await expect(page.locator('.selection-bar code')).toHaveText('$["a.b"][0]["weird key"]');
  await page.getByRole('button', { name: '复制 JSONPath', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('$["a.b"][0]["weird key"]');
  await page.getByRole('button', { name: '只显示匹配项' }).click();
  await expect(page.getByRole('treeitem').filter({ hasText: 'other' })).toHaveCount(0);
  await page.locator('.cm-content').fill('{"a":');
  await expect(page.locator('.parse-error')).toBeVisible();
  await expect(page.getByRole('button', { name: '编辑值', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('.parse-error')).toHaveCount(0);
});

test('typed dialog, locale switch, responsive layout and file export', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').fill('{"value":"001","empty":[]}');
  await page.locator('.view-pane').getByText('"001"', { exact: true }).click();
  await page.getByRole('button', { name: '编辑值', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').selectOption('number');
  await dialog.getByRole('textbox').fill('9007199254740997');
  await dialog.getByRole('button', { name: '应用修改' }).click();
  await expect(page.locator('.cm-content')).toContainText('9007199254740997');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('orders.json');
  await page.getByRole('button', { name: '切换语言' }).click();
  await expect(page.getByRole('tab', { name: 'Tree', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('tab', { name: 'Grid', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('official DBX dev host sandbox loads bundled UI, copy, input and live theme', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5190/');
  await page.getByRole('button', { name: 'JSON Grid', exact: true }).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('tab', { name: '网格', exact: true })).toBeVisible();
  await frame.locator('.cm-content').fill('{"local":9007199254740993}');
  await expect(frame.locator('.view-pane').getByText('9007199254740993', { exact: true })).toBeVisible();
  await expect(frame.getByRole('button', { name: '复制 JSONPath', exact: true })).toBeEnabled();
  await frame.getByRole('button', { name: '复制 JSONPath', exact: true }).click();
  await expect(frame.getByRole('status')).toContainText('已复制');
  await page.getByRole('button', { name: '深色主题', exact: true }).click();
  await expect(frame.locator('html')).toHaveAttribute('data-appearance', 'dark');
  const sandbox = await page.locator('iframe').getAttribute('sandbox');
  expect(sandbox).toBe('allow-scripts');
  expect(errors).toEqual([]);
});
