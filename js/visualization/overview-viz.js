/**
 * Overview Visualization Module
 * Renders overview charts and updates summary statistics cards
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

import { calculateDescriptiveStats, calculateInequalityMeasures, calculateSESGradient } from '../analysis/descriptive.js';

/**
 * Update overview statistics cards
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} predictorVar - Name of predictor variable
 * @param {String} weightType - Type of weights to use
 */
export function updateOverviewStats(data, outcomeVar = 'math', predictorVar = 'escs', weightType = 'student') {
    if (!data || data.length === 0) {
        console.warn('No data provided to updateOverviewStats');
        return;
    }

    // Calculate descriptive statistics
    const descriptive = calculateDescriptiveStats(data, outcomeVar, weightType);
    const inequality = calculateInequalityMeasures(data, outcomeVar, weightType);
    const gradient = calculateSESGradient(data, outcomeVar, predictorVar, weightType);

    // Update mean score
    const meanEl = document.getElementById('mean-score');
    if (meanEl && descriptive) {
        meanEl.textContent = Math.round(descriptive.mean);
    }

    // Update Gini coefficient
    const giniEl = document.getElementById('inequality-index');
    if (giniEl && inequality) {
        giniEl.textContent = inequality.gini.toFixed(3);
    }

    // Update gradient
    const gradientEl = document.getElementById('predictor-gradient');
    if (gradientEl && isFinite(gradient)) {
        gradientEl.textContent = gradient.toFixed(2);
    }

    // Update gradient label
    const labelEl = document.getElementById('gradient-label');
    if (labelEl) {
        const predLabel = getPredictorLabel(predictorVar, true);
        labelEl.textContent = `${predLabel} Gradient (β)`;
    }
}

/**
 * Render overview chart (scatter plot of mean achievement vs. gradient)
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} predictorVar - Name of predictor variable
 * @param {String} weightType - Type of weights to use
 */
export function renderOverviewChart(data, outcomeVar = 'math', predictorVar = 'escs', weightType = 'student') {
    if (!data || data.length === 0) {
        console.warn('No data provided to renderOverviewChart');
        return;
    }

    // Get unique countries and years
    const countries = [...new Set(data.map(d => d.country))];
    const years = [...new Set(data.map(d => d.year))].sort();

    const traces = [];

    // Create trace for each year
    years.forEach(year => {
        const means = [];
        const gradients = [];
        const labels = [];

        countries.forEach(country => {
            const countryYearData = data.filter(d => d.country === country && d.year === year);

            if (countryYearData.length > 0) {
                const stats = calculateDescriptiveStats(countryYearData, outcomeVar, weightType);
                const grad = calculateSESGradient(countryYearData, outcomeVar, predictorVar, weightType);

                if (stats && isFinite(grad)) {
                    means.push(stats.mean);
                    gradients.push(grad);
                    labels.push(country);
                }
            }
        });

        if (means.length > 0) {
            traces.push({
                x: means,
                y: gradients,
                mode: 'markers+text',
                name: `Year ${year}`,
                text: labels,
                textposition: 'top center',
                marker: {
                    size: 12,
                    opacity: 0.7
                },
                type: 'scatter'
            });
        }
    });

    // Chart layout
    const predLabel = getPredictorLabel(predictorVar, true);
    const outcomeLabel = getOutcomeLabel(outcomeVar);

    const layout = {
        title: `Stratification of Achievement (${outcomeLabel})`,
        xaxis: {
            title: 'Mean Achievement Score',
            gridcolor: '#334155'
        },
        yaxis: {
            title: `${predLabel} Gradient (Score Points per 1 unit)`,
            gridcolor: '#334155'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        hovermode: 'closest',
        showlegend: true,
        legend: {
            x: 1,
            xanchor: 'right',
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
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d']
    };

    const chartDiv = document.getElementById('overview-chart');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, traces, layout, config);
    }
}

/**
 * Render country comparison bar chart
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} weightType - Type of weights to use
 */
export function renderCountryComparison(data, outcomeVar = 'math', weightType = 'student') {
    if (!data || data.length === 0) {
        return;
    }

    const countries = [...new Set(data.map(d => d.country))];
    const countryStats = {};

    countries.forEach(country => {
        const countryData = data.filter(d => d.country === country);
        const stats = calculateDescriptiveStats(countryData, outcomeVar, weightType);
        if (stats) {
            countryStats[country] = stats.mean;
        }
    });

    // Sort by mean score
    const sortedCountries = Object.keys(countryStats)
        .sort((a, b) => countryStats[a] - countryStats[b]);

    const trace = {
        x: sortedCountries,
        y: sortedCountries.map(c => countryStats[c]),
        type: 'bar',
        marker: {
            color: '#3b82f6'
        }
    };

    const layout = {
        title: 'Mean Achievement by Country',
        xaxis: {
            title: 'Country',
            gridcolor: '#334155'
        },
        yaxis: {
            title: `Mean ${getOutcomeLabel(outcomeVar)} Score`,
            gridcolor: '#334155'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' }
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    };

    const chartDiv = document.getElementById('country-comparison');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, [trace], layout, config);
    }
}

/**
 * Get predictor label
 * @param {String} predictor - Predictor variable name
 * @param {Boolean} short - Return short label
 * @returns {String} Predictor label
 */
function getPredictorLabel(predictor, short = false) {
    const labels = {
        'escs': short ? 'SES' : 'Socioeconomic Status (ESCS)',
        'parent_edu': short ? 'Parent Edu' : 'Parental Education'
    };

    return labels[predictor] || predictor;
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
    updateOverviewStats,
    renderOverviewChart,
    renderCountryComparison
};
