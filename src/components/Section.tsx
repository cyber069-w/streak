import type { ReactNode } from 'react';

/** A glass panel with a heading – the building block of Settings. */
export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="glass" id={id}>
      <div className="glass-head"><h2>{title}</h2></div>
      <div className="stack">{children}</div>
    </section>
  );
}
