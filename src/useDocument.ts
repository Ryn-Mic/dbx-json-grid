import { useMemo, useReducer } from 'react';
import { parseJson, stringifyJson, type JsonValue } from './core/json';

interface History { past: string[]; text: string; future: string[]; lastTyping: number }
type Action = { type: 'edit'; text: string; typing: boolean; now: number } | { type: 'undo' | 'redo' };
const budget = 20 * 1024 * 1024;
function trim(items: string[], current: string) {
  let size = current.length * 2;
  const kept: string[] = [];
  for (let i = items.length - 1; i >= 0 && kept.length < 100; i--) {
    size += items[i].length * 2;
    if (size > budget) break;
    kept.unshift(items[i]);
  }
  return kept;
}
export function historyReducer(state: History, action: Action): History {
  if (action.type === 'edit') {
    if (action.text === state.text) return state;
    const coalesce = action.typing && state.lastTyping > 0 && action.now - state.lastTyping < 600 && !state.future.length;
    return { past: trim(coalesce ? state.past : [...state.past, state.text], action.text), text: action.text, future: [], lastTyping: action.typing ? action.now : 0 };
  }
  if (action.type === 'undo' && state.past.length) {
    const text = state.past.at(-1)!;
    return { past: state.past.slice(0, -1), text, future: trim([state.text, ...state.future].reverse(), text).reverse(), lastTyping: 0 };
  }
  if (action.type === 'redo' && state.future.length) {
    const text = state.future[0];
    return { past: trim([...state.past, state.text], text), text, future: state.future.slice(1), lastTyping: 0 };
  }
  return state;
}
export function useDocument(initial: string) {
  const [history, dispatch] = useReducer(historyReducer, { text: initial, past: [], future: [], lastTyping: 0 });
  const parsed = useMemo(() => {
    if (!history.text.trim()) return { value: undefined, error: null };
    try { return { value: parseJson(history.text), error: null }; }
    catch (error) { return { value: undefined, error: error instanceof Error ? error.message : String(error) }; }
  }, [history.text]);
  return {
    ...parsed, text: history.text, canUndo: !!history.past.length, canRedo: !!history.future.length,
    edit: (text: string, typing = false) => dispatch({ type: 'edit', text, typing, now: Date.now() }),
    apply: (fn: (value: JsonValue) => JsonValue) => {
      if (parsed.value === undefined) throw new Error('Fix the JSON source before editing.');
      dispatch({ type: 'edit', text: stringifyJson(fn(parsed.value), 2), typing: false, now: Date.now() });
    },
    undo: () => dispatch({ type: 'undo' }), redo: () => dispatch({ type: 'redo' }),
  };
}
