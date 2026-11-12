import { describe, expect, it } from 'vitest';
import { startOfDay } from './day';
import { createGitHub } from './github';
import { bootstrapColl, valueOf, writeColl } from './kvSync';
import { extractStudyDesk, foldExternal, type StudyDeskData } from './studyDesk';
import { deviceNameOf, readStudyDesk, runSync, type SyncData } from './sync';
import { decryptJson, deriveKey, encryptJson, fromBase64, randomSalt, toBase64, WrongPasswordError } from '../lib/crypto';

const TZ = 'Europe/Zurich';

/** A fake api.github.com (contents + blobs) that records every request. */
function fakeApi(files: Record<string, Uint8Array>) {
  const store = new Map<string, { sha: string; bytes: Uint8Array }>();
  const blobs = new Map<string, Uint8Array>();
  let n = 0;
  const put = (path: string, bytes: Uint8Array) => {
    const sha = `sha${++n}`;
    store.set(path, { sha, bytes });
    blobs.set(sha, bytes);
    return sha;
  };
  for (const [p, b] of Object.entries(files)) put(p, b);
  const requests: Array<{ method: string; url: string }> = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    requests.push({ method, url });
    const contents = /\/contents\/(.+)$/.exec(url);
    const blob = /\/git\/blobs\/(.+)$/.exec(url);
    if (blob) return json({ content: toBase64(blobs.get(blob[1])!) });
    if (contents && method === 'GET') {
      const f = store.get(contents[1]);
      return f ? json({ sha: f.sha }) : json({ message: 'Not Found' }, 404);
    }
    if (contents && method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as { content: string; sha?: string };
      if (store.get(contents[1])?.sha !== body.sha) return json({ message: 'sha mismatch' }, 409);
      return json({ content: { sha: put(contents[1], fromBase64(body.content)) } });
    }
    return json({ private: true, full_name: 'me/study-sync' });
  }) as typeof fetch;
  return { fetchFn, requests, file: (p: string) => store.get(p) };
}

const studyDesk = (sessions: NonNullable<StudyDeskData['focus']>['sessions'], days: StudyDeskData['days'] = {}): StudyDeskData => ({ app: 'nihongo-app', focus: { sessions }, days });
const session = (subject: string, startIso: string, min: number, kind: 'study' | 'lecture' = 'study', at?: number) => ({
  id: `s${startIso}`, kind, subject, start: startIso, end: new Date(Date.parse(startIso) + min * 60_000).toISOString(), effectiveSec: min * 60, ...(at ? { at } : {}),
});

describe('reading Study Desk', () => {
  it('never writes Study Desk’s file – only GET requests touch it', async () => {
    const salt = randomSalt();
    const key = await deriveKey('secret-pass', salt);
    const sd = await encryptJson(studyDesk([session('CFA', '2026-11-10T08:00:00Z', 40)]), key, salt);
    const api = fakeApi({ 'progress.enc': sd });
    const gh = createGitHub('token', { owner: 'me', repo: 'study-sync' }, api.fetchFn);

    const { extract } = await readStudyDesk((p) => gh.getFile(p), key, undefined, TZ);
    expect(extract?.['2026-11-10'].focus.CFA).toBe(2400);
    // and a full Streak sync in the same repo
    const local: SyncData = { app: 'streak-app', v: 1, kv: { marks: writeColl('marks', undefined, [{ id: 'a' }], 5) }, devices: {} };
    await runSync({ github: gh, key, salt, deviceId: 'd1', deviceName: 'Mac', readLocal: () => local, applyMerged: async () => {} });

    const sdSha = 'sha1';
    const touchingStudyDesk = api.requests.filter((r) => r.url.includes('progress.enc') || r.url.endsWith(`/git/blobs/${sdSha}`));
    expect(touchingStudyDesk.length).toBeGreaterThan(0);
    expect(touchingStudyDesk.every((r) => r.method === 'GET')).toBe(true);
    expect(api.requests.filter((r) => r.method !== 'GET').every((r) => r.url.endsWith('/contents/streak.enc'))).toBe(true);
    expect(api.file('progress.enc')!.bytes).toEqual(sd);
  });

  it('skips the download when the file has not changed, and says when the password differs', async () => {
    const salt = randomSalt();
    const key = await deriveKey('secret-pass', salt);
    const api = fakeApi({ 'progress.enc': await encryptJson(studyDesk([]), key, salt) });
    const gh = createGitHub('t', { owner: 'me', repo: 'r' }, api.fetchFn);
    const first = await readStudyDesk((p) => gh.getFile(p), key, undefined, TZ);
    const again = await readStudyDesk((p) => gh.getFile(p), key, first.sha, TZ);
    expect(again.extract).toBeNull();
    const other = await deriveKey('other-pass', salt);
    await expect(readStudyDesk((p) => gh.getFile(p), other, undefined, TZ)).rejects.toThrow(/different password/);
  });

  it('extracts focus per Zurich day (study and lectures apart) and adds up card reviews of all devices', () => {
    const data = studyDesk(
      [
        session('CFA', '2026-11-10T08:00:00Z', 20),
        session('CFA', '2026-11-10T15:00:00Z', 15),
        session('Japanisch', '2026-11-10T09:00:00Z', 90, 'lecture'),
        session('CFA', '2026-11-10T23:30:00Z', 30), // 00:30 on 11 Nov in Zurich
      ],
      { mac: [{ date: '2026-11-10', modules: { vocab: { reviews: 10 }, cfa: { reviews: 4 } } }], phone: [{ date: '2026-11-10', modules: { vocab: { reviews: 5 } } }] },
    );
    const x = extractStudyDesk(data, TZ);
    expect(x['2026-11-10'].focus).toEqual({ CFA: 35 * 60 });
    expect(x['2026-11-10'].lecture).toEqual({ Japanisch: 90 * 60 });
    expect(x['2026-11-10'].reviews).toEqual({ vocab: 15, cfa: 4 });
    expect(x['2026-11-11'].focus).toEqual({ CFA: 30 * 60 });
  });

  it('a session entered after the end of the next day does not count (no repairing old streaks)', () => {
    const inTime = startOfDay('2026-11-12', TZ) - 1; // 23:59:59 on 11 Nov
    const late = startOfDay('2026-11-12', TZ);
    const x = extractStudyDesk(studyDesk([session('CFA', '2026-11-10T08:00:00Z', 30, 'study', inTime), { ...session('CFA', '2026-11-10T12:00:00Z', 60, 'study', late), id: 'late' }]), TZ);
    expect(x['2026-11-10'].focus.CFA).toBe(30 * 60);
  });

  it('folding keeps the larger value, so a deleted session never takes a done day away', () => {
    const old = { '2026-11-10': { day: '2026-11-10', focus: { CFA: 1800 }, lecture: {}, reviews: {} } };
    const fresh = { '2026-11-10': { day: '2026-11-10', focus: { CFA: 600, Japanisch: 900 }, lecture: {}, reviews: { vocab: 3 } } };
    const f = foldExternal(old, fresh, '2026-11-12');
    expect(f['2026-11-10']).toEqual({ day: '2026-11-10', focus: { CFA: 1800, Japanisch: 900 }, lecture: {}, reviews: { vocab: 3 } });
    expect(foldExternal(old, {}, '2027-12-31')).toEqual({});
  });
});

describe('Streak sync between devices', () => {
  it('two devices converge, and seeded defaults agree on the earlier install', async () => {
    const salt = randomSalt();
    const key = await deriveKey('secret-pass', salt);
    const api = fakeApi({});
    const gh = createGitHub('t', { owner: 'me', repo: 'r' }, api.fetchFn);
    const habitsOf = (day: string) => bootstrapColl('habits', [{ id: 'cfa', createdDay: day }]);
    let mac: SyncData = { app: 'streak-app', v: 1, kv: { habits: habitsOf('2026-11-12'), marks: writeColl('marks', undefined, [{ id: 'm1' }], 100) }, devices: {} };
    let phone: SyncData = { app: 'streak-app', v: 1, kv: { habits: habitsOf('2026-11-20'), marks: writeColl('marks', undefined, [{ id: 'p1' }], 200) }, devices: {} };
    const sync = async (who: 'mac' | 'phone') =>
      runSync({
        github: gh, key, salt, deviceId: who, deviceName: who, now: () => 1000,
        readLocal: () => (who === 'mac' ? mac : phone),
        applyMerged: async (m) => { if (who === 'mac') mac = m; else phone = m; },
      });
    await sync('mac');
    await sync('phone');
    await sync('mac');
    expect(valueOf('marks', mac.kv.marks)).toEqual(valueOf('marks', phone.kv.marks));
    expect(valueOf('marks', mac.kv.marks)).toHaveLength(2);
    expect(valueOf('habits', phone.kv.habits)).toEqual([{ id: 'cfa', createdDay: '2026-11-12' }]);
    const writes = api.requests.filter((r) => r.method === 'PUT').length;
    await sync('phone');
    expect(api.requests.filter((r) => r.method === 'PUT').length).toBe(writes); // nothing new → no write
  });

  it('refuses a file encrypted with another password', async () => {
    const salt = randomSalt();
    const api = fakeApi({ 'streak.enc': await encryptJson({ app: 'streak-app', v: 1, kv: {}, devices: {} }, await deriveKey('right-pass', salt), salt) });
    const gh = createGitHub('t', { owner: 'me', repo: 'r' }, api.fetchFn);
    const wrong = await deriveKey('wrong-pass', salt);
    await expect(runSync({ github: gh, key: wrong, salt, deviceId: 'd', deviceName: 'd', readLocal: () => ({ app: 'streak-app', v: 1, kv: {}, devices: {} }), applyMerged: async () => {} })).rejects.toBeInstanceOf(WrongPasswordError);
    expect(api.requests.some((r) => r.method === 'PUT')).toBe(false);
    expect(await decryptJson(api.file('streak.enc')!.bytes, await deriveKey('right-pass', salt))).toMatchObject({ app: 'streak-app' });
  });

  it('names devices', () => {
    expect(deviceNameOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone');
  });
});
