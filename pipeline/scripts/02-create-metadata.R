# Generate metadata.json for the PISA data pipeline
# Creates catalog of available countries, years, and variable descriptions
# Author: Kevin Schoenholzer
# Date: 2025-12-15

library(learningtower)
library(dplyr)
library(jsonlite)
library(tidyr)

# Configuration
# Expected working directory: .../pisa/pipeline/scripts
OUTPUT_FILE <- file.path("..", "..", "data", "metadata.json")
CHUNK_DIR <- file.path("..", "..", "data", "country-year")
YEARS <- c(2012, 2015, 2018, 2022)

cat("==================================================\n")
cat("  PISA Metadata Generation\n")
cat("==================================================\n")

# Load data to extract metadata
cat("Loading PISA data from learningtower...\n")
student_data <- load_student(YEARS)
cat(sprintf("Loaded %s records\n\n", format(nrow(student_data), big.mark = ",")))

# Get country information
cat("Extracting country information...\n")
countries_info <- student_data %>%
  group_by(country, year) %>%
  summarise(n_students = n(), .groups = 'drop') %>%
  pivot_wider(names_from = year, values_from = n_students, names_prefix = "y") %>%
  mutate(
    years_available = student_data %>%
      filter(country == first(country)) %>%
      distinct(year) %>%
      pull(year) %>%
      list()
  )

# Create country list for metadata
countries_list <- countries_info %>%
  rowwise() %>%
  mutate(
    total_students = list(setNames(
      c_across(starts_with("y")),
      gsub("y", "", names(select(., starts_with("y"))))
    ))
  ) %>%
  select(code = country, years_available, total_students) %>%
  ungroup()

# Get full country names (using a simple lookup - can be enhanced)
# For now, use the ISO codes as names
countries_list <- countries_list %>%
  mutate(name = code)

# Create variable descriptions
cat("Creating variable descriptions...\n")

# Core variables that are consistently available
core_variables <- tibble::tribble(
  ~name,           ~label,                                    ~type,
  "student_id",    "Student identifier",                      "identifier",
  "school_id",     "School identifier",                       "identifier",
  "country",       "Country ISO code",                        "categorical",
  "year",          "Assessment year",                         "categorical",
  "math",          "Mathematics achievement score",           "continuous",
  "reading",       "Reading achievement score",               "continuous",
  "science",       "Science achievement score",               "continuous",
  "escs",          "Economic, Social, and Cultural Status Index", "continuous",
  "gender",        "Student gender",                          "categorical",
  "age",           "Student age in years",                    "continuous",
  "mother_educ",   "Mother's education (ISCED)",              "ordinal",
  "father_educ",   "Father's education (ISCED)",              "ordinal",
  "computer",      "Computer at home",                        "binary",
  "internet",      "Internet connection at home",             "binary",
  "books",         "Number of books at home",                 "ordinal",
  "wealth",        "Family wealth index",                     "continuous"
)

# Add any additional variables from the actual data
all_vars <- names(student_data)
additional_vars <- setdiff(all_vars, core_variables$name)

if (length(additional_vars) > 0) {
  cat(sprintf("Found %d additional variables\n", length(additional_vars)))

  additional_var_info <- tibble(
    name = additional_vars,
    label = tools::toTitleCase(gsub("_", " ", additional_vars)),
    type = "unknown"  # Can be refined
  )

  all_variables <- bind_rows(core_variables, additional_var_info)
} else {
  all_variables <- core_variables
}

# Calculate total chunk size
cat("Calculating chunk statistics...\n")
chunk_files <- list.files(CHUNK_DIR, pattern = "\\.json$", full.names = TRUE)

if (length(chunk_files) == 0) {
  warning("No chunk files found! Run 01-generate-chunks.R first.")
  total_size_mb <- 0
  n_chunks <- 0
} else {
  total_size_mb <- sum(file.size(chunk_files)) / 1024 / 1024
  n_chunks <- length(chunk_files)
}

# Create metadata structure
cat("Building metadata structure...\n")
metadata <- list(
  generated = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
  version = "1.0.0",
  source = "learningtower R package (OECD PISA data)",
  citations = list(
    data_source = "OECD (2023). Programme for International Student Assessment (PISA) Database. https://www.oecd.org/pisa/data/",
    r_package = "Vaughan, B., Molyneux, N., & Kleissl, M. (2021). learningtower: OECD PISA Datasets from 2000-2022 in an Easy-to-Use Format. R package version 1.0.1. https://CRAN.R-project.org/package=learningtower"
  ),
  years_available = YEARS,
  countries = lapply(1:nrow(countries_list), function(i) {
    row <- countries_list[i, ]
    list(
      code = row$code,
      name = row$name,
      years = unlist(row$years_available),
      total_students = row$total_students[[1]]
    )
  }),
  variables = list(
    student_level = lapply(1:nrow(all_variables), function(i) {
      row <- all_variables[i, ]
      list(
        name = row$name,
        label = row$label,
        type = row$type
      )
    })
  ),
  total_chunks = n_chunks,
  estimated_total_size_mb = round(total_size_mb, 1)
)

# Write metadata
cat(sprintf("Writing metadata to: %s\n", OUTPUT_FILE))
write_json(metadata, OUTPUT_FILE, auto_unbox = TRUE, pretty = TRUE)

# Summary
cat("\n==================================================\n")
cat("  Metadata Generation Complete\n")
cat("==================================================\n")
cat(sprintf("Total countries: %d\n", length(metadata$countries)))
cat(sprintf("Total years: %d (%s)\n",
            length(metadata$years_available),
            paste(metadata$years_available, collapse = ", ")))
cat(sprintf("Total variables documented: %d\n", length(metadata$variables$student_level)))
cat(sprintf("Total chunks referenced: %d\n", metadata$total_chunks))
cat(sprintf("Estimated total size: %.1f MB (%.2f GB)\n",
            metadata$estimated_total_size_mb,
            metadata$estimated_total_size_mb / 1024))

cat("\n✓ Metadata file ready!\n")
cat("==================================================\n")
