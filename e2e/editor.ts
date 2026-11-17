import { expect, type Locator, type Page } from '@playwright/test';

// CodeMirror owns its selection. Use its Select All keymap before a real input
// event; generic contenteditable.fill can leave its internal selection behind.
export async function replaceSource(page: Page, source: Locator, text: string) {
  await source.click();
  await source.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
  await expect(source).toHaveText(text, { useInnerText: true });
}
