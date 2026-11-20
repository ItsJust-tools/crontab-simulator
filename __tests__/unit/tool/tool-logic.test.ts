import { describe, it, expect } from 'vitest';
import {
  crontabSimulatorTool,
  simulate,
  CrontabSimulatorToolDefinition,
} from '@/tool/tool-definition';
import type { CrontabSimulatorState } from '@/tool/types';

function makeState(overrides: Partial<CrontabSimulatorState> = {}): CrontabSimulatorState {
  return {
    crontab: '',
    expression: '',
    mode: 'crontab',
    referenceIso: new Date('2026-11-20T21:00:00').toISOString(),
    lastCount: 5,
    nextCount: 5,
    filter: '',
    ...overrides,
  };
}

describe('crontab simulator tool state', () => {
  it('has a sensible initial state with sample crontab', () => {
    const s = crontabSimulatorTool.initialState;
    expect(s.mode).toBe('crontab');
    expect(s.crontab.length).toBeGreaterThan(0);
    expect(s.referenceIso).toBeTruthy();
  });

  it('round-trips through serialize/deserialize', () => {
    const state = makeState({ crontab: '0 9 * * * job.sh', filter: 'job' });
    const serialized = crontabSimulatorTool.serialize(state);
    const deserialized = crontabSimulatorTool.deserialize(JSON.parse(serialized));
    expect(deserialized.success).toBe(true);
    if (deserialized.success) {
      expect(deserialized.data).toEqual(state);
    }
  });

  it('rejects malformed state objects', () => {
    expect(crontabSimulatorTool.deserialize(null).success).toBe(false);
    expect(crontabSimulatorTool.deserialize({}).success).toBe(false);
    expect(
      crontabSimulatorTool.deserialize({ ...makeState(), mode: 'bogus' }).success
    ).toBe(false);
    const def = new CrontabSimulatorToolDefinition();
    expect(def.deserialize('not json').success).toBe(false);
  });
});

describe('simulate (crontab mode)', () => {
  it('produces fire times matching the schedule', () => {
    const state = makeState({
      crontab: '*/15 * * * * quarter-hourly.sh',
      referenceIso: new Date('2026-11-20T21:00:00').toISOString(),
    });
    const result = simulate(state);
    expect(result.errors).toHaveLength(0);
    expect(result.jobs).toHaveLength(1);
    const job = result.jobs[0]!;
    expect(job.command).toBe('quarter-hourly.sh');
    // Reference is exactly at 21:00; next fire is strictly after: 21:15 (UTC==local in test env).
    expect(job.next[0]).toContain('21:15');
    expect(job.last).toHaveLength(5);
    expect(job.next).toHaveLength(5);
  });

  it('aggregates errors for invalid lines', () => {
    const state = makeState({
      crontab: 'this is not cron at all\n*/5 * * * * ok.sh',
    });
    const result = simulate(state);
    expect(result.errors).toHaveLength(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.errors[0]!.message).toBeTruthy();
  });

  it('filters jobs by command substring', () => {
    const state = makeState({
      crontab: '*/5 * * * * backup.sh\n0 0 * * * cleanup.sh',
      filter: 'backup',
    });
    const result = simulate(state);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]!.command).toBe('backup.sh');
  });

  it('respects lastCount and nextCount limits', () => {
    const state = makeState({
      crontab: '* * * * * every-minute.sh',
      lastCount: 2,
      nextCount: 3,
    });
    const result = simulate(state);
    expect(result.jobs[0]!.last).toHaveLength(2);
    expect(result.jobs[0]!.next).toHaveLength(3);
  });

  it('skips comments, blank lines, env lines and @reboot', () => {
    const state = makeState({
      crontab: '# comment\n\nMAILTO=me@example.com\n@reboot boot.sh\n*/5 * * * * tick.sh',
    });
    const result = simulate(state);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]!.command).toBe('tick.sh');
    expect(result.skipped).toBe(2);
  });
});

describe('simulate (single mode)', () => {
  it('simulates a bare expression', () => {
    const state = makeState({ mode: 'single', expression: '0 9 * * *' });
    const result = simulate(state);
    expect(result.errors).toHaveLength(0);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]!.next[0]!.endsWith('09:00')).toBe(true);
  });

  it('reports validation errors for bad expressions', () => {
    const state = makeState({ mode: 'single', expression: 'not cron' });
    const result = simulate(state);
    expect(result.jobs).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/Invalid cron expression|Expected 5 fields|Invalid value/);
  });

  it('single-mode filter applies and returns empty when no match', () => {
    const state = makeState({ mode: 'single', expression: '0 9 * * *', filter: 'zzz' });
    const result = simulate(state);
    expect(result.jobs).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('tool definition class', () => {
  it('simulate returns consistent results with function form', () => {
    const def = new CrontabSimulatorToolDefinition();
    const state = makeState({ crontab: '*/10 * * * * x.sh' });
    expect(def.simulate(state).jobs.length).toBe(simulate(state).jobs.length);
  });
});
