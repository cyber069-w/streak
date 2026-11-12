/**
 * Shop rules: what a reward or a streak freeze costs and whether it can be bought now. Pure – no I/O.
 *
 * Freezes: price rises with each one bought in the same calendar month (Rules.freezePrices), at most that many
 * per month, at most one unused freeze per habit, and a freeze only ever covers days after the day it was bought.
 */
import { dayOf, monthOf } from './day';
import type { Purchase, Rules } from './types';

/** Freezes that count, oldest first. Extra ones beyond the monthly limit (e.g. two devices buying offline) are ignored. */
export function validFreezes(purchases: Purchase[], rules: Rules): Purchase[] {
  const perMonth = new Map<string, number>();
  const out: Purchase[] = [];
  for (const p of [...purchases].filter((x) => x.kind === 'freeze').sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))) {
    const m = monthOf(dayOf(p.at, rules.tz));
    const n = perMonth.get(m) ?? 0;
    if (n >= rules.freezePrices.length) continue;
    perMonth.set(m, n + 1);
    out.push(p);
  }
  return out;
}

/** Koban spent: every reward plus every valid freeze. */
export const spentOf = (purchases: Purchase[], rules: Rules) =>
  purchases.filter((p) => p.kind === 'reward').reduce((n, p) => n + p.price, 0) + validFreezes(purchases, rules).reduce((n, p) => n + p.price, 0);

export interface FreezeOffer {
  price: number | null;
  /** Freezes bought this month. */
  boughtThisMonth: number;
  limit: number;
}

export function freezeOffer(purchases: Purchase[], now: number, rules: Rules): FreezeOffer {
  const month = monthOf(dayOf(now, rules.tz));
  const n = validFreezes(purchases, rules).filter((p) => monthOf(dayOf(p.at, rules.tz)) === month).length;
  return { price: rules.freezePrices[n] ?? null, boughtThisMonth: n, limit: rules.freezePrices.length };
}

export type BuyCheck = { ok: true; price: number } | { ok: false; reason: string };

export function canBuyFreeze(opts: { habitId: string; hasUnusedFreeze: boolean; archived: boolean; balance: number; purchases: Purchase[]; now: number; rules: Rules }): BuyCheck {
  const offer = freezeOffer(opts.purchases, opts.now, opts.rules);
  if (opts.archived) return { ok: false, reason: 'This habit is archived.' };
  if (offer.price === null) return { ok: false, reason: `You already bought ${offer.limit} freezes this month.` };
  if (opts.hasUnusedFreeze) return { ok: false, reason: 'This habit already has a freeze waiting.' };
  if (opts.balance < offer.price) return { ok: false, reason: `You need ${offer.price - opts.balance} more Koban.` };
  return { ok: true, price: offer.price };
}

export function canBuyReward(price: number, balance: number): BuyCheck {
  return balance >= price ? { ok: true, price } : { ok: false, reason: `You need ${price - balance} more Koban.` };
}
