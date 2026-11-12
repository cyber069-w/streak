/**
 * Item-by-item sync for every store (copied from Study Desk core/kvSync.ts).
 * Each store stays a plain array/object in device storage; next to it a "collection" keeps, per item id,
 * when it last changed and when it was deleted, so two devices merge item by item (newest change wins,
 * a newer deletion beats an older edit). Changes are found by comparing with the previous version.
 */
import { storage } from './db';
import { stableStringify } from '../lib/stable';

export type KvKind = 'array' | 'record';
/** key in device storage → how to read its items. Arrays need an `id` on every item; records are keyed (e.g. by date). */
export const SYNCED_KV: Record<string, KvKind> = {
  habits: 'array', marks: 'array', rewards: 'array', purchases: 'array',
  /** Study Desk extract by day, Monkeytype results by timestamp, settings by name */
  external: 'record', typing: 'record', settings: 'record',
};
export const isSyncedKey = (key: string) => key in SYNCED_KV;

export interface Coll { items: Record<string, { v: unknown; at: number }>; deleted: Record<string, number> }
export type KvData = Record<string, Coll>;

const TOMBSTONE_MS = 90 * 86_400_000;

export const itemsOf = (key: string, value: unknown): Record<string, unknown> => {
  if (SYNCED_KV[key] === 'record') return { ...((value as Record<string, unknown>) ?? {}) };
  const out: Record<string, unknown> = {};
  for (const x of (Array.isArray(value) ? value : []) as Array<{ id?: string }>) if (x && typeof x.id === 'string') out[x.id] = x;
  return out;
};
export const valueOf = (key: string, coll: Coll): unknown => {
  const entries = Object.entries(coll.items);
  if (SYNCED_KV[key] === 'record') return Object.fromEntries(entries.map(([id, e]) => [id, e.v]));
  return entries.sort((a, b) => a[1].at - b[1].at || (a[0] < b[0] ? -1 : 1)).map(([, e]) => e.v);
};

/** The collection after a local write: changed items get `now`, vanished ids get a tombstone. */
export function writeColl(key: string, prev: Coll | undefined, value: unknown, now: number): Coll {
  const next = itemsOf(key, value);
  const items: Coll['items'] = {};
  const deleted = { ...(prev?.deleted ?? {}) };
  for (const [id, v] of Object.entries(next)) {
    const old = prev?.items[id];
    items[id] = old && stableStringify(old.v) === stableStringify(v) ? old : { v, at: now };
    delete deleted[id];
  }
  for (const id of Object.keys(prev?.items ?? {})) if (!(id in next)) deleted[id] = now;
  return { items, deleted };
}

/** First time (existing data, no history): items count as very old, so other devices' newer versions win but nothing is lost. */
export const bootstrapColl = (key: string, value: unknown): Coll => writeColl(key, undefined, value, 1);

export function mergeColl(a: Coll | undefined, b: Coll | undefined, now: number): Coll {
  const ids = new Set([...Object.keys(a?.items ?? {}), ...Object.keys(b?.items ?? {}), ...Object.keys(a?.deleted ?? {}), ...Object.keys(b?.deleted ?? {})]);
  const items: Coll['items'] = {};
  const deleted: Coll['deleted'] = {};
  for (const id of ids) {
    const ia = a?.items[id], ib = b?.items[id];
    const item = ia && ib ? (ib.at > ia.at ? ib : ia) : ia ?? ib;
    const del = Math.max(a?.deleted[id] ?? 0, b?.deleted[id] ?? 0);
    if (item && item.at > del) items[id] = item;
    else if (del && now - del < TOMBSTONE_MS) deleted[id] = del;
  }
  return { items, deleted };
}

export function mergeKv(a: KvData | undefined, b: KvData | undefined, now: number): KvData {
  const out: KvData = {};
  for (const key of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) out[key] = mergeColl(a?.[key], b?.[key], now);
  return out;
}

// ---------------------------------------------------------------------------
// State on this device
// ---------------------------------------------------------------------------

let data: KvData = {};
let onChange: () => void = () => {};
let onApplied: (key: string, value: unknown) => void = () => {};
const listeners = new Map<string, Set<(v: unknown) => void>>();

export const registerKvHooks = (change: () => void, applied: (key: string, value: unknown) => void) => { onChange = change; onApplied = applied; };
export const subscribeKv = (key: string, fn: (v: unknown) => void) => {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(fn);
  return () => void listeners.get(key)?.delete(fn);
};
export const kvSnapshot = (): KvData => data;

/** Load the collections; stores that existed before sync get a first, very old version. */
export async function initKvSync() {
  data = (await storage.get<KvData>('kvsync')) ?? {};
  let dirty = false;
  for (const key of Object.keys(SYNCED_KV)) {
    if (data[key]) continue;
    data[key] = bootstrapColl(key, await storage.get(key));
    dirty = true;
  }
  if (dirty) await storage.set('kvsync', data);
}

/** A store was written on this device: keep the plain value, update the collection, tell sync. */
export async function localWrite(key: string, value: unknown) {
  data = { ...data, [key]: writeColl(key, data[key], value, Date.now()) };
  await storage.set(key, value);
  await storage.set('kvsync', data);
  listeners.get(key)?.forEach((fn) => fn(value));
  onChange();
}

/** Merged data from a sync: replace the collections, rewrite the plain values, update screens. */
export async function applyKv(merged: KvData) {
  data = merged;
  for (const key of Object.keys(SYNCED_KV)) {
    const value = valueOf(key, merged[key] ?? { items: {}, deleted: {} });
    await storage.set(key, value);
    listeners.get(key)?.forEach((fn) => fn(value));
    onApplied(key, value);
  }
  await storage.set('kvsync', data);
}
