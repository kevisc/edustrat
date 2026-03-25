# EduStrat: Educational Stratification in PISA

A browser-based statistical tool for exploratory analysis of how parental socioeconomic characteristics (education, occupation, wealth — captured by the ESCS index) relate to student academic achievement in PISA data across 101 countries and 8 assessment cycles (2000–2022).

**Live Demo:** [kevinschoenholzer.com/edustrat/](https://kevinschoenholzer.com/edustrat/)

[![Status](https://img.shields.io/badge/status-complete-success)](https://github.com/kevisc/edustrat)
[![Data Source](https://img.shields.io/badge/data-OECD%20PISA-blue)](https://www.oecd.org/pisa/data/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## Overview

This application provides researchers and the public with an accessible, browser-based tool for analyzing socioeconomic inequality in educational achievement using OECD Programme for International Student Assessment (PISA) data. It is specifically geared to understanding how the ESCS index (parental wealth, occupation, and education) relates to student outcomes across countries and over time. Built with vanilla JavaScript and ES6 modules, it loads data progressively on-demand and provides comprehensive statistical analysis with publication-ready exports.

### Key Features

- 📊 **Progressive Data Loading** - Only fetches selected country-year combinations (~30-40 MB typical vs ~1.25 GB full dataset)
- 🔬 **Survey-Weighted Analysis** - OECD-compliant statistical methods with proper sampling weights
- 📈 **7 Analysis Tabs** - Overview, Distribution, Achievement Gap, Regression, Diagnostics, Comparative, Methodology
- 📥 **Comprehensive Exports** - CSV results, high-res figures (PNG/SVG), full HTML reports, filtered datasets
- 📚 **Academic Documentation** - Complete methodology, citations, and data sources
- 🎨 **Dark Theme UI** - Modern, accessible interface with interactive visualizations

### Data Coverage

- **Years**: 2000, 2003, 2006, 2009, 2012, 2015, 2018, 2022 (8 PISA cycles)
- **Countries**: 101 unique countries/economies
- **Students**: ~3.5 million total across all cycles
- **Variables**: Achievement scores (math, reading, science), ESCS, demographics, parental education, weights

## Table of Contents

- [Quick Start](#quick-start)
- [Project Status](#project-status)
- [Architecture](#architecture)
- [Features](#features)
- [Development](#development)
- [Data Pipeline](#data-pipeline)
- [Documentation](#documentation)
- [Validation and Testing](#validation-and-testing)
- [Contributing](#contributing)
- [Citation](#citation)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Quick Start

### Prerequisites

- **R** (version 4.0+) with packages: `learningtower`, `dplyr`, `jsonlite`, `tidyr`
- **Web Server** - Python HTTP server, VSCode Live Server, or similar
- **Modern Browser** - Chrome 90+, Firefox 88+, Safari 14+, or Edge 90+

### 1. Generate Data Files (One-Time Setup)

The data generation process creates 513 country-year JSON files (~1.25 GB total) from the learningtower R package.

```r
# Install required R packages
install.packages(c("learningtower", "dplyr", "jsonlite", "tidyr"))

# Navigate to scripts directory
setwd("path/to/kevisc.github.io/pisa/pipeline/scripts")

# Run data generation pipeline
source("01-generate-chunks.R")   # ~15-30 minutes - generates 513 JSON files
source("02-create-metadata.R")   # ~1-2 minutes - creates metadata catalog
source("03-validate-chunks.R")   # ~1-2 minutes - validates data quality

# ✅ All validation checks should PASS
```

**Expected Output:**
- ✅ 513 JSON files in `pisa/data/country-year/`
- ✅ `pisa/data/metadata.json`
- ✅ Total size: ~1.25 GB
- ✅ Validation report in console

See [pisa/pipeline/scripts/README.md](pipeline/scripts/README.md) for detailed instructions.

### 2. Test Locally

#### Option A: Python HTTP Server

```bash
cd path/to/kevisc.github.io
python -m http.server 8000
```

Open browser to: [http://localhost:8000/pisa/](http://localhost:8000/pisa/)

#### Option B: VSCode Live Server

1. Install "Live Server" extension in VSCode
2. Right-click `pisa/index.html`
3. Select "Open with Live Server"
4. Application opens automatically in browser

#### Testing Checklist

- [ ] Application loads without errors
- [ ] Country/year dropdowns populate from metadata
- [ ] Select 2-3 countries and 1-2 years, click "Load Data"
- [ ] Progress bar shows loading status
- [ ] Data loads successfully (~30-40 MB for typical selection)
- [ ] Overview tab displays statistics (mean, Gini, gradient)
- [ ] All tabs render correctly
- [ ] Export buttons work (CSV, PNG, HTML report)

### 3. Deploy to GitHub Pages

Once everything works locally:

```bash
cd path/to/kevisc.github.io
git add pisa/
git commit -m "feat: add PISA educational inequality explorer (Phase 1-5 complete)"
git push origin main
```

GitHub Pages will automatically deploy to: `https://kevinschoenholzer.com/pisa/`

## Project Status

### ✅ All Phases Complete (5/5)

| Phase | Status | Files Created | Lines of Code |
|-------|--------|--------------|---------------|
| **Phase 1: Data Pipeline** | ✅ Complete | 4 R scripts | ~655 lines |
| **Phase 2: Core Infrastructure** | ✅ Complete | 8 modules | ~2,742 lines |
| **Phase 3: Analysis & Visualization** | ✅ Complete | 8 modules | ~2,180 lines |
| **Phase 4: Export System** | ✅ Complete | 4 modules | ~1,470 lines |
| **Phase 5: Documentation** | ✅ Complete | 3 HTML docs | ~600 lines |

**Total:** ~7,647 lines of code across 27 files

### Implementation Timeline

- **Phase 1** (Data Pipeline): R scripts generate 513 country-year JSON chunks
- **Phase 2** (Core App): State management, data loading, UI components
- **Phase 3** (Analysis): Descriptive stats, regression, decomposition, diagnostics
- **Phase 4** (Export): CSV, PNG/SVG, HTML reports, data exports
- **Phase 5** (Documentation): Methodology, citations, data sources

## Architecture

### Directory Structure

```
pisa/
├── index.html                      # Main application (465 lines)
├── css/
│   └── styles.css                  # Dark theme styling (630 lines)
├── js/
│   ├── core/
│   │   ├── state-manager.js        # Reactive state management (372 lines)
│   │   ├── data-loader.js          # Progressive chunk loading (358 lines)
│   │   └── utils.js                # Statistical utilities (463 lines)
│   ├── analysis/
│   │   ├── descriptive.js          # Summary stats, inequality measures (348 lines)
│   │   ├── regression.js           # OLS, FE, RE models + AIC/BIC (555 lines)
│   │   ├── decomposition.js        # Variance & gap decomposition (338 lines)
│   │   └── diagnostics.js          # Hausman test, model comparison (349 lines)
│   ├── visualization/
│   │   ├── overview-viz.js         # Overview dashboard (184 lines)
│   │   ├── distribution-viz.js     # Distributions, percentiles, Lorenz (153 lines)
│   │   ├── regression-viz.js       # Scatter, residual, QQ plots + tables (596 lines)
│   │   └── comparative-viz.js      # Cross-country comparisons (198 lines)
│   ├── export/
│   │   ├── csv-export.js           # CSV exports (392 lines)
│   │   ├── figure-export.js        # PNG/SVG chart downloads (285 lines)
│   │   ├── data-export.js          # Data subset exports (291 lines)
│   │   └── report-export.js        # Full HTML reports (502 lines)
│   ├── ui/
│   │   ├── loading-indicator.js    # Progress tracking (236 lines)
│   │   └── country-selector.js     # Country/year UI (304 lines)
│   └── app.js                      # Main initialization + analysis orchestration (806 lines)
├── data/
│   ├── metadata.json               # Data catalog (generated by R)
│   └── country-year/               # 513 JSON files (~1.25 GB total)
│       ├── USA_2012.json           # ~3 MB
│       ├── USA_2015.json
│       ├── USA_2018.json
│       ├── USA_2022.json
│       ├── DEU_2012.json
│       └── ... (315 more files)
├── docs/
│   ├── methodology.html            # Statistical methods & formulas
│   ├── citation.html               # How to cite this tool
│   └── data-sources.html           # PISA data overview
└── pipeline/                       # Data generation (run once)
    └── scripts/
        ├── 01-generate-chunks.R    # Generate 513 JSON files (179 lines)
        ├── 02-create-metadata.R    # Generate metadata catalog (135 lines)
        ├── 03-validate-chunks.R    # Validate data quality (216 lines)
        └── README.md               # R script documentation (125 lines)
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface (index.html)               │
│  • Country/year selectors  • Analysis tabs  • Export buttons │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              Application Controller (app.js)                 │
│  • Event handling  • Tab switching  • Analysis orchestration │
└───┬────────────────┬────────────────┬───────────────────┬───┘
    │                │                │                   │
    ↓                ↓                ↓                   ↓
┌──────────┐  ┌─────────────┐  ┌────────────┐  ┌──────────────┐
│  State   │  │ Data Loader │  │  Analysis  │  │ Visualization│
│ Manager  │  │             │  │  Modules   │  │   Modules    │
└──────────┘  └─────────────┘  └────────────┘  └──────────────┘
    ↕                ↕                ↕                 ↕
┌──────────┐  ┌─────────────┐  ┌────────────┐  ┌──────────────┐
│ Reactive │  │  Country-   │  │Descriptive,│  │  Plotly.js   │
│  State   │  │  Year JSON  │  │ Regression,│  │  Charts      │
│  Store   │  │  Chunks     │  │Decomp, etc.│  │              │
└──────────┘  └─────────────┘  └────────────┘  └──────────────┘
                                      ↓
                               ┌────────────┐
                               │   Export   │
                               │  Modules   │
                               └────────────┘
                                      ↓
                            ┌─────────────────────┐
                            │ CSV, PNG, SVG, HTML │
                            └─────────────────────┘
```

### Technology Stack

**Core:**
- Vanilla JavaScript (ES6 modules)
- HTML5 + CSS3
- No build step required (native browser modules)

**Libraries:**
- [Plotly.js 2.35.2](https://plotly.com/javascript/) - Interactive visualizations
- [simple-statistics](https://simplestatistics.org/) - Statistical computations
- [jStat](https://jstat.github.io/) - Statistical distributions

**Data:**
- [learningtower](https://cran.r-project.org/package=learningtower) R package - PISA data harmonization
- [OECD PISA](https://www.oecd.org/pisa/data/) - Original data source

## Features

### 1. Progressive Data Loading

**Problem Solved:** Original offline version required uploading 180 MB - 1.25 GB files upfront.

**Solution:** Pre-generated 513 country-year JSON chunks (2-5 MB each) that load on-demand.

```javascript
// User selects: USA, DEU, GBR for years 2018, 2022
// App fetches only 6 chunks: USA_2018, USA_2022, DEU_2018, DEU_2022, GBR_2018, GBR_2022
// Total loaded: ~30-40 MB instead of ~1.25 GB
```

**Features:**
- Real-time progress bar with percentage and current file
- In-memory caching for instant reload
- Graceful error handling if chunks fail to load
- Parallel loading for multiple chunks

### 2. Seven Analysis Tabs

#### Tab 1: Overview
- Summary statistics cards (mean achievement, Gini coefficient, SES gradient)
- Scatter plot: Mean achievement vs. inequality by country
- Comparative bar chart across countries

#### Tab 2: Distribution
- Histograms of achievement scores by country
- Percentile comparison chart (P10, P25, P50, P75, P90)
- Lorenz curve for inequality visualization

#### Tab 3: Achievement Gap
- SES quartile comparison (Q1, Q2, Q3, Q4)
- Achievement gap decomposition (Q4-Q1 gap, effect sizes)
- Gap trends over time

#### Tab 4: Regression
- Pooled OLS with survey weights
- Fixed Effects (country + year dummies)
- Random Effects (quasi-demeaning)
- Regression scatter plots with fitted lines for all models
- Coefficient plots with confidence intervals
- Regression tables with SE, t-stats, p-values, 95% CI
- Model comparison table (AIC, BIC, R², Adj. R²)

#### Tab 5: Diagnostics
- Hausman specification test (FE vs RE)
- Variance decomposition (within/between)
- ICC (intraclass correlation)
- Residual vs fitted plots (heteroscedasticity detection)
- Q-Q plots (residual normality tests)
- Model fit diagnostics for OLS, FE, and RE models

#### Tab 6: Comparative Analysis
- Cross-country statistics table
- Grouped bar charts (mean, Gini, gradient by country)
- Decomposition visualizations
- Temporal trends

#### Tab 7: Methodology
- Statistical methods documentation
- Variable definitions
- Assumptions and limitations
- References and citations

### 3. Survey-Weighted Estimation

All analyses use proper PISA sampling weights following OECD (2009) standards:

**Student Weight (W_FSTUWT):** Default for most analyses
```javascript
// Weighted mean formula
μ̂_w = (Σ w_i · y_i) / (Σ w_i)
```

**Senate Weight (W_FSENWT):** Equal country weighting
- Each country contributes equally regardless of population size
- Useful for cross-country comparisons

**Variance Estimation:**
- Analytical standard errors for simple statistics
- Bootstrap standard errors for complex statistics
- Proper handling of survey design

### 4. Regression Models

#### Pooled OLS
```
Y_i = α + β·ESCS_i + γ·X_i + ε_i
```
- Survey-weighted OLS
- Ridge stabilization for numerical stability
- Robust standard errors

#### Fixed Effects
```
Y_it = α_i + β·ESCS_it + γ·X_it + λ_t + ε_it
```
- Country fixed effects (α_i)
- Year fixed effects (λ_t)
- Within-country variation only

#### Random Effects
```
Y_it = α + β·ESCS_it + γ·X_it + u_i + ε_it
```
- Quasi-demeaning transformation
- Exploits both within and between variation
- More efficient when RE assumptions hold

#### Hausman Test
Tests whether Fixed Effects or Random Effects is appropriate:
- H₀: Random Effects is consistent
- H₁: Only Fixed Effects is consistent
- Reports χ² statistic, p-value, recommendation

#### Model Diagnostics

**Model Comparison:**
- AIC (Akaike Information Criterion) - Lower values indicate better fit
- BIC (Bayesian Information Criterion) - Penalizes complexity more than AIC
- R² and Adjusted R² - Proportion of variance explained
- Side-by-side comparison table for all three models (OLS, FE, RE)

**Residual Diagnostics:**
- **Residual vs Fitted Plot:** Detects heteroscedasticity (non-constant variance)
  - Points should be randomly scattered around zero line
  - Patterns indicate violations of homoscedasticity assumption
- **Q-Q Plot:** Tests residual normality
  - Points should lie close to 45-degree reference line
  - Deviations indicate departures from normal distribution
  - Uses Beasley-Springer-Moro algorithm for theoretical quantiles
- Generated for all three model types (OLS, Fixed Effects, Random Effects)

**Visualization:**
- Regression scatter plots with fitted lines overlaid for each model
- Allows visual comparison of model predictions
- Different colors for OLS (red), FE (green), RE (orange)

### 5. Comprehensive Export System

#### CSV Exports

**Summary Statistics:**
```csv
Measure,Value
Mean,492.34
Standard Deviation,94.21
Gini Coefficient,0.0876
SES Gradient,37.42
N,80451
```

**Regression Tables:**
```csv
Variable,Coefficient,Std Error,t-statistic,p-value,CI_lower,CI_upper,Significant
Intercept,493.24,1.23,400.84,0.000000,490.83,495.65,Yes
ESCS,37.42,0.89,42.04,0.000000,35.68,39.16,Yes
```

**Comparative Statistics:**
```csv
Country,Year,Mean Achievement,Gini Coefficient,SES Gradient,N
USA,2018,502.3,0.0891,39.2,4838
DEU,2018,500.1,0.0923,42.8,5451
GBR,2018,504.7,0.0867,35.1,13818
```

#### Figure Exports

**PNG Format:**
- High resolution (1200×800 pixels)
- 2x scale factor (retina display quality)
- Publication-ready
- Use for Word documents, presentations

**SVG Format:**
- Vector graphics (infinite zoom)
- Small file size
- Editable in Illustrator, Inkscape
- Use for academic journals, posters

**Batch Export:**
- Export all charts in current tab at once
- Export all main analysis charts across tabs
- Automatic filename generation with timestamps

#### Full HTML Report

Self-contained HTML document including:
- ✅ Analysis metadata (countries, years, date)
- ✅ Data overview (sample sizes, data quality)
- ✅ Descriptive statistics tables
- ✅ Inequality measures
- ✅ Achievement gap analysis
- ✅ Regression results (all models)
- ✅ Variance decomposition
- ✅ Comparative analysis
- ✅ All visualizations (embedded as base64 PNG)
- ✅ Methodology section
- ✅ Data source citations
- ✅ How to cite the tool

**Use case:** Share complete analysis with collaborators or include in supplementary materials.

#### Data Exports

Export filtered datasets with comprehensive provenance:

```csv
# Educational Inequality Data Explorer - Data Export
# Generated: 2025-12-16T10:30:00Z
# Data Source: OECD PISA via learningtower R package
# Citation: OECD (2023). PISA Database. https://www.oecd.org/pisa/data/
#
# Selection Criteria:
#   Countries: USA, DEU, GBR
#   Years: 2018, 2022
#   Total Students: 80451
#
# Variables:
#   country: Country code (ISO 3166-1 alpha-3)
#   year: PISA assessment year
#   math: Mathematics achievement score
#   escs: PISA index of economic, social and cultural status
#   w_fstuwt: Final student weight
# ... (all variable descriptions)
#
# ===== DATA BEGINS BELOW THIS LINE =====
country,year,student_id,math,reading,science,escs,...
USA,2018,USA_2018_00001,498.5,505.2,502.9,0.23,...
```

### 6. Academic Documentation

#### [Methodology Documentation](docs/methodology.html)
- **Data Sources**: PISA programme, learningtower package, assessment cycles
- **Variables**: Achievement scores (plausible values), ESCS construction, sampling weights
- **Statistical Methods**: Weighted descriptives, inequality measures, SES gradient, regression models, variance decomposition
- **Formulas**: Mathematical notation for all calculations
- **Assumptions & Limitations**: Causal inference, missing data, sampling design
- **Software Implementation**: Libraries, numerical stability, validation
- **References**: 9 academic citations

#### [Citation Guide](docs/citation.html)
- **How to cite this tool**: APA, Chicago, MLA, BibTeX formats
- **How to cite PISA data**: Multiple formats with specific years
- **How to cite learningtower**: R package citation
- **Example citations in text**: Methods, results, data availability
- **Suggested acknowledgment**: Template for papers
- **Key references**: PISA technical reports, foundational literature

#### [Data Sources](docs/data-sources.html)
- **PISA Programme Overview**: History, purpose, assessment cycles
- **Assessment Framework**: Mathematics, reading, science competencies
- **Sampling Design**: Two-stage stratified sampling, participation rates
- **learningtower Package**: Installation, usage, benefits
- **Variable Codebook**: Complete variable descriptions
- **Participating Countries**: 101 countries across 8 cycles
- **References**: Links to OECD documentation

## Development

### Project Structure

The codebase is organized into modular ES6 modules for maintainability:

**Core Modules** (`js/core/`):
- State management with reactive subscriptions
- Progressive data loading with caching
- Statistical utility functions (20+ functions)

**Analysis Modules** (`js/analysis/`):
- Descriptive statistics and inequality measures
- Regression models (OLS, FE, RE)
- Variance and gap decomposition
- Model diagnostics and specification tests

**Visualization Modules** (`js/visualization/`):
- Plotly chart configurations and rendering
- Interactive tooltips and zooming
- Consistent dark theme styling

**Export Modules** (`js/export/`):
- CSV generation with proper headers
- High-resolution figure downloads
- Self-contained HTML report assembly

**UI Modules** (`js/ui/`):
- Country/year selection interface
- Loading progress indicators

### Adding New Features

#### Adding a New Analysis

1. Create module in `js/analysis/your-analysis.js`:

```javascript
// js/analysis/your-analysis.js
import { weightedMean } from '../core/utils.js';

export function calculateYourStatistic(data, outcomeVar = 'math') {
    // Your analysis logic
    const values = data.map(d => +d[outcomeVar]).filter(isFinite);
    const result = weightedMean(values, weights);
    return result;
}
```

2. Import in `js/app.js`:

```javascript
import { calculateYourStatistic } from './analysis/your-analysis.js';

// Use in analysis pipeline
const result = calculateYourStatistic(state.mergedData);
console.log('Your statistic:', result);
```

3. Create visualization in `js/visualization/your-viz.js`:

```javascript
// js/visualization/your-viz.js
export function renderYourChart(data, result) {
    const trace = {
        x: [...],
        y: [...],
        type: 'scatter',
        mode: 'markers'
    };

    const layout = {
        title: 'Your Analysis',
        template: 'plotly_dark'
    };

    Plotly.newPlot('your-chart', [trace], layout, { responsive: true });
}
```

4. Wire up in tab switching:

```javascript
// In app.js
function onTabSwitch(tabName) {
    if (tabName === 'your-tab') {
        const result = calculateYourStatistic(state.mergedData);
        renderYourChart(state.mergedData, result);
    }
}
```

#### Adding a New Tab

1. Add tab button to `index.html`:

```html
<div class="tabs">
    <!-- existing tabs -->
    <button class="tab" data-tab="your-tab">Your Tab</button>
</div>
```

2. Add tab content:

```html
<div id="your-tab" class="tab-content">
    <h2>Your Analysis</h2>
    <div id="your-chart"></div>
</div>
```

3. Update tab initialization in `app.js`:

```javascript
const tabs = document.querySelectorAll('.tab');
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        switchTab(tabName);
    });
});
```

### Code Style

**Naming Conventions:**
- Functions: `camelCase` (e.g., `calculateGini`, `renderOverviewChart`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `DATA_BASE_URL`)
- Classes: `PascalCase` (rare, prefer functional style)
- Files: `kebab-case.js` (e.g., `state-manager.js`)

**Module Structure:**
```javascript
/**
 * Module Name
 * Brief description of purpose
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

// Imports
import { dependency } from './other-module.js';

// Constants
const CONFIG = { ... };

// Main functions
export function mainFunction(params) {
    // Implementation
}

// Helper functions (not exported)
function helperFunction(params) {
    // Implementation
}

// Default export if needed
export default {
    mainFunction,
    // ... other exports
};
```

**Comments:**
- Function documentation with `@param` and `@returns`
- Inline comments for complex logic only
- Avoid obvious comments

### Testing

**Manual Testing Checklist:**

Data Loading:
- [ ] Metadata loads on startup
- [ ] Country/year dropdowns populate correctly
- [ ] Data loads successfully for various selections
- [ ] Progress bar updates in real-time
- [ ] Loading works with 1, 5, 10+ chunks
- [ ] Error handling works when chunk fails

Analysis:
- [ ] All 7 tabs render without errors
- [ ] Statistics update when changing outcome/predictor
- [ ] Regression models run successfully
- [ ] Hausman test displays correctly
- [ ] Comparative statistics calculate for multiple countries

Exports:
- [ ] CSV exports download with correct data
- [ ] PNG exports at high resolution
- [ ] SVG exports are vector graphics
- [ ] HTML report includes all sections and charts
- [ ] Data export includes provenance header

**Validation Against R:**

To ensure statistical accuracy, validate key results against R:

```r
library(learningtower)
library(dplyr)

# Load data
data_2018 <- load_student(2018) %>% filter(country == "USA")

# Calculate weighted mean
weighted.mean(data_2018$math, data_2018$w_fstuwt, na.rm = TRUE)

# Compare to app output - should match within rounding error
```

### Performance Optimization

**Current Performance:**
- Initial load (metadata): < 500 ms
- Data loading (6 chunks, ~30 MB): 2-4 seconds
- Analysis computation: < 500 ms
- Chart rendering: 500-1000 ms per chart

**Optimization Tips:**
- Use `subscribeToState` to minimize re-computations
- Cache analysis results in state
- Lazy-render charts (only when tab is active)
- Use `Plotly.react()` instead of `Plotly.newPlot()` for updates

**Memory Management:**
- Loaded chunks stay in memory (intended behavior for session)
- Each chunk: 2-5 MB in memory
- Typical session: 30-50 MB total (acceptable)
- If memory becomes an issue, add cache eviction strategy

## Data Pipeline

### R Scripts Overview

Located in `pisa/pipeline/scripts/`:

#### 1. `01-generate-chunks.R` (179 lines)

Generates 513 country-year JSON files from learningtower package.

**Process:**
1. Install/load learningtower package
2. Loop through all country-year combinations
3. For each combination:
   - Load student data
   - Calculate data quality metrics
   - Structure as JSON chunk
   - Write to file
4. Progress reporting (e.g., "Processing 47/513: USA 2018")

**Output:**
- ~513 files in `pisa/data/country-year/`
- File naming: `{COUNTRY}_{YEAR}.json`
- Size: 2-5 MB per file

**Runtime:** ~15-30 minutes (depends on computer speed, internet)

#### 2. `02-create-metadata.R` (135 lines)

Generates metadata catalog for the application.

**Process:**
1. Scan all generated JSON files
2. Extract unique countries and years
3. Load variable descriptions from learningtower
4. Calculate file sizes
5. Generate metadata.json

**Output:**
- `pisa/data/metadata.json`
- Contains: countries list, years list, variables dictionary, file info

**Runtime:** ~1-2 minutes

#### 3. `03-validate-chunks.R` (216 lines)

Validates data quality and completeness.

**Checks:**
1. ✅ All 513 files exist
2. ✅ All files are valid JSON
3. ✅ File sizes within expected range (2-5 MB)
4. ✅ Required fields present (country, year, students)
5. ✅ Data structure consistent
6. ✅ Sample size reasonable (n > 100)
7. ✅ Variable coverage adequate

**Output:**
- Console report with pass/fail for each check
- Warnings for any issues found

**Runtime:** ~1-2 minutes

### Running the Pipeline

**First Time Setup:**

```r
# Install required packages
install.packages(c("learningtower", "dplyr", "jsonlite", "tidyr", "purrr"))
```

**Generate All Data:**

```r
# Set working directory
setwd("path/to/kevisc.github.io/pisa/pipeline/scripts")

# Run full pipeline
source("01-generate-chunks.R")
source("02-create-metadata.R")
source("03-validate-chunks.R")
```

**Update After New PISA Release:**

When OECD releases new PISA data (e.g., PISA 2025):

1. Wait for learningtower package update
2. Update `YEARS` vector in `01-generate-chunks.R`
3. Re-run all three scripts
4. Commit new data files to repository

### Data Quality

The generated data undergoes rigorous quality checks:

**Completeness:**
- All 8 years included (2000, 2003, 2006, 2009, 2012, 2015, 2018, 2022)
- All 101 countries with available data
- All core variables present (math, reading, science, escs, weights)

**Validity:**
- Achievement scores in plausible range (200-800)
- ESCS values standardized (typically -3 to +3)
- Sampling weights positive and sum appropriately

**Consistency:**
- Variable names harmonized across years
- Country codes follow ISO 3166-1 alpha-3
- Data structure identical across all chunks

## Documentation

### User-Facing Documentation

#### Methodology ([docs/methodology.html](docs/methodology.html))

Comprehensive technical documentation covering:
- PISA data sources and sampling design
- Variable definitions (achievement scores, ESCS, weights)
- Statistical methods with mathematical formulas
- Assumptions and limitations
- Software implementation details
- Academic references

**Target Audience:** Researchers, graduate students

#### Citation Guide ([docs/citation.html](docs/citation.html))

Academic citation guide including:
- How to cite this tool (APA, Chicago, MLA, BibTeX)
- How to cite PISA data
- How to cite learningtower package
- Example citations for methods and results sections
- Suggested acknowledgment text

**Target Audience:** Researchers preparing publications

#### Data Sources ([docs/data-sources.html](docs/data-sources.html))

Data documentation covering:
- PISA programme overview and history
- Assessment framework (math, reading, science)
- Sampling design and participation rates
- learningtower package documentation
- Variable codebook (all variables with descriptions)
- List of participating countries by year
- Links to official OECD resources

**Target Audience:** All users, especially those new to PISA data

### Developer Documentation

#### This README
- Quick start guide
- Architecture overview
- Feature descriptions
- Development instructions
- Troubleshooting

#### R Scripts Documentation ([pisa/pipeline/scripts/README.md](pipeline/scripts/README.md))
- Data generation pipeline
- Script descriptions
- Runtime expectations
- Troubleshooting data generation

#### Code Comments
- Function-level documentation with @param and @returns
- Inline comments for complex algorithms
- Module headers with author and date

## Citation

If you use this tool in your research, please cite both the tool and the underlying PISA data source.

### Citing This Tool

**APA Format:**
```
Schoenholzer, K. (2025). Educational Inequality Data Explorer [Web application].
    https://kevinschoenholzer.com/pisa/
```

**BibTeX:**
```bibtex
@misc{schoenholzer2025pisa,
    author = {Schoenholzer, Kevin},
    title = {{Educational Inequality Data Explorer}},
    year = {2025},
    howpublished = {\url{https://kevinschoenholzer.com/pisa/}},
    note = {Web application for analyzing educational inequality using PISA data}
}
```

### Citing PISA Data

**APA Format:**
```
OECD. (2023). PISA 2022 database. Organisation for Economic Co-operation and Development.
    https://www.oecd.org/pisa/data/
```

**BibTeX:**
```bibtex
@misc{oecd2023pisa,
    author = {{OECD}},
    title = {{PISA 2022 Database}},
    year = {2023},
    publisher = {Organisation for Economic Co-operation and Development},
    url = {https://www.oecd.org/pisa/data/}
}
```

### Citing learningtower Package

**APA Format:**
```
Wang, K., Yacobellis, P., Siregar, E., Romanes, S., Fitter, K., Dalla Riva, G. V.,
    Cook, D., Tierney, N., Dingorkar, P., Sai Subramanian, S., & Chen, G. (2024).
    learningtower: OECD PISA datasets from 2000-2022 in an easy-to-use format
    (R package version 1.1.0). https://doi.org/10.32614/CRAN.package.learningtower
```

### Example Citation in Paper

**Methods Section:**
> Data were analyzed using EduStrat (Schoenholzer, 2026), a browser-based tool for exploratory analysis of educational inequality with PISA microdata. The application uses data from the OECD PISA database (OECD, 2024), accessed via the learningtower R package (Wang et al., 2024). All analyses employ survey-weighted estimation following OECD (2009) technical standards.

See [docs/citation.html](docs/citation.html) for complete citation guide.

## Troubleshooting

### Data Generation Issues

**Problem:** R script fails with "learningtower not found"
```r
# Solution: Install the package
install.packages("learningtower")
```

**Problem:** "Error: student data not available for country X year Y"
- **Cause:** Some country-year combinations don't exist in PISA data
- **Solution:** Script will skip and report. This is expected behavior.

**Problem:** Script runs but no files created
- **Cause:** Output directory doesn't exist or wrong working directory
- **Solution:** Check `setwd()` path, verify directory exists

**Problem:** Validation reports missing files
- **Cause:** `01-generate-chunks.R` didn't complete successfully
- **Solution:** Check R console for errors, re-run `01-generate-chunks.R`

### Application Loading Issues

**Problem:** "Failed to load metadata.json"
- **Cause:** R scripts not run, or file in wrong location
- **Solution:** Run `02-create-metadata.R`, verify file at `pisa/data/metadata.json`

**Problem:** Country/year dropdowns are empty
- **Cause:** Metadata file malformed or not loaded
- **Solution:** Check browser console for errors, validate metadata.json is valid JSON

**Problem:** "Failed to load chunk: USA_2018.json"
- **Cause:** File doesn't exist or server can't serve JSON files
- **Solution:**
  1. Verify file exists at `pisa/data/country-year/USA_2018.json`
  2. Check server is running
  3. Check browser console for 404 errors

**Problem:** Progress bar stuck at 0%
- **Cause:** Network error or CORS issue
- **Solution:**
  1. Use proper web server (not file:// protocol)
  2. Check browser console for CORS errors
  3. Verify server is serving files correctly

### Analysis Issues

**Problem:** Charts don't render
- **Cause:** Plotly.js not loaded
- **Solution:** Check internet connection, Plotly CDN loaded in index.html

**Problem:** Statistics show NaN or undefined
- **Cause:** Data missing required variables
- **Solution:** Check data structure, verify weights exist, check for missing values

**Problem:** Regression fails with "Matrix singular"
- **Cause:** Not enough variation in predictor, or collinearity
- **Solution:**
  1. Check data quality (sufficient sample size?)
  2. Try different outcome/predictor combination
  3. Remove multicollinear controls

### Export Issues

**Problem:** CSV download doesn't start
- **Cause:** Browser blocking downloads, or popup blocker
- **Solution:** Allow downloads from localhost, check browser settings

**Problem:** PNG export is low quality
- **Cause:** Default scale too low
- **Solution:** Already set to 2x scale (high-res). For even higher quality, edit `figure-export.js` and increase `scale` parameter.

**Problem:** HTML report generation freezes
- **Cause:** Too many charts, browser running out of memory
- **Solution:** Export fewer charts at once, or increase timeout in `report-export.js`

### Performance Issues

**Problem:** Loading 20+ chunks is very slow
- **Cause:** Network bandwidth, too many parallel requests
- **Solution:**
  1. This is expected - loading 100+ MB takes time
  2. Reduce number of countries/years selected
  3. Consider increasing `MAX_CONCURRENT_LOADS` in `data-loader.js` (may help or hurt depending on connection)

**Problem:** Browser crashes when loading all countries
- **Cause:** Too much data in memory (>500 MB)
- **Solution:**
  1. Load fewer countries/years
  2. Refresh page to clear memory
  3. Close other browser tabs

**Problem:** Charts slow to render
- **Cause:** Too many data points (50,000+ students)
- **Solution:**
  1. This is expected for large selections
  2. Plotly handles it well, but rendering takes 1-2 seconds
  3. Consider downsampling for visualizations only (keep full data for statistics)

### GitHub Pages Issues

**Problem:** 404 errors after deploying to GitHub Pages
- **Cause:** File paths incorrect
- **Solution:** All paths in code are relative, should work automatically. Check repository settings.

**Problem:** Large file warning from GitHub
- **Cause:** Data files >50 MB individually, or repo >1.25 GB total
- **Solution:**
  1. Check individual JSON file sizes (should be 2-5 MB each)
  2. Total ~1.25 GB is at GitHub's soft limit but should work
  3. If issues arise, consider GitHub Releases or external hosting (AWS S3, Cloudflare R2)

**Problem:** Pages deployment fails
- **Cause:** GitHub Pages setting not enabled
- **Solution:**
  1. Go to repository Settings → Pages
  2. Set source to "main" branch
  3. Set folder to "/ (root)"
  4. Save and wait for deployment

### Browser Compatibility

**Problem:** App doesn't work in Internet Explorer
- **Solution:** IE not supported. Use modern browser (Chrome, Firefox, Safari, Edge).

**Problem:** ES6 modules not loading
- **Cause:** Very old browser version
- **Solution:** Update browser to latest version (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)

**Problem:** Plotly charts don't show
- **Cause:** Browser doesn't support WebGL
- **Solution:** Update graphics drivers, or use different browser

### Getting Help

If none of the above solve your issue:

1. **Check browser console** - Press F12, look for red errors
2. **Check network tab** - See which files failed to load
3. **Check plan document** - See `C:\Users\Kevin\.claude\plans\sequential-frolicking-octopus.md` for detailed implementation notes
4. **Re-run R scripts** - Start fresh with data generation
5. **Clear browser cache** - Old cached files can cause issues

## Validation and Testing

EduStrat includes both automated data validation and manual testing procedures.

### Automated Data Validation

The R pipeline includes a validation script (`pipeline/scripts/03-validate-chunks.R`) that checks:

- All 513 country-year JSON files exist and are valid JSON
- File sizes are within expected range (100 KB – 10 MB)
- Required fields are present in every record (country, year, achievement scores, ESCS, student weight)
- Data values are within plausible ranges (achievement: 0–1000, ESCS: approximately -4 to +4)
- Sample sizes are adequate (n > 100 per country-year)

```bash
cd pipeline/scripts
Rscript 03-validate-chunks.R
# All validation checks should PASS
```

### Statistical Validation

Statistical outputs have been validated against reference implementations:

- Weighted means and standard deviations verified against R `survey` package results
- Regression coefficients checked against R `lm()` with survey weights
- Gini coefficients compared to `ineq` R package calculations
- Fixed/random effects models validated against `plm` R package outputs

### Manual Testing Checklist

- [ ] Application loads without JavaScript errors (check browser console)
- [ ] Country/year selection populates from metadata
- [ ] Data loads correctly for multiple country-year combinations
- [ ] All 7 analysis tabs render correctly with loaded data
- [ ] Export buttons produce valid CSV, PNG/SVG, and HTML output
- [ ] Exported CSV files contain correct headers and values
- [ ] HTML reports are self-contained and render independently

## Contributing

Contributions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Reporting bugs and suggesting features
- Submitting code changes
- Code style conventions
- Development setup

## Citation

If you use EduStrat in your research, please cite:

```bibtex
@article{schoenholzer2026edustrat,
  title   = {EduStrat: A Browser-Based Tool for Teaching Quantitative Analysis of Educational Inequality with PISA Microdata},
  author  = {Schoenholzer, Kevin},
  note    = {Working paper},
  year    = {2026},
  url     = {https://github.com/kevisc/edustrat}
}
```

See [CITATION.cff](CITATION.cff) for machine-readable citation metadata, or the [Citation Guide](docs/citation.html) for additional formats (APA, Chicago, MLA).

## License

This project is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 Kevin Schoenholzer.

## Acknowledgments

- **Data:** OECD Programme for International Student Assessment (PISA)
- **R Package:** [learningtower](https://cran.r-project.org/package=learningtower) by Wang et al. (2024)
- **Libraries:** [Plotly.js](https://plotly.com/javascript/), [jStat](https://jstat.github.io/), [simple-statistics](https://simplestatistics.org/)
- **Institution:** Università della Svizzera italiana (USI)

---

**Documentation:**
- [Methodology](docs/methodology.html) — Statistical methods and formulas
- [Data Sources](docs/data-sources.html) — PISA data overview and variable codebook
- [Citation Guide](docs/citation.html) — How to cite EduStrat and PISA data
- [Methods Document](pipeline/Methods_Document.md) — Extended methodological documentation
- [R Pipeline](pipeline/scripts/README.md) — Data generation scripts
