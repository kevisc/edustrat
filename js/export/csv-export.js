/**
 * CSV Export Module
 * Exports analysis results to CSV format
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

/**
 * Export regression model results to CSV
 * @param {Object} model - Regression model object
 * @param {String} filename - Optional filename
 */
export function exportRegressionTable(model, filename = null) {
    if (!model) {
        console.warn('No model provided for export');
        return;
    }

    const fname = filename || `regression_${model.modelName.replace(/\s+/g, '_')}.csv`;

    // Build CSV content
    let csv = `Regression Results: ${model.modelName}\n`;
    csv += `Generated: ${new Date().toISOString()}\n`;
    csv += `N = ${model.nobs}${model.ngroups ? `, Groups = ${model.ngroups}` : ''}\n`;
    csv += `R² = ${model.r2?.toFixed(4) || 'N/A'}\n`;
    csv += `Adjusted R² = ${model.adjR2?.toFixed(4) || 'N/A'}\n`;

    if (model.r2Within !== undefined) {
        csv += `R² (within) = ${model.r2Within.toFixed(4)}\n`;
    }
    if (model.r2Between !== undefined) {
        csv += `R² (between) = ${model.r2Between.toFixed(4)}\n`;
    }
    if (model.icc !== undefined) {
        csv += `ICC = ${model.icc.toFixed(4)}\n`;
    }

    csv += '\n';
    csv += 'Variable,Coefficient,Std Error,t-statistic,p-value,CI_lower,CI_upper,Significant\n';

    // Export coefficients
    if (model.coefficients && model.variableNames) {
        model.coefficients.forEach((coef, i) => {
            if (i < model.variableNames.length) {
                const se = model.standardErrors?.[i] || NaN;
                const tStat = model.tStatistics?.[i] || (coef / se);
                const pVal = model.pValues?.[i] || NaN;

                // 95% confidence interval
                const ci_lower = coef - 1.96 * se;
                const ci_upper = coef + 1.96 * se;

                const significant = pVal < 0.05 ? 'Yes' : 'No';

                csv += `"${model.variableNames[i]}",${coef.toFixed(4)},${se.toFixed(4)},${tStat.toFixed(4)},${pVal.toFixed(6)},${ci_lower.toFixed(4)},${ci_upper.toFixed(4)},${significant}\n`;
            }
        });
    }

    downloadCSV(csv, fname);
}

/**
 * Export all regression models to single CSV
 * @param {Object} models - Object containing multiple models
 * @param {String} filename - Optional filename
 */
export function exportAllRegressionModels(models, filename = 'regression_models_comparison.csv') {
    if (!models || Object.keys(models).length === 0) {
        console.warn('No models provided for export');
        return;
    }

    let csv = 'Educational Stratification Analysis - Regression Models Comparison\n';
    csv += `Generated: ${new Date().toISOString()}\n\n`;

    Object.values(models).forEach(model => {
        if (!model) return;

        csv += `\n${model.modelName}\n`;
        csv += `N = ${model.nobs}${model.ngroups ? `, Groups = ${model.ngroups}` : ''}\n`;
        csv += `R² = ${model.r2?.toFixed(4) || 'N/A'}, Adj R² = ${model.adjR2?.toFixed(4) || 'N/A'}\n`;
        csv += 'Variable,Coefficient,Std Error,t-statistic,p-value\n';

        if (model.coefficients && model.variableNames) {
            model.coefficients.forEach((coef, i) => {
                if (i < model.variableNames.length) {
                    const se = model.standardErrors?.[i] || NaN;
                    const tStat = model.tStatistics?.[i] || NaN;
                    const pVal = model.pValues?.[i] || NaN;

                    csv += `"${model.variableNames[i]}",${coef.toFixed(4)},${se.toFixed(4)},${tStat.toFixed(4)},${pVal.toFixed(6)}\n`;
                }
            });
        }

        csv += '\n';
    });

    downloadCSV(csv, filename);
}

/**
 * Export descriptive statistics to CSV
 * @param {Object} descriptive - Descriptive statistics object
 * @param {Object} inequality - Inequality measures object
 * @param {String} filename - Optional filename
 */
export function exportDescriptiveStats(descriptive, inequality, filename = 'descriptive_statistics.csv') {
    if (!descriptive) {
        console.warn('No descriptive statistics provided for export');
        return;
    }

    let csv = 'Descriptive Statistics\n';
    csv += `Generated: ${new Date().toISOString()}\n\n`;

    csv += 'Measure,Value\n';
    csv += `Mean,${descriptive.mean?.toFixed(2) || 'N/A'}\n`;
    csv += `Standard Deviation,${descriptive.sd?.toFixed(2) || 'N/A'}\n`;
    csv += `Median,${descriptive.median?.toFixed(2) || 'N/A'}\n`;
    csv += `Minimum,${descriptive.min?.toFixed(2) || 'N/A'}\n`;
    csv += `Maximum,${descriptive.max?.toFixed(2) || 'N/A'}\n`;
    csv += `P10,${descriptive.p10?.toFixed(2) || 'N/A'}\n`;
    csv += `P25,${descriptive.p25?.toFixed(2) || 'N/A'}\n`;
    csv += `P75,${descriptive.p75?.toFixed(2) || 'N/A'}\n`;
    csv += `P90,${descriptive.p90?.toFixed(2) || 'N/A'}\n`;
    csv += `IQR,${descriptive.iqr?.toFixed(2) || 'N/A'}\n`;
    csv += `N,${descriptive.n || 'N/A'}\n`;

    if (inequality) {
        csv += '\nInequality Measures\n';
        csv += 'Measure,Value\n';
        csv += `Gini Coefficient,${inequality.gini?.toFixed(4) || 'N/A'}\n`;
        csv += `Coefficient of Variation,${inequality.cv?.toFixed(4) || 'N/A'}\n`;
        csv += `P90/P10 Ratio,${inequality.p90p10?.toFixed(2) || 'N/A'}\n`;
        csv += `Range,${inequality.range?.toFixed(2) || 'N/A'}\n`;
    }

    downloadCSV(csv, filename);
}

/**
 * Export achievement gap decomposition to CSV
 * @param {Object} gap - Gap decomposition object
 * @param {String} filename - Optional filename
 */
export function exportGapDecomposition(gap, filename = 'achievement_gap_decomposition.csv') {
    if (!gap) {
        console.warn('No gap decomposition provided for export');
        return;
    }

    let csv = 'Achievement Gap Decomposition (Q4-Q1 SES Quartiles)\n';
    csv += `Generated: ${new Date().toISOString()}\n\n`;

    csv += 'Measure,Value\n';
    csv += `Gap (Q4-Q1),${gap.gap_q4_q1?.toFixed(2) || 'N/A'}\n`;
    csv += `Effect Size (Cohen's d),${gap.effect_size?.toFixed(3) || 'N/A'}\n`;
    csv += `Pooled SD,${gap.pooled_sd?.toFixed(2) || 'N/A'}\n`;
    csv += `Gap as % of Q1 Mean,${gap.gap_percent?.toFixed(1) || 'N/A'}%\n\n`;

    csv += 'Quartile Statistics\n';
    csv += 'Quartile,Mean,SD,N\n';

    if (gap.q1) {
        csv += `Q1 (Bottom SES),${gap.q1.mean?.toFixed(2)},${gap.q1.sd?.toFixed(2)},${gap.q1.n}\n`;
    }
    if (gap.q2) {
        csv += `Q2,${gap.q2.mean?.toFixed(2)},${gap.q2.sd?.toFixed(2)},${gap.q2.n}\n`;
    }
    if (gap.q3) {
        csv += `Q3,${gap.q3.mean?.toFixed(2)},${gap.q3.sd?.toFixed(2)},${gap.q3.n}\n`;
    }
    if (gap.q4) {
        csv += `Q4 (Top SES),${gap.q4.mean?.toFixed(2)},${gap.q4.sd?.toFixed(2)},${gap.q4.n}\n`;
    }

    downloadCSV(csv, filename);
}

/**
 * Export variance decomposition to CSV
 * @param {Object} decomp - Variance decomposition object
 * @param {String} filename - Optional filename
 */
export function exportVarianceDecomposition(decomp, filename = 'variance_decomposition.csv') {
    if (!decomp) {
        console.warn('No variance decomposition provided for export');
        return;
    }

    let csv = 'Variance Decomposition\n';
    csv += `Generated: ${new Date().toISOString()}\n\n`;

    csv += 'Component,Variance,Percent of Total\n';
    csv += `Within-country,${decomp.withinVariance?.toFixed(2)},${decomp.percentWithin?.toFixed(1)}%\n`;
    csv += `Between-country,${decomp.betweenVariance?.toFixed(2)},${decomp.percentBetween?.toFixed(1)}%\n`;
    csv += `Total,${decomp.totalVariance?.toFixed(2)},100.0%\n\n`;

    csv += 'Intraclass Correlation (ICC)\n';
    csv += `ICC,${decomp.icc?.toFixed(4)}\n`;
    csv += `Interpretation,"${(decomp.icc * 100).toFixed(1)}% of total variance is between countries"\n`;

    downloadCSV(csv, filename);
}

/**
 * Export comparative statistics (by country-year) to CSV
 * @param {Object} comparativeResults - Comparative results object
 * @param {String} filename - Optional filename
 */
export function exportComparativeStats(comparativeResults, filename = 'comparative_statistics.csv') {
    if (!comparativeResults || Object.keys(comparativeResults).length === 0) {
        console.warn('No comparative results provided for export');
        return;
    }

    let csv = 'Comparative Statistics by Country and Year\n';
    csv += `Generated: ${new Date().toISOString()}\n\n`;

    csv += 'Country,Year,Mean Achievement,Gini Coefficient,SES Gradient,N\n';

    Object.keys(comparativeResults).sort().forEach(country => {
        const countryData = comparativeResults[country];

        Object.keys(countryData).sort().forEach(year => {
            const stats = countryData[year];

            if (stats) {
                csv += `${country},${year},${stats.mean?.toFixed(2) || 'N/A'},${stats.gini?.toFixed(4) || 'N/A'},${stats.predictorGradient?.toFixed(2) || 'N/A'},${stats.n || 'N/A'}\n`;
            }
        });
    });

    downloadCSV(csv, filename);
}

/**
 * Export Hausman test results to CSV
 * @param {Object} hausmanTest - Hausman test object
 * @param {String} filename - Optional filename
 */
export function exportHausmanTest(hausmanTest, filename = 'hausman_test.csv') {
    if (!hausmanTest) {
        console.warn('No Hausman test results provided for export');
        return;
    }

    let csv = 'Hausman Specification Test Results\n';
    csv += `Generated: ${new Date().toISOString()}\n\n`;

    csv += 'Test Statistic,Value\n';
    csv += `Chi-squared,${hausmanTest.chiSquared?.toFixed(4)}\n`;
    csv += `Degrees of Freedom,${hausmanTest.df}\n`;
    csv += `p-value,${hausmanTest.pValue?.toFixed(6)}\n`;
    csv += `Reject Null?,${hausmanTest.reject ? 'Yes' : 'No'}\n\n`;

    csv += 'Coefficients Comparison\n';
    csv += `Fixed Effects Coefficient,${hausmanTest.bFE?.toFixed(4)}\n`;
    csv += `Random Effects Coefficient,${hausmanTest.bRE?.toFixed(4)}\n`;
    csv += `Difference,${hausmanTest.difference?.toFixed(4)}\n\n`;

    csv += 'Conclusion\n';
    csv += `"${hausmanTest.conclusion}"\n`;

    downloadCSV(csv, filename);
}

/**
 * Export comprehensive analysis summary to CSV
 * @param {Object} state - Application state with all results
 * @param {String} filename - Optional filename
 */
export function exportComprehensiveSummary(state, filename = 'analysis_summary.csv') {
    if (!state || !state.analysisResults) {
        console.warn('No analysis results in state');
        return;
    }

    const results = state.analysisResults;
    let csv = 'Educational Stratification Analysis - Comprehensive Summary\n';
    csv += `Generated: ${new Date().toISOString()}\n`;
    csv += `Countries: ${state.selectedCountries?.join(', ') || 'N/A'}\n`;
    csv += `Years: ${state.selectedYears?.join(', ') || 'N/A'}\n`;
    csv += `Total Students: ${state.mergedData?.length || 'N/A'}\n\n`;

    // Descriptive statistics
    if (results.descriptive) {
        csv += 'Overall Descriptive Statistics\n';
        csv += 'Measure,Value\n';
        csv += `Mean,${results.descriptive.mean?.toFixed(2)}\n`;
        csv += `SD,${results.descriptive.sd?.toFixed(2)}\n`;
        csv += `Median,${results.descriptive.median?.toFixed(2)}\n`;
        csv += `N,${results.descriptive.n}\n\n`;
    }

    // Inequality measures
    if (results.inequality) {
        csv += 'Inequality Measures\n';
        csv += 'Measure,Value\n';
        csv += `Gini Coefficient,${results.inequality.gini?.toFixed(4)}\n`;
        csv += `Coefficient of Variation,${results.inequality.cv?.toFixed(4)}\n`;
        csv += `P90/P10 Ratio,${results.inequality.p90p10?.toFixed(2)}\n\n`;
    }

    // SES Gradient
    if (results.gradient !== undefined) {
        csv += 'SES Gradient\n';
        csv += `Gradient (β),${results.gradient?.toFixed(2)}\n\n`;
    }

    // Comparative statistics
    if (results.comparative) {
        csv += 'Statistics by Country-Year\n';
        csv += 'Country,Year,Mean,Gini,SES Gradient,N\n';

        Object.keys(results.comparative).sort().forEach(country => {
            Object.keys(results.comparative[country]).sort().forEach(year => {
                const stats = results.comparative[country][year];
                if (stats) {
                    csv += `${country},${year},${stats.mean?.toFixed(2)},${stats.gini?.toFixed(4)},${stats.predictorGradient?.toFixed(2)},${stats.n}\n`;
                }
            });
        });
    }

    downloadCSV(csv, filename);
}

/**
 * Helper function to trigger CSV download
 * @param {String} csvContent - CSV content as string
 * @param {String} filename - Filename for download
 */
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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

    console.log(`✓ CSV exported: ${filename}`);
}

export default {
    exportRegressionTable,
    exportAllRegressionModels,
    exportDescriptiveStats,
    exportGapDecomposition,
    exportVarianceDecomposition,
    exportComparativeStats,
    exportHausmanTest,
    exportComprehensiveSummary
};
