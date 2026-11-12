/** Shop: spend Koban on your own rewards or on a streak freeze; badges and purchase history. */
import { useState } from 'react';
import { dayOf } from '../core/day';
import { canBuyFreeze, canBuyReward, freezeOffer, validFreezes } from '../core/shop';
import { addPurchase, saveRewards, useApp, useReport } from '../core/store';
import type { Reward } from '../core/types';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { KobanCard } from './Today';

const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function RewardSheet({ reward, onClose }: { reward: Reward | null; onClose: () => void }) {
  const { rewards } = useApp();
  const [name, setName] = useState(reward?.name ?? '');
  const [price, setPrice] = useState(String(reward?.price ?? ''));
  const ok = name.trim() && Number(price) > 0;
  const save = async () => {
    const r: Reward = { id: reward?.id ?? crypto.randomUUID(), name: name.trim(), price: Math.round(Number(price)) };
    await saveRewards(reward ? rewards.map((x) => (x.id === r.id ? r : x)) : [...rewards, r]);
    onClose();
  };
  const archive = async () => {
    await saveRewards(rewards.map((x) => (x.id === reward!.id ? { ...x, archived: true } : x)));
    onClose();
  };
  return (
    <Sheet title={reward ? 'Edit reward' : 'New reward'} onClose={onClose}>
      <div className="stack">
        <label className="field">What<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Evening off" autoFocus={!reward} /></label>
        <label className="field">Price in Koban<input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" /></label>
        <div className="row">
          <button className="btn primary" disabled={!ok} onClick={() => void save()}>Save</button>
          {reward && <button className="btn" onClick={() => void archive()}><Icon name="archive" size={18} /> Remove</button>}
        </div>
      </div>
    </Sheet>
  );
}

type Confirm = { title: string; text: string; price: number; act: () => Promise<void> } | null;

export function Shop() {
  const state = useApp();
  const report = useReport();
  const [edit, setEdit] = useState<Reward | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [freezeFor, setFreezeFor] = useState('');
  if (!state.ready) return <div className="page" />;
  const rules = state.settings.rules;
  const now = Date.now();
  const rewards = state.rewards.filter((r) => !r.archived);

  const buyReward = (r: Reward) => {
    const check = canBuyReward(r.price, report.balance);
    if (!check.ok) return;
    setConfirm({
      title: r.name, text: `Buy “${r.name}” for ${r.price} Koban?`, price: r.price,
      act: () => addPurchase({ id: crypto.randomUUID(), at: Date.now(), price: r.price, kind: 'reward', rewardId: r.id, name: r.name }),
    });
  };

  // freezes
  const offer = freezeOffer(state.purchases, now, rules);
  const active = report.habits.filter((r) => !r.habit.archivedDay);
  const target = active.find((r) => r.habit.id === freezeFor) ?? active.find((r) => !r.waitingFreeze) ?? active[0];
  const check = target ? canBuyFreeze({ habitId: target.habit.id, hasUnusedFreeze: !!target.waitingFreeze, archived: false, balance: report.balance, purchases: state.purchases, now, rules }) : null;
  const buyFreeze = () => {
    if (!target || !check?.ok) return;
    const unit = target.unit === 'weeks' ? 'the first missed week that starts after today' : 'the first missed day after today';
    setConfirm({
      title: 'Streak freeze', text: `Buy a freeze for ${target.habit.name} for ${check.price} Koban? It covers ${unit}.`, price: check.price,
      act: () => addPurchase({ id: crypto.randomUUID(), at: Date.now(), price: check.price, kind: 'freeze', habitId: target.habit.id, name: `Freeze · ${target.habit.name}` }),
    });
  };

  // history
  const valid = new Set(validFreezes(state.purchases, rules).map((p) => p.id));
  const usedOn = new Map(report.habits.flatMap((r) => r.frozen.map((f) => [f.purchaseId, f.on] as const)));
  const history = [...state.purchases].sort((a, b) => b.at - a.at);

  return (
    <div className="page stack">
      <header className="page-head"><h1>Shop</h1></header>
      <KobanCard report={report} />

      <section className="glass">
        <div className="glass-head">
          <h2>Rewards</h2>
          <button className="btn small" onClick={() => setEdit('new')}><Icon name="plus" size={16} /> New</button>
        </div>
        <ul className="habits">
          {rewards.map((r) => {
            const can = report.balance >= r.price;
            return (
              <li key={r.id} className="habit">
                <span className="habit-icon"><Icon name="gift" size={22} /></span>
                <button className="grow" style={{ textAlign: 'left', background: 'none', border: 0, padding: 0 }} onClick={() => setEdit(r)} aria-label={`Edit ${r.name}`}>
                  <div className="habit-name">{r.name}</div>
                  <div className="habit-sub num">{r.price} Koban{can ? '' : ` · ${r.price - report.balance} to go`}</div>
                </button>
                <button className="btn small primary" disabled={!can} onClick={() => buyReward(r)}>Buy</button>
              </li>
            );
          })}
          {!rewards.length && <li className="muted small">No rewards yet – add something you look forward to.</li>}
        </ul>
      </section>

      <section className="glass">
        <div className="glass-head">
          <h2>Streak freeze</h2>
          <span className="muted small num">{offer.boughtThisMonth} / {offer.limit} this month</span>
        </div>
        <div className="stack">
          <p className="muted small">
            Protects one habit’s streak on its first missed day (per-week habits: a missed week) <b>after</b> the day you buy it – never
            retroactively. One waiting freeze per habit, {offer.limit} per month, and each one this month costs more.
          </p>
          {target && (
            <label className="field">Habit
              <select value={target.habit.id} onChange={(e) => setFreezeFor(e.target.value)}>
                {active.map((r) => <option key={r.habit.id} value={r.habit.id}>{r.habit.name}{r.waitingFreeze ? ' (freeze waiting)' : ''}</option>)}
              </select>
            </label>
          )}
          <div className="row">
            <span className="coin sm"><Icon name="snow" size={14} /></span>
            <span className="grow num">{offer.price === null ? 'None left this month' : `${offer.price} Koban`}</span>
            <button className="btn small primary" disabled={!check?.ok} onClick={buyFreeze}>Buy</button>
          </div>
          {check && !check.ok && <p className="small muted">{check.reason}</p>}
        </div>
      </section>

      <section className="glass">
        <div className="glass-head"><h2>Badges</h2><span className="muted small">Level {report.level.level}</span></div>
        <ul className="badges">
          {report.badges.map((b) => (
            <li key={b.id} className={b.earned ? 'earned' : ''} title={b.earned ? `Earned ${dayLabel(b.earned)}` : 'Not yet'}>
              <Icon name={b.earned ? 'trophy' : 'lock'} size={20} />
              <span>{b.name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass">
        <div className="glass-head"><h2>History</h2></div>
        {history.length ? (
          <ul className="history">
            {history.map((p) => {
              const day = dayOf(p.at, rules.tz);
              const note = p.kind !== 'freeze' ? '' : !valid.has(p.id) ? ' · over the monthly limit, not charged' : usedOn.has(p.id) ? ` · used ${dayLabel(usedOn.get(p.id)!)}` : ' · waiting';
              return (
                <li key={p.id}>
                  <span className="grow">{p.name}<span className="muted small"> · {dayLabel(day)}{note}</span></span>
                  <span className="num">−{valid.has(p.id) || p.kind === 'reward' ? p.price : 0}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted small">Nothing bought yet.</p>
        )}
        <p className="muted small" style={{ marginTop: 10 }}>Earned so far: {report.xp} · spent: {report.spent}</p>
      </section>

      {edit && <RewardSheet reward={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {confirm && (
        <Sheet title={confirm.title} onClose={() => setConfirm(null)}>
          <div className="stack">
            <p>{confirm.text}</p>
            <p className="muted small">Balance afterwards: {report.balance - confirm.price} Koban</p>
            <div className="row">
              <button className="btn primary" onClick={() => void confirm.act().then(() => setConfirm(null))}>Buy</button>
              <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
