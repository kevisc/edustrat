# Verifying EduStrat's statistical computations against R

EduStrat performs every statistical computation **client-side in JavaScript** so
that students can analyse PISA microdata in a browser without installing R, Stata,
or Python. A reasonable question follows immediately: *can these in-browser
estimates be trusted?* This document describes how we answer that question, and
records the result.

The short version: **every estimator the application reports is checked, on real
PISA data, against an independent reference implementation in R built from
peer-reviewed packages (`stats`, `plm`, `lmtest`, `car`, `intsvy`, `mice`, `sandwich`).** Seven harnesses
run: 83 checks on the point estimates and model-based statistics, 21 checks on the
design-correct (BRR replicate-weight) standard errors across three PISA cycles, 38
checks on the within-country trend estimators (per-cycle estimates and both trend
regressions), 18 checks on the FIML missing-data estimator (against an independent R EM
and `mice`), 23 checks on the inequality/clustering estimators (Theil decomposition,
school-clustered standard errors, Oaxaca–Blinder, plausible-value pooling, panel R²,
senate weights), 19 checks on the "Show the R" code generator (including executing a
generated snippet in R and reproducing the app's numbers), and a headless-browser
smoke-test that runs the app in real Chrome. All pass; the great
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

## Within-country trends (a country-level panel over PISA cycles)

The **Trends** tab estimates how a focal statistic — mean achievement, the ESCS
gradient, the achievement Gini, or the Q4–Q1 SES gap — moves across PISA cycles
*within* a country, and fits a country fixed-effects panel across several countries.
PISA is a series of repeated cross-sections, so this is a *country-level* panel
(one estimate per country per cycle), not an individual panel; the tab states this
explicitly and flags the cross-cycle comparability breaks (the 2015 move to
computer-based delivery, the 2022 pandemic cycle, the periodic re-scaling of ESCS).

Each new estimator reduces to ordinary (weighted) least squares and is verified
against `stats::lm` on the same chunks by `pipeline/scripts/07-verify-trends.R`:

- **Per-cycle estimates** — the weighted mean reproduces `lm(y ~ 1, weights = w)`
  and the ESCS gradient reproduces `lm(y ~ escs, weights = w)`, both point estimate
  and standard error, to between ten and fifteen significant figures across all
  eight Finnish cycles.
- **Per-country trend** — a precision-weighted regression of the per-cycle estimate
  on time in decades, `lm(theta ~ I((year-2000)/10), weights = 1/se^2)`, matched on
  slope and standard error.
- **Country fixed-effects panel** — `lm(theta ~ I((year-2000)/10) + factor(country),
  weights = 1/se^2)`, the average within-country trend net of fixed country levels,
  matched on slope and standard error.

All 38 checks pass. The two trend regressions agree with R to about eight significant
figures rather than to machine precision, because `weightedOLS` adds the same
`1e-10·tr(XᵀWX)` ridge documented for the random-effects slope above; the per-cycle
means, which are computed in closed form, match to full precision. Run it with:

```bash
cd pipeline/verification && node run-trends.mjs   # -> trends-js-results.json
Rscript pipeline/scripts/07-verify-trends.R       # -> trends-verification-report.csv  (38/38)
```

The Gini and gap trajectories are shown as point estimates; their per-cycle standard
errors (and hence confidence bands and precision weighting) are reported only where
the chunk carries replicate weights, otherwise the trend for those metrics is fit
equally-weighted and labelled as such in the interface.

## Missing data: FIML against an independent R EM and `mice`

Everywhere else EduStrat handles item-missingness by **listwise deletion**. The
Regression tab adds a **full-information maximum likelihood (FIML)** alternative: it
treats the outcome and the SES predictor as jointly normal and estimates the
regression by the EM algorithm of Little & Rubin, using every partially-observed
student rather than dropping it. Standard errors come from the numerical
observed-information matrix (the negative Hessian of the weighted observed-data
log-likelihood), propagated to the slope by a numerical delta method. The survey
weights are normalised to the sample size so the information — and therefore the
standard error — is on the sample scale, not the population scale.

Because the whole procedure is deterministic, it admits a tight check.
`pipeline/scripts/08-verify-fiml.R` reimplements the EM and the numerical-Hessian
standard errors independently in base R, and runs it on Finland, the United States,
and Mexico (2018), for the ESCS gradient and the parental-education gradient:

- **Point estimates** (the FIML slope and intercept) match the independent R EM to
  **machine precision** (relative differences of 0 to ~1e-16) once both EMs are run
  to a tight convergence tolerance.
- **Standard errors** match the independent R numerical-Hessian computation to about
  seven significant figures (~1e-7 relative).
- **Convergent validity:** the FIML slope is additionally cross-checked against
  `mice` multiple imputation (m = 20, Bayesian normal imputation, weighted pooling
  by Rubin's rules) and agrees to within 0.1–0.9% on every dataset — independent
  confirmation that the EM recovers the same MAR estimand as the standard MI tool.

All 18 checks pass. Run it with:

```bash
cd pipeline/verification && node run-fiml.mjs     # -> fiml-js-results.json
Rscript pipeline/scripts/08-verify-fiml.R         # -> fiml-verification-report.csv  (18/18)
```

FIML here assumes joint normality, so it is offered for continuous predictors (ESCS,
or parental education as a numeric ISCED level); categorical controls such as gender
violate that assumption and are better handled by multiple imputation, which is noted
in the interface and left to a future extension.

## The rigor ladder: Theil, school clustering, Oaxaca–Blinder, plausible values

Four further estimators follow the same discipline (`pipeline/verification/run-rigor.mjs`
→ `pipeline/scripts/09-verify-rigor.R`; 23 checks, all passing):

- **Theil-T index and its additive decomposition** (`js/core/utils.js`) — total,
  within-country, and between-country components match a definitional base-R
  implementation to machine precision. Unlike the Gini, Theil decomposes exactly
  into within + between, which the Gap Analysis tab now displays alongside the ICC.
- **Cluster-robust (school) standard errors** (`js/analysis/regression.js`,
  `applyClusterSE`) — PISA samples whole classrooms within schools, so the CR1
  sandwich estimator clustered on `school_id` is attached to every OLS/FE fit.
  Matches `sandwich::vcovCL(..., cluster = ~school_id, type = "HC1")` to ~1e-10.
- **Oaxaca–Blinder decomposition** (`js/analysis/oaxaca.js`) — twofold and
  threefold decompositions of a two-country gap (reference-group convention
  stated in the interface), exact against base-R `lm` algebra; the identity
  E + C + I = gap holds to floating-point precision.
- **Plausible-value pooling (Rubin's rules)** (`js/analysis/pv-pooling.js`) —
  pooled estimate, within/between variance, total SE, and Rubin df match base R
  exactly on a deterministic synthetic multi-PV dataset. The machinery activates
  automatically when chunks carry pv fields; `pipeline/scripts/10-add-plausible-values.R`
  regenerates chunks with all PVs from the OECD PUF, following the same
  limited-scope template as the replicate-weight pipeline. Until such chunks are
  present, analyses remain single-PV (PV1) and the interface says so.

The same harness formalizes two Phase-1 corrections: the fixed-effects
within/between R² now follows the Stata `xtreg` convention (the within R² equals
plm's within-model R² to 1e-8; the previous "simplified" formula was replaced),
and senate weights are derived at load time as the final student weight rescaled
to sum to 5,000 per country-cycle — the senate-weighted slope and SE match R on
identically rescaled weights.

## "Show the R": the code panels are themselves tested

Every results surface carries a "Show the R code" panel (js/analysis/r-code-gen.js)
whose claim — run this code, get these numbers — is tested in
`pipeline/verification/run-rcode.mjs` (19 checks): each generated snippet is
checked to contain the exact verified R call for its estimator, the "expected
output" block is checked to carry the very numbers of the on-screen model object,
and one generated snippet is **executed in R end-to-end**, reproducing the app's
coefficient and standard error to ~1e-9. The learningtower data path is used for
public reproduction; snippets switch to the OECD PUF preamble only where
learningtower cannot supply the inputs (replicate weights).

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
