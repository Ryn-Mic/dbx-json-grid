import { compareLosslessNumber, LosslessNumber } from 'lossless-json';
import { childrenOf, getAt, preview, typeOf, type JsonPath, type JsonValue } from './json';

export interface GridCell { key: string; path: JsonPath; value: JsonValue | undefined; missing: boolean }
export interface GridRow { key: string | number; path: JsonPath; value: JsonValue; cells: GridCell[] }
export interface GridModel { columns: string[]; rows: GridRow[] }
export function gridModel(value: JsonValue, path: JsonPath): GridModel {
  const target = getAt(value,path), kind = typeOf(target);
  const entries = kind === 'array' || kind === 'object' ? childrenOf(value,path) : [{key:'value',path:[...path],value:target}];
  const objectArray = kind === 'array' && entries.length > 0 && entries.every(entry => typeOf(entry.value) === 'object');
  const columns: string[] = [];
  if (objectArray) {
    for (const entry of entries) for (const key of Object.keys(entry.value as object)) if (!columns.includes(key)) columns.push(key);
  }
  const fallback = columns.length === 0;
  if (fallback) columns.push('value');
  const rows: GridRow[] = entries.map(entry => {
    const objectRow = objectArray && !fallback;
    return {...entry, cells: columns.map(key => {
      const exists = objectRow ? Object.prototype.hasOwnProperty.call(entry.value,key) : key === 'value';
      return {key,path:objectRow ? [...entry.path,key] : [...entry.path],value:exists ? objectRow ? (entry.value as Record<string,JsonValue>)[key] : entry.value : undefined,missing:!exists};
    })};
  });
  return {columns,rows};
}
export function matchesText(value: JsonValue, query: string): boolean {
  return preview(value).toLocaleLowerCase().includes(query.toLocaleLowerCase());
}
export function compareValues(a: JsonValue, b: JsonValue): number {
  if (typeOf(a) === 'number' && typeOf(b) === 'number') return compareLosslessNumber(new LosslessNumber(String(a)),new LosslessNumber(String(b)));
  return preview(a).localeCompare(preview(b));
}
