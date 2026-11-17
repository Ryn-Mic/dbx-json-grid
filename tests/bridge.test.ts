import { describe, expect, it, vi } from 'vitest';
import { Bridge, byteSize, clearDraft, readDraft, saveDraft, type HostPlugin } from '../src/host/bridge';

function host() {
  const values = new Map<string, unknown>();
  const ft = {
    pick: vi.fn(async () => ({ files: [] as { handleId: string; name: string; size: number }[] })),
    read: vi.fn(async () => ({ dataBase64: btoa('{"x":1}'), length: 7, eof: true })),
    cancel: vi.fn(async () => undefined), beginSave: vi.fn(async (): Promise<{ handleId: string; chunkBytes: number } | null> => ({ handleId: 'out', chunkBytes: 3 })),
    write: vi.fn(async (_id: string, offset: number, data: Uint8Array) => ({ written: data.length, nextOffset: offset + data.length })),
    finish: vi.fn(async () => undefined),
  };
  const sdk: HostPlugin = { ready: Promise.resolve(), context: { workbenchId: 'one' }, capabilities: { storage: true, clipboardWrite: true, clipboardRead: true, fileTransfer: { pick: true, read: true, beginSave: true } }, copy: vi.fn(async () => undefined), clipboard: { readText: vi.fn(async () => '{}') }, storage: { get: vi.fn(async (key: string) => values.get(key) ?? null), set: vi.fn(async (key: string, value: unknown) => { values.set(key, structuredClone(value)); }), delete: vi.fn(async (key: string) => { values.delete(key); }) }, fileTransfer: ft };
  return { sdk, ft, values, bridge: new Bridge(sdk) };
}
describe('DBX bridge', () => {
  it('supports original API 1 copy without newer capability metadata', async () => {
    const { bridge, sdk } = host(); delete sdk.capabilities;
    expect(bridge.canCopy).toBe(true); await bridge.copy('$.a');
    expect(sdk.copy).toHaveBeenCalledWith('$.a');
    expect(bridge.canPaste).toBe(false); expect(bridge.canSave).toBe(false);
  });
  it('uses host clipboard and rejects absent capabilities rather than browser fallthrough', async () => {
    const { bridge, sdk } = host();
    await bridge.copy('$.data[2]'); expect(sdk.copy).toHaveBeenCalledWith('$.data[2]');
    expect(await bridge.paste()).toBe('{}'); sdk.capabilities = {};
    await expect(bridge.copy('x')).rejects.toThrow('unavailable'); await expect(bridge.paste()).rejects.toThrow('Ctrl/Cmd+V');
    expect(sdk.clipboard!.readText).toHaveBeenCalledTimes(1);
  });
  it('reads user-picked UTF-8 and always releases the handle', async () => {
    const { bridge, ft } = host();
    ft.pick.mockResolvedValue({ files: [{ handleId: 'in', name: 'a.json', size: 7 }] });
    expect(await bridge.open()).toEqual({ name: 'a.json', text: '{"x":1}' });
    expect(ft.cancel).toHaveBeenCalledWith('in');
  });
  it('rejects oversize and stalled transfers with handle cleanup', async () => {
    const { bridge, ft } = host();
    await expect(bridge.readHandle({ handleId: 'huge', name: 'a', size: 11 * 1024 * 1024 })).rejects.toThrow('10 MiB');
    expect(ft.cancel).toHaveBeenCalledWith('huge');
    ft.read.mockResolvedValue({ dataBase64: '', length: 0, eof: false });
    await expect(bridge.readHandle({ handleId: 'stalled', name: 'a', size: 7 })).rejects.toThrow('chunk');
    expect(ft.cancel).toHaveBeenCalledWith('stalled');
  });
  it('writes exact bytes sequentially and finishes only complete output', async () => {
    const { bridge, ft } = host();
    expect(await bridge.save('a.json', '中文{}')).toBe(true);
    const written = ft.write.mock.calls.map(call => [...call[2]]).flat();
    expect(new TextDecoder().decode(new Uint8Array(written))).toBe('中文{}');
    expect(ft.finish).toHaveBeenCalledWith('out'); expect(ft.cancel).not.toHaveBeenCalled();
  });
  it('treats save cancel as cancel and discards a partial write on failure', async () => {
    const { bridge, ft } = host(); ft.beginSave.mockResolvedValueOnce(null);
    expect(await bridge.save('a.json', '{}')).toBe(false); expect(ft.write).not.toHaveBeenCalled();
    ft.write.mockResolvedValueOnce({ written: 0, nextOffset: 0 });
    await expect(bridge.save('a.json', '{}')).rejects.toThrow('Incomplete');
    expect(ft.cancel).toHaveBeenCalledWith('out'); expect(ft.finish).not.toHaveBeenCalled();
  });
  it('does not touch missing storage, even when embedded in an opaque-origin sandbox', async () => {
    const { bridge, sdk } = host(); sdk.capabilities = {};
    expect(await bridge.getState('x')).toBeNull(); await expect(bridge.putState('x', 1)).rejects.toThrow('unavailable');
    expect(sdk.storage!.get).not.toHaveBeenCalled();
  });
  it('bounds serialized drafts including JSON escaping, and isolates instances', async () => {
    const { bridge, sdk, values } = host();
    expect(await saveDraft(bridge, '\\'.repeat(95 * 1024), 'a.json')).toBe(true);
    sdk.context = { workbenchId: 'two' };
    const second = new Bridge(sdk);
    expect(bridge.instanceId).toBe('one');
    expect(await saveDraft(second, '\\'.repeat(95 * 1024), 'b.json')).toBe(true);
    expect(byteSize(JSON.stringify(values.get('drafts.v1')))).toBeLessThan(256 * 1024);
    expect((await readDraft(second))?.name).toBe('b.json');
    sdk.context = { workbenchId: 'three' }; expect(await readDraft(new Bridge(sdk))).toBeNull();
  });
  it('removes a stale small draft when current input exceeds draft capacity', async () => {
    const { bridge } = host(); await saveDraft(bridge, '{}', 'a.json');
    expect(await saveDraft(bridge, 'x'.repeat(97 * 1024), 'a.json')).toBe(false);
    expect(await readDraft(bridge)).toBeNull();
  });
  it('invalidates paused and queued saves when clear is requested through a recreated Bridge', async () => {
    const {bridge,sdk,values} = host();
    const read = deferred<unknown>(), started = deferred<void>();
    vi.mocked(sdk.storage!.get).mockImplementationOnce(async () => { started.resolve(); return read.promise; });
    const save = saveDraft(bridge, '{"private":true}', 'private.json');
    await started.promise;
    const queued = saveDraft(new Bridge(sdk), '{"private":"newer"}', 'newer.json');
    const clear = clearDraft(new Bridge(sdk));
    expect(sdk.storage!.set).not.toHaveBeenCalled();
    read.resolve({});
    expect(await save).toBe(false);
    expect(await queued).toBe(false);
    await clear;
    expect(values.get('drafts.v1')).toEqual({});
    expect(await readDraft(bridge)).toBeNull();
  });
  it('waits for an in-flight Host write before clear and never recreates the deleted draft', async () => {
    const {bridge,sdk,values} = host();
    const write = deferred<void>(), started = deferred<void>();
    vi.mocked(sdk.storage!.set).mockImplementationOnce(async (key, value) => { const snapshot = structuredClone(value); started.resolve(); await write.promise; values.set(key,snapshot); });
    const save = saveDraft(bridge, '{"private":true}', 'private.json');
    await started.promise;
    let cleared = false;
    const clear = clearDraft(new Bridge(sdk)).then(() => {cleared=true;});
    await Promise.resolve();
    expect(cleared).toBe(false);
    expect(sdk.storage!.set).toHaveBeenCalledTimes(1);
    write.resolve();
    expect(await save).toBe(false);
    await clear;
    expect(values.get('drafts.v1')).toEqual({});
  });
  it('persists the latest save when an older read is still pending', async () => {
    const {bridge,sdk} = host();
    const read = deferred<unknown>(), started = deferred<void>();
    vi.mocked(sdk.storage!.get).mockImplementationOnce(async () => { started.resolve(); return read.promise; });
    const older = saveDraft(bridge, 'old', 'old.json');
    await started.promise;
    const newer = saveDraft(new Bridge(sdk), 'new', 'new.json');
    read.resolve({});
    expect(await older).toBe(false);
    expect(await newer).toBe(true);
    expect((await readDraft(bridge))?.text).toBe('new');
  });
  it('orders older/newer writes and serializes the shared key across workbench identities', async () => {
    const {bridge,sdk,values} = host();
    const write = deferred<void>(), started = deferred<void>();
    vi.mocked(sdk.storage!.set).mockImplementationOnce(async (key,value) => { const snapshot=structuredClone(value);started.resolve();await write.promise;values.set(key,snapshot); });
    const older = saveDraft(bridge, 'old', 'old.json');
    await started.promise;
    const newer = saveDraft(new Bridge(sdk), 'new', 'new.json');
    const other = saveDraft(new Bridge(sdk,'two'), 'second workbench', 'two.json');
    expect(sdk.storage!.get).toHaveBeenCalledTimes(1);
    write.resolve();
    expect(await older).toBe(false);
    expect(await newer).toBe(true);
    expect(await other).toBe(true);
    expect((await readDraft(bridge))?.text).toBe('new');
    expect((await readDraft(new Bridge(sdk,'two')))?.text).toBe('second workbench');
  });
  it('recovers draft mutation ordering after both read and write failures', async () => {
    const {bridge,sdk} = host();
    vi.mocked(sdk.storage!.get).mockRejectedValueOnce(new Error('read failed'));
    await expect(saveDraft(bridge,'old','old.json')).rejects.toThrow('read failed');
    vi.mocked(sdk.storage!.set).mockRejectedValueOnce(new Error('write failed'));
    await expect(saveDraft(new Bridge(sdk),'bad','bad.json')).rejects.toThrow('write failed');
    await clearDraft(new Bridge(sdk));
    expect(await saveDraft(bridge,'recovered','ok.json')).toBe(true);
    expect((await readDraft(bridge))?.text).toBe('recovered');
  });

});

function deferred<T>() {
  let resolve!: (value:T|PromiseLike<T>) => void;
  const promise = new Promise<T>(done => {resolve=done;});
  return {promise,resolve};
}
