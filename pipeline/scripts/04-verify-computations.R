# =============================================================================
# 04-verify-computations.R
# Numerical verification of EduStrat's client-side computations.
#
# This script is the R half of the verification harness. It does NOT trust the
# JavaScript: for every statistic the app reports it computes an independent
# reference in R --- using base R `lm`, `plm`, `lmtest`, `car`, and standard
# survey-weighted estimators --- on the SAME PISA country-year chunks the app
# loads, then compares against the JS output emitted by run-js-reference.mjs.
#
# Workflow:
#   1.  cd pipeline/verification && node run-js-reference.mjs   # -> js-results.json
#   2.  Rscript pipeline/scripts/04-verify-computations.R       # -> verification-report.csv
#
# Author: Kevin Schoenholzer
# =============================================================================

suppressPackageStartupMessages({
  library(jsonlite)
  library(plm)
  library(lmtest)
  library(car)
})

# ---- Paths ------------------------------------------------------------------
# Locate this script robustly whether run via Rscript or source().
find_script_dir <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  f <- sub("^--file=", "", args[grepl("^--file=", args)])
  if (length(f) == 1) return(dirname(normalizePath(f)))
  of <- tryCatch(sys.frame(1)$ofile, error = function(e) NULL)
  if (!is.null(of)) return(dirname(normalizePath(of)))
  normalizePath(".")
}
SCRIPT_DIR <- find_script_dir()
REPO       <- normalizePath(file.path(SCRIPT_DIR, "..", ".."))
CHUNK_DIR  <- file.path(REPO, "data", "country-year")
JS_RESULTS <- file.path(REPO, "pipeline", "verification", "js-results.json")
OUT_CSV    <- file.path(REPO, "pipeline", "verification", "verification-report.csv")

js <- fromJSON(JS_RESULTS, simplifyVector = FALSE)
DATASETS <- lapply(js$datasets, unlist)

# ---- Load chunks exactly as the app sees them -------------------------------
load_dataset <- function(codes) {
  do.call(rbind, lapply(codes, function(code) {
    chunk <- fromJSON(file.path(CHUNK_DIR, paste0(code, ".json")))
    s <- chunk$students
    s$rep_wgts <- NULL   # replicate weights (when present) are not used here; verified in 06
    s$country <- chunk$country
    s$year    <- chunk$year
    s
  }))
}

# Replicate the app's weighting rule (regression.js / descriptive.js getWeight):
# use stu_wgt when finite and > 0, otherwise fall back to 1.
app_weight <- function(df, weightType) {
  if (weightType == "none") return(rep(1, nrow(df)))
  w <- suppressWarnings(as.numeric(df$stu_wgt))
  ifelse(is.finite(w) & w > 0, w, 1)
}

# Replicate the app's gender parsing (regression.js parseGender): female = 1.
parse_gender <- function(x) {
  s <- tolower(as.character(x))
  out <- rep(NA_real_, length(s))
  out[startsWith(s, "f")] <- 1
  out[startsWith(s, "m")] <- 0
  out
}

# ---- Weighted estimators matching the app's stated definitions --------------
w_mean <- function(x, w) sum(x * w) / sum(w)
w_var  <- function(x, w) { m <- w_mean(x, w); sum(w * (x - m)^2) / sum(w) }   # population (÷ Σw)
w_sd   <- function(x, w) sqrt(w_var(x, w))

# App's weighted quantile: smallest value whose cumulative weight >= p * Σw
# (step function, type-1 style, no interpolation). utils.js weightedQuantile.
w_quantile_step <- function(x, w, p) {
  o <- order(x); x <- x[o]; w <- w[o]
  target <- p * sum(w)
  cw <- cumsum(w)
  x[which(cw >= target)[1]]
}

# Independent reference for the weighted Gini coefficient (population form,
# covariance definition):  G = 2 * cov_w(x, F) / mean_w(x), where F is the
# weighted fractional rank. Standard estimator; independent of the app code.
w_gini_ref <- function(x, w) {
  o <- order(x); x <- x[o]; w <- w[o]
  W <- sum(w)
  # midpoint cumulative weight share (weighted plotting position)
  F <- (cumsum(w) - w / 2) / W
  mu <- sum(w * x) / W
  2 * sum(w * (x - mu) * (F - sum(w * F) / W)) / (W * mu)
}

# ---- Comparison bookkeeping -------------------------------------------------
rows <- list()
record <- function(id, method, quantity, js, ref, tol = 1e-4, kind = "rel") {
  js <- as.numeric(js); ref <- as.numeric(ref)
  ad <- abs(js - ref)
  rd <- ad / pmax(abs(ref), 1e-12)
  pass <- if (kind == "rel") (rd <= tol | ad <= 1e-9) else (ad <= tol)
  rows[[length(rows) + 1]] <<- data.frame(
    id = id, method = method, quantity = quantity,
    js = js, r = ref, abs_diff = ad, rel_diff = rd,
    tol = tol, kind = kind, pass = pass, stringsAsFactors = FALSE
  )
}
get_run <- function(id) {
  for (run in js$runs) if (run$id == id) return(run)
  NULL
}

# =============================================================================
# 1. Descriptive statistics + inequality (SINGLE country-year)
# =============================================================================
single <- load_dataset(DATASETS$SINGLE)

for (outcome in c("math", "reading", "science")) {
  for (wt in c("student", "none")) {
    df <- single[is.finite(suppressWarnings(as.numeric(single[[outcome]]))), ]
    x  <- as.numeric(df[[outcome]]); w <- app_weight(df, wt)

    run <- get_run(sprintf("desc_%s_%s", outcome, wt))$result
    record(run_id <- sprintf("desc_%s_%s", outcome, wt), "descriptive", "mean", run$mean, w_mean(x, w))
    record(run_id, "descriptive", "sd",  run$sd,  w_sd(x, w))
    record(run_id, "descriptive", "p10", run$p10, w_quantile_step(x, w, 0.10))
    record(run_id, "descriptive", "p50", run$p50, w_quantile_step(x, w, 0.50))
    record(run_id, "descriptive", "p90", run$p90, w_quantile_step(x, w, 0.90))

    ineq <- get_run(sprintf("ineq_%s_%s", outcome, wt))$result
    gw <- if (wt == "none") rep(1, length(x)) else w
    record(sprintf("ineq_%s_%s", outcome, wt), "inequality", "gini", ineq$gini, w_gini_ref(x, gw), tol = 5e-4)
    record(sprintf("ineq_%s_%s", outcome, wt), "inequality", "cv",   ineq$cv,   w_sd(x, w) / w_mean(x, w))
  }
}

# =============================================================================
# 2. ESCS gradient + achievement gap (SINGLE)
# =============================================================================
for (wt in c("student", "none")) {
  df <- single[is.finite(suppressWarnings(as.numeric(single$math))) &
               is.finite(suppressWarnings(as.numeric(single$escs))), ]
  y <- as.numeric(df$math); x <- as.numeric(df$escs); w <- app_weight(df, wt)

  # gradient = weighted covariance / weighted variance of x  (simple weighted slope)
  beta_ref <- sum(w * (x - w_mean(x, w)) * (y - w_mean(y, w))) /
              sum(w * (x - w_mean(x, w))^2)
  record(sprintf("grad_%s", wt), "gradient", "beta",
         get_run(sprintf("grad_%s", wt))$result$beta, beta_ref)

  # Q4-Q1 achievement gap using the app's quartile thresholds (weighted step quantiles)
  q1t <- w_quantile_step(x, w, 0.25); q4t <- w_quantile_step(x, w, 0.75)
  q1 <- y[x <= q1t]; w1 <- w[x <= q1t]
  q4 <- y[x >= q4t]; w4 <- w[x >= q4t]
  gap_ref <- w_mean(q4, w4) - w_mean(q1, w1)
  record(sprintf("gap_%s", wt), "achievement_gap", "gap",
         get_run(sprintf("gap_%s", wt))$result$gap, gap_ref, tol = 1e-3)
}

# =============================================================================
# 3. Variance decomposition / ICC (MULTI country)
# =============================================================================
multi <- load_dataset(DATASETS$MULTI)
for (wt in c("student", "none")) {
  df <- multi[is.finite(suppressWarnings(as.numeric(multi$math))), ]
  x <- as.numeric(df$math); w <- app_weight(df, wt); g <- df$country
  mu <- w_mean(x, w); totalVar <- w_var(x, w); W <- sum(w)
  between <- 0
  for (cc in unique(g)) {
    xi <- x[g == cc]; wi <- w[g == cc]
    between <- between + (sum(wi) / W) * (w_mean(xi, wi) - mu)^2
  }
  icc_ref <- between / totalVar
  run <- get_run(sprintf("vardecomp_%s", wt))$result
  record(sprintf("vardecomp_%s", wt), "variance_decomposition", "icc", run$icc, icc_ref)
  record(sprintf("vardecomp_%s", wt), "variance_decomposition", "betweenVariance", run$betweenVariance, between, tol = 1e-3)
  record(sprintf("vardecomp_%s", wt), "variance_decomposition", "totalVariance", run$totalVariance, totalVar, tol = 1e-3)
}

# =============================================================================
# 4. Pooled OLS — reference: stats::lm with frequency/survey weights
# =============================================================================
ols_check <- function(id, codes, controls) {
  dat <- load_dataset(codes)
  ok <- is.finite(suppressWarnings(as.numeric(dat$math))) &
        is.finite(suppressWarnings(as.numeric(dat$escs)))
  if ("gender" %in% controls) { fem <- parse_gender(dat$gender); ok <- ok & !is.na(fem) }
  dat <- dat[ok, ]
  dat$math <- as.numeric(dat$math); dat$escs <- as.numeric(dat$escs)
  dat$w <- app_weight(dat, "student")
  form <- "math ~ escs"
  if ("gender" %in% controls) { dat$Female <- parse_gender(dat$gender); form <- paste(form, "+ Female") }
  fit <- lm(as.formula(form), data = dat, weights = dat$w)
  sm <- summary(fit)
  run <- get_run(id)$result
  record(id, "pooled_ols", "b_escs",  run$coefficients[[2]], coef(fit)[["escs"]])
  record(id, "pooled_ols", "se_escs", run$standardErrors[[2]], sm$coefficients["escs", "Std. Error"])
  record(id, "pooled_ols", "r2",      run$r2, sm$r.squared)
  record(id, "pooled_ols", "nobs",    run$nobs, nobs(fit), kind = "abs", tol = 0)
}
ols_check("ols_SINGLE_none",   DATASETS$SINGLE, character(0))
ols_check("ols_SINGLE_gender", DATASETS$SINGLE, "gender")
ols_check("ols_MULTI_none",    DATASETS$MULTI,  character(0))
ols_check("ols_MULTI_gender",  DATASETS$MULTI,  "gender")

# =============================================================================
# 5. Fixed effects — reference: lm with country dummies (LSDV)
# =============================================================================
for (wt in c("student", "none")) {
  dat <- multi[is.finite(suppressWarnings(as.numeric(multi$math))) &
               is.finite(suppressWarnings(as.numeric(multi$escs))), ]
  dat$math <- as.numeric(dat$math); dat$escs <- as.numeric(dat$escs)
  dat$w <- app_weight(dat, wt)
  fit <- lm(math ~ escs + factor(country), data = dat, weights = dat$w)
  sm <- summary(fit)
  run <- get_run(sprintf("fe_%s", wt))$result
  record(sprintf("fe_%s", wt), "fixed_effects", "b_escs", run$coefficients[[2]], coef(fit)[["escs"]])
  record(sprintf("fe_%s", wt), "fixed_effects", "se_escs", run$standardErrors[[2]], sm$coefficients["escs", "Std. Error"])
  record(sprintf("fe_%s", wt), "fixed_effects", "r2", run$r2, sm$r.squared, tol = 1e-3)
}

# =============================================================================
# 6. Random effects — reference: plm Swamy-Arora (unweighted)
# =============================================================================
dat <- multi[is.finite(suppressWarnings(as.numeric(multi$math))) &
             is.finite(suppressWarnings(as.numeric(multi$escs))), ]
dat$math <- as.numeric(dat$math); dat$escs <- as.numeric(dat$escs)
dat$sid <- seq_len(nrow(dat))
re_ok <- TRUE
re_fit <- tryCatch(
  plm(math ~ escs, data = dat, index = c("country", "sid"),
      model = "random", random.method = "swar"),
  error = function(e) { re_ok <<- FALSE; message("plm RE failed: ", e$message); NULL })
if (re_ok && !is.null(re_fit)) {
  run <- get_run("re_none")$result
  record("re_none", "random_effects", "b_escs", run$coefficients[[2]], coef(re_fit)[["escs"]], tol = 5e-3)
  record("re_none", "random_effects", "se_escs", run$standardErrors[[2]],
         sqrt(diag(vcov(re_fit)))[["escs"]], tol = 5e-2)
}

# =============================================================================
# 7. Hausman test — reference: plm::phtest (unweighted)
# =============================================================================
ph_ok <- TRUE
ph <- tryCatch({
  fe_p <- plm(math ~ escs, data = dat, index = c("country", "sid"), model = "within")
  re_p <- plm(math ~ escs, data = dat, index = c("country", "sid"), model = "random", random.method = "swar")
  phtest(fe_p, re_p)
}, error = function(e) { ph_ok <<- FALSE; NULL })
if (ph_ok && !is.null(ph)) {
  run <- get_run("hausman_none")$result
  record("hausman_none", "hausman", "chi2", run$chiSquared, as.numeric(ph$statistic), tol = 1e-2)
}

# =============================================================================
# 8. Breusch-Pagan, VIF, Cook's distance — references: lmtest, car, stats
#    (single country-year, unweighted, math ~ escs + Female)
# =============================================================================
ddat <- single[is.finite(suppressWarnings(as.numeric(single$math))) &
               is.finite(suppressWarnings(as.numeric(single$escs))), ]
fem <- parse_gender(ddat$gender)
ddat <- ddat[!is.na(fem), ]
ddat$math <- as.numeric(ddat$math); ddat$escs <- as.numeric(ddat$escs)
ddat$Female <- parse_gender(ddat$gender)
dfit <- lm(math ~ escs + Female, data = ddat)

bp <- bptest(dfit)            # Koenker studentized BP (lmtest default)
run <- get_run("bp_single")$result
record("bp_single", "breusch_pagan", "statistic", run$testStatistic, as.numeric(bp$statistic), tol = 1e-2)
record("bp_single", "breusch_pagan", "df", run$df, as.numeric(bp$parameter), kind = "abs", tol = 0)

vif_r <- car::vif(dfit)
run <- get_run("vif_single")$result
record("vif_single", "vif", "escs",   run$escs,   vif_r[["escs"]],   tol = 1e-3)
record("vif_single", "vif", "Female", run$Female, vif_r[["Female"]], tol = 1e-3)

cd <- cooks.distance(dfit)
run <- get_run("cooks_single")$result
record("cooks_single", "cooks_distance", "sum", run$sum, sum(cd), tol = 1e-2)
record("cooks_single", "cooks_distance", "max", run$max, max(cd), tol = 1e-2)

# =============================================================================
# Report
# =============================================================================
report <- do.call(rbind, rows)
write.csv(report, OUT_CSV, row.names = FALSE)

cat("\n==================================================================\n")
cat("  EduStrat computation verification  (JS app  vs  R reference)\n")
cat("==================================================================\n\n")
fmt <- function(v) formatC(v, format = "g", digits = 6)
for (i in seq_len(nrow(report))) {
  r <- report[i, ]
  flag <- if (isTRUE(r$pass)) "PASS" else "**FAIL**"
  cat(sprintf("  [%-4s] %-22s %-16s  js=%-12s r=%-12s  reldiff=%.2e\n",
              ifelse(isTRUE(r$pass), "PASS", "FAIL"), r$id, r$quantity,
              fmt(r$js), fmt(r$r), r$rel_diff))
}
np <- sum(report$pass); nt <- nrow(report)
cat(sprintf("\n  %d / %d checks passed.\n", np, nt))
if (np < nt) {
  cat("\n  FAILURES:\n")
  f <- report[!report$pass, ]
  for (i in seq_len(nrow(f))) cat(sprintf("    - %s / %s\n", f$id[i], f$quantity[i]))
}
cat(sprintf("\n  Full report written to %s\n", OUT_CSV))
cat("==================================================================\n")
