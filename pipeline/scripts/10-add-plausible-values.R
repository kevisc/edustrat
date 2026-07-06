# =============================================================================
# 10-add-plausible-values.R
# Generate country-year chunks that carry ALL of PISA's plausible values.
#
# The learningtower package that seeded EduStrat ships only the first plausible
# value per domain, so a single-PV analysis omits the measurement (imputation)
# component of variance. This script re-sources the raw OECD Public Use File for
# one cycle and writes augmented chunks in which every student record gains
# pv1_math..pv10_math, pv1_reading..pv10_reading, pv1_science..pv10_science
# (2015+ cycles have 10 PVs; 2000–2012 have 5). All other fields match the
# existing chunk schema; the legacy math/reading/science fields keep PV1, so
# every existing analysis is unchanged and js/analysis/pv-pooling.js activates
# automatically when it detects the pv fields.
#
# Same limited-scope template pattern as 05-add-replicate-weights.R: run it for
# the cycle/countries you need. Combine with 05 (run both) to get chunks that
# carry replicate weights AND plausible values.
#
# Usage (after downloading e.g. SPSS_STU_QQQ.zip for the cycle):
#   Rscript pipeline/scripts/10-add-plausible-values.R \
#       /path/to/SPSS_STU_QQQ.zip 2018 FIN USA DEU KOR MEX
#
# Author: Kevin Schoenholzer
# =============================================================================

suppressPackageStartupMessages({ library(haven); library(jsonlite) })

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) stop("Usage: 10-add-plausible-values.R <spss_zip_or_sav> <year> <CNT> [CNT...]")
SRC       <- args[1]
YEAR      <- as.integer(args[2])
COUNTRIES <- args[-(1:2)]
N_PV      <- if (YEAR >= 2015) 10 else 5

find_script_dir <- function() {
  a <- commandArgs(trailingOnly = FALSE)
  f <- sub("^--file=", "", a[grepl("^--file=", a)])
  if (length(f) == 1) return(dirname(normalizePath(f)))
  normalizePath(".")
}
REPO    <- normalizePath(file.path(find_script_dir(), "..", ".."))
OUT_DIR <- file.path(REPO, "data", "country-year")

# ---- Locate the .sav (unzip if needed) --------------------------------------
sav <- SRC
if (grepl("\\.zip$", SRC, ignore.case = TRUE)) {
  tmp <- file.path(tempdir(), "pisa_sav_pv")
  dir.create(tmp, showWarnings = FALSE)
  inside <- unzip(SRC, list = TRUE)
  member <- inside$Name[grepl("\\.sav$", inside$Name, ignore.case = TRUE)][1]
  message("Unzipping ", member, " ...")
  unzip(SRC, files = member, exdir = tmp)
  sav <- file.path(tmp, member)
}

# ---- Columns to read ---------------------------------------------------------
pv_cols <- function(stub) sprintf("PV%d%s", seq_len(N_PV), stub)
KEEP <- c("CNT", "CNTSCHID", "CNTSTUID", "ST004D01T", "MISCED", "FISCED",
          pv_cols("MATH"), pv_cols("READ"), pv_cols("SCIE"),
          "ESCS", "WEALTH", "W_FSTUWT")

message("Reading ", basename(sav), " (selected columns only)...")
dat <- read_sav(sav, col_select = any_of(KEEP))
dat <- as.data.frame(dat)
message("Read ", nrow(dat), " rows x ", ncol(dat), " cols.")

gender_label <- function(v) ifelse(is.na(v), NA, ifelse(v == 1, "female", ifelse(v == 2, "male", NA)))

num <- function(v) suppressWarnings(as.numeric(v))

written <- 0
for (cnt in COUNTRIES) {
  d <- dat[dat$CNT == cnt, ]
  if (nrow(d) == 0) { message("No rows for ", cnt, " — skipped."); next }

  students <- data.frame(
    year       = YEAR,
    country    = cnt,
    school_id  = paste0(cnt, "_", YEAR, "_", d$CNTSCHID),
    student_id = paste0(cnt, "_", YEAR, "_", d$CNTSTUID),
    gender     = gender_label(num(d$ST004D01T)),
    # Legacy single-PV fields stay PV1 so existing analyses are unchanged.
    math       = round(num(d$PV1MATH), 2),
    reading    = round(num(d$PV1READ), 2),
    science    = round(num(d$PV1SCIE), 2),
    escs       = round(num(d$ESCS), 4),
    wealth     = round(num(d$WEALTH), 4),
    stu_wgt    = round(num(d$W_FSTUWT), 4),
    stringsAsFactors = FALSE
  )
  for (m in seq_len(N_PV)) {
    students[[sprintf("pv%d_math", m)]]    <- round(num(d[[sprintf("PV%dMATH", m)]]), 2)
    students[[sprintf("pv%d_reading", m)]] <- round(num(d[[sprintf("PV%dREAD", m)]]), 2)
    students[[sprintf("pv%d_science", m)]] <- round(num(d[[sprintf("PV%dSCIE", m)]]), 2)
  }

  chunk <- list(
    country = cnt,
    year = YEAR,
    n_students = nrow(students),
    n_plausible_values = N_PV,
    data_quality = list(
      missing_math    = sum(!is.finite(students$math)),
      missing_reading = sum(!is.finite(students$reading)),
      missing_science = sum(!is.finite(students$science)),
      missing_escs    = sum(!is.finite(students$escs)),
      complete_cases  = sum(stats::complete.cases(students[, c("math", "reading", "science", "escs")]))
    ),
    students = students
  )

  out <- file.path(OUT_DIR, paste0(cnt, "_", YEAR, ".json"))
  write_json(chunk, out, auto_unbox = TRUE, digits = 8, na = "null")
  message("Wrote ", out, " (", nrow(students), " students, ", N_PV, " PVs per domain)")
  written <- written + 1
}

message(written, " chunk(s) written. js/analysis/pv-pooling.js will detect the pv fields automatically.")
