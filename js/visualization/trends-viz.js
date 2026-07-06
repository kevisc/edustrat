/**
 * Within-Country Trends Visualization
 *
 * Renders the country-level panel produced by js/analysis/trends.js: per-cycle
 * estimates with 95% confidence bars (where a standard error is available), each
 * country's fitted within-country trend line, a results table, and the country
 * fixed-effects panel summary. Comparability breaks (2015 mode change, etc.) are
 * marked so trajectories are not read through them naively.
 *
 * Author: Kevin Schoenholzer
 */

import { CHART_COLORS, INK, baseLayout, BASE_CONFIG } from './chart-theme.js';

function decimalsFor(metric) {
    return metric === 'gini' ? 3 : metric === 'gradient' ? 2 : 1;
}

function fmt(v, d) {
    return (v === null || v === undefined || !isFinite(v)) ? '—' : (+v).toFixed(d);
}

function pStars(p) {
    if (p === null || !isFinite(p)) return '';
    if (p < 0.001) return '***';
    if (p < 0.01) return '**';
    if (p < 0.05) return '*';
    if (p < 0.1) return '†';
    return '';
}

/**
 * Render the within-country trends chart, table, and caveats.
 * @param {Object} analysis - output of analyzeWithinCountryTrends
 * @param {Object} ids - { chartId, tableId, caveatsId }
 */
export function renderWithinCountryTrends(analysis, ids = {}) {
    const chartId = ids.chartId || 'trends-chart';
    const tableId = ids.tableId || 'trends-table';
    const caveatsId = ids.caveatsId || 'trends-caveats';

    const { byCountry, metric, metricMeta, fePanel, caveats, weightType } = analysis;
    const countries = Object.keys(byCountry);
    const d = decimalsFor(metric);

    const chartDiv = document.getElementById(chartId);

    if (countries.length === 0) {
        if (chartDiv) chartDiv.innerHTML =
            '<p style="text-align:center;color:var(--text-secondary);padding:2rem;">No country has enough data for this metric. Load at least one country (the Trends tab pulls every available cycle automatically).</p>';
        const t = document.getElementById(tableId); if (t) t.innerHTML = '';
        renderCaveats(caveats, caveatsId);
        return;
    }

    // --- Chart ---------------------------------------------------------------
    const allYears = [...new Set(
        countries.flatMap(c => byCountry[c].points.map(p => p.year))
    )].sort((a, b) => a - b);

    const traces = [];
    countries.forEach((country, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const pts = byCountry[country].points;
        const hasSE = pts.some(p => p.se != null && isFinite(p.se));

        traces.push({
            x: pts.map(p => p.year),
            y: pts.map(p => p.estimate),
            mode: 'lines+markers',
            type: 'scatter',
            name: country,
            legendgroup: country,
            line: { width: 2, color },
            marker: { size: 8, color },
            error_y: hasSE ? {
                type: 'data',
                array: pts.map(p => (p.se != null && isFinite(p.se)) ? 1.96 * p.se : 0),
                visible: true,
                thickness: 1.2,
                width: 3,
                color
            } : undefined,
            text: pts.map(p =>
                `<b>${country} (${p.year})</b><br>` +
                `${metricMeta.short}: ${fmt(p.estimate, d)}${p.se != null ? ' ± ' + fmt(1.96 * p.se, d) + ' (95%)' : ''}<br>` +
                `SE method: ${p.seMethod || '—'}<br>` +
                `N: ${p.n.toLocaleString()}`),
            hoverinfo: 'text'
        });

        // Fitted within-country trend line (dashed).
        const tr = byCountry[country].trend;
        if (tr) {
            traces.push({
                x: tr.lineX,
                y: tr.lineY,
                mode: 'lines',
                type: 'scatter',
                name: `${country} trend`,
                legendgroup: country,
                showlegend: false,
                line: { width: 1.5, color, dash: 'dot' },
                hoverinfo: 'skip'
            });
        }
    });

    // Mark the 2015 paper→computer mode change if it falls inside the window.
    const shapes = [], annotations = [];
    if (allYears[0] <= 2015 && allYears[allYears.length - 1] >= 2015) {
        shapes.push({
            type: 'line', x0: 2015, x1: 2015, yref: 'paper', y0: 0, y1: 1,
            line: { color: INK.reference, width: 1, dash: 'dash' }
        });
        annotations.push({
            x: 2015, xref: 'x', yref: 'paper', y: 1.02, yanchor: 'bottom',
            text: '2015: computer-based', showarrow: false,
            font: { size: 10, color: INK.secondary }
        });
    }

    const layout = baseLayout({
        title: {
            text: `Within-Country Trend Over PISA Cycles: ${metricMeta.label}`
        },
        height: 460,
        xaxis: {
            title: { text: 'PISA cycle' }, type: 'linear',
            tickmode: 'array', tickvals: allYears, ticktext: allYears.map(String),
            tickformat: 'd'
        },
        yaxis: { title: { text: `${metricMeta.label} (${metricMeta.unit})` } },
        showlegend: true,
        legend: {
            x: 1.02, y: 1, xanchor: 'left', yanchor: 'top'
        },
        hovermode: 'closest', shapes, annotations,
        margin: { t: 80, b: 60, l: 70, r: 170 }
    });

    if (chartDiv && typeof Plotly !== 'undefined') {
        Plotly.newPlot(chartDiv, traces, layout, BASE_CONFIG);
    }

    // --- Results table -------------------------------------------------------
    renderTable(analysis, countries, d, tableId);

    // --- Caveats -------------------------------------------------------------
    renderCaveats(caveats, caveatsId);
}

function renderTable(analysis, countries, d, tableId) {
    const div = document.getElementById(tableId);
    if (!div) return;
    const { byCountry, metricMeta, fePanel, weightType } = analysis;

    const rows = countries.map(c => {
        const pts = byCountry[c].points;
        const tr = byCountry[c].trend;
        const first = pts[0], last = pts[pts.length - 1];
        const slope = tr ? `${fmt(tr.slopePerDecade, d)}${pStars(tr.p)}` : '—';
        const se = tr ? fmt(tr.se, d) : '—';
        const p = tr && tr.p != null ? fmt(tr.p, 3) : '—';
        const weighting = tr ? (tr.weighting === 'inverse-variance' ? 'precision' : 'equal') : '—';
        return `<tr>
            <td style="font-weight:600;">${c}</td>
            <td>${first.year}–${last.year}</td>
            <td>${fmt(first.estimate, d)} → ${fmt(last.estimate, d)}</td>
            <td>${slope}</td>
            <td>${se}</td>
            <td>${p}</td>
            <td>${pts.length}</td>
            <td style="color:var(--text-secondary);font-size:0.85em;">${weighting}</td>
        </tr>`;
    }).join('');

    const th = (t) => `<th style="text-align:left;padding:0.4rem 0.6rem;border-bottom:1px solid var(--border);">${t}</th>`;
    let html = `
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
            <thead><tr>
                ${th('Country')}${th('Cycles')}${th(metricMeta.short + ' (first → last)')}
                ${th('Δ / decade')}${th('SE')}${th('p')}${th('# cycles')}${th('weighting')}
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.5rem;">
            Δ / decade is the slope of a regression of the per-cycle ${metricMeta.short.toLowerCase()} on time
            (precision-weighted by 1/SE² where a standard error is available, otherwise equally weighted).
            Significance: † p&lt;.10, * p&lt;.05, ** p&lt;.01, *** p&lt;.001. Weights: ${weightType}. A slope SE/p needs ≥3 cycles.
        </p>`;

    if (fePanel) {
        html += `
        <div style="margin-top:1.25rem;padding:1rem 1.25rem;background:var(--primary-50);
                    border-left:3px solid var(--primary-500);border-radius:4px;">
            <div style="font-weight:600;margin-bottom:0.35rem;">Country fixed-effects panel — average within-country trend</div>
            <div style="font-size:1.05rem;">
                β = <strong>${fmt(fePanel.slopePerDecade, d)} ${metricMeta.unit}</strong> per decade
                &nbsp;(SE ${fmt(fePanel.se, d)}, p ${fmt(fePanel.p, 3)}${pStars(fePanel.p)})
            </div>
            <p style="font-size:0.82rem;color:var(--text-secondary);margin:0.5rem 0 0;">
                Pools ${fePanel.nCells} country-cycle cells across ${fePanel.nCountries} countries with country dummies
                (reference: ${fePanel.referenceCountry}), so β is the trend identified from change <em>within</em>
                countries, net of fixed differences in level. Reproduced by
                <code>lm(theta ~ I((year-2000)/10) + factor(country), weights = 1/se²)</code>.
            </p>
        </div>`;
    } else if (countries.length >= 2) {
        html += `<p style="font-size:0.82rem;color:var(--text-secondary);margin-top:1rem;">
            The country fixed-effects panel needs at least two countries that each have two or more cycles
            (and more cells than parameters). Load more cycles or countries to estimate it.</p>`;
    }

    div.innerHTML = html;
}

function renderCaveats(caveats, caveatsId) {
    const div = document.getElementById(caveatsId);
    if (!div || !caveats) return;
    const items = caveats.map(c => {
        const tag = c.year ? `<strong>${c.year}:</strong> ` : '';
        return `<li style="margin-bottom:0.4rem;line-height:1.5;">${tag}${c.text}</li>`;
    }).join('');
    div.innerHTML = `
        <div style="padding:1rem 1.25rem;background:#fdf6ec;
                    border-left:3px solid #b45309;border-radius:4px;">
            <div style="font-weight:600;margin-bottom:0.5rem;">Reading these trends responsibly</div>
            <ul style="margin:0;padding-left:1.2rem;font-size:0.88rem;color:var(--text-secondary);">${items}</ul>
        </div>`;
}

export default { renderWithinCountryTrends };
