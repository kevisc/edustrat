/**
 * Within-Country Trends Module
 *
 * PISA is a series of *repeated cross-sections*, not a panel of individuals: a
 * 15-year-old tested in 2009 is never re-tested in 2012. There is therefore no
 * individual-level panel to estimate. What CAN be estimated, and what this module
 * provides, is a *country-level* panel: for each country we compute a focal
 * statistic θ (mean achievement, the ESCS gradient, the Gini of achievement, or
 * the Q4–Q1 SES gap) once per cycle, with a design-correct standard error, and
 * then model how θ moves across cycles *within* a country.
 *
 * Two trend estimators are offered:
 *
 *   1. Per-country trend — an inverse-variance-weighted (precision-weighted)
 *      regression of the per-cycle estimate on time (decades). Each cycle is
 *      weighted by 1/SE², so precisely-estimated cycles count more. This is the
 *      meta-regression a careful analyst runs on a series of estimates-with-
 *      uncertainty, and is reproduced exactly by
 *        lm(theta ~ I((year-2000)/10), weights = 1/se^2).
 *
 *   2. Country fixed-effects panel — when several countries each have ≥2 cycles,
 *      θ_ct = α_c + β·time_t + ε_ct with country dummies absorbing time-invariant
 *      level differences, so β is the *average within-country* trend identified
 *      purely from within-country change. Reproduced by
 *        lm(theta ~ I((year-2000)/10) + factor(country), weights = 1/se^2).
 *      This is the genuine "fixed effects over time" the cross-sectional country
 *      dummies in regression.js do not provide.
 *
 * Every per-cycle estimate reuses an already-R-verified estimator: weighted means
 * and the ESCS slope come from weightedOLS / runPooledOLS (verified vs stats::lm),
 * the Gini from calculateGini (verified vs an R reference), and design-correct
 * standard errors from the Fay BRR core (brr.js, verified vs intsvy) wherever the
 * chunk carries replicate weights. The two trend regressions are themselves plain
 * weighted least squares and are verified in pipeline/scripts/07-verify-trends.R.
 *
 * Author: Kevin Schoenholzer
 */

import { weightedOLS, runPooledOLS } from './regression.js';
import { calculateInequalityMeasures } from './descriptive.js';
import { decomposeAchievementGap } from './decomposition.js';
import { calculateGini } from '../core/utils.js';
import { hasReplicateWeights, brrStatistic, weightedMeanEstimator,
         finalStudentWeight } from './brr.js';

/** Time origin for the decade-scaled trend slope (slope = Δθ per decade). */
export const TREND_ORIGIN = 2000;

/**
 * Metric catalogue. `band` flags whether the metric carries a per-cycle standard
 * error in the general case (mean/gradient always do; Gini/gap only under BRR).
 */
export const TREND_METRICS = {
    mean:     { key: 'mean',     label: 'Mean achievement',      unit: 'score points',       short: 'Mean' },
    gradient: { key: 'gradient', label: 'ESCS gradient',         unit: 'points per SD of ESCS', short: 'Gradient' },
    gini:     { key: 'gini',     label: 'Achievement Gini',      unit: 'Gini (0–1)',         short: 'Gini' },
    gap:      { key: 'gap',      label: 'Q4–Q1 SES gap',         unit: 'score points',       short: 'Q4–Q1 gap' }
};

// --- Weighting helper (matches the rule used across the analysis modules) -----

function getWeight(record, weightType) {
    if (weightType === 'none') return 1;
    if (weightType === 'senate') {
        const v = record.w_fsenwt || record.senateWeight || record.W_FSENWT;
        return (v && isFinite(+v) && +v > 0) ? +v : 1;
    }
    const v = record.stu_wgt || record.w_fstuwt || record.studentWeight || record.W_FSTUWT || record.weight;
    return (v && isFinite(+v) && +v > 0) ? +v : 1;
}

function parsePredictorValue(record, predictorVar) {
    if (predictorVar !== 'parent_edu') {
        const v = +record[predictorVar];
        return isFinite(v) ? v : null;
    }
    const parse = (val) => {
        if (typeof val === 'number' && isFinite(val)) return val;
        const n = Number(val);
        if (isFinite(n)) return n;
        if (typeof val === 'string') {
            const u = val.toUpperCase().trim();
            if (u === 'NONE' || u === 'NA' || u === 'N/A' || u === '') return null;
            const m = u.match(/ISCED\s*(\d)/i);
            if (m) return parseInt(m[1], 10);
        }
        return null;
    };
    const mo = parse(record.mother_educ), fa = parse(record.father_educ);
    if (mo !== null && fa !== null) return Math.max(mo, fa);
    return mo !== null ? mo : fa;
}

// --- BRR estimators for the inequality metrics (mean/slope live in brr.js) ----

function giniEstimator(outcomeVar, weightType) {
    return (records, weightFn) => {
        const vals = [], wts = [];
        for (const rec of records) {
            const v = +rec[outcomeVar];
            if (!isFinite(v)) continue;
            vals.push(v);
            wts.push(weightType === 'none' ? 1 : weightFn(rec));
        }
        return calculateGini(vals, weightType === 'none' ? null : wts);
    };
}

function gapEstimator(outcomeVar, predictorVar, weightType) {
    // Weighted Q4–Q1 gap reproducing decomposeAchievementGap's quartile logic but
    // parameterised by an arbitrary weight function so it can be re-run across the
    // 80 replicate weights inside brrStatistic.
    return (records, weightFn) => {
        const rows = [];
        for (const rec of records) {
            const y = +rec[outcomeVar];
            const x = parsePredictorValue(rec, predictorVar);
            if (isFinite(y) && x !== null) {
                rows.push({ y, x, w: weightType === 'none' ? 1 : weightFn(rec) });
            }
        }
        if (rows.length < 4) return NaN;
        rows.sort((a, b) => a.x - b.x);
        const totalW = rows.reduce((s, r) => s + r.w, 0);
        const thr = [0.25, 0.5, 0.75].map(p => p * totalW);
        const bnd = [null, null, null];
        let cum = 0, qi = 0;
        for (let i = 0; i < rows.length && qi < 3; i++) {
            cum += rows[i].w;
            if (cum >= thr[qi]) { bnd[qi] = rows[i].x; qi++; }
        }
        const q1 = rows.filter(r => r.x <= bnd[0]);
        const q4 = rows.filter(r => r.x > bnd[2]);
        const wmean = a => a.reduce((s, r) => s + r.w * r.y, 0) / a.reduce((s, r) => s + r.w, 0);
        return wmean(q4) - wmean(q1);
    };
}

// --- Per-cycle point estimate + standard error --------------------------------

/**
 * Weighted mean of `outcomeVar` with a standard error. The SE is the design-
 * correct Fay BRR error when the chunk carries replicate weights and student
 * weights are in use; otherwise it is the model-based weighted SE from the verified
 * weightedOLS solver (an intercept-only WLS fit reproduces lm(y ~ 1, weights = w)).
 */
function meanEstimate(records, outcomeVar, weightType) {
    const ys = [], ws = [];
    for (const rec of records) {
        const y = +rec[outcomeVar];
        if (!isFinite(y)) continue;
        ys.push(y);
        ws.push(getWeight(rec, weightType));
    }
    const n = ys.length;
    if (n < 2) return { estimate: NaN, se: null, seMethod: null, n };

    // Closed-form weighted mean and its model-based standard error. This is the
    // intercept-only WLS fit lm(y ~ 1, weights = w): β = Σwy/Σw and
    // Var(β) = σ̂²/Σw with σ̂² = Σw(y-β)²/(n-1). Computed directly rather than via
    // weightedOLS, whose jStat matrix inverse is unreliable for a single-column
    // design (see the Swamy–Arora note in regression.js).
    const W = ws.reduce((s, w) => s + w, 0);
    let estimate = ys.reduce((s, y, i) => s + ws[i] * y, 0) / W;
    const sigma2 = ys.reduce((s, y, i) => s + ws[i] * (y - estimate) ** 2, 0) / (n - 1);
    let se = Math.sqrt(sigma2 / W);
    let seMethod = weightType === 'none' ? 'Model-based, unweighted' : 'Model-based (SRS)';

    if (weightType === 'student' && hasReplicateWeights(records)) {
        const b = brrStatistic(records, weightedMeanEstimator(outcomeVar), finalStudentWeight);
        if (b && isFinite(b.se)) { estimate = b.estimate; se = b.se; seMethod = `BRR (${b.nrep} Fay)`; }
    }
    return { estimate, se: isFinite(se) ? se : null, seMethod, n: ys.length };
}

/**
 * ESCS gradient (slope of outcome on the SES predictor) with a standard error,
 * reusing runPooledOLS so the point estimate, model SE and BRR SE are exactly the
 * ones the Regression tab reports and the verification harness checks.
 */
function gradientEstimate(records, outcomeVar, predictorVar, weightType) {
    const model = runPooledOLS(records, outcomeVar, predictorVar, [], weightType);
    if (!model || !model.coefficients || !isFinite(model.coefficients[1])) {
        return { estimate: NaN, se: null, seMethod: null, n: 0 };
    }
    const useBRR = model.seActive === 'BRR' && model.standardErrorsBRR;
    const se = useBRR ? model.standardErrorsBRR[1] : model.standardErrors[1];
    return {
        estimate: model.coefficients[1],
        se: isFinite(se) ? se : null,
        seMethod: model.seMethod,
        n: model.nobs
    };
}

function inequalityEstimate(records, metric, outcomeVar, predictorVar, weightType) {
    let estimate = NaN, n = 0;
    if (metric === 'gini') {
        const ineq = calculateInequalityMeasures(records, outcomeVar, weightType);
        estimate = ineq ? ineq.gini : NaN;
        n = records.filter(r => isFinite(+r[outcomeVar])).length;
    } else { // gap
        const g = decomposeAchievementGap(records, outcomeVar, predictorVar, weightType);
        estimate = g ? g.gap_q4_q1 : NaN;
        n = g ? (g.q1.n + g.q2.n + g.q3.n + g.q4.n) : 0;
    }
    let se = null, seMethod = 'Point estimate (no analytic SE)';
    if (weightType === 'student' && hasReplicateWeights(records)) {
        const est = metric === 'gini'
            ? giniEstimator(outcomeVar, weightType)
            : gapEstimator(outcomeVar, predictorVar, weightType);
        const b = brrStatistic(records, est, finalStudentWeight);
        if (b && isFinite(b.se)) { estimate = b.estimate; se = b.se; seMethod = `BRR (${b.nrep} Fay)`; }
    }
    return { estimate, se, seMethod, n };
}

/**
 * Compute one focal statistic for one country-cycle slice of records.
 * @returns {Object} { estimate, se, seMethod, n }
 */
export function cycleEstimate(records, metric, outcomeVar, predictorVar, weightType) {
    if (!records || records.length === 0) return { estimate: NaN, se: null, seMethod: null, n: 0 };
    if (metric === 'mean') return meanEstimate(records, outcomeVar, weightType);
    if (metric === 'gradient') return gradientEstimate(records, outcomeVar, predictorVar, weightType);
    return inequalityEstimate(records, metric, outcomeVar, predictorVar, weightType);
}

// --- Trend estimators ---------------------------------------------------------

const decade = (year, origin) => (year - origin) / 10;

/**
 * Inverse-variance-weighted linear trend of a per-cycle series on time.
 * Falls back to an equally-weighted (unweighted) fit when any cycle lacks a usable
 * standard error. Returns null if fewer than two cycles are present.
 *
 * @param {Array} points - [{ year, estimate, se }] for ONE country
 * @param {Number} origin - decade origin year (default TREND_ORIGIN)
 */
export function fitTrend(points, origin = TREND_ORIGIN) {
    const pts = points.filter(p => isFinite(p.estimate)).sort((a, b) => a.year - b.year);
    if (pts.length < 2) return null;

    const haveSE = pts.every(p => isFinite(p.se) && p.se > 0);
    const w = haveSE ? pts.map(p => 1 / (p.se * p.se)) : pts.map(() => 1);
    const y = pts.map(p => p.estimate);
    const X = pts.map(p => [1, decade(p.year, origin)]);

    const fit = weightedOLS(y, X, w);
    const nCycles = pts.length;
    const estimable = nCycles >= 3; // need residual df ≥ 1 for a slope SE

    return {
        slopePerDecade: fit.beta[1],
        intercept: fit.beta[0],
        se: estimable ? fit.se[1] : null,
        t: estimable ? fit.tStats[1] : null,
        p: estimable ? fit.pVals[1] : null,
        r2: fit.r2,
        weighting: haveSE ? 'inverse-variance' : 'unweighted',
        nCycles,
        origin,
        firstYear: pts[0].year,
        lastYear: pts[pts.length - 1].year,
        // Endpoint coordinates for drawing the fitted line.
        lineX: [pts[0].year, pts[pts.length - 1].year],
        lineY: [
            fit.beta[0] + fit.beta[1] * decade(pts[0].year, origin),
            fit.beta[0] + fit.beta[1] * decade(pts[pts.length - 1].year, origin)
        ]
    };
}

/**
 * Country fixed-effects panel trend across cycles. Stacks every country's
 * per-cycle estimate into θ_ct = α_c + β·time + ε and returns β, the average
 * within-country trend net of fixed country levels.
 *
 * @param {Object} byCountry - { CODE: { points: [{year, estimate, se}] } }
 * @param {Number} origin - decade origin year
 * @returns {Object|null} fixed-effects panel result, or null if not identified
 */
export function fitFixedEffectsPanel(byCountry, origin = TREND_ORIGIN) {
    const countries = Object.keys(byCountry)
        .filter(c => byCountry[c].points.filter(p => isFinite(p.estimate)).length >= 2)
        .sort();
    if (countries.length < 2) return null;

    const cells = [];
    countries.forEach(c => {
        byCountry[c].points.forEach(p => {
            if (isFinite(p.estimate)) cells.push({ country: c, year: p.year, estimate: p.estimate, se: p.se });
        });
    });
    // Need more cells than parameters (intercept + slope + (K-1) country dummies).
    const k = 2 + (countries.length - 1);
    if (cells.length <= k) return null;

    const haveSE = cells.every(c => isFinite(c.se) && c.se > 0);
    const w = haveSE ? cells.map(c => 1 / (c.se * c.se)) : cells.map(() => 1);
    const y = cells.map(c => c.estimate);
    const ref = countries[0];
    const X = cells.map(c => {
        const row = [1, decade(c.year, origin)];
        for (let i = 1; i < countries.length; i++) row.push(c.country === countries[i] ? 1 : 0);
        return row;
    });

    const fit = weightedOLS(y, X, w);
    return {
        slopePerDecade: fit.beta[1],
        se: fit.se[1],
        t: fit.tStats[1],
        p: fit.pVals[1],
        weighting: haveSE ? 'inverse-variance' : 'unweighted',
        nCountries: countries.length,
        nCells: cells.length,
        referenceCountry: ref,
        countries
    };
}

// --- Comparability caveats ----------------------------------------------------

/**
 * PISA cross-cycle comparability flags relevant to the chosen outcome/metric.
 * These are the breaks an analyst must not silently read through.
 */
export function comparabilityNotes(outcomeVar, metric) {
    const baseline = { math: 2003, reading: 2000, science: 2006 };
    const notes = [];
    notes.push({
        year: baseline[outcomeVar] || 2000,
        type: 'baseline',
        text: `The reporting scale for ${outcomeVar} is anchored to PISA ${baseline[outcomeVar] || 2000}; earlier points (if any) are not on the official trend scale.`
    });
    notes.push({
        year: 2015,
        type: 'break',
        text: '2015 moved PISA from paper to computer-based delivery — a mode change that can shift levels independently of real change.'
    });
    notes.push({
        year: 2022,
        type: 'break',
        text: '2022 was administered during COVID-19 disruption; cross-country and cross-cycle comparisons for that cycle warrant extra caution.'
    });
    if (metric === 'gradient' || metric === 'gap') {
        notes.push({
            year: null,
            type: 'construct',
            text: 'ESCS is re-scaled across cycles, so the level of the SES gradient/gap is not perfectly comparable over time; the direction of within-country change is more robust than its exact magnitude.'
        });
    }
    if (metric === 'gini') {
        notes.push({
            year: null,
            type: 'construct',
            text: 'Gini and Lorenz measures were designed for ratio-scale quantities (e.g. income). Test scores are interval-scaled with an arbitrary origin, so the Gini of achievement is a descriptive dispersion index, not an income-style inequality measure — read changes, not absolute levels.'
        });
    }
    return notes;
}

// --- Orchestrator -------------------------------------------------------------

/**
 * Build the full within-country trends analysis from a pool of student records
 * spanning one or more countries and two or more cycles.
 *
 * @param {Array} records - student records (each with country, year, weights, ...)
 * @param {Object} opts - { metric, outcomeVar, predictorVar, weightType, minN }
 * @returns {Object} { metric, metricMeta, byCountry, fePanel, caveats, origin, weightType, outcomeVar, predictorVar }
 */
export function analyzeWithinCountryTrends(records, opts = {}) {
    const metric = opts.metric || 'gradient';
    const outcomeVar = opts.outcomeVar || 'math';
    const predictorVar = opts.predictorVar || 'escs';
    const weightType = opts.weightType || 'student';
    const minN = opts.minN || 100; // skip tiny country-cycle cells
    const origin = TREND_ORIGIN;

    // Group records by country, then by year.
    const byCountryYear = {};
    for (const r of records) {
        if (!r.country || r.year === undefined || r.year === null) continue;
        (byCountryYear[r.country] = byCountryYear[r.country] || {});
        const yr = +r.year;
        (byCountryYear[r.country][yr] = byCountryYear[r.country][yr] || []).push(r);
    }

    const byCountry = {};
    Object.keys(byCountryYear).sort().forEach(country => {
        const years = Object.keys(byCountryYear[country]).map(Number).sort((a, b) => a - b);
        const points = [];
        years.forEach(year => {
            const slice = byCountryYear[country][year];
            if (slice.length < minN) return;
            const est = cycleEstimate(slice, metric, outcomeVar, predictorVar, weightType);
            if (isFinite(est.estimate)) {
                points.push({ year, estimate: est.estimate, se: est.se, seMethod: est.seMethod, n: est.n });
            }
        });
        if (points.length >= 1) {
            byCountry[country] = { points, trend: points.length >= 2 ? fitTrend(points, origin) : null };
        }
    });

    const fePanel = fitFixedEffectsPanel(byCountry, origin);

    return {
        metric,
        metricMeta: TREND_METRICS[metric],
        byCountry,
        fePanel,
        caveats: comparabilityNotes(outcomeVar, metric),
        origin,
        weightType,
        outcomeVar,
        predictorVar
    };
}

export default {
    TREND_METRICS,
    TREND_ORIGIN,
    cycleEstimate,
    fitTrend,
    fitFixedEffectsPanel,
    comparabilityNotes,
    analyzeWithinCountryTrends
};
