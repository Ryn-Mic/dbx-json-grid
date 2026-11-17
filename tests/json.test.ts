import { describe, expect, it } from 'vitest';
import { parseJson, stringifyJson, typeOf, getAt, setAt, removeAt, insertAt, renameAt, childrenOf, formatPath, pathKey, findMatches, summary, MAX_INPUT_BYTES, MAX_DEPTH } from '../src/core/json';

describe('lossless JSON contract', () => {
  it('retains numeric lexemes and primitive types', () => {
    const source = '{"id":9007199254740993,"decimal":1.2300,"exp":1e+400,"zero":-0,"s":"1","b":true,"n":null}';
    expect(stringifyJson(parseJson(source))).toBe(source);
    expect(typeOf(parseJson('1'))).toBe('number');
    expect(typeOf(parseJson('null'))).toBe('null');
  });
  it('rejects all duplicate keys including equal values and escaped duplicates', () => {
    for (const source of ['{"a":1,"a":1}', '{"a":1,"\\u0061":2}', '{"__proto__":1,"__proto__":2}']) expect(() => parseJson(source)).toThrow(/duplicate/i);
  });
  it('handles special keys as own data properties', () => {
    const value = parseJson('{"__proto__":{"polluted":true},"constructor":2,"toString":3}');
    expect(stringifyJson(value)).toBe('{"__proto__":{"polluted":true},"constructor":2,"toString":3}');
    expect(getAt(value, ['__proto__', 'polluted'])).toBe(true);
    expect(() => getAt(parseJson('{}'), ['toString'])).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('supports immutable edits, array splicing and root replacement', () => {
    const value = parseJson('{"a":[1,2],"x":{}}');
    expect(stringifyJson(setAt(value, ['a', 0], parseJson('9')))).toBe('{"a":[9,2],"x":{}}');
    expect(stringifyJson(removeAt(value, ['a', 0]))).toBe('{"a":[2],"x":{}}');
    expect(stringifyJson(insertAt(value, ['a'], 1, false))).toBe('{"a":[1,false,2],"x":{}}');
    expect(stringifyJson(renameAt(value, ['x'], '__proto__'))).toBe('{"a":[1,2],"__proto__":{}}');
    expect(stringifyJson(value)).toBe('{"a":[1,2],"x":{}}');
    expect(setAt(value, [], null)).toBeNull();
    expect(() => renameAt(value, ['x'], 'a')).toThrow();
    expect(() => insertAt(value, [], 'a', null)).toThrow();
    expect(() => removeAt(value, [])).toThrow();
  });
  it('enforces edit paths and limits without mutating source', () => {
    const value = parseJson('{"a":[1],"b":{}}');
    expect(() => setAt(value, ['a', 2], null)).toThrow();
    expect(() => insertAt(value, ['a'], -1, null)).toThrow();
    expect(() => insertAt(value, ['a'], '0', null)).toThrow();
    expect(() => renameAt(value, ['a', 0], 'x')).toThrow();
    expect(() => setAt(value, ['b'], parseJson('['.repeat(256) + '0' + ']'.repeat(256)))).toThrow(/depth/i);
    expect(stringifyJson(value)).toBe('{"a":[1],"b":{}}');
    expect(stringifyJson(insertAt(value, ['b'], '__proto__', true))).toBe('{"a":[1],"b":{"__proto__":true}}');
  });
  it('describes empty structures, paths and searches', () => {
    expect(summary(parseJson('{"x":[1]}'))).toBe('{1 keys}');
    expect(summary(parseJson('[{},{}]'))).toBe('[2 items]');
    expect(childrenOf(parseJson('{}'), [])).toEqual([]);
    expect(childrenOf(parseJson('[null]'), [])).toEqual([{key:0,path:[0],value:null}]);
    expect(formatPath(['a.b', 0, 'x"'])).toBe('$["a.b"][0]["x\\\""]');
    expect(pathKey(['1'])).not.toBe(pathKey([1]));
    expect(findMatches(parseJson('{"name":"Alice","nested":["alice"]}'), 'ALICE')).toEqual([['name'], ['nested',0]]);
  });
  it('guards UTF-8 input and nesting before parsing', () => {
    expect(MAX_INPUT_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_DEPTH).toBe(256);
    expect(() => parseJson('"' + 'é'.repeat(MAX_INPUT_BYTES / 2) + '"')).toThrow(/size|MiB|bytes/i);
    expect(() => parseJson('['.repeat(257) + '0' + ']'.repeat(257))).toThrow(/depth/i);
    expect(() => parseJson('['.repeat(256) + '0' + ']'.repeat(256))).not.toThrow();
    expect(parseJson('"[[["')).toBe('[[[');
  });
});
