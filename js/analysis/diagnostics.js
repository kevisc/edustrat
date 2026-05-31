/**
 * Model Diagnostics Module
 * Performs specification tests and model diagnostics
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

/**
 * Unweighted OLS fit via normal equations (helper for auxiliary regressions).
 * X must already include an intercept column. Returns coefficients, fitted
 * values, residuals, the centered R², and (X'X)^-1 for leverage calculations.
 * @param {Array} y - Response vector
 * @param {Array} X - Design matrix (rows x cols), intercept included
 * @returns {Object} { beta, fitted, residuals, r2, XtX_inv }
 */
function olsFit(y, X) {
    const n = y.length;
    const k = X[0].length;
    const Xt = jStat.transpose(X);
    const XtX = jStat.multiply(Xt, X);
    const XtX_inv = jStat.inv(XtX);
    const Xty = jStat.multiply(Xt, y.map(v => [v]));
    const beta = jStat.multiply(XtX_inv, Xty).map(r => r[0]);

    const fitted = X.map(row => row.reduce((s, v, j) => s + v * beta[j], 0));
    const residuals = y.map((yi, i) => yi - fitted[i]);

    const ybar = y.reduce((s, v) => s + v, 0) / n;
    const sse = residuals.reduce((s, e) => s + e * e, 0);
    const sst = y.reduce((s, yi) => s + Math.pow(yi - ybar, 2), 0);
    const r2 = sst > 0 ? 1 - sse / sst : NaN;

    return { beta, fitted, residuals, r2, XtX_inv, n, k };
}

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

    // Variance of the difference. Under H0, RE is efficient, so
    // Var(b_FE - b_RE) = Var(b_FE) - Var(b_RE)  (Hausman 1978). Using the
    // *difference*, not the sum: the sum is not the Hausman statistic.
    const vFE = feModel.vcov?.[iFE]?.[iFE] ?? Math.pow(feModel.standardErrors[iFE], 2);
    const vRE = reModel.vcov?.[iRE]?.[iRE] ?? Math.pow(reModel.standardErrors[iRE], 2);
    const varDiff = vFE - vRE;

    // A non-positive variance difference means the asymptotic assumptions are
    // not met in this sample; the statistic is not interpretable.
    if (!(varDiff > 0)) {
        return {
            chiSquared: NaN, pValue: NaN, df: 1, reject: false,
            conclusion: 'Var(b_FE) - Var(b_RE) <= 0; Hausman test not interpretable in this sample',
            bFE: feModel.coefficients[iFE], bRE: reModel.coefficients[iRE], difference: bDiff
        };
    }

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

    // Studentized (Koenker) Breusch-Pagan test, matching lmtest::bptest defaults:
    // regress the squared residuals on the original regressors and form the
    // Lagrange-multiplier statistic LM = n * R²_aux ~ chi²(k-1).
    const e2 = model.residuals.map(r => r * r);
    const aux = olsFit(e2, X);

    const testStat = n * aux.r2;
    const df = k - 1;
    const pValue = 1 - jStat.chisquare.cdf(testStat, df);

    return {
        testStatistic: testStat,
        pValue,
        df,
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

    // Skip intercept (column 0). For each predictor j, regress it on all the
    // other columns (intercept + remaining predictors) and form VIF_j =
    // 1 / (1 - R²_j). This matches car::vif for models with numeric terms.
    const vif = {};

    for (let j = 1; j < k; j++) {
        const y = X.map(row => row[j]);
        // Other columns, keeping the intercept so the auxiliary regression is centered.
        const Xj = X.map(row => row.filter((_, idx) => idx !== j));

        try {
            const aux = olsFit(y, Xj);
            const vifValue = 1 / Math.max(1 - aux.r2, 1e-12);
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

    // Exact leverages from the hat matrix diagonals h_ii = x_i' (X'X)^-1 x_i.
    const Xt = jStat.transpose(X);
    const XtX_inv = jStat.inv(jStat.multiply(Xt, X));
    const leverages = X.map(xi => {
        // xi' M xi  with M = (X'X)^-1
        let h = 0;
        for (let a = 0; a < k; a++) {
            let row = 0;
            for (let b = 0; b < k; b++) row += xi[b] * XtX_inv[b][a];
            h += row * xi[a];
        }
        return h;
    });

    // Cook's distance: D_i = e_i² / (k·MSE) · h_i / (1 - h_i)²  (matches stats::cooks.distance)
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
