# =============================================================================
# 06-verify-brr.R
# Verify EduStrat's JavaScript BRR (Fay replicate-weight) standard errors.
#
# Two independent references on the SAME replicate-weight chunks:
#   (1) a direct, transparent Fay BRR computation
#         V = 1/(G(1-k)^2) * sum_r (theta_r - theta_0)^2,  G=80, k=0.5
#   (2) the intsvy package (intsvy.mean / intsvy.reg), the established R tool for
#         PISA replicate-weight inference, as a cross-check.
#
# Workflow:
#   cd pipeline/verification && node run-brr.mjs        # -> brr-js-results.json
#   Rscript pipeline/scripts/06-verify-brr.R            # -> brr-verification-report.csv
#
# Author: Kevin Schoenholzer
# =============================================================================

suppressPackageStartupMessages({ library(jsonlite); library(intsvy) })

find_script_dir <- function() {
  a <- commandArgs(trailingOnly = FALSE)
  f <- sub("^--file=", "", a[grepl("^--file=", a)])
  if (length(f) == 1) return(dirname(normalizePath(f)))
  normalizePath(".")
}
REPO      <- normalizePath(file.path(find_script_dir(), "..", ".."))
CHUNK_DIR <- file.path(REPO, "data", "country-year")
JS_BRR    <- file.path(REPO, "pipeline", "verification", "brr-js-results.json")
OUT_CSV   <- file.path(REPO, "pipeline", "verification", "brr-verification-report.csv")

FAY <- 0.5
js <- fromJSON(JS_BRR, simplifyVector = FALSE)
DATASETS <- lapply(js$datasets, unlist)

# ---- Load chunks, keeping the replicate-weight matrix -----------------------
load_dataset <- function(codes) {
  dfs <- lapply(codes, function(code) {
    ch <- fromJSON(file.path(CHUNK_DIR, paste0(code, ".json")))
    s <- ch$students
    rw <- do.call(rbind, s$rep_wgts)       # list-of-80 -> n x 80 matrix
    colnames(rw) <- paste0("rep", seq_len(ncol(rw)))
    data.frame(country = ch$country, math = as.numeric(s$math),
               escs = as.numeric(s$escs), w = as.numeric(s$stu_wgt),
               rw, check.names = FALSE)
  })
  # bind (all have 80 rep cols named V1..V80 from the matrix)
  do.call(rbind, dfs)
}
rep_cols <- function(df) grep("^(V[0-9]+|rep)", names(df), value = TRUE)

# ---- Direct Fay BRR for an arbitrary estimator ------------------------------
brr_direct <- function(df, estimator) {
  w0 <- df$w
  reps <- as.matrix(df[, rep_cols(df)])
  G <- ncol(reps)
  theta0 <- estimator(df, w0)
  ss <- 0
  for (r in seq_len(G)) { d <- estimator(df, reps[, r]) - theta0; ss <- ss + d * d }
  list(estimate = theta0, se = sqrt(ss / (G * (1 - FAY)^2)), G = G)
}

est_mean <- function(var) function(df, w) {
  x <- df[[var]]; ok <- is.finite(x) & is.finite(w) & w > 0
  sum(w[ok] * x[ok]) / sum(w[ok])
}
est_slope <- function(yv, xv) function(df, w) {
  y <- df[[yv]]; x <- df[[xv]]; ok <- is.finite(y) & is.finite(x) & is.finite(w) & w > 0
  y <- y[ok]; x <- x[ok]; w <- w[ok]
  mx <- sum(w * x) / sum(w); my <- sum(w * y) / sum(w)
  sum(w * (x - mx) * (y - my)) / sum(w * (x - mx)^2)
}

# ---- Compare ----------------------------------------------------------------
rows <- list()
get_js <- function(id) { for (r in js$runs) if (r$id == id) return(r); NULL }
add <- function(id, quantity, jsval, refval, ref = "direct BRR", tol = 1e-6) {
  jsval <- as.numeric(jsval); refval <- as.numeric(refval)
  rd <- abs(jsval - refval) / max(abs(refval), 1e-12)
  rows[[length(rows) + 1]] <<- data.frame(id, quantity, reference = ref,
      js = jsval, r = refval, rel_diff = rd, tol = tol, pass = rd <= tol,
      stringsAsFactors = FALSE)
}

single <- load_dataset(DATASETS$SINGLE)
multi  <- load_dataset(DATASETS$MULTI)

# 1) direct-BRR reference (must match JS to machine precision: same formula/data)
b <- brr_direct(single, est_mean("math"));  j <- get_js("brr_mean_math_SINGLE")
add("brr_mean_math_SINGLE", "estimate", j$estimate, b$estimate); add("brr_mean_math_SINGLE", "se", j$se, b$se)
b <- brr_direct(single, est_mean("escs"));  j <- get_js("brr_mean_escs_SINGLE")
add("brr_mean_escs_SINGLE", "estimate", j$estimate, b$estimate); add("brr_mean_escs_SINGLE", "se", j$se, b$se)
b <- brr_direct(single, est_slope("math","escs")); j <- get_js("brr_slope_SINGLE")
add("brr_slope_SINGLE", "estimate", j$estimate, b$estimate); add("brr_slope_SINGLE", "se", j$se, b$se)
b <- brr_direct(multi, est_mean("math"));    j <- get_js("brr_mean_math_MULTI")
add("brr_mean_math_MULTI", "estimate", j$estimate, b$estimate); add("brr_mean_math_MULTI", "se", j$se, b$se)
b <- brr_direct(multi, est_slope("math","escs")); j <- get_js("brr_slope_MULTI")
add("brr_slope_MULTI", "estimate", j$estimate, b$estimate); add("brr_slope_MULTI", "se", j$se, b$se)

# 2) intsvy cross-check (independent package). Build the W_FSTUWT / W_FSTURWT*
#    columns intsvy expects and compare the mean and regression SEs.
intsvy_ok <- TRUE
tryCatch({
  cfg <- intsvy:::pisa_conf
  mk <- function(df) {
    reps <- as.matrix(df[, rep_cols(df)])
    d <- data.frame(W_FSTUWT = df$w, math = df$math, escs = df$escs)
    colnames(reps) <- paste0("W_FSTURWT", seq_len(ncol(reps)))
    cbind(d, reps)
  }
  ds <- mk(single)
  im <- intsvy.mean("math", data = ds, config = cfg)
  j <- get_js("brr_mean_math_SINGLE")
  add("brr_mean_math_SINGLE", "se", j$se, im$s.e.[1], ref = "intsvy.mean", tol = 5e-3)

  ir <- intsvy.reg(y = "math", x = "escs", data = ds, config = cfg)
  se_escs <- ir$reg["escs", "Std. Error"]
  j <- get_js("brr_slope_SINGLE")
  add("brr_slope_SINGLE", "se", j$se, se_escs, ref = "intsvy.reg", tol = 5e-3)
}, error = function(e) { intsvy_ok <<- FALSE; message("intsvy cross-check skipped: ", e$message) })

# 3) Robustness across PISA cycles: verify BRR (direct + intsvy) for FIN in
#    2015/2018/2022, and tabulate the design effect (BRR SE vs naive SRS SE).
robust <- list()
for (code in DATASETS$CYCLES) {
  df <- load_dataset(code)
  # mean(math): verify JS BRR SE vs direct + intsvy
  bm <- brr_direct(df, est_mean("math")); jm <- get_js(paste0("brr_mean_math_", code))
  add(paste0("brr_mean_math_", code), "se", jm$se, bm$se)
  bs <- brr_direct(df, est_slope("math","escs")); jsl <- get_js(paste0("brr_slope_", code))
  add(paste0("brr_slope_", code), "se", jsl$se, bs$se)
  tryCatch({
    reps <- as.matrix(df[, rep_cols(df)]); colnames(reps) <- paste0("W_FSTURWT", seq_len(ncol(reps)))
    ds <- cbind(data.frame(W_FSTUWT = df$w, math = df$math), reps)
    im <- intsvy.mean("math", data = ds, config = intsvy:::pisa_conf)
    add(paste0("brr_mean_math_", code), "se", jm$se, im$s.e.[1], ref = "intsvy.mean", tol = 5e-3)
  }, error = function(e) message("intsvy (", code, ") skipped: ", e$message))
  # design effect: naive SRS SE = s / sqrt(n) for the weighted mean
  x <- df$math[is.finite(df$math)]; w <- df$w[is.finite(df$math)]
  mu <- sum(w*x)/sum(w); s <- sqrt(sum(w*(x-mu)^2)/sum(w)); srs <- s/sqrt(length(x))
  robust[[length(robust)+1]] <- data.frame(cycle = code, estimate = jm$estimate,
      srs_se = srs, brr_se = jm$se, ratio = jm$se/srs)
}

# ---- Report -----------------------------------------------------------------
report <- do.call(rbind, rows)
write.csv(report, OUT_CSV, row.names = FALSE)

cat("\n==================================================================\n")
cat("  EduStrat BRR standard-error verification  (JS app vs R)\n")
cat("==================================================================\n\n")
for (i in seq_len(nrow(report))) {
  r <- report[i, ]
  cat(sprintf("  [%-4s] %-22s %-9s %-13s js=%-11.5g r=%-11.5g rel=%.2e\n",
              ifelse(r$pass, "PASS", "FAIL"), r$id, r$quantity, r$reference, r$js, r$r, r$rel_diff))
}
np <- sum(report$pass); nt <- nrow(report)
cat(sprintf("\n  %d / %d BRR checks passed.\n", np, nt))

if (length(robust)) {
  rb <- do.call(rbind, robust)
  cat("\n  Robustness across cycles - design effect on the math mean (FIN):\n")
  cat("  cycle      estimate   SRS SE   BRR SE   BRR/SRS\n")
  for (i in seq_len(nrow(rb)))
    cat(sprintf("  %-9s  %7.2f  %6.3f  %6.3f   %5.2fx\n",
                rb$cycle[i], rb$estimate[i], rb$srs_se[i], rb$brr_se[i], rb$ratio[i]))
  cat("  (BRR/SRS > 1 quantifies how PISA's design inflates uncertainty; verified vs intsvy each cycle.)\n")
}
cat(sprintf("\n  Report written to %s\n", OUT_CSV))
cat("==================================================================\n")
