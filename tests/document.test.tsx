import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getAt, parseJson, setAt, stringifyJson } from '../src/core/json';
import { historyReducer, useDocument } from '../src/useDocument';
describe('shared document history', () => {
  it('clears previous document and all undo states when a different workbench takes over', () => {
    const { result } = renderHook(() => useDocument('{"private":"one"}'));
    act(() => result.current.edit('{"private":"edited"}'));
    act(() => result.current.reset(''));
    expect(result.current.text).toBe(''); expect(result.current.canUndo).toBe(false); expect(result.current.canRedo).toBe(false);
    act(() => result.current.undo()); expect(result.current.text).toBe('');
  });
  it('preserves exact integers through a structured edit and shared undo/redo', () => {
    const initial = '{"id":9007199254740993,"name":"A"}';
    const { result } = renderHook(() => useDocument(initial));
    act(() => result.current.apply(value => setAt(value, ['name'], 'B')));
    expect(stringifyJson(getAt(result.current.value!, ['id']))).toBe('9007199254740993');
    expect(getAt(result.current.value!, ['name'])).toBe('B');
    act(() => result.current.undo()); expect(result.current.text).toBe(initial);
    act(() => result.current.redo()); expect(getAt(result.current.value!, ['name'])).toBe('B');
  });
  it('keeps invalid source and refuses stale structured edits', () => {
    const { result } = renderHook(() => useDocument('{"a":1}'));
    act(() => result.current.edit('{"a":'));
    expect(result.current.text).toBe('{"a":'); expect(result.current.error).toBeTruthy();
    expect(() => result.current.apply(value => setAt(value, ['a'], parseJson('2')))).toThrow('Fix the JSON');
    act(() => result.current.undo()); expect(result.current.error).toBeNull(); expect(result.current.text).toBe('{"a":1}');
  });
  it('groups typing but separates commands and clears abandoned redo', () => {
    let state = { past: [] as string[], text: '', future: [] as string[], lastTyping: 0 };
    state = historyReducer(state, { type: 'edit', text: '{', typing: true, now: 1000 });
    state = historyReducer(state, { type: 'edit', text: '{}', typing: true, now: 1100 });
    expect(state.past).toEqual(['']);
    state = historyReducer(state, { type: 'edit', text: '{\n}', typing: false, now: 1200 });
    state = historyReducer(state, { type: 'undo' }); expect(state.text).toBe('{}');
    state = historyReducer(state, { type: 'edit', text: '[]', typing: false, now: 1400 });
    expect(state.future).toEqual([]);
  });
});
