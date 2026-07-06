/**
 * Comparative Analysis Visualization Module
 * Renders cross-country and cross-year comparisons
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

import { calculateVarianceDecomposition } from '../analysis/decomposition.js';
import { CHART_COLORS, INK, baseLayout, BASE_CONFIG } from './chart-theme.js';

/**
 * Render country comparison chart
 * @param {Object} comparativeResults - Results by country and year
 * @param {Array} years - Array of years to compare
 */
export function renderCountryComparison(comparativeResults, years) {
    if (!comparativeResults || Object.keys(comparativeResults).length === 0) {
        return;
    }

    const countries = Object.keys(comparativeResults);
    const traces = [];

    years.forEach(year => {
        const means = [];
        const countryNames = [];

        countries.forEach(country => {
            if (comparativeResults[country] && comparativeResults[country][year]) {
                means.push(comparativeResults[country][year].mean);
                countryNames.push(country);
            }
        });

        if (means.length > 0) {
            traces.push({
                x: countryNames,
                y: means,
                name: `Year ${year}`,
                type: 'bar'
            });
        }
    });

    const layout = baseLayout({
        title: { text: 'Cross-National Comparison: Achievement Trends' },
        xaxis: {
            title: { text: 'Country' }
        },
        yaxis: {
            title: { text: 'Mean Achievement Score' }
        },
        barmode: 'group',
        showlegend: true,
        legend: {
            y: 1,
            yanchor: 'top',
            tracegroupgap: 5
        }
    });

    const config = BASE_CONFIG;

    const chartDiv = document.getElementById('country-comparison');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, traces, layout, config);
    }
}

/**
 * Render variance decomposition chart
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 */
export function renderDecompositionChart(data, outcomeVar = 'math') {
    if (!data || data.length === 0) {
        return;
    }

    const countries = [...new Set(data.map(d => d.country))];
    const decomp = calculateVarianceDecomposition(data, outcomeVar, countries);

    if (!decomp) {
        return;
    }

    const components = ['Within-country', 'Between-country'];
    const values = [decomp.percentWithin, decomp.percentBetween];

    const trace = {
        x: components,
        y: values,
        type: 'bar',
        marker: {
            color: [CHART_COLORS[0], CHART_COLORS[1]]
        },
        text: values.map(v => `${v.toFixed(1)}%`),
        textposition: 'outside'
    };

    const layout = baseLayout({
        title: { text: 'Variance Decomposition of Achievement' },
        xaxis: {
            title: { text: '' }
        },
        yaxis: {
            title: { text: 'Percent of Total Variance' },
            range: [0, 100]
        },
        showlegend: false,
        annotations: [{
            x: 0.5,
            y: -0.15,
            xref: 'paper',
            yref: 'paper',
            text: `ICC = ${decomp.icc.toFixed(3)} (ρ)`,
            showarrow: false,
            font: { size: 14 }
        }]
    });

    const config = BASE_CONFIG;

    const chartDiv = document.getElementById('decomposition-chart');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, [trace], layout, config);
    }
}

/**
 * Render gap comparison across countries
 * @param {Object} gapResults - Gap results by country
 */
export function renderGapComparison(gapResults) {
    if (!gapResults || Object.keys(gapResults).length === 0) {
        return;
    }

    const countries = Object.keys(gapResults).filter(c =>
        gapResults[c] && isFinite(gapResults[c].gap_q4_q1)
    );

    countries.sort((a, b) => gapResults[a].gap_q4_q1 - gapResults[b].gap_q4_q1);

    const gaps = countries.map(c => gapResults[c].gap_q4_q1);
    const effectSizes = countries.map(c => gapResults[c].effect_size);

    const trace1 = {
        x: countries,
        y: gaps,
        name: 'Gap (Q4-Q1)',
        type: 'bar',
        yaxis: 'y',
        marker: { color: CHART_COLORS[0] }
    };

    const trace2 = {
        x: countries,
        y: effectSizes,
        name: 'Effect Size (d)',
        type: 'scatter',
        mode: 'markers+lines',
        yaxis: 'y2',
        marker: {
            size: 10,
            color: CHART_COLORS[7]
        },
        line: {
            color: CHART_COLORS[7],
            width: 2
        }
    };

    const layout = baseLayout({
        title: { text: 'Achievement Gap Comparison (Q4-Q1 SES Quartiles)' },
        xaxis: {
            title: { text: 'Country' }
        },
        yaxis: {
            title: { text: 'Achievement Gap (score points)' }
        },
        yaxis2: {
            title: { text: 'Effect Size (Cohen\'s d)' },
            overlaying: 'y',
            side: 'right',
            gridcolor: 'transparent'
        },
        showlegend: true,
        legend: {
            x: 0,
            y: 1,
            yanchor: 'top',
            tracegroupgap: 5
        }
    });

    const config = BASE_CONFIG;

    const chartDiv = document.getElementById('gap-comparison');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, [trace1, trace2], layout, config);
    }
}

/**
 * Render world map showing SES gradient (intergenerational effect) by country
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} predictorVar - Name of predictor (usually 'escs')
 */
export function renderWorldMap(data, outcomeVar = 'math', predictorVar = 'escs') {
    // Import regression function dynamically
    const runPooledOLS = window.runPooledOLS;
    if (!runPooledOLS) {
        console.warn('runPooledOLS not available for world map');
        return;
    }

    // Group data by country
    const byCountry = {};
    data.forEach(d => {
        if (!byCountry[d.country]) {
            byCountry[d.country] = [];
        }
        byCountry[d.country].push(d);
    });

    // Calculate gradient for each country
    const countries = [];
    const gradients = [];
    const nobs = [];
    const r2values = [];

    Object.keys(byCountry).forEach(country => {
        const countryData = byCountry[country];
        if (countryData.length < 100) return; // Skip small samples

        try {
            const model = runPooledOLS(countryData, outcomeVar, predictorVar, [], 'student');
            if (model && model.coefficients && model.coefficients[1]) {
                countries.push(country);
                // Gradient is the coefficient on the predictor (index 1, after intercept)
                gradients.push(model.coefficients[1]);
                nobs.push(model.nobs);
                r2values.push(model.r2 || 0);
            }
        } catch (error) {
            console.warn(`Could not calculate gradient for ${country}:`, error.message);
        }
    });

    if (countries.length === 0) {
        console.warn('No country gradients available for world map');
        return;
    }

    // Create hover text
    const hoverText = countries.map((country, i) => {
        return `<b>${country}</b><br>` +
               `Gradient: ${gradients[i].toFixed(2)} points/SD<br>` +
               `R²: ${(r2values[i] * 100).toFixed(1)}%<br>` +
               `N: ${nobs[i].toLocaleString()}`;
    });

    const trace = {
        type: 'choropleth',
        locations: countries,
        locationmode: 'ISO-3',
        z: gradients,
        text: hoverText,
        hoverinfo: 'text',
        colorscale: [
            [0, '#cde2fb'],      // Light blue (low gradient)
            [0.25, '#9ec5f4'],
            [0.5, '#5598e7'],
            [0.75, '#256abf'],
            [1, '#0d366b']       // Dark blue (high gradient)
        ],
        reversescale: false,
        colorbar: {
            title: {
                text: 'SES Gradient<br>(points per SD)',
                font: { color: INK.secondary, size: 12 }
            },
            tickfont: { color: INK.secondary },
            x: 1.02
        },
        marker: {
            line: {
                color: '#ffffff',
                width: 0.5
            }
        }
    };

    const layout = baseLayout({
        title: {
            text: 'Intergenerational Educational Stratification: SES → Achievement Gradient by Country'
        },
        geo: {
            projection: {
                type: 'natural earth'
            },
            bgcolor: 'rgba(0,0,0,0)',
            showframe: false,
            showcoastlines: true,
            coastlinecolor: '#cfd4dc',
            showcountries: true,
            countrycolor: '#e4e7ec',
            showland: true,
            landcolor: '#eef0f4',
            showocean: true,
            oceancolor: '#f7f9fb',
            showlakes: false
        },
        margin: { t: 80, b: 20, l: 20, r: 80 },
        height: 600
    });

    const config = BASE_CONFIG;

    const chartDiv = document.getElementById('world-map');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, [trace], layout, config);
    }
}

/**
 * Render temporal trends showing how SES gradients change over time
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} predictorVar - Name of predictor (usually 'escs')
 */
export function renderTemporalTrends(data, outcomeVar = 'math', predictorVar = 'escs') {
    const runPooledOLS = window.runPooledOLS;
    if (!runPooledOLS) {
        console.warn('runPooledOLS not available for temporal trends');
        return;
    }

    // Group data by country AND year
    const byCountryYear = {};
    data.forEach(d => {
        const key = `${d.country}_${d.year}`;
        if (!byCountryYear[key]) {
            byCountryYear[key] = {
                country: d.country,
                year: d.year,
                data: []
            };
        }
        byCountryYear[key].data.push(d);
    });

    // Calculate gradient for each country-year combination
    const countryGradients = {};

    Object.values(byCountryYear).forEach(entry => {
        const { country, year, data: countryYearData } = entry;

        if (countryYearData.length < 100) return; // Skip small samples

        try {
            const model = runPooledOLS(countryYearData, outcomeVar, predictorVar, [], 'student');
            if (model && model.coefficients && model.coefficients[1]) {
                if (!countryGradients[country]) {
                    countryGradients[country] = [];
                }
                countryGradients[country].push({
                    year: year,
                    gradient: model.coefficients[1],
                    r2: model.r2 || 0,
                    n: model.nobs
                });
            }
        } catch (error) {
            console.warn(`Could not calculate gradient for ${country} ${year}:`, error.message);
        }
    });

    // Filter countries with at least 2 time points
    const validCountries = Object.keys(countryGradients).filter(
        country => countryGradients[country].length >= 2
    );

    if (validCountries.length === 0) {
        const chartDiv = document.getElementById('temporal-trends');
        if (chartDiv) {
            chartDiv.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Need at least 2 years of data per country to show temporal trends.</p>';
        }
        return;
    }

    // Sort each country's data by year
    validCountries.forEach(country => {
        countryGradients[country].sort((a, b) => a.year - b.year);
    });

    // Exact set of PISA years present, used for explicit x-axis ticks.
    const allYears = [...new Set(
        validCountries.flatMap(c => countryGradients[c].map(d => Number(d.year)))
    )].sort((a, b) => a - b);

    // Create traces for each country
    const traces = validCountries.map(country => {
        const countryData = countryGradients[country];
        const years = countryData.map(d => d.year);
        const gradients = countryData.map(d => d.gradient);
        const hoverText = countryData.map(d =>
            `<b>${country} (${d.year})</b><br>` +
            `Gradient: ${d.gradient.toFixed(2)} points/SD<br>` +
            `R²: ${(d.r2 * 100).toFixed(1)}%<br>` +
            `N: ${d.n.toLocaleString()}`
        );

        return {
            x: years,
            y: gradients,
            mode: 'lines+markers',
            type: 'scatter',
            name: country,
            text: hoverText,
            hoverinfo: 'text',
            line: {
                width: 2
            },
            marker: {
                size: 8
            }
        };
    });

    const layout = baseLayout({
        title: {
            text: 'Temporal Trends: SES → Achievement Gradient Over Time'
        },
        xaxis: {
            title: { text: 'Year' },
            type: 'linear',
            tickmode: 'array',
            tickvals: allYears,
            ticktext: allYears.map(String),
            tickformat: 'd'
        },
        yaxis: {
            title: { text: 'SES Gradient (points per SD)' }
        },
        showlegend: true,
        legend: {
            x: 1.05,
            y: 1,
            yanchor: 'top',
            xanchor: 'left',
            tracegroupgap: 5
        },
        hovermode: 'closest',
        margin: { t: 80, b: 60, l: 60, r: 200 }
    });

    const config = BASE_CONFIG;

    const chartDiv = document.getElementById('temporal-trends');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, traces, layout, config);
    }
}

/**
 * Render all comparative charts
 * @param {Array} data - Array of student records
 * @param {Object} comparativeResults - Comparative analysis results
 * @param {Object} gapResults - Gap analysis results
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} predictorVar - Name of predictor variable (escs or parent_edu)
 */
export function renderAllComparativeCharts(data, comparativeResults, gapResults = null, outcomeVar = 'math', predictorVar = 'escs') {
    const years = [...new Set(data.map(d => d.year))].sort();
    renderCountryComparison(comparativeResults, years);
    renderWorldMap(data, outcomeVar, predictorVar);
    renderTemporalTrends(data, outcomeVar, predictorVar);
    renderDecompositionChart(data, outcomeVar);
    if (gapResults) {
        renderGapComparison(gapResults);
    }
}

export default {
    renderCountryComparison,
    renderDecompositionChart,
    renderGapComparison,
    renderWorldMap,
    renderTemporalTrends,
    renderAllComparativeCharts
};
