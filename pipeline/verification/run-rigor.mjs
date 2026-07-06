/**
 * Rigor-ladder verification harness — JavaScript side.
 *
 * Runs the shipped modules for the Phase-5 estimators on real chunks (plus a
 * deterministic synthetic multi-PV dataset) and writes rigor-js-results.json.
 * The R script 09-verify-rigor.R reproduces each quantity independently:
 *   - Theil-T + within/between decomposition (definitional base R)
 *   - cluster-robust (school) SEs (sandwich::vcovCL, type = "HC1")
 *   - Oaxaca–Blinder threefold/twofold (base-R lm algebra)
 *   - plausible-value pooling by Rubin's rules (base R, synthetic data)
 *   - FE within/between R² (plm + the Stata-convention manual formula)
 *   - senate-weighted slope (lm with per-country rescaled weights)
 *
 * Usage:  node run-rigor.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jStat from 'jstat';
import * as ss from 'simple-statistics';

globalThis.jStat = jStat.jStat ?? jStat;
globalThis.ss = ss;
globalThis.window = globalThis;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const CHUNK_DIR = path.join(REPO, 'data', 'country-year');

const utils = await import(path.join(REPO, 'js/core/utils.js'));
const reg = await import(path.join(REPO, 'js/analysis/regression.js'));
const oax = await import(path.join(REPO, 'js/analysis/oaxaca.js'));
const pv = await import(path.join(REPO, 'js/analysis/pv-pooling.js'));

const load = c => JSON.parse(fs.readFileSync(path.join(CHUNK_DIR, `${c}.json`), 'utf8')).students;
const fin = load('FIN_2018');
const mex = load('MEX_2018');
const deu = load('DEU_2018');

const out = { generated: new Date().toISOString(), results: {} };

// ---- 1. Theil-T + decomposition ------------------------------------------------
{
    const vals = [], wts = [];
    for (const r of fin) { const v = +r.math; if (isFinite(v)) { vals.push(v); wts.push((+r.stu_wgt > 0) ? +r.stu_wgt : 1); } }
    out.results.theil_fin_math = utils.calculateTheil(vals, wts);

    const pooled = [...fin, ...mex];
    const v2 = [], w2 = [], g2 = [];
    for (const r of pooled) { const v = +r.math; if (isFinite(v)) { v2.push(v); w2.push((+r.stu_wgt > 0) ? +r.stu_wgt : 1); g2.push(r.country); } }
    const dec = utils.calculateTheilDecomposition(v2, g2, w2);
    out.results.theil_decomp = { total: dec.total, within: dec.within, between: dec.between };
}

// ---- 2. Cluster-robust (school) SEs --------------------------------------------
{
    const m = reg.runPooledOLS(fin, 'math', 'escs', [], 'student');
    out.results.cluster = {
        beta: m.coefficients, seModel: m.standardErrors,
        seCluster: m.standardErrorsCluster, nClusters: m.nClusters, nobs: m.nobs
    };
}

// ---- 3. Oaxaca–Blinder (FIN vs MEX, gender control) -----------------------------
{
    const d = oax.oaxacaDecomposition(fin, mex, 'math', 'escs', ['gender'], 'student');
    out.results.oaxaca = {
        gap: d.gap, meanA: d.meanA, meanB: d.meanB,
        endowments: d.threefold.endowments, coefficients: d.threefold.coefficients,
        interaction: d.threefold.interaction,
        explained: d.twofold.explained, unexplained: d.twofold.unexplained,
        identityGap: d.identityGap, nA: d.nA, nB: d.nB
    };
}

// ---- 4. PV pooling on deterministic synthetic data -------------------------------
{
    // Deterministic PRNG so JS and R operate on the identical dataset.
    const mulberry32 = a => () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rnd = mulberry32(42);
    const norm = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

    const N = 400, M = 5;
    const rows = [];
    for (let i = 0; i < N; i++) {
        const x = norm();
        const w = 0.5 + rnd();
        const theta = 500 + 25 * x + 40 * norm();     // latent proficiency
        const pvs = Array.from({ length: M }, () => theta + 15 * norm()); // measurement draws
        rows.push({ x, w, pvs });
    }
    // CSV for the R side
    const csv = ['x,w,' + Array.from({ length: M }, (_, m) => `pv${m + 1}`).join(',')]
        .concat(rows.map(r => [r.x, r.w, ...r.pvs].map(v => v.toFixed(10)).join(',')))
        .join('\n');
    fs.writeFileSync(path.join(__dirname, 'rigor-synthetic-pv.csv'), csv);

    // Per-PV weighted slope + its variance via the app's own weightedOLS.
    const estimator = (records, field) => {
        const y = records.map(r => r[field]);
        const X = records.map(r => [1, r.x]);
        const w = records.map(r => r.w);
        const fit = reg.weightedOLS(y, X, w);
        return { estimate: fit.beta[1], variance: fit.se[1] ** 2 };
    };
    const recs = rows.map(r => {
        const rec = { x: r.x, w: r.w };
        r.pvs.forEach((v, m) => { rec[`pv${m + 1}_math`] = v; });
        return rec;
    });
    const pooled = pv.poolOverPlausibleValues(recs, 'math', (records, f) => estimator(records, f));
    out.results.pvPooling = {
        estimate: pooled.estimate, se: pooled.se, within: pooled.within,
        between: pooled.between, df: pooled.df, m: pooled.m,
        perPV: pooled.perPV.map(p => p.estimate)
    };
}

// ---- 5. FE within/between R² (unweighted, for the plm comparison) ----------------
{
    const m = reg.runFixedEffects([...fin, ...mex, ...deu], 'math', 'escs', [], 'none');
    out.results.feR2 = { r2Within: m.r2Within, r2Between: m.r2Between };
}

// ---- 6. Senate-weighted slope -----------------------------------------------------
{
    const pooled = [...fin, ...mex];
    const byCY = {};
    for (const r of pooled) { const k = `${r.country}_${r.year}`; (byCY[k] = byCY[k] || []).push(r); }
    for (const k of Object.keys(byCY)) {
        let s = 0;
        for (const r of byCY[k]) { const w = +r.stu_wgt; if (isFinite(w) && w > 0) s += w; }
        const f = 5000 / s;
        for (const r of byCY[k]) { const w = +r.stu_wgt; r.w_fsenwt = (isFinite(w) && w > 0) ? w * f : 1; }
    }
    const m = reg.runPooledOLS(pooled, 'math', 'escs', [], 'senate');
    out.results.senate = { beta: m.coefficients[1], se: m.standardErrors[1], nobs: m.nobs };
}

const outFile = path.join(__dirname, 'rigor-js-results.json');
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(`Wrote rigor results to ${outFile}`);
console.log(JSON.stringify(out.results, (k, v) => (typeof v === 'number' ? +v.toFixed(8) : v), 2).slice(0, 2200));
