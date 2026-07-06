/**
 * Distribution Visualization Module
 * Renders distribution analysis charts (histograms, percentiles, Lorenz curves)
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

import { calculateGini } from '../core/utils.js';
import { CHART_COLORS, INK, baseLayout, BASE_CONFIG } from './chart-theme.js';

/**
 * Get a record's weight (matches the rule used across the analysis modules).
 * @param {Object} record - Student record
 * @param {String} weightType - 'student' | 'senate' | 'none'
 * @returns {Number} weight
 */
function getWeight(record, weightType) {
    if (weightType === 'none') return 1;
    if (weightType === 'senate') {
        const v = record.w_fsenwt || record.senateWeight || record.W_FSENWT;
        return (v && isFinite(+v) && +v > 0) ? +v : 1;
    }
    const v = record.stu_wgt || record.w_fstuwt || record.studentWeight || record.W_FSTUWT || record.weight;
    return (v && isFinite(+v) && +v > 0) ? +v : 1;
}

/**
 * Render distribution box plots by country and year
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 */
export function renderDistributionChart(data, outcomeVar = 'math') {
    if (!data || data.length === 0) {
        return;
    }

    const countries = [...new Set(data.map(d => d.country))].sort();
    const years = [...new Set(data.map(d => d.year))].sort();
    const traces = [];
    const legendYears = new Set(); // Track which years have been added to legend

    // Create a box plot trace for each country-year combination
    years.forEach((year, yearIdx) => {
        const yearColor = CHART_COLORS[yearIdx % CHART_COLORS.length];
        countries.forEach(country => {
            const countryYearData = data.filter(d => d.country === country && d.year === year);
            const scores = countryYearData.map(d => +d[outcomeVar]).filter(isFinite);

            if (scores.length > 0) {
                // Show legend for this year only if we haven't added it yet
                const showLegendForYear = !legendYears.has(year);
                if (showLegendForYear) {
                    legendYears.add(year);
                }

                traces.push({
                    y: scores,
                    x: Array(scores.length).fill(`${country}`),
                    name: `${year}`,
                    type: 'box',
                    boxpoints: false,
                    marker: { size: 4, color: yearColor },
                    line: { width: 2, color: yearColor },
                    offsetgroup: year,
                    legendgroup: year,
                    showlegend: showLegendForYear, // Show legend once per year
                    hovertemplate: `<b>${country} (${year})</b><br>` +
                                   `Score: %{y:.1f}<br>` +
                                   `<extra></extra>`
                });
            }
        });
    });

    const layout = baseLayout({
        title: {
            text: `${getOutcomeLabel(outcomeVar)} Score Distributions: Country × Year Comparison`
        },
        xaxis: {
            title: { text: 'Country' }
        },
        yaxis: {
            title: { text: `${getOutcomeLabel(outcomeVar)} Score` }
        },
        boxmode: 'group',
        showlegend: true,
        legend: {
            title: { text: 'Year' },
            x: 1.02,
            xanchor: 'left',
            y: 1,
            yanchor: 'top',
            tracegroupgap: 5
        },
        hovermode: 'closest',
        margin: { l: 60, r: 150, t: 80, b: 80 }
    });

    const config = BASE_CONFIG;

    const chartDiv = document.getElementById('distribution-chart');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, traces, layout, config);
    }
}

/**
 * Render percentile chart
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 */
export function renderPercentileChart(data, outcomeVar = 'math') {
    if (!data || data.length === 0) {
        return;
    }

    const countries = [...new Set(data.map(d => d.country))];
    const percentiles = [10, 25, 50, 75, 90];
    const traces = [];

    countries.forEach(country => {
        const countryData = data.filter(d => d.country === country);
        const scores = countryData.map(d => +d[outcomeVar]).filter(isFinite);

        if (scores.length > 0) {
            scores.sort((a, b) => a - b);

            const percentileValues = percentiles.map(p =>
                ss.quantile(scores, p / 100)
            );

            traces.push({
                x: percentiles.map((_, i) => i),
                y: percentileValues,
                name: country,
                type: 'scatter',
                mode: 'lines+markers',
                marker: { size: 8 }
            });
        }
    });

    const layout = baseLayout({
        title: { text: `Achievement Percentiles by Country` },
        height: 420,
        xaxis: {
            title: { text: 'Percentile' },
            tickvals: [0, 1, 2, 3, 4],
            ticktext: ['P10', 'P25', 'P50', 'P75', 'P90']
        },
        yaxis: {
            title: { text: `${getOutcomeLabel(outcomeVar)} Score` }
        },
        showlegend: true,
        legend: {
            y: 1,
            yanchor: 'top'
        }
    });

    const config = BASE_CONFIG;

    const chartDiv = document.getElementById('percentile-chart');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, traces, layout, config);
    }
}

/**
 * Render Lorenz curve for inequality visualization.
 *
 * The curve is survey-weighted, so it corresponds to the weighted Gini coefficient
 * the rest of the app reports: students are ranked by score and the cumulative
 * *weight* share (x) is plotted against the cumulative *weighted-score* share (y).
 * Each country's weighted Gini is shown in the legend so the visual gap from the
 * 45° line and its single-number summary are read together.
 *
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} weightType - 'student' | 'senate' | 'none'
 */
export function renderLorenzCurve(data, outcomeVar = 'math', weightType = 'student') {
    if (!data || data.length === 0) {
        return;
    }

    const countries = [...new Set(data.map(d => d.country))];
    const traces = [];

    // Line of perfect equality (every student has the same score).
    traces.push({
        x: [0, 1],
        y: [0, 1],
        type: 'scatter',
        mode: 'lines',
        name: 'Perfect equality',
        line: { dash: 'dash', color: INK.reference, width: 2 },
        hoverinfo: 'skip'
    });

    // Weighted Lorenz curve for each country.
    countries.forEach(country => {
        const rows = [];
        data.forEach(d => {
            if (d.country !== country) return;
            const v = +d[outcomeVar];
            if (isFinite(v)) rows.push({ v, w: getWeight(d, weightType) });
        });
        if (rows.length === 0) return;

        rows.sort((a, b) => a.v - b.v);
        const totalW = rows.reduce((s, r) => s + r.w, 0);
        const totalWY = rows.reduce((s, r) => s + r.w * r.v, 0);
        if (!(totalW > 0) || !(totalWY > 0)) return;

        const x = [0], y = [0];
        let cw = 0, cwy = 0;
        for (const r of rows) {
            cw += r.w; cwy += r.w * r.v;
            x.push(cw / totalW);
            y.push(cwy / totalWY);
        }

        const gini = calculateGini(rows.map(r => r.v), weightType !== 'none' ? rows.map(r => r.w) : null);

        traces.push({
            x, y,
            type: 'scatter',
            mode: 'lines',
            name: `${country} — Gini ${gini.toFixed(3)}`,
            line: { width: 2 },
            hovertemplate: `${country}<br>the lowest-scoring %{x:.0%} of students<br>hold %{y:.0%} of the total score<extra></extra>`
        });
    });

    const layout = baseLayout({
        title: { text: 'Lorenz Curve: Achievement Distribution' },
        height: 420,
        xaxis: {
            title: { text: 'Cumulative share of students (lowest → highest score)' },
            range: [0, 1]
        },
        yaxis: {
            title: { text: 'Cumulative share of total score' },
            range: [0, 1]
        },
        showlegend: true,
        legend: {
            y: 1,
            yanchor: 'top',
            tracegroupgap: 5
        },
        hovermode: 'closest',
        annotations: [{
            x: 0.66, y: 0.28, xref: 'x', yref: 'y', align: 'left',
            text: 'Area between a curve and the<br>diagonal ↔ Gini (twice it).<br>Closer to the line = more equal.',
            showarrow: false, font: { size: 11, color: INK.secondary }
        }]
    });

    const config = BASE_CONFIG;

    const chartDiv = document.getElementById('lorenz-curve');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, traces, layout, config);
    }
}

/**
 * Render all distribution charts
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 */
export function renderAllDistributionCharts(data, outcomeVar = 'math', weightType = 'student') {
    renderDistributionChart(data, outcomeVar);
    renderPercentileChart(data, outcomeVar);
    renderLorenzCurve(data, outcomeVar, weightType);
}

/**
 * Get outcome label
 * @param {String} outcome - Outcome variable name
 * @returns {String} Outcome label
 */
function getOutcomeLabel(outcome) {
    const labels = {
        'math': 'Mathematics',
        'reading': 'Reading',
        'science': 'Science'
    };

    return labels[outcome] || outcome;
}

export default {
    renderDistributionChart,
    renderPercentileChart,
    renderLorenzCurve,
    renderAllDistributionCharts
};
