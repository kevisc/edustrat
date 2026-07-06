# =============================================================================
# 07-verify-trends.R
# Verify EduStrat's within-country TREND estimators against base-R stats::lm.
#
# The Trends tab estimates, per country and PISA cycle, a focal statistic with a
# standard error, then fits how it moves over time. This script reproduces, on the
# SAME chunks and entirely in R:
#   (1) the per-cycle weighted mean and its SE        -> lm(y ~ 1, weights = w)
#   (2) the per-cycle ESCS gradient and its SE        -> lm(y ~ escs, weights = w)
#   (3) the per-country trend (precision-weighted)    -> lm(theta ~ time, weights = 1/se^2)
#   (4) the country fixed-effects panel trend         -> lm(theta ~ time + factor(country),
#                                                            weights = 1/se^2)
# and compares to the JavaScript module's output in trends-js-results.json.
#
# Workflow:
#   cd pipeline/verification && node run-trends.mjs     # -> trends-js-results.json
#   Rscript pipeline/scripts/07-verify-trends.R         # -> trends-verification-report.csv
#
# Author: Kevin Schoenholzer
# =============================================================================

suppressPackageStartupMessages({ library(jsonlite) })

find_script_dir <- function() {
  a <- commandArgs(trailingOnly = FALSE)
  f <- sub("^--file=", "", a[grepl("^--file=", a)])
  if (length(f) == 1) return(dirname(normalizePath(f)))
  normalizePath(".")
}
REPO      <- normalizePath(file.path(find_script_dir(), "..", ".."))
CHUNK_DIR <- file.path(REPO, "data", "country-year")
JS_FILE   <- file.path(REPO, "pipeline", "verification", "trends-js-results.json")
OUT_CSV   <- file.path(REPO, "pipeline", "verification", "trends-verification-report.csv")

ORIGIN <- 2000   # trend slope is per decade: time = (year - 2000) / 10
js <- fromJSON(JS_FILE, simplifyVector = FALSE)

get_run <- function(id) {
  for (r in js$runs) if (!is.null(r$id) && r$id == id) return(r)
  stop(paste("run not found:", id))
}

# ---- Load one country-cycle chunk as a data.frame ---------------------------
load_cell <- function(country, year) {
  f <- file.path(CHUNK_DIR, paste0(country, "_", year, ".json"))
  if (!file.exists(f)) return(NULL)
  s <- fromJSON(f)$students
  data.frame(country = country, year = year,
             math = suppressWarnings(as.numeric(s$math)),
             escs = suppressWarnings(as.numeric(s$escs)),
             w    = suppressWarnings(as.numeric(s$stu_wgt)))
}

# ---- Per-cycle reference estimates (mean / gradient) ------------------------
ref_mean <- function(df) {
  d <- df[is.finite(df$math) & is.finite(df$w) & df$w > 0, ]
  m <- lm(math ~ 1, weights = w, data = d)
  c(estimate = unname(coef(m)[1]), se = summary(m)$coefficients[1, 2], n = nrow(d))
}
ref_gradient <- function(df) {
  d <- df[is.finite(df$math) & is.finite(df$escs) & is.finite(df$w) & df$w > 0, ]
  m <- lm(math ~ escs, weights = w, data = d)
  c(estimate = unname(coef(m)[2]), se = summary(m)$coefficients[2, 2], n = nrow(d))
}

# ---- Per-country series, then the precision-weighted trend ------------------
country_series <- function(country, years, fn) {
  rows <- lapply(years, function(y) {
    df <- load_cell(country, y); if (is.null(df)) return(NULL)
    e <- fn(df); data.frame(year = y, estimate = e["estimate"], se = e["se"], n = e["n"])
  })
  do.call(rbind, rows)
}
fit_trend <- function(series) {
  series$time <- (series$year - ORIGIN) / 10
  m <- lm(estimate ~ time, weights = 1 / se^2, data = series)
  list(slope = unname(coef(m)[2]), se = summary(m)$coefficients[2, 2])
}
fit_fe_panel <- function(cells) {
  cells$time <- (cells$year - ORIGIN) / 10
  m <- lm(estimate ~ time + factor(country), weights = 1 / se^2, data = cells)
  list(slope = unname(coef(m)["time"]), se = summary(m)$coefficients["time", 2])
}

# ---- Comparison bookkeeping -------------------------------------------------
checks <- data.frame()
record <- function(name, js_val, r_val, tol) {
  rel <- abs(js_val - r_val) / (abs(r_val) + 1e-12)
  checks <<- rbind(checks, data.frame(check = name, js = js_val, r = r_val,
                                      rel_diff = rel, tol = tol, pass = rel < tol))
}

# =============================================================================
# (1)+(2) Per-cycle estimates for Finland, all 8 cycles
# =============================================================================
for (metric in c("mean", "gradient")) {
  run <- get_run(paste0("FIN_math_", metric))
  fn  <- if (metric == "mean") ref_mean else ref_gradient
  for (p in run$points) {
    df <- load_cell("FIN", p$year); if (is.null(df)) next
    e  <- fn(df)
    record(sprintf("FIN_%s_%d_est", metric, p$year), p$estimate, e["estimate"], 1e-6)
    if (!is.null(p$se)) record(sprintf("FIN_%s_%d_se", metric, p$year), p$se, e["se"], 1e-6)
  }
  # (3) per-country precision-weighted trend
  series <- country_series("FIN", sapply(run$points, function(p) p$year), fn)
  tr <- fit_trend(series)
  record(sprintf("FIN_%s_trend_slope", metric), run$trend$slopePerDecade, tr$slope, 1e-4)
  if (!is.null(run$trend$se)) record(sprintf("FIN_%s_trend_se", metric), run$trend$se, tr$se, 1e-4)
}

# =============================================================================
# (4) Country fixed-effects panel for the ESCS gradient across 5 countries
# =============================================================================
panel <- get_run("PANEL_gradient_math")
COUNTRIES <- c("FIN", "USA", "DEU", "KOR", "MEX")
YEARS <- c(2000, 2003, 2006, 2009, 2012, 2015, 2018, 2022)
cells <- do.call(rbind, lapply(COUNTRIES, function(c) country_series(c, YEARS, ref_gradient)))
cells$country <- rep(COUNTRIES, each = length(YEARS))[seq_len(nrow(cells))]
# rebuild country labels robustly (country_series drops missing cells)
cells <- do.call(rbind, lapply(COUNTRIES, function(c) {
  s <- country_series(c, YEARS, ref_gradient); if (!is.null(s)) s$country <- c; s
}))
fe <- fit_fe_panel(cells)
record("FE_panel_gradient_slope", panel$fePanel$slopePerDecade, fe$slope, 1e-3)
record("FE_panel_gradient_se",    panel$fePanel$se,             fe$se,    1e-3)

# =============================================================================
# Report
# =============================================================================
checks$rel_diff <- signif(checks$rel_diff, 3)
write.csv(checks, OUT_CSV, row.names = FALSE)

cat("\n=== Within-country trends verification ===\n")
print(checks, row.names = FALSE)
np <- sum(checks$pass); nt <- nrow(checks)
cat(sprintf("\n%d / %d checks passed (tolerances: per-cycle 1e-6, trend 1e-4, FE panel 1e-3).\n", np, nt))
cat(sprintf("Report written to %s\n", OUT_CSV))
if (np < nt) quit(status = 1)
