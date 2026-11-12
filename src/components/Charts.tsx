/**
 * Two small single-series SVG charts: a line (with crosshair tooltip) and bars (per-bar tooltip).
 * Thin marks, recessive grid, one accent colour, values also reachable in a table under each chart.
 */
import { useState, type ReactNode } from 'react';

const W = 340;
const H = 150;
const PAD = { l: 30, r: 10, t: 12, b: 22 };
const iw = W - PAD.l - PAD.r;
const ih = H - PAD.t - PAD.b;

function niceMax(v: number) {
  const step = v <= 10 ? 2 : v <= 50 ? 10 : 20;
  return Math.max(step, Math.ceil(v / step) * step);
}

function Frame({ max, ticks, labels, children, tip, onMove, onLeave, label }: {
  max: number; ticks: number[]; labels: string[]; children: ReactNode; tip: { x: number; text: ReactNode } | null; label: string;
  onMove: (fx: number) => void; onLeave: () => void;
}) {
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          onMove((((e.clientX - r.left) / r.width) * W - PAD.l) / iw);
        }}
        onPointerLeave={onLeave}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" className="chart-axis">{t}</text>
          </g>
        ))}
        {labels.map((l, i) => l && (
          <text key={i} x={PAD.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw)} y={H - 6} textAnchor="middle" className="chart-axis">{l}</text>
        ))}
        {children}
      </svg>
      {tip && <div className="chart-tip" style={{ left: `${(tip.x / W) * 100}%` }}>{tip.text}</div>}
    </div>
  );
}

export interface LinePoint { label: string; short: string; value: number | null }

/** One line over time; gaps where there is no value; an optional dashed goal line. */
export function LineChart({ points, goal, unit, label }: { points: LinePoint[]; goal?: number; unit: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const max = niceMax(Math.max(goal ?? 0, ...values, 10) * 1.05);
  const step = max <= 10 ? 2 : max <= 50 ? 10 : 20;
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const x = (i: number) => PAD.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  // line segments between consecutive known values
  const segs: string[] = [];
  let cur = '';
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur) segs.push(cur);
      cur = '';
    } else cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const every = Math.ceil(points.length / 4);
  const h = hover !== null ? points[hover] : null;
  return (
    <Frame
      max={max} ticks={ticks} label={label}
      labels={points.map((p, i) => (i % every === points.length % every || i === points.length - 1 ? p.short : ''))}
      onMove={(f) => setHover(Math.max(0, Math.min(points.length - 1, Math.round(f * (points.length - 1)))))}
      onLeave={() => setHover(null)}
      tip={h ? { x: x(hover!), text: <><b>{h.value ?? '–'}{h.value !== null ? ` ${unit}` : ''}</b><span>{h.label}</span></> } : null}
    >
      {goal !== undefined && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(goal)} y2={y(goal)} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="4 4" />
          <text x={W - PAD.r} y={y(goal) - 4} textAnchor="end" className="chart-axis">goal {goal}</text>
        </g>
      )}
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--ink-3)" strokeWidth="1" />}
      {segs.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
      {points.map((p, i) => p.value !== null && (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 4} fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
      ))}
    </Frame>
  );
}

export interface Bar { label: string; short: string; value: number; note?: string }

export function BarChart({ bars, unit, label }: { bars: Bar[]; unit: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...bars.map((b) => b.value), 5) * 1.05);
  const step = max <= 10 ? 2 : max <= 50 ? 10 : 20;
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const slot = iw / bars.length;
  const bw = Math.max(4, slot - 2);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const h = hover !== null ? bars[hover] : null;
  return (
    <Frame
      max={max} ticks={ticks} label={label}
      labels={[]}
      onMove={(f) => setHover(Math.max(0, Math.min(bars.length - 1, Math.floor(f * bars.length))))}
      onLeave={() => setHover(null)}
      tip={h ? { x: PAD.l + slot * hover! + slot / 2, text: <><b>{h.value} {unit}</b><span>{h.label}{h.note ? ` · ${h.note}` : ''}</span></> } : null}
    >
      {bars.map((b, i) => {
        const top = y(b.value);
        const hgt = PAD.t + ih - top;
        const x0 = PAD.l + slot * i + (slot - bw) / 2;
        return (
          <g key={i}>
            {b.value > 0 && (
              <path
                d={`M${x0},${PAD.t + ih} V${top + Math.min(4, hgt)} Q${x0},${top} ${x0 + Math.min(4, bw / 2)},${top} H${x0 + bw - Math.min(4, bw / 2)} Q${x0 + bw},${top} ${x0 + bw},${top + Math.min(4, hgt)} V${PAD.t + ih} Z`}
                fill="var(--accent)" opacity={hover === null || hover === i ? 1 : 0.55}
              />
            )}
            {(i === 0 || i === bars.length - 1 || i === Math.floor(bars.length / 2)) && (
              <text x={x0 + bw / 2} y={H - 6} textAnchor="middle" className="chart-axis">{b.short}</text>
            )}
          </g>
        );
      })}
    </Frame>
  );
}

/** The same numbers as a table (for screen readers, and to read exact values without hovering). */
export function ChartTable({ rows, head }: { rows: Array<[string, string]>; head: [string, string] }) {
  return (
    <details className="chart-table">
      <summary className="small muted">Show as table</summary>
      <table>
        <thead><tr><th>{head[0]}</th><th>{head[1]}</th></tr></thead>
        <tbody>{rows.map(([a, b]) => <tr key={a}><td>{a}</td><td className="num">{b}</td></tr>)}</tbody>
      </table>
    </details>
  );
}
