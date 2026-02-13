import type { DayData } from './types';
import { COLORS, getUptimeColor } from './constants';

export interface UptimeBarDay {
  date: string;
  color: string;
  uptimePercent: number;
  avgResponseTime: number;
  hasData: boolean;
}

export function buildUptimeBarData(dailyData: DayData[]): UptimeBarDay[] {
  return dailyData.map(day => {
    const hasData = day.uptimePercent >= 0 && day.totalChecks > 0;
    return {
      date: day.date,
      color: hasData ? getUptimeColor(day.uptimePercent) : COLORS.noData,
      uptimePercent: hasData ? day.uptimePercent : -1,
      avgResponseTime: hasData ? day.avgResponseTime : 0,
      hasData,
    };
  });
}

export function formatUptime(percent: number): string {
  if (percent < 0) return 'N/A';
  if (percent >= 100) return '100%';
  return `${percent.toFixed(2)}%`;
}

export function formatResponseTime(ms: number): string {
  if (ms <= 0) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function timeAgo(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}
