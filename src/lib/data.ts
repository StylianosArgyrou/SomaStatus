import fs from 'node:fs';
import path from 'node:path';
import type { Config, DailyCheckFile, Incident, GroupStatus, ComponentStatus, DayData } from './types';
import { DAYS_TO_SHOW, getStatusFromUptime } from './constants';

const DATA_DIR = path.resolve('data');

export function loadConfig(): Config {
  const raw = fs.readFileSync(path.join(DATA_DIR, 'config.json'), 'utf-8');
  return JSON.parse(raw);
}

export function loadActiveIncidents(): Incident[] {
  const filePath = path.join(DATA_DIR, 'incidents', 'active.json');
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

export function loadArchivedIncidents(yearMonth: string): Incident[] {
  const filePath = path.join(DATA_DIR, 'incidents', 'archive', `${yearMonth}.json`);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function getDatesRange(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function loadDailyFile(date: string): DailyCheckFile | null {
  const filePath = path.join(DATA_DIR, 'checks', `${date}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getLatestCheck(): { timestamp: string; results: Record<string, { status: string; responseTime: number }> } | null {
  const today = new Date().toISOString().split('T')[0];
  const file = loadDailyFile(today);
  if (!file || !file.checks || file.checks.length === 0) return null;
  return file.checks[file.checks.length - 1];
}

export function buildGroupStatuses(): GroupStatus[] {
  const config = loadConfig();
  const dates = getDatesRange(DAYS_TO_SHOW);
  const dailyFiles = new Map<string, DailyCheckFile>();

  for (const date of dates) {
    const file = loadDailyFile(date);
    if (file) dailyFiles.set(date, file);
  }

  const allComponentIds = [
    ...config.groups.flatMap(g => g.components.map(c => c.id)),
    ...config.external.map(e => e.id),
  ];

  // Build per-component daily data
  const componentDailyData = new Map<string, DayData[]>();
  for (const id of allComponentIds) {
    const days: DayData[] = [];
    for (const date of dates) {
      const file = dailyFiles.get(date);
      const summary = file?.summary?.[id];
      if (summary) {
        days.push({
          date,
          uptimePercent: summary.uptimePercent,
          avgResponseTime: summary.avgResponseTime,
          status: getStatusFromUptime(summary.uptimePercent),
          totalChecks: summary.totalChecks,
        });
      } else {
        days.push({
          date,
          uptimePercent: -1,
          avgResponseTime: 0,
          status: 'up',
          totalChecks: 0,
        });
      }
    }
    componentDailyData.set(id, days);
  }

  // Get latest check for current status
  const latestCheck = getLatestCheck();

  function buildComponentStatus(id: string, name: string): ComponentStatus {
    const dailyData = componentDailyData.get(id) || [];
    const daysWithData = dailyData.filter(d => d.uptimePercent >= 0);
    const overallUptime = daysWithData.length > 0
      ? daysWithData.reduce((sum, d) => sum + d.uptimePercent, 0) / daysWithData.length
      : 100;
    const avgResponseTime = daysWithData.length > 0
      ? Math.round(daysWithData.reduce((sum, d) => sum + d.avgResponseTime, 0) / daysWithData.length)
      : 0;

    // Use latest check for current status if available
    let currentStatus: 'up' | 'degraded' | 'down' = getStatusFromUptime(overallUptime);
    if (latestCheck?.results?.[id]) {
      currentStatus = latestCheck.results[id].status as 'up' | 'degraded' | 'down';
    }

    return {
      id,
      name,
      status: currentStatus,
      uptimePercent: Math.round(overallUptime * 100) / 100,
      avgResponseTime,
      dailyData,
    };
  }

  const groups: GroupStatus[] = config.groups.map(group => {
    const components = group.components.map(c => buildComponentStatus(c.id, c.name));
    const groupUptime = components.length > 0
      ? components.reduce((sum, c) => sum + c.uptimePercent, 0) / components.length
      : 100;
    const worstStatus = components.reduce<'up' | 'degraded' | 'down'>((worst, c) => {
      if (c.status === 'down') return 'down';
      if (c.status === 'degraded' && worst !== 'down') return 'degraded';
      return worst;
    }, 'up');

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      uptimePercent: Math.round(groupUptime * 100) / 100,
      status: worstStatus,
      components,
    };
  });

  // Add external as a separate group
  if (config.external.length > 0) {
    const externalComponents = config.external.map(e => buildComponentStatus(e.id, e.name));
    const extUptime = externalComponents.reduce((sum, c) => sum + c.uptimePercent, 0) / externalComponents.length;
    const worstStatus = externalComponents.reduce<'up' | 'degraded' | 'down'>((worst, c) => {
      if (c.status === 'down') return 'down';
      if (c.status === 'degraded' && worst !== 'down') return 'degraded';
      return worst;
    }, 'up');

    groups.push({
      id: 'external',
      name: 'External Dependencies',
      description: 'Third-party services Soma depends on',
      uptimePercent: Math.round(extUptime * 100) / 100,
      status: worstStatus,
      components: externalComponents,
    });
  }

  return groups;
}

export function getOverallStatus(groups: GroupStatus[]): { status: 'up' | 'degraded' | 'down'; label: string } {
  const hasDown = groups.some(g => g.components.some(c => c.status === 'down'));

  // Degraded services are still operational — only "down" changes the hero
  const status = hasDown ? 'down' as const : 'up' as const;
  const label = hasDown ? 'System Outage' : 'All Systems Operational';

  return { status, label };
}

export function getRecentIncidents(days: number): Map<string, Incident[]> {
  const dates = getDatesRange(days);
  const active = loadActiveIncidents();
  const result = new Map<string, Incident[]>();

  // Collect archived incidents from relevant months
  const months = new Set(dates.map(d => d.substring(0, 7)));
  const archived: Incident[] = [];
  for (const month of months) {
    archived.push(...loadArchivedIncidents(month));
  }

  const allIncidents = [...active, ...archived];

  for (const date of dates) {
    const dayIncidents = allIncidents.filter(inc => {
      const incDate = inc.createdAt.split('T')[0];
      return incDate === date;
    });
    result.set(date, dayIncidents);
  }

  return result;
}
