# Verifying EduStrat's statistical computations against R

EduStrat performs every statistical computation **client-side in JavaScript** so
that students can analyse PISA microdata in a browser without installing R, Stata,
or Python. A reasonable question follows immediately: *can these in-browser
estimates be trusted?* This document describes how we answer that question, and
records the result.

The short version: **every estimator the application reports is checked, on real
PISA data, against an independent reference implementation in R built from
peer-reviewed packages (`stats`, `plm`, `lmtest`, `car`, `intsvy`).** Three harnesses
run: 83 checks on the point estimates and model-based statistics, 21 checks on the
design-correct (BRR replicate-weight) standard errors across three PISA cycles, and a
headless-browser smoke-test that runs the app in real Chrome. All pass; the great
majority of numerical checks agree with R to between 10 and 14 significant figures,
and the documented exceptions are listed below.

This harness is the supervised, reproducible core of the project: the JavaScript
artifact is treated as untrusted and is held to the output of established
statistical software.

---

## How the harness works

Verification is deliberately *end-to-end* and tests the **shipped artifact**, not a
re-implementation of it:

1. **`pipeline/verification/run-js-reference.mjs`** imports the exact analysis
   modules the browser loads (`js/analysis/*.js`, `js/core/utils.js`) into Node.
   The only shims provided are the two numeric libraries the app already loads
   from a CDN, pinned to the same versions (`jstat@1.9.4`,
   `simple-statistics@7.8.0`). It runs the app's functions against real
   country–year chunks and writes the results to `js-results.json`.

2. **`pipeline/scripts/04-verify-computations.R`** (and **`06-verify-brr.R`**) read the
   *same* chunk files, re-compute every quantity independently in R, read the JS result
   files, and compare term by term, writing machine-readable CSV reports and a pass/fail
   summary.

3. **`pipeline/verification/run-browser-check.mjs`** loads the deployed page in headless
   Chrome (via `puppeteer-core`), confirms it loads with no console errors, runs the
   actual analysis and visualization modules in-browser against a real chunk, and asserts
   that the rendered regression table reports BRR standard errors. This checks the
   artifact as users actually run it, not only as Node imports it.

Because both sides read the identical JSON the application serves, any discrepancy
is attributable to the computation, not to data handling. The R side replicates
the app's documented inclusion rules (finite outcome, non-missing predictor,
`stu_wgt > 0` else fall back to 1, `female = 1` gender coding).

### Reproducing it

```bash
# 1. run the application's own code in Node
cd pipeline/verification
npm install            # jstat@1.9.4, simple-statistics@7.8.0
node run-js-reference.mjs

# 2. compute the independent R reference and compare
node run-brr.mjs                                       # -> brr-js-results.json
node run-browser-check.mjs                            # runs the app in real Chrome
cd ../..
Rscript pipeline/scripts/04-verify-computations.R     # point estimates & model stats
Rscript pipeline/scripts/06-verify-brr.R              # BRR replicate-weight std. errors
```

R package requirements: `jsonlite`, `plm`, `lmtest`, `car`, `intsvy` (all on CRAN).
The browser check additionally needs `puppeteer-core` (installed by `npm install`) and
a local Chrome/Chromium; set `CHROME_PATH` to override the executable location.

### Test data

| Dataset  | Chunks                                              | Used for |
|----------|-----------------------------------------------------|----------|
| `SINGLE` | `FIN_2018`                                          | descriptives, inequality, gradient, gap, diagnostics |
| `MULTI`  | `FIN_2018, USA_2018, DEU_2018, KOR_2018, MEX_2018`  | variance decomposition, pooled OLS, fixed/random effects, Hausman |

---

## Results

All 83 checks pass. Maximum relative difference between the JavaScript app and the
R reference, by method:

| Method | JS function | R reference | Max. rel. diff. |
|---|---|---|---|
| Weighted mean, SD, percentiles | `descriptive.calculateDescriptiveStats` | definitional weighted estimators | `0` (exact) |
| Gini, coefficient of variation | `utils.calculateGini` | covariance-form weighted Gini | `3.8e-14` |
| ESCS gradient (weighted slope) | `descriptive.calculateSESGradient` | weighted covariance / variance | `0` (exact) |
| Q4–Q1 achievement gap | `descriptive.calculateAchievementGap` | weighted quartile means | `0` (exact) |
| Variance decomposition / ICC | `decomposition.calculateVarianceDecomposition` | definitional between/within | `0` (exact) |
| Pooled OLS (survey-weighted) | `regression.runPooledOLS` | `stats::lm(weights=)` | `1.1e-9` |
| Fixed effects (country LSDV) | `regression.runFixedEffects` | `stats::lm(y ~ x + factor(country))` | `3.6e-10` |
| Random effects (Swamy–Arora) | `regression.runRandomEffects` | `plm(model="random", random.method="swar")` | `9.4e-7` |
| Hausman test | `diagnostics.hausmanTest` | `plm::phtest` | `1.9e-3` † |
| Breusch–Pagan (studentized) | `diagnostics.breuschPaganTest` | `lmtest::bptest` | `2.9e-10` |
| Variance inflation factors | `diagnostics.calculateVIF` | `car::vif` | `3.4e-14` |
| Cook's distance | `diagnostics.calculateCooksDistance` | `stats::cooks.distance` | `8.8e-10` |

Checked quantities include point estimates, standard errors, *t*-statistics, R²,
test statistics, and degrees of freedom — not only the headline coefficients.

† See the note on the Hausman test below.

---

## Two estimators that warranted closer attention

### Random effects — verified against `plm`'s Swamy–Arora

EduStrat estimates the random-effects model by feasible GLS with **residual-based
Swamy–Arora variance components**: the idiosyncratic variance σ²_ν from the within
(fixed-effects) residuals and the group variance σ²_μ from the between
(group-means) residuals, followed by a group-specific quasi-demeaning transform.
On unweighted data this reproduces `plm(model = "random", random.method = "swar")`:
the ESCS slope agrees to **9.4e-7** and its standard error to **2e-7**.

`plm` estimates σ²_μ for unbalanced panels with a trace-corrected moment estimator;
EduStrat uses the (citable) residual-mean-square form. For the large within-group
sample sizes typical of PISA the two differ only in the 3rd–4th significant figure
of σ²_μ, with negligible effect on the GLS coefficients, as the agreement above
shows.

When survey weights are applied, the random-effects estimator is a **design-weighted
extension** of Swamy–Arora; it has no exact counterpart in `plm` (which does not
take sampling weights) and is therefore not benchmarked against it. The unweighted
path is the one verified against `plm`.

### Hausman test — correct formula, inherently sensitive statistic

The Hausman statistic is `(b_FE − b_RE)² / (Var_FE − Var_RE)`, using the
**difference** of variances (Hausman 1978), not their sum. When fixed- and
random-effects estimates nearly coincide — as they do with large groups — the
denominator is tiny and the statistic is dominated by the 4th–5th significant
figure of the random-effects variance. On the `MULTI` dataset EduStrat returns
χ² = 3.936 against `plm::phtest`'s 3.944 (rel. diff. `1.9e-3`). The remaining gap
traces entirely to `plm`'s trace-corrected σ²_μ (see above); it is a property of
the statistic's sensitivity, not an error in the formula, and we report it openly
rather than tuning tolerances to hide it.

---

## Design-correct standard errors (BRR replicate weights)

The model-based standard errors above assume simple random sampling and therefore
**understate** the true sampling uncertainty of PISA estimates, which arise from a
stratified, clustered design. The OECD's recommended remedy is Balanced Repeated
Replication with the 80 Fay replicate weights (k = 0.5):

    V_BRR(θ) = 1 / (G·(1 − k)²) · Σ_{r=1}^{G} (θ_r − θ_0)²,   G = 80, k = 0.5.

The data package EduStrat was first built on (`learningtower`) ships only the final
weight `W_FSTUWT`, so the original chunks cannot support BRR. We therefore re-sourced
the raw OECD Public Use Files (`pipeline/scripts/05-add-replicate-weights.R`) and
regenerated the chunks for FIN, USA, DEU, KOR and MEX across **three cycles (2015,
2018, 2022)** so that each student record carries its 80 replicate weights. The point
estimates are unchanged (verified equal to the previous PV1 values); only the
standard-error machinery is added.

`js/analysis/brr.js` implements Fay's BRR, and `regression.js` reports BRR standard
errors by default whenever replicate weights are present and the student weight is in
use (the model-based errors are retained alongside, and the active method is labelled
in the interface). `pipeline/scripts/06-verify-brr.R` checks the JavaScript BRR output
against two independent references — a direct Fay computation and the `intsvy` package:

| Quantity (FIN 2018 / pooled) | JS | R reference | Max. rel. diff. |
|---|---|---|---|
| Mean math, BRR SE | direct Fay BRR | `1.886` | `0` (exact) |
| Mean math, BRR SE | `intsvy.mean` | `1.886` | `0` (exact) |
| Mean ESCS, BRR SE | direct Fay BRR | — | `0` (exact) |
| ESCS gradient, BRR SE | direct Fay BRR | `1.748` | `1e-15` |
| ESCS gradient, BRR SE | `intsvy.reg` | `1.748` | `1e-14` |
| Pooled mean / slope (5 countries), BRR SE | direct Fay BRR | — | `<1e-15` |

The practical lesson is visible in the numbers, and it is stable across cycles. Taking
the Finnish math mean as a running example and comparing the BRR standard error to the
naive simple-random-sampling error (s/√n):

| Cycle | Estimate | SRS SE | BRR SE | BRR / SRS |
|---|---|---|---|---|
| 2015 | 510.6 | 1.07 | 2.05 | 1.90× |
| 2018 | 507.8 | 1.11 | 1.89 | 1.71× |
| 2022 | 484.2 | 0.89 | 1.81 | 2.04× |

The naive error understates sampling uncertainty by roughly 70–100% in every cycle, and
BRR reproduces `intsvy` exactly each time — so the design effect is a robust feature of
the data, not an artefact of one cycle. Reporting BRR errors by default keeps the tool
honest about this, and lets students see it directly by comparing the two.

This is a *limited-scope* implementation by design: the replicate-weight pipeline is
provided and documented, and was run for five countries across three cycles. Extending
it to further cycles/countries is a matter of re-running `05-add-replicate-weights.R`.

## What "verified" does and does not mean

- **Does** mean: the arithmetic EduStrat performs is the arithmetic established R
  packages perform, on identical data, to the precision tabulated above.
- **Does not** mean: the *modelling choices* are beyond discussion. EduStrat uses a
  single plausible value (a constraint of the `learningtower` source) and does not
  implement replicate-weight variance estimation; these are documented design
  trade-offs discussed in the methodology, not computational errors. The harness
  verifies that what the tool *says* it computes is what it *does* compute.

The verification harness is committed to the repository so that reviewers and
adopters can re-run it, extend it to further country–year combinations, and confirm
these results independently.
