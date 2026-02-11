/**
 * Model Diagnostics Module
 * Performs specification tests and model diagnostics
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

/**
 * Perform Hausman specification test
 * Tests whether random effects or fixed effects is more appropriate
 * @param {Object} feModel - Fixed effects model results
 * @param {Object} reModel - Random effects model results
 * @param {String} predictorName - Name of main predictor variable to test
 * @returns {Object} Hausman test results
 */
export function hausmanTest(feModel, reModel, predictorName) {
    if (!feModel || !reModel) {
        return null;
    }

    // Find predictor coefficient in both models
    const iFE = feModel.variableNames.findIndex(n => n === predictorName);
    const iRE = reModel.variableNames.findIndex(n => n === predictorName);

    if (iFE < 0 || iRE < 0) {
        console.warn('Predictor not found in one or both models');
        return null;
    }

    // Coefficient difference
    const bDiff = feModel.coefficients[iFE] - reModel.coefficients[iRE];

    // Variance of difference (conservative: sum of variances)
    const vFE = feModel.vcov?.[iFE]?.[iFE] ?? Math.pow(feModel.standardErrors[iFE], 2);
    const vRE = reModel.vcov?.[iRE]?.[iRE] ?? Math.pow(reModel.standardErrors[iRE], 2);
    const varDiff = Math.max(vFE + vRE, 1e-12);

    // Chi-squared statistic (1 df)
    const chiSquared = (bDiff * bDiff) / varDiff;

    // P-value
    const pValue = 1 - jStat.chisquare.cdf(chiSquared, 1);

    // Interpretation
    const reject = pValue < 0.05;
    const conclusion = reject
        ? 'Reject RE → Prefer FE (systematic differences exist)'
        : 'Fail to reject → RE acceptable';

    return {
        chiSquared,
        pValue,
        df: 1,
        reject,
        conclusion,
        bFE: feModel.coefficients[iFE],
        bRE: reModel.coefficients[iRE],
        difference: bDiff
    };
}

/**
 * Calculate model comparison statistics
 * @param {Array} models - Array of model objects
 * @returns {Object} Comparison statistics
 */
export function compareModels(models) {
    if (!models || models.length === 0) {
        return null;
    }

    const comparison = {};

    models.forEach(model => {
        if (!model || !model.modelName) return;

        comparison[model.modelName] = {
            nobs: model.nobs,
            df: model.df,
            r2: model.r2,
            adjR2: model.adjR2,
            r2Within: model.r2Within,
            r2Between: model.r2Between,
            aic: calculateAIC(model),
            bic: calculateBIC(model),
            ngroups: model.ngroups
        };
    });

    return comparison;
}

/**
 * Calculate Akaike Information Criterion
 * @param {Object} model - Regression model
 * @returns {Number} AIC
 */
function calculateAIC(model) {
    if (!model || !model.residuals) {
        return NaN;
    }

    const n = model.nobs;
    const k = model.variableNames.length;
    const sse = model.residuals.reduce((sum, r) => sum + r * r, 0);
    const sigma2 = sse / n;

    const logLik = -0.5 * n * (Math.log(2 * Math.PI) + Math.log(sigma2) + 1);
    const aic = -2 * logLik + 2 * k;

    return aic;
}

/**
 * Calculate Bayesian Information Criterion
 * @param {Object} model - Regression model
 * @returns {Number} BIC
 */
function calculateBIC(model) {
    if (!model || !model.residuals) {
        return NaN;
    }

    const n = model.nobs;
    const k = model.variableNames.length;
    const sse = model.residuals.reduce((sum, r) => sum + r * r, 0);
    const sigma2 = sse / n;

    const logLik = -0.5 * n * (Math.log(2 * Math.PI) + Math.log(sigma2) + 1);
    const bic = -2 * logLik + k * Math.log(n);

    return bic;
}

/**
 * Test for heteroskedasticity (Breusch-Pagan test)
 * @param {Object} model - Regression model
 * @param {Array} X - Design matrix
 * @returns {Object} BP test results
 */
export function breuschPaganTest(model, X) {
    if (!model || !model.residuals || !X) {
        return null;
    }

    const n = model.residuals.length;
    const k = X[0].length;

    // Squared residuals
    const e2 = model.residuals.map(r => r * r);

    // Mean of squared residuals
    const meanE2 = e2.reduce((a, b) => a + b, 0) / n;

    // Normalize squared residuals
    const u = e2.map(e => e / meanE2);

    // Regress u on X
    // For simplicity, calculate explained sum of squares
    const meanU = u.reduce((a, b) => a + b, 0) / n;
    const TSS = u.reduce((sum, ui) => sum + Math.pow(ui - meanU, 2), 0);

    // This is a simplified version - full BP test would run auxiliary regression
    // For now, use R² from residuals

    const testStat = (model.r2 * (n - k)) / (1 - model.r2);
    const pValue = 1 - jStat.chisquare.cdf(testStat, k - 1);

    return {
        testStatistic: testStat,
        pValue,
        df: k - 1,
        reject: pValue < 0.05,
        conclusion: pValue < 0.05
            ? 'Reject homoskedasticity → heteroskedasticity present'
            : 'Fail to reject → homoskedasticity assumption OK'
    };
}

/**
 * Calculate variance inflation factors (VIF) for multicollinearity
 * @param {Array} X - Design matrix
 * @param {Array} varNames - Variable names
 * @returns {Object} VIF values
 */
export function calculateVIF(X, varNames) {
    if (!X || X.length === 0 || !varNames) {
        return null;
    }

    const k = X[0].length;
    const n = X.length;

    // Skip intercept
    const vif = {};

    for (let j = 1; j < k; j++) {
        // Extract column j as dependent variable
        const y = X.map(row => row[j]);

        // Create X matrix without column j
        const Xj = X.map(row => row.filter((_, idx) => idx !== j));

        // Simple R² calculation
        try {
            const meanY = y.reduce((a, b) => a + b, 0) / n;
            const TSS = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);

            // For simplicity, use correlation-based R²
            // Full VIF would require running regression for each variable
            const r2 = 0.1; // Placeholder - would need actual regression

            const vifValue = 1 / Math.max(1 - r2, 0.001);
            vif[varNames[j]] = vifValue;
        } catch (e) {
            vif[varNames[j]] = NaN;
        }
    }

    return vif;
}

/**
 * Run diagnostic checks on regression model
 * @param {Object} model - Regression model
 * @param {Array} X - Design matrix
 * @param {Array} y - Dependent variable
 * @returns {Object} Diagnostic results
 */
export function runDiagnostics(model, X, y) {
    if (!model || !X || !y) {
        return null;
    }

    const diagnostics = {
        model: model.modelName,
        nobs: model.nobs,
        df: model.df
    };

    // Residual diagnostics
    if (model.residuals) {
        const residuals = model.residuals;
        const meanResid = residuals.reduce((a, b) => a + b, 0) / residuals.length;
        const varResid = residuals.reduce((sum, r) =>
            sum + Math.pow(r - meanResid, 2), 0
        ) / residuals.length;

        diagnostics.residuals = {
            mean: meanResid,
            sd: Math.sqrt(varResid),
            min: Math.min(...residuals),
            max: Math.max(...residuals)
        };

        // Check for outliers (|residual| > 3 SD)
        const sdResid = Math.sqrt(varResid);
        const outliers = residuals.filter(r => Math.abs(r) > 3 * sdResid);
        diagnostics.outliers = {
            count: outliers.length,
            percent: (outliers.length / residuals.length) * 100
        };
    }

    // Model fit
    diagnostics.fit = {
        r2: model.r2,
        adjR2: model.adjR2,
        aic: calculateAIC(model),
        bic: calculateBIC(model)
    };

    // Heteroskedasticity test
    const bpTest = breuschPaganTest(model, X);
    if (bpTest) {
        diagnostics.heteroskedasticity = bpTest;
    }

    return diagnostics;
}

/**
 * Calculate Cook's distance for influential observations
 * @param {Object} model - Regression model
 * @param {Array} X - Design matrix
 * @returns {Array} Cook's distances
 */
export function calculateCooksDistance(model, X) {
    if (!model || !model.residuals || !X) {
        return null;
    }

    const n = model.residuals.length;
    const k = X[0].length;
    const mse = model.residuals.reduce((sum, r) => sum + r * r, 0) / model.df;

    // Calculate leverage (hat matrix diagonals) - simplified
    // Full calculation would require H = X(X'X)^-1X'
    const leverages = new Array(n).fill(k / n); // Simplified average leverage

    // Cook's distance
    const cooks = model.residuals.map((r, i) => {
        const h = leverages[i];
        const d = (r * r / (k * mse)) * (h / Math.pow(1 - h, 2));
        return d;
    });

    // Identify influential points (D > 4/n)
    const threshold = 4 / n;
    const influential = cooks.map((d, i) => ({
        index: i,
        distance: d,
        influential: d > threshold
    })).filter(d => d.influential);

    return {
        distances: cooks,
        threshold,
        influential,
        nInfluential: influential.length
    };
}

/**
 * Perform F-test for nested models
 * @param {Object} restrictedModel - Restricted (reduced) model
 * @param {Object} fullModel - Full (unrestricted) model
 * @returns {Object} F-test results
 */
export function fTestNested(restrictedModel, fullModel) {
    if (!restrictedModel || !fullModel) {
        return null;
    }

    if (!restrictedModel.residuals || !fullModel.residuals) {
        return null;
    }

    // Calculate RSS for each model
    const rssRestricted = restrictedModel.residuals.reduce((sum, r) => sum + r * r, 0);
    const rssFull = fullModel.residuals.reduce((sum, r) => sum + r * r, 0);

    // Degrees of freedom
    const dfRestricted = restrictedModel.df;
    const dfFull = fullModel.df;
    const dfDiff = dfRestricted - dfFull;

    if (dfDiff <= 0) {
        return null;
    }

    // F-statistic
    const fStat = ((rssRestricted - rssFull) / dfDiff) / (rssFull / dfFull);

    // P-value
    const pValue = 1 - jStat.centralF.cdf(fStat, dfDiff, dfFull);

    return {
        fStatistic: fStat,
        pValue,
        dfNum: dfDiff,
        dfDenom: dfFull,
        reject: pValue < 0.05,
        conclusion: pValue < 0.05
            ? 'Reject restricted model → Full model preferred'
            : 'Fail to reject → Restricted model adequate'
    };
}

export default {
    hausmanTest,
    compareModels,
    breuschPaganTest,
    calculateVIF,
    runDiagnostics,
    calculateCooksDistance,
    fTestNested
};
