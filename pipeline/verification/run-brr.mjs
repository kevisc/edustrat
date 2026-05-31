/**
 * BRR verification harness — JavaScript side.
 *
 * Runs the application's own BRR module (js/analysis/brr.js) against the
 * replicate-weight chunks and writes brr-js-results.json. The R script
 * 06-verify-brr.R reproduces the Fay BRR variance independently (and cross-checks
 * against intsvy) on the same chunks and compares.
 *
 * Usage:  node run-brr.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const CHUNK_DIR = path.join(REPO, 'data', 'country-year');

const brr = await import(path.join(REPO, 'js/analysis/brr.js'));

const load = code => JSON.parse(fs.readFileSync(path.join(CHUNK_DIR, `${code}.json`), 'utf8')).students;
const SINGLE = ['FIN_2018'];
const MULTI = ['FIN_2018', 'USA_2018', 'DEU_2018', 'KOR_2018', 'MEX_2018'];
const CYCLES = ['FIN_2015', 'FIN_2018', 'FIN_2022']; // robustness of BRR across PISA cycles
const singleData = SINGLE.flatMap(load);
const multiData = MULTI.flatMap(load);

const out = { generated: new Date().toISOString(), datasets: { SINGLE, MULTI, CYCLES }, runs: [] };
const fw = brr.finalStudentWeight;

function add(id, dataset, target, data, estimator) {
    const r = brr.brrStatistic(data, estimator, fw);
    out.runs.push({ id, dataset, target, estimate: r.estimate, se: r.se, variance: r.variance, nrep: r.nrep });
}

add('brr_mean_math_SINGLE', 'SINGLE', 'mean(math)', singleData, brr.weightedMeanEstimator('math'));
add('brr_mean_escs_SINGLE', 'SINGLE', 'mean(escs)', singleData, brr.weightedMeanEstimator('escs'));
add('brr_slope_SINGLE', 'SINGLE', 'slope(math~escs)', singleData, brr.weightedSlopeEstimator('math', 'escs'));
add('brr_mean_math_MULTI', 'MULTI', 'mean(math)', multiData, brr.weightedMeanEstimator('math'));
add('brr_slope_MULTI', 'MULTI', 'slope(math~escs)', multiData, brr.weightedSlopeEstimator('math', 'escs'));

// Robustness across cycles: same country (FIN), BRR mean + slope for 2015/2018/2022.
for (const code of CYCLES) {
    const d = load(code);
    add(`brr_mean_math_${code}`, code, 'mean(math)', d, brr.weightedMeanEstimator('math'));
    add(`brr_slope_${code}`, code, 'slope(math~escs)', d, brr.weightedSlopeEstimator('math', 'escs'));
}

const outFile = path.join(__dirname, 'brr-js-results.json');
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(`Wrote ${out.runs.length} BRR runs to ${outFile}`);
for (const r of out.runs) console.log(`  ${r.id.padEnd(24)} est=${r.estimate.toFixed(4)} se=${r.se.toFixed(4)} (G=${r.nrep})`);
