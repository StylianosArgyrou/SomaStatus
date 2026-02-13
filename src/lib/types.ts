export type Status = 'up' | 'degraded' | 'down';
export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export type Severity = 'minor' | 'major' | 'critical';

export interface ComponentConfig {
  id: string;
  name: string;
  endpoint?: string;
  url?: string;
  params?: boolean;
  timeout: number;
  validate?: { field: string; value: string };
  expectedStatusCodes?: number[];
}

export interface GroupConfig {
  id: string;
  name: string;
  description: string;
  components: ComponentConfig[];
}

export interface ExternalConfig {
  id: string;
  name: string;
  url: string;
  timeout: number;
}

export interface Config {
  baseUrl: string;
  testLat: number;
  testLon: number;
  groups: GroupConfig[];
  external: ExternalConfig[];
}

export interface CheckResult {
  status: Status;
  responseTime: number;
  statusCode: number;
}

export interface CheckEntry {
  timestamp: string;
  results: Record<string, CheckResult>;
}

export interface DaySummary {
  totalChecks: number;
  upChecks: number;
  degradedChecks: number;
  downChecks: number;
  uptimePercent: number;
  avgResponseTime: number;
  p95ResponseTime: number;
}

export interface DailyCheckFile {
  date: string;
  checks: CheckEntry[];
  summary: Record<string, DaySummary>;
}

export interface IncidentUpdate {
  status: IncidentStatus;
  message: string;
  timestamp: string;
}

export interface Incident {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: Severity;
  affectedComponents: string[];
  createdAt: string;
  updates: IncidentUpdate[];
}

export interface ComponentStatus {
  id: string;
  name: string;
  status: Status;
  uptimePercent: number;
  avgResponseTime: number;
  dailyData: DayData[];
}

export interface DayData {
  date: string;
  uptimePercent: number;
  avgResponseTime: number;
  status: Status;
  totalChecks: number;
}

export interface GroupStatus {
  id: string;
  name: string;
  description: string;
  uptimePercent: number;
  status: Status;
  components: ComponentStatus[];
}
