/**
 * Cron parsing and simulation engine. Fully client-side, no dependencies.
 *
 * Supports standard 5-field cron expressions:
 *   minute hour day-of-month month day-of-week
 * with star-slash-n step syntax, ranges (a-b), comma lists, and month/day names (JAN/MON).
 * Also supports cron aliases: @hourly, @daily, @midnight, @weekly, @monthly,
 * @yearly, @annually, and @reboot (reported as unsupported for simulation).
 */

export interface CronFieldSpec {
  /** Set of allowed values for this field. */
  values: Set<number>;
  /** True when the field is a bare star (unrestricted). */
  wildcard: boolean;
}

export interface CronExpression {
  minute: CronFieldSpec;
  hour: CronFieldSpec;
  dayOfMonth: CronFieldSpec;
  month: CronFieldSpec;
  dayOfWeek: CronFieldSpec;
  original: string;
}

export interface ParsedCronLine {
  kind: 'job' | 'env' | 'alias-unsupported' | 'invalid';
  /** Raw line without leading/trailing whitespace. */
  raw: string;
  /** 0-based index in the original input (counting every physical line). */
  lineIndex: number;
  /** Name from a NAME=value env line, when kind is 'env'. */
  envName?: string;
  /** Alias token for unsupported aliases (e.g. '@reboot'). */
  alias?: string;
  /** Parsed expression when valid. */
  expression?: CronExpression;
  /** Human-readable error when invalid. */
  error?: string;
  /** Command part of a job line (everything after the schedule). */
  command?: string;
}

export interface CronJob extends ParsedCronLine {
  kind: 'job';
  expression: CronExpression;
  command: string;
}

export function isCronJob(line: ParsedCronLine): line is CronJob {
  return line.kind === 'job';
}

const MONTH_NAMES: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const DOW_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const ALIASES: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
};

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week
];

function parseField(
  text: string,
  min: number,
  max: number,
  names?: Record<string, number>
): CronFieldSpec {
  const values = new Set<number>();
  let wildcard = false;

  for (const partRaw of text.split(',')) {
    const part = partRaw.trim();
    if (!part) throw new Error(`Empty list entry in field "${text}"`);

    // Handle step suffix: "*/n", "a-b/n", "a/n"
    let step = 1;
    let rangePart = part;
    const slash = part.indexOf('/');
    if (slash !== -1) {
      rangePart = part.slice(0, slash);
      const stepText = part.slice(slash + 1);
      step = Number(stepText);
      if (!Number.isInteger(step) || step < 1) {
        throw new Error(`Invalid step "/${stepText}" in field "${text}"`);
      }
    }

    let start: number;
    let end: number;
    if (rangePart === '*') {
      if (slash === -1) wildcard = true;
      start = min;
      end = max;
    } else if (rangePart.includes('-')) {
      const dash = rangePart.indexOf('-');
      start = resolveFieldToken(rangePart.slice(0, dash), names, text);
      end = resolveFieldToken(rangePart.slice(dash + 1), names, text);
    } else {
      // Single value (possibly with step like "5/15" meaning start at 5 step 15)
      start = resolveFieldToken(rangePart, names, text);
      end = slash === -1 ? start : max;
    }

    // Allow cron day-of-week 7 (Sunday) before the range check.
    if (max === 6) {
      if (start === 7) start = 0;
      if (end === 7) end = 0;
    }
    if (start < min || end > max || start > end) {
      throw new Error(`Value out of range (${min}-${max}) in field "${text}"`);
    }
    for (let v = start; v <= end; v += step) values.add(v);
  }

  // Normalize cron day-of-week 7 -> 0 (Sunday)
  if (max === 6 && values.has(7)) {
    values.delete(7);
    values.add(0);
  }

  return { values, wildcard };
}

function resolveFieldToken(
  tokenRaw: string,
  names: Record<string, number> | undefined,
  fieldText: string
): number {
  const token = tokenRaw.trim().toUpperCase();
  if (names && token in names) return names[token] as number;
  const value = Number(tokenRaw);
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid value "${tokenRaw}" in field "${fieldText}"`);
  }
  return value;
}

export function parseCronExpression(expression: string): CronExpression {
  const trimmed = expression.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new Error('Empty cron expression');
  const fields = trimmed.split(' ');
  if (fields.length !== 5) {
    throw new Error(
      `Expected 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`
    );
  }
  const names: Array<Record<string, number> | undefined> = [
    MONTH_NAMES,
    MONTH_NAMES,
    undefined,
    MONTH_NAMES,
    DOW_NAMES,
  ];
  const specs: CronFieldSpec[] = [];
  try {
    for (let i = 0; i < fields.length; i++) {
      const [min, max] = FIELD_RANGES[i] as [number, number];
      specs.push(parseField(fields[i] as string, min, max, names[i]));
    }
  } catch (err) {
    throw new Error(
      `Invalid cron expression "${trimmed}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return {
    minute: specs[0] as CronFieldSpec,
    hour: specs[1] as CronFieldSpec,
    dayOfMonth: specs[2] as CronFieldSpec,
    month: specs[3] as CronFieldSpec,
    dayOfWeek: specs[4] as CronFieldSpec,
    original: trimmed,
  };
}

function fieldMatches(spec: CronFieldSpec, value: number): boolean {
  return spec.values.has(value);
}

/** Standard cron day matching: both dom & dow restricted -> either may match. */
function dayMatches(date: Date, dom: CronFieldSpec, dow: CronFieldSpec): boolean {
  const domMatch = fieldMatches(dom, date.getDate());
  const dowMatch = fieldMatches(dow, date.getDay());
  if (dom.wildcard && dow.wildcard) return true;
  if (dom.wildcard) return dowMatch;
  if (dow.wildcard) return domMatch;
  return domMatch || dowMatch;
}

function matches(date: Date, expression: CronExpression): boolean {
  return (
    fieldMatches(expression.minute, date.getMinutes()) &&
    fieldMatches(expression.hour, date.getHours()) &&
    fieldMatches(expression.month, date.getMonth() + 1) &&
    dayMatches(date, expression.dayOfMonth, expression.dayOfWeek)
  );
}

/** Iterate one minute at a time (positive for next, negative for previous). */
function collectTimes(
  expression: CronExpression,
  reference: Date,
  count: number,
  direction: 1 | -1
): Date[] {
  const results: Date[] = [];
  if (count <= 0) return results;
  const cursor = new Date(reference.getTime());
  cursor.setSeconds(0, 0);
  // Guard rails: max ~2 years of minute steps.
  const maxSteps = 2 * 366 * 24 * 60;
  for (let step = 0; step < maxSteps && results.length < count; step++) {
    cursor.setMinutes(cursor.getMinutes() + direction);
    if (matches(cursor, expression)) {
      results.push(new Date(cursor.getTime()));
    }
  }
  return results;
}

export function nextFireTimes(expression: CronExpression, reference: Date, count: number): Date[] {
  return collectTimes(expression, reference, count, 1);
}

export function lastFireTimes(expression: CronExpression, reference: Date, count: number): Date[] {
  // Walk backwards; reverse so most recent is last.
  return collectTimes(expression, reference, count, -1).reverse();
}

const FIELD_LABELS: Array<[keyof Omit<CronExpression, 'original'>, string]> = [
  ['minute', 'Minute'],
  ['hour', 'Hour'],
  ['dayOfMonth', 'Day of month'],
  ['month', 'Month'],
  ['dayOfWeek', 'Day of week'],
];

function describeField(spec: CronFieldSpec, min: number, max: number): string {
  if (spec.wildcard) return `every value (${min}-${max})`;
  const sorted = [...spec.values].sort((a, b) => a - b);
  // Compress consecutive runs into ranges.
  const parts: string[] = [];
  let runStart = sorted[0] as number;
  let prev = sorted[0] as number;
  const flush = () => {
    if (runStart === prev) parts.push(String(runStart));
    else parts.push(`${runStart}-${prev}`);
  };
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i] as number;
    if (current === prev + 1) {
      prev = current;
    } else {
      flush();
      runStart = current;
      prev = current;
    }
  }
  flush();
  const list = parts.join(', ');
  return list.length <= 40 ? `only ${list}` : `one of ${sorted.length} specific values`;
}

/** Plain-English explanation of each field of the expression. */
export function explainExpression(expression: CronExpression): string {
  const rangeFor = (key: keyof Omit<CronExpression, 'original'>): [number, number] => {
    switch (key) {
      case 'minute':
        return FIELD_RANGES[0] as [number, number];
      case 'hour':
        return FIELD_RANGES[1] as [number, number];
      case 'dayOfMonth':
        return FIELD_RANGES[2] as [number, number];
      case 'month':
        return FIELD_RANGES[3] as [number, number];
      case 'dayOfWeek':
        return FIELD_RANGES[4] as [number, number];
    }
  };
  return FIELD_LABELS.map(([key, label]) => {
    const [min, max] = rangeFor(key);
    return `${label}: ${describeField(expression[key], min, max)}`;
  }).join('\n');
}

/**
 * Parse a full crontab text (or a single expression) into lines.
 * - Blank lines are skipped.
 * - Lines starting with `#` are treated as comments and skipped.
 * - Lines matching `NAME=value` or `name = value` are recorded as env entries.
 * - `@reboot` is recognized but not simulatable.
 * - Job lines are `5 fields...` followed by the command; a single 5-field
 *   expression with no command is accepted as a bare expression job.
 */
export function parseCrontab(input: string): ParsedCronLine[] {
  const lines = input.split(/\r?\n/);
  const result: ParsedCronLine[] = [];

  lines.forEach((rawLine, lineIndex) => {
    const raw = rawLine.trim();
    if (!raw || raw.startsWith('#')) return;

    // Environment variable assignment: VAR=value or name = value
    const envMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (envMatch) {
      result.push({
        kind: 'env',
        raw,
        lineIndex,
        envName: envMatch[1],
      });
      return;
    }

    // Alias
    if (raw.startsWith('@')) {
      const token = (raw.split(/\s+/)[0] ?? '').toLowerCase();
      if (token === '@reboot') {
        result.push({ kind: 'alias-unsupported', raw, lineIndex, alias: token });
        return;
      }
      const mapped = ALIASES[token];
      if (!mapped) {
        result.push({
          kind: 'invalid',
          raw,
          lineIndex,
          error: `Unknown alias "${token}". Supported: @hourly, @daily, @weekly, @monthly, @yearly.`,
        });
        return;
      }
      const parts = raw.split(/\s+/);
      const expression = parseCronExpression(mapped);
      result.push({
        kind: 'job',
        raw,
        lineIndex,
        expression,
        command: parts.slice(1).join(' ') || `(${token})`,
      });
      return;
    }

    // Job line: first token is minute; need at least 5 tokens for schedule.
    const tokens = raw.split(/\s+/);
    if (tokens.length < 5) {
      // Maybe a bare single expression typed without a command but with too
      // few fields, e.g. "*/5 *". Surface the parse error.
      try {
        result.push({
          kind: 'job',
          raw,
          lineIndex,
          expression: parseCronExpression(raw),
          command: '',
        });
      } catch (err) {
        result.push({
          kind: 'invalid',
          raw,
          lineIndex,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    const schedule = tokens.slice(0, 5).join(' ');
    const command = tokens.slice(5).join(' ');
    try {
      const expression = parseCronExpression(schedule);
      result.push({
        kind: 'job',
        raw,
        lineIndex,
        expression,
        command: command || '(no command)',
      });
    } catch (err) {
      result.push({
        kind: 'invalid',
        raw,
        lineIndex,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return result;
}

export function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
