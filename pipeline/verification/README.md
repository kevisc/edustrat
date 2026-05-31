# Verification harness

This directory verifies EduStrat's client-side statistics against independent R
reference implementations on real PISA chunks. See the top-level
[`VERIFICATION.md`](../../VERIFICATION.md) for the full write-up and results.

## Layout

| File | Role |
|------|------|
| `run-js-reference.mjs` | Runs the app's analysis modules (`js/analysis/*`, `js/core/utils.js`) in Node against real chunks; writes `js-results.json`. |
| `run-brr.mjs` | Runs the app's BRR module (`js/analysis/brr.js`) on the replicate-weight chunks; writes `brr-js-results.json`. |
| `../scripts/04-verify-computations.R` | Independent R reference (`stats`, `plm`, `lmtest`, `car`) for point estimates and model statistics; compares and writes `verification-report.csv`. |
| `../scripts/06-verify-brr.R` | Independent R reference (direct Fay BRR + `intsvy`) for replicate-weight standard errors; writes `brr-verification-report.csv`. |
| `package.json` | Pins the two numeric libraries the browser loads from a CDN (`jstat@1.9.4`, `simple-statistics@7.8.0`). |

The Node side imports the **shipped** modules unchanged — the only globals provided
are the same `jStat` / `simple-statistics` the app loads in the browser — so the
harness tests the actual artifact, not a re-implementation.

## Run it

```bash
npm install
node run-js-reference.mjs
node run-brr.mjs
cd ../..
Rscript pipeline/scripts/04-verify-computations.R
Rscript pipeline/scripts/06-verify-brr.R
```

Expected: `83 / 83 checks passed` and `12 / 12 BRR checks passed`.

`node_modules/` is git-ignored; `npm install` recreates it from the pinned versions.
