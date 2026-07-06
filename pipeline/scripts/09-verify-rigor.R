# =============================================================================
# 09-verify-rigor.R
# Verify the Phase-5 "rigor ladder" estimators against independent R references.
#
#   - Theil-T index + within/between decomposition  -> definitional base R
#   - Cluster-robust (school) standard errors       -> sandwich::vcovCL (HC1)
#   - Oaxaca–Blinder threefold/twofold              -> base-R lm algebra
#   - Plausible-value pooling (Rubin's rules)       -> base R on synthetic data
#   - FE within/between R²                          -> plm + Stata-convention manual
#   - Senate-weighted slope                          -> lm with rescaled weights
#
# Workflow:
#   cd pipeline/verification && node run-rigor.mjs   # -> rigor-js-results.json
#   Rscript pipeline/scripts/09-verify-rigor.R       # -> rigor-verification-report.csv
#
# Author: Kevin Schoenholzer
# =============================================================================

suppressPackageStartupMessages({
  library(jsonlite); library(sandwich); library(plm)
})

find_script_dir <- function() {
  a <- commandArgs(trailingOnly = FALSE)
  f <- sub("^--file=", "", a[grepl("^--file=", a)])
  if (length(f) == 1) return(dirname(normalizePath(f)))
  normalizePath(".")
}
REPO      <- normalizePath(file.path(find_script_dir(), "..", ".."))
CHUNK_DIR <- file.path(REPO, "data", "country-year")
VDIR      <- file.path(REPO, "pipeline", "verification")
js <- fromJSON(file.path(VDIR, "rigor-js-results.json"))$results

load_chunk <- function(code) {
  s <- fromJSON(file.path(CHUNK_DIR, paste0(code, ".json")))$students
  s$math <- suppressWarnings(as.numeric(s$math))
  s$escs <- suppressWarnings(as.numeric(s$escs))
  s$stu_wgt <- suppressWarnings(as.numeric(s$stu_wgt))
  s$stu_wgt[!is.finite(s$stu_wgt) | s$stu_wgt <= 0] <- 1
  s
}
fin <- load_chunk("FIN_2018"); mex <- load_chunk("MEX_2018"); deu <- load_chunk("DEU_2018")

checks <- data.frame()
record <- function(name, jsv, rv, tol) {
  rel <- abs(jsv - rv) / (abs(rv) + 1e-12)
  checks <<- rbind(checks, data.frame(check = name, js = jsv, r = rv,
                                      rel_diff = signif(rel, 3), tol = tol, pass = rel < tol))
}

# ---- 1. Theil-T + decomposition ----------------------------------------------
theil_w <- function(y, w) {
  k <- is.finite(y) & y > 0 & w > 0; y <- y[k]; w <- w[k]
  mu <- weighted.mean(y, w)
  sum(w * (y / mu) * log(y / mu)) / sum(w)
}
record("theil_fin_math", js$theil_fin_math, theil_w(fin$math, fin$stu_wgt), 1e-10)

pooled <- rbind(fin[, c("country", "math", "stu_wgt")], mex[, c("country", "math", "stu_wgt")])
pooled <- pooled[is.finite(pooled$math), ]
mu_all <- weighted.mean(pooled$math, pooled$stu_wgt)
groups <- split(pooled, pooled$country)
swy_all <- sum(pooled$stu_wgt * pooled$math)
within <- 0; between <- 0
for (g in groups) {
  share <- sum(g$stu_wgt * g$math) / swy_all
  mu_g <- weighted.mean(g$math, g$stu_wgt)
  within <- within + share * theil_w(g$math, g$stu_wgt)
  between <- between + share * log(mu_g / mu_all)
}
record("theil_decomp_within",  js$theil_decomp$within,  within,  1e-10)
record("theil_decomp_between", js$theil_decomp$between, between, 1e-10)
record("theil_decomp_total",   js$theil_decomp$total,   within + between, 1e-10)

# ---- 2. Cluster-robust (school) SEs -------------------------------------------
d <- fin[is.finite(fin$math) & is.finite(fin$escs), ]
m <- lm(math ~ escs, data = d, weights = stu_wgt)
Vc <- vcovCL(m, cluster = d$school_id, type = "HC1")
record("cluster_se_intercept", js$cluster$seCluster[1], sqrt(Vc[1, 1]), 1e-6)
record("cluster_se_escs",      js$cluster$seCluster[2], sqrt(Vc[2, 2]), 1e-6)
record("cluster_n",            js$cluster$nClusters,    length(unique(d$school_id)), 1e-12)

# ---- 3. Oaxaca–Blinder (FIN vs MEX, gender control) -----------------------------
prep_ox <- function(s) {
  s$female <- ifelse(is.na(s$gender), NA, ifelse(substr(tolower(s$gender), 1, 1) == "f", 1,
                                          ifelse(substr(tolower(s$gender), 1, 1) == "m", 0, NA)))
  s[is.finite(s$math) & is.finite(s$escs) & is.finite(s$female), ]
}
a <- prep_ox(fin); b <- prep_ox(mex)
ma <- lm(math ~ escs + female, data = a, weights = stu_wgt)
mb <- lm(math ~ escs + female, data = b, weights = stu_wgt)
wm <- function(v, w) weighted.mean(v, w)
xa <- c(1, wm(a$escs, a$stu_wgt), wm(a$female, a$stu_wgt))
xb <- c(1, wm(b$escs, b$stu_wgt), wm(b$female, b$stu_wgt))
ba <- coef(ma); bb <- coef(mb)
E <- sum((xa - xb) * bb); C <- sum(xb * (ba - bb)); I <- sum((xa - xb) * (ba - bb))
gap <- wm(a$math, a$stu_wgt) - wm(b$math, b$stu_wgt)
record("oaxaca_gap",          js$oaxaca$gap,          gap, 1e-8)
record("oaxaca_endowments",   js$oaxaca$endowments,   E,   1e-6)
record("oaxaca_coefficients", js$oaxaca$coefficients, C,   1e-6)
record("oaxaca_interaction",  js$oaxaca$interaction,  I,   1e-6)
record("oaxaca_explained",    js$oaxaca$explained,    E,   1e-6)
record("oaxaca_unexplained",  js$oaxaca$unexplained,  C + I, 1e-6)
record("oaxaca_identity",     js$oaxaca$endowments + js$oaxaca$coefficients + js$oaxaca$interaction,
       js$oaxaca$gap, 1e-8)

# ---- 4. Plausible-value pooling (synthetic) --------------------------------------
syn <- read.csv(file.path(VDIR, "rigor-synthetic-pv.csv"))
M <- 5
Q <- numeric(M); U <- numeric(M)
for (m_i in seq_len(M)) {
  fit <- lm(syn[[paste0("pv", m_i)]] ~ x, data = syn, weights = w)
  Q[m_i] <- coef(fit)["x"]
  U[m_i] <- summary(fit)$coefficients["x", 2]^2
}
Qbar <- mean(Q); Ubar <- mean(U); B <- var(Q)
Tv <- Ubar + (1 + 1 / M) * B
df <- (M - 1) * (1 + Ubar / ((1 + 1 / M) * B))^2
record("pv_pooled_estimate", js$pvPooling$estimate, Qbar,     1e-8)
record("pv_pooled_se",       js$pvPooling$se,       sqrt(Tv), 1e-8)
record("pv_pooled_within",   js$pvPooling$within,   Ubar,     1e-8)
record("pv_pooled_between",  js$pvPooling$between,  B,        1e-8)
record("pv_pooled_df",       js$pvPooling$df,       df,       1e-8)

# ---- 5. FE within/between R² (unweighted) ----------------------------------------
d3 <- rbind(fin, mex, deu)
d3 <- d3[is.finite(d3$math) & is.finite(d3$escs), ]
p <- pdata.frame(d3, index = "country")
mw <- plm(math ~ escs, data = p, model = "within")
record("fe_r2_within_plm", js$feR2$r2Within, unname(summary(mw)$r.squared["rsq"]), 1e-8)
bcoef <- coef(mw)["escs"]
gm <- aggregate(cbind(math, xb = bcoef * escs) ~ country, data = d3, FUN = mean)
record("fe_r2_between_stata", js$feR2$r2Between, cor(gm$math, gm$xb)^2, 1e-8)

# ---- 6. Senate-weighted slope ------------------------------------------------------
# Senate weights are defined on the FULL country-cycle sample (each country-cycle
# sums to 5,000) BEFORE any analysis filtering — matching the app's data loader.
d6 <- rbind(fin, mex)
key <- paste(d6$country, "2018")
d6$sw <- ave(d6$stu_wgt, key, FUN = function(v) v * 5000 / sum(v))
d6 <- d6[is.finite(d6$math) & is.finite(d6$escs), ]
ms <- lm(math ~ escs, data = d6, weights = sw)
record("senate_slope", js$senate$beta, unname(coef(ms)["escs"]), 1e-6)
record("senate_se",    js$senate$se,   summary(ms)$coefficients["escs", 2], 1e-6)

# ---- Report -----------------------------------------------------------------------
write.csv(checks, file.path(VDIR, "rigor-verification-report.csv"), row.names = FALSE)
cat("\n=== Rigor-ladder verification ===\n")
print(checks, row.names = FALSE)
np <- sum(checks$pass); nt <- nrow(checks)
cat(sprintf("\n%d / %d rigor checks passed.\n", np, nt))
if (np < nt) quit(status = 1)
