/**
 * Report Export Module
 * Generates comprehensive HTML analysis reports
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

import { getChartAsBase64PNG } from './figure-export.js';

/**
 * Generate and download complete HTML analysis report
 * @param {Object} state - Application state with all results
 * @param {String} filename - Optional filename
 */
export async function generateFullReport(state, filename = 'pisa_analysis_report.html') {
    if (!state || !state.mergedData) {
        alert('No data loaded. Please load data before generating a report.');
        return;
    }

    console.log('Generating comprehensive analysis report...');

    try {
        // Collect all chart images as base64
        const charts = await collectChartImages();

        // Build HTML report
        const html = await buildReportHTML(state, charts);

        // Download as HTML file
        downloadHTML(html, filename);

        console.log(`✓ Report generated: ${filename}`);
        alert(`Analysis report generated successfully!\n\nFile: ${filename}\n\nThe report is a self-contained HTML file that can be opened in any web browser.`);

    } catch (error) {
        console.error('Error generating report:', error);
        alert(`Error generating report: ${error.message}`);
    }
}

/**
 * Collect all chart images as base64-encoded PNGs
 * @returns {Promise<Object>} Object with chart IDs as keys and base64 data as values
 */
async function collectChartImages() {
    const chartIds = [
        // Overview & Distribution
        'overview-chart',
        'distribution-chart',
        'percentile-chart',
        'lorenz-curve',
        // Achievement Gap
        'gap-plot',
        // Regression
        'regression-scatter',
        'coefficient-plot',
        // Diagnostics
        'residual-plot-ols',
        'residual-plot-fe',
        'residual-plot-re',
        'qq-plot-ols',
        'qq-plot-fe',
        'qq-plot-re',
        'decomposition-chart',
        // Comparative
        'world-map',
        'temporal-trends',
        'country-comparison',
        'gap-comparison'
    ];

    const charts = {};

    for (const chartId of chartIds) {
        const chartDiv = document.getElementById(chartId);
        if (chartDiv && chartDiv.data && chartDiv.data.length > 0) {
            try {
                const base64 = await getChartAsBase64PNG(chartId, 800, 600);
                if (base64) {
                    charts[chartId] = base64;
                    console.log(`✓ Captured chart: ${chartId}`);
                }
            } catch (error) {
                console.warn(`Could not capture chart: ${chartId}`, error);
            }
        } else {
            console.log(`Skipping chart: ${chartId} (no data or not rendered)`);
        }
    }

    return charts;
}

/**
 * Build complete HTML report
 * @param {Object} state - Application state
 * @param {Object} charts - Chart images as base64
 * @returns {Promise<String>} HTML content
 */
async function buildReportHTML(state, charts) {
    const results = state.analysisResults || {};
    const data = state.mergedData || [];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PISA Educational Stratification Analysis Report</title>
    <style>
        ${getReportStyles()}
    </style>
</head>
<body>
    <div class="container">
        ${buildReportHeader(state)}
        ${buildDataOverview(state, data)}
        ${buildDescriptiveStatistics(results)}
        ${buildInequalityMeasures(results)}
        ${buildGapAnalysis(results, state)}
        ${buildRegressionResults(state)}
        ${buildVarianceDecomposition(results)}
        ${buildComparativeAnalysis(results, state)}
        ${buildChartsSection(charts)}
        ${buildMethodologySection()}
        ${buildCitationSection()}
        ${buildFooter()}
    </div>
</body>
</html>`;

    return html;
}

/**
 * Get CSS styles for report
 * @returns {String} CSS
 */
function getReportStyles() {
    return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #1e293b;
            background: #f8fafc;
            padding: 2rem;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            padding: 3rem;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            border-radius: 8px;
        }
        h1 {
            color: #0f172a;
            font-size: 2rem;
            margin-bottom: 1rem;
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 0.5rem;
        }
        h2 {
            color: #1e293b;
            font-size: 1.5rem;
            margin-top: 2rem;
            margin-bottom: 1rem;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 0.5rem;
        }
        h3 {
            color: #334155;
            font-size: 1.25rem;
            margin-top: 1.5rem;
            margin-bottom: 0.75rem;
        }
        p {
            margin-bottom: 1rem;
            color: #475569;
        }
        .header {
            text-align: center;
            margin-bottom: 3rem;
        }
        .subtitle {
            color: #64748b;
            font-size: 1.1rem;
        }
        .metadata {
            background: #f1f5f9;
            padding: 1rem;
            border-radius: 6px;
            margin: 1rem 0;
            font-size: 0.9rem;
        }
        .metadata strong {
            color: #0f172a;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
            font-size: 0.9rem;
        }
        th, td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid #e2e8f0;
        }
        th {
            background: #f1f5f9;
            font-weight: 600;
            color: #0f172a;
        }
        tr:hover {
            background: #f8fafc;
        }
        .stat-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin: 1rem 0;
        }
        .stat-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 1rem;
        }
        .stat-card .value {
            font-size: 1.5rem;
            font-weight: 700;
            color: #3b82f6;
            margin: 0.5rem 0;
        }
        .stat-card .label {
            font-size: 0.875rem;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .chart-container {
            margin: 2rem 0;
            text-align: center;
        }
        .chart-container img {
            max-width: 100%;
            height: auto;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
        }
        .chart-caption {
            font-size: 0.875rem;
            color: #64748b;
            margin-top: 0.5rem;
            font-style: italic;
        }
        .alert {
            padding: 1rem;
            border-radius: 6px;
            margin: 1rem 0;
        }
        .alert-info {
            background: #dbeafe;
            border-left: 4px solid #3b82f6;
            color: #1e40af;
        }
        .methodology {
            background: #f8fafc;
            padding: 1.5rem;
            border-radius: 6px;
            margin: 1rem 0;
            border-left: 4px solid #10b981;
        }
        .citation {
            background: #fef3c7;
            padding: 1.5rem;
            border-radius: 6px;
            margin: 1rem 0;
            border-left: 4px solid #f59e0b;
        }
        .footer {
            margin-top: 3rem;
            padding-top: 2rem;
            border-top: 2px solid #e2e8f0;
            text-align: center;
            color: #64748b;
            font-size: 0.875rem;
        }
        .page-break {
            page-break-after: always;
        }
        @media print {
            body {
                background: white;
                padding: 0;
            }
            .container {
                box-shadow: none;
                padding: 1rem;
            }
        }
    `;
}

/**
 * Build report header
 */
function buildReportHeader(state) {
    const date = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return `
        <div class="header">
            <img src="pisa-app-icon.png" alt="PISA App Icon" style="width: 80px; height: 80px; object-fit: contain; margin-bottom: 1rem;">
            <h1>Educational Stratification Analysis Report</h1>
            <p class="subtitle">Educational Stratification in PISA</p>
            <div class="metadata">
                <strong>Generated:</strong> ${date}<br>
                <strong>Countries:</strong> ${state.selectedCountries?.join(', ') || 'N/A'}<br>
                <strong>Years:</strong> ${state.selectedYears?.join(', ') || 'N/A'}<br>
                <strong>Total Students:</strong> ${state.mergedData?.length.toLocaleString() || 'N/A'}
            </div>
        </div>
    `;
}

/**
 * Build data overview section
 */
function buildDataOverview(state, data) {
    const countries = [...new Set(data.map(d => d.country))];
    const years = [...new Set(data.map(d => d.year))].sort();
    const outcome = state.currentOutcome || 'math';
    const predictor = state.currentPredictor || 'escs';

    // Calculate basic summary statistics
    const validScores = data.filter(d => isFinite(d[outcome])).map(d => +d[outcome]);
    const mean = validScores.reduce((sum, v) => sum + v, 0) / validScores.length;
    const sorted = validScores.sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = Math.min(...validScores);
    const max = Math.max(...validScores);
    const sd = Math.sqrt(validScores.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validScores.length);

    return `
        <h2>1. Data Overview & Summary Statistics</h2>
        <p>This report presents an analysis of educational stratification and intergenerational transmission using data from the Programme for International Student Assessment (PISA). The analysis examines <strong>${countries.length} ${countries.length === 1 ? 'country' : 'countries'}</strong> across <strong>${years.length} ${years.length === 1 ? 'year' : 'years'}</strong>, totaling <strong>${data.length.toLocaleString()} student observations</strong>.</p>

        <h3>Analysis Parameters</h3>
        <ul>
            <li><strong>Outcome Variable:</strong> ${outcome.charAt(0).toUpperCase() + outcome.slice(1)} Achievement</li>
            <li><strong>Predictor Variable:</strong> ${predictor === 'escs' ? 'ESCS (Economic, Social and Cultural Status)' : 'Parental Education'}</li>
            <li><strong>Years:</strong> ${years.join(', ')}</li>
            <li><strong>Countries:</strong> ${countries.join(', ')}</li>
        </ul>

        <h3>Summary Statistics (${outcome.charAt(0).toUpperCase() + outcome.slice(1)} Scores)</h3>
        <table>
            <thead>
                <tr>
                    <th>Statistic</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>Sample Size</td><td>${validScores.length.toLocaleString()}</td></tr>
                <tr><td>Mean</td><td>${mean.toFixed(2)}</td></tr>
                <tr><td>Median</td><td>${median.toFixed(2)}</td></tr>
                <tr><td>Standard Deviation</td><td>${sd.toFixed(2)}</td></tr>
                <tr><td>Minimum</td><td>${min.toFixed(2)}</td></tr>
                <tr><td>Maximum</td><td>${max.toFixed(2)}</td></tr>
                <tr><td>Range</td><td>${(max - min).toFixed(2)}</td></tr>
            </tbody>
        </table>

        <h3>Sample Composition by Country</h3>
        <table>
            <thead>
                <tr>
                    <th>Country</th>
                    <th>Years</th>
                    <th>Students</th>
                    <th>% of Total</th>
                </tr>
            </thead>
            <tbody>
                ${countries.map(country => {
                    const countryData = data.filter(d => d.country === country);
                    const countryYears = [...new Set(countryData.map(d => d.year))].sort();
                    const pct = (countryData.length / data.length * 100).toFixed(1);
                    return `
                        <tr>
                            <td>${country}</td>
                            <td>${countryYears.join(', ')}</td>
                            <td>${countryData.length.toLocaleString()}</td>
                            <td>${pct}%</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Build descriptive statistics section
 */
function buildDescriptiveStatistics(results) {
    const desc = results.descriptive;
    if (!desc) return '';

    return `
        <h2>2. Descriptive Statistics</h2>
        <p>Summary statistics for achievement scores across all selected countries and years.</p>

        <div class="stat-grid">
            <div class="stat-card">
                <div class="label">Mean Score</div>
                <div class="value">${desc.mean?.toFixed(2) || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="label">Standard Deviation</div>
                <div class="value">${desc.sd?.toFixed(2) || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="label">Median</div>
                <div class="value">${desc.median?.toFixed(2) || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="label">Sample Size</div>
                <div class="value">${desc.n?.toLocaleString() || 'N/A'}</div>
            </div>
        </div>

        <h3>Percentiles</h3>
        <table>
            <thead>
                <tr>
                    <th>Percentile</th>
                    <th>Score</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>10th (P10)</td><td>${desc.p10?.toFixed(2) || 'N/A'}</td></tr>
                <tr><td>25th (Q1)</td><td>${desc.p25?.toFixed(2) || 'N/A'}</td></tr>
                <tr><td>50th (Median)</td><td>${desc.p50?.toFixed(2) || 'N/A'}</td></tr>
                <tr><td>75th (Q3)</td><td>${desc.p75?.toFixed(2) || 'N/A'}</td></tr>
                <tr><td>90th (P90)</td><td>${desc.p90?.toFixed(2) || 'N/A'}</td></tr>
            </tbody>
        </table>
    `;
}

/**
 * Build distributional measures section
 */
function buildInequalityMeasures(results) {
    const ineq = results.inequality;
    if (!ineq) return '';

    return `
        <h2>3. Distributional Measures</h2>
        <p>Measures of dispersion in achievement scores.</p>

        <table>
            <thead>
                <tr>
                    <th>Measure</th>
                    <th>Value</th>
                    <th>Interpretation</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Gini Coefficient</td>
                    <td>${ineq.gini?.toFixed(4) || 'N/A'}</td>
                    <td>0 = all identical, 1 = maximum dispersion</td>
                </tr>
                <tr>
                    <td>Coefficient of Variation</td>
                    <td>${ineq.cv?.toFixed(4) || 'N/A'}</td>
                    <td>Standardized measure of dispersion</td>
                </tr>
                <tr>
                    <td>P90/P10 Ratio</td>
                    <td>${ineq.p90p10?.toFixed(2) || 'N/A'}</td>
                    <td>Top 10% score relative to bottom 10%</td>
                </tr>
            </tbody>
        </table>

        ${results.gradient !== undefined ? `
        <h3>SES Gradient</h3>
        <p>The socioeconomic status (SES) gradient measures how much achievement increases per unit increase in SES.</p>
        <div class="stat-card">
            <div class="label">SES Gradient (β)</div>
            <div class="value">${results.gradient?.toFixed(2) || 'N/A'}</div>
            <p style="margin-top: 0.5rem; font-size: 0.875rem;">Score points per 1-unit increase in ESCS index</p>
        </div>
        ` : ''}
    `;
}

/**
 * Build gap analysis section
 */
function buildGapAnalysis(results, state) {
    let html = `
        <div class="page-break"></div>
        <h2>4. Achievement Gap Analysis</h2>
        <p>Analysis of achievement gaps by socioeconomic status quartiles.</p>
    `;

    // Try to get gap data from decomposition calculation
    const data = state.mergedData || [];
    const outcomeVar = state.currentOutcome || 'math';
    const predictorVar = state.currentPredictor || 'escs';
    const weightType = state.weightType || 'student';

    if (data.length > 0 && window.decomposeAchievementGap && window.calculateVarianceDecomposition) {
        try {
            const gap = window.decomposeAchievementGap(data, outcomeVar, predictorVar, weightType);
            const decomp = window.calculateVarianceDecomposition(data, outcomeVar);

            if (gap) {
                html += `
                    <div class="results-table-container">
                        <h3>Achievement Gap (Q4-Q1 SES Quartiles)</h3>
                        <table class="results-table">
                            <thead>
                                <tr>
                                    <th>Measure</th>
                                    <th>Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Gap (Q4 - Q1)</td>
                                    <td><strong>${gap.gap_q4_q1.toFixed(2)} points</strong></td>
                                </tr>
                                <tr>
                                    <td>Effect Size (Cohen's d)</td>
                                    <td>${gap.effect_size.toFixed(2)}</td>
                                </tr>
                                <tr>
                                    <td>Q1 Mean Score</td>
                                    <td>${gap.q1.mean.toFixed(2)} (n=${gap.q1.n.toLocaleString()})</td>
                                </tr>
                                <tr>
                                    <td>Q4 Mean Score</td>
                                    <td>${gap.q4.mean.toFixed(2)} (n=${gap.q4.n.toLocaleString()})</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                `;
            }

            if (decomp) {
                html += `
                    <div class="results-table-container" style="margin-top: 2rem;">
                        <h3>Variance Decomposition</h3>
                        <table class="results-table">
                            <thead>
                                <tr>
                                    <th>Component</th>
                                    <th>Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Total Variance</td>
                                    <td>${decomp.totalVariance.toFixed(2)}</td>
                                </tr>
                                <tr>
                                    <td>Within-Country Variance</td>
                                    <td>${decomp.withinVariance.toFixed(2)} (${decomp.percentWithin.toFixed(1)}%)</td>
                                </tr>
                                <tr>
                                    <td>Between-Country Variance</td>
                                    <td>${decomp.betweenVariance.toFixed(2)} (${decomp.percentBetween.toFixed(1)}%)</td>
                                </tr>
                                <tr>
                                    <td>Intraclass Correlation (ICC)</td>
                                    <td>${decomp.icc.toFixed(3)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                `;
            }
        } catch (error) {
            console.warn('Could not calculate gap analysis for report:', error);
            html += `<p class="alert alert-info">Gap decomposition results available in separate export.</p>`;
        }
    } else {
        html += `<p class="alert alert-info">Gap decomposition results available in separate export.</p>`;
    }

    return html;
}

/**
 * Build regression results section
 */
function buildRegressionResults(state) {
    let html = `
        <div class="page-break"></div>
        <h2>5. Regression Analysis</h2>
        <p>Regression models examining the relationship between socioeconomic status and achievement.</p>
    `;

    // Try to get regression results from state
    const data = state.mergedData || [];
    const outcomeVar = state.currentOutcome || 'math';
    const predictorVar = state.currentPredictor || 'escs';
    const weightType = state.weightType || 'student';

    if (data.length > 0 && window.runPooledOLS) {
        try {
            // Run regressions to get fresh results
            const ols = window.runPooledOLS(data, outcomeVar, predictorVar, [], weightType);

            if (ols && ols.coefficients) {
                const predLabel = predictorVar === 'escs' ? 'SES (ESCS)' : 'Parental Education';

                html += `
                    <div class="results-table-container">
                        <h3>OLS Regression Results</h3>
                        <table class="results-table">
                            <thead>
                                <tr>
                                    <th>Variable</th>
                                    <th>Coefficient</th>
                                    <th>Std. Error</th>
                                    <th>t-statistic</th>
                                    <th>p-value</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Intercept</td>
                                    <td>${ols.coefficients[0].toFixed(3)}</td>
                                    <td>${ols.standardErrors[0].toFixed(3)}</td>
                                    <td>${ols.tStatistics[0].toFixed(3)}</td>
                                    <td>${ols.pValues[0] < 0.001 ? '<0.001' : ols.pValues[0].toFixed(3)}</td>
                                </tr>
                                <tr>
                                    <td><strong>${predLabel}</strong></td>
                                    <td><strong>${ols.coefficients[1].toFixed(3)}</strong></td>
                                    <td>${ols.standardErrors[1].toFixed(3)}</td>
                                    <td><strong>${ols.tStatistics[1].toFixed(3)}</strong></td>
                                    <td><strong>${ols.pValues[1] < 0.001 ? '<0.001' : ols.pValues[1].toFixed(3)}</strong></td>
                                </tr>
                            </tbody>
                        </table>
                        <p style="margin-top: 1rem; font-size: 0.9em;">
                            <strong>Model Fit:</strong> R² = ${(ols.r2 * 100).toFixed(2)}% |
                            N = ${ols.nobs.toLocaleString()} |
                            F-statistic = ${ols.fStatistic ? ols.fStatistic.toFixed(2) : 'N/A'}
                        </p>
                    </div>
                `;

                // Interpretation
                const gradient = ols.coefficients[1];
                const isSignificant = ols.pValues[1] < 0.05;

                html += `
                    <div class="alert alert-info" style="margin-top: 1.5rem;">
                        <strong>Interpretation:</strong> ${isSignificant ? 'A statistically significant' : 'An'} positive relationship exists between ${predLabel.toLowerCase()} and achievement.
                        On average, a one-unit increase in ${predLabel.toLowerCase()} is associated with a ${Math.abs(gradient).toFixed(2)}-point ${gradient > 0 ? 'increase' : 'decrease'} in ${outcomeVar} scores${isSignificant ? ' (p < 0.05)' : ''}.
                        The model explains ${(ols.r2 * 100).toFixed(1)}% of the variance in achievement.
                    </div>
                `;
            } else {
                html += `<p class="alert alert-info">Detailed regression results available in CSV export format.</p>`;
            }
        } catch (error) {
            console.warn('Could not calculate regression for report:', error);
            html += `<p class="alert alert-info">Detailed regression results available in CSV export format.</p>`;
        }
    } else {
        html += `<p class="alert alert-info">Detailed regression results available in CSV export format.</p>`;
    }

    return html;
}

/**
 * Build variance decomposition section
 */
function buildVarianceDecomposition(results) {
    return `
        <h2>6. Variance Decomposition</h2>
        <p>Partitioning of total achievement variance into within-country and between-country components.</p>
        <p class="alert alert-info">Variance decomposition chart included in visualizations section below.</p>
    `;
}

/**
 * Build comparative analysis section
 */
function buildComparativeAnalysis(results, state) {
    let html = `
        <div class="page-break"></div>
        <h2>7. Comparative Analysis</h2>
        <p><strong>Purpose:</strong> This section compares educational achievement and stratification patterns across countries, revealing which nations have high performance combined with equity, and which face trade-offs between excellence and equality.</p>
    `;

    // Try to generate comparative statistics from data
    const data = state.mergedData || [];
    const outcomeVar = state.currentOutcome || 'math';
    const predictorVar = state.currentPredictor || 'escs';
    const weightType = state.weightType || 'student';

    if (data.length > 0 && window.runPooledOLS && window.calculateDescriptiveStats && window.decomposeAchievementGap) {
        try {
            const countries = [...new Set(data.map(d => d.country))].sort();
            const years = [...new Set(data.map(d => d.year))].sort();

            // Create comprehensive country-level table
            const countryStats = [];

            countries.forEach(country => {
                const countryData = data.filter(d => d.country === country);
                if (countryData.length < 100) return; // Skip small samples

                try {
                    // Descriptive stats
                    const desc = window.calculateDescriptiveStats(countryData, outcomeVar, weightType);

                    // Gap analysis
                    const gap = window.decomposeAchievementGap(countryData, outcomeVar, predictorVar, weightType);

                    // Regression
                    const model = window.runPooledOLS(countryData, outcomeVar, predictorVar, [], weightType);

                    if (desc && gap && model) {
                        countryStats.push({
                            country,
                            n: countryData.length,
                            mean: desc.mean,
                            sd: desc.sd,
                            p10: desc.percentiles['10'],
                            p90: desc.percentiles['90'],
                            gap: gap.gap_q4_q1,
                            effectSize: gap.effect_size,
                            gradient: model.coefficients[1],
                            r2: model.r2
                        });
                    }
                } catch (error) {
                    console.warn(`Could not calculate stats for ${country}:`, error);
                }
            });

            if (countryStats.length > 0) {
                html += `
                    <h3>Country-Level Achievement and Stratification Summary</h3>
                    <p><strong>How to Read This Table:</strong> Each row shows a country's achievement level (Mean), dispersion (SD, P10-P90 range), ESCS-based stratification (Gap, Effect Size), and the strength of the SES-achievement relationship (Gradient, R²).</p>

                    <div class="results-table-container">
                        <table class="results-table">
                            <thead>
                                <tr>
                                    <th>Country</th>
                                    <th>N</th>
                                    <th>Mean</th>
                                    <th>SD</th>
                                    <th>P10</th>
                                    <th>P90</th>
                                    <th>Gap (Q4-Q1)</th>
                                    <th>Effect Size</th>
                                    <th>SES Gradient</th>
                                    <th>R²</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${countryStats.map(stat => `
                                    <tr>
                                        <td><strong>${stat.country}</strong></td>
                                        <td>${stat.n.toLocaleString()}</td>
                                        <td>${stat.mean.toFixed(1)}</td>
                                        <td>${stat.sd.toFixed(1)}</td>
                                        <td>${stat.p10 ? stat.p10.toFixed(1) : 'N/A'}</td>
                                        <td>${stat.p90 ? stat.p90.toFixed(1) : 'N/A'}</td>
                                        <td>${stat.gap.toFixed(1)}</td>
                                        <td>${stat.effectSize.toFixed(2)}</td>
                                        <td>${stat.gradient.toFixed(2)}</td>
                                        <td>${(stat.r2 * 100).toFixed(1)}%</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div class="alert alert-info" style="margin-top: 1.5rem;">
                        <h4>Interpreting the Columns:</h4>
                        <ul>
                            <li><strong>Mean:</strong> Average achievement score (higher is better)</li>
                            <li><strong>SD:</strong> Standard deviation (higher = more dispersion)</li>
                            <li><strong>P10/P90:</strong> 10th and 90th percentile scores (range shows dispersion)</li>
                            <li><strong>Gap (Q4-Q1):</strong> Achievement difference between top and bottom SES quartiles in score points</li>
                            <li><strong>Effect Size:</strong> Standardized gap (Cohen's d); >0.8 is large</li>
                            <li><strong>SES Gradient:</strong> Score point increase per 1-unit increase in ESCS (steeper = more variation)</li>
                            <li><strong>R²:</strong> Percent of variance explained by SES (higher = SES more determinative)</li>
                        </ul>
                    </div>
                `;

                // Add Excellence-Equity Classification
                const highMean = countryStats.reduce((sum, s) => sum + s.mean, 0) / countryStats.length;
                const highGap = countryStats.reduce((sum, s) => sum + s.gap, 0) / countryStats.length;

                const highExcellenceHighEquity = countryStats.filter(s => s.mean > highMean && s.gap < highGap);
                const highExcellenceLowEquity = countryStats.filter(s => s.mean > highMean && s.gap >= highGap);
                const lowExcellenceHighEquity = countryStats.filter(s => s.mean <= highMean && s.gap < highGap);
                const lowExcellenceLowEquity = countryStats.filter(s => s.mean <= highMean && s.gap >= highGap);

                html += `
                    <div style="margin-top: 2rem;">
                        <h3>Excellence-Equity Classification</h3>
                        <p><strong>Purpose:</strong> Countries are classified into four quadrants based on whether they have above or below average achievement (Excellence) and above or below average SES gaps (Equity).</p>

                        <div class="grid-2" style="gap: 1rem; margin-top: 1rem;">
                            <div class="stat-card" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                                <h4 style="color: white;">High Excellence, High Equity ✓✓</h4>
                                <p style="color: white; font-size: 0.9em;">Above average achievement, weaker intergenerational transmission</p>
                                <p style="color: white;"><strong>${highExcellenceHighEquity.length > 0 ? highExcellenceHighEquity.map(s => s.country).join(', ') : 'None'}</strong></p>
                            </div>
                            <div class="stat-card" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                                <h4 style="color: white;">High Excellence, Low Equity ✓✗</h4>
                                <p style="color: white; font-size: 0.9em;">Above average achievement, stronger intergenerational transmission</p>
                                <p style="color: white;"><strong>${highExcellenceLowEquity.length > 0 ? highExcellenceLowEquity.map(s => s.country).join(', ') : 'None'}</strong></p>
                            </div>
                            <div class="stat-card" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
                                <h4 style="color: white;">Low Excellence, High Equity ✗✓</h4>
                                <p style="color: white; font-size: 0.9em;">Below average achievement, weaker intergenerational transmission</p>
                                <p style="color: white;"><strong>${lowExcellenceHighEquity.length > 0 ? lowExcellenceHighEquity.map(s => s.country).join(', ') : 'None'}</strong></p>
                            </div>
                            <div class="stat-card" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
                                <h4 style="color: white;">Low Excellence, Low Equity ✗✗</h4>
                                <p style="color: white; font-size: 0.9em;">Below average achievement, stronger intergenerational transmission</p>
                                <p style="color: white;"><strong>${lowExcellenceLowEquity.length > 0 ? lowExcellenceLowEquity.map(s => s.country).join(', ') : 'None'}</strong></p>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                html += `<p class="alert alert-info">Comparative statistics could not be calculated.</p>`;
            }

        } catch (error) {
            console.warn('Could not build comparative analysis:', error);
            html += `<p class="alert alert-info">Full comparative statistics available in CSV export format.</p>`;
        }
    } else {
        html += `<p class="alert alert-info">Full comparative statistics available in CSV export format.</p>`;
    }

    return html;
}

/**
 * Build charts section with embedded images and explanations
 */
function buildChartsSection(charts) {
    let html = `
        <div class="page-break"></div>
        <h2>8. Visualizations & Interpretations</h2>
        <p>This section presents all charts and plots generated during the analysis, with detailed explanations of their purpose and how to interpret them.</p>
    `;

    const chartInfo = {
        'overview-chart': {
            title: 'Achievement and Stratification Overview',
            purpose: 'Shows the relationship between mean achievement scores and SES gradients across countries and years.',
            interpretation: 'Each point represents a country-year combination. Countries in the upper-right have both high achievement and strong SES gradients (strong intergenerational transmission). Countries in the lower-left have lower achievement and weaker SES gradients. This chart reveals the trade-off (or lack thereof) between excellence and equity in education systems.'
        },
        'distribution-chart': {
            title: 'Score Distribution by Country and Year',
            purpose: 'Displays the distribution of achievement scores using box plots grouped by country and year.',
            interpretation: 'Each box shows the interquartile range (25th to 75th percentile), with the median line in the middle. Whiskers extend to 1.5 times the IQR. Wider boxes indicate greater dispersion within countries. Compare boxes across years to see temporal changes in achievement distributions. This reveals both central tendency and variation within each country-year.'
        },
        'percentile-chart': {
            title: 'Achievement Percentiles by Country',
            purpose: 'Compares achievement levels at key percentile points (P10, P25, P50, P75, P90) across countries.',
            interpretation: 'Steeper lines indicate greater within-country dispersion. Compare the vertical distance between P90 and P10 to see the achievement gap between top and bottom performers. Countries with parallel lines have similar stratification patterns, while crossing lines suggest different distributional structures.'
        },
        'lorenz-curve': {
            title: 'Lorenz Curve (Achievement Distribution)',
            purpose: 'Visualizes achievement distribution using the Lorenz curve framework, adapted from economics.',
            interpretation: 'The diagonal line represents perfect equality. Curves further from this line indicate greater dispersion. The area between the curve and the diagonal is related to the Gini coefficient. This shows what proportion of total achievement is held by the bottom X% of students.'
        },
        'gap-plot': {
            title: 'Achievement Gap by SES Quartiles',
            purpose: 'Shows the achievement gap between the top (Q4) and bottom (Q1) SES quartiles, broken down by country or year as selected.',
            interpretation: 'Larger bars indicate greater dispersion between high and low SES students. Effect sizes (Cohen\'s d) above 0.8 are considered large. This gap represents the achievement difference attributable to socioeconomic background differences.'
        },
        'regression-scatter': {
            title: 'Scatter Plot with Fitted Regression Lines',
            purpose: 'Visualizes the raw relationship between socioeconomic status (ESCS) and achievement scores, with fitted regression lines overlaid.',
            interpretation: 'Each point is a student. The slope of the fitted line is the SES gradient - steeper slopes mean stronger SES-achievement relationships. The spread of points around the line indicates how much variance remains unexplained. Multiple lines (if shown) represent different model specifications.'
        },
        'coefficient-plot': {
            title: 'Regression Coefficient Comparison Across Models',
            purpose: 'Compares the estimated SES effect (coefficient) across different regression model specifications (OLS, Fixed Effects, Random Effects).',
            interpretation: 'Error bars show 95% confidence intervals. Overlapping bars suggest similar estimates across models. If Fixed Effects estimates differ substantially from OLS, this indicates important between-country heterogeneity that biases pooled estimates. The zero line (red) helps assess statistical significance.'
        },
        'residual-plot-ols': {
            title: 'Residual Plot (OLS Model)',
            purpose: 'Diagnostic plot showing residuals (prediction errors) versus fitted values to assess model assumptions.',
            interpretation: 'Residuals should scatter randomly around zero with no patterns. Funnel shapes indicate heteroscedasticity (non-constant variance). Curved patterns suggest non-linearity. Outliers appear as extreme points far from zero. Systematic patterns indicate model misspecification.'
        },
        'residual-plot-fe': {
            title: 'Residual Plot (Fixed Effects Model)',
            purpose: 'Diagnostic plot for the Fixed Effects model, checking whether country-specific intercepts adequately capture between-country differences.',
            interpretation: 'Similar to OLS residual plot, but after accounting for country fixed effects. Remaining patterns suggest within-country non-linearity or other model violations. Compare to OLS plot - better behavior suggests fixed effects improved the model.'
        },
        'residual-plot-re': {
            title: 'Residual Plot (Random Effects Model)',
            purpose: 'Diagnostic plot for the Random Effects model, assessing model fit after partial pooling of country effects.',
            interpretation: 'Residuals should be randomly scattered. This model assumes country effects are random draws from a distribution. Patterns here suggest violations of the random effects assumptions or remaining misspecification.'
        },
        'qq-plot-ols': {
            title: 'Q-Q Plot: Normality of Residuals (OLS)',
            purpose: 'Tests whether regression residuals follow a normal distribution, an assumption of OLS inference.',
            interpretation: 'Points should fall along the diagonal line if residuals are normally distributed. Deviations at the tails indicate heavier or lighter tails than normal. S-shapes suggest skewness. With large samples, minor deviations are acceptable due to Central Limit Theorem, but major departures warrant concern for inference.'
        },
        'qq-plot-fe': {
            title: 'Q-Q Plot: Normality of Residuals (Fixed Effects)',
            purpose: 'Assesses normality of Fixed Effects model residuals for valid statistical inference.',
            interpretation: 'Similar interpretation to OLS Q-Q plot. Deviations from the line indicate non-normal residuals, which may affect confidence intervals and p-values, though estimates remain unbiased.'
        },
        'qq-plot-re': {
            title: 'Q-Q Plot: Normality of Residuals (Random Effects)',
            purpose: 'Tests normality assumption for Random Effects model residuals.',
            interpretation: 'The Random Effects model assumes both within-group errors and random effects are normally distributed. Departures from linearity suggest violations of these distributional assumptions.'
        },
        'decomposition-chart': {
            title: 'Variance Decomposition (Within vs. Between Countries)',
            purpose: 'Partitions total achievement variance into within-country and between-country components using multilevel modeling.',
            interpretation: 'The bar heights show what percentage of total variance occurs within versus between countries. High between-country variance (large blue bar) means countries differ substantially in average achievement. High within-country variance (large green bar) means more variation exists within than between countries. The ICC (ρ) quantifies the proportion of variance at the country level.'
        },
        'world-map': {
            title: 'Global Map of Intergenerational Educational Stratification',
            purpose: 'Visualizes the strength of the SES → achievement relationship (intergenerational transmission) across countries using a choropleth map.',
            interpretation: 'Darker/warmer colors indicate stronger SES gradients, meaning stronger intergenerational transmission of educational achievement. Lighter/cooler colors show weaker gradients and more educational mobility. Hover over countries to see exact gradient values, R², and sample sizes. This reveals geographic patterns in educational opportunity structures.'
        },
        'temporal-trends': {
            title: 'Temporal Trends in SES Gradients Over Time',
            purpose: 'Tracks changes in the SES → achievement gradient over multiple PISA waves to detect trends in educational stratification.',
            interpretation: 'Rising lines indicate increasing stratification (growing SES effects). Falling lines show decreasing stratification (shrinking SES effects). Flat lines suggest stable stratification. Compare slopes across countries to see which education systems are becoming more or less equitable over time. This addresses the key question: is educational stratification increasing or decreasing?'
        },
        'country-comparison': {
            title: 'Cross-National Achievement Comparison',
            purpose: 'Compares mean achievement scores across countries, grouped by year to show temporal changes.',
            interpretation: 'Bar heights show average achievement levels. Countries are ranked from lowest to highest within each year. Compare bar heights across years to see whether countries improved or declined. This provides context on overall achievement levels before examining stratification patterns.'
        },
        'gap-comparison': {
            title: 'Cross-National Gap Comparison (Q4-Q1 Quartiles)',
            purpose: 'Compares achievement gaps between top and bottom SES quartiles across countries, with both raw gaps and standardized effect sizes.',
            interpretation: 'Blue bars show the raw score gap (points). Red line shows effect sizes (Cohen\'s d). Larger values indicate greater ESCS-based stratification. Compare gaps across countries to identify which have the most and least equitable outcomes. Effect sizes above 0.8 are considered large in educational research.'
        }
    };

    Object.keys(charts).forEach(chartId => {
        const base64 = charts[chartId];
        const info = chartInfo[chartId];

        if (info) {
            html += `
                <div class="chart-container">
                    <h3>${info.title}</h3>
                    <div class="chart-explanation" style="background: #f8f9fa; padding: 1rem; border-left: 4px solid #3b82f6; margin-bottom: 1rem;">
                        <p><strong>Purpose:</strong> ${info.purpose}</p>
                        <p><strong>How to Interpret:</strong> ${info.interpretation}</p>
                    </div>
                    <img src="${base64}" alt="${info.title}" />
                </div>
            `;
        } else {
            // Fallback for any charts without detailed info
            html += `
                <div class="chart-container">
                    <h3>${chartId}</h3>
                    <img src="${base64}" alt="${chartId}" />
                </div>
            `;
        }
    });

    if (Object.keys(charts).length === 0) {
        html += `<p style="color: #888; font-style: italic;">No charts were rendered. Please ensure you navigate through all tabs and render visualizations before generating the report.</p>`;
    }

    return html;
}

/**
 * Build methodology section
 */
function buildMethodologySection() {
    return `
        <div class="page-break"></div>
        <h2>9. Methodology</h2>
        <div class="methodology">
            <h3>Data Source</h3>
            <p>OECD Programme for International Student Assessment (PISA), accessed via the learningtower R package (Wang et al., 2024).</p>

            <h3>Statistical Methods</h3>
            <ul>
                <li><strong>Weighted Statistics:</strong> All analyses use student sampling weights (W_FSTUWT) following OECD (2009) technical standards.</li>
                <li><strong>Gini Coefficient:</strong> Measures dispersion in achievement distribution (0 = all identical, 1 = maximum dispersion).</li>
                <li><strong>SES Gradient:</strong> Regression slope of achievement on ESCS index, indicating score points gained per unit increase in socioeconomic status.</li>
                <li><strong>Variance Decomposition:</strong> Partitioning of total variance into within-country and between-country components using intraclass correlation (ICC).</li>
            </ul>

            <h3>Assumptions & Limitations</h3>
            <ul>
                <li>Cross-sectional design precludes causal inference</li>
                <li>Missing data handled via listwise deletion</li>
                <li>Sampling weights account for complex survey design</li>
                <li>Results represent participating countries only</li>
            </ul>
        </div>
    `;
}

/**
 * Build citation section
 */
function buildCitationSection() {
    return `
        <h2>10. How to Cite</h2>
        <div class="citation">
            <h3>This Tool</h3>
            <p>Schoenholzer, K. (2026). EduStrat: A browser-based tool for teaching quantitative analysis of educational inequality with PISA microdata [Working paper]. https://github.com/kevisc/edustrat</p>

            <h3>Data Source</h3>
            <p>OECD (2024). <em>PISA 2022 Technical Report</em>. OECD Publishing. https://doi.org/10.1787/01820d6d-en</p>

            <h3>R Package</h3>
            <p>Wang, K., Yacobellis, P., Siregar, E., Romanes, S., Fitter, K., Dalla Riva, G. V., Cook, D., Tierney, N., Dingorkar, P., Sai Subramanian, S., & Chen, G. (2024). <em>learningtower: OECD PISA datasets from 2000–2022 in an easy-to-use format</em>. R package version 1.1.0. https://doi.org/10.32614/CRAN.package.learningtower</p>
        </div>
    `;
}

/**
 * Build footer
 */
function buildFooter() {
    return `
        <div class="footer">
            <img src="pisa-app-icon.png" alt="PISA App Icon" style="width: 40px; height: 40px; object-fit: contain; margin-bottom: 0.5rem;">
            <p>Educational Stratification in PISA | Generated with Claude Code</p>
            <p>Kevin Schoenholzer © 2026</p>
            <p style="margin-top: 1rem; font-size: 0.75rem;">
                This report was generated automatically from Educational Stratification in PISA.<br>
                For interactive analysis, visit: https://kevinschoenholzer.com/edustrat/
            </p>
        </div>
    `;
}

/**
 * Download HTML content as file
 */
function downloadHTML(htmlContent, filename) {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement('a');

    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

export default {
    generateFullReport
};
