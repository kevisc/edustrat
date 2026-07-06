/**
 * Within-country trends verification harness — JavaScript side.
 *
 * Runs the shipped trends module (js/analysis/trends.js) on real PISA chunks and
 * writes trends-js-results.json. The R script 07-verify-trends.R reproduces the
 * per-cycle estimates and the two trend regressions independently (stats::lm with
 * inverse-variance weights and country fixed effects) on the same chunks and
 * compares. This file also runs a self-contained algebraic cross-check of the
 * precision-weighted slope so the harness fails loudly if fitTrend drifts.
 *
 * Usage:  node run-trends.mjs
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

const trends = await import(path.join(REPO, 'js/analysis/trends.js'));

const load = code => JSON.parse(fs.readFileSync(path.join(CHUNK_DIR, `${code}.json`), 'utf8')).students;
const CYCLES = [2000, 2003, 2006, 2009, 2012, 2015, 2018, 2022];
const loadCountry = c => CYCLES.flatMap(y => {
    const f = path.join(CHUNK_DIR, `${c}_${y}.json`);
    return fs.existsSync(f) ? load(`${c}_${y}`) : [];
});

const out = { generated: new Date().toISOString(), runs: [], crossChecks: [] };

// --- Single-country trends for FIN, all metrics ------------------------------
const finRecords = loadCountry('FIN');
for (const metric of ['mean', 'gradient', 'gini', 'gap']) {
    const a = trends.analyzeWithinCountryTrends(finRecords, {
        metric, outcomeVar: 'math', predictorVar: 'escs', weightType: 'student'
    });
    const fin = a.byCountry.FIN;
    out.runs.push({
        id: `FIN_math_${metric}`,
        metric,
        points: fin.points.map(p => ({ year: p.year, estimate: p.estimate, se: p.se, seMethod: p.seMethod, n: p.n })),
        trend: fin.trend
    });
}

// --- Multi-country FE panel (countries with replicate weights in 2015/18/22) --
const MULTI = ['FIN', 'USA', 'DEU', 'KOR', 'MEX'];
const multiRecords = MULTI.flatMap(loadCountry);
const panelAnalysis = trends.analyzeWithinCountryTrends(multiRecords, {
    metric: 'gradient', outcomeVar: 'math', predictorVar: 'escs', weightType: 'student'
});
out.runs.push({
    id: 'PANEL_gradient_math',
    metric: 'gradient',
    perCountryTrend: Object.fromEntries(
        Object.entries(panelAnalysis.byCountry).map(([c, v]) => [c, v.trend && {
            slopePerDecade: v.trend.slopePerDecade, se: v.trend.se, p: v.trend.p,
            weighting: v.trend.weighting, nCycles: v.trend.nCycles
        }])
    ),
    fePanel: panelAnalysis.fePanel
});

// --- Algebraic cross-check of the precision-weighted slope -------------------
// β1 = Σ w (t-tbar_w)(y-ybar_w) / Σ w (t-tbar_w)²,  w = 1/se², t = (year-2000)/10.
function manualWeightedSlope(points) {
    const pts = points.filter(p => isFinite(p.estimate) && isFinite(p.se) && p.se > 0);
    const w = pts.map(p => 1 / (p.se * p.se));
    const t = pts.map(p => (p.year - 2000) / 10);
    const y = pts.map(p => p.estimate);
    const W = w.reduce((s, v) => s + v, 0);
    const tb = t.reduce((s, v, i) => s + w[i] * v, 0) / W;
    const yb = y.reduce((s, v, i) => s + w[i] * v, 0) / W;
    let num = 0, den = 0;
    for (let i = 0; i < pts.length; i++) { num += w[i] * (t[i] - tb) * (y[i] - yb); den += w[i] * (t[i] - tb) * (t[i] - tb); }
    return num / den;
}

for (const metric of ['mean', 'gradient']) {
    const a = trends.analyzeWithinCountryTrends(finRecords, {
        metric, outcomeVar: 'math', predictorVar: 'escs', weightType: 'student'
    });
    const pts = a.byCountry.FIN.points;
    if (pts.every(p => isFinite(p.se) && p.se > 0)) {
        const fromModule = a.byCountry.FIN.trend.slopePerDecade;
        const manual = manualWeightedSlope(pts);
        const relDiff = Math.abs(fromModule - manual) / (Math.abs(manual) || 1);
        // 1e-6 tolerance: weightedOLS adds a 1e-10·tr(XtX) ridge for stability, so
        // the slope agrees with the ridge-free closed form to ~7–8 significant
        // figures rather than to machine precision (same effect documented for the
        // random-effects slope in VERIFICATION.md).
        out.crossChecks.push({ id: `FIN_${metric}_slope`, fromModule, manual, relDiff, pass: relDiff < 1e-6 });
    }
}

const outFile = path.join(__dirname, 'trends-js-results.json');
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));

// --- Console report ----------------------------------------------------------
console.log(`\nWrote ${out.runs.length} trend runs to ${outFile}\n`);
for (const r of out.runs.filter(r => r.points)) {
    console.log(`== ${r.id} ==`);
    for (const p of r.points) {
        const se = p.se != null ? p.se.toFixed(3) : '   — ';
        console.log(`   ${p.year}  est=${p.estimate.toFixed(3).padStart(9)}  se=${se.padStart(7)}  n=${String(p.n).padStart(5)}  [${p.seMethod}]`);
    }
    if (r.trend) {
        const se = r.trend.se != null ? r.trend.se.toFixed(3) : '—';
        const p = r.trend.p != null ? r.trend.p.toFixed(4) : '—';
        console.log(`   TREND: ${r.trend.slopePerDecade.toFixed(3)} /decade  (SE ${se}, p ${p}, ${r.trend.weighting}, ${r.trend.nCycles} cycles)\n`);
    }
}
const panel = out.runs.find(r => r.id === 'PANEL_gradient_math');
if (panel) {
    console.log('== PANEL gradient(math~escs): per-country within trends ==');
    for (const [c, t] of Object.entries(panel.perCountryTrend)) {
        if (t) console.log(`   ${c}: ${t.slopePerDecade.toFixed(3)}/decade (SE ${t.se != null ? t.se.toFixed(3) : '—'}, ${t.weighting}, ${t.nCycles} cy)`);
    }
    if (panel.fePanel) {
        const f = panel.fePanel;
        console.log(`   FE PANEL trend: ${f.slopePerDecade.toFixed(3)}/decade (SE ${f.se.toFixed(3)}, p ${f.p.toFixed(4)}, ${f.weighting}, ${f.nCountries} countries, ${f.nCells} cells, ref ${f.referenceCountry})\n`);
    }
}
console.log('== Algebraic cross-checks (precision-weighted slope) ==');
for (const c of out.crossChecks) {
    console.log(`   ${c.id}: module=${c.fromModule.toFixed(6)} manual=${c.manual.toFixed(6)} relDiff=${c.relDiff.toExponential(2)} ${c.pass ? 'PASS' : 'FAIL'}`);
}
const allPass = out.crossChecks.every(c => c.pass);
console.log(`\n${allPass ? 'All cross-checks PASS' : 'CROSS-CHECK FAILURE'}`);
process.exit(allPass ? 0 : 1);
