import { describe, it, expect } from 'vitest';
import {
  parseCronExpression,
  nextFireTimes,
  lastFireTimes,
  parseCrontab,
  explainExpression,
  isCronJob,
  formatDateTime,
} from '../../src/tool/cron-engine';

describe('cron engine parsing', () => {
  it('parses */5 * * * * to fire every 5 minutes at :00,:05,...', () => {
    const expr = parseCronExpression('*/5 * * * *');
    const reference = new Date('2026-11-20T21:01:00');
    const next = nextFireTimes(expr, reference, 3);
    expect(next).toHaveLength(3);
    expect(next.map((d) => d.getMinutes())).toEqual([5, 10, 15]);
    expect(next.map((d) => d.getHours())).toEqual([21, 21, 21]);
  });

  it('nextFireTimes returns future times strictly after a reference date', () => {
    const expr = parseCronExpression('0 * * * *');
    const reference = new Date('2026-11-20T21:00:00');
    const next = nextFireTimes(expr, reference, 2);
    const first = next[0]!;
    expect(first.getTime()).toBeGreaterThan(reference.getTime());
    expect(first.getHours()).toBe(22);
  });

  it('day-of-week names (MON-FRI) parse and schedule correctly', () => {
    const expr = parseCronExpression('0 9 * * MON-FRI');
    // 2026-11-20 is a Friday; Nov 21-22 is the weekend.
    const reference = new Date('2026-11-20T21:00:00');
    const times = nextFireTimes(expr, reference, 10);
    const weekdays = times.filter((d) => d.getDay() >= 1 && d.getDay() <= 5);
    expect(weekdays).toHaveLength(10);
    expect(times[0]!.getDate()).toBe(23);
    expect(times[0]!.getHours()).toBe(9);
    const firstMonday = times.find((d) => d.getDay() === 1)!;
    expect(firstMonday.getDate()).toBe(23);
  });

  it('invalid expressions surface a validation error', () => {
    expect(() => parseCronExpression('99 * * * *')).toThrow(/range/);
    expect(() => parseCronExpression('* * * *')).toThrow(/Expected 5 fields/);
    expect(() => parseCronExpression('')).toThrow(/Empty cron expression/);
    expect(() => parseCronExpression('* * * * FOO')).toThrow(/Invalid value/);
    expect(() => parseCronExpression('* * * * 1-5/0')).toThrow(/Invalid step/);
  });

  it('parses ranges, lists, steps and name tokens', () => {
    const expr = parseCronExpression('0 0 1,15 JAN-MAR *');
    expect(expr.dayOfMonth.values.has(1)).toBe(true);
    expect(expr.dayOfMonth.values.has(15)).toBe(true);
    expect(expr.month.values.has(1)).toBe(true);
    expect(expr.month.values.has(3)).toBe(true);
    expect(expr.month.values.has(4)).toBe(false);
  });

  it('treats day-of-week 7 as Sunday (0)', () => {
    const expr = parseCronExpression('0 0 * * 7');
    expect(expr.dayOfWeek.values.has(0)).toBe(true);
  });

  it('lastFireTimes returns strictly prior times in ascending order', () => {
    const expr = parseCronExpression('*/10 * * * *');
    const reference = new Date('2026-11-20T21:05:00');
    const last = lastFireTimes(expr, reference, 3);
    expect(last).toHaveLength(3);
    expect(last[0]!.getTime()).toBeLessThan(reference.getTime());
    expect(last[2]!.getTime()).toBeLessThan(reference.getTime());
    expect(last.map((d) => d.getMinutes())).toEqual([40, 50, 0]);
  });

  it('respects day-of-month/day-of-week OR semantics when both restricted', () => {
    // Both restricted: fire when either matches. Nov 20 2026 is a Friday (dow 5).
    const expr = parseCronExpression('0 0 1 * FRI');
    const reference = new Date('2026-11-19T12:00:00');
    const next = nextFireTimes(expr, reference, 3);
    // Next: Nov 20 (Friday, dow matches) then Dec 1 (dom matches, Tuesday).
    expect(formatDateTime(next[0]!)).toBe('2026-11-20 00:00');
  });
});

describe('explainExpression', () => {
  it('explains wildcards and concrete values in plain English', () => {
    const expr = parseCronExpression('*/15 9-17 * * MON,THU');
    const text = explainExpression(expr);
    expect(text).toContain('Minute:');
    expect(text).toContain('Hour: only 9-17');
    expect(text).toContain('every value (1-31)');
    // MON = 1, THU = 4 sorted
    expect(text).toContain('only 1, 4');
  });
});

describe('parseCrontab', () => {
  const crontab = [
    '# This is a comment',
    '',
    'MAILTO=admin@example.com',
    '*/5 * * * * curl health.sh',
    '0 9 * * MON-FRI standup.sh',
    '@reboot cleanup.sh',
    'bogus line only three',
  ].join('\n');

  it('skips comments and blank lines', () => {
    const lines = parseCrontab(crontab);
    const jobLines = lines.filter((l) => l.kind === 'job');
    expect(jobLines).toHaveLength(2);
    expect(lines.some((l) => l.raw.startsWith('#'))).toBe(false);
    expect(lines.some((l) => l.raw === '')).toBe(false);
  });

  it('parses jobs with commands and env lines', () => {
    const lines = parseCrontab(crontab);
    const env = lines.find((l) => l.kind === 'env')!;
    expect(env.envName).toBe('MAILTO');
    const jobs = lines.filter((l) => l.kind === 'job');
    expect(jobs[0]!.command).toBe('curl health.sh');
    expect(jobs[1]!.command).toBe('standup.sh');
    expect(isCronJob(jobs[0]!)).toBe(true);
  });

  it('surfaces invalid lines with clear errors', () => {
    const lines = parseCrontab(crontab);
    const invalid = lines.find((l) => l.kind === 'invalid')!;
    expect(invalid.error).toBeTruthy();
    const reboot = lines.find((l) => l.kind === 'alias-unsupported')!;
    expect(reboot.alias).toBe('@reboot');
  });

  it('supports cron aliases for job lines', () => {
    const lines = parseCrontab('@daily nightly.sh');
    const first = lines[0]!;
    expect(first.kind).toBe('job');
    expect(isCronJob(first)).toBe(true);
    if (isCronJob(first)) {
      expect(first.expression.original).toBe('0 0 * * *');
      expect(first.command).toBe('nightly.sh');
    }
  });
});

describe('formatDateTime', () => {
  it('formats as YYYY-MM-DD HH:mm', () => {
    expect(formatDateTime(new Date('2026-01-05T09:07:00'))).toBe('2026-01-05 09:07');
  });
});
