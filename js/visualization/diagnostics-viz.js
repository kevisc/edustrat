/**
 * Diagnostics Visualization Module
 * Renders model diagnostics tables and a single residual plot
 * Optimized for computational efficiency
 * Author: Kevin Schoenholzer
 * Date: 2026-01-10
 */

import { CHART_COLORS, STATUS, INK, baseLayout, BASE_CONFIG } from './chart-theme.js';

/**
 * Create model comparison summary table
 * @param {Object} models - Object containing OLS, FE, RE models
 * @returns {String} HTML table
 */
export function createDiagnosticsComparisonTable(models) {
    if (!models || Object.keys(models).length === 0) {
        return '<p class="text-secondary">No models available. Run regression analysis first.</p>';
    }

    const ols = models.ols;
    const fe = models.fixedEffects;
    const re = models.randomEffects;

    // Calculate AIC/BIC for each model
    const getAIC = (model) => {
        if (!model?.residuals) return null;
        const n = model.nobs;
        const k = model.variableNames?.length || 2;
        const sse = model.residuals.reduce((sum, r) => sum + r * r, 0);
        const sigma2 = sse / n;
        const logLik = -0.5 * n * (Math.log(2 * Math.PI) + Math.log(sigma2) + 1);
        return -2 * logLik + 2 * k;
    };

    const getBIC = (model) => {
        if (!model?.residuals) return null;
        const n = model.nobs;
        const k = model.variableNames?.length || 2;
        const sse = model.residuals.reduce((sum, r) => sum + r * r, 0);
        const sigma2 = sse / n;
        const logLik = -0.5 * n * (Math.log(2 * Math.PI) + Math.log(sigma2) + 1);
        return -2 * logLik + k * Math.log(n);
    };

    const formatValue = (val, decimals = 4) => {
        if (val === undefined || val === null || isNaN(val)) return '—';
        return val.toFixed(decimals);
    };

    const highlightBest = (model, metric, lower = true) => {
        const vals = [ols?.[metric], fe?.[metric], re?.[metric]].filter(v => v !== undefined && !isNaN(v));
        if (vals.length === 0) return '';
        const best = lower ? Math.min(...vals) : Math.max(...vals);
        return model?.[metric] === best ? `style="color: ${STATUS.good}; font-weight: 600;"` : '';
    };

    // Columns are built from the models actually present, with each model's own
    // display name — so a per-country view with only OLS (+ year effects) shows
    // two meaningful columns rather than a column of dashes.
    const defaultNames = { ols: 'OLS (Pooled)', fixedEffects: 'Fixed Effects', randomEffects: 'Random Effects' };
    const cols = ['ols', 'fixedEffects', 'randomEffects']
        .filter(key => models[key])
        .map(key => ({ key, model: models[key], name: models[key].modelName || defaultNames[key] }));

    const aicByKey = Object.fromEntries(cols.map(c => [c.key, getAIC(c.model)]));
    const validAICList = cols.filter(c => aicByKey[c.key] !== null);
    const bestAICKey = validAICList.length > 1
        ? validAICList.reduce((a, b) => (aicByKey[a.key] < aicByKey[b.key] ? a : b)).key
        : null;

    const row = (label, cellFn) =>
        `<tr><td><strong>${label}</strong></td>${cols.map(c => `<td ${cellFn(c).style || ''}>${cellFn(c).text}</td>`).join('')}</tr>`;
    const plain = fn => c => ({ text: fn(c.model) });

    const html = `
        <div class="model-box">
            <div class="model-header">Model Fit Comparison</div>
            <table class="coef-table">
                <thead>
                    <tr><th>Statistic</th>${cols.map(c => `<th>${c.name}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${row('Sample Size (N)', plain(m => m?.nobs?.toLocaleString() || '—'))}
                    ${row('Number of Groups', plain(m => m?.ngroups || '—'))}
                    ${row('R² (Overall)', c => ({ text: formatValue(c.model?.r2), style: highlightBest(c.model, 'r2', false) }))}
                    ${row('R² (Within)', plain(m => formatValue(m?.r2Within)))}
                    ${row('R² (Between)', plain(m => formatValue(m?.r2Between)))}
                    ${row('Adjusted R²', plain(m => formatValue(m?.adjR2)))}
                    ${row('AIC', c => ({ text: formatValue(aicByKey[c.key], 1), style: c.key === bestAICKey ? `style="color: ${STATUS.good}; font-weight: 600;"` : '' }))}
                    ${row('BIC', plain(m => formatValue(getBIC(m), 1)))}
                    ${row('ICC (ρ)', plain(m => formatValue(m?.rho)))}
                </tbody>
            </table>
            <div class="methodology-note" style="margin-top: 1rem; font-size: 0.9rem;">
                Green = best value for that metric. Lower AIC/BIC = better fit. Higher R² = more variance explained.
            </div>
        </div>
    `;

    return html;
}

/**
 * Create Hausman test panel
 * @param {Object} hausmanResult - Hausman test results
 * @returns {String} HTML panel
 */
export function createHausmanTestPanel(hausmanResult) {
    if (!hausmanResult) {
        return `
            <div class="model-box">
                <div class="model-header">Hausman Specification Test</div>
                <p class="text-secondary">Hausman test requires both Fixed Effects and Random Effects models to be estimated.</p>
            </div>
        `;
    }

    const isSignificant = hausmanResult.pValue < 0.05;
    const statusColor = isSignificant ? STATUS.serious : STATUS.good;
    const recommendation = isSignificant ? 'Fixed Effects' : 'Random Effects';

    return `
        <div class="model-box">
            <div class="model-header">Hausman Specification Test</div>
            <table class="coef-table">
                <tbody>
                    <tr>
                        <td><strong>Chi-squared (df=1)</strong></td>
                        <td>${hausmanResult.chiSquared.toFixed(3)}</td>
                    </tr>
                    <tr>
                        <td><strong>P-value</strong></td>
                        <td style="color: ${statusColor}; font-weight: 600;">${hausmanResult.pValue.toFixed(4)}</td>
                    </tr>
                    <tr>
                        <td><strong>FE Coefficient (ESCS)</strong></td>
                        <td>${hausmanResult.bFE?.toFixed(4) || '—'}</td>
                    </tr>
                    <tr>
                        <td><strong>RE Coefficient (ESCS)</strong></td>
                        <td>${hausmanResult.bRE?.toFixed(4) || '—'}</td>
                    </tr>
                    <tr>
                        <td><strong>Coefficient Difference</strong></td>
                        <td>${hausmanResult.difference?.toFixed(4) || '—'}</td>
                    </tr>
                    <tr>
                        <td><strong>Recommendation</strong></td>
                        <td style="color: ${statusColor}; font-weight: 600;">${recommendation}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Create residual diagnostics table for all models
 * @param {Object} models - Object containing models with residuals
 * @returns {String} HTML table
 */
export function createResidualDiagnosticsTable(models) {
    if (!models || Object.keys(models).length === 0) {
        return '<p class="text-secondary">No models available.</p>';
    }

    const modelList = [
        { key: 'ols', name: models.ols?.modelName || 'OLS (Pooled)' },
        { key: 'fixedEffects', name: models.fixedEffects?.modelName || 'Fixed Effects' },
        { key: 'randomEffects', name: models.randomEffects?.modelName || 'Random Effects' }
    ];

    const getStats = (model) => {
        if (!model?.residuals) return null;

        const residuals = model.residuals.filter(Number.isFinite);
        if (residuals.length === 0) return null;

        const n = residuals.length;
        const mean = residuals.reduce((a, b) => a + b, 0) / n;
        const variance = residuals.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / n;
        const sd = Math.sqrt(variance);

        // Skewness and Kurtosis
        const skewness = residuals.reduce((sum, r) => sum + Math.pow((r - mean) / sd, 3), 0) / n;
        const kurtosis = residuals.reduce((sum, r) => sum + Math.pow((r - mean) / sd, 4), 0) / n - 3;

        // Outliers (|residual| > 3 SD)
        const outliers = residuals.filter(r => Math.abs(r - mean) > 3 * sd).length;

        // Jarque-Bera test statistic (normality test)
        const jb = (n / 6) * (Math.pow(skewness, 2) + Math.pow(kurtosis, 2) / 4);
        // JB follows chi-squared with df=2 under null of normality
        // p-value approximation
        const jbPValue = 1 - jStat.chisquare.cdf(jb, 2);

        // Heteroscedasticity check (variance ratio upper/lower half)
        let heteroRatio = null;
        const fittedVals = model.fitted || model.yhat;   // model objects expose `fitted`
        if (fittedVals) {
            const pairs = fittedVals.map((y, i) => ({ yhat: y, resid: model.residuals[i] }))
                .filter(p => Number.isFinite(p.yhat) && Number.isFinite(p.resid))
                .sort((a, b) => a.yhat - b.yhat);

            if (pairs.length > 10) {
                const mid = Math.floor(pairs.length / 2);
                const lowerHalf = pairs.slice(0, mid).map(p => p.resid);
                const upperHalf = pairs.slice(mid).map(p => p.resid);
                const sdLower = Math.sqrt(lowerHalf.reduce((s, r) => s + r * r, 0) / lowerHalf.length);
                const sdUpper = Math.sqrt(upperHalf.reduce((s, r) => s + r * r, 0) / upperHalf.length);
                heteroRatio = Math.max(sdLower, sdUpper) / Math.min(sdLower, sdUpper);
            }
        }

        return {
            n,
            mean,
            sd,
            min: Math.min(...residuals),
            max: Math.max(...residuals),
            skewness,
            kurtosis,
            outliers,
            outlierPct: (outliers / n * 100),
            jb,
            jbPValue,
            heteroRatio
        };
    };

    let html = `
        <div class="model-box">
            <div class="model-header">Residual Diagnostics</div>
            <table class="coef-table">
                <thead>
                    <tr>
                        <th>Diagnostic</th>
    `;

    const stats = {};
    modelList.forEach(({ key, name }) => {
        const s = getStats(models[key]);
        if (s) {
            stats[key] = s;
            html += `<th>${name}</th>`;
        }
    });

    html += `</tr></thead><tbody>`;

    if (Object.keys(stats).length === 0) {
        return '<p class="text-secondary">No residual data available.</p>';
    }

    // Residual Mean — judged relative to the residual SD (the weighted mean is
    // zero by construction under survey-weighted estimation).
    html += `<tr><td><strong>Residual Mean</strong></td>`;
    modelList.forEach(({ key }) => {
        if (stats[key]) {
            const val = stats[key].mean;
            const ok = Math.abs(val) / Math.max(stats[key].sd, 1e-9) < 0.1;
            html += `<td style="color: ${ok ? STATUS.good : STATUS.warning};">${val.toFixed(2)}</td>`;
        }
    });
    html += `</tr>`;

    // Residual SD
    html += `<tr><td><strong>Residual Std. Dev.</strong></td>`;
    modelList.forEach(({ key }) => {
        if (stats[key]) html += `<td>${stats[key].sd.toFixed(2)}</td>`;
    });
    html += `</tr>`;

    // Skewness (should be ≈ 0)
    html += `<tr><td><strong>Skewness</strong></td>`;
    modelList.forEach(({ key }) => {
        if (stats[key]) {
            const val = stats[key].skewness;
            const ok = Math.abs(val) < 1;
            html += `<td style="color: ${ok ? STATUS.good : Math.abs(val) < 2 ? STATUS.warning : STATUS.serious};">${val.toFixed(3)}</td>`;
        }
    });
    html += `</tr>`;

    // Kurtosis (should be ≈ 0 for normal)
    html += `<tr><td><strong>Excess Kurtosis</strong></td>`;
    modelList.forEach(({ key }) => {
        if (stats[key]) {
            const val = stats[key].kurtosis;
            const ok = Math.abs(val) < 2;
            html += `<td style="color: ${ok ? STATUS.good : Math.abs(val) < 7 ? STATUS.warning : STATUS.serious};">${val.toFixed(3)}</td>`;
        }
    });
    html += `</tr>`;

    // Jarque-Bera Test
    html += `<tr><td><strong>Jarque-Bera Statistic</strong></td>`;
    modelList.forEach(({ key }) => {
        if (stats[key]) html += `<td>${stats[key].jb.toFixed(2)}</td>`;
    });
    html += `</tr>`;

    html += `<tr><td><strong>JB p-value (Normality)</strong></td>`;
    modelList.forEach(({ key }) => {
        if (stats[key]) {
            const p = stats[key].jbPValue;
            const ok = p >= 0.05;
            html += `<td style="color: ${ok ? STATUS.good : STATUS.serious};">${p < 0.001 ? '< 0.001' : p.toFixed(4)}</td>`;
        }
    });
    html += `</tr>`;

    // Heteroscedasticity (variance ratio)
    html += `<tr><td><strong>Variance Ratio (Hetero. Check)</strong></td>`;
    modelList.forEach(({ key }) => {
        if (stats[key]) {
            const val = stats[key].heteroRatio;
            if (val) {
                const ok = val < 1.5;
                html += `<td style="color: ${ok ? STATUS.good : val < 2 ? STATUS.warning : STATUS.serious};">${val.toFixed(2)}</td>`;
            } else {
                html += `<td>—</td>`;
            }
        }
    });
    html += `</tr>`;

    // Outliers
    html += `<tr><td><strong>Outliers (> 3σ)</strong></td>`;
    modelList.forEach(({ key }) => {
        if (stats[key]) {
            const pct = stats[key].outlierPct;
            const ok = pct < 1;
            html += `<td style="color: ${ok ? STATUS.good : pct < 3 ? STATUS.warning : STATUS.serious};">${stats[key].outliers} (${pct.toFixed(2)}%)</td>`;
        }
    });
    html += `</tr>`;

    html += `</tbody></table></div>`;

    return html;
}

/**
 * Create Cook's Distance summary table
 * @param {Object} models - Models object
 * @returns {String} HTML table
 */
export function createCooksDistanceSummary(models) {
    if (!models || Object.keys(models).length === 0) {
        return '';
    }

    const modelList = [
        { key: 'ols', name: models.ols?.modelName || 'OLS (Pooled)' },
        { key: 'fixedEffects', name: models.fixedEffects?.modelName || 'Fixed Effects' },
        { key: 'randomEffects', name: models.randomEffects?.modelName || 'Random Effects' }
    ];

    const getCooksStats = (model) => {
        if (!model?.residuals) return null;

        const residuals = model.residuals.filter(Number.isFinite);
        const n = residuals.length;
        const k = model.variableNames?.length || 2;
        const mse = residuals.reduce((sum, r) => sum + r * r, 0) / (n - k);
        const avgLeverage = k / n;

        // Calculate Cook's Distance (simplified)
        const cooksD = residuals.map(r => {
            const h = avgLeverage;
            return (r * r / (k * mse)) * (h / Math.pow(1 - h, 2));
        });

        const threshold = 4 / n;
        const influential = cooksD.filter(d => d > threshold).length;
        const maxCooks = Math.max(...cooksD);
        const meanCooks = cooksD.reduce((a, b) => a + b, 0) / n;

        return {
            n,
            threshold,
            influential,
            influentialPct: (influential / n * 100),
            maxCooks,
            meanCooks
        };
    };

    let html = `
        <div class="model-box">
            <div class="model-header">Influential Observations (Cook's Distance)</div>
            <table class="coef-table">
                <thead>
                    <tr>
                        <th>Metric</th>
    `;

    const stats = {};
    modelList.forEach(({ key, name }) => {
        const s = getCooksStats(models[key]);
        if (s) {
            stats[key] = s;
            html += `<th>${name}</th>`;
        }
    });

    if (Object.keys(stats).length === 0) {
        return '';
    }

    html += `</tr></thead><tbody>`;

    html += `<tr><td><strong>Threshold (4/n)</strong></td>`;
    modelList.forEach(({ key }) => {
        if (stats[key]) html += `<td>${stats[key].threshold.toFixed(6)}</td>`;
    });
    html += `</tr>`;

    html += `<tr><td><strong>Influential Points</strong></td>`;
    modelList.forEach(({ key }) => {
        if (stats[key]) {
            const pct = stats[key].influentialPct;
            const ok = pct < 5;
            html += `<td style="color: ${ok ? STATUS.good : pct < 10 ? STATUS.warning : STATUS.serious};">${stats[key].influential} (${pct.toFixed(1)}%)</td>`;
        }
    });
    html += `</tr>`;

    html += `<tr><td><strong>Max Cook's D</strong></td>`;
    modelList.forEach(({ key }) => {
        if (stats[key]) {
            const val = stats[key].maxCooks;
            const ok = val < 1;
            html += `<td style="color: ${ok ? STATUS.good : STATUS.serious};">${val.toFixed(4)}</td>`;
        }
    });
    html += `</tr>`;

    html += `<tr><td><strong>Mean Cook's D</strong></td>`;
    modelList.forEach(({ key }) => {
        if (stats[key]) html += `<td>${stats[key].meanCooks.toFixed(6)}</td>`;
    });
    html += `</tr>`;

    html += `</tbody></table></div>`;

    return html;
}

/**
 * Create assumption check summary
 * @param {Object} models - Models object
 * @param {Object} hausmanResult - Hausman test result
 * @returns {String} HTML
 */
export function createAssumptionCheckSummary(models, hausmanResult) {
    const checks = [];
    const ols = models?.ols;

    // 1. Linearity. Judged relative to the residual spread: with survey weights the
    // WEIGHTED residual mean is exactly zero by construction, so the unweighted
    // mean can sit away from zero on the score scale without signalling anything.
    if (ols?.residuals) {
        const residuals = ols.residuals.filter(Number.isFinite);
        const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
        const sd = Math.sqrt(residuals.reduce((s, r) => s + (r - mean) ** 2, 0) / residuals.length);
        const rel = Math.abs(mean) / Math.max(sd, 1e-9);
        const status = rel < 0.1 ? 'pass' : rel < 0.25 ? 'warning' : 'fail';
        checks.push({
            name: 'Linearity',
            status,
            value: `Mean residual: ${mean.toFixed(2)} (${rel.toFixed(2)} SD)`,
            expected: 'Small relative to residual SD'
        });
    }

    // 2. Normality
    if (ols?.residuals) {
        const residuals = ols.residuals.filter(Number.isFinite);
        const n = residuals.length;
        const mean = residuals.reduce((a, b) => a + b, 0) / n;
        const sd = Math.sqrt(residuals.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / n);
        const skewness = residuals.reduce((sum, r) => sum + Math.pow((r - mean) / sd, 3), 0) / n;
        const kurtosis = residuals.reduce((sum, r) => sum + Math.pow((r - mean) / sd, 4), 0) / n - 3;

        const status = (Math.abs(skewness) < 1 && Math.abs(kurtosis) < 2) ? 'pass'
            : (Math.abs(skewness) < 2 && Math.abs(kurtosis) < 7) ? 'warning' : 'fail';
        checks.push({
            name: 'Normality',
            status,
            value: `Skew: ${skewness.toFixed(2)}, Kurt: ${kurtosis.toFixed(2)}`,
            expected: 'Skew ≈ 0, Kurtosis ≈ 0'
        });
    }

    // 3. Homoscedasticity
    const olsFitted = ols?.fitted || ols?.yhat;   // model objects expose `fitted`
    if (ols?.residuals && olsFitted) {
        const pairs = olsFitted.map((y, i) => ({ yhat: y, resid: ols.residuals[i] }))
            .filter(p => Number.isFinite(p.yhat) && Number.isFinite(p.resid))
            .sort((a, b) => a.yhat - b.yhat);

        if (pairs.length > 10) {
            const mid = Math.floor(pairs.length / 2);
            const lowerHalf = pairs.slice(0, mid).map(p => p.resid);
            const upperHalf = pairs.slice(mid).map(p => p.resid);
            const sdLower = Math.sqrt(lowerHalf.reduce((s, r) => s + r * r, 0) / lowerHalf.length);
            const sdUpper = Math.sqrt(upperHalf.reduce((s, r) => s + r * r, 0) / upperHalf.length);
            const ratio = Math.max(sdLower, sdUpper) / Math.min(sdLower, sdUpper);

            const status = ratio < 1.5 ? 'pass' : ratio < 2 ? 'warning' : 'fail';
            checks.push({
                name: 'Homoscedasticity',
                status,
                value: `Variance ratio: ${ratio.toFixed(2)}`,
                expected: 'Ratio < 1.5'
            });
        }
    }

    // 4. Model Specification
    if (hausmanResult) {
        const status = hausmanResult.pValue >= 0.05 ? 'pass' : 'warning';
        checks.push({
            name: 'Model Specification',
            status,
            value: `Hausman p: ${hausmanResult.pValue.toFixed(4)}`,
            expected: hausmanResult.pValue < 0.05 ? 'Use Fixed Effects' : 'Random Effects OK'
        });
    }

    // 5. Sample Size
    if (ols?.nobs) {
        const k = ols.variableNames?.length || 2;
        const ratio = ols.nobs / k;
        const status = ratio > 50 ? 'pass' : ratio > 20 ? 'warning' : 'fail';
        checks.push({
            name: 'Sample Size',
            status,
            value: `N/k = ${ratio.toFixed(0)}`,
            expected: 'N/k > 50 preferred'
        });
    }

    // Card grid with status badges (symbol + label, never color alone).
    const badge = {
        pass: '<span class="assn-badge assn-pass">✓ Pass</span>',
        warning: '<span class="assn-badge assn-warning">! Caution</span>',
        fail: '<span class="assn-badge assn-fail">✕ Concern</span>'
    };

    const nPass = checks.filter(c => c.status === 'pass').length;
    const nWarn = checks.filter(c => c.status === 'warning').length;
    const nFail = checks.filter(c => c.status === 'fail').length;
    const verdict = nFail > 0
        ? `${nFail} assumption${nFail > 1 ? 's' : ''} of concern — read the details below before trusting the estimates.`
        : nWarn > 0
            ? `${nPass} of ${checks.length} assumptions pass; ${nWarn} warrant${nWarn === 1 ? 's' : ''} a closer look.`
            : `All ${checks.length} assumptions pass.`;

    const cards = checks.map(check => `
        <div class="assn-card">
            <div class="assn-card-head">
                <span class="assn-name">${check.name}</span>
                ${badge[check.status]}
            </div>
            <div class="assn-value">${check.value}</div>
            <div class="assn-expected">${check.expected}</div>
        </div>
    `).join('');

    return `
        <p class="assn-verdict">${verdict}</p>
        <div class="assn-grid">${cards}</div>
    `;
}

/**
 * Render a single residual vs fitted plot (optimized, max 3000 points)
 * @param {Object} model - Model with residuals and fitted values
 * @param {String} modelName - Display name
 * @param {String} targetElementId - Target div ID
 */
export function renderResidualPlotOptimized(model, modelName, targetElementId) {
    const fittedVals = model?.fitted || model?.yhat;   // model objects expose `fitted`
    if (!model || !model.residuals || !fittedVals) {
        const div = document.getElementById(targetElementId);
        if (div) div.innerHTML = '<p class="text-secondary">No residual data available for this model.</p>';
        return;
    }

    const pairs = [];
    for (let i = 0; i < fittedVals.length; i++) {
        const fitted = fittedVals[i];
        const residual = model.residuals[i];
        if (Number.isFinite(fitted) && Number.isFinite(residual)) {
            pairs.push([fitted, residual]);
        }
    }

    if (pairs.length === 0) {
        const div = document.getElementById(targetElementId);
        if (div) div.innerHTML = '<p class="text-secondary">No valid residual data.</p>';
        return;
    }

    // Sample down to max 3000 points
    const maxPoints = 3000;
    let sampledPairs = pairs;
    if (pairs.length > maxPoints) {
        const step = Math.ceil(pairs.length / maxPoints);
        sampledPairs = [];
        for (let i = 0; i < pairs.length; i += step) {
            sampledPairs.push(pairs[i]);
        }
    }

    const fittedValues = sampledPairs.map(p => p[0]);
    const residuals = sampledPairs.map(p => p[1]);

    const trace = {
        x: fittedValues,
        y: residuals,
        mode: 'markers',
        type: 'scatter',
        name: 'Residuals',
        marker: {
            size: 3,
            color: CHART_COLORS[0],
            opacity: 0.4
        },
        hovertemplate: 'Fitted: %{x:.1f}<br>Residual: %{y:.1f}<extra></extra>'
    };

    // Zero line
    const xMin = Math.min(...fittedValues);
    const xMax = Math.max(...fittedValues);
    const zeroLine = {
        x: [xMin, xMax],
        y: [0, 0],
        mode: 'lines',
        type: 'scatter',
        name: 'Zero',
        line: { color: INK.reference, width: 2, dash: 'dash' }
    };

    const layout = baseLayout({
        title: {
            text: `Residual vs Fitted: ${modelName} (n=${pairs.length.toLocaleString()}, showing ${sampledPairs.length.toLocaleString()})`,
            font: { size: 14 }
        },
        xaxis: { title: { text: 'Fitted Values' } },
        yaxis: { title: { text: 'Residuals' } },
        showlegend: false,
        hovermode: 'closest',
        margin: { t: 50, b: 50, l: 60, r: 30 }
    });

    const config = BASE_CONFIG;

    const chartDiv = document.getElementById(targetElementId);
    if (chartDiv) {
        Plotly.newPlot(chartDiv, [trace, zeroLine], layout, config);
    }
}

export default {
    createDiagnosticsComparisonTable,
    createHausmanTestPanel,
    createResidualDiagnosticsTable,
    createCooksDistanceSummary,
    createAssumptionCheckSummary,
    renderResidualPlotOptimized
};
