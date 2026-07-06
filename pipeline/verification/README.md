# Verification harness

This directory verifies EduStrat's client-side statistics against independent R
reference implementations on real PISA chunks. See the top-level
[`VERIFICATION.md`](../../VERIFICATION.md) for the full write-up and results.

## Layout

| File | Role |
|------|------|
| `run-js-reference.mjs` | Runs the app's analysis modules (`js/analysis/*`, `js/core/utils.js`) in Node against real chunks; writes `js-results.json`. |
| `run-brr.mjs` | Runs the app's BRR module (`js/analysis/brr.js`) on the replicate-weight chunks; writes `brr-js-results.json`. |
| `run-trends.mjs` | Runs the app's within-country trends module (`js/analysis/trends.js`) on real chunks; writes `trends-js-results.json` (per-cycle estimates + per-country and fixed-effects-panel trends). |
| `run-fiml.mjs` | Runs the app's FIML module (`js/analysis/fiml.js`) on real chunks; writes `fiml-js-results.json` (EM point estimates + information-matrix standard errors). |
| `run-rigor.mjs` | Runs the Theil (+decomposition), school-clustered SE, Oaxaca–Blinder, PV-pooling, panel-R² and senate-weight code on real chunks (+ deterministic synthetic PVs); writes `rigor-js-results.json`. |
| `run-rcode.mjs` | Tests the "Show the R" generator (`js/analysis/r-code-gen.js`): structural checks, expected-output honesty, and executes one generated snippet in R end-to-end. Self-contained (needs Rscript). |
| `../scripts/04-verify-computations.R` | Independent R reference (`stats`, `plm`, `lmtest`, `car`) for point estimates and model statistics; compares and writes `verification-report.csv`. |
| `../scripts/06-verify-brr.R` | Independent R reference (direct Fay BRR + `intsvy`) for replicate-weight standard errors; writes `brr-verification-report.csv`. |
| `../scripts/07-verify-trends.R` | Independent R reference (`stats::lm`) for the per-cycle estimates and both trend regressions; writes `trends-verification-report.csv`. |
| `../scripts/08-verify-fiml.R` | Independent base-R EM + `mice` cross-check for the FIML missing-data estimator; writes `fiml-verification-report.csv`. |
| `../scripts/09-verify-rigor.R` | Independent references for the rigor ladder: definitional Theil, `sandwich::vcovCL` cluster SEs, base-R Oaxaca, base-R Rubin pooling, `plm` R²; writes `rigor-verification-report.csv`. |
| `package.json` | Pins the two numeric libraries the browser loads from a CDN (`jstat@1.9.4`, `simple-statistics@7.8.0`). |

The Node side imports the **shipped** modules unchanged — the only globals provided
are the same `jStat` / `simple-statistics` the app loads in the browser — so the
harness tests the actual artifact, not a re-implementation.

## Run it

```bash
npm install
node run-js-reference.mjs
node run-brr.mjs
node run-trends.mjs
node run-fiml.mjs
node run-rigor.mjs
node run-rcode.mjs
cd ../..
Rscript pipeline/scripts/04-verify-computations.R
Rscript pipeline/scripts/06-verify-brr.R
Rscript pipeline/scripts/07-verify-trends.R
Rscript pipeline/scripts/08-verify-fiml.R
Rscript pipeline/scripts/09-verify-rigor.R
```

Expected: `83 / 83 checks passed`, `12 / 12 BRR checks passed`, `38 / 38 checks passed` (trends), `18 / 18 checks passed` (FIML; requires the `mice` R package), `23 / 23 rigor checks passed` (requires `sandwich` and `plm`), and `19 / 19 Show-the-R checks passed` (run-rcode.mjs runs its own R step).

`node_modules/` is git-ignored; `npm install` recreates it from the pinned versions.
