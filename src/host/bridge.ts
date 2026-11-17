export type Locale = 'en' | 'zh-CN';
export type Appearance = 'light' | 'dark';
type FileHandle = { handleId: string; name: string; size: number };
type FileTransfer = {
  pick(options: { multiple: boolean }): Promise<{ files: FileHandle[] }>;
  read(id: string, offset: number, length: number): Promise<{ dataBase64: string; length: number; eof: boolean }>;
  cancel(id: string): Promise<unknown>;
  beginSave(options: { name: string; contentType: string; size: number }): Promise<{ handleId: string; chunkBytes?: number } | null>;
  write(id: string, offset: number, data: Uint8Array): Promise<{ written: number; nextOffset: number }>;
  finish(id: string): Promise<unknown>;
  onDrop?(fn: (files: FileHandle[], info?: { truncated?: boolean }) => void): () => void;
};
export interface HostPlugin {
  ready: Promise<unknown>;
  locale?: string;
  theme?: { appearance?: Appearance };
  context?: Record<string, unknown>;
  capabilities?: { storage?: boolean; clipboardRead?: boolean; clipboardWrite?: boolean; fileTransfer?: { pick?: boolean; read?: boolean; beginSave?: boolean; drop?: boolean } };
  copy(text: string): Promise<unknown>;
  clipboard?: { readText(): Promise<string> };
  storage?: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<unknown>; delete(key: string): Promise<unknown> };
  fileTransfer?: FileTransfer;
  onContext?(listener: (context: Record<string, unknown>) => void): () => void;
}
declare global { interface Window { dbxPlugin?: HostPlugin } }
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const encoder = new TextEncoder();
export const byteSize = (text: string) => encoder.encode(text).byteLength;

export class Bridge {
  readonly instanceId: string;
  constructor(readonly host?: HostPlugin, instanceId?: string) { this.instanceId = instanceId ?? String(host?.context?.workbenchId ?? 'preview'); }
  get embedded() { return !!this.host; }
  get locale(): Locale { return this.host?.locale?.startsWith('zh') ? 'zh-CN' : this.host ? 'en' : 'zh-CN'; }
  get appearance(): Appearance { return this.host?.theme?.appearance ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
  // copy is part of the original Host API 1 SDK, which had no capabilities object.
  get canCopy() { return this.host ? typeof this.host.copy === 'function' && (this.host.capabilities ? !!this.host.capabilities.clipboardWrite : true) : !!navigator.clipboard?.writeText; }
  get canPaste() { return this.host ? !!this.host.capabilities?.clipboardRead : !!navigator.clipboard?.readText; }
  get canStore() { return this.host ? !!(this.host.capabilities?.storage && this.host.storage) : true; }
  get canOpenNative() { const c = this.host?.capabilities?.fileTransfer; return !!(c?.pick && c.read && this.host?.fileTransfer); }
  get canSave() { return this.host ? !!(this.host.capabilities?.fileTransfer?.beginSave && this.host.fileTransfer) : true; }
  async copy(text: string) {
    if (!this.canCopy) throw new Error('Clipboard writing is unavailable.');
    if (this.host) await this.host.copy(text); else await navigator.clipboard.writeText(text);
  }
  async paste() {
    if (!this.canPaste) throw new Error('Use Ctrl/Cmd+V in the source editor.');
    return this.host ? this.host.clipboard!.readText() : navigator.clipboard.readText();
  }
  async readHandle(file: FileHandle) {
    const ft = this.host!.fileTransfer!;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('File exceeds 10 MiB.');
      const parts: Uint8Array[] = [];
      let offset = 0;
      for (;;) {
        const chunk = await ft.read(file.handleId, offset, 256 * 1024);
        const data = Uint8Array.from(atob(chunk.dataBase64), c => c.charCodeAt(0));
        if (data.length !== chunk.length || (!chunk.eof && data.length === 0)) throw new Error('Invalid file transfer chunk.');
        offset += data.length;
        if (offset > MAX_FILE_BYTES) throw new Error('File exceeds 10 MiB.');
        parts.push(data);
        if (chunk.eof) break;
      }
      const bytes = new Uint8Array(offset);
      let at = 0;
      for (const part of parts) { bytes.set(part, at); at += part.length; }
      return { name: file.name, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '') };
    } finally { await ft.cancel(file.handleId).catch(() => undefined); }
  }
  async open() {
    if (!this.canOpenNative) return null;
    const { files } = await this.host!.fileTransfer!.pick({ multiple: false });
    const first = files[0];
    for (const extra of files.slice(1)) await this.host!.fileTransfer!.cancel(extra.handleId).catch(() => undefined);
    return first ? this.readHandle(first) : null;
  }
  async save(name: string, text: string) {
    if (!this.canSave) throw new Error('File saving is unavailable. Copy the JSON instead.');
    const bytes = encoder.encode(text);
    if (this.host) {
      const ft = this.host.fileTransfer!;
      const target = await ft.beginSave({ name, contentType: 'application/json', size: bytes.length });
      if (!target) return false;
      let finished = false;
      try {
        const length = Math.max(1, Math.min(target.chunkBytes ?? 256 * 1024, 256 * 1024));
        for (let offset = 0; offset < bytes.length;) {
          const chunk = bytes.subarray(offset, offset + length);
          const result = await ft.write(target.handleId, offset, chunk);
          if (result.written !== chunk.length || result.nextOffset !== offset + chunk.length) throw new Error('Incomplete file write.');
          offset = result.nextOffset;
        }
        await ft.finish(target.handleId); finished = true;
        return true;
      } finally { if (!finished) await ft.cancel(target.handleId).catch(() => undefined); }
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  async getState<T>(key: string): Promise<T | null> {
    if (this.host) return this.host.capabilities?.storage && this.host.storage ? await this.host.storage.get(key) as T | null : null;
    try { return JSON.parse(localStorage.getItem(`json-grid.${key}`) ?? 'null') as T | null; } catch { return null; }
  }
  async putState(key: string, value: unknown) {
    if (this.host) {
      if (!this.host.capabilities?.storage || !this.host.storage) throw new Error('State storage is unavailable.');
      await this.host.storage.set(key, value);
    } else localStorage.setItem(`json-grid.${key}`, JSON.stringify(value));
  }
  onDrop(listener: (file: { name: string; text: string }) => void, onError: (error: unknown) => void) {
    if (!this.host?.capabilities?.fileTransfer?.drop || !this.host.fileTransfer?.onDrop) return () => {};
    return this.host.fileTransfer.onDrop((files, info) => {
      for (const extra of files.slice(1)) void this.host!.fileTransfer!.cancel(extra.handleId).catch(onError);
      if (info?.truncated) onError(new Error('Drop was truncated. Open one JSON file at a time.'));
      if (files[0]) void this.readHandle(files[0]).then(listener, onError);
    });
  }
}

export async function createBridge() {
  const host = window.dbxPlugin;
  if (host) await host.ready;
  return new Bridge(host);
}

type Draft = { text: string; name: string; updated: number };
type Drafts = Record<string, Draft>;
export async function saveDraft(bridge: Bridge, text: string, name: string) {
  const drafts = await bridge.getState<Drafts>('drafts.v1') ?? {};
  if (byteSize(text) > 96 * 1024) {
    delete drafts[bridge.instanceId];
    await bridge.putState('drafts.v1', drafts);
    return false;
  }
  const entries = Object.entries(drafts).filter(([id]) => id !== bridge.instanceId).sort((a, b) => b[1].updated - a[1].updated).slice(0, 1);
  const next = Object.fromEntries(entries) as Drafts;
  Object.defineProperty(next, bridge.instanceId, { enumerable: true, configurable: true, writable: true, value: { text, name, updated: Date.now() } });
  if (byteSize(JSON.stringify(next)) > 240 * 1024) {
    for (const id of Object.keys(next)) if (id !== bridge.instanceId) delete next[id];
  }
  if (byteSize(JSON.stringify(next)) > 240 * 1024) return false;
  await bridge.putState('drafts.v1', next);
  return true;
}
export async function clearDraft(bridge: Bridge) {
  const drafts = await bridge.getState<Drafts>('drafts.v1') ?? {};
  delete drafts[bridge.instanceId];
  await bridge.putState('drafts.v1', drafts);
}
export async function readDraft(bridge: Bridge) {
  const drafts = await bridge.getState<Drafts>('drafts.v1');
  const draft = drafts && Object.prototype.hasOwnProperty.call(drafts, bridge.instanceId) ? drafts[bridge.instanceId] : null;
  return draft && typeof draft.text === 'string' && byteSize(draft.text) <= 96 * 1024 ? draft : null;
}
