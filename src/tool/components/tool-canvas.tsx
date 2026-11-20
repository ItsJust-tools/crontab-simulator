'use client';

import { useCallback, useState } from 'react';
import type { SimulatedJob, CrontabSimulatorError } from '../types';

interface ToolCanvasProps {
  jobs: SimulatedJob[];
  errors: CrontabSimulatorError[];
  skipped: number;
  canvasRef?: React.RefObject<HTMLDivElement | null>;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [text]);
  return (
    <button type="button" className="cron-copy-btn" onClick={handleCopy} aria-label={label}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function JobCard({ job }: { job: SimulatedJob }) {
  return (
    <div className="cron-job-card" data-testid="cron-job">
      <div className="cron-job-header">
        <code className="cron-job-expression">{job.original}</code>
        <CopyButton
          label={`Copy fire times for ${job.original}`}
          text={[...job.last, ...job.next].join('\n')}
        />
      </div>
      {job.command && <div className="cron-job-command">{job.command}</div>}
      <div className="cron-job-times">
        <div className="cron-times-group">
          <h4>Last {job.last.length}</h4>
          {job.last.length === 0 ? (
            <p className="cron-empty">No recent fire times found.</p>
          ) : (
            <ul>
              {job.last.map((t) => (
                <li key={`last-${t}`}>{t}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="cron-times-group">
          <h4>Next {job.next.length}</h4>
          {job.next.length === 0 ? (
            <p className="cron-empty">No upcoming fire times found.</p>
          ) : (
            <ul>
              {job.next.map((t) => (
                <li key={`next-${t}`}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <details className="cron-job-explanation">
        <summary>Explain fields</summary>
        <pre>{job.explanation}</pre>
      </details>
    </div>
  );
}

export function ToolCanvas({ jobs, errors, skipped, canvasRef }: ToolCanvasProps) {
  return (
    <div ref={canvasRef} className="cron-canvas" role="application" aria-label="Crontab simulation results">
      {errors.length > 0 && (
        <div className="cron-errors" role="alert" data-testid="cron-errors">
          <h3>Validation errors</h3>
          {errors.map((e) => (
            <div key={`err-${e.lineIndex}`} className="cron-error-item">
              <code>{e.raw || '(empty)'}</code>
              <p>{e.message}</p>
            </div>
          ))}
        </div>
      )}
      {skipped > 0 && (
        <p className="cron-skipped" data-testid="cron-skipped">
          {skipped} line{skipped === 1 ? '' : 's'} skipped (comments, blank lines, or non-simulatable entries).
        </p>
      )}
      {jobs.length === 0 && errors.length === 0 && (
        <p className="cron-empty-state" data-testid="cron-empty-state">
          No jobs to simulate yet. Paste a crontab or enter a cron expression.
        </p>
      )}
      <div className="cron-jobs">{jobs.map((job) => <JobCard key={`${job.lineIndex}-${job.original}`} job={job} />)}</div>
    </div>
  );
}
