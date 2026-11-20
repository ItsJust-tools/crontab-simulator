export interface SimulatedJob {
  raw: string;
  lineIndex: number;
  command: string;
  /** Plain-English per-field explanation. */
  explanation: string;
  original: string;
  last: string[];
  next: string[];
}

export interface CrontabSimulatorError {
  raw: string;
  lineIndex: number;
  message: string;
}

export interface CrontabSimulatorState {
  /** Whole crontab text pasted by the user. */
  crontab: string;
  /** Single-expression mode cron string (used in single mode). */
  expression: string;
  /** 'crontab' = full file mode, 'single' = single expression mode. */
  mode: 'crontab' | 'single';
  /** Reference date ISO string used as the simulation anchor. */
  referenceIso: string;
  /** How many past fire times to show per job. */
  lastCount: number;
  /** How many upcoming fire times to show per job. */
  nextCount: number;
  /** Filter substring applied to name/command. */
  filter: string;
}

export const DEFAULT_LAST_COUNT = 5;
export const DEFAULT_NEXT_COUNT = 5;
