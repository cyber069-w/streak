import { describe, expect, it } from 'vitest';
import { stableStringify } from '../lib/stable';
import { bootstrapColl, itemsOf, mergeColl, mergeKv, valueOf, writeColl } from './kvSync';

const todo = (id: string, text: string, done = false) => ({ id, text, done, created: 1 });
const T = 'marks';

describe('collections', () => {
  it('stamps only what changed and tombstones what vanished', () => {
    const c1 = writeColl(T, undefined, [todo('a', 'A'), todo('b', 'B')], 100);
    const c2 = writeColl(T, c1, [todo('a', 'A'), todo('b', 'B!')], 200);
    expect(c2.items.a.at).toBe(100);
    expect(c2.items.b.at).toBe(200);
    const c3 = writeColl(T, c2, [todo('a', 'A')], 300);
    expect(c3.deleted).toEqual({ b: 300 });
    expect(valueOf(T, c3)).toEqual([todo('a', 'A')]);
  });
  it('records keyed by date work like arrays', () => {
    const c = writeColl('external', undefined, { '2026-10-19': { at: 1, quick: false, top3: [] } }, 5);
    expect(valueOf('external', c)).toEqual({ '2026-10-19': { at: 1, quick: false, top3: [] } });
    expect(Object.keys(itemsOf('external', { x: 1 }))).toEqual(['x']);
  });
});
describe('merging two devices', () => {
  const now = 1_000_000;
  it('keeps items from both and the newest edit', () => {
    const a = writeColl(T, undefined, [todo('a', 'A phone'), todo('p', 'only phone')], 100);
    const b = writeColl(T, undefined, [todo('a', 'A mac'), todo('m', 'only mac')], 200);
    const m = mergeColl(a, b, now);
    expect((valueOf(T, m) as Array<{ text: string }>).map((x) => x.text).sort()).toEqual(['A mac', 'only mac', 'only phone']);
  });
  it('a newer deletion beats an older edit, a newer edit beats an older deletion', () => {
    const base = writeColl(T, undefined, [todo('a', 'A')], 100);
    const deletedOnMac = writeColl(T, base, [], 300);
    const editedOnPhone = writeColl(T, base, [todo('a', 'A edited')], 200);
    expect(valueOf(T, mergeColl(deletedOnMac, editedOnPhone, now))).toEqual([]);
    const editedLater = writeColl(T, base, [todo('a', 'A later')], 400);
    expect(valueOf(T, mergeColl(deletedOnMac, editedLater, now))).toEqual([todo('a', 'A later')]);
  });
  it('is the same whichever side is "local"', () => {
    const a = writeColl(T, undefined, [todo('x', '1')], 100), b = writeColl(T, undefined, [todo('y', '2')], 150);
    expect(stableStringify(mergeColl(a, b, now))).toBe(stableStringify(mergeColl(b, a, now)));
  });
  it('first-time data is very old: nothing is lost, newer remote wins', () => {
    const local = bootstrapColl(T, [todo('a', 'old local'), todo('l', 'local only')]);
    const remote = writeColl(T, undefined, [todo('a', 'new remote')], 500);
    expect((valueOf(T, mergeColl(local, remote, now)) as Array<{ text: string }>).map((x) => x.text).sort()).toEqual(['local only', 'new remote']);
  });
  it('old tombstones are dropped', () => {
    const c = writeColl(T, writeColl(T, undefined, [todo('a', 'A')], 1), [], 2);
    expect(mergeColl(c, undefined, 2 + 100 * 86_400_000).deleted).toEqual({});
    expect(mergeKv({ [T]: c }, undefined, 5)[T].deleted).toEqual({ a: 2 });
  });
});

describe('ties', () => {
  it('two devices with the same timestamp agree on one version (the earlier install)', () => {
    const early = { id: 'cfa', createdDay: '2026-11-12', name: 'CFA' };
    const late = { id: 'cfa', createdDay: '2026-11-20', name: 'CFA' };
    const a = bootstrapColl('habits', [early]);
    const b = bootstrapColl('habits', [late]);
    const ab = mergeColl(a, b, 10);
    const ba = mergeColl(b, a, 10);
    expect(stableStringify(ab)).toBe(stableStringify(ba));
    expect(valueOf('habits', ab)).toEqual([early]);
  });
});
