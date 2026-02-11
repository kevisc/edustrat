/**
 * Comparative Analysis Visualization Module
 * Renders cross-country and cross-year comparisons
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

import { calculateVarianceDecomposition } from '../analysis/decomposition.js';

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

    const layout = {
        title: 'Cross-National Comparison: Achievement Trends',
        xaxis: {
            title: 'Country',
            gridcolor: '#334155'
        },
        yaxis: {
            title: 'Mean Achievement Score',
            gridcolor: '#334155'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        barmode: 'group',
        showlegend: true,
        legend: {
            y: 1,
            yanchor: 'top',
            itemsizing: 'constant',
            tracegroupgap: 5,
            font: { size: 11 }
        }
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    };

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
            color: ['#3b82f6', '#10b981']
        },
        text: values.map(v => `${v.toFixed(1)}%`),
        textposition: 'outside'
    };

    const layout = {
        title: 'Variance Decomposition of Achievement',
        xaxis: {
            title: '',
            gridcolor: '#334155'
        },
        yaxis: {
            title: 'Percent of Total Variance',
            range: [0, 100],
            gridcolor: '#334155'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
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
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    };

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
        marker: { color: '#3b82f6' }
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
            color: '#ef4444'
        },
        line: {
            color: '#ef4444',
            width: 2
        }
    };

    const layout = {
        title: 'Achievement Gap Comparison (Q4-Q1 SES Quartiles)',
        xaxis: {
            title: 'Country',
            gridcolor: '#334155'
        },
        yaxis: {
            title: 'Achievement Gap (score points)',
            gridcolor: '#334155'
        },
        yaxis2: {
            title: 'Effect Size (Cohen\'s d)',
            overlaying: 'y',
            side: 'right',
            gridcolor: 'transparent'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        showlegend: true,
        legend: {
            x: 0,
            y: 1,
            yanchor: 'top',
            itemsizing: 'constant',
            tracegroupgap: 5,
            font: { size: 11 }
        }
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    };

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
            [0, '#1e3a8a'],      // Dark blue (low gradient)
            [0.25, '#3b82f6'],   // Blue
            [0.5, '#fbbf24'],    // Yellow (medium)
            [0.75, '#f97316'],   // Orange
            [1, '#dc2626']       // Red (high gradient)
        ],
        reversescale: false,
        colorbar: {
            title: {
                text: 'SES Gradient<br>(points per SD)',
                font: { color: '#f1f5f9', size: 12 }
            },
            tickfont: { color: '#f1f5f9' },
            x: 1.02
        },
        marker: {
            line: {
                color: '#334155',
                width: 0.5
            }
        }
    };

    const layout = {
        title: {
            text: 'Intergenerational Educational Stratification: SES → Achievement Gradient by Country',
            font: { color: '#f1f5f9', size: 16 }
        },
        geo: {
            projection: {
                type: 'natural earth'
            },
            bgcolor: '#1e293b',
            showframe: false,
            showcoastlines: true,
            coastlinecolor: '#64748b',
            showcountries: true,
            countrycolor: '#475569',
            showland: true,
            landcolor: '#0f172a',
            showocean: true,
            oceancolor: '#0a1628',
            showlakes: false
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        margin: { t: 80, b: 20, l: 20, r: 80 },
        height: 600
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d']
    };

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
            chartDiv.innerHTML = '<p style="text-align: center; color: #94a3b8; padding: 2rem;">Need at least 2 years of data per country to show temporal trends.</p>';
        }
        return;
    }

    // Sort each country's data by year
    validCountries.forEach(country => {
        countryGradients[country].sort((a, b) => a.year - b.year);
    });

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

    const layout = {
        title: {
            text: 'Temporal Trends: SES → Achievement Gradient Over Time',
            font: { color: '#f1f5f9', size: 16 }
        },
        xaxis: {
            title: 'Year',
            gridcolor: '#334155',
            dtick: 3,
            tickmode: 'linear'
        },
        yaxis: {
            title: 'SES Gradient (points per SD)',
            gridcolor: '#334155'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        showlegend: true,
        legend: {
            x: 1.05,
            y: 1,
            yanchor: 'top',
            xanchor: 'left',
            bgcolor: 'rgba(30, 41, 59, 0.8)',
            bordercolor: '#475569',
            borderwidth: 1,
            itemsizing: 'constant',
            tracegroupgap: 5,
            font: { size: 11 }
        },
        hovermode: 'closest',
        margin: { t: 80, b: 60, l: 60, r: 200 },
        height: 600
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d']
    };

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
