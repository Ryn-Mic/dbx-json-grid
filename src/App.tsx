import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { EditorView } from '@codemirror/view';
import { ArrowDown, ArrowUp, Braces, Check, ChevronRight, ChevronsDownUp, ChevronsUpDown, ClipboardPaste, Copy, Download, FileJson, FolderOpen, Grid2X2, ListTree, Maximize2, Minimize2, Moon, MoreHorizontal, Plus, Redo2, Search, ShieldCheck, SlidersHorizontal, Sun, Undo2, X } from 'lucide-react';
import { formatPath, getAt, insertAt, parseJson, removeAt, renameAt, renameColumn, setAt, stringifyJson, typeOf, type JsonPath, type JsonValue } from './core/json';
import { Bridge, byteSize, clearDraft, createBridge, MAX_FILE_BYTES, readDraft, saveDraft, type Appearance, type Locale } from './host/bridge';
import { ViewPanels } from './components/ViewPanels';
import { useViewSession } from './useViewSession';
import type { NodeAction, ViewProps } from './components/types';
import { labels } from './labels';
import { SAMPLE } from './sample';
import { useDocument } from './useDocument';
import { ResizeHandle } from './components/ResizeHandle';
import { parseSource, sourceRange } from './core/source';
import { highlightSource, sourceHighlight } from './sourceHighlight';

type Kind = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
type Modal = { mode: 'edit' | 'add' | 'rename' | 'delete'; path: JsonPath; kind: Kind; key: string; text: string };
type Preferences = { split?: number; draft?: boolean; fontSize?: number };
const kinds: Kind[] = ['string', 'number', 'boolean', 'null', 'object', 'array'];
const defaults: Record<Kind, string> = { string: '', number: '0', boolean: 'true', null: 'null', object: '{}', array: '[]' };
const iconsize = 15;
function IconButton({ label, children, active, ...props }: { label: string; children: ReactNode; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`icon-button ${active ? 'active' : ''} ${props.className ?? ''}`} title={label} aria-label={label}>{children}</button>;
}
function displayBytes(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`; }

export function App() {
  const doc = useDocument(SAMPLE);
  const value = doc.value;
  const [bridge, setBridge] = useState<Bridge | null>(null);
  const [locale, setLocale] = useState<Locale>('zh-CN');
  const [appearance, setAppearance] = useState<Appearance>('light');
  const [name, setName] = useState('orders.json');
  const [tab, setTab] = useState<'grid' | 'tree'>('grid');
  const gridSession = useViewSession(value), treeSession = useViewSession(value);
  const session = tab === 'grid' ? gridSession : treeSession;
  const { selected, setSelected, selectionActive, selectionVersion, select, query, setQuery, filter, setFilter, matches, activeIndex, chooseMatch, expansion, expand } = session;
  const [viewEpoch, setViewEpoch] = useState(0);
  const lastScrolledSelection = useRef('');
  const [layout, setLayout] = useState<'split' | 'source' | 'view'>('split');
  const [split, setSplit] = useState(37);
  const [fontSize, setFontSize] = useState(13);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftStatus, setDraftStatus] = useState('draftOff');
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [modalError, setModalError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [bootError, setBootError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const workbench = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Epochs distinguish even one → two → one identity cycles while I/O is pending.
  const importEpoch = useRef(0);
  const activeIdentity = useRef<string | null>(null);
  const filePickerEpoch = useRef(0);
  const draftIntent = useRef(0);
  const pendingContext = useRef<{ id: string; newQuery: boolean; epoch: number } | null>(null);
  const t = labels(locale);
  const notify = useCallback((message: string) => {
    setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 5000);
  }, []);
  const error = useCallback((cause: unknown) => notify(cause instanceof Error ? cause.message : String(cause)), [notify]);
  const resetLocation = () => { gridSession.reset(); treeSession.reset(); setViewEpoch(epoch => epoch + 1); };
  const load = (file: { name: string; text: string }, epoch = importEpoch.current) => {
    if (epoch !== importEpoch.current) return;
    doc.edit(file.text); setName(file.name); setModal(null); resetLocation();
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const next = await createBridge();
      const prefs = await next.getState<Preferences>('preferences.v1').catch(() => null);
      const saved = prefs?.draft && !next.host?.context?.newQuery ? await readDraft(next).catch(() => null) : null;
      if (!live) return;
      setLocale(next.locale); setAppearance(next.appearance);
      if (prefs?.split && prefs.split >= 20 && prefs.split <= 80) setSplit(prefs.split);
      if (prefs?.fontSize && prefs.fontSize >= 11 && prefs.fontSize <= 20) setFontSize(prefs.fontSize);
      setDraftEnabled(prefs?.draft === true);
      if (saved) { doc.edit(saved.text); setName(saved.name); }
      activeIdentity.current = next.instanceId;
      setBridge(next);
    })().catch(cause => { if (live) setBootError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { live = false; clearTimeout(toastTimer.current); };
    // Initialization owns the initial source; subsequent typing must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    document.documentElement.lang = locale;
  }, [appearance, locale]);
  useEffect(() => {
    if (!bridge) return;
    const update = () => { setLocale(bridge.locale); setAppearance(bridge.appearance); };
    window.addEventListener('dbx-plugin-env', update);
    return () => window.removeEventListener('dbx-plugin-env', update);
  }, [bridge]);
  useEffect(() => {
    if (!bridge?.host?.onContext) return;
    return bridge.host.onContext(context => {
      const id = String(context.workbenchId ?? activeIdentity.current ?? bridge.instanceId);
      if (id === activeIdentity.current) return; // Ordinary invocation updates preserve this instance's edits.
      activeIdentity.current = id;
      const epoch = ++importEpoch.current;
      pendingContext.current = { id, newQuery: context.newQuery === true, epoch };
      clearTimeout(toastTimer.current); setToast('');
      setBusy(true); setModal(null); doc.reset(''); setName(t.untitled); resetLocation();
      setBridge(new Bridge(bridge.host, id));
    });
  }, [bridge]);
  useEffect(() => {
    const pending = pendingContext.current;
    if (!bridge || !pending || pending.id !== bridge.instanceId || pending.epoch !== importEpoch.current) return;
    pendingContext.current = null;
    let live = true;
    void (async () => {
      const saved = draftEnabled && !pending.newQuery ? await readDraft(bridge) : null;
      if (!live || pending.epoch !== importEpoch.current) return;
      if (saved) { doc.reset(saved.text); setName(saved.name); }
      setBusy(false);
    })().catch(cause => { if (live && pending.epoch === importEpoch.current) { error(cause); setBusy(false); } });
    return () => { live = false; };
  }, [bridge]);
  useEffect(() => {
    if (!bridge?.canStore) return;
    const epoch = importEpoch.current;
    const timer = setTimeout(() => { void bridge.putState('preferences.v1', { split, draft: draftEnabled, fontSize }).catch(cause => { if (epoch === importEpoch.current) error(cause); }); }, 300);
    return () => clearTimeout(timer);
  }, [bridge, split, draftEnabled, fontSize, error]);
  useEffect(() => {
    if (!bridge || !draftEnabled) { setDraftStatus('draftOff'); return; }
    if (busy) return;
    const epoch = importEpoch.current;
    const intent = draftIntent.current;
    let live = true;
    const current = () => live && epoch === importEpoch.current && intent === draftIntent.current;
    const timer = setTimeout(() => {
      if (!current()) return;
      void saveDraft(bridge, doc.text, name).then(ok => { if (current()) setDraftStatus(ok ? 'draftSaved' : 'draftLarge'); }, () => { if (current()) setDraftStatus('draftError'); });
    }, 800);
    return () => { live = false; clearTimeout(timer); };
  }, [bridge, draftEnabled, doc.text, name, busy]);
  useEffect(() => {
    const epoch = importEpoch.current;
    return bridge?.onDrop(file => load(file, epoch), cause => { if (epoch === importEpoch.current) error(cause); });
  }, [bridge, error]);
  const selectedValue = useMemo(() => {
    if (value === undefined) return undefined;
    try { return getAt(value, selected); } catch { return value; }
  }, [value, selected]);
  const structured = value !== undefined;
  const run = (operation: () => void | Promise<unknown>) => {
    const epoch = importEpoch.current;
    const currentError = (cause: unknown) => { if (epoch === importEpoch.current) error(cause); };
    try { const result = operation(); if (result instanceof Promise) void result.catch(currentError); } catch (cause) { currentError(cause); }
  };
  const action = (kind: NodeAction, path: JsonPath) => run(async () => {
    const epoch = importEpoch.current;
    if (value === undefined) return;
    const target = getAt(value, path);
    select(path);
    if (kind.startsWith('copy')) {
      const text = kind === 'copy-path' ? formatPath(path) : kind === 'copy-key' ? String(path.at(-1) ?? '$') : stringifyJson(target, 2);
      await bridge?.copy(text); if (epoch === importEpoch.current) notify(t.copied); return;
    }
    const nodeKind = typeOf(target) as Kind;
    setModalError('');
    if (kind === 'rename' && (!path.length || typeof path.at(-1) !== 'string')) return;
    if (kind === 'delete' && !path.length) return;
    if (kind === 'add' && nodeKind !== 'array' && nodeKind !== 'object') return;
    setModal({ mode: kind as Modal['mode'], path, kind: kind === 'add' ? 'string' : nodeKind, key: kind === 'add' ? Array.isArray(target) ? String(target.length) : '' : String(path.at(-1) ?? ''), text: kind === 'add' ? '' : typeof target === 'string' ? target : stringifyJson(target, 2) });
  });
  const requestEdit = (path: JsonPath) => {
    if (value === undefined) return;
    const target = getAt(value, path);
    setModalError(''); select(path);
    setModal({ mode: 'edit', path, kind: typeOf(target) as Kind, key: '', text: typeof target === 'string' ? target : stringifyJson(target, 2) });
  };
  const applyModal = () => {
    if (!modal) return;
    try {
      if (modal.mode === 'delete') { doc.apply(current => removeAt(current, modal.path)); setSelected(modal.path.slice(0, -1)); }
      else if (modal.mode === 'rename') { doc.apply(current => renameAt(current, modal.path, modal.key)); setSelected([...modal.path.slice(0, -1), modal.key]); }
      else {
        const next: JsonValue = modal.kind === 'string' ? modal.text : parseJson(modal.text);
        if (typeOf(next) !== modal.kind) throw new Error(locale === 'zh-CN' ? `值必须为 ${modal.kind} 类型` : `Expected a ${modal.kind} value`);
        if (modal.mode === 'add') {
          const parent = getAt(value!, modal.path);
          const key = Array.isArray(parent) ? /^(0|[1-9]\d*)$/.test(modal.key) ? Number(modal.key) : NaN : modal.key;
          doc.apply(current => insertAt(current, modal.path, key, next)); setSelected([...modal.path, key]);
        } else doc.apply(current => setAt(current, modal.path, next));
      }
      setModal(null);
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const exportJSON = async (node = false) => {
    if (value === undefined || !bridge) return;
    const epoch = importEpoch.current;
    setBusy(true);
    try { if (await bridge.save(node ? 'selection.json' : name, stringifyJson(node ? getAt(value, selected) : value, 2)) && epoch === importEpoch.current) notify(t.exported); }
    finally { if (epoch === importEpoch.current) setBusy(false); }
  };
  const openFile = async () => {
    if (!bridge) return;
    const epoch = importEpoch.current;
    if (!bridge.canOpenNative) { filePickerEpoch.current = epoch; fileInput.current?.click(); return; }
    setBusy(true);
    try { const file = await bridge.open(); if (file) load(file, epoch); }
    finally { if (epoch === importEpoch.current) setBusy(false); }
  };
  const paste = async () => {
    if (!bridge) return;
    const epoch = importEpoch.current;
    const text = await bridge.paste();
    load({ name: t.untitled, text }, epoch);
  };
  const fromFile = async (file?: File, epoch = importEpoch.current) => {
    if (!file || epoch !== importEpoch.current) return;
    if (file.size > MAX_FILE_BYTES) throw new Error(t.onlyJSON);
    const bytes = await file.arrayBuffer();
    if (epoch === importEpoch.current) load({ name: file.name, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '') }, epoch);
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (modal) {
        if (event.key === 'Escape') setModal(null);
        if (event.key === 'Tab') {
          const items = Array.from(document.querySelectorAll<HTMLElement>('.modal button:not(:disabled), .modal input:not(:disabled), .modal textarea, .modal select'));
          const first = items[0], last = items.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
        return;
      }
      if (event.key === 'Escape') setMenu(false);
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); searchInput.current?.focus(); searchInput.current?.select(); }
      if (event.key.toLowerCase() === 's') { event.preventDefault(); run(() => exportJSON()); }
      const target = event.target as HTMLElement;
      if (target.closest('input,select,textarea') && !target.closest('.cm-editor')) return;
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) doc.redo(); else doc.undo(); }
    };
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true);
  });
  const editorExtensions = useMemo(() => [json(), sourceHighlight, EditorView.lineWrapping, EditorView.theme({ '&': { fontSize: `${fontSize}px`, backgroundColor: 'transparent' }, '.cm-scroller': { fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)' }, '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--jg-muted)' }, '.cm-content': { padding: '16px 0' } })], [fontSize]);
  const sourceTree = useMemo(() => value === undefined ? null : parseSource(doc.text), [doc.text, value]);
  const selectedRange = useMemo(() => selectionActive ? sourceRange(doc.text, sourceTree, selected) : null, [doc.text, sourceTree, selected, selectionActive]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.state.doc.toString() !== doc.text) return;
    const token = `${tab}:${selectionVersion}`;
    const scroll = token !== lastScrolledSelection.current;
    lastScrolledSelection.current = token;
    editor.dispatch({ effects: [highlightSource.of(selectedRange), ...(scroll && selectedRange ? [EditorView.scrollIntoView(selectedRange.from, { y: 'nearest' })] : [])] });
  }, [selectedRange, doc.text, selectionVersion, tab]);
  const rename = (path: JsonPath, key: string, column?: string) => {
    doc.apply(current => column === undefined ? renameAt(current, path, key) : renameColumn(current, path, column, key));
    if (column === undefined) select([...path.slice(0, -1), key]);
    else if (path.every((part, index) => selected[index] === part) && selected[path.length + 1] === column) {
      select([...selected.slice(0, path.length + 1), key, ...selected.slice(path.length + 2)]);
    }
  };
  const viewProps = (view: ReturnType<typeof useViewSession>, active: boolean): Omit<ViewProps, 'value'> => ({ revision: doc.text, path: [], selected: view.selected, onSelect: view.select, onEdit: requestEdit, onRename: rename, onCommit: (path, next) => run(() => doc.apply(current => setAt(current, path, next))), onAction: action, query: view.query, filter: view.filter, expansion: view.expansion, expansionVersion: view.expansionVersion, disabled: !bridge || busy || !structured || !active, active: active && structured, locale });

  return <div className={`app ${dragging ? 'resizing' : ''}`}>
    <header className="app-header">
      <div className="brand-mark"><Grid2X2 size={20} strokeWidth={1.8} /></div>
      <div className="brand"><strong>JSON Grid</strong><span>{t.changes}</span></div>
      <span className="privacy-label"><ShieldCheck size={13} />{t.local}</span>
      <div className="header-actions">
        <IconButton label={t.language} onClick={() => setLocale(current => current === 'zh-CN' ? 'en' : 'zh-CN')}><span className="locale-label">{locale === 'zh-CN' ? '中' : 'EN'}</span></IconButton>
        {!bridge?.embedded && <IconButton label={t.theme} onClick={() => setAppearance(current => current === 'light' ? 'dark' : 'light')}>{appearance === 'light' ? <Moon size={iconsize} /> : <Sun size={iconsize} />}</IconButton>}
      </div>
    </header>

    <div className="document-toolbar">
      <div className="filename"><FileJson size={16} /><span>{name}</span><span className="file-badge">JSON</span></div>
      <div className="file-actions">
        <button className="text-button" onClick={() => run(openFile)} disabled={!bridge || busy}><FolderOpen size={15} /><span>{t.open}</span></button>
        <button className="text-button" onClick={() => run(paste)} disabled={!bridge?.canPaste || busy}><ClipboardPaste size={15} /><span>{t.paste}</span></button>
        <div className="toolbar-divider" />
        <IconButton label={t.undo} disabled={!doc.canUndo || busy} onClick={doc.undo}><Undo2 size={15} /></IconButton>
        <IconButton label={t.redo} disabled={!doc.canRedo || busy} onClick={doc.redo}><Redo2 size={15} /></IconButton>
        <div className="toolbar-divider" />
        <button className="primary-button" onClick={() => run(() => exportJSON())} disabled={!structured || !bridge?.canSave || busy}><Download size={14} /><span>{t.save}</span></button>
        <div className="menu-anchor">
          <IconButton label={t.tools} active={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={18} /></IconButton>
          {menu && <><div className="menu-scrim" onClick={() => setMenu(false)} /><div className="dropdown tools-menu">
            <button disabled={!structured} onClick={() => { run(() => doc.edit(JSON.stringify(stringifyJson(value!, 2)))); setMenu(false); }}>{t.toString}</button>
            <button disabled={typeOf(value ?? null) !== 'string'} onClick={() => { run(() => doc.edit(stringifyJson(parseJson(value as string), 2))); setMenu(false); }}>{t.fromString}</button>
            <button disabled={!structured || !bridge?.canSave} onClick={() => { run(() => exportJSON(true)); setMenu(false); }}>{t.exportNode}</button>
            <div className="dropdown-divider" />
            <button onClick={() => { load({ name: 'orders.json', text: SAMPLE }); setMenu(false); }}>{t.sample}</button>
            <button onClick={() => { load({ name: t.untitled, text: '' }); setMenu(false); }}>{t.clear}</button>
            <div className="dropdown-divider" />
            <label className="menu-check"><input type="checkbox" checked={draftEnabled} disabled={!bridge?.canStore} onChange={event => { draftIntent.current++; setDraftEnabled(event.target.checked); if (!event.target.checked) { setDraftStatus('draftOff'); if (bridge) run(() => clearDraft(bridge)); } }} />{t.draft}</label>
            <p className="menu-hint">{t.draftInfo}</p>
            <button onClick={() => { draftIntent.current++; setDraftEnabled(false); setDraftStatus('draftOff'); setMenu(false); if (bridge) run(() => clearDraft(bridge)); }}>{t.clearDraft}</button>
            <label className="font-control">{t.fontSize}<input type="number" min="11" max="20" value={fontSize} onChange={event => setFontSize(Math.max(11, Math.min(20, Number(event.target.value) || 13)))} /></label>
          </div></>}
        </div>
      </div>
    </div>

    <main className={`workbench layout-${layout}`} ref={workbench} style={{ '--split': `${split}%` } as React.CSSProperties} onDragOver={event => { if (!bridge?.embedded) { event.preventDefault(); } }} onDrop={event => { if (!bridge?.embedded) { event.preventDefault(); run(() => fromFile(event.dataTransfer.files[0])); } }}>
      <section className="source-pane" aria-label={t.source}>
        <div className="pane-header"><div className="pane-title"><Braces size={14} />{t.source}<span className="source-label">JSON</span></div>
          <div className="pane-actions"><button className="subtle-button" disabled={!structured} onClick={() => run(() => doc.edit(stringifyJson(value!, 2)))}>{t.format}</button><button className="subtle-button" disabled={!structured} onClick={() => run(() => doc.edit(stringifyJson(value!)))}>{t.minify}</button><IconButton label={layout === 'source' ? t.split : t.focusSource} onClick={() => setLayout(layout === 'source' ? 'split' : 'source')}>{layout === 'source' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</IconButton></div>
        </div>
        <div className="editor-wrap"><CodeMirror value={doc.text} readOnly={busy} height="100%" theme={appearance} extensions={editorExtensions} basicSetup={{ history: false, foldGutter: true, highlightActiveLine: true, autocompletion: false }} onChange={text => doc.edit(text, true)} onCreateEditor={view => { editorRef.current = view; }} aria-label={t.source} /></div>
        <div className={`source-status ${doc.error ? 'invalid' : ''}`}><span>{doc.error ? <X size={12} /> : <Check size={12} />}{doc.error ? t.invalid : structured ? t.valid : 'JSON'}</span><span>{doc.text.split('\n').length} {t.lines}</span></div>
        {doc.error && <div className="parse-error" role="alert">{doc.error}</div>}
      </section>

      <ResizeHandle className="resize-handle" label={t.split} value={split} min={20} max={80} step={2} onChange={setSplit} onDragging={setDragging} onDoubleClick={() => setSplit(37)} axis={() => window.innerWidth <= 640 ? 'y' : 'x'} scale={() => { const rect = workbench.current!.getBoundingClientRect(); return (window.innerWidth <= 640 ? rect.height : rect.width) / 100; }} />

      <section className="view-pane" aria-label={t.schema}>
        <div className="pane-header view-header"><div className="view-tabs" role="tablist"><button role="tab" id="grid-tab" aria-controls="grid-panel" aria-selected={tab === 'grid'} onClick={() => setTab('grid')}><Grid2X2 size={14} />{t.grid}</button><button role="tab" id="tree-tab" aria-controls="tree-panel" aria-selected={tab === 'tree'} onClick={() => setTab('tree')}><ListTree size={15} />{t.tree}</button></div><div className="pane-actions"><IconButton label={t.expand} onClick={() => expand('all')} disabled={!structured}><ChevronsUpDown size={14} /></IconButton><IconButton label={t.collapse} onClick={() => expand('none')} disabled={!structured}><ChevronsDownUp size={14} /></IconButton><select className="depth-select" aria-label={t.depth} value={typeof expansion === 'number' ? String(expansion) : ''} onChange={event => { if (event.target.value) expand(Number(event.target.value)); }}><option value="">{t.depth}</option>{[1, 2, 3, 4].map(depth => <option value={depth} key={depth}>{depth}</option>)}</select><IconButton label={layout === 'view' ? t.split : t.focusView} onClick={() => setLayout(layout === 'view' ? 'split' : 'view')}>{layout === 'view' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</IconButton></div></div>
        <div className="search-toolbar"><div className="search-field"><Search size={14} /><input ref={searchInput} placeholder={t.search} aria-label={t.search} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') chooseMatch(event.shiftKey ? -1 : 1); if (event.key === 'Escape') setQuery(''); }} />{query && <><span className="match-count">{matches.length ? `${activeIndex + 1}/${matches.length}` : '0/0'}</span><IconButton label={t.previous} disabled={!matches.length} onClick={() => chooseMatch(-1)}><ArrowUp size={12} /></IconButton><IconButton label={t.next} disabled={!matches.length} onClick={() => chooseMatch(1)}><ArrowDown size={12} /></IconButton><IconButton label={t.close} onClick={() => setQuery('')}><X size={12} /></IconButton></>}</div><IconButton label={t.filter} active={filter} onClick={() => setFilter(!filter)}><SlidersHorizontal size={15} /></IconButton></div>
        <nav className="breadcrumbs" aria-label="JSONPath"><button onClick={() => select([])}><Braces size={12} /><span>$</span></button>{selected.map((key, index) => <span className="crumb" key={index}><ChevronRight size={11} /><button onClick={() => select(selected.slice(0, index + 1))}>{String(key)}</button></span>)}<span className="view-hint">{t.help}</span></nav>
        <div className="view-content"><ViewPanels key={viewEpoch} value={value} tab={tab} grid={viewProps(gridSession, tab === 'grid')} tree={viewProps(treeSession, tab === 'tree')}><div className="empty-state"><div className="empty-icon"><Braces size={32} /></div><h2>{doc.error ? t.invalid : t.empty}</h2><p>{doc.error ?? t.onlyJSON}</p>{!doc.error && <button className="text-button" onClick={() => load({ name: 'orders.json', text: SAMPLE })}>{t.sample}<ChevronRight size={14} /></button>}</div></ViewPanels></div>
        <div className="selection-bar"><span className={`type-dot type-${selectedValue === undefined ? 'null' : typeOf(selectedValue)}`} /><span className="node-type">{selectedValue === undefined ? '—' : typeOf(selectedValue)}</span><code title={formatPath(selected)}>{formatPath(selected)}</code><div className="selection-actions"><IconButton label={t.copyPath} disabled={!structured || !bridge?.canCopy} onClick={() => action('copy-path', selected)}><Copy size={13} /></IconButton><IconButton label={t.edit} disabled={!structured || busy} onClick={() => requestEdit(selected)}><Braces size={13} /></IconButton><IconButton label={t.add} disabled={!structured || !['object', 'array'].includes(typeOf(selectedValue ?? null))} onClick={() => action('add', selected)}><Plus size={14} /></IconButton></div></div>
      </section>
    </main>
    <footer className="app-footer"><span><span className={`status-dot ${doc.error ? 'error' : ''}`} />{doc.error ? 'JSON ERROR' : 'JSON'}</span><span>{displayBytes(byteSize(doc.text))}</span><span>{draftEnabled ? t[draftStatus as 'draftSaved'] : t.draftOff}</span><span className="footer-right">{bridge?.embedded ? 'DBX' : 'JSON Grid'}<span>v0.2.2</span></span></footer>
    <input ref={fileInput} type="file" accept="application/json,.json,.txt" hidden onChange={event => { run(() => fromFile(event.target.files?.[0], filePickerEpoch.current)); event.target.value = ''; }} />
    {!bridge && <div className="boot-overlay"><Grid2X2 className="boot-icon" size={28} /><span>{bootError || t.loading}</span>{bootError && <button className="text-button" onClick={() => window.location.reload()}>{locale === 'zh-CN' ? '重新加载' : 'Reload'}</button>}</div>}
    {toast && <div role="status" className="toast"><Check size={15} /><span>{toast}</span><button aria-label={t.close} onClick={() => setToast('')}><X size={13} /></button></div>}
    {modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><form className="modal" role="dialog" aria-modal="true" aria-label={t[modal.mode === 'edit' ? 'edit' : modal.mode]} onSubmit={event => { event.preventDefault(); applyModal(); }}><div className="modal-heading"><h2>{t[modal.mode === 'edit' ? 'edit' : modal.mode]}</h2><IconButton label={t.close} onClick={() => setModal(null)} type="button"><X size={17} /></IconButton></div><code className="modal-path">{formatPath(modal.path)}</code>
      {modal.mode === 'delete' ? <p className="delete-warning">{t.removeWarning}</p> : <>
        {(modal.mode === 'add' || modal.mode === 'rename') && <label className="form-field">{modal.mode === 'add' && Array.isArray(getAt(value!, modal.path)) ? t.index : t.key}<input autoFocus value={modal.key} onChange={event => setModal({ ...modal, key: event.target.value })} /></label>}
        {modal.mode !== 'rename' && <><label className="form-field type-control">{t.type}<select value={modal.kind} onChange={event => { const kind = event.target.value as Kind; setModal({ ...modal, kind, text: defaults[kind] }); }}>{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label><label className="form-field">{t.value}{modal.kind === 'boolean' ? <select value={modal.text} onChange={event => setModal({ ...modal, text: event.target.value })}><option>true</option><option>false</option></select> : modal.kind === 'null' ? <input readOnly value="null" /> : <textarea autoFocus={modal.mode === 'edit'} spellCheck={false} rows={modal.kind === 'object' || modal.kind === 'array' ? 10 : 5} value={modal.text} onChange={event => setModal({ ...modal, text: event.target.value })} />}</label></>}
      </>}
      {modalError && <p className="modal-error" role="alert">{modalError}</p>}<div className="modal-footer"><button className="text-button" type="button" onClick={() => setModal(null)}>{t.cancel}</button><button className={modal.mode === 'delete' ? 'danger-button' : 'primary-button'} type="submit">{modal.mode === 'delete' ? t.delete : t.apply}</button></div></form></div>}
  </div>;
}
