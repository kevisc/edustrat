/**
 * Distribution Visualization Module
 * Renders distribution analysis charts (histograms, percentiles, Lorenz curves)
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

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
    years.forEach(year => {
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
                    marker: { size: 4 },
                    line: { width: 2 },
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

    const layout = {
        title: {
            text: `${getOutcomeLabel(outcomeVar)} Score Distributions: Country × Year Comparison`,
            font: { color: '#f1f5f9', size: 16 }
        },
        xaxis: {
            title: 'Country',
            gridcolor: '#334155'
        },
        yaxis: {
            title: `${getOutcomeLabel(outcomeVar)} Score`,
            gridcolor: '#334155'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        boxmode: 'group',
        showlegend: true,
        legend: {
            title: { text: 'Year' },
            x: 1.02,
            xanchor: 'left',
            y: 1,
            yanchor: 'top',
            bgcolor: 'rgba(30, 41, 59, 0.8)',
            bordercolor: '#475569',
            borderwidth: 1,
            itemsizing: 'constant',
            tracegroupgap: 5,
            font: { size: 11 }
        },
        hovermode: 'closest',
        margin: { l: 60, r: 150, t: 80, b: 80 }
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d']
    };

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

    const layout = {
        title: `Achievement Percentiles by Country`,
        height: 420,
        xaxis: {
            title: 'Percentile',
            tickvals: [0, 1, 2, 3, 4],
            ticktext: ['P10', 'P25', 'P50', 'P75', 'P90'],
            gridcolor: '#334155'
        },
        yaxis: {
            title: `${getOutcomeLabel(outcomeVar)} Score`,
            gridcolor: '#334155'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        showlegend: true,
        legend: {
            y: 1,
            yanchor: 'top',
            itemsizing: 'constant',
            font: { size: 11 }
        }
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    };

    const chartDiv = document.getElementById('percentile-chart');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, traces, layout, config);
    }
}

/**
 * Render Lorenz curve for inequality visualization
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 */
export function renderLorenzCurve(data, outcomeVar = 'math') {
    if (!data || data.length === 0) {
        return;
    }

    const countries = [...new Set(data.map(d => d.country))];
    const traces = [];

    // Add line of equality
    traces.push({
        x: [0, 1],
        y: [0, 1],
        type: 'scatter',
        mode: 'lines',
        name: 'Perfect Equality',
        line: {
            dash: 'dash',
            color: '#999',
            width: 2
        }
    });

    // Add Lorenz curve for each country
    countries.forEach(country => {
        const countryData = data.filter(d => d.country === country);
        const scores = countryData.map(d => +d[outcomeVar]).filter(isFinite);

        if (scores.length > 0) {
            scores.sort((a, b) => a - b);

            const n = scores.length;
            const cumSum = scores.reduce((acc, val, i) => {
                acc.push((acc[i] || 0) + val);
                return acc;
            }, []);

            const totalSum = cumSum[n - 1];
            const x = cumSum.map((_, i) => (i + 1) / n);
            const y = cumSum.map(sum => sum / totalSum);

            traces.push({
                x: [0, ...x],
                y: [0, ...y],
                type: 'scatter',
                mode: 'lines',
                name: country,
                line: { width: 2 }
            });
        }
    });

    const layout = {
        title: 'Lorenz Curve: Achievement Distribution',
        height: 420,
        xaxis: {
            title: 'Cumulative Population Proportion',
            range: [0, 1],
            gridcolor: '#334155'
        },
        yaxis: {
            title: 'Cumulative Achievement Proportion',
            range: [0, 1],
            gridcolor: '#334155'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        showlegend: true,
        legend: {
            y: 1,
            yanchor: 'top',
            itemsizing: 'constant',
            tracegroupgap: 5,
            font: { size: 11 }
        },
        hovermode: 'x unified'
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    };

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
export function renderAllDistributionCharts(data, outcomeVar = 'math') {
    renderDistributionChart(data, outcomeVar);
    renderPercentileChart(data, outcomeVar);
    renderLorenzCurve(data, outcomeVar);
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
