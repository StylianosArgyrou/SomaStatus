#!/usr/bin/env node

/**
 * Soma Status Monitor — Zero-dependency health check script
 * Runs via GitHub Actions every 5 minutes.
 * Uses Node 20 built-in fetch, fs, path.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const CHECKS_DIR = path.join(DATA_DIR, 'checks');

// ─── Load config ──────────────────────────────────────────────
const config = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'config.json'), 'utf-8'));
const { baseUrl, testLat, testLon, groups, external } = config;

// ─── Build check list ─────────────────────────────────────────
function buildChecks() {
  const checks = [];

  for (const group of groups) {
    for (const comp of group.components) {
      let url;
      if (comp.url) {
        url = comp.url;
      } else {
        const params = comp.params ? `?lat=${testLat}&lon=${testLon}` : '';
        url = `${baseUrl}${comp.endpoint}${params}`;
      }
      checks.push({
        id: comp.id,
        name: comp.name,
        url,
        timeout: comp.timeout || 10000,
        validate: comp.validate || null,
        expectedStatusCodes: comp.expectedStatusCodes || [200],
      });
    }
  }

  for (const ext of external) {
    checks.push({
      id: ext.id,
      name: ext.name,
      url: ext.url,
      timeout: ext.timeout || 10000,
      validate: null,
      expectedStatusCodes: [200],
    });
  }

  return checks;
}

// ─── Execute single check ─────────────────────────────────────
async function executeCheck(check) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), check.timeout);
  const start = Date.now();

  try {
    const response = await fetch(check.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SomaStatusMonitor/1.0' },
      redirect: 'follow',
    });
    const responseTime = Date.now() - start;
    clearTimeout(timer);

    const statusCode = response.status;
    const isExpectedStatus = check.expectedStatusCodes.includes(statusCode);

    // Validate JSON response body if configured
    let validationPassed = true;
    if (check.validate && isExpectedStatus) {
      try {
        const body = await response.json();
        validationPassed = body[check.validate.field] === check.validate.value;
      } catch {
        validationPassed = false;
      }
    }

    if (!isExpectedStatus || !validationPassed) {
      return { status: 'down', responseTime, statusCode };
    }

    // Degraded if response time exceeds 50% of timeout
    const degradedThreshold = check.timeout * 0.5;
    const status = responseTime > degradedThreshold ? 'degraded' : 'up';

    return { status, responseTime, statusCode };
  } catch (err) {
    clearTimeout(timer);
    const responseTime = Date.now() - start;
    return { status: 'down', responseTime, statusCode: 0 };
  }
}

// ─── Run all checks in parallel ───────────────────────────────
async function runAllChecks() {
  const checks = buildChecks();
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] Running ${checks.length} health checks...`);

  const results = {};
  const promises = checks.map(async (check) => {
    const result = await executeCheck(check);
    results[check.id] = result;
    const icon = result.status === 'up' ? '✓' : result.status === 'degraded' ? '⚠' : '✗';
    console.log(`  ${icon} ${check.name}: ${result.status} (${result.responseTime}ms, HTTP ${result.statusCode})`);
  });

  await Promise.allSettled(promises);

  return { timestamp, results };
}

// ─── Update daily file ────────────────────────────────────────
function updateDailyFile(checkEntry) {
  const today = new Date().toISOString().split('T')[0];
  const filePath = path.join(CHECKS_DIR, `${today}.json`);

  let dailyFile;
  if (fs.existsSync(filePath)) {
    dailyFile = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } else {
    dailyFile = { date: today, checks: [], summary: {} };
  }

  // Append check
  dailyFile.checks.push(checkEntry);

  // Update summary for each component
  for (const [id, result] of Object.entries(checkEntry.results)) {
    if (!dailyFile.summary[id]) {
      dailyFile.summary[id] = {
        totalChecks: 0,
        upChecks: 0,
        degradedChecks: 0,
        downChecks: 0,
        uptimePercent: 100.0,
        avgResponseTime: 0,
        p95ResponseTime: 0,
      };
    }

    const s = dailyFile.summary[id];
    s.totalChecks++;
    if (result.status === 'up') s.upChecks++;
    else if (result.status === 'degraded') s.degradedChecks++;
    else s.downChecks++;

    s.uptimePercent = ((s.upChecks + s.degradedChecks) / s.totalChecks) * 100;
    s.uptimePercent = Math.round(s.uptimePercent * 100) / 100;

    // Recalculate avg response time (running average)
    const allResponseTimes = dailyFile.checks
      .map(c => c.results[id]?.responseTime)
      .filter(t => t != null && t > 0);

    if (allResponseTimes.length > 0) {
      s.avgResponseTime = Math.round(
        allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length
      );

      // P95 response time
      const sorted = [...allResponseTimes].sort((a, b) => a - b);
      const p95Index = Math.ceil(sorted.length * 0.95) - 1;
      s.p95ResponseTime = sorted[Math.max(0, p95Index)];
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(dailyFile, null, 2));
  console.log(`\nUpdated ${filePath} (${dailyFile.checks.length} checks today)`);
}

// ─── Cleanup old data ─────────────────────────────────────────
function cleanupOldData() {
  if (!fs.existsSync(CHECKS_DIR)) return;

  const files = fs.readdirSync(CHECKS_DIR).filter(f => f.endsWith('.json'));
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  for (const file of files) {
    const date = file.replace('.json', '');
    if (date < cutoffStr) {
      fs.unlinkSync(path.join(CHECKS_DIR, file));
      console.log(`Deleted old data: ${file}`);
    }
  }

  // Strip checks array from yesterday's file (keep only summary)
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const yesterdayFile = path.join(CHECKS_DIR, `${yesterdayStr}.json`);

  if (fs.existsSync(yesterdayFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(yesterdayFile, 'utf-8'));
      if (data.checks && data.checks.length > 0) {
        data.checks = [];
        fs.writeFileSync(yesterdayFile, JSON.stringify(data, null, 2));
        console.log(`Stripped checks from ${yesterdayStr}.json (keeping summary)`);
      }
    } catch {
      // Ignore parse errors
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  // Ensure directories exist
  fs.mkdirSync(CHECKS_DIR, { recursive: true });

  const checkEntry = await runAllChecks();

  // Count results
  const entries = Object.entries(checkEntry.results);
  const up = entries.filter(([, r]) => r.status === 'up').length;
  const degraded = entries.filter(([, r]) => r.status === 'degraded').length;
  const down = entries.filter(([, r]) => r.status === 'down').length;

  console.log(`\nResults: ${up} up, ${degraded} degraded, ${down} down (${entries.length} total)`);

  updateDailyFile(checkEntry);
  cleanupOldData();

  console.log('Done.');
}

main().catch(err => {
  console.error('Monitor failed:', err);
  process.exit(1);
});
