/** Small building blocks with Study Desk's markup (same class names, so the same look). */
import type { ReactNode } from 'react';
import { habitColor } from '../core/defaults';
import type { Habit } from '../core/types';
import { Icon } from './Icon';

/** Page header: small uppercase line, big title, optional line below and actions on the right. */
export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="grow">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 style={{ marginTop: eyebrow ? 6 : 0 }}>{title}</h1>
        {sub && <p className="muted" style={{ marginTop: 8 }}>{sub}</p>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  );
}

/** A section title above a card (Study Desk's grouped look). */
export function SectionHead({ title, meta, action }: { title: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {meta && <span className="meta">{meta}</span>}
      {action && <span style={{ marginLeft: meta ? 0 : 'auto' }}>{action}</span>}
    </div>
  );
}

/** Study Desk's settings row: title + description on the left, the control on the right. */
export function Row({ title, desc, children }: { title: ReactNode; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <b>{title}</b>
        {desc && <span>{desc}</span>}
      </div>
      {children}
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} role="radio" aria-checked={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** A habit's icon tile in its colour (glossy squircle in the Apple look). */
export function HabitIcon({ habit, size = 22, className = '' }: { habit: Pick<Habit, 'id' | 'icon' | 'color'>; size?: number; className?: string }) {
  return (
    <span className={`subject-icon ${className}`} data-color={habitColor(habit)} aria-hidden="true">
      <Icon name={habit.icon} size={size} />
    </span>
  );
}

/** A calm "nothing here yet" with a hint and one optional action (Study Desk's EmptyState). */
export function EmptyState({ icon = 'star', title, hint, action }: { icon?: string; title: string; hint?: string; action?: { label: string; href?: string; onClick?: () => void } }) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
      <b>{title}</b>
      {hint && <span className="muted small">{hint}</span>}
      {action && (action.href ? <a className="btn btn-sm" href={action.href}>{action.label}</a> : <button className="btn btn-sm" onClick={action.onClick}>{action.label}</button>)}
    </div>
  );
}
