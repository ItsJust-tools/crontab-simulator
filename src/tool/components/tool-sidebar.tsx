'use client';

import { useCallback } from 'react';
import type { CrontabSimulatorState } from '../types';

interface ToolSidebarProps {
  state: CrontabSimulatorState;
  onChange: (patch: Partial<CrontabSimulatorState>) => void;
}

const HELP_LINK = 'https://man7.org/linux/man-pages/man5/crontab.5.html';

export function ToolSidebar({ state, onChange }: ToolSidebarProps) {
  const handleCrontabChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange({ crontab: e.target.value }),
    [onChange],
  );
  const handleExpressionChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ expression: e.target.value }),
    [onChange],
  );
  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ filter: e.target.value }),
    [onChange],
  );
  const handleReferenceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (!value) return;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return;
      onChange({ referenceIso: date.toISOString() });
    },
    [onChange],
  );

  return (
    <div className="notepad-sidebar cron-sidebar">
      <div className="sidebar-section">
        <h3>Mode</h3>
        <div className="cron-mode-toggle" role="radiogroup" aria-label="Input mode">
          <button
            type="button"
            role="radio"
            aria-checked={state.mode === 'crontab'}
            className={`cron-mode-btn ${state.mode === 'crontab' ? 'active' : ''}`}
            onClick={() => onChange({ mode: 'crontab' })}
          >
            Crontab
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={state.mode === 'single'}
            className={`cron-mode-btn ${state.mode === 'single' ? 'active' : ''}`}
            onClick={() => onChange({ mode: 'single' })}
          >
            Single expression
          </button>
        </div>
        <p className="sidebar-hint">
          <a href={HELP_LINK} target="_blank" rel="noreferrer noopener">
            Crontab syntax reference
          </a>
        </p>
      </div>

      {state.mode === 'crontab' ? (
        <div className="sidebar-section">
          <h3>Crontab</h3>
          <textarea
            className="crontab-input"
            value={state.crontab}
            onChange={handleCrontabChange}
            placeholder={'*/5 * * * * every-five-minutes.sh\n0 9 * * MON-FRI morning-report.sh'}
            aria-label="Crontab content"
            spellCheck={false}
            rows={10}
          />
        </div>
      ) : (
        <div className="sidebar-section">
          <h3>Cron expression</h3>
          <input
            type="text"
            className="cron-expression-input"
            value={state.expression}
            onChange={handleExpressionChange}
            placeholder="*/5 * * * *"
            aria-label="Cron expression"
            spellCheck={false}
          />
        </div>
      )}

      <div className="sidebar-section">
        <h3>Options</h3>
        <label className="cron-option">
          <span>Reference time</span>
          <input
            type="datetime-local"
            onChange={handleReferenceChange}
            aria-label="Reference time for simulation"
          />
        </label>
        <label className="cron-option">
          <span>Last fire times</span>
          <input
            type="number"
            min={0}
            max={50}
            value={state.lastCount}
            onChange={(e) => onChange({ lastCount: Math.max(0, Number(e.target.value) || 0) })}
            aria-label="Number of last fire times"
          />
        </label>
        <label className="cron-option">
          <span>Next fire times</span>
          <input
            type="number"
            min={0}
            max={50}
            value={state.nextCount}
            onChange={(e) => onChange({ nextCount: Math.max(0, Number(e.target.value) || 0) })}
            aria-label="Number of next fire times"
          />
        </label>
        <label className="cron-option">
          <span>Filter jobs</span>
          <input
            type="search"
            value={state.filter}
            onChange={handleFilterChange}
            placeholder="Filter by name or command"
            aria-label="Filter jobs by name or command substring"
          />
        </label>
      </div>
    </div>
  );
}
