/**
 * Full-Information Maximum Likelihood (FIML) for missing data.
 *
 * The rest of EduStrat handles item-missingness by listwise deletion: a student
 * with a missing ESCS value (or a missing score) is dropped entirely, even though
 * the rest of that student's record carries information. Under the common
 * missing-at-random (MAR) assumption this is inefficient and can be biased.
 *
 * FIML is the maximum-likelihood alternative. Treating the analysis variables as
 * jointly (multivariate) normal, it estimates the mean vector μ and covariance Σ
 * from ALL available data — every case contributes whatever it has observed — by
 * the Expectation–Maximisation (EM) algorithm of Little & Rubin. The regression of
 * the outcome on the predictors is then read off the estimated moments:
 *
 *     β = Σ_XX⁻¹ Σ_Xy ,   α = μ_y − β'μ_X .
 *
 * Standard errors come from the observed-data information matrix (the negative
 * numerical Hessian of the observed-data log-likelihood), propagated to the
 * coefficients by a numerical delta method. The whole procedure is deterministic,
 * so it is verified to high precision against an independent EM written in R
 * (pipeline/scripts/08-verify-fiml.R), and cross-checked against `mice` multiple
 * imputation for convergent validity.
 *
 * Scope and assumptions. FIML here assumes joint multivariate normality of the
 * analysis variables, so it is intended for continuous predictors (the ESCS index,
 * or parental education treated as a numeric ISCED level). Categorical controls
 * such as gender violate that assumption and are better handled by multiple
 * imputation; that is noted in the interface and left to a future extension.
 *
 * Author: Kevin Schoenholzer
 */

// --- Small, robust linear algebra (jStat is unreliable for some sizes) --------

/** Invert a square matrix by Gauss–Jordan elimination with partial pivoting. */
function matInv(A) {
    const n = A.length;
    const M = A.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
    for (let col = 0; col < n; col++) {
        let piv = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
        [M[col], M[piv]] = [M[piv], M[col]];
        const d = M[col][col] || 1e-300;
        for (let c = 0; c < 2 * n; c++) M[col][c] /= d;
        for (let r = 0; r < n; r++) {
            if (r === col) continue;
            const f = M[r][col];
            for (let c = 0; c < 2 * n; c++) M[r][c] -= f * M[col][c];
        }
    }
    return M.map(row => row.slice(n));
}

function subVec(v, idx) { return idx.map(i => v[i]); }
function subMat(A, rows, cols) { return rows.map(r => cols.map(c => A[r][c])); }
function matVec(A, x) { return A.map(row => row.reduce((s, v, j) => s + v * x[j], 0)); }
function matMat(A, B) {
    const n = A.length, m = B[0].length, p = B.length;
    const C = Array.from({ length: n }, () => new Array(m).fill(0));
    for (let i = 0; i < n; i++) for (let k = 0; k < p; k++) { const a = A[i][k]; for (let j = 0; j < m; j++) C[i][j] += a * B[k][j]; }
    return C;
}

// --- Weighting (matches the rule used across the analysis modules) ------------

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
        return isFinite(v) ? v : NaN;
    }
    const parse = (val) => {
        if (typeof val === 'number' && isFinite(val)) return val;
        const n = Number(val);
        if (isFinite(n)) return n;
        if (typeof val === 'string') {
            const u = val.toUpperCase().trim();
            if (u === 'NONE' || u === 'NA' || u === 'N/A' || u === '') return NaN;
            const m = u.match(/ISCED\s*(\d)/i);
            if (m) return parseInt(m[1], 10);
        }
        return NaN;
    };
    const mo = parse(record.mother_educ), fa = parse(record.father_educ);
    if (isFinite(mo) && isFinite(fa)) return Math.max(mo, fa);
    if (isFinite(mo)) return mo;
    if (isFinite(fa)) return fa;
    return NaN;
}

/**
 * Extract the analysis matrix Z (rows of variable vectors with NaN for missing)
 * and weights w. The first variable is the outcome; the rest are predictors.
 */
function extractMatrix(records, vars, weightType) {
    const Z = [], W = [];
    for (const rec of records) {
        const z = vars.map(v => (v.kind === 'outcome' || v.kind === 'numeric')
            ? (isFinite(+rec[v.name]) ? +rec[v.name] : NaN)
            : parsePredictorValue(rec, v.name));
        if (z.every(x => !isFinite(x))) continue; // nothing observed → no information
        Z.push(z);
        W.push(getWeight(rec, weightType));
    }
    return { Z, W };
}

// --- Observed-data weighted log-likelihood ------------------------------------

function normalLogPdf(x, mean, variance) {
    if (!(variance > 0)) return -1e300;
    const d = x - mean;
    return -0.5 * (Math.log(2 * Math.PI * variance) + d * d / variance);
}

function mvnLogPdf(x, mu, Sigma) {
    const k = x.length;
    if (k === 1) return normalLogPdf(x[0], mu[0], Sigma[0][0]);
    const inv = matInv(Sigma);
    // log|Sigma| via the same elimination used for inversion would be cleaner; for
    // the small k here, compute the determinant directly.
    const det = matDet(Sigma);
    if (!(det > 0)) return -1e300;
    const d = x.map((v, i) => v - mu[i]);
    const q = d.reduce((s, di, i) => s + di * matVec(inv, d)[i], 0);
    return -0.5 * (k * Math.log(2 * Math.PI) + Math.log(det) + q);
}

function matDet(A) {
    const n = A.length;
    const M = A.map(r => [...r]);
    let det = 1;
    for (let col = 0; col < n; col++) {
        let piv = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
        if (piv !== col) { [M[col], M[piv]] = [M[piv], M[col]]; det = -det; }
        const d = M[col][col];
        if (Math.abs(d) < 1e-300) return 0;
        det *= d;
        for (let r = col + 1; r < n; r++) {
            const f = M[r][col] / d;
            for (let c = col; c < n; c++) M[r][c] -= f * M[col][c];
        }
    }
    return det;
}

/** Weighted observed-data log-likelihood of the MVN with missing values. */
function observedLogLik(Z, W, mu, Sigma) {
    let ll = 0;
    for (let i = 0; i < Z.length; i++) {
        const obs = [];
        for (let j = 0; j < Z[i].length; j++) if (isFinite(Z[i][j])) obs.push(j);
        if (obs.length === 0) continue;
        const xo = subVec(Z[i], obs), muo = subVec(mu, obs), So = subMat(Sigma, obs, obs);
        ll += W[i] * mvnLogPdf(xo, muo, So);
    }
    return ll;
}

// --- EM for the multivariate normal with missing data -------------------------

function emMVN(Z, W, opts = {}) {
    const tol = opts.tol || 1e-10, maxIter = opts.maxIter || 1000;
    const p = Z[0].length;
    const Wsum = W.reduce((s, w) => s + w, 0);

    // Initialise from available-case moments.
    let mu = new Array(p).fill(0);
    for (let j = 0; j < p; j++) {
        let sw = 0, swx = 0;
        for (let i = 0; i < Z.length; i++) if (isFinite(Z[i][j])) { sw += W[i]; swx += W[i] * Z[i][j]; }
        mu[j] = sw > 0 ? swx / sw : 0;
    }
    let Sigma = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => {
        let sw = 0, s = 0;
        for (let i = 0; i < Z.length; i++) if (isFinite(Z[i][a]) && isFinite(Z[i][b])) {
            sw += W[i]; s += W[i] * (Z[i][a] - mu[a]) * (Z[i][b] - mu[b]);
        }
        return sw > 0 ? s / sw : (a === b ? 1 : 0);
    }));

    let iters = 0, prevLL = -Infinity;
    for (; iters < maxIter; iters++) {
        // E-step: accumulate weighted T1 = Σ w E[z], T2 = Σ w E[zz'].
        const T1 = new Array(p).fill(0);
        const T2 = Array.from({ length: p }, () => new Array(p).fill(0));
        for (let i = 0; i < Z.length; i++) {
            const obs = [], mis = [];
            for (let j = 0; j < p; j++) (isFinite(Z[i][j]) ? obs : mis).push(j);
            const zhat = Z[i].slice();
            const condCov = Array.from({ length: p }, () => new Array(p).fill(0));
            if (mis.length > 0 && obs.length > 0) {
                const Soo_inv = matInv(subMat(Sigma, obs, obs));
                const Smo = subMat(Sigma, mis, obs);
                const resid = obs.map(j => Z[i][j] - mu[j]);
                const beta = matMat(Smo, Soo_inv);              // |mis| x |obs|
                const adj = matVec(beta, resid);
                mis.forEach((j, r) => { zhat[j] = mu[j] + adj[r]; });
                // conditional covariance of missing given observed
                const Smm = subMat(Sigma, mis, mis);
                const Som = subMat(Sigma, obs, mis);
                const corr = matMat(beta, Som);                 // |mis| x |mis|
                mis.forEach((j, r) => mis.forEach((k, c) => { condCov[j][k] = Smm[r][c] - corr[r][c]; }));
            } else if (obs.length === 0) {
                mis.forEach(j => { zhat[j] = mu[j]; });
                mis.forEach(j => mis.forEach(k => { condCov[j][k] = Sigma[j][k]; }));
            }
            const w = W[i];
            for (let a = 0; a < p; a++) {
                T1[a] += w * zhat[a];
                for (let b = 0; b < p; b++) T2[a][b] += w * (zhat[a] * zhat[b] + condCov[a][b]);
            }
        }
        // M-step
        const newMu = T1.map(v => v / Wsum);
        const newSigma = Array.from({ length: p }, (_, a) =>
            Array.from({ length: p }, (_, b) => T2[a][b] / Wsum - newMu[a] * newMu[b]));
        mu = newMu; Sigma = newSigma;

        const ll = observedLogLik(Z, W, mu, Sigma);
        if (isFinite(ll) && Math.abs(ll - prevLL) < tol * (Math.abs(prevLL) + 1)) { iters++; prevLL = ll; break; }
        prevLL = ll;
    }
    return { mu, Sigma, iters, loglik: prevLL };
}

// --- Coefficients from the estimated moments ----------------------------------

function coefFromMoments(mu, Sigma, yIdx, xIdx) {
    const Sxx = subMat(Sigma, xIdx, xIdx);
    const Sxy = xIdx.map(i => Sigma[i][yIdx]);
    const beta = matVec(matInv(Sxx), Sxy);
    const alpha = mu[yIdx] - beta.reduce((s, b, k) => s + b * mu[xIdx[k]], 0);
    return [alpha, ...beta];
}

// --- Parameter packing for the numerical information matrix -------------------

function packTheta(mu, Sigma) {
    const p = mu.length, theta = [...mu];
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) theta.push(Sigma[a][b]);
    return theta;
}
function unpackTheta(theta, p) {
    const mu = theta.slice(0, p);
    const Sigma = Array.from({ length: p }, () => new Array(p).fill(0));
    let idx = p;
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) { Sigma[a][b] = Sigma[b][a] = theta[idx++]; }
    return { mu, Sigma };
}

/** Numerical Hessian of f at theta (central differences). */
function numHessian(f, theta) {
    const n = theta.length;
    const h = theta.map(t => 1e-4 * (Math.abs(t) + 1));
    const H = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
        const tpp = theta.slice(); tpp[i] += h[i]; tpp[j] += h[j];
        const tpm = theta.slice(); tpm[i] += h[i]; tpm[j] -= h[j];
        const tmp = theta.slice(); tmp[i] -= h[i]; tmp[j] += h[j];
        const tmm = theta.slice(); tmm[i] -= h[i]; tmm[j] -= h[j];
        const v = (f(tpp) - f(tpm) - f(tmp) + f(tmm)) / (4 * h[i] * h[j]);
        H[i][j] = H[j][i] = v;
    }
    return H;
}

/** Numerical Jacobian of a vector-valued g at theta (central differences). */
function numJacobian(g, theta, m) {
    const n = theta.length;
    const J = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
        const hj = 1e-5 * (Math.abs(theta[j]) + 1);
        const tp = theta.slice(); tp[j] += hj;
        const tm = theta.slice(); tm[j] -= hj;
        const gp = g(tp), gm = g(tm);
        for (let i = 0; i < m; i++) J[i][j] = (gp[i] - gm[i]) / (2 * hj);
    }
    return J;
}

// --- Public API ---------------------------------------------------------------

/**
 * FIML regression of `outcomeVar` on `predictorVar` (optionally additional numeric
 * predictors) under joint multivariate normality, estimated by weighted EM.
 *
 * @param {Array} records - student records
 * @param {String} outcomeVar - outcome field (e.g. 'math')
 * @param {String|Array} predictorVar - predictor field(s) ('escs' or 'parent_edu')
 * @param {String} weightType - 'student' | 'senate' | 'none'
 * @returns {Object} { coefficients:[α, β…], standardErrors, nUsed, nComplete,
 *                     iters, mu, Sigma, method } or null
 */
export function fimlRegression(records, outcomeVar, predictorVar, weightType = 'student') {
    const preds = Array.isArray(predictorVar) ? predictorVar : [predictorVar];
    const vars = [{ name: outcomeVar, kind: 'outcome' }, ...preds.map(n => ({ name: n, kind: 'predictor' }))];
    const p = vars.length;
    const { Z, W } = extractMatrix(records, vars, weightType);
    if (Z.length < p + 2) return null;

    // Normalise the survey weights to sum to the sample size. Scaling the weights by
    // a constant leaves the EM point estimates (μ, Σ, β) unchanged, but it puts the
    // weighted log-likelihood — and therefore the information matrix and the standard
    // errors — on the SAMPLE scale rather than the population scale. Without this the
    // raw survey weights (which sum to the population) would treat the analysis as if
    // it had millions of independent observations and collapse the SEs to near zero.
    // The resulting SE is model-based (SRS-like), matching the app's non-BRR errors.
    const wsum0 = W.reduce((s, w) => s + w, 0);
    const scale = wsum0 > 0 ? Z.length / wsum0 : 1;
    for (let i = 0; i < W.length; i++) W[i] *= scale;

    const nComplete = Z.filter(z => z.every(isFinite)).length;
    const fit = emMVN(Z, W);
    if (!fit.mu.every(isFinite)) return null;

    const yIdx = 0, xIdx = preds.map((_, k) => k + 1);
    const coefficients = coefFromMoments(fit.mu, fit.Sigma, yIdx, xIdx);

    // Standard errors: Cov(θ) = (−Hessian of observed log-lik)⁻¹, delta-method to β.
    let standardErrors = coefficients.map(() => NaN);
    try {
        const llFn = (theta) => { const { mu, Sigma } = unpackTheta(theta, p); return observedLogLik(Z, W, mu, Sigma); };
        const theta0 = packTheta(fit.mu, fit.Sigma);
        const H = numHessian(llFn, theta0);
        const covTheta = matInv(H.map(row => row.map(v => -v)));
        const gFn = (theta) => { const { mu, Sigma } = unpackTheta(theta, p); return coefFromMoments(mu, Sigma, yIdx, xIdx); };
        const J = numJacobian(gFn, theta0, coefficients.length);
        const covCoef = matMat(matMat(J, covTheta), J[0].map((_, c) => J.map(r => r[c]))); // J cov Jᵀ
        standardErrors = coefficients.map((_, i) => Math.sqrt(Math.max(covCoef[i][i], 0)));
    } catch (e) {
        // Leave SEs as NaN if the information matrix is singular.
    }

    return {
        coefficients,
        standardErrors,
        nUsed: Z.length,
        nComplete,
        iters: fit.iters,
        mu: fit.mu,
        Sigma: fit.Sigma,
        method: `FIML (EM, ${p}-variate normal, ${fit.iters} iters)`
    };
}

export default { fimlRegression };
