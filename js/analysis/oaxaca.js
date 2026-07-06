/**
 * Oaxaca–Blinder decomposition of an achievement gap between two groups
 * (two countries, or the same country in two cycles).
 *
 * The mean gap ȳ_A − ȳ_B is decomposed with the group-B coefficients as the
 * reference ("how much of the gap would remain if A kept its composition but
 * faced B's returns?"):
 *
 *   threefold:  gap = E + C + I
 *     E (endowments)    = (x̄_A − x̄_B)' β_B   — composition differences
 *     C (coefficients)  = x̄_B' (β_A − β_B)   — differences in returns
 *     I (interaction)   = (x̄_A − x̄_B)' (β_A − β_B)
 *   twofold (reference = B):
 *     explained   = E
 *     unexplained = C + I
 *
 * Group regressions are the same survey-weighted OLS used everywhere else
 * (weightedOLS via buildDesignMatrix), and the decomposition itself is exact
 * algebra on those verified fits — checked end-to-end against a base-R
 * implementation with lm(weights=) in pipeline/scripts/09-verify-rigor.R.
 *
 * As with all EduStrat regressions these are descriptive associations, not
 * causal effects; the interface says so where the result is displayed.
 *
 * Author: Kevin Schoenholzer
 */

import { weightedOLS, buildDesignMatrix } from './regression.js';

/**
 * Weighted column means of a design matrix (including the intercept column).
 */
function weightedColMeans(dm) {
    const k = dm.X[0].length;
    const means = new Array(k).fill(0);
    let W = 0;
    for (let i = 0; i < dm.X.length; i++) {
        const w = (Number.isFinite(dm.w[i]) && dm.w[i] > 0) ? dm.w[i] : 1;
        W += w;
        for (let j = 0; j < k; j++) means[j] += w * dm.X[i][j];
    }
    return means.map(v => v / W);
}

function weightedMeanY(dm) {
    let W = 0, S = 0;
    for (let i = 0; i < dm.y.length; i++) {
        const w = (Number.isFinite(dm.w[i]) && dm.w[i] > 0) ? dm.w[i] : 1;
        W += w; S += w * dm.y[i];
    }
    return S / W;
}

/**
 * Fit one group's weighted regression and return its pieces.
 */
function fitGroup(records, outcomeVar, predictorVar, controls, weightType) {
    const dm = buildDesignMatrix(records, outcomeVar, predictorVar,
        { countryFE: false, yearFE: false, controls }, weightType);
    if (dm.X.length < dm.varNames.length + 2) return null;
    const fit = weightedOLS(dm.y, dm.X, dm.w);
    if (!fit?.beta || fit.beta.some(b => !Number.isFinite(b))) return null;
    return { beta: fit.beta, xbar: weightedColMeans(dm), ybar: weightedMeanY(dm), n: dm.X.length, varNames: dm.varNames };
}

/**
 * Oaxaca–Blinder decomposition between two subsets of the loaded data.
 *
 * @param {Array} recordsA - group A student records
 * @param {Array} recordsB - group B student records (reference group)
 * @param {String} outcomeVar - outcome field
 * @param {String} predictorVar - SES predictor
 * @param {Array} controls - control variable names (gender, parent_edu)
 * @param {String} weightType - weighting
 * @returns {Object|null} decomposition result
 */
export function oaxacaDecomposition(recordsA, recordsB, outcomeVar, predictorVar,
                                    controls = [], weightType = 'student') {
    const A = fitGroup(recordsA, outcomeVar, predictorVar, controls, weightType);
    const B = fitGroup(recordsB, outcomeVar, predictorVar, controls, weightType);
    if (!A || !B) return null;

    const k = A.beta.length;
    const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
    const dx = A.xbar.map((v, i) => v - B.xbar[i]);
    const db = A.beta.map((v, i) => v - B.beta[i]);

    const endowments = dot(dx, B.beta);
    const coefficients = dot(B.xbar, db);
    const interaction = dot(dx, db);
    const gap = A.ybar - B.ybar;

    // Per-variable detail of the endowments (explained) component.
    const detail = A.varNames.map((name, j) => ({
        variable: name,
        endowment: dx[j] * B.beta[j],
        meanA: A.xbar[j],
        meanB: B.xbar[j],
        betaA: A.beta[j],
        betaB: B.beta[j]
    })).filter(d => d.variable !== 'Intercept');

    return {
        gap,
        meanA: A.ybar, meanB: B.ybar,
        nA: A.n, nB: B.n,
        threefold: { endowments, coefficients, interaction },
        twofold: { explained: endowments, unexplained: coefficients + interaction },
        detail,
        varNames: A.varNames,
        // identity check: components must add back to the gap (floating point)
        identityGap: Math.abs(endowments + coefficients + interaction - gap)
    };
}

export default { oaxacaDecomposition };
