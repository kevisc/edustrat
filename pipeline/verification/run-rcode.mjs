/**
 * Show-the-R verification harness.
 *
 * Exercises js/analysis/r-code-gen.js against real fitted models and checks:
 *   1. structural: each generated snippet contains the verified R call it claims;
 *   2. honesty: the "expected output" numbers are exactly the model object's;
 *   3. end-to-end: a generated snippet (chunk data-source variant) is executed in
 *      R and its coefficient/SE reproduce the app's numbers.
 *
 * Usage:  node run-rcode.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import jStat from 'jstat';
import * as ss from 'simple-statistics';

globalThis.jStat = jStat.jStat ?? jStat;
globalThis.ss = ss;
globalThis.window = globalThis;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const CHUNK_DIR = path.join(REPO, 'data', 'country-year');

const reg = await import(path.join(REPO, 'js/analysis/regression.js'));
const fiml = await import(path.join(REPO, 'js/analysis/fiml.js'));
const trends = await import(path.join(REPO, 'js/analysis/trends.js'));
const decomp = await import(path.join(REPO, 'js/analysis/decomposition.js'));
const desc = await import(path.join(REPO, 'js/analysis/descriptive.js'));
const gen = await import(path.join(REPO, 'js/analysis/r-code-gen.js'));

const load = c => JSON.parse(fs.readFileSync(path.join(CHUNK_DIR, `${c}.json`), 'utf8')).students;
const CODES = ['FIN_2018', 'MEX_2018'];
const data = CODES.flatMap(load);

const spec = {
    countries: ['FIN', 'MEX'], years: [2018],
    outcomeVar: 'math', predictorVar: 'escs', weightType: 'student',
    controls: [], dataSource: 'learningtower'
};

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
    console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
    cond ? pass++ : fail++;
};

// ---- 1+2: structural + honesty checks per generator --------------------------

console.log('== Regression (pooled OLS) ==');
const ols = reg.runPooledOLS(data, 'math', 'escs', [], 'student');
const pOls = gen.generateRegressionCode(ols, spec);
check('code contains weighted lm call', /lm\(math ~ escs, data = student, weights = stu_wgt\)/.test(pOls.code));
check('code loads learningtower', /library\(learningtower\)/.test(pOls.code));
check('expected output carries the model beta', pOls.expectedOutput.includes(ols.coefficients[1].toFixed(3)));
check('expected output carries the model R2', pOls.expectedOutput.includes(ols.r2.toFixed(3)));
check('notation carries live beta', pOls.notation.includes(ols.coefficients[1].toFixed(2)));

console.log('== Regression (fixed effects) ==');
const fe = reg.runFixedEffects(data, 'math', 'escs', [], 'student');
const pFe = gen.generateRegressionCode(fe, spec);
check('FE code adds factor(country)', /factor\(country\)/.test(pFe.code));
check('FE expected output carries beta', pFe.expectedOutput.includes(fe.coefficients[1].toFixed(3)));

console.log('== Regression (random effects) ==');
const re = reg.runRandomEffects(data, 'math', 'escs', [], 'student');
const pRe = gen.generateRegressionCode(re, spec);
check('RE code uses plm swar', /plm\(/.test(pRe.code) && /random\.method = "swar"/.test(pRe.code));
check('RE carries honesty note about weighted RE', /no weighted random-effects|no exact plm equivalent/i.test(pRe.code + pRe.note));

console.log('== FIML ==');
const f = fiml.fimlRegression(data, 'math', 'escs', 'student');
const pF = gen.generateFimlCode(ols, f, spec);
check('FIML code references mice convergent check', /library\(mice\)/.test(pF.code));
check('FIML expected output carries both betas',
    pF.expectedOutput.includes(ols.coefficients[1].toFixed(3)) && pF.expectedOutput.includes(f.coefficients[1].toFixed(3)));

console.log('== Trends ==');
const multiTrend = ['FIN', 'MEX'].flatMap(c => [2015, 2018, 2022].flatMap(y => {
    const file = path.join(CHUNK_DIR, `${c}_${y}.json`);
    return fs.existsSync(file) ? load(`${c}_${y}`) : [];
}));
const tr = trends.analyzeWithinCountryTrends(multiTrend, { metric: 'gradient', outcomeVar: 'math', predictorVar: 'escs', weightType: 'student' });
const pT = gen.generateTrendsCode(tr, spec);
check('trends code fits precision-weighted trend', /weights = 1\/se\^2/.test(pT.code));
check('trends code fits FE panel', /factor\(country\), data = cells/.test(pT.code));
check('trends expected output carries FIN slope', pT.expectedOutput.includes(tr.byCountry.FIN.trend.slopePerDecade.toFixed(3)));

console.log('== Gap ==');
const gap = decomp.decomposeAchievementGap(data, 'math', 'escs', 'student');
const pG = gen.generateGapCode(gap, spec);
check('gap code computes weighted quartiles', /wq <- function/.test(pG.code));
check('gap expected output carries the gap', pG.expectedOutput.includes(gap.gap_q4_q1.toFixed(1)));

console.log('== Overview ==');
const d1 = desc.calculateDescriptiveStats(data, 'math', 'student');
const i1 = desc.calculateInequalityMeasures(data, 'math', 'student');
const g1 = desc.calculateSESGradient(data, 'math', 'escs', 'student');
const pO = gen.generateOverviewCode({ mean: d1.mean, gini: i1.gini, gradient: g1 }, spec);
check('overview code has the covariance-form Gini', /gini_w <- function/.test(pO.code));
check('overview expected output carries the mean', pO.expectedOutput.includes(d1.mean.toFixed(2)));

// ---- 3: end-to-end — run a generated snippet in R -----------------------------

console.log('== End-to-end: execute generated OLS snippet (chunk variant) in R ==');
const chunkSpec = { ...spec, dataSource: 'chunk', chunkDir: CHUNK_DIR };
const pChunk = gen.generateRegressionCode(ols, chunkSpec);
const script = pChunk.code + `
cat(sprintf("BETA=%.10f\\nSE=%.10f\\n", coef(m)["escs"], summary(m)$coefficients["escs", 2]))
`;
const scriptFile = path.join(__dirname, 'rcode-e2e.R');
fs.writeFileSync(scriptFile, script);
let e2eOk = false;
try {
    const out = execFileSync('Rscript', [scriptFile], { encoding: 'utf8', timeout: 180000 });
    const beta = parseFloat(out.match(/BETA=([-\d.]+)/)?.[1]);
    const se = parseFloat(out.match(/SE=([-\d.]+)/)?.[1]);
    const relB = Math.abs(beta - ols.coefficients[1]) / Math.abs(ols.coefficients[1]);
    const relS = Math.abs(se - ols.standardErrors[1]) / Math.abs(ols.standardErrors[1]);
    e2eOk = relB < 1e-6 && relS < 1e-6;
    check('generated snippet runs in R and reproduces beta+SE', e2eOk,
        `R beta=${beta?.toFixed(6)} vs app ${ols.coefficients[1].toFixed(6)} (rel ${relB?.toExponential(1)}), SE rel ${relS?.toExponential(1)}`);
} catch (e) {
    check('generated snippet runs in R and reproduces beta+SE', false, e.message.slice(0, 200));
}

console.log(`\n${pass} / ${pass + fail} Show-the-R checks passed.`);
process.exit(fail === 0 ? 0 : 1);
