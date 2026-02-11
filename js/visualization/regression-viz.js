/**
 * Regression Visualization Module
 * Renders regression results, coefficient plots, and diagnostic visualizations
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

/**
 * Get predictor value from a record, handling parent_edu ISCED codes
 * @param {Object} record - Student record
 * @param {String} predictorVar - Predictor variable name
 * @returns {Number|null} Numeric predictor value or null if missing
 */
function getPredictorValue(record, predictorVar) {
    if (predictorVar === 'parent_edu') {
        return parseParentEducation(record);
    }
    const value = +record[predictorVar];
    return isFinite(value) ? value : null;
}

/**
 * Parse parental education from ISCED codes
 * @param {Object} record - Student record
 * @returns {Number|null} Numeric education level
 */
function parseParentEducation(record) {
    const parseISCED = (val) => {
        if (typeof val === 'number' && isFinite(val)) return val;
        const numVal = Number(val);
        if (isFinite(numVal)) return numVal;

        if (typeof val === 'string') {
            const upper = val.toUpperCase().trim();
            if (upper === 'NONE' || upper === 'NA' || upper === 'N/A' || upper === '') return null;
            const match = upper.match(/ISCED\s*(\d)/i);
            if (match) return parseInt(match[1], 10);
        }
        return null;
    };

    const motherEduc = parseISCED(record.mother_educ);
    const fatherEduc = parseISCED(record.father_educ);

    if (motherEduc !== null && fatherEduc !== null) {
        return Math.max(motherEduc, fatherEduc);
    }
    return motherEduc !== null ? motherEduc : fatherEduc;
}

/**
 * Render regression results table
 * @param {Object} model - Regression model results
 * @returns {String} HTML table
 */
export function createModelTable(model) {
    if (!model) {
        return '<p>No model results available</p>';
    }

    let html = `
        <div class="model-box">
            <div class="model-header">${model.modelName}</div>
            <div class="methodology-note" style="margin-bottom: 1rem;">
                N = ${model.nobs}${model.ngroups ? `, Groups = ${model.ngroups}` : ''}<br>
                ${model.r2Within !== undefined && !isNaN(model.r2Within) ? `R² (within) = ${model.r2Within.toFixed(3)}<br>` : ''}
                ${model.r2Between !== undefined && !isNaN(model.r2Between) ? `R² (between) = ${model.r2Between.toFixed(3)}<br>` : ''}
                ${model.r2 !== undefined && !isNaN(model.r2) ? `R² ${model.r2Within !== undefined ? '(overall)' : ''} = ${model.r2.toFixed(3)}<br>` : ''}
                ${model.adjR2 !== undefined && !isNaN(model.adjR2) ? `Adj. R² = ${model.adjR2.toFixed(3)}<br>` : ''}
                ${model.aic !== undefined && !isNaN(model.aic) ? `AIC = ${model.aic.toFixed(1)}<br>` : ''}
                ${model.bic !== undefined && !isNaN(model.bic) ? `BIC = ${model.bic.toFixed(1)}<br>` : ''}
                ${model.icc !== undefined && !isNaN(model.icc) ? `ICC = ${model.icc.toFixed(3)}<br>` : ''}
                ${model.rho !== undefined && !isNaN(model.rho) ? `ρ = ${model.rho.toFixed(3)}<br>` : ''}
                ${model.weighted ? 'Weighted estimation' : ''}
            </div>
            <table class="coef-table">
                <thead>
                    <tr>
                        <th>Variable</th>
                        <th>Coef.</th>
                        <th>SE</th>
                        <th>t-stat</th>
                        <th>p-value</th>
                        <th>95% CI</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (model.coefficients && model.variableNames) {
        model.coefficients.forEach((coef, i) => {
            if (model.pValues && model.standardErrors &&
                i < model.pValues.length && i < model.standardErrors.length &&
                i < model.variableNames.length &&
                !isNaN(coef) && !isNaN(model.standardErrors[i]) && !isNaN(model.pValues[i])) {

                const pVal = Math.min(1, Math.max(0, model.pValues[i]));
                const sig = pVal < 0.05;
                const stars = pVal < 0.001 ? '***' : pVal < 0.01 ? '**' : pVal < 0.05 ? '*' : '';
                const tStat = model.tStatistics ? model.tStatistics[i] : (coef / model.standardErrors[i]);
                const ci_lower = coef - 1.96 * model.standardErrors[i];
                const ci_upper = coef + 1.96 * model.standardErrors[i];

                html += `
                    <tr>
                        <td>${model.variableNames[i]}</td>
                        <td class="${sig ? 'significant' : ''}">${coef.toFixed(3)}${stars ? '<span style="color:#10b981; font-weight:bold;"> ' + stars + '</span>' : ''}</td>
                        <td>${model.standardErrors[i].toFixed(3)}</td>
                        <td>${tStat.toFixed(2)}</td>
                        <td>${pVal.toFixed(4)}${stars ? '<span style="color:#888; font-size:0.8em;"> ' + stars + '</span>' : ''}</td>
                        <td>[${ci_lower.toFixed(2)}, ${ci_upper.toFixed(2)}]</td>
                    </tr>
                `;
            }
        });
    }

    html += `
                </tbody>
            </table>
            <div class="methodology-note" style="margin-top: 0.5rem; font-size: 0.85rem;">
                <strong>Significance levels:</strong> * p < 0.05, ** p < 0.01, *** p < 0.001
            </div>
        </div>
    `;

    return html;
}

/**
 * Create model comparison table
 * @param {Object} models - Object containing multiple models
 * @returns {String} HTML table
 */
export function createModelComparisonTable(models) {
    if (!models || Object.keys(models).length === 0) {
        return '<p>No models available for comparison</p>';
    }

    let html = `
        <div class="model-box">
            <div class="model-header">Model Comparison</div>
            <table class="coef-table">
                <thead>
                    <tr>
                        <th>Model</th>
                        <th>N</th>
                        <th>R²</th>
                        <th>Adj. R²</th>
                        <th>AIC</th>
                        <th>BIC</th>
                    </tr>
                </thead>
                <tbody>
    `;

    Object.values(models).forEach(model => {
        if (model) {
            html += `
                <tr>
                    <td><strong>${model.modelName}</strong></td>
                    <td>${model.nobs || 'N/A'}</td>
                    <td>${model.r2 !== undefined ? model.r2.toFixed(3) : 'N/A'}</td>
                    <td>${model.adjR2 !== undefined ? model.adjR2.toFixed(3) : 'N/A'}</td>
                    <td>${model.aic !== undefined ? model.aic.toFixed(1) : 'N/A'}</td>
                    <td>${model.bic !== undefined ? model.bic.toFixed(1) : 'N/A'}</td>
                </tr>
            `;
        }
    });

    html += `
                </tbody>
            </table>
            <div class="methodology-note" style="margin-top: 1rem;">
                <strong>Note:</strong> Lower AIC/BIC values indicate better model fit.
                Higher R² indicates more variance explained.
            </div>
        </div>
    `;

    return html;
}

/**
 * Render regression comparison (multiple models)
 * @param {Object} models - Object containing multiple models
 */
export function renderRegressionComparison(models) {
    if (!models || Object.keys(models).length === 0) {
        return;
    }

    const comparisonDiv = document.getElementById('regression-results');
    if (!comparisonDiv) {
        return;
    }

    let html = '<h3>Regression Results</h3>';
    html += '<div class="grid-2" style="gap: 2rem;">';

    Object.values(models).forEach(model => {
        html += createModelTable(model);
    });

    html += '</div>';

    // Add model comparison table
    html += '<h3 style="margin-top: 2rem;">Model Comparison</h3>';
    html += createModelComparisonTable(models);

    comparisonDiv.innerHTML = html;
}

/**
 * Render coefficient comparison plot
 * @param {Object} models - Object containing multiple models
 * @param {String} predictorName - Name of predictor to plot
 */
export function renderCoefficientPlot(models, predictorName) {
    if (!models || Object.keys(models).length === 0) {
        console.warn('No models available for coefficient plot');
        return;
    }

    const modelNames = [];
    const coefficients = [];
    const errorBars = [];

    Object.values(models).forEach(model => {
        if (model && Array.isArray(model.variableNames)) {
            const idx = model.variableNames.findIndex(name => name === predictorName);

            if (idx >= 0 && model.coefficients && model.standardErrors) {
                modelNames.push(model.modelName);
                coefficients.push(model.coefficients[idx]);
                errorBars.push(1.96 * model.standardErrors[idx]); // 95% CI
            }
        }
    });

    if (modelNames.length === 0) {
        console.warn(`No valid coefficients found for ${predictorName}`);
        return;
    }

    const trace = {
        x: modelNames,
        y: coefficients,
        error_y: {
            type: 'data',
            array: errorBars,
            visible: true,
            color: '#94a3b8',
            thickness: 2,
            width: 8
        },
        type: 'scatter',
        mode: 'markers',
        marker: {
            size: 14,
            color: '#3b82f6',
            line: {
                color: '#1e40af',
                width: 2
            }
        },
        hovertemplate: '<b>%{x}</b><br>Coefficient: %{y:.3f}<br>95% CI: %{y:.3f} ± %{error_y.array:.3f}<extra></extra>'
    };

    // Create nice display label
    const displayLabel = predictorName === 'escs'
        ? 'Socioeconomic Status (ESCS)'
        : predictorName === 'parent_edu'
        ? 'Parental Education'
        : predictorName;

    const layout = {
        title: {
            text: `${displayLabel} Coefficient Comparison (95% CI)`,
            font: { color: '#f1f5f9', size: 16 }
        },
        xaxis: {
            title: 'Model Type',
            gridcolor: '#334155'
        },
        yaxis: {
            title: `${displayLabel} Coefficient<br>(Achievement Points per SD)`,
            gridcolor: '#334155',
            zeroline: true,
            zerolinecolor: '#ef4444',
            zerolinewidth: 2
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        showlegend: false,
        hovermode: 'closest',
        margin: { t: 80, b: 80, l: 80, r: 40 }
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    };

    const chartDiv = document.getElementById('coefficient-plot');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, [trace], layout, config);
        console.log('✓ Coefficient plot rendered');
    } else {
        console.warn('coefficient-plot div not found');
    }
}

/**
 * Render regression scatter plots with fitted lines
 * @param {Array} data - Student data
 * @param {String} outcomeVar - Outcome variable
 * @param {String} predictorVar - Predictor variable
 * @param {Object} models - Regression models
 */
export function renderRegressionScatterPlots(data, outcomeVar, predictorVar, models) {
    if (!data || data.length === 0 || !models) {
        console.warn('Cannot render regression scatter plots: missing data or models');
        return;
    }

    // Extract X and Y values using helper for parent_edu support
    const validRecords = [];
    for (const d of data) {
        const x = getPredictorValue(d, predictorVar);
        const y = +d[outcomeVar];
        if (x !== null && isFinite(y)) {
            validRecords.push({ record: d, x, y });
        }
    }

    if (validRecords.length === 0) {
        console.warn('No valid data for regression scatter plot');
        return;
    }

    const x = validRecords.map(d => d.x);
    const y = validRecords.map(d => d.y);

    // Sample data points to prevent graph overload
    const MAX_POINTS = 3000;
    let sampledX = x;
    let sampledY = y;

    if (x.length > MAX_POINTS) {
        // Systematic sampling to maintain distribution
        const step = Math.floor(x.length / MAX_POINTS);
        sampledX = [];
        sampledY = [];
        for (let i = 0; i < x.length; i += step) {
            sampledX.push(x[i]);
            sampledY.push(y[i]);
        }
    }

    // Create scatter plot trace
    const scatterTrace = {
        x: sampledX,
        y: sampledY,
        mode: 'markers',
        type: 'scatter',
        name: `Data (n=${x.length.toLocaleString()}, showing ${sampledX.length.toLocaleString()})`,
        marker: {
            size: 4,
            color: '#3b82f6',
            opacity: 0.3
        }
    };

    const traces = [scatterTrace];

    // Add fitted lines for each model
    const colors = ['#ef4444', '#10b981', '#f59e0b'];
    let colorIdx = 0;

    Object.values(models).forEach(model => {
        if (model && model.coefficients && model.variableNames) {
            // Find intercept and slope
            const interceptIdx = model.variableNames.findIndex(v => v === 'Intercept');
            const slopeIdx = model.variableNames.findIndex(v => v === predictorVar);

            if (interceptIdx >= 0 && slopeIdx >= 0) {
                const intercept = model.coefficients[interceptIdx];
                const slope = model.coefficients[slopeIdx];

                // Use reduce to avoid stack overflow with large arrays
                const xMin = x.reduce((min, val) => Math.min(min, val), Infinity);
                const xMax = x.reduce((max, val) => Math.max(max, val), -Infinity);
                const xRange = [xMin, xMax];
                const yRange = xRange.map(xi => intercept + slope * xi);

                traces.push({
                    x: xRange,
                    y: yRange,
                    mode: 'lines',
                    type: 'scatter',
                    name: model.modelName,
                    line: {
                        color: colors[colorIdx % colors.length],
                        width: 3
                    }
                });

                colorIdx++;
            }
        }
    });

    const layout = {
        title: `${outcomeVar} vs ${predictorVar} with Regression Lines`,
        xaxis: {
            title: predictorVar,
            gridcolor: '#334155'
        },
        yaxis: {
            title: outcomeVar,
            gridcolor: '#334155'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        showlegend: true,
        legend: {
            x: 0.02,
            y: 0.98,
            bgcolor: 'rgba(30, 41, 59, 0.8)',
            bordercolor: '#475569',
            borderwidth: 1
        },
        hovermode: 'closest'
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    };

    const chartDiv = document.getElementById('regression-scatter');
    if (chartDiv) {
        Plotly.newPlot(chartDiv, traces, layout, config);
    }
}

/**
 * Render residual vs fitted plot
 * @param {Object} model - Regression model with residuals
 * @param {String} modelName - Name for display
 * @param {String} targetElementId - ID of target div element (default: 'residual-plot')
 */
export function renderResidualPlot(model, modelName = 'Model', targetElementId = 'residual-plot') {
    if (!model || !model.residuals || !model.yhat) {
        console.warn('Cannot render residual plot: missing residuals or fitted values');
        return;
    }

    const pairs = [];
    for (let i = 0; i < model.yhat.length; i++) {
        const fitted = model.yhat[i];
        const residual = model.residuals[i];
        if (Number.isFinite(fitted) && Number.isFinite(residual)) {
            pairs.push([fitted, residual]);
        }
    }

    if (pairs.length === 0) {
        console.warn('Cannot render residual plot: no finite points');
        return;
    }

    const maxPoints = 4000;
    const step = Math.ceil(pairs.length / maxPoints);
    const fittedValues = [];
    const residuals = [];
    for (let i = 0; i < pairs.length; i += step) {
        fittedValues.push(pairs[i][0]);
        residuals.push(pairs[i][1]);
    }

    const trace = {
        x: fittedValues,
        y: residuals,
        mode: 'markers',
        type: 'scatter',
        name: 'Residuals',
        marker: {
            size: 4,
            color: '#3b82f6',
            opacity: 0.5
        }
    };

    // Add horizontal line at y=0
    let xMin = fittedValues[0];
    let xMax = fittedValues[0];
    for (let i = 1; i < fittedValues.length; i++) {
        const value = fittedValues[i];
        if (value < xMin) xMin = value;
        if (value > xMax) xMax = value;
    }
    const zeroLine = {
        x: [xMin, xMax],
        y: [0, 0],
        mode: 'lines',
        type: 'scatter',
        name: 'Zero',
        line: {
            color: '#ef4444',
            width: 2,
            dash: 'dash'
        }
    };

    const layout = {
        title: `Residual Plot: ${modelName}`,
        xaxis: {
            title: 'Fitted Values',
            gridcolor: '#334155'
        },
        yaxis: {
            title: 'Residuals',
            gridcolor: '#334155',
            zeroline: true,
            zerolinecolor: '#64748b'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        showlegend: false,
        hovermode: 'closest'
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    };

    const chartDiv = document.getElementById(targetElementId);
    if (chartDiv) {
        Plotly.newPlot(chartDiv, [trace, zeroLine], layout, config);
    }
}

/**
 * Render QQ plot for residual normality
 * @param {Object} model - Regression model with residuals
 * @param {String} modelName - Name for display
 * @param {String} targetElementId - ID of target div element (default: 'qq-plot')
 */
export function renderQQPlot(model, modelName = 'Model', targetElementId = 'qq-plot') {
    if (!model || !model.residuals) {
        console.warn('Cannot render QQ plot: missing residuals');
        return;
    }

    const residuals = model.residuals.filter(Number.isFinite);
    if (residuals.length < 3) {
        console.warn('Cannot render QQ plot: insufficient residuals');
        return;
    }

    // Sort residuals
    const sortedResiduals = [...residuals].sort((a, b) => a - b);
    const n = sortedResiduals.length;
    const maxPoints = 1500;
    const step = Math.ceil(n / maxPoints);

    // Calculate theoretical quantiles (assuming standard normal)
    const theoreticalQuantiles = [];
    const sampledResiduals = [];
    for (let i = 0; i < n; i += step) {
        const p = (i + 0.5) / n;
        theoreticalQuantiles.push(approximateInverseNormal(p));
        sampledResiduals.push(sortedResiduals[i]);
    }

    // Standardize residuals
    const mean = residuals.reduce((sum, r) => sum + r, 0) / residuals.length;
    const variance = residuals.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / residuals.length;
    const sd = Math.sqrt(variance);
    if (!Number.isFinite(sd) || sd === 0) {
        console.warn('Cannot render QQ plot: residual standard deviation is zero');
        return;
    }

    const standardizedResiduals = sampledResiduals.map(r => (r - mean) / sd);

    const trace = {
        x: theoreticalQuantiles,
        y: standardizedResiduals,
        mode: 'markers',
        type: 'scatter',
        name: 'Sample Quantiles',
        marker: {
            size: 4,
            color: '#3b82f6',
            opacity: 0.6
        }
    };

    // Add 45-degree reference line
    let minQ = theoreticalQuantiles[0];
    let maxQ = theoreticalQuantiles[0];
    for (let i = 1; i < theoreticalQuantiles.length; i++) {
        const value = theoreticalQuantiles[i];
        if (value < minQ) minQ = value;
        if (value > maxQ) maxQ = value;
    }
    const refLine = {
        x: [minQ, maxQ],
        y: [minQ, maxQ],
        mode: 'lines',
        type: 'scatter',
        name: 'Normal',
        line: {
            color: '#ef4444',
            width: 2,
            dash: 'dash'
        }
    };

    const layout = {
        title: `Q-Q Plot: ${modelName}`,
        xaxis: {
            title: 'Theoretical Quantiles',
            gridcolor: '#334155'
        },
        yaxis: {
            title: 'Sample Quantiles',
            gridcolor: '#334155'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        showlegend: false,
        hovermode: 'closest'
    };

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    };

    const chartDiv = document.getElementById(targetElementId);
    if (chartDiv) {
        Plotly.newPlot(chartDiv, [trace, refLine], layout, config);
    }
}

/**
 * Approximate inverse normal CDF (for QQ plot)
 * @param {Number} p - Probability (0 to 1)
 * @returns {Number} z-score
 */
function approximateInverseNormal(p) {
    // Beasley-Springer-Moro algorithm approximation
    const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
    const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
    const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
               0.0276438810333863, 0.0038405729373609, 0.0003951896511919,
               0.0000321767881768, 0.0000002888167364, 0.0000003960315187];

    if (p <= 0 || p >= 1) {
        return NaN;
    }

    const y = p - 0.5;

    if (Math.abs(y) < 0.42) {
        const r = y * y;
        let num = a[0];
        let den = 1.0;
        for (let i = 1; i < 4; i++) {
            num += a[i] * Math.pow(r, i);
        }
        for (let i = 0; i < 4; i++) {
            den += b[i] * Math.pow(r, i + 1);
        }
        return y * num / den;
    } else {
        const r = p < 0.5 ? p : 1 - p;
        const s = Math.log(-Math.log(r));
        let t = c[0];
        for (let i = 1; i < c.length; i++) {
            t += c[i] * Math.pow(s, i);
        }
        return p < 0.5 ? -t : t;
    }
}

/**
 * Render Hausman test results
 * @param {Object} hausmanTest - Hausman test results
 */
export function renderHausmanTest(hausmanTest) {
    if (!hausmanTest) {
        return;
    }

    const hausmanDiv = document.getElementById('hausman-test');
    if (!hausmanDiv) {
        return;
    }

    const chiSq = !isNaN(hausmanTest.chiSquared) ? hausmanTest.chiSquared.toFixed(2) : 'N/A';
    const pVal = !isNaN(hausmanTest.pValue) ? hausmanTest.pValue.toFixed(4) : 'N/A';

    hausmanDiv.innerHTML = `
        <div class="methodology-note">
            <strong>Hausman Specification Test</strong><br>
            H₀: Difference in coefficients not systematic (Random Effects preferred)<br>
            H₁: Difference is systematic (Fixed Effects preferred)<br><br>
            χ²(${hausmanTest.df}) = ${chiSq}<br>
            p-value = ${pVal}<br><br>
            <strong>Conclusion:</strong> ${hausmanTest.conclusion}
        </div>
    `;
}

export default {
    createModelTable,
    createModelComparisonTable,
    renderRegressionComparison,
    renderCoefficientPlot,
    renderRegressionScatterPlots,
    renderResidualPlot,
    renderQQPlot,
    renderHausmanTest
};
