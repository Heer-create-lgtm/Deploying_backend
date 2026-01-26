"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const AnalyticsAggregationService_1 = require("../services/AnalyticsAggregationService");
const LinkHub_1 = require("../models/LinkHub");
const router = (0, express_1.Router)();
/**
 * Parse time window from query param
 */
function parseTimeWindow(range) {
    switch (range) {
        case '1h': return AnalyticsAggregationService_1.TimeWindow.ONE_HOUR;
        case '24h': return AnalyticsAggregationService_1.TimeWindow.TWENTY_FOUR_HOURS;
        case '7d': return AnalyticsAggregationService_1.TimeWindow.SEVEN_DAYS;
        case 'lifetime': return AnalyticsAggregationService_1.TimeWindow.LIFETIME;
        default: return AnalyticsAggregationService_1.TimeWindow.TWENTY_FOUR_HOURS;
    }
}
/**
 * Validate hub ownership
 */
async function validateHubAccess(hubId, userId) {
    const hub = await LinkHub_1.LinkHub.findOne({ hub_id: hubId, owner_id: userId });
    return hub !== null;
}
/**
 * GET /api/export/hub/:hubId
 * Export analytics report as CSV or PDF
 *
 * Query params:
 * - format: 'csv' | 'pdf' (default: csv)
 * - range: '1h' | '24h' | '7d' | 'lifetime' (default: 24h)
 */
router.get('/hub/:hubId', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const { hubId } = req.params;
        const { format = 'csv', range } = req.query;
        const userId = req.user?.userId;
        // Get hub details
        const hub = await LinkHub_1.LinkHub.findOne({ hub_id: hubId });
        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }
        const window = parseTimeWindow(range);
        // Fetch all analytics data
        const [overview, timeseries, links, segments, performance] = await Promise.all([
            AnalyticsAggregationService_1.analyticsAggregationService.getHubOverview(hubId, window),
            AnalyticsAggregationService_1.analyticsAggregationService.getTimeSeries(hubId, window),
            AnalyticsAggregationService_1.analyticsAggregationService.getLinkPerformance(hubId, window),
            AnalyticsAggregationService_1.analyticsAggregationService.getSegments(hubId, window),
            AnalyticsAggregationService_1.analyticsAggregationService.getPerformanceClassification(hubId, window)
        ]);
        if (format === 'csv') {
            // Generate CSV content
            const csvContent = generateCSV(hubId, hub.slug, window, overview, timeseries, links, segments, performance);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="analytics-${hubId}-${window}.csv"`);
            return res.send(csvContent);
        }
        else if (format === 'pdf') {
            // Generate PDF content (plain text for now, styled HTML that can be printed)
            const htmlContent = generatePDFHTML(hubId, hub.slug, window, overview, links, segments, performance);
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Content-Disposition', `attachment; filename="analytics-${hubId}-${window}.html"`);
            return res.send(htmlContent);
        }
        else {
            return res.status(400).json({ error: 'Invalid format. Use csv or pdf.' });
        }
    }
    catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export analytics' });
    }
});
/**
 * Generate CSV content
 */
function generateCSV(hubId, slug, window, overview, timeseries, links, segments, performance) {
    const lines = [];
    const now = new Date().toISOString();
    // Header
    lines.push(`# Analytics Report for ${slug} (${hubId})`);
    lines.push(`# Time Window: ${window}`);
    lines.push(`# Generated: ${now}`);
    lines.push('');
    // Overview Section
    lines.push('## OVERVIEW');
    lines.push('Metric,Value');
    lines.push(`Total Visits,${overview.total_visits}`);
    lines.push(`Unique Users,${overview.unique_users}`);
    lines.push(`Total Clicks,${overview.total_clicks}`);
    lines.push(`Average CTR,${overview.average_ctr}%`);
    lines.push(`Traffic Trend,${overview.traffic_trend} (${overview.trend_percentage}%)`);
    if (overview.top_performing_link) {
        lines.push(`Top Link,${overview.top_performing_link.name} (${overview.top_performing_link.clicks} clicks)`);
    }
    lines.push('');
    // Link Performance Section
    lines.push('## LINK PERFORMANCE');
    lines.push('Link Name,Target URL,Impressions,Clicks,CTR,Rank Score');
    for (const link of links) {
        lines.push(`"${link.name}","${link.target_url}",${link.impressions},${link.clicks},${link.ctr}%,${link.rank_score}`);
    }
    lines.push('');
    // Top Performing Links
    lines.push('## TOP PERFORMING LINKS');
    lines.push('Rank,Link Name,Clicks,CTR,Performance Score');
    performance.topLinks.forEach((link, i) => {
        lines.push(`${i + 1},"${link.link_name}",${link.clicks},${link.ctr}%,${link.performance_score}`);
    });
    lines.push('');
    // Least Performing Links
    lines.push('## LEAST PERFORMING LINKS');
    lines.push('Rank,Link Name,Clicks,CTR,Performance Score');
    performance.leastLinks.forEach((link, i) => {
        lines.push(`${i + 1},"${link.link_name}",${link.clicks},${link.ctr}%,${link.performance_score}`);
    });
    lines.push('');
    // Device Breakdown
    lines.push('## DEVICE DISTRIBUTION');
    lines.push('Device Type,Count,Percentage');
    for (const device of segments.devices) {
        lines.push(`${device.type},${device.count},${device.percentage}%`);
    }
    lines.push('');
    // Location Breakdown
    lines.push('## LOCATION DISTRIBUTION');
    lines.push('Location,Count,Percentage');
    for (const loc of segments.locations) {
        lines.push(`"${loc.location}",${loc.count},${loc.percentage}%`);
    }
    lines.push('');
    // Time Series (last 10 points)
    lines.push('## TIME SERIES (Recent)');
    lines.push('Timestamp,Visits,Clicks');
    const recentTimeseries = timeseries.slice(-20);
    for (const point of recentTimeseries) {
        lines.push(`${point.timestamp},${point.visits},${point.clicks}`);
    }
    return lines.join('\n');
}
/**
 * Generate PDF-ready HTML content
 */
function generatePDFHTML(hubId, slug, window, overview, links, segments, performance) {
    const now = new Date().toLocaleString();
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Analytics Report - ${slug}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #fff; color: #111; padding: 40px; line-height: 1.6;
        }
        h1 { font-size: 28px; margin-bottom: 8px; color: #00C853; }
        h2 { font-size: 20px; margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #00C853; }
        .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
        .stat-card { background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 32px; font-weight: bold; color: #00C853; }
        .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f0f0f0; font-weight: 600; }
        .top { color: #00C853; }
        .least { color: #f44336; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .badge-green { background: #e8f5e9; color: #00C853; }
        .badge-red { background: #ffebee; color: #f44336; }
        @media print { 
            body { padding: 0; }
            .page-break { page-break-before: always; }
        }
    </style>
</head>
<body>
    <h1>📊 Analytics Report</h1>
    <div class="meta">
        <strong>Hub:</strong> /${slug} (${hubId})<br>
        <strong>Time Window:</strong> ${window}<br>
        <strong>Generated:</strong> ${now}
    </div>

    <h2>Overview</h2>
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-value">${overview.total_visits.toLocaleString()}</div>
            <div class="stat-label">Total Visits</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${overview.unique_users.toLocaleString()}</div>
            <div class="stat-label">Unique Users</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${overview.total_clicks.toLocaleString()}</div>
            <div class="stat-label">Total Clicks</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${overview.average_ctr}%</div>
            <div class="stat-label">Average CTR</div>
        </div>
    </div>

    <h2>🏆 Top Performing Links</h2>
    <table>
        <thead>
            <tr><th>#</th><th>Link</th><th>Clicks</th><th>CTR</th><th>Score</th></tr>
        </thead>
        <tbody>
            ${performance.topLinks.map((link, i) => `
                <tr class="top">
                    <td>${i + 1}</td>
                    <td>${link.link_name}</td>
                    <td>${link.clicks}</td>
                    <td>${link.ctr}%</td>
                    <td><span class="badge badge-green">${link.performance_score.toFixed(2)}</span></td>
                </tr>
            `).join('')}
            ${performance.topLinks.length === 0 ? '<tr><td colspan="5">No data</td></tr>' : ''}
        </tbody>
    </table>

    <h2>📉 Least Performing Links</h2>
    <table>
        <thead>
            <tr><th>#</th><th>Link</th><th>Clicks</th><th>CTR</th><th>Score</th></tr>
        </thead>
        <tbody>
            ${performance.leastLinks.map((link, i) => `
                <tr class="least">
                    <td>${i + 1}</td>
                    <td>${link.link_name}</td>
                    <td>${link.clicks}</td>
                    <td>${link.ctr}%</td>
                    <td><span class="badge badge-red">${link.performance_score.toFixed(2)}</span></td>
                </tr>
            `).join('')}
            ${performance.leastLinks.length === 0 ? '<tr><td colspan="5">No data</td></tr>' : ''}
        </tbody>
    </table>

    <div class="page-break"></div>

    <h2>📱 Device Distribution</h2>
    <table>
        <thead><tr><th>Device</th><th>Count</th><th>Percentage</th></tr></thead>
        <tbody>
            ${segments.devices.map((d) => `
                <tr><td>${d.type}</td><td>${d.count}</td><td>${d.percentage}%</td></tr>
            `).join('')}
            ${segments.devices.length === 0 ? '<tr><td colspan="3">No data</td></tr>' : ''}
        </tbody>
    </table>

    <h2>🌍 Location Distribution</h2>
    <table>
        <thead><tr><th>Location</th><th>Count</th><th>Percentage</th></tr></thead>
        <tbody>
            ${segments.locations.map((l) => `
                <tr><td>${l.location}</td><td>${l.count}</td><td>${l.percentage}%</td></tr>
            `).join('')}
            ${segments.locations.length === 0 ? '<tr><td colspan="3">No data</td></tr>' : ''}
        </tbody>
    </table>

    <h2>🔗 All Link Performance</h2>
    <table>
        <thead><tr><th>Link</th><th>URL</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead>
        <tbody>
            ${links.map((l) => `
                <tr>
                    <td>${l.name}</td>
                    <td style="font-size:11px;color:#666;">${l.target_url.substring(0, 40)}...</td>
                    <td>${l.impressions}</td>
                    <td>${l.clicks}</td>
                    <td>${l.ctr}%</td>
                </tr>
            `).join('')}
            ${links.length === 0 ? '<tr><td colspan="5">No data</td></tr>' : ''}
        </tbody>
    </table>

    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
        Generated by Smart Link Hub Analytics • ${now}
    </div>
</body>
</html>`;
}
exports.default = router;
//# sourceMappingURL=export.js.map