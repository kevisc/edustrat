# PISA Data Generation Scripts

This directory contains R scripts to generate country-year data chunks for the PISA educational inequality explorer web application.

## Prerequisites

Ensure you have the following R packages installed:

```r
install.packages(c("learningtower", "dplyr", "jsonlite", "tidyr"))
```

## Usage

Run the scripts in order:

### 1. Generate Data Chunks

This creates ~513 JSON files (one per country-year combination):

```r
source("01-generate-chunks.R")
```

**What it does:**
- Loads PISA data for years 2000-2022 from learningtower package
- Creates separate JSON file for each country-year
- Includes all available variables from learningtower
- Saves files to: `../../data/country-year/`

**Expected output:**
- ~513 JSON files (2-5 MB each)
- Total size: ~1.25 GB
- Progress display with file sizes
- Summary statistics table

**Time to complete:** ~10-30 minutes (depending on your machine)

### 2. Generate Metadata

This creates the metadata catalog:

```r
source("02-create-metadata.R")
```

**What it does:**
- Extracts list of all countries and years
- Documents all variables
- Calculates total data size
- Creates metadata.json with data catalog

**Expected output:**
- `../../data/metadata.json` (~20-50 KB)
- Summary of countries, years, variables

**Time to complete:** ~1-2 minutes

### 3. Validate Data Quality

This verifies everything was generated correctly:

```r
source("03-validate-chunks.R")
```

**What it does:**
- Checks metadata file exists and is valid
- Verifies all chunk files exist
- Validates JSON structure (random sample)
- Checks file sizes are reasonable
- Tests loading chunks in R
- Reports any issues found

**Expected output:**
- Validation report with PASS/FAIL for each check
- Warnings for any issues
- Summary of data quality

**Time to complete:** ~1-2 minutes

## Troubleshooting

### Error: Package 'learningtower' not found

```r
install.packages("learningtower")
```

### Error: Cannot create directory

Check that the paths in the scripts match your system. Update the `OUTPUT_DIR` paths if needed.

### Warning: Total size exceeds 1 GB

This is expected. If deploying to GitHub Pages, monitor the repository size. You may need to:
- Use GitHub Releases for data hosting
- Or host data files on a CDN (AWS S3, Cloudflare R2)
- Update `data-loader.js` to fetch from external URL

### Validation fails

Run the validation script to see specific issues:

```r
source("03-validate-chunks.R")
```

Fix any reported issues and re-run the generation scripts.

## Output Files

After running all scripts, you should have:

```
pisa/
└── data/
    ├── metadata.json              # Data catalog
    ├── chunk_summary.csv          # Summary of all chunks
    └── country-year/              # Individual data files
        ├── USA_2000.json
        ├── USA_2003.json
        ├── USA_2018.json
        ├── USA_2022.json
        ├── DEU_2000.json
        └── ... (507 more files)
```

## Next Steps

Once validation passes:

1. **Commit data files** to your Git repository:
   ```bash
   git add pisa/data/
   git commit -m "feat: add PISA country-year data chunks and metadata"
   ```

2. **Proceed to Phase 2**: Core Application Refactoring
   - Create modular JavaScript structure
   - Build data loading system
   - Extract current HTML into modules

## Data Citations

When using this data, please cite:

**Data source:**
OECD (2023). Programme for International Student Assessment (PISA) Database. https://www.oecd.org/pisa/data/

**R package:**
Vaughan, B., Molyneux, N., & Kleissl, M. (2021). learningtower: OECD PISA Datasets from 2000-2022 in an Easy-to-Use Format. R package version 1.0.1. https://CRAN.R-project.org/package=learningtower

## Support

If you encounter issues:
1. Check R package versions are up to date
2. Verify file paths in scripts match your system
3. Check available disk space (~2 GB needed)
4. Review validation script output for specific errors
