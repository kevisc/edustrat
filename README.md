# EduStrat: Educational Stratification in PISA

A browser-based statistical tool for exploratory analysis of how parental socioeconomic characteristics (education, occupation, wealth --- captured by the ESCS index) relate to student academic achievement in PISA data across 101 countries and 8 assessment cycles (2000--2022).

**Live Demo:** [kevinschoenholzer.com/edustrat](https://kevinschoenholzer.com/edustrat/)

[![DOI](https://img.shields.io/badge/DOI-pending-yellow)](https://github.com/kevisc/edustrat)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Data Source](https://img.shields.io/badge/data-OECD%20PISA-blue)](https://www.oecd.org/pisa/data/)

## Overview

EduStrat enables students, instructors, and researchers to explore educational inequality using microdata from the OECD Programme for International Student Assessment (PISA). All statistical computations run client-side in the browser --- no software installation, no server, and no programming required.

### Features

- **Survey-weighted analysis** --- OECD-compliant statistical methods with proper sampling weights
- **Inequality metrics** --- Gini coefficient, Lorenz curves, percentile ratios (P90/P10), coefficient of variation
- **Regression models** --- Pooled OLS, country fixed effects, and random effects with Hausman specification test
- **Variance decomposition** --- Within- and between-country decomposition with intraclass correlation
- **Achievement gap analysis** --- SES quartile comparisons with Cohen's *d* effect sizes
- **Publication-ready exports** --- CSV tables, high-resolution figures (PNG/SVG), self-contained HTML reports
- **Interactive interface** --- 7 analysis tabs with dark theme UI and Plotly.js visualisations

### Data Coverage

| | |
|---|---|
| **PISA Cycles** | 2000, 2003, 2006, 2009, 2012, 2015, 2018, 2022 |
| **Countries** | 101 countries/economies |
| **Students** | ~3.5 million total observations |
| **Variables** | Achievement (math, reading, science), ESCS, demographics, parental education, survey weights |

## Quick Start

### Use the Live Demo

Open [kevinschoenholzer.com/edustrat](https://kevinschoenholzer.com/edustrat/) in any modern browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+). Select countries and years, click "Load Data", and explore the analysis tabs.

### Run Locally

1. Clone this repository:
   ```bash
   git clone https://github.com/kevisc/edustrat.git
   cd edustrat
   ```

2. Start any HTTP server:
   ```bash
   python -m http.server 8000
   ```

3. Open [http://localhost:8000](http://localhost:8000) in your browser.

The application loads data from the [live demo](https://kevinschoenholzer.com/edustrat/) by default. To serve data locally instead, generate the data files using the R pipeline (see below) and the application will detect and use them automatically.

### Regenerate Data Locally (Optional)

The data files (~1.25 GB) are not included in this repository. They can be regenerated from the `learningtower` R package:

```r
# Install required R packages
install.packages(c("learningtower", "dplyr", "jsonlite", "tidyr"))

# Run data generation pipeline
setwd("pipeline/scripts")
source("01-generate-chunks.R")   # ~15-30 min: generates 513 JSON files
source("02-create-metadata.R")   # ~1-2 min: creates metadata catalog
source("03-validate-chunks.R")   # ~1-2 min: validates data quality
```

This produces 513 country-year JSON files in `data/country-year/` and a `data/metadata.json` catalog. See [pipeline/scripts/README.md](pipeline/scripts/README.md) for detailed instructions.

## Repository Structure

```
edustrat/
├── index.html                  # Main web application
├── css/styles.css              # Dark theme styling
├── js/
│   ├── app.js                  # Application controller
│   ├── core/                   # State management, data loading, utilities
│   ├── analysis/               # Descriptive stats, regression, decomposition, diagnostics
│   ├── visualization/          # Plotly.js chart modules
│   ├── export/                 # CSV, figure, data, and report exports
│   └── ui/                     # Country selector, loading indicators
├── data/
│   └── metadata.json           # Data catalog (countries, years, variables)
├── docs/
│   ├── methodology.html        # Statistical methods and formulas
│   ├── data-sources.html       # PISA data overview and variable codebook
│   ├── citation.html           # How to cite this tool and PISA data
│   └── publication-paper.html  # Academic paper (HTML version)
├── pipeline/
│   └── scripts/                # R scripts to regenerate data from learningtower
├── paper.md                    # JOSE paper source
├── paper.bib                   # JOSE paper references
├── CITATION.cff                # Software citation metadata
├── CONTRIBUTING.md             # Contribution guidelines
├── LICENSE                     # MIT License
└── TROUBLESHOOTING.md          # Common issues and solutions
```

## Technology Stack

- **Frontend:** Vanilla JavaScript (ES6 modules), HTML5, CSS3 --- no build step required
- **Visualisation:** [Plotly.js](https://plotly.com/javascript/) 2.35.2
- **Statistics:** [simple-statistics](https://simplestatistics.org/), [jStat](https://jstat.github.io/)
- **Data pipeline:** R with [learningtower](https://cran.r-project.org/package=learningtower) package
- **Data source:** [OECD PISA](https://www.oecd.org/pisa/data/)

## Documentation

- [Methodology](https://kevinschoenholzer.com/edustrat/docs/methodology.html) --- statistical methods, formulas, assumptions, and limitations
- [Data Sources](https://kevinschoenholzer.com/edustrat/docs/data-sources.html) --- PISA programme overview, variable codebook, country coverage
- [Citation Guide](https://kevinschoenholzer.com/edustrat/docs/citation.html) --- how to cite this tool and the underlying data
- [Troubleshooting](TROUBLESHOOTING.md) --- common issues and solutions

## Contributing

Contributions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting issues, suggesting features, and submitting pull requests.

## Citation

If you use EduStrat in your research or teaching, please cite:

```bibtex
@article{schoenholzer2026edustrat,
  title   = {{EduStrat}: A Browser-Based Tool for Teaching Quantitative Analysis of Educational Inequality with {PISA} Microdata},
  author  = {Schoenholzer, Kevin},
  year    = {2026},
  journal = {Journal of Open Source Education},
  url     = {https://github.com/kevisc/edustrat}
}
```

Please also cite the underlying data:

- OECD (2024). Programme for International Student Assessment (PISA) Database. Paris: OECD. https://www.oecd.org/pisa/
- Wang, K. et al. (2024). learningtower: OECD PISA Datasets from 2000--2022 in an Easy-to-Use Format. R package version 1.1.0. https://doi.org/10.32614/CRAN.package.learningtower

## License

MIT License. See [LICENSE](LICENSE) for details.

## Acknowledgements

This work uses data from the OECD Programme for International Student Assessment, accessed via the `learningtower` R package. The author acknowledges support from the Universita della Svizzera italiana.
