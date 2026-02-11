# Validate PISA Data Chunks
# Verifies that all chunks are correctly generated and loadable
# Author: Kevin Schoenholzer
# Date: 2025-12-15

library(jsonlite)
library(dplyr)

# Configuration
# Expected working directory: .../pisa/pipeline/scripts
CHUNK_DIR <- file.path("..", "..", "data", "country-year")
METADATA_FILE <- file.path("..", "..", "data", "metadata.json")
YEARS <- c(2012, 2015, 2018, 2022)

# Validation results
validation_passed <- TRUE
issues <- list()

cat("==================================================\n")
cat("  PISA Data Chunk Validation\n")
cat("==================================================\n\n")

# 1. Check if metadata exists
cat("[1/6] Checking metadata file...\n")
if (!file.exists(METADATA_FILE)) {
  cat("  ✗ FAIL: metadata.json not found!\n")
  cat(sprintf("    Expected location: %s\n", METADATA_FILE))
  validation_passed <- FALSE
  issues <- append(issues, "Metadata file missing")
} else {
  cat("  ✓ PASS: metadata.json exists\n")

  # Try to load metadata
  tryCatch({
    metadata <- fromJSON(METADATA_FILE)
    cat(sprintf("  ✓ PASS: metadata.json is valid JSON\n"))
    cat(sprintf("    Countries: %d\n", length(metadata$countries)))
    cat(sprintf("    Years: %s\n", paste(metadata$years_available, collapse = ", ")))
    cat(sprintf("    Total chunks: %d\n", metadata$total_chunks))
  }, error = function(e) {
    cat(sprintf("  ✗ FAIL: metadata.json is invalid: %s\n", e$message))
    validation_passed <<- FALSE
    issues <<- append(issues, "Invalid metadata JSON")
  })
}

# 2. Check chunk files
cat("\n[2/6] Checking chunk files...\n")
chunk_files <- list.files(CHUNK_DIR, pattern = "\\.json$", full.names = TRUE)

if (length(chunk_files) == 0) {
  cat("  ✗ FAIL: No chunk files found!\n")
  cat(sprintf("    Expected directory: %s\n", CHUNK_DIR))
  validation_passed <- FALSE
  issues <- append(issues, "No chunk files found")
} else {
  cat(sprintf("  ✓ PASS: Found %d chunk files\n", length(chunk_files)))

  # Check if count matches expected
  if (exists("metadata")) {
    if (length(chunk_files) == metadata$total_chunks) {
      cat(sprintf("  ✓ PASS: File count matches metadata (%d files)\n", metadata$total_chunks))
    } else {
      cat(sprintf("  ⚠ WARNING: File count mismatch (found %d, metadata says %d)\n",
                  length(chunk_files), metadata$total_chunks))
    }
  }
}

# 3. Validate JSON structure of chunks
cat("\n[3/6] Validating JSON structure (random sample of 10)...\n")
sample_files <- sample(chunk_files, min(10, length(chunk_files)))
json_valid_count <- 0
required_fields <- c("country", "year", "n_students", "data_quality", "students")

for (file in sample_files) {
  filename <- basename(file)
  tryCatch({
    chunk <- fromJSON(file)

    # Check required fields
    missing_fields <- setdiff(required_fields, names(chunk))
    if (length(missing_fields) > 0) {
      cat(sprintf("  ✗ FAIL: %s missing fields: %s\n",
                  filename,
                  paste(missing_fields, collapse = ", ")))
      validation_passed <<- FALSE
      issues <<- append(issues, sprintf("Missing fields in %s", filename))
    } else {
      json_valid_count <- json_valid_count + 1
    }
  }, error = function(e) {
    cat(sprintf("  ✗ FAIL: %s is invalid JSON: %s\n", filename, e$message))
    validation_passed <<- FALSE
    issues <<- append(issues, sprintf("Invalid JSON in %s", filename))
  })
}

if (json_valid_count == length(sample_files)) {
  cat(sprintf("  ✓ PASS: All sampled files have valid structure (%d/%d)\n",
              json_valid_count, length(sample_files)))
} else {
  cat(sprintf("  ⚠ WARNING: Some files have issues (%d/%d valid)\n",
              json_valid_count, length(sample_files)))
}

# 4. Check file sizes
cat("\n[4/6] Checking file sizes...\n")
file_sizes_mb <- file.size(chunk_files) / 1024 / 1024
total_size_mb <- sum(file_sizes_mb)
mean_size_mb <- mean(file_sizes_mb)
min_size_mb <- min(file_sizes_mb)
max_size_mb <- max(file_sizes_mb)

cat(sprintf("  Total size: %.1f MB (%.2f GB)\n", total_size_mb, total_size_mb / 1024))
cat(sprintf("  Average file size: %.2f MB\n", mean_size_mb))
cat(sprintf("  Size range: %.2f - %.2f MB\n", min_size_mb, max_size_mb))

# Check for suspiciously small files (< 0.1 MB)
small_files <- chunk_files[file_sizes_mb < 0.1]
if (length(small_files) > 0) {
  cat(sprintf("  ⚠ WARNING: %d files smaller than 0.1 MB:\n", length(small_files)))
  for (f in head(small_files, 5)) {
    cat(sprintf("    - %s (%.3f MB)\n", basename(f), file.size(f) / 1024 / 1024))
  }
  if (length(small_files) > 5) {
    cat(sprintf("    ... and %d more\n", length(small_files) - 5))
  }
}

# Check for very large files (> 10 MB)
large_files <- chunk_files[file_sizes_mb > 10]
if (length(large_files) > 0) {
  cat(sprintf("  ℹ INFO: %d files larger than 10 MB:\n", length(large_files)))
  for (f in head(large_files, 5)) {
    cat(sprintf("    - %s (%.2f MB)\n", basename(f), file.size(f) / 1024 / 1024))
  }
  if (length(large_files) > 5) {
    cat(sprintf("    ... and %d more\n", length(large_files) - 5))
  }
}

# Check total size vs GitHub limit
if (total_size_mb > 1024) {  # 1 GB
  cat(sprintf("  ⚠ WARNING: Total size (%.2f GB) exceeds 1 GB (may affect GitHub deployment)\n",
              total_size_mb / 1024))
  issues <- append(issues, "Total size may be too large for GitHub")
} else {
  cat(sprintf("  ✓ PASS: Total size is within GitHub recommended limits\n"))
}

# 5. Check naming convention
cat("\n[5/6] Checking file naming convention...\n")
naming_issues <- 0
for (file in chunk_files) {
  filename <- basename(file)
  # Expected format: COUNTRY_YEAR.json
  if (!grepl("^[A-Z]{3}_\\d{4}\\.json$", filename)) {
    if (naming_issues < 5) {  # Only show first 5
      cat(sprintf("  ⚠ WARNING: Unusual filename format: %s\n", filename))
    }
    naming_issues <- naming_issues + 1
  }
}

if (naming_issues == 0) {
  cat("  ✓ PASS: All files follow naming convention (XXX_YYYY.json)\n")
} else {
  cat(sprintf("  ⚠ WARNING: %d files have unusual naming\n", naming_issues))
}

# 6. Test loading in R (simulate browser load)
cat("\n[6/6] Testing chunk loading (sample of 3)...\n")
test_files <- sample(chunk_files, min(3, length(chunk_files)))
load_success <- 0

for (file in test_files) {
  filename <- basename(file)
  tryCatch({
    chunk <- fromJSON(file)
    n_students <- chunk$n_students
    n_records <- nrow(chunk$students)

    if (n_students == n_records) {
      cat(sprintf("  ✓ PASS: %s loads correctly (%d students)\n", filename, n_students))
      load_success <- load_success + 1
    } else {
      cat(sprintf("  ✗ FAIL: %s student count mismatch (header: %d, actual: %d)\n",
                  filename, n_students, n_records))
      validation_passed <<- FALSE
      issues <<- append(issues, sprintf("Student count mismatch in %s", filename))
    }
  }, error = function(e) {
    cat(sprintf("  ✗ FAIL: Error loading %s: %s\n", filename, e$message))
    validation_passed <<- FALSE
    issues <<- append(issues, sprintf("Error loading %s", filename))
  })
}

# Final summary
cat("\n==================================================\n")
cat("  Validation Summary\n")
cat("==================================================\n")

if (validation_passed) {
  cat("✓ All validation checks PASSED!\n")
  cat("\nData chunks are ready for deployment.\n")
  cat("\nNext steps:\n")
  cat("1. Commit data files to Git repository\n")
  cat("2. Begin Phase 2: Core Application Refactoring\n")
} else {
  cat("✗ Validation FAILED!\n")
  cat(sprintf("\nFound %d issues:\n", length(issues)))
  for (i in seq_along(issues)) {
    cat(sprintf("%d. %s\n", i, issues[i]))
  }
  cat("\nPlease fix these issues before proceeding.\n")
}

cat("==================================================\n")

# Return validation status (invisible)
invisible(validation_passed)
