import type { ReactNode } from 'react';

/** A settings card like Study Desk's: heading, then rows. */
export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="card card-pad" id={id}>
      <h2 style={{ marginBottom: 6 }}>{title}</h2>
      {children}
    </section>
  );
}
