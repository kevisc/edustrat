/**
 * Plausible-value pooling (Rubin's rules).
 *
 * PISA reports achievement as M plausible values per domain — random draws from
 * each student's posterior proficiency distribution. Correct inference runs the
 * analysis once per plausible value and combines the results:
 *
 *   Q̄ = (1/M) Σ Q_m                             (pooled point estimate)
 *   U  = (1/M) Σ U_m                             (within-imputation variance)
 *   B  = (1/(M−1)) Σ (Q_m − Q̄)²                 (between-imputation variance)
 *   T  = U + (1 + 1/M) B                         (total variance)
 *   df = (M−1) (1 + U / ((1+1/M)B))²             (Rubin degrees of freedom)
 *
 * The between component B is the measurement (imputation) part of the
 * uncertainty that a single-PV analysis silently drops. The pooling math is
 * verified against a base-R implementation in
 * pipeline/scripts/09-verify-rigor.R (synthetic multi-PV data).
 *
 * Activation: the shipped learningtower-derived chunks carry a single PV per
 * domain, so this module stays dormant until chunks regenerated with
 * pipeline/scripts/10-add-plausible-values.R (OECD PUF) are present — the same
 * template pattern as the replicate-weight pipeline. hasPlausibleValues()
 * detects such chunks at run time.
 *
 * Author: Kevin Schoenholzer
 */

/**
 * Names of the plausible-value fields for a domain, if the records carry them
 * (e.g. pv1_math .. pv10_math written by the PV pipeline).
 * @param {Array} records - student records
 * @param {String} outcomeVar - 'math' | 'reading' | 'science'
 * @returns {Array<String>} PV field names (empty if none)
 */
export function plausibleValueFields(records, outcomeVar) {
    if (!records || records.length === 0) return [];
    const rec = records[0];
    const fields = [];
    for (let m = 1; m <= 10; m++) {
        const f = `pv${m}_${outcomeVar}`;
        if (f in rec) fields.push(f);
    }
    return fields.length >= 2 ? fields : [];
}

/**
 * Does this dataset carry multiple plausible values for the domain?
 */
export function hasPlausibleValues(records, outcomeVar) {
    return plausibleValueFields(records, outcomeVar).length >= 2;
}

/**
 * Combine per-PV estimates by Rubin's rules.
 * @param {Array<Number>} estimates - Q_m, one per plausible value
 * @param {Array<Number>} variances - U_m (squared standard errors), one per PV
 * @returns {Object} { estimate, se, variance, within, between, df, m }
 */
export function rubinPool(estimates, variances) {
    const M = estimates.length;
    if (M < 2 || variances.length !== M) return null;

    const Qbar = estimates.reduce((s, q) => s + q, 0) / M;
    const U = variances.reduce((s, u) => s + u, 0) / M;
    const B = estimates.reduce((s, q) => s + (q - Qbar) ** 2, 0) / (M - 1);
    const T = U + (1 + 1 / M) * B;
    const df = B > 0 ? (M - 1) * Math.pow(1 + U / ((1 + 1 / M) * B), 2) : Infinity;

    return { estimate: Qbar, se: Math.sqrt(T), variance: T, within: U, between: B, df, m: M };
}

/**
 * Run an estimator once per plausible value and pool the results.
 * @param {Array} records - student records carrying pv fields
 * @param {String} outcomeVar - domain ('math' ...)
 * @param {Function} estimator - (records, outcomeField) => { estimate, variance }
 * @returns {Object|null} pooled result (plus perPV detail), or null if no PVs
 */
export function poolOverPlausibleValues(records, outcomeVar, estimator) {
    const fields = plausibleValueFields(records, outcomeVar);
    if (fields.length < 2) return null;

    const perPV = fields.map(f => estimator(records, f));
    if (perPV.some(r => !r || !isFinite(r.estimate) || !isFinite(r.variance))) return null;

    const pooled = rubinPool(perPV.map(r => r.estimate), perPV.map(r => r.variance));
    return pooled ? { ...pooled, perPV, fields } : null;
}

export default { plausibleValueFields, hasPlausibleValues, rubinPool, poolOverPlausibleValues };
