import { LosslessNumber, isLosslessNumber, parse, stringify } from 'lossless-json';

export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonObject | JsonValue[] | string | number | LosslessNumber | boolean | null;
export type JsonPath = (string | number)[];
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const MAX_DEPTH = 256;
const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);

export function typeOf(value: JsonValue): string {
  return value === null ? 'null' : isLosslessNumber(value) ? 'number' : Array.isArray(value) ? 'array' : typeof value;
}
function container(value: JsonValue): value is JsonObject | JsonValue[] {
  return value !== null && typeof value === 'object' && !isLosslessNumber(value);
}
function validate(value: JsonValue, depth = 0, ancestors = new Set<object>()): void {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('JSON numbers must be finite');
  if (!container(value)) return;
  if (depth >= MAX_DEPTH) throw new Error(`Maximum depth is ${MAX_DEPTH}`);
  if (ancestors.has(value)) throw new Error('Circular JSON value');
  ancestors.add(value);
  for (const child of Object.values(value)) validate(child, depth + 1, ancestors);
  ancestors.delete(value);
}
export function parseJson(text: string): JsonValue {
  if (new TextEncoder().encode(text).byteLength > MAX_INPUT_BYTES) throw new Error('Input exceeds 10 MiB UTF-8 size limit');
  const stack: (Set<string> | null)[] = [];
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      const start = index++;
      while (index < text.length) {
        if (text[index] === '\\') index += 2;
        else if (text[index] === '"') break;
        else index++;
      }
      let next = index + 1;
      while (/\s/.test(text[next] ?? '') && next < text.length) next++;
      const keys = stack.at(-1);
      if (text[next] === ':' && keys) {
        const key = JSON.parse(text.slice(start,index + 1)) as string;
        if (keys.has(key)) throw new SyntaxError(`Duplicate object key: ${key}`);
        keys.add(key);
      }
    } else if (char === '[' || char === '{') {
      stack.push(char === '{' ? new Set<string>() : null);
      if (stack.length > MAX_DEPTH) throw new Error(`Maximum depth is ${MAX_DEPTH}`);
    } else if (char === ']' || char === '}') stack.pop();
  }
  return parse(text, null, { parseNumber: lexeme => new LosslessNumber(lexeme), onDuplicateKey: ({key}) => { throw new SyntaxError(`Duplicate object key: ${key}`); } }) as JsonValue;
}
export function stringifyJson(value: JsonValue, indent = 0): string {
  validate(value);
  return stringify(value, null, indent)!;
}
export function getAt(value: JsonValue, path: JsonPath): JsonValue {
  if (path.length > MAX_DEPTH) throw new Error('Maximum path depth exceeded');
  let current = value;
  for (const key of path) {
    if (!container(current) || !own(current, key) || (Array.isArray(current) && (typeof key !== 'number' || !Number.isInteger(key) || key < 0))) throw new Error('Path does not exist');
    current = (current as JsonObject)[key];
  }
  return current;
}
function copy(value: JsonObject | JsonValue[]): JsonObject | JsonValue[] {
  return Array.isArray(value) ? value.slice() : Object.assign(Object.create(null) as JsonObject, value);
}
function replace(value: JsonValue, path: JsonPath, next: JsonValue): JsonValue {
  if (!path.length) return next;
  const [key, ...rest] = path;
  const child = getAt(value, [key]);
  const result = copy(value as JsonObject | JsonValue[]);
  Object.defineProperty(result, key, {value: replace(child, rest, next), writable:true, enumerable:true, configurable:true});
  return result;
}
export function setAt(value: JsonValue, path: JsonPath, next: JsonValue): JsonValue {
  validate(value); validate(next);
  const result = replace(value, path, next); validate(result); return result;
}
export function removeAt(value: JsonValue, path: JsonPath): JsonValue {
  if (!path.length) throw new Error('Cannot remove the root');
  validate(value);
  getAt(value, path);
  const parentPath = path.slice(0,-1), key = path[path.length-1];
  const parent = copy(getAt(value, parentPath) as JsonObject | JsonValue[]);
  if (Array.isArray(parent)) parent.splice(key as number, 1);
  else delete parent[key];
  return setAt(value, parentPath, parent);
}
export function insertAt(value: JsonValue, path: JsonPath, key: string | number, next: JsonValue): JsonValue {
  validate(value); validate(next);
  const target = getAt(value,path);
  if (!container(target)) throw new Error('Parent must be an object or array');
  const parent = copy(target);
  if (Array.isArray(parent)) {
    if (typeof key !== 'number' || !Number.isInteger(key) || key < 0 || key > parent.length) throw new Error('Invalid array index');
    parent.splice(key, 0, next);
  } else {
    if (typeof key !== 'string') throw new Error('Object key must be a string');
    if (own(parent,key)) throw new Error('Duplicate object key');
    Object.defineProperty(parent,key,{value:next,writable:true,enumerable:true,configurable:true});
  }
  return setAt(value,path,parent);
}
export function renameAt(value: JsonValue, path: JsonPath, key: string): JsonValue {
  if (!path.length) throw new Error('Cannot rename the root');
  validate(value);
  const parentPath = path.slice(0,-1), oldKey = path[path.length-1];
  const parent = getAt(value,parentPath);
  if (!container(parent) || Array.isArray(parent) || typeof oldKey !== 'string') throw new Error('Only object keys can be renamed');
  getAt(value,path);
  if (key === oldKey) return value;
  if (own(parent,key)) throw new Error('Duplicate object key');
  const next: JsonObject = Object.create(null) as JsonObject;
  for (const name of Object.keys(parent)) Object.defineProperty(next,name === oldKey ? key : name,{value:parent[name],writable:true,enumerable:true,configurable:true});
  return setAt(value,parentPath,next);
}
export function pathKey(path: JsonPath): string { return JSON.stringify(path); }
export function formatPath(path: JsonPath): string {
  return '$' + path.map(key => typeof key === 'number' ? `[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`).join('');
}
export function childrenOf(value: JsonValue, path: JsonPath): {key: string | number; path: JsonPath; value: JsonValue}[] {
  const parent = getAt(value,path);
  if (!container(parent)) return [];
  return Object.keys(parent).map(name => {
    const key = Array.isArray(parent) ? Number(name) : name;
    return {key, path:[...path,key], value:(parent as JsonObject)[name]};
  });
}
export function preview(value: JsonValue): string { return stringifyJson(value); }
export function findMatches(value: JsonValue, query: string): JsonPath[] {
  validate(value);
  if (!query) return [];
  const needle = query.toLocaleLowerCase(), result: JsonPath[] = [];
  function visit(current: JsonValue, path: JsonPath): void {
    const key = path.at(-1);
    if ((typeof key === 'string' && key.toLocaleLowerCase().includes(needle)) || (!container(current) && preview(current).toLocaleLowerCase().includes(needle))) result.push(path);
    if (container(current)) for (const name of Object.keys(current)) visit((current as JsonObject)[name],[...path,Array.isArray(current) ? Number(name) : name]);
  }
  visit(value,[]); return result;
}
