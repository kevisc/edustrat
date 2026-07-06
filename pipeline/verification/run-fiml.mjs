/**
 * FIML verification harness — JavaScript side.
 *
 * Runs the shipped FIML module (js/analysis/fiml.js) on real PISA chunks and writes
 * fiml-js-results.json. The R script 08-verify-fiml.R reproduces the EM for the
 * multivariate normal with missing data independently in base R (point estimates +
 * numerical-Hessian standard errors) and cross-checks against `mice` multiple
 * imputation for convergent validity.
 *
 * Usage:  node run-fiml.mjs
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

const fiml = await import(path.join(REPO, 'js/analysis/fiml.js'));
const load = code => JSON.parse(fs.readFileSync(path.join(CHUNK_DIR, `${code}.json`), 'utf8')).students;

const DATASETS = ['FIN_2018', 'USA_2018', 'MEX_2018'];
const PREDICTORS = ['escs', 'parent_edu'];

const out = { generated: new Date().toISOString(), runs: [] };
for (const code of DATASETS) {
    const d = load(code);
    for (const pred of PREDICTORS) {
        const f = fiml.fimlRegression(d, 'math', pred, 'student');
        out.runs.push({
            id: `${code}_math_${pred}`,
            dataset: code, outcome: 'math', predictor: pred, weightType: 'student',
            alpha: f.coefficients[0], beta: f.coefficients[1],
            se_alpha: f.standardErrors[0], se_beta: f.standardErrors[1],
            mu: f.mu, Sigma: f.Sigma,
            nUsed: f.nUsed, nComplete: f.nComplete, iters: f.iters
        });
    }
}

const outFile = path.join(__dirname, 'fiml-js-results.json');
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(`Wrote ${out.runs.length} FIML runs to ${outFile}\n`);
for (const r of out.runs) {
    console.log(`  ${r.id.padEnd(22)} beta=${r.beta.toFixed(4)} se=${r.se_beta.toFixed(4)}  nUsed=${r.nUsed} nComplete=${r.nComplete} (it=${r.iters})`);
}
