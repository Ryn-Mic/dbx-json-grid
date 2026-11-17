import { childrenOf, getAt, preview, typeOf, type JsonPath, type JsonValue } from './json';

export interface GridCell { key: string; path: JsonPath; value: JsonValue | undefined; missing: boolean }
export interface GridRow { key: string | number; path: JsonPath; value: JsonValue; cells: GridCell[] }
export const MAX_GRID_COLUMNS = 128;
export const MAX_GRID_CELLS = 100_000;
export interface GridModel { columns: string[]; rows: GridRow[]; columnCount: number; notice?: string }
export function gridModel(value: JsonValue, path: JsonPath): GridModel {
  const target = getAt(value,path), kind = typeOf(target);
  const entries = kind === 'array' || kind === 'object' ? childrenOf(value,path) : [{key:'value',path:[...path],value:target}];
  const objectArray = kind === 'array' && entries.length > 0 && entries.every(entry => typeOf(entry.value) === 'object');
  const discovered = new Set<string>();
  if (objectArray) {
    for (const entry of entries) for (const key of Object.keys(entry.value as object)) discovered.add(key);
  }
  const columnCount = objectArray ? discovered.size : 1;
  const exceedsBudget = columnCount > MAX_GRID_COLUMNS || entries.length * columnCount > MAX_GRID_CELLS;
  const fallback = columnCount === 0 || !objectArray || exceedsBudget;
  const columns = fallback ? ['value'] : [...discovered];
  const notice = exceedsBudget ? `Showing complete row values: ${columnCount} fields across ${entries.length} rows exceed the grid display limit.` : undefined;
  const rows: GridRow[] = entries.map(entry => {
    const objectRow = objectArray && !fallback;
    return {...entry, cells: columns.map(key => {
      const exists = objectRow ? Object.prototype.hasOwnProperty.call(entry.value,key) : key === 'value';
      return {key,path:objectRow ? [...entry.path,key] : [...entry.path],value:exists ? objectRow ? (entry.value as Record<string,JsonValue>)[key] : entry.value : undefined,missing:!exists};
    })};
  });
  return {columns,rows,columnCount,notice};
}
export function matchesText(value: JsonValue, query: string): boolean {
  return preview(value).toLocaleLowerCase().includes(query.toLocaleLowerCase());
}
export function compareValues(a: JsonValue, b: JsonValue): number {
  if (typeOf(a) === 'number' && typeOf(b) === 'number') return compareNumbers(String(a), String(b));
  return preview(a).localeCompare(preview(b));
}

interface DecimalParts { sign: number; digits: string; magnitude: bigint }
function decimalParts(lexeme: string): DecimalParts {
  const [coefficient, exponent = '0'] = lexeme.toLowerCase().split('e');
  const negative = coefficient.startsWith('-');
  const unsigned = negative ? coefficient.slice(1) : coefficient;
  const [integer, fraction = ''] = unsigned.split('.');
  const digits = (integer + fraction).replace(/^0+/, '');
  return {
    sign: digits.length === 0 ? 0 : negative ? -1 : 1,
    digits,
    magnitude: BigInt(exponent) + BigInt(digits.length - fraction.length),
  };
}
/** Compare decimal lexemes without rounding their coefficient or exponent. */
function compareNumbers(a: string, b: string): number {
  const left = decimalParts(a), right = decimalParts(b);
  if (left.sign !== right.sign) return left.sign < right.sign ? -1 : 1;
  if (left.sign === 0) return 0;
  if (left.magnitude !== right.magnitude) return (left.magnitude < right.magnitude ? -1 : 1) * left.sign;
  const length = Math.max(left.digits.length, right.digits.length);
  for (let index = 0; index < length; index++) {
    const l = left.digits[index] ?? '0', r = right.digits[index] ?? '0';
    if (l !== r) return (l < r ? -1 : 1) * left.sign;
  }
  return 0;
}
