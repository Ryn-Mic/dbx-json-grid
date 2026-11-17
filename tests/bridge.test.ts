import { describe, expect, it, vi } from 'vitest';
import { Bridge, byteSize, readDraft, saveDraft, type HostPlugin } from '../src/host/bridge';

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
    expect(await saveDraft(bridge, '\\'.repeat(95 * 1024), 'b.json')).toBe(true);
    expect(byteSize(JSON.stringify(values.get('drafts.v1')))).toBeLessThan(256 * 1024);
    expect((await readDraft(bridge))?.name).toBe('b.json');
    sdk.context = { workbenchId: 'three' }; expect(await readDraft(bridge)).toBeNull();
  });
  it('removes a stale small draft when current input exceeds draft capacity', async () => {
    const { bridge } = host(); await saveDraft(bridge, '{}', 'a.json');
    expect(await saveDraft(bridge, 'x'.repeat(97 * 1024), 'a.json')).toBe(false);
    expect(await readDraft(bridge)).toBeNull();
  });
});
