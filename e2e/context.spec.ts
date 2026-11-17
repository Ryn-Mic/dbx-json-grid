import { test, expect } from '@playwright/test';

test('repeated invocation keeps edits; a new Host identity resets source and history', async ({ page }) => {
  await page.addInitScript(() => {
    type Context = Record<string, unknown>;
    const listeners = new Set<(next: Context) => void>();
    const sdk = {
      ready: Promise.resolve(), context: { workbenchId: 'one' } as Context,
      locale: 'zh-CN', theme: { appearance: 'light' }, capabilities: {},
      copy: async () => {},
      onContext: (fn: (next: Context) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
    };
    Object.assign(window, { dbxPlugin: sdk, switchTestContext: (next: Context) => { sdk.context = next; for (const fn of listeners) fn(next); } });
  });
  await page.goto('/');
  await page.locator('.cm-content').fill('{"private":"one"}');
  await page.evaluate(() => (window as unknown as { switchTestContext(value: unknown): void }).switchTestContext({ workbenchId: 'one', invocation: 'repeat' }));
  await expect(page.locator('.cm-content')).toContainText('"one"');
  await page.evaluate(() => (window as unknown as { switchTestContext(value: unknown): void }).switchTestContext({ workbenchId: 'two', newQuery: true }));
  await expect(page.locator('.cm-content')).toHaveText('');
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '重做', exact: true })).toBeDisabled();
  await page.locator('.cm-content').fill('{"public":"two"}');
  await expect(page.locator('.view-pane').getByText('"two"', { exact: true })).toBeVisible();
});
