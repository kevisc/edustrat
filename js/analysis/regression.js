/**
 * Regression Analysis Module
 * Performs weighted OLS, Fixed Effects, and Random Effects regression models
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

import { weightedMean } from '../core/utils.js';

/**
 * Get predictor value from a record
 * Handles both numeric fields (escs) and parent_edu (needs ISCED parsing)
 * @param {Object} record - Student record
 * @param {String} predictorVar - Predictor variable name
 * @returns {Number|null} Numeric predictor value or null if missing
 */
function getPredictorValue(record, predictorVar) {
    if (predictorVar === 'parent_edu') {
        // Parse parental education from ISCED codes
        return parseParentEducationPredictor(record);
    }

    // For other predictors (escs, etc.), try direct access
    const value = Number(record[predictorVar]);
    return Number.isFinite(value) ? value : null;
}

/**
 * Parse parental education for use as main predictor
 * Uses maximum of mother/father education
 * @param {Object} record - Student record
 * @returns {Number|null} Numeric education value
 */
function parseParentEducationPredictor(record) {
    const parseISCED = (val) => {
        if (typeof val === 'number' && Number.isFinite(val)) return val;
        const numVal = Number(val);
        if (Number.isFinite(numVal)) return numVal;

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
    if (motherEduc !== null) return motherEduc;
    if (fatherEduc !== null) return fatherEduc;

    // Try alternative field names
    const altValue = parseISCED(record.parent_edu) || parseISCED(record.PARED);
    return altValue;
}

/**
 * Calculate Akaike Information Criterion (AIC)
 * AIC = n * log(RSS/n) + 2k
 * Lower values indicate better model fit
 * @param {Number} n - Number of observations
 * @param {Number} k - Number of parameters (including intercept)
 * @param {Number} rss - Residual sum of squares
 * @returns {Number} AIC value
 */
function calculateAIC(n, k, rss) {
    if (n <= 0 || rss <= 0) return NaN;
    return n * Math.log(rss / n) + 2 * k;
}

/**
 * Calculate Bayesian Information Criterion (BIC)
 * BIC = n * log(RSS/n) + k * log(n)
 * Lower values indicate better model fit
 * Penalizes model complexity more heavily than AIC
 * @param {Number} n - Number of observations
 * @param {Number} k - Number of parameters (including intercept)
 * @param {Number} rss - Residual sum of squares
 * @returns {Number} BIC value
 */
function calculateBIC(n, k, rss) {
    if (n <= 0 || rss <= 0) return NaN;
    return n * Math.log(rss / n) + k * Math.log(n);
}

/**
 * Run weighted OLS regression with ridge stabilization
 * @param {Array} y - Dependent variable (1D array)
 * @param {Array} X - Design matrix (2D array: rows x columns)
 * @param {Array} w - Weights (1D array)
 * @returns {Object} Regression results
 */
export function weightedOLS(y, X, w) {
    const n = y.length;
    const k = X[0].length;

    // Sanitize weights → strictly positive finite
    const ww = w.map(v => (Number.isFinite(v) && v > 0) ? +v : 1);
    const sqrtW = ww.map(Math.sqrt);

    // Pre-multiply by sqrt(w)
    const Xw = X.map((row, i) => row.map(v => v * sqrtW[i]));
    const yw = y.map((v, i) => v * sqrtW[i]);
    const ywCol = yw.map(v => [v]); // Column vector

    // Matrix operations using jStat
    const Xt = jStat.transpose(Xw);
    const XtX = jStat.multiply(Xt, Xw);

    // Tiny ridge to stabilize (handles collinearity with many FEs)
    let tr = 0;
    for (let i = 0; i < k; i++) tr += XtX[i][i];
    const lam = (tr > 0 ? 1e-10 * tr : 1e-8);
    for (let i = 0; i < k; i++) XtX[i][i] += lam;

    const XtY = jStat.multiply(Xt, ywCol);
    const XtX_inv = jStat.inv(XtX);
    const betaCol = jStat.multiply(XtX_inv, XtY);
    const beta = betaCol.map(row => row[0]);

    // Predictions & residuals
    const yhat = X.map(row => row.reduce((s, v, j) => s + v * beta[j], 0));
    const resid = y.map((yi, i) => yi - yhat[i]);

    // Weighted SSE/SST
    const ybar = weightedMean(y, ww);
    const SSE = resid.reduce((s, e, i) => s + ww[i] * e * e, 0);
    const SST = y.reduce((s, yi, i) => s + ww[i] * Math.pow(yi - ybar, 2), 0);

    const df = Math.max(n - k, 1);
    const sigma2 = SSE / df;
    const vcov = XtX_inv.map(row => row.map(val => val * sigma2));
    const se = beta.map((_, i) => Math.sqrt(Math.max(vcov[i][i], 0)));
    const tStats = beta.map((b, i) => b / (se[i] || 1e-12));
    const pVals = tStats.map(t => {
        const p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));
        return Math.min(1, Math.max(0, p));
    });

    // R²
    const r2 = (SST > 0) ? 1 - (SSE / SST) : NaN;
    const adjR2 = Number.isFinite(r2) ? 1 - (1 - r2) * ((n - 1) / df) : NaN;

    // AIC and BIC for model comparison
    const aic = calculateAIC(n, k, SSE);
    const bic = calculateBIC(n, k, SSE);

    return { beta, se, tStats, pVals, r2, adjR2, n, k, df, vcov, residuals: resid, yhat, aic, bic };
}

/**
 * Build design matrix for regression
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} predictorVar - Name of main predictor variable
 * @param {Object} options - Options for FEs and controls
 *   - countryFE: boolean
 *   - yearFE: boolean
 *   - controls: array of control variable names
 * @param {String} weightType - Type of weights to use
 * @returns {Object} Design matrix components
 */
export function buildDesignMatrix(data, outcomeVar, predictorVar, options = {}, weightType = 'student') {
    const countryFE = options.countryFE || false;
    const yearFE = options.yearFE || false;
    const controls = options.controls || [];

    const filtered = [];

    for (const record of data) {
        const yi = Number(record[outcomeVar]);
        const xi = getPredictorValue(record, predictorVar);

        if (!Number.isFinite(yi) || xi === null) {
            continue;
        }

        if (!record.country) {
            continue;
        }

        if (yearFE && (record.year === undefined || record.year === null)) {
            continue;
        }

        let genderValue = null;
        let parentEduValue = null;
        let skipRow = false;

        for (const ctrl of controls) {
            if (ctrl === 'gender') {
                genderValue = parseGender(record);
                if (genderValue === null) {
                    skipRow = true;
                    break;
                }
            } else if (ctrl === 'parent_edu') {
                parentEduValue = parseParentEducation(record);
                if (parentEduValue === null) {
                    skipRow = true;
                    break;
                }
            }
        }

        if (skipRow) {
            continue;
        }

        filtered.push({
            record,
            yi,
            xi,
            genderValue,
            parentEduValue
        });
    }

    // Get unique levels for FEs from filtered data
    const countries = countryFE
        ? [...new Set(filtered.map(d => d.record.country).filter(Boolean))].sort()
        : [];
    const years = yearFE
        ? [...new Set(filtered.map(d => d.record.year).filter(v => v !== undefined && v !== null))].sort((a, b) => a - b)
        : [];

    // Build variable names
    const varNames = ['Intercept', predictorVar];

    // Add country FEs (excluding reference category)
    if (countryFE && countries.length > 1) {
        for (let i = 1; i < countries.length; i++) {
            varNames.push(`α_${countries[i]}`);
        }
    }

    // Add year FEs (excluding reference category)
    if (yearFE && years.length > 1) {
        for (let i = 1; i < years.length; i++) {
            varNames.push(`γ_${years[i]}`);
        }
    }

    // Add control variables
    controls.forEach(ctrl => {
        if (ctrl === 'gender') {
            varNames.push('Female');
        } else if (ctrl === 'parent_edu') {
            varNames.push('Parental_Education');
        }
    });

    const X = [];
    const y = [];
    const w = [];
    const groupIndex = []; // For multilevel models

    for (const row of filtered) {
        const rowX = [1, row.xi]; // Intercept and main predictor

        // Country FEs
        if (countryFE && countries.length > 1) {
            for (let i = 1; i < countries.length; i++) {
                rowX.push(row.record.country === countries[i] ? 1 : 0);
            }
        }

        // Year FEs
        if (yearFE && years.length > 1) {
            for (let i = 1; i < years.length; i++) {
                rowX.push(row.record.year === years[i] ? 1 : 0);
            }
        }

        // Control variables
        for (const ctrl of controls) {
            if (ctrl === 'gender') {
                rowX.push(row.genderValue);
            } else if (ctrl === 'parent_edu') {
                rowX.push(row.parentEduValue);
            }
        }

        X.push(rowX);
        y.push(row.yi);
        w.push(getWeight(row.record, weightType));
        groupIndex.push(row.record.country); // For multilevel models
    }

    return {
        X,
        y,
        w,
        varNames,
        countries,
        years,
        groupIndex,
        records: filtered.map(f => f.record), // aligned to X rows, for BRR replicate weights
        n: X.length
    };
}

/**
 * Attach PISA Fay BRR standard errors to a fitted model when replicate weights
 * are present and the design (point) weight is the student weight. The original
 * model-based standard errors are preserved in `standardErrors`; the BRR results
 * are added as `standardErrorsBRR` / `tStatisticsBRR` / `pValuesBRR`, and
 * `seMethod` / `seActive` record which the interface should display by default.
 *
 * BRR is computed by refitting the same design across the 80 replicate weights
 * and forming V = 1/(G(1-k)²) Σ_r (β_r − β_0)² per coefficient (Fay k = 0.5).
 * Verified against intsvy in pipeline/scripts/06-verify-brr.R.
 *
 * @param {Object} model - Fitted model object (mutated in place)
 * @param {Object} dm - Design matrix (must include records aligned to rows)
 * @param {String} weightType - Point-estimate weight type
 * @returns {Object} the model
 */
function applyBRRStandardErrors(model, dm, weightType, options = {}) {
    const recs = dm.records;
    const hasRep = recs && recs.length && Array.isArray(recs[0].rep_wgts) && recs[0].rep_wgts.length > 0;

    // Callers that only need point estimates (e.g. per-country gradients in the
    // report) can pass { brr: false } to skip the 80-replicate refit.
    if (options.brr === false || !hasRep || weightType !== 'student') {
        model.seMethod = (weightType === 'none')
            ? 'Model-based, unweighted'
            : 'Model-based (assumes simple random sampling)';
        model.seActive = 'model';
        return model;
    }

    const beta0 = model.coefficients;
    const k = beta0.length;
    const G = recs[0].rep_wgts.length;
    const sums = new Array(k).fill(0);

    for (let r = 0; r < G; r++) {
        const wr = recs.map(rec => rec.rep_wgts[r]);
        const fit = weightedOLS(dm.y, dm.X, wr);
        if (!fit?.beta) continue;
        for (let j = 0; j < k; j++) { const d = fit.beta[j] - beta0[j]; sums[j] += d * d; }
    }

    const mult = 1 / (G * Math.pow(1 - 0.5, 2)); // Fay factor k = 0.5
    const se = sums.map(s => Math.sqrt(s * mult));
    const df = Math.max(model.df, 1);

    model.standardErrorsBRR = se;
    model.tStatisticsBRR = beta0.map((b, j) => b / (se[j] || 1e-12));
    model.pValuesBRR = model.tStatisticsBRR.map(t =>
        Math.min(1, Math.max(0, 2 * (1 - jStat.studentt.cdf(Math.abs(t), df)))));
    model.seMethod = `BRR (${G} Fay replicate weights, k=0.5)`;
    model.nReplicates = G;
    model.seActive = 'BRR';
    return model;
}

/** Multiply two square-compatible matrices (small k). */
function matMul(A, B) {
    const n = A.length, m = B[0].length, p = B.length;
    const C = Array.from({ length: n }, () => new Array(m).fill(0));
    for (let i = 0; i < n; i++) for (let l = 0; l < p; l++) {
        const a = A[i][l];
        for (let j = 0; j < m; j++) C[i][j] += a * B[l][j];
    }
    return C;
}

/**
 * Attach cluster-robust (school) standard errors to a fitted model.
 *
 * PISA samples whole classrooms within schools, so student outcomes are
 * correlated within schools and the model-based errors understate uncertainty.
 * This computes the CR1 sandwich estimator clustered on school_id:
 *
 *   V = adj · (X'WX)⁻¹ [ Σ_g S_g S_g' ] (X'WX)⁻¹ ,  S_g = Σ_{i∈g} w_i e_i x_i ,
 *   adj = G/(G−1) · (N−1)/(N−k)
 *
 * matching sandwich::vcovCL(lm(..., weights = w), cluster = ~school_id,
 * type = "HC1") in R; verified in pipeline/scripts/09-verify-rigor.R.
 *
 * @param {Object} model - fitted model (mutated: standardErrorsCluster, nClusters)
 * @param {Object} dm - design matrix (records aligned to rows)
 * @returns {Object} the model
 */
function applyClusterSE(model, dm) {
    const recs = dm.records;
    if (!recs || recs.length === 0 || !recs[0].school_id) return model;

    const n = dm.y.length, k = model.coefficients.length;
    const resid = model.residuals;
    const w = dm.w;

    // Cluster score sums S_g = Σ w_i e_i x_i
    const Sg = new Map();
    for (let i = 0; i < n; i++) {
        const g = recs[i].school_id;
        let s = Sg.get(g);
        if (!s) { s = new Array(k).fill(0); Sg.set(g, s); }
        const c = ((Number.isFinite(w[i]) && w[i] > 0) ? w[i] : 1) * resid[i];
        const xi = dm.X[i];
        for (let j = 0; j < k; j++) s[j] += c * xi[j];
    }
    const G = Sg.size;
    if (G < 2) return model;

    // Meat: Σ_g S_g S_g'
    const meat = Array.from({ length: k }, () => new Array(k).fill(0));
    for (const s of Sg.values()) {
        for (let a = 0; a < k; a++) {
            const sa = s[a];
            for (let b = 0; b < k; b++) meat[a][b] += sa * s[b];
        }
    }

    // Bread: (X'WX)⁻¹, recovered from the model vcov (vcov = σ̂²·(X'WX)⁻¹).
    const SSE = resid.reduce((s, e, i) => s + (((Number.isFinite(w[i]) && w[i] > 0) ? w[i] : 1)) * e * e, 0);
    const sigma2 = SSE / Math.max(model.df, 1);
    const XtXinv = model.vcov.map(row => row.map(v => v / sigma2));

    const adj = (G / (G - 1)) * ((n - 1) / Math.max(n - k, 1));
    const V = matMul(matMul(XtXinv, meat), XtXinv);

    model.standardErrorsCluster = model.coefficients.map((_, j) => Math.sqrt(Math.max(V[j][j] * adj, 0)));
    model.nClusters = G;
    model.meanClusterSize = n / G;
    return model;
}

/**
 * Run pooled OLS regression
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} predictorVar - Name of predictor variable
 * @param {Array} controls - Array of control variable names
 * @param {String} weightType - Type of weights to use
 * @returns {Object} Regression results
 */
export function runPooledOLS(data, outcomeVar, predictorVar, controls = [], weightType = 'student', options = {}) {
    const dm = buildDesignMatrix(data, outcomeVar, predictorVar, { countryFE: false, yearFE: false, controls }, weightType);

    if (dm.X.length < dm.varNames.length + 1) {
        console.warn('Insufficient data for pooled OLS');
        return null;
    }

    const fit = weightedOLS(dm.y, dm.X, dm.w);
    if (!fit?.beta || fit.beta.some(b => !Number.isFinite(b))) {
        console.warn('Pooled OLS failed: non-finite coefficients');
        return null;
    }

    return applyClusterSE(applyBRRStandardErrors({
        modelName: 'OLS (Pooled)',
        variableNames: dm.varNames,
        coefficients: fit.beta,
        standardErrors: fit.se,
        tStatistics: fit.tStats,
        pValues: fit.pVals,
        r2: fit.r2,
        adjR2: fit.adjR2,
        aic: fit.aic,
        bic: fit.bic,
        nobs: fit.n,
        df: fit.df,
        ngroups: null,
        weighted: (weightType !== 'none'),
        residuals: fit.residuals,
        fitted: fit.yhat,
        vcov: fit.vcov
    }, dm, weightType, options), dm);
}

/**
 * Run fixed effects regression
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} predictorVar - Name of predictor variable
 * @param {Array} controls - Array of control variable names
 * @param {String} weightType - Type of weights to use
 * @returns {Object} Regression results
 */
export function runFixedEffects(data, outcomeVar, predictorVar, controls = [], weightType = 'student') {
    const includeYearFE = controls.includes('year');
    const dm = buildDesignMatrix(data, outcomeVar, predictorVar, { countryFE: true, yearFE: includeYearFE, controls: controls.filter(c => c !== 'year') }, weightType);

    if (dm.X.length < dm.varNames.length + 1) {
        console.warn('Insufficient data for fixed effects regression');
        return null;
    }

    const fit = weightedOLS(dm.y, dm.X, dm.w);
    if (!fit?.beta || fit.beta.some(b => !Number.isFinite(b))) {
        console.warn('Fixed effects regression failed: non-finite coefficients');
        return null;
    }

    // Within/between R² per the Stata xtreg convention, based on the slope-only
    // linear prediction xb (country intercepts excluded; constant shifts cancel
    // inside the correlations).
    const nCountryDummies = dm.countries.length > 1 ? dm.countries.length - 1 : 0;
    const skipCols = new Set([0]); // intercept
    for (let j = 2; j < 2 + nCountryDummies; j++) skipCols.add(j);
    const xb = dm.X.map(row => {
        let v = 0;
        for (let j = 0; j < row.length; j++) if (!skipCols.has(j)) v += row[j] * fit.beta[j];
        return v;
    });
    const { r2Within, r2Between } = calculateRsquaredComponents(dm.y, dm.w, dm.groupIndex, xb);

    return applyClusterSE(applyBRRStandardErrors({
        modelName: `Fixed Effects (Country dummies${includeYearFE ? ' + Year FE' : ''})`,
        variableNames: dm.varNames,
        coefficients: fit.beta,
        standardErrors: fit.se,
        tStatistics: fit.tStats,
        pValues: fit.pVals,
        r2: fit.r2,
        r2Within,
        r2Between,
        adjR2: fit.adjR2,
        aic: fit.aic,
        bic: fit.bic,
        nobs: fit.n,
        df: fit.df,
        ngroups: dm.countries.length,
        weighted: (weightType !== 'none'),
        residuals: fit.residuals,
        fitted: fit.yhat,
        vcov: fit.vcov
    }, dm, weightType), dm);
}

/**
 * Run random effects regression
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} predictorVar - Name of predictor variable
 * @param {Array} controls - Array of control variable names
 * @param {String} weightType - Type of weights to use
 * @returns {Object} Regression results
 */
export function runRandomEffects(data, outcomeVar, predictorVar, controls = [], weightType = 'student') {
    const includeYearFE = controls.includes('year');
    const dm = buildDesignMatrix(data, outcomeVar, predictorVar, { countryFE: false, yearFE: includeYearFE, controls: controls.filter(c => c !== 'year') }, weightType);

    if (dm.X.length < dm.varNames.length + 1) {
        console.warn('Insufficient data for random effects regression');
        return null;
    }

    // Estimate the error-component variances by Swamy-Arora: σ²_ν from the
    // within (FE) residuals and σ²_μ from the between (group-means) residuals.
    // This is the standard feasible-GLS estimator; on unweighted data it
    // reproduces plm(model="random", random.method="swar") coefficients and
    // standard errors to ~1e-4 (see pipeline/scripts/04-verify-computations.R).
    const groups = [...new Set(dm.groupIndex)];
    const { sigma_u2, sigma_e2, icc } = estimateVarianceComponents(dm.y, dm.X, dm.w, dm.groupIndex);

    // Quasi-demean transformation for RE (group-specific θ_i)
    const { yStar, XStar } = quasiDemeanRE(dm.y, dm.X, groups, dm.groupIndex, sigma_u2, sigma_e2);

    const fit = weightedOLS(yStar, XStar, dm.w);
    if (!fit?.beta || fit.beta.some(b => !Number.isFinite(b))) {
        console.warn('Random effects regression failed: non-finite coefficients');
        return null;
    }

    return {
        modelName: `Random Effects (Country-intercept${includeYearFE ? ' + Year FE' : ''})`,
        variableNames: dm.varNames,
        coefficients: fit.beta,
        standardErrors: fit.se,
        tStatistics: fit.tStats,
        pValues: fit.pVals,
        r2: fit.r2,
        adjR2: fit.adjR2,
        aic: fit.aic,
        bic: fit.bic,
        nobs: fit.n,
        df: fit.df,
        ngroups: groups.length,
        rho: icc,
        icc: icc,
        weighted: (weightType !== 'none'),
        seMethod: 'Model-based GLS (Swamy-Arora variance components)',
        residuals: fit.residuals,
        fitted: fit.yhat,
        vcov: fit.vcov
    };
}

/**
 * Estimate one-way error-component variances by the Swamy-Arora method.
 *
 *   σ²_ν (idiosyncratic) = within (FE) residual SS / (N - n - K)
 *   σ²_μ (group)         = max( between residual MS - σ²_ν / T̄ , 0 )
 *
 * where the within fit regresses group-demeaned y on the group-demeaned slope
 * columns, the between fit regresses group means (with intercept) across the n
 * groups, K is the number of slope coefficients, and T̄ = N / n. On unweighted
 * data this matches plm's "swar" variance components closely (the residual MS
 * form differs from plm's trace-corrected σ²_μ only in the 3rd–4th significant
 * figure, with negligible effect on the GLS coefficients given large groups).
 *
 * @param {Array} y - Response vector
 * @param {Array} X - Design matrix (intercept in column 0, then slope columns)
 * @param {Array} w - Weights (1s for unweighted)
 * @param {Array} groupIndex - Group membership per observation
 * @returns {Object} { sigma_u2, sigma_e2, icc }
 */
/**
 * Minimal weighted least-squares solver via Gaussian elimination on the normal
 * equations. Used by the Swamy-Arora step because jStat's matrix routines are
 * unreliable for single-column designs (the within regression). Returns the
 * weighted residual sum of squares, which is all the variance components need.
 * @param {Array} y - Response vector
 * @param {Array} X - Design matrix (rows x p), no special structure required
 * @param {Array} w - Weights
 * @returns {Number} Weighted residual sum of squares Σ w_i (y_i - ŷ_i)²
 */
function weightedRSS(y, X, w) {
    const nObs = y.length, p = X[0].length;
    // Build XtWX (p x p) and XtWy (p)
    const A = Array.from({ length: p }, () => new Array(p).fill(0));
    const b = new Array(p).fill(0);
    for (let i = 0; i < nObs; i++) {
        const wi = w[i], xi = X[i];
        for (let a = 0; a < p; a++) {
            b[a] += wi * xi[a] * y[i];
            for (let c = a; c < p; c++) A[a][c] += wi * xi[a] * xi[c];
        }
    }
    for (let a = 0; a < p; a++) for (let c = 0; c < a; c++) A[a][c] = A[c][a];

    // Solve A beta = b by Gaussian elimination with partial pivoting.
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < p; col++) {
        let piv = col;
        for (let r = col + 1; r < p; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
        [M[col], M[piv]] = [M[piv], M[col]];
        const d = M[col][col] || 1e-12;
        for (let r = 0; r < p; r++) {
            if (r === col) continue;
            const f = M[r][col] / d;
            for (let c = col; c <= p; c++) M[r][c] -= f * M[col][c];
        }
    }
    const beta = M.map((row, i) => row[p] / (M[i][i] || 1e-12));

    let rss = 0;
    for (let i = 0; i < nObs; i++) {
        let yhat = 0;
        for (let a = 0; a < p; a++) yhat += X[i][a] * beta[a];
        const e = y[i] - yhat;
        rss += w[i] * e * e;
    }
    return rss;
}

function estimateVarianceComponents(y, X, w, groupIndex) {
    const N = y.length;
    const k = X[0].length;          // includes intercept
    const Kslopes = k - 1;
    const groups = [...new Set(groupIndex)];
    const n = groups.length;

    // Weighted group means of y and every column of X.
    const gW = {}, gY = {}, gX = {};
    groups.forEach(g => { gW[g] = 0; gY[g] = 0; gX[g] = new Array(k).fill(0); });
    for (let i = 0; i < N; i++) {
        const g = groupIndex[i], wi = w[i];
        gW[g] += wi; gY[g] += wi * y[i];
        for (let j = 0; j < k; j++) gX[g][j] += wi * X[i][j];
    }
    groups.forEach(g => {
        if (gW[g] > 0) { gY[g] /= gW[g]; for (let j = 0; j < k; j++) gX[g][j] /= gW[g]; }
    });

    // WITHIN: regress group-demeaned y on the demeaned slope columns (no intercept).
    const yd = [], Xd = [];
    for (let i = 0; i < N; i++) {
        const g = groupIndex[i];
        yd.push(y[i] - gY[g]);
        const row = [];
        for (let j = 1; j < k; j++) row.push(X[i][j] - gX[g][j]);
        Xd.push(row.length ? row : [0]);
    }
    const sseWithin = weightedRSS(yd, Xd, w);
    const sigma_e2 = sseWithin / Math.max(N - n - Kslopes, 1);

    // BETWEEN: unweighted OLS of group means (intercept + slopes) across n groups.
    const yb = [], Xb = [];
    groups.forEach(g => {
        yb.push(gY[g]);
        const row = [1];
        for (let j = 1; j < k; j++) row.push(gX[g][j]);
        Xb.push(row);
    });
    const sseBetween = weightedRSS(yb, Xb, yb.map(() => 1));
    const sigma_1 = sseBetween / Math.max(n - Kslopes - 1, 1);

    const Tbar = N / n;
    const sigma_u2 = Math.max(sigma_1 - sigma_e2 / Tbar, 0);

    const totalVar = sigma_u2 + sigma_e2;
    const icc = totalVar > 0 ? sigma_u2 / totalVar : 0;
    return { sigma_u2, sigma_e2, icc };
}

/**
 * Quasi-demean transformation for random effects
 * @param {Array} y - Dependent variable
 * @param {Array} X - Design matrix
 * @param {Array} groups - Array of group identifiers
 * @param {Array} groupIndex - Group membership for each observation
 * @param {Number} sigma_u2 - Group (between) variance component σ²_μ
 * @param {Number} sigma_e2 - Idiosyncratic (within) variance component σ²_ν
 * @returns {Object} Transformed y and X
 */
function quasiDemeanRE(y, X, groups, groupIndex, sigma_u2, sigma_e2) {
    sigma_u2 = Math.max(sigma_u2, 0);
    sigma_e2 = Math.max(sigma_e2, 1e-9);

    // Precompute group means for each column
    const k = X[0].length;
    const gMeans = {};
    const gY = {};
    groups.forEach(g => {
        gMeans[g] = new Array(k).fill(0);
        gY[g] = 0;
    });
    const gN = {};
    groups.forEach(g => gN[g] = 0);

    for (let i = 0; i < y.length; i++) {
        const g = groupIndex[i];
        gN[g] += 1;
        gY[g] += y[i];
        for (let j = 0; j < k; j++) gMeans[g][j] += X[i][j];
    }

    groups.forEach(g => {
        if (gN[g] > 0) {
            gY[g] /= gN[g];
            for (let j = 0; j < k; j++) gMeans[g][j] /= gN[g];
        }
    });

    // Transform
    const yStar = new Array(y.length);
    const XStar = new Array(y.length);

    for (let i = 0; i < y.length; i++) {
        const g = groupIndex[i];
        const theta = 1 - Math.sqrt(sigma_e2 / (sigma_e2 + gN[g] * sigma_u2));
        yStar[i] = y[i] - theta * gY[g];
        XStar[i] = X[i].map((xj, j) => xj - theta * gMeans[g][j]);
    }

    return { yStar, XStar };
}

/**
 * Within and between R² for the fixed-effects model, following the Stata xtreg
 * convention: with xb the slope-only linear prediction (country intercepts
 * excluded), the within R² is the squared weighted correlation between
 * group-demeaned xb and group-demeaned y, and the between R² is the squared
 * correlation between the group means of xb and y (each group counted once).
 * On unweighted data the within R² equals the R² of the demeaned (within)
 * regression that plm reports for model = "within"; verified in
 * pipeline/scripts/09-verify-rigor.R.
 * @param {Array} y - Response vector
 * @param {Array} w - Weights
 * @param {Array} groupIndex - Group membership per observation
 * @param {Array} xb - Slope-only linear prediction per observation
 * @returns {Object} { r2Within, r2Between }
 */
function calculateRsquaredComponents(y, w, groupIndex, xb) {
    const groups = [...new Set(groupIndex)];
    const gW = {}, gY = {}, gXb = {};
    groups.forEach(g => { gW[g] = 0; gY[g] = 0; gXb[g] = 0; });
    for (let i = 0; i < y.length; i++) {
        const g = groupIndex[i], wi = w[i];
        gW[g] += wi; gY[g] += wi * y[i]; gXb[g] += wi * xb[i];
    }
    groups.forEach(g => { if (gW[g] > 0) { gY[g] /= gW[g]; gXb[g] /= gW[g]; } });

    // Within: squared weighted correlation of group-demeaned xb and y.
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < y.length; i++) {
        const g = groupIndex[i], wi = w[i];
        const dx = xb[i] - gXb[g], dy = y[i] - gY[g];
        sxx += wi * dx * dx; syy += wi * dy * dy; sxy += wi * dx * dy;
    }
    const r2Within = (sxx > 0 && syy > 0) ? (sxy * sxy) / (sxx * syy) : NaN;

    // Between: squared correlation of the group means, each group counted once
    // (the Stata xtreg convention).
    const nG = groups.length;
    const mX = groups.reduce((s, g) => s + gXb[g], 0) / nG;
    const mY = groups.reduce((s, g) => s + gY[g], 0) / nG;
    let bxx = 0, byy = 0, bxy = 0;
    groups.forEach(g => {
        const dx = gXb[g] - mX, dy = gY[g] - mY;
        bxx += dx * dx; byy += dy * dy; bxy += dx * dy;
    });
    const r2Between = (bxx > 0 && byy > 0) ? (bxy * bxy) / (bxx * byy) : NaN;

    return { r2Within, r2Between };
}

/**
 * Parse gender variable to 0/1
 * @param {Object} record - Student record
 * @returns {Number|null} 0=male, 1=female, null=missing
 */
function parseGender(record) {
    const genderFields = ['gender', 'female', 'is_female', 'sex', 'ST004D01T'];

    for (const field of genderFields) {
        const v = record[field];
        if (v === null || v === undefined) continue;

        if (typeof v === 'number') {
            if (v === 0 || v === 1) return v;
            if (v === 2) return 0; // PISA coding: 1=female, 2=male
            return (v > 0.5) ? 1 : 0;
        }

        const s = String(v).toLowerCase();
        if (s.startsWith('f')) return 1;
        if (s.startsWith('m')) return 0;
    }

    return null;
}

/**
 * Parse ISCED code to numeric value
 * @param {String|Number} value - ISCED code or numeric value
 * @returns {Number|null} Numeric education level or null if invalid
 */
function parseISCEDCode(value) {
    // If already numeric, return it
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    const numValue = Number(value);
    if (Number.isFinite(numValue)) {
        return numValue;
    }

    // Parse ISCED text codes (e.g., "ISCED 3A", "ISCED 2", "None")
    if (typeof value === 'string') {
        const upper = value.toUpperCase().trim();

        // Handle "None" or missing
        if (upper === 'NONE' || upper === 'NA' || upper === 'N/A' || upper === '') {
            return null;
        }

        // Extract ISCED level number
        const match = upper.match(/ISCED\s*(\d)/i);
        if (match) {
            return parseInt(match[1], 10);
        }

        // Handle other common education level strings
        if (upper.includes('PRIMARY') || upper.includes('ELEMENTARY')) return 1;
        if (upper.includes('LOWER SECONDARY') || upper.includes('MIDDLE')) return 2;
        if (upper.includes('UPPER SECONDARY') || upper.includes('HIGH SCHOOL')) return 3;
        if (upper.includes('POST-SECONDARY') || upper.includes('VOCATIONAL')) return 4;
        if (upper.includes('BACHELOR') || upper.includes('UNDERGRADUATE')) return 6;
        if (upper.includes('MASTER')) return 7;
        if (upper.includes('DOCTOR') || upper.includes('PHD')) return 8;
    }

    return null;
}

/**
 * Parse parental education as a numeric value
 * Uses the higher of mother/father education if both available
 * @param {Object} record - Student record
 * @returns {Number|null} Numeric education value or null if missing
 */
function parseParentEducation(record) {
    const motherEduc = parseISCEDCode(record.mother_educ);
    const fatherEduc = parseISCEDCode(record.father_educ);

    // If both available, use the higher value (common in PISA analyses)
    if (motherEduc !== null && fatherEduc !== null) {
        return Math.max(motherEduc, fatherEduc);
    }

    // Return whichever is available
    if (motherEduc !== null) return motherEduc;
    if (fatherEduc !== null) return fatherEduc;

    // Try other field names
    const alternatives = ['parent_edu', 'PARED', 'pared', 'hisei'];
    for (const field of alternatives) {
        const val = parseISCEDCode(record[field]);
        if (val !== null) return val;
    }

    return null;
}

/**
 * Get weight for a single record
 * @param {Object} record - Student record
 * @param {String} weightType - Type of weight
 * @returns {Number} Weight value
 */
function getWeight(record, weightType) {
    if (weightType === 'none') {
        return 1;
    }

    if (weightType === 'senate') {
        const v = record.w_fsenwt || record.senateWeight || record.W_FSENWT;
        if (v && isFinite(+v) && +v > 0) return +v;
        return 1;
    }

    // Default: student weight (stu_wgt is the learningtower field name for W_FSTUWT)
    const v = record.stu_wgt || record.w_fstuwt || record.studentWeight || record.W_FSTUWT || record.weight;
    if (v && isFinite(+v) && +v > 0) return +v;

    return 1;
}

export default {
    weightedOLS,
    buildDesignMatrix,
    runPooledOLS,
    runFixedEffects,
    runRandomEffects
};
