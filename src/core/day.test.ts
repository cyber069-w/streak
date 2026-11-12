import { describe, expect, it } from 'vitest';
import { addDays, dayOf, daysBetween, diffDays, startOfDay, weekdayOf, weekStart } from './day';

const ms = (iso: string) => Date.parse(iso);

describe('days in Europe/Zurich', () => {
  it('switches day exactly at local midnight (winter, UTC+1)', () => {
    expect(dayOf(ms('2026-11-12T22:59:59Z'))).toBe('2026-11-12'); // 23:59:59
    expect(dayOf(ms('2026-11-12T23:00:00Z'))).toBe('2026-11-13'); // 00:00:00
  });

  it('switches day exactly at local midnight (summer, UTC+2)', () => {
    expect(dayOf(ms('2026-07-01T21:59:59Z'))).toBe('2026-07-01');
    expect(dayOf(ms('2026-07-01T22:00:00Z'))).toBe('2026-07-02');
  });

  it('does not depend on the device time zone', () => {
    const t = ms('2026-11-12T23:30:00Z');
    expect(dayOf(t)).toBe('2026-11-13');
    expect(dayOf(t, 'America/New_York')).toBe('2026-11-12');
  });

  it('spring DST change (29 Mar 2026): the day is 23 h long and still one day', () => {
    expect(startOfDay('2026-03-29')).toBe(ms('2026-03-28T23:00:00Z'));
    expect(startOfDay('2026-03-30')).toBe(ms('2026-03-29T22:00:00Z'));
    expect(dayOf(ms('2026-03-29T00:59:59Z'))).toBe('2026-03-29'); // 01:59:59 CET
    expect(dayOf(ms('2026-03-29T01:00:00Z'))).toBe('2026-03-29'); // 03:00:00 CEST
    expect(dayOf(ms('2026-03-29T21:59:59Z'))).toBe('2026-03-29'); // 23:59:59 CEST
    expect(dayOf(ms('2026-03-29T22:00:00Z'))).toBe('2026-03-30');
  });

  it('autumn DST change (25 Oct 2026): the day is 25 h long and still one day', () => {
    expect(startOfDay('2026-10-25')).toBe(ms('2026-10-24T22:00:00Z'));
    expect(startOfDay('2026-10-26')).toBe(ms('2026-10-25T23:00:00Z'));
    expect(dayOf(ms('2026-10-25T00:30:00Z'))).toBe('2026-10-25'); // 02:30 CEST
    expect(dayOf(ms('2026-10-25T01:30:00Z'))).toBe('2026-10-25'); // 02:30 CET (the repeated hour)
    expect(dayOf(ms('2026-10-25T22:59:59Z'))).toBe('2026-10-25');
    expect(dayOf(ms('2026-10-25T23:00:00Z'))).toBe('2026-10-26');
  });

  it('steps across DST without skipping or repeating a day', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(daysBetween('2026-03-27', '2026-03-31')).toEqual(['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
    expect(diffDays('2026-03-01', '2026-04-01')).toBe(31);
    expect(diffDays('2027-03-27', '2027-03-29')).toBe(2); // 28 Mar 2027 DST
  });

  it('weekdays and week starts (Monday first)', () => {
    expect(weekdayOf('2026-11-02')).toBe(1);
    expect(weekdayOf('2026-11-08')).toBe(7);
    expect(weekStart('2026-11-12')).toBe('2026-11-09');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
  });
});
