import type { Tool, DeserializeResult } from '@itsjust/core';
import toolConfig from './tool.config';
import {
  parseCrontab,
  parseCronExpression,
  nextFireTimes,
  lastFireTimes,
  explainExpression,
  isCronJob,
  formatDateTime,
  type ParsedCronLine,
} from './cron-engine';
import type {
  CrontabSimulatorState,
  CrontabSimulatorError,
  SimulatedJob,
} from './types';
import { DEFAULT_LAST_COUNT, DEFAULT_NEXT_COUNT } from './types';

function referenceDate(state: CrontabSimulatorState): Date {
  const parsed = new Date(state.referenceIso);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date();
}

function initialStateNow(): CrontabSimulatorState {
  return {
    crontab: `# m h dom mon dow  command
*/5 * * * * curl -s https://example.com/health
0 9 * * MON-FRI /usr/bin/send-standup-reminder
30 2 1,15 * * /usr/local/bin/backup.sh
`,
    expression: '*/15 * * * *',
    mode: 'crontab',
    referenceIso: new Date().toISOString(),
    lastCount: DEFAULT_LAST_COUNT,
    nextCount: DEFAULT_NEXT_COUNT,
    filter: '',
  };
}

interface SimulationResult {
  jobs: SimulatedJob[];
  errors: CrontabSimulatorError[];
  skipped: number;
}

/** Simulate a valid state into concrete fire-time lists. Not part of the Tool contract. */
export function simulate(state: CrontabSimulatorState): SimulationResult {
  const reference = referenceDate(state);
  const jobs: SimulatedJob[] = [];
  const errors: CrontabSimulatorError[] = [];
  const filterLower = state.filter.trim().toLowerCase();

  const acceptFilter = (job: SimulatedJob): boolean =>
    !filterLower ||
    job.command.toLowerCase().includes(filterLower) ||
    job.raw.toLowerCase().includes(filterLower);

  if (state.mode === 'single') {
    try {
      const expression = parseCronExpression(state.expression);
      const job: SimulatedJob = {
        raw: state.expression,
        lineIndex: 0,
        command: '',
        explanation: explainExpression(expression),
        original: expression.original,
        last: lastFireTimes(expression, reference, state.lastCount).map(formatDateTime),
        next: nextFireTimes(expression, reference, state.nextCount).map(formatDateTime),
      };
      if (acceptFilter(job)) jobs.push(job);
    } catch (err) {
      errors.push({
        raw: state.expression,
        lineIndex: 0,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return { jobs, errors, skipped: 0 };
  }

  const lines: ParsedCronLine[] = parseCrontab(state.crontab);
  let skipped = 0;
  for (const line of lines) {
    if (line.kind === 'invalid') {
      errors.push({ raw: line.raw, lineIndex: line.lineIndex, message: line.error ?? 'Invalid line' });
      continue;
    }
    if (line.kind === 'env' || line.kind === 'alias-unsupported') {
      skipped += 1;
      continue;
    }
    if (!isCronJob(line)) continue;
    const job: SimulatedJob = {
      raw: line.raw,
      lineIndex: line.lineIndex,
      command: line.command ?? '',
      explanation: explainExpression(line.expression),
      original: line.expression.original,
      last: lastFireTimes(line.expression, reference, state.lastCount).map(formatDateTime),
      next: nextFireTimes(line.expression, reference, state.nextCount).map(formatDateTime),
    };
    if (acceptFilter(job)) jobs.push(job);
  }
  return { jobs, errors, skipped };
}

function isToolState(value: unknown): value is CrontabSimulatorState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<CrontabSimulatorState>;
  return (
    typeof v.crontab === 'string' &&
    typeof v.expression === 'string' &&
    (v.mode === 'crontab' || v.mode === 'single') &&
    typeof v.referenceIso === 'string' &&
    typeof v.lastCount === 'number' &&
    typeof v.nextCount === 'number' &&
    typeof v.filter === 'string'
  );
}

export const crontabSimulatorTool: Tool<CrontabSimulatorState> = {
  id: toolConfig.id,
  name: toolConfig.name,
  version: toolConfig.version,
  config: toolConfig,
  initialState: initialStateNow(),
  serialize: (state) => JSON.stringify(state),
  deserialize: (data): DeserializeResult<CrontabSimulatorState> => {
    try {
      if (isToolState(data)) {
        return { success: true, data: data };
      }
      return { success: false, error: 'Invalid data format: expected crontab simulator state' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deserialization error';
      return { success: false, error: `Failed to deserialize state: ${message}` };
    }
  },
  exporters: [
    { format: 'png', loader: () => import('./exporters/png') },
    { format: 'jpeg', loader: () => import('./exporters/jpeg') },
    { format: 'webp', loader: () => import('./exporters/webp') },
    { format: 'pdf', loader: () => import('./exporters/pdf') },
  ],
};

/** Back-compat alias used by tests and framework glue. */
export class CrontabSimulatorToolDefinition {
  get initialState(): CrontabSimulatorState {
    return crontabSimulatorTool.initialState;
  }

  serialize(state: CrontabSimulatorState): string {
    return crontabSimulatorTool.serialize(state);
  }

  deserialize(serialized: string): DeserializeResult<CrontabSimulatorState> {
    try {
      const parsed: unknown = JSON.parse(serialized);
      return crontabSimulatorTool.deserialize(parsed);
    } catch {
      return { success: false, error: 'Invalid data format: expected crontab simulator state' };
    }
  }

  simulate(state: CrontabSimulatorState): SimulationResult {
    return simulate(state);
  }
}
