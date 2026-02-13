import type { APIRoute } from 'astro';
import { loadActiveIncidents } from '../lib/data';
import { BRAND, INCIDENT_STATUS_LABELS } from '../lib/constants';

export const GET: APIRoute = async () => {
  const incidents = loadActiveIncidents();

  const items = incidents.map(incident => {
    const latestUpdate = incident.updates[incident.updates.length - 1];
    return `
    <item>
      <title>${escapeXml(incident.title)}</title>
      <description>${escapeXml(latestUpdate?.message || '')}</description>
      <pubDate>${new Date(incident.createdAt).toUTCString()}</pubDate>
      <guid>${BRAND.statusUrl}/incidents/${incident.id}</guid>
      <category>${incident.severity}</category>
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${BRAND.statusName}</title>
    <description>Status updates for ${BRAND.name} services</description>
    <link>${BRAND.statusUrl}</link>
    <atom:link href="${BRAND.statusUrl}/rss.xml" rel="self" type="application/rss+xml" />
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items.join('\n')}
  </channel>
</rss>`;

  return new Response(xml.trim(), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
