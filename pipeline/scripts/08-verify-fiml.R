# =============================================================================
# 08-verify-fiml.R
# Verify EduStrat's JavaScript FIML (EM for the multivariate normal with missing
# data) against an independent base-R implementation, and cross-check the point
# estimate against `mice` multiple imputation for convergent validity.
#
# The JS module (js/analysis/fiml.js) estimates the regression of an outcome on a
# predictor by EM under joint normality, using every partially-observed case, and
# reports standard errors from the numerical observed-information matrix. This
# script reproduces both, independently, on the same chunks.
#
# Workflow:
#   cd pipeline/verification && node run-fiml.mjs       # -> fiml-js-results.json
#   Rscript pipeline/scripts/08-verify-fiml.R           # -> fiml-verification-report.csv
#
# Author: Kevin Schoenholzer
# =============================================================================

suppressPackageStartupMessages({ library(jsonlite) })
HAVE_MICE <- requireNamespace("mice", quietly = TRUE)

find_script_dir <- function() {
  a <- commandArgs(trailingOnly = FALSE)
  f <- sub("^--file=", "", a[grepl("^--file=", a)])
  if (length(f) == 1) return(dirname(normalizePath(f)))
  normalizePath(".")
}
REPO      <- normalizePath(file.path(find_script_dir(), "..", ".."))
CHUNK_DIR <- file.path(REPO, "data", "country-year")
JS_FILE   <- file.path(REPO, "pipeline", "verification", "fiml-js-results.json")
OUT_CSV   <- file.path(REPO, "pipeline", "verification", "fiml-verification-report.csv")

js <- fromJSON(JS_FILE, simplifyVector = FALSE)

# ---- Parse parental education exactly as the JS module does ------------------
parse_isced <- function(v) {
  if (is.na(v)) return(NA_real_)
  n <- suppressWarnings(as.numeric(v)); if (is.finite(n)) return(n)
  u <- toupper(trimws(v))
  if (u %in% c("NONE", "NA", "N/A", "")) return(NA_real_)
  m <- regmatches(u, regexpr("ISCED\\s*([0-9])", u))
  if (length(m) == 1 && nchar(m) > 0) return(as.numeric(gsub("\\D", "", m)))
  NA_real_
}
parent_edu <- function(students) {
  mo <- vapply(students$mother_educ, parse_isced, numeric(1))
  fa <- vapply(students$father_educ, parse_isced, numeric(1))
  ifelse(is.finite(mo) & is.finite(fa), pmax(mo, fa),
         ifelse(is.finite(mo), mo, ifelse(is.finite(fa), fa, NA_real_)))
}

# ---- Build the analysis matrix (outcome, predictor) + normalised weights -----
build_Z <- function(code, predictor) {
  s <- fromJSON(file.path(CHUNK_DIR, paste0(code, ".json")))$students
  y <- suppressWarnings(as.numeric(s$math))
  x <- if (predictor == "parent_edu") parent_edu(s) else suppressWarnings(as.numeric(s[[predictor]]))
  w <- suppressWarnings(as.numeric(s$stu_wgt)); w[!is.finite(w) | w <= 0] <- 1
  keep <- is.finite(y) | is.finite(x)               # at least one observed
  Z <- cbind(y[keep], x[keep]); w <- w[keep]
  w <- w * nrow(Z) / sum(w)                          # normalise to sample size
  list(Z = Z, w = w)
}

# ---- Observed-data weighted log-likelihood of the bivariate normal ----------
obs_loglik <- function(theta, Z, w) {
  mu <- theta[1:2]
  S  <- matrix(c(theta[3], theta[4], theta[4], theta[5]), 2, 2)
  ll <- 0
  for (i in seq_len(nrow(Z))) {
    obs <- which(is.finite(Z[i, ]))
    if (length(obs) == 0) next
    xo <- Z[i, obs]; muo <- mu[obs]; So <- S[obs, obs, drop = FALSE]
    d  <- as.numeric(determinant(So, logarithm = TRUE)$modulus)
    q  <- t(xo - muo) %*% solve(So) %*% (xo - muo)
    ll <- ll + w[i] * (-0.5 * (length(obs) * log(2 * pi) + d + q))
  }
  ll
}

# ---- Independent EM for the bivariate normal with missing data --------------
em_mvn <- function(Z, w, tol = 1e-10, maxit = 500) {
  p <- ncol(Z); Wsum <- sum(w)
  mu <- sapply(1:p, function(j) { o <- is.finite(Z[, j]); sum(w[o] * Z[o, j]) / sum(w[o]) })
  S  <- matrix(0, p, p)
  for (a in 1:p) for (b in 1:p) {
    o <- is.finite(Z[, a]) & is.finite(Z[, b])
    S[a, b] <- sum(w[o] * (Z[o, a] - mu[a]) * (Z[o, b] - mu[b])) / sum(w[o])
  }
  prev <- -Inf
  for (it in 1:maxit) {
    T1 <- numeric(p); T2 <- matrix(0, p, p)
    for (i in seq_len(nrow(Z))) {
      obs <- which(is.finite(Z[i, ])); mis <- which(!is.finite(Z[i, ]))
      zhat <- Z[i, ]; cc <- matrix(0, p, p)
      if (length(mis) > 0 && length(obs) > 0) {
        Soo_i <- solve(S[obs, obs, drop = FALSE])
        B <- S[mis, obs, drop = FALSE] %*% Soo_i
        zhat[mis] <- mu[mis] + B %*% (Z[i, obs] - mu[obs])
        cc[mis, mis] <- S[mis, mis, drop = FALSE] - B %*% S[obs, mis, drop = FALSE]
      } else if (length(obs) == 0) {
        zhat[mis] <- mu[mis]; cc[mis, mis] <- S[mis, mis, drop = FALSE]
      }
      T1 <- T1 + w[i] * zhat
      T2 <- T2 + w[i] * (outer(zhat, zhat) + cc)
    }
    mu <- T1 / Wsum
    S  <- T2 / Wsum - outer(mu, mu)
    ll <- obs_loglik(c(mu, S[1, 1], S[1, 2], S[2, 2]), Z, w)
    if (is.finite(ll) && abs(ll - prev) < tol * (abs(prev) + 1)) break
    prev <- ll
  }
  list(mu = mu, S = S)
}

coef_from <- function(mu, S) c(alpha = mu[1] - (S[1, 2] / S[2, 2]) * mu[2], beta = S[1, 2] / S[2, 2])

# ---- Numerical Hessian / Jacobian (mirror the JS step rules) ----------------
num_hessian <- function(f, th) {
  n <- length(th); h <- 1e-4 * (abs(th) + 1); H <- matrix(0, n, n)
  for (i in 1:n) for (j in i:n) {
    e <- function(si, sj) { t <- th; t[i] <- t[i] + si * h[i]; t[j] <- t[j] + sj * h[j]; f(t) }
    H[i, j] <- H[j, i] <- (e(1, 1) - e(1, -1) - e(-1, 1) + e(-1, -1)) / (4 * h[i] * h[j])
  }
  H
}
num_jacobian <- function(g, th, m) {
  n <- length(th); J <- matrix(0, m, n)
  for (j in 1:n) {
    hj <- 1e-5 * (abs(th[j]) + 1)
    tp <- th; tp[j] <- tp[j] + hj; tm <- th; tm[j] <- tm[j] - hj
    J[, j] <- (g(tp) - g(tm)) / (2 * hj)
  }
  J
}

# ---- mice convergent-validity cross-check (weighted, normal imputation) -----
mice_beta <- function(Z, w, predictor) {
  if (!HAVE_MICE) return(c(beta = NA, se = NA))
  df <- data.frame(math = Z[, 1], x = Z[, 2])
  imp <- mice::mice(df, m = 20, method = "norm", printFlag = FALSE, seed = 2026)
  fits <- with(imp, lm(math ~ x, weights = w))
  po <- summary(mice::pool(fits))
  c(beta = po$estimate[po$term == "x"], se = po$std.error[po$term == "x"])
}

# ---- Run all checks ---------------------------------------------------------
checks <- data.frame()
record <- function(name, jsv, rv, tol) {
  rel <- abs(jsv - rv) / (abs(rv) + 1e-12)
  checks <<- rbind(checks, data.frame(check = name, js = jsv, r = rv,
                                      rel_diff = signif(rel, 3), tol = tol, pass = rel < tol))
}

cat("\n=== FIML verification (independent R EM) ===\n")
for (run in js$runs) {
  d <- build_Z(run$dataset, run$predictor)
  em <- em_mvn(d$Z, d$w)
  cf <- coef_from(em$mu, em$S)
  record(paste0(run$id, "_beta"),  run$beta,  unname(cf["beta"]),  1e-4)
  record(paste0(run$id, "_alpha"), run$alpha, unname(cf["alpha"]), 1e-4)

  th  <- c(em$mu, em$S[1, 1], em$S[1, 2], em$S[2, 2])
  H   <- num_hessian(function(t) obs_loglik(t, d$Z, d$w), th)
  cov <- solve(-H)
  J   <- num_jacobian(function(t) {
    mu <- t[1:2]; S <- matrix(c(t[3], t[4], t[4], t[5]), 2, 2); coef_from(mu, S)
  }, th, 2)
  se  <- sqrt(diag(J %*% cov %*% t(J)))
  record(paste0(run$id, "_se_beta"), run$se_beta, se[2], 5e-3)

  mb <- tryCatch(mice_beta(d$Z, d$w, run$predictor), error = function(e) c(beta = NA, se = NA))
  if (is.finite(mb["beta"])) {
    rel <- abs(run$beta - mb["beta"]) / (abs(mb["beta"]) + 1e-12)
    cat(sprintf("  [mice] %-22s FIML beta=%.4f  mice beta=%.4f  rel=%.3f %s\n",
                run$id, run$beta, mb["beta"], rel, if (rel < 0.05) "(convergent)" else "(check)"))
  }
}

checks$rel_diff <- signif(checks$rel_diff, 3)
write.csv(checks, OUT_CSV, row.names = FALSE)
cat("\n")
print(checks, row.names = FALSE)
np <- sum(checks$pass); nt <- nrow(checks)
cat(sprintf("\n%d / %d checks passed (point estimates 1e-4, numerical-Hessian SE 5e-3).\n", np, nt))
cat(sprintf("Report written to %s\n", OUT_CSV))
if (np < nt) quit(status = 1)
