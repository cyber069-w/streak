import { describe, expect, it } from 'vitest';
import { startOfDay } from './day';
import { canBuyFreeze, canBuyReward, freezeOffer } from './shop';
import { DEFAULT_RULES, type Purchase } from './types';

const rules = DEFAULT_RULES;
const at = (d: string) => startOfDay(d) + 12 * 3_600_000;
const fz = (d: string, habitId = 'j'): Purchase => ({ id: `${habitId}${d}`, at: at(d), price: 0, kind: 'freeze', habitId, name: 'Freeze' });

describe('freeze shop rules', () => {
  it('price rises within the month: 150, then 300, then none left', () => {
    expect(freezeOffer([], at('2026-11-12'), rules).price).toBe(150);
    expect(freezeOffer([fz('2026-11-01')], at('2026-11-12'), rules).price).toBe(300);
    expect(freezeOffer([fz('2026-11-01'), fz('2026-11-05', 'k')], at('2026-11-12'), rules)).toEqual({ price: null, boughtThisMonth: 2, limit: 2 });
  });

  it('a new month starts at the base price again (month boundary in Zurich time)', () => {
    const p = [fz('2026-11-01'), fz('2026-11-05', 'k')];
    expect(freezeOffer(p, startOfDay('2026-12-01'), rules).price).toBe(150);
    expect(freezeOffer(p, startOfDay('2026-12-01') - 1, rules).price).toBeNull();
  });

  it('max one waiting freeze per habit, and enough Koban', () => {
    const base = { habitId: 'j', archived: false, purchases: [], now: at('2026-11-12'), rules };
    expect(canBuyFreeze({ ...base, hasUnusedFreeze: true, balance: 999 })).toEqual({ ok: false, reason: 'This habit already has a freeze waiting.' });
    expect(canBuyFreeze({ ...base, hasUnusedFreeze: false, balance: 100 })).toEqual({ ok: false, reason: 'You need 50 more Koban.' });
    expect(canBuyFreeze({ ...base, hasUnusedFreeze: false, balance: 150 })).toEqual({ ok: true, price: 150 });
    expect(canBuyFreeze({ ...base, purchases: [fz('2026-11-01'), fz('2026-11-02', 'k')], hasUnusedFreeze: false, balance: 999 }).ok).toBe(false);
  });

  it('rewards need the full price', () => {
    expect(canBuyReward(40, 39).ok).toBe(false);
    expect(canBuyReward(40, 40)).toEqual({ ok: true, price: 40 });
  });
});
