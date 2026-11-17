import { describe, expect, it } from 'vitest';
import { parseJson, getAt } from '../src/core/json';
import { gridModel, matchesText, compareValues } from '../src/core/grid';

describe('grid projection', () => {
  it('unions object array columns with explicit missing values', () => {
    const value = parseJson('[{"a":null},{"b":2}]');
    const model = gridModel(value, []);
    expect(model.columns).toEqual(['a','b']);
    expect(model.rows[0].cells.find(c => c.key === 'a')).toMatchObject({missing:false,value:null,path:[0,'a']});
    expect(model.rows[0].cells.find(c => c.key === 'b')).toMatchObject({missing:true,path:[0,'b']});
  });
  it('preserves mixed array values whole and empty object fallback paths', () => {
    const mixed = parseJson('[{"value":1},2]');
    const model = gridModel(mixed, []);
    expect(model.columns).toEqual(['value']);
    expect(model.rows[0].cells[0]).toMatchObject({value:getAt(mixed,[0]),path:[0],missing:false});
    expect(model.rows[1].cells[0]).toMatchObject({value:getAt(mixed,[1]),path:[1],missing:false});
    const empty = gridModel(parseJson('[{},{}]'), []);
    expect(empty.columns).toEqual(['value']);
    expect(empty.rows.map(row => row.cells[0].path)).toEqual([[0],[1]]);
    expect(gridModel(parseJson('[{"value":1}]'), []).rows[0].cells[0].path).toEqual([0,'value']);
  });
  it('retains source paths after filtering and sorting', () => {
    const value = parseJson('[{"name":"z"},{"name":"a"},{"name":"b"}]');
    const rows = gridModel(value, []).rows.filter(row => matchesText(getAt(value,row.path), 'name')).sort((a,b) => compareValues(getAt(value,[...a.path,'name']),getAt(value,[...b.path,'name'])));
    expect(rows.map(r => r.path)).toEqual([[1],[2],[0]]);
  });
  it('supports objects, primitive roots and empty arrays', () => {
    expect(gridModel(parseJson('[]'), []).rows).toEqual([]);
    expect(gridModel(null, []).rows[0].cells[0]).toMatchObject({value:null,missing:false,path:[]});
    expect(gridModel(parseJson('{"a":1,"b":{}}'), []).rows.map(r => r.path)).toEqual([['a'],['b']]);
  });
  it('compares numbers without rounding and searches numeric lexemes', () => {
    expect(compareValues(parseJson('9007199254740993'),parseJson('9007199254740992'))).toBe(1);
    expect(matchesText(parseJson('1.2300'), '2300')).toBe(true);
  });
});

describe('bounded grids and exact numeric ordering', () => {
  it('falls back to intact rows for a sparse wide schema', () => {
    const value = parseJson(JSON.stringify(Array.from({length:10000},(_,i) => ({['field'+i]: i}))));
    const model = gridModel(value, []);
    expect(model.columnCount).toBe(10000);
    expect(model.columns).toEqual(['value']);
    expect(model.notice).toMatch(/whole|complete/i);
    expect(model.rows.reduce((count,row) => count + row.cells.length,0)).toBe(10000);
    expect(model.rows[9999].cells[0]).toMatchObject({path:[9999],value:getAt(value,[9999]),missing:false});
  });
  it('bounds dense cell allocation even with fewer than 128 fields', () => {
    const value = parseJson(JSON.stringify(Array.from({length:10000},(_,i) => ({['field'+(i%20)]:i}))));
    const model = gridModel(value, []);
    expect(model.columnCount).toBe(20);
    expect(model.columns).toEqual(['value']);
    expect(model.notice).toBeTruthy();
  });
  it('compares huge positive and negative exponents exactly', () => {
    const cases = [
      ['1e9007199254740992','1e9007199254740993',-1],
      ['9e9007199254740992','1e9007199254740993',-1],
      ['1e-9007199254740993','1e-9007199254740992',-1],
      ['-9e9007199254740992','-1e9007199254740993',1],
      ['10e9007199254740992','1e9007199254740993',0],
      ['0e9007199254740993','-0.000e-9007199254740993',0],
      ['0.00100','1e-3',0],
      ['-0.9','-1',1],
    ] as const;
    for (const [a,b,result] of cases) expect(compareValues(parseJson(a),parseJson(b))).toBe(result);
  });
});
