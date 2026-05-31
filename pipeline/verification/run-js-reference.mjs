/**
 * EduStrat verification harness — JavaScript side.
 *
 * Loads the SAME analysis modules the browser uses (js/analysis/*, js/core/utils.js)
 * and runs them against real PISA country-year chunks. Results are written to
 * js-results.json, which the R script (04-verify-computations.R) reads and compares
 * against independent reference implementations computed in R.
 *
 * The point is to test the shipped artifact itself, not a reimplementation: the only
 * shims provided are the two numeric libraries the app loads from a CDN at the same
 * pinned versions (jStat 1.9.4, simple-statistics 7.8.0).
 *
 * Usage:  node run-js-reference.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jStat from 'jstat';
import * as ss from 'simple-statistics';

// --- Provide the globals the app expects from its <script> tags --------------
// The modules reference bare `jStat` / `ss` and `window.jStat` at call time.
globalThis.jStat = jStat.jStat ?? jStat;        // jstat npm exports { jStat }
globalThis.ss = ss;
globalThis.window = globalThis;                  // utils.tTestPValue checks window.jStat

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const CHUNK_DIR = path.join(REPO, 'data', 'country-year');

// --- Import the real app modules ---------------------------------------------
const descriptive = await import(path.join(REPO, 'js/analysis/descriptive.js'));
const decomposition = await import(path.join(REPO, 'js/analysis/decomposition.js'));
const regression = await import(path.join(REPO, 'js/analysis/regression.js'));
const diagnostics = await import(path.join(REPO, 'js/analysis/diagnostics.js'));

// --- Load chunks exactly as the data-loader delivers them --------------------
function loadChunk(code) {
    const file = path.join(CHUNK_DIR, `${code}.json`);
    const chunk = JSON.parse(fs.readFileSync(file, 'utf8'));
    return chunk.students; // array of student records, same shape the app analyses
}
function loadDataset(codes) {
    return codes.flatMap(loadChunk);
}

// Datasets: one single country-year, one multi-country pool (for FE/RE/decomp).
const SINGLE = ['FIN_2018'];
const MULTI = ['FIN_2018', 'USA_2018', 'DEU_2018', 'KOR_2018', 'MEX_2018'];

const singleData = loadDataset(SINGLE);
const multiData = loadDataset(MULTI);

const results = { generated: new Date().toISOString(), datasets: { SINGLE, MULTI }, runs: [] };
const add = (id, method, config, result) => results.runs.push({ id, method, config, result });

// --- Descriptive statistics + inequality (single country-year) ---------------
for (const outcome of ['math', 'reading', 'science']) {
    for (const weightType of ['student', 'none']) {
        const d = descriptive.calculateDescriptiveStats(singleData, outcome, weightType);
        add(`desc_${outcome}_${weightType}`, 'descriptive', { dataset: 'SINGLE', outcome, weightType }, d);

        const ineq = descriptive.calculateInequalityMeasures(singleData, outcome, weightType);
        add(`ineq_${outcome}_${weightType}`, 'inequality', { dataset: 'SINGLE', outcome, weightType }, ineq);
    }
}

// --- ESCS gradient + achievement gap (single) --------------------------------
for (const weightType of ['student', 'none']) {
    const grad = descriptive.calculateSESGradient(singleData, 'math', 'escs', weightType);
    add(`grad_${weightType}`, 'gradient', { dataset: 'SINGLE', outcome: 'math', predictor: 'escs', weightType }, { beta: grad });

    const gap = descriptive.calculateAchievementGap(singleData, 'math', 'escs', weightType);
    add(`gap_${weightType}`, 'achievement_gap', { dataset: 'SINGLE', outcome: 'math', sesVar: 'escs', weightType }, gap);

    const dgap = decomposition.decomposeAchievementGap(singleData, 'math', 'escs', weightType);
    add(`dgap_${weightType}`, 'decompose_gap', { dataset: 'SINGLE', outcome: 'math', sesVar: 'escs', weightType }, dgap);
}

// --- Variance decomposition / ICC (multi-country) ----------------------------
for (const weightType of ['student', 'none']) {
    const vd = decomposition.calculateVarianceDecomposition(multiData, 'math', null, weightType);
    add(`vardecomp_${weightType}`, 'variance_decomposition', { dataset: 'MULTI', outcome: 'math', weightType }, vd);
}

// --- Pooled OLS, with and without a gender control (single & multi) ----------
function packModel(m) {
    if (!m) return null;
    return {
        variableNames: m.variableNames,
        coefficients: m.coefficients,
        standardErrors: m.standardErrors,
        tStatistics: m.tStatistics,
        pValues: m.pValues,
        r2: m.r2, adjR2: m.adjR2, aic: m.aic, bic: m.bic,
        nobs: m.nobs, df: m.df, ngroups: m.ngroups,
        rho: m.rho ?? null, icc: m.icc ?? null
    };
}

for (const [dsName, data] of [['SINGLE', singleData], ['MULTI', multiData]]) {
    for (const controls of [[], ['gender']]) {
        const m = regression.runPooledOLS(data, 'math', 'escs', controls, 'student');
        add(`ols_${dsName}_${controls.join('+') || 'none'}`, 'pooled_ols',
            { dataset: dsName, outcome: 'math', predictor: 'escs', controls, weightType: 'student' }, packModel(m));
    }
}

// --- Fixed effects (multi-country), weighted and unweighted ------------------
for (const weightType of ['student', 'none']) {
    const fe = regression.runFixedEffects(multiData, 'math', 'escs', [], weightType);
    add(`fe_${weightType}`, 'fixed_effects',
        { dataset: 'MULTI', outcome: 'math', predictor: 'escs', controls: [], weightType }, packModel(fe));
}

// --- Random effects (multi-country), unweighted matches plm swar -------------
for (const weightType of ['none', 'student']) {
    const re = regression.runRandomEffects(multiData, 'math', 'escs', [], weightType);
    add(`re_${weightType}`, 'random_effects',
        { dataset: 'MULTI', outcome: 'math', predictor: 'escs', controls: [], weightType }, packModel(re));
}

// --- Hausman test (FE vs RE), unweighted -------------------------------------
{
    const fe = regression.runFixedEffects(multiData, 'math', 'escs', [], 'none');
    const re = regression.runRandomEffects(multiData, 'math', 'escs', [], 'none');
    const h = diagnostics.hausmanTest(fe, re, 'escs');
    add('hausman_none', 'hausman', { dataset: 'MULTI', outcome: 'math', predictor: 'escs', weightType: 'none' }, h);
}

// --- Diagnostics on a pooled OLS: BP, VIF, Cook's (single, unweighted) -------
// Diagnostics reference matching is cleanest unweighted; build the design matrix
// the app builds and run the app's diagnostic functions on it.
{
    const dm = regression.buildDesignMatrix(singleData, 'math', 'escs', { controls: ['gender'] }, 'none');
    const model = regression.runPooledOLS(singleData, 'math', 'escs', ['gender'], 'none');

    const bp = diagnostics.breuschPaganTest(model, dm.X);
    add('bp_single', 'breusch_pagan', { dataset: 'SINGLE', outcome: 'math', predictor: 'escs', controls: ['gender'], weightType: 'none' }, bp);

    const vif = diagnostics.calculateVIF(dm.X, dm.varNames);
    add('vif_single', 'vif', { dataset: 'SINGLE', outcome: 'math', predictor: 'escs', controls: ['gender'], weightType: 'none' }, vif);

    const cooks = diagnostics.calculateCooksDistance(model, dm.X);
    add('cooks_single', 'cooks_distance',
        { dataset: 'SINGLE', outcome: 'math', predictor: 'escs', controls: ['gender'], weightType: 'none' },
        cooks ? { nInfluential: cooks.nInfluential, threshold: cooks.threshold,
                  // summarise the distance vector so the JSON stays small but checkable
                  sum: cooks.distances.reduce((a, b) => a + b, 0),
                  max: Math.max(...cooks.distances),
                  first10: cooks.distances.slice(0, 10) } : null);
}

const outFile = path.join(__dirname, 'js-results.json');
fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`Wrote ${results.runs.length} JS runs to ${outFile}`);
