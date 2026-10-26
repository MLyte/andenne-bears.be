import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule } from '../scripts/tournoi-schedule.js';
const pairs = [[0,5],[1,4],[2,3], [0,4],[5,3],[1,2], [0,3],[4,2],[5,1], [0,2],[3,1],[4,5], [0,1],[2,5],[3,4]];
for (const fields of [1,2,3]) test(`planning avec ${fields} terrain(s)`, () => {
  const result=schedule({start:'09:00',minutes:10,transition:2,fields,break:10},pairs);
  assert.equal(result.slots.length,18);
  assert.equal(result.end,{1:762,2:690,3:630}[fields]);
  for (let i=0;i<15;i++) for(let j=i+1;j<15;j++) {
    const a=result.slots[i],b=result.slots[j];
    if(a.time===b.time) { assert.notEqual(a.field,b.field); assert.ok(a.pair.every(t=>!b.pair.includes(t))); }
  }
  assert.ok(result.slots[15].time >= result.slots[14].time+20,'Pause avant classement');
  assert.ok(result.slots[17].time >= result.slots[16].time+12,'Finale seule');
});
test('matinée trois terrains : pauses, finale seule et repas à 13 h', () => {
  const {slots,end}=schedule({start:'09:15',minutes:20,transition:10,fields:3,break:15},pairs);
  assert.equal(end,12*60+40);
  assert.deepEqual(slots.slice(0,15).filter((s,i)=>i%3===0).map(s=>s.time),[555,585,615,645,675]);
  for(let i=0;i<15;i+=3) {
    assert.equal(new Set(slots.slice(i,i+3).flatMap(s=>s.pair)).size,6);
    assert.deepEqual(slots.slice(i,i+3).map(s=>s.field),[1,2,3]);
  }
  assert.equal(slots[15].time,710);
  assert.equal(slots[16].time,710);
  assert.equal(slots[17].time,740);
});
