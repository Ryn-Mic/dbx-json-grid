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

// Deterministic I/O controls exercise context changes while an import is pending.
async function installDeferredHost(page: import('@playwright/test').Page, mode: 'clipboard' | 'native' | 'drop' | 'browser') {
  await page.addInitScript(({mode}) => {
    type Context = Record<string, unknown>;
    type Chunk = {dataBase64:string;length:number;eof:boolean};
    const listeners = new Set<(next:Context)=>void>();
    let clipboardResolve: ((text:string)=>void) | undefined;
    let clipboardReject: ((error:Error)=>void) | undefined;
    let readResolve: ((chunk:Chunk)=>void) | undefined;
    let restoreResolve: ((drafts:unknown)=>void) | undefined;
    let browserResolve: ((bytes:ArrayBuffer)=>void) | undefined;
    let drop: ((files:{handleId:string;name:string;size:number}[])=>void) | undefined;
    let reads = 0, cancelled = 0;
    const sdk = {
      ready: Promise.resolve(), context: {workbenchId:'one'} as Context,
      locale:'zh-CN', theme:{appearance:'light'},
      capabilities: {clipboardRead:true, storage:mode==='native', fileTransfer:{pick:mode==='native',read:mode==='native'||mode==='drop',drop:mode==='drop'}},
      copy: async()=>{},
      clipboard:{readText:()=>new Promise<string>((resolve,reject)=>{clipboardResolve=resolve;clipboardReject=reject;})},
      storage: {
        get: async(key:string):Promise<unknown> => {
          if(key==='preferences.v1')return {draft:true};
          if(key==='drafts.v1'&&sdk.context.workbenchId==='two')return new Promise(resolve=>{restoreResolve=resolve;});
          return null;
        },
        set:async()=>{},delete:async()=>{},
      },
      fileTransfer:{
        pick:async()=>({files:[{handleId:'old',name:'private.json',size:17}]}),
        read:()=>{reads++;return new Promise<Chunk>(resolve=>{readResolve=resolve;});},
        cancel:async()=>{cancelled++;},
        onDrop:(listener:typeof drop)=>{drop=listener;return()=>{drop=undefined;};},
      },
      onContext:(listener:(next:Context)=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);},
    };
    if(mode==='browser')File.prototype.arrayBuffer=function(){return new Promise(resolve=>{browserResolve=resolve;});};
    Object.assign(window, {
      dbxPlugin:sdk,
      switchTestContext:(next:Context)=>{sdk.context=next;for(const listener of listeners)listener(next);},
      resolveClipboard:(text:string)=>clipboardResolve?.(text),
      rejectClipboard:()=>clipboardReject?.(new Error('obsolete clipboard error')),
      resolveRead:()=>{const text='{"private":"one"}';readResolve?.({dataBase64:btoa(text),length:text.length,eof:true});},
      resolveRestore:()=>restoreResolve?.({two:{text:'{"restored":"two"}',name:'two.json',updated:Date.now()}}),
      emitDrop:()=>drop?.([{handleId:'old',name:'private.json',size:17}]),
      resolveBrowserRead:()=>browserResolve?.(new TextEncoder().encode('{"private":"one"}').buffer),
      pendingReadCount:()=>reads,
      cancelledReadCount:()=>cancelled,
      hasPendingRestore:()=>!!restoreResolve,
    });
  }, {mode});
}
type DeferredControls = {
  switchTestContext(next:Record<string,unknown>):void;
  resolveClipboard(text:string):void;rejectClipboard():void;
  resolveRead():void;resolveRestore():void;emitDrop():void;resolveBrowserRead():void;
  pendingReadCount():number;cancelledReadCount():number;hasPendingRestore():boolean;
};

for (const cycle of [false, true]) {
  test(`discards a pending clipboard import after ${cycle?'one→two→one':'one→two'} while current imports still work`, async ({page}) => {
    await installDeferredHost(page,'clipboard');
    await page.goto('/');
    await page.getByRole('button',{name:'粘贴',exact:true}).click();
    await page.evaluate(cycle=>{
      const controls=window as unknown as DeferredControls;
      controls.switchTestContext({workbenchId:'two',newQuery:true});
      if(cycle)controls.switchTestContext({workbenchId:'one',newQuery:true});
    },cycle);
    await expect(page.locator('.cm-content')).toHaveText('');
    await expect(page.getByRole('button',{name:'粘贴',exact:true})).toBeEnabled();
    await page.evaluate(()=>{(window as unknown as DeferredControls).resolveClipboard('{"private":"one"}');});
    // A new same-instance operation completes after the discarded operation and
    // demonstrates that the current document remains editable/importable.
    await page.getByRole('button',{name:'粘贴',exact:true}).click();
    await page.evaluate(()=>{(window as unknown as DeferredControls).resolveClipboard('{"public":"current"}');});
    await expect(page.locator('.cm-content')).toContainText('"current"');
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    await expect(page.locator('.cm-content')).toHaveText('');
    await expect(page.getByRole('button',{name:'撤销',exact:true})).toBeDisabled();
  });
}

test('obsolete native file completion cannot import or unlock a newer pending restore', async ({page})=>{
  await installDeferredHost(page,'native');
  await page.goto('/');
  await page.getByRole('button',{name:'打开文件',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as DeferredControls).pendingReadCount())).toBe(1);
  await page.evaluate(()=>(window as unknown as DeferredControls).switchTestContext({workbenchId:'two'}));
  await expect.poll(()=>page.evaluate(()=>(window as unknown as DeferredControls).hasPendingRestore())).toBe(true);
  await page.evaluate(()=>(window as unknown as DeferredControls).resolveRead());
  await expect.poll(()=>page.evaluate(()=>(window as unknown as DeferredControls).cancelledReadCount())).toBe(1);
  await expect(page.locator('.cm-content')).toHaveText('');
  await expect(page.locator('.cm-content')).toHaveAttribute('aria-readonly','true');
  await expect(page.getByRole('button',{name:'粘贴',exact:true})).toBeDisabled();
  await page.evaluate(()=>(window as unknown as DeferredControls).resolveRestore());
  await expect(page.locator('.cm-content')).toContainText('"restored":"two"');
  await expect(page.getByRole('button',{name:'粘贴',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'撤销',exact:true})).toBeDisabled();
});

test('Host drop completion from a disposed context subscription is discarded', async ({page})=>{
  await installDeferredHost(page,'drop');
  await page.goto('/');
  await expect(page.getByRole('button',{name:'粘贴',exact:true})).toBeEnabled();
  await page.evaluate(()=>(window as unknown as DeferredControls).emitDrop());
  await expect.poll(()=>page.evaluate(()=>(window as unknown as DeferredControls).pendingReadCount())).toBe(1);
  await page.evaluate(()=>(window as unknown as DeferredControls).switchTestContext({workbenchId:'two',newQuery:true}));
  await expect(page.locator('.cm-content')).toHaveText('');
  await page.evaluate(()=>(window as unknown as DeferredControls).resolveRead());
  await expect.poll(()=>page.evaluate(()=>(window as unknown as DeferredControls).cancelledReadCount())).toBe(1);
  await expect(page.locator('.cm-content')).toHaveText('');
  await expect(page.getByRole('button',{name:'撤销',exact:true})).toBeDisabled();
});

test('browser file reads and stale import errors are isolated from the next context', async ({page})=>{
  await installDeferredHost(page,'browser');
  await page.goto('/');
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'打开文件',exact:true}).click();
  await (await chooser).setFiles({name:'private.json',mimeType:'application/json',buffer:Buffer.from('{"private":"one"}')});
  await page.getByRole('button',{name:'粘贴',exact:true}).click();
  await page.evaluate(()=>(window as unknown as DeferredControls).switchTestContext({workbenchId:'two',newQuery:true}));
  await expect(page.locator('.cm-content')).toHaveText('');
  await page.evaluate(()=>{const controls=window as unknown as DeferredControls;controls.resolveBrowserRead();controls.rejectClipboard();});
  await page.getByRole('button',{name:'粘贴',exact:true}).click();
  await page.evaluate(()=>(window as unknown as DeferredControls).resolveClipboard('{"public":"two"}'));
  await expect(page.locator('.cm-content')).toContainText('"public":"two"');
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await expect(page.locator('.cm-content')).toHaveText('');
  await expect(page.getByRole('button',{name:'撤销',exact:true})).toBeDisabled();
});
