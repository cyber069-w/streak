/** Shop: spend Koban on your own rewards or on a streak freeze; badges and purchase history. */
import { useState } from 'react';
import { dayOf } from '../core/day';
import { canBuyFreeze, canBuyReward, freezeOffer, validFreezes } from '../core/shop';
import { addPurchase, saveRewards, useApp, useReport } from '../core/store';
import type { Reward } from '../core/types';
import { Icon } from '../components/Icon';
import { EmptyState, HabitIcon, PageHead, SectionHead } from '../components/ui';
import { badgeViews } from '../core/badges';
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
          <button className="btn btn-primary" disabled={!ok} onClick={() => void save()}>Save</button>
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
  const badges = badgeViews(report, Object.values(state.typing), state.marks, state.purchases);

  return (
    <div className="page">
      <PageHead eyebrow="Spend your Koban" title="Shop" sub={`${report.xp} earned so far · ${report.spent} spent`} />
      <div className="shop-top">
        <KobanCard report={report} />
        <section className="glass">
          <div className="glass-head">
            <h2>Streak freeze</h2>
            <span className="pill num">{offer.boughtThisMonth} / {offer.limit} this month</span>
          </div>
          <p className="faint small" style={{ marginBottom: 12 }}>
            Covers a habit’s first missed day <b>after</b> today (Gym: a missed week). Never retroactive · one per habit · price rises each month.
          </p>
          <div className="habit-chips" role="radiogroup" aria-label="Habit to protect">
            {active.map((r) => (
              <button key={r.habit.id} role="radio" aria-checked={target?.habit.id === r.habit.id}
                className={`habit-chip${target?.habit.id === r.habit.id ? ' on' : ''}`} onClick={() => setFreezeFor(r.habit.id)}>
                <HabitIcon habit={r.habit} className="sm" size={16} />
                <span>{r.habit.name}</span>
                {r.waitingFreeze && <Icon name="snow" size={14} />}
              </button>
            ))}
          </div>
          <div className="split-line" style={{ marginTop: 14, alignItems: 'center' }}>
            <span className="small">{check && !check.ok ? <span style={{ color: 'var(--bad)' }}>{check.reason}</span> : target ? <>Protect <b>{target.habit.name}</b></> : null}</span>
            <button className="btn btn-primary" disabled={!check?.ok} onClick={buyFreeze}>
              <Icon name="snow" size={16} /> {offer.price === null ? 'None left this month' : `Buy · ${offer.price} Koban`}
            </button>
          </div>
        </section>
      </div>

      <section className="section">
        <SectionHead title="Rewards" action={<button className="btn btn-sm" onClick={() => setEdit('new')}><Icon name="plus" size={16} /> New reward</button>} />
        <div className="card card-pad">
          <ul className="habits">
            {rewards.map((r) => {
              const can = report.balance >= r.price;
              return (
                <li key={r.id} className="habit">
                  <span className="subject-icon" data-color="orange" aria-hidden="true"><Icon name="gift" size={22} /></span>
                  <button className="habit-main" style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'inherit' }} onClick={() => setEdit(r)} aria-label={`Edit ${r.name}`}>
                    <div className="habit-name">{r.name}</div>
                    <div className="habit-sub num">{r.price} Koban{can ? '' : ` · ${r.price - report.balance} to go`}</div>
                  </button>
                  <button className="btn btn-sm btn-primary" disabled={!can} onClick={() => buyReward(r)}>Buy</button>
                </li>
              );
            })}
          </ul>
          {!rewards.length && <EmptyState icon="gift" title="No rewards yet" hint="Add something you look forward to." action={{ label: 'New reward', onClick: () => setEdit('new') }} />}
        </div>
      </section>

      <section className="section">
        <SectionHead title="Badges" meta={`${badges.filter((b) => b.earned).length} of ${badges.length} earned`} />
        <ul className="badges">
          {badges.map((b) => (
            <li key={b.id} className={`card badge${b.earned ? ' earned' : ''}`}>
              <span className="subject-icon" data-color={b.color} aria-hidden="true">
                <Icon name={b.icon} size={22} />
                {!b.earned && <span className="badge-lock"><Icon name="lock" size={11} stroke={2.4} /></span>}
              </span>
              <div className="badge-main">
                <b>{b.name}</b>
                <span>{b.earned ? `Earned ${dayLabel(b.earned)}` : b.desc}</span>
                {!b.earned && <span className="badge-bar" aria-label={`${b.value} of ${b.goal}`}><i style={{ width: `${(b.value / b.goal) * 100}%` }} /></span>}
              </div>
              {!b.earned && <span className="badge-count num">{b.value}/{b.goal}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <SectionHead title="History" />
        <div className="card card-pad">
          {history.length ? (
            <ul className="history">
              {history.map((p) => {
                const day = dayOf(p.at, rules.tz);
                const note = p.kind !== 'freeze' ? '' : !valid.has(p.id) ? ' · over the monthly limit, not charged' : usedOn.has(p.id) ? ` · used ${dayLabel(usedOn.get(p.id)!)}` : ' · waiting';
                return (
                  <li key={p.id}>
                    <span className="grow">{p.name}<small>{dayLabel(day)}{note}</small></span>
                    <span className="num">−{valid.has(p.id) || p.kind === 'reward' ? p.price : 0}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon="shop" title="Nothing bought yet" hint="Purchases show up here." />
          )}
        </div>
      </section>

      {edit && <RewardSheet reward={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {confirm && (
        <Sheet title={confirm.title} onClose={() => setConfirm(null)}>
          <div className="stack">
            <p>{confirm.text}</p>
            <p className="muted small">Balance afterwards: {report.balance - confirm.price} Koban</p>
            <div className="row">
              <button className="btn btn-primary" onClick={() => void confirm.act().then(() => setConfirm(null))}>Buy</button>
              <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
