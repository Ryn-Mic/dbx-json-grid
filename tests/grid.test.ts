import { describe, expect, it } from 'vitest';
import { parseJson, getAt } from '../src/core/json';
import { gridModel, matchesText, compareValues } from '../src/core/grid';

describe('grid projection', () => {
  it('unions heterogeneous array columns with explicit missing values', () => {
    const value = parseJson('[{"a":null},{"b":2},false,[1]]');
    const model = gridModel(value, []);
    expect(model.columns).toEqual(['a','b','value']);
    expect(model.rows[0].cells.find(c => c.key === 'a')).toMatchObject({missing:false,value:null,path:[0,'a']});
    expect(model.rows[0].cells.find(c => c.key === 'b')).toMatchObject({missing:true,path:[0,'b']});
    expect(model.rows[2].cells.find(c => c.key === 'value')).toMatchObject({missing:false,value:false,path:[2]});
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
