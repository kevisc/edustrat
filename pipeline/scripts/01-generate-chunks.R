# Generate Country-Year Data Chunks for the PISA data pipeline
# Creates individual JSON files for each country-year combination
# Author: Kevin Schoenholzer
# Date: 2025-12-15

library(learningtower)
library(dplyr)
library(jsonlite)
library(tidyr)

# Configuration
# Expected working directory: .../pisa/pipeline/scripts
OUTPUT_DIR <- file.path("..", "..", "data", "country-year")
# Include all PISA assessment cycles from 2000-present
YEARS <- c(2000, 2003, 2006, 2009, 2012, 2015, 2018, 2022)

# Create output directory
dir.create(OUTPUT_DIR, recursive = TRUE, showWarnings = FALSE)

cat("==================================================\n")
cat("  PISA Data Chunk Generation\n")
cat("==================================================\n")
cat(sprintf("Output directory: %s\n", OUTPUT_DIR))
cat(sprintf("Years: %s\n\n", paste(YEARS, collapse = ", ")))

# Load PISA data from learningtower package
cat("Loading PISA data from learningtower package...\n")
student_data <- load_student(YEARS)
cat(sprintf("Loaded %s total student records\n\n", format(nrow(student_data), big.mark = ",")))

# Display available variables
cat("Available variables:\n")
cat(paste(names(student_data), collapse = ", "), "\n\n")

# Get unique country-year combinations
combinations <- student_data %>%
  distinct(country, year) %>%
  arrange(country, year)

cat(sprintf("Found %d country-year combinations\n", nrow(combinations)))
cat(sprintf("Creating %d JSON files...\n\n", nrow(combinations)))

# Progress tracking
total_size_bytes <- 0
start_time <- Sys.time()

# Function to create chunk for one country-year
create_chunk <- function(country_code, year_value, index, total) {

  cat(sprintf("[%d/%d] Processing %s %d... ", index, total, country_code, year_value))

  # Filter data for this country-year
  chunk_data <- student_data %>%
    filter(country == country_code, year == year_value)

  # Data quality metrics
  quality <- list(
    missing_math = sum(is.na(chunk_data$math)),
    missing_reading = sum(is.na(chunk_data$read)),
    missing_science = sum(is.na(chunk_data$science)),
    missing_escs = sum(is.na(chunk_data$escs)),
    complete_cases = sum(complete.cases(chunk_data %>% select(math, read, science, escs)))
  )

  # Prepare student records - keep ALL available variables from learningtower
  students <- chunk_data %>%
    mutate(
      student_id = paste(country, year, student_id, sep = "_"),
      school_id = paste(country, year, school_id, sep = "_"),
      reading = read  # Rename 'read' to 'reading' for clarity
    ) %>%
    select(-read)  # Remove original 'read' column

  # Create chunk structure
  chunk <- list(
    country = country_code,
    year = year_value,
    n_students = nrow(students),
    data_quality = quality,
    students = students
  )

  # Write to JSON
  filename <- sprintf("%s/%s_%d.json", OUTPUT_DIR, country_code, year_value)
  write_json(chunk, filename, auto_unbox = TRUE, pretty = FALSE)

  file_size_mb <- file.size(filename) / 1024 / 1024

  cat(sprintf("✓ (%d students, %.2f MB)\n", nrow(students), file_size_mb))

  return(list(
    country = country_code,
    year = year_value,
    n_students = nrow(students),
    file_size_mb = file_size_mb,
    file_size_bytes = file.size(filename)
  ))
}

# Generate all chunks with progress tracking
results_list <- list()
for (i in 1:nrow(combinations)) {
  result <- create_chunk(
    combinations$country[i],
    combinations$year[i],
    i,
    nrow(combinations)
  )
  results_list[[i]] <- result
  total_size_bytes <- total_size_bytes + result$file_size_bytes
}

# Convert results to data frame
results <- bind_rows(results_list)

# Summary
end_time <- Sys.time()
duration <- as.numeric(difftime(end_time, start_time, units = "mins"))

cat("\n==================================================\n")
cat("  Generation Complete\n")
cat("==================================================\n")
cat(sprintf("Total files created: %d\n", nrow(results)))
cat(sprintf("Total size: %.1f MB (%.2f GB)\n",
            sum(results$file_size_mb),
            sum(results$file_size_mb) / 1024))
cat(sprintf("Average file size: %.2f MB\n", mean(results$file_size_mb)))
cat(sprintf("Size range: %.2f - %.2f MB\n",
            min(results$file_size_mb),
            max(results$file_size_mb)))
cat(sprintf("Time elapsed: %.1f minutes\n\n", duration))

# Show largest files
cat("Largest files (Top 10):\n")
cat("Country Year  Students  Size(MB)\n")
cat("-------- ----  --------  --------\n")
top10 <- results %>%
  arrange(desc(file_size_mb)) %>%
  head(10)
for (i in 1:nrow(top10)) {
  cat(sprintf("%-8s %-4d  %8d  %8.2f\n",
              top10$country[i],
              top10$year[i],
              top10$n_students[i],
              top10$file_size_mb[i]))
}

cat("\nSmallest files (Top 10):\n")
cat("Country Year  Students  Size(MB)\n")
cat("-------- ----  --------  --------\n")
bottom10 <- results %>%
  arrange(file_size_mb) %>%
  head(10)
for (i in 1:nrow(bottom10)) {
  cat(sprintf("%-8s %-4d  %8d  %8.2f\n",
              bottom10$country[i],
              bottom10$year[i],
              bottom10$n_students[i],
              bottom10$file_size_mb[i]))
}

# Save summary statistics
summary_file <- sprintf("%s/../chunk_summary.csv", OUTPUT_DIR)
write.csv(results, summary_file, row.names = FALSE)
cat(sprintf("\n✓ Summary saved to: %s\n", summary_file))

cat("\n==================================================\n")
cat("✓ Data chunks ready for deployment!\n")
cat("==================================================\n")
