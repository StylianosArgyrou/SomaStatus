export const BRAND = {
  name: 'Soma Weather',
  statusName: 'Soma Status',
  siteUrl: 'https://somaweather.com',
  statusUrl: 'https://status.somaweather.com',
  githubUrl: 'https://github.com/StylianosArgyrou/SomaStatus',
} as const;

export const COLORS = {
  up: '#22C55E',
  degraded: '#EAB308',
  down: '#EF4444',
  noData: '#374151',
  uptimeHigh: '#22C55E',
  uptimeMedHigh: '#86EFAC',
  uptimeMed: '#EAB308',
  uptimeMedLow: '#F97316',
  uptimeLow: '#EF4444',
  blue: '#2563EB',
  purple: '#8B5CF6',
  orange: '#F97316',
} as const;

export const STATUS_LABELS: Record<string, string> = {
  up: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
};

export const SEVERITY_COLORS: Record<string, string> = {
  minor: '#EAB308',
  major: '#F97316',
  critical: '#EF4444',
};

export const INCIDENT_STATUS_LABELS: Record<string, string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
};

export const DAYS_TO_SHOW = 90;
export const PAST_INCIDENTS_DAYS = 14;

export function getUptimeColor(percent: number): string {
  if (percent >= 100) return COLORS.uptimeHigh;
  if (percent >= 99.5) return COLORS.uptimeMedHigh;
  if (percent >= 99.0) return COLORS.uptimeMed;
  if (percent >= 95.0) return COLORS.uptimeMedLow;
  return COLORS.uptimeLow;
}

export function getStatusFromUptime(percent: number): 'up' | 'degraded' | 'down' {
  if (percent >= 99.5) return 'up';
  if (percent >= 95.0) return 'degraded';
  return 'down';
}
