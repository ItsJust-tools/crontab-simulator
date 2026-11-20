import type { ToolConfig } from '@itsjust/core';
import packageJson from '../../package.json';

export const templateBaseVersion = packageJson.version;

const toolConfig = {
  id: 'tool-1795205067',
  name: 'Crontab Simulator',
  description:
    'Simulate cron schedules: paste a crontab or enter a cron expression and see recent and upcoming fire times for each job.',
  version: '1.0.0',
  exportFormats: ['json', 'png', 'jpeg', 'webp', 'pdf'],
  features: {
    export: true,
    autoSave: true,
    undoRedo: true,
    sidebar: true,
    statusBar: true,
    darkMode: true,
  },
  theme: {
    accent: '#2563eb',
    accentHover: '#1d4ed8',
    accentSubtle: 'rgba(37, 99, 235, 0.08)',
    brand: 'Crontab Simulator',
    icon: '\u{23F0}',
  },
  shortcuts: [
    {
      title: 'Crontab Simulator',
      shortcuts: [
        { keys: 'Ctrl+Shift+E', label: 'Export All', description: 'exports all formats at once' },
      ],
    },
  ],
} satisfies ToolConfig;

export default toolConfig;
