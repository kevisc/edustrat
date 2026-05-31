# =============================================================================
# 05-add-replicate-weights.R
# Generate country-year chunks that carry PISA's 80 Fay BRR replicate weights.
#
# The learningtower package that seeded EduStrat ships only the final weight
# (W_FSTUWT), so the original 513 chunks cannot support design-correct (BRR)
# standard errors. This script re-sources the raw OECD Public Use File for one
# cycle, extracts the final weight AND the 80 replicate weights (W_FSTURWT1..80)
# plus the analysis variables, and writes augmented chunks for a chosen set of
# countries. Each student record gains a `rep_wgts` array; all other fields match
# the existing chunk schema so point estimates are unchanged.
#
# Limited scope by design: run for the cycle/countries you need. The OECD student
# questionnaire file is large (~500 MB zipped); haven::read_sav(col_select=) keeps
# memory bounded by reading only the required columns.
#
# Usage (after downloading SPSS_STU_QQQ.zip from
#   https://webfs.oecd.org/pisa2018/SPSS_STU_QQQ.zip ):
#   Rscript pipeline/scripts/05-add-replicate-weights.R \
#       /path/to/SPSS_STU_QQQ.zip 2018 FIN USA DEU KOR MEX
#
# Author: Kevin Schoenholzer
# =============================================================================

suppressPackageStartupMessages({ library(haven); library(jsonlite) })

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) stop("Usage: 05-add-replicate-weights.R <spss_zip_or_sav> <year> <CNT> [CNT...]")
SRC      <- args[1]
YEAR     <- as.integer(args[2])
COUNTRIES <- args[-(1:2)]

# Resolve script dir -> repo root -> output chunk dir
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
  tmp <- file.path(tempdir(), "pisa_sav")
  dir.create(tmp, showWarnings = FALSE)
  inside <- unzip(SRC, list = TRUE)
  member <- inside$Name[grepl("\\.sav$", inside$Name, ignore.case = TRUE)][1]
  message("Unzipping ", member, " ...")
  unzip(SRC, files = member, exdir = tmp)
  sav <- file.path(tmp, member)
}

# ---- Columns to read (PISA 2018 SPSS names) ---------------------------------
REP_WTS  <- sprintf("W_FSTURWT%d", 1:80)
KEEP <- c("CNT", "CNTSCHID", "CNTSTUID", "ST004D01T", "MISCED", "FISCED",
          "PV1MATH", "PV1READ", "PV1SCIE", "ESCS", "WEALTH",
          "W_FSTUWT", REP_WTS)

message("Reading ", basename(sav), " (selected columns only)...")
dat <- read_sav(sav, col_select = any_of(KEEP))
dat <- as.data.frame(dat)
message("Read ", nrow(dat), " rows x ", ncol(dat), " cols.")

# Gender label to match existing chunks: ST004D01T 1=female, 2=male
gender_label <- function(v) ifelse(is.na(v), NA, ifelse(v == 1, "female", ifelse(v == 2, "male", NA)))

written <- 0
for (cnt in COUNTRIES) {
  sub <- dat[dat$CNT == cnt, , drop = FALSE]
  if (nrow(sub) == 0) { message("  ! no rows for ", cnt); next }

  students <- lapply(seq_len(nrow(sub)), function(i) {
    r <- sub[i, ]
    list(
      year        = YEAR,
      country     = cnt,
      school_id   = as.character(r$CNTSCHID),
      student_id  = as.character(r$CNTSTUID),
      gender      = gender_label(as.numeric(r$ST004D01T)),
      mother_educ = if (is.na(r$MISCED)) NULL else paste("ISCED", as.numeric(r$MISCED)),
      father_educ = if (is.na(r$FISCED)) NULL else paste("ISCED", as.numeric(r$FISCED)),
      math        = round(as.numeric(r$PV1MATH), 3),
      reading     = round(as.numeric(r$PV1READ), 3),
      science     = round(as.numeric(r$PV1SCIE), 3),
      escs        = round(as.numeric(r$ESCS), 4),
      wealth      = round(as.numeric(r$WEALTH), 4),
      stu_wgt     = round(as.numeric(r$W_FSTUWT), 4),
      rep_wgts    = round(as.numeric(unlist(r[REP_WTS])), 4)
    )
  })

  chunk <- list(
    country = cnt, year = YEAR, n_students = length(students),
    data_quality = list(has_replicate_weights = TRUE, n_replicates = 80L,
                        weight_method = "Fay BRR (k=0.5)", plausible_values = 1L),
    students = students
  )
  out <- file.path(OUT_DIR, sprintf("%s_%d.json", cnt, YEAR))
  write_json(chunk, out, auto_unbox = TRUE, digits = 6, null = "null")
  message(sprintf("  wrote %s (%d students, 80 replicate weights each)", basename(out), length(students)))
  written <- written + 1
}
message("Done. ", written, " chunk(s) regenerated with replicate weights.")
