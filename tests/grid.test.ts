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
