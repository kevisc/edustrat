/**
 * Balanced Repeated Replication (BRR) variance estimation — PISA / Fay's method.
 *
 * The OECD recommends estimating sampling variance for PISA statistics with the
 * 80 Fay replicate weights (W_FSTURWT1..80, Fay factor k = 0.5) rather than the
 * model-based formulae that assume simple random sampling. For any statistic θ:
 *
 *     V_BRR(θ) = 1 / (G·(1 − k)²) · Σ_{r=1}^{G} (θ_r − θ_0)²
 *
 * where θ_0 is computed with the final weight W_FSTUWT and θ_r with replicate
 * weight r. For PISA, G = 80 and k = 0.5, so the multiplier is 1/(80·0.25) = 0.05.
 *
 * EduStrat uses a single plausible value (a constraint of the learningtower
 * source it was first built on); BRR therefore captures the *sampling* component
 * of variance. The imputation/measurement component across plausible values is not
 * estimated here and is documented as a known limitation.
 *
 * Verified against intsvy and a direct BRR reference in R; see
 * pipeline/scripts/06-verify-brr.R.
 *
 * Author: Kevin Schoenholzer
 */

export const FAY_FACTOR = 0.5;

/**
 * Does this dataset carry PISA replicate weights?
 * @param {Array} data - Array of student records
 * @returns {Boolean} true if records expose a rep_wgts array
 */
export function hasReplicateWeights(data) {
    if (!data || data.length === 0) return false;
    const r = data[0].rep_wgts;
    return Array.isArray(r) && r.length > 0;
}

/**
 * Number of replicate weights available (e.g. 80 for PISA).
 * @param {Array} data - Array of student records
 * @returns {Number} replicate count, or 0
 */
export function replicateCount(data) {
    return hasReplicateWeights(data) ? data[0].rep_wgts.length : 0;
}

/**
 * Generic BRR standard error for an arbitrary weighted statistic.
 *
 * @param {Array} data - Student records, each with a `rep_wgts` array
 * @param {Function} estimator - (records, weightFn) => Number, where weightFn(record)
 *        returns the weight to use for that record. The estimator must compute its
 *        statistic using weightFn so it can be re-run across replicates.
 * @param {Function} finalWeightFn - (record) => final weight W_FSTUWT
 * @param {Number} fay - Fay factor (default 0.5)
 * @returns {Object} { estimate, se, variance, nrep } or null if no replicate weights
 */
export function brrStatistic(data, estimator, finalWeightFn, fay = FAY_FACTOR) {
    if (!hasReplicateWeights(data)) return null;
    const G = replicateCount(data);

    const theta0 = estimator(data, finalWeightFn);

    let sumSq = 0;
    for (let r = 0; r < G; r++) {
        const thetaR = estimator(data, rec => rec.rep_wgts[r]);
        const diff = thetaR - theta0;
        sumSq += diff * diff;
    }

    const variance = sumSq / (G * Math.pow(1 - fay, 2));
    return { estimate: theta0, se: Math.sqrt(variance), variance, nrep: G };
}

// --- Estimators reusable across replicates -----------------------------------

/**
 * Weighted mean of `outcomeVar` using a supplied weight function.
 * @param {Array} records - Student records
 * @param {String} outcomeVar - Outcome field name
 * @returns {Function} (records, weightFn) => weighted mean
 */
export function weightedMeanEstimator(outcomeVar) {
    return (records, weightFn) => {
        let sw = 0, swx = 0;
        for (const rec of records) {
            const x = +rec[outcomeVar];
            if (!isFinite(x)) continue;
            const w = weightFn(rec);
            if (!(w > 0)) continue;
            sw += w; swx += w * x;
        }
        return sw > 0 ? swx / sw : NaN;
    };
}

/**
 * Weighted simple-regression slope of `outcomeVar` on `predictorVar`.
 * @param {String} outcomeVar - Outcome field name
 * @param {String} predictorVar - Predictor field name
 * @returns {Function} (records, weightFn) => weighted slope β
 */
export function weightedSlopeEstimator(outcomeVar, predictorVar) {
    return (records, weightFn) => {
        let sw = 0, swx = 0, swy = 0;
        const rows = [];
        for (const rec of records) {
            const y = +rec[outcomeVar];
            const x = +rec[predictorVar];
            if (!isFinite(y) || !isFinite(x)) continue;
            const w = weightFn(rec);
            if (!(w > 0)) continue;
            rows.push([x, y, w]); sw += w; swx += w * x; swy += w * y;
        }
        if (sw <= 0) return NaN;
        const mx = swx / sw, my = swy / sw;
        let num = 0, den = 0;
        for (const [x, y, w] of rows) { num += w * (x - mx) * (y - my); den += w * (x - mx) * (x - mx); }
        return den !== 0 ? num / den : NaN;
    };
}

/**
 * Final-weight accessor matching the app's getWeight() fallback rule.
 * @param {Object} rec - Student record
 * @returns {Number} W_FSTUWT (or 1 if missing/non-positive)
 */
export function finalStudentWeight(rec) {
    const v = rec.stu_wgt || rec.w_fstuwt || rec.W_FSTUWT;
    return (v && isFinite(+v) && +v > 0) ? +v : 1;
}

export default { hasReplicateWeights, replicateCount, brrStatistic,
                 weightedMeanEstimator, weightedSlopeEstimator, finalStudentWeight, FAY_FACTOR };
