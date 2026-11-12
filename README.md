# EduStrat: Educational Stratification in PISA

A browser-based statistical tool for teaching and exploratory analysis. It shows how parental socioeconomic characteristics (education, occupation and wealth, captured by the ESCS index) relate to student achievement in PISA data from 101 countries and 8 assessment cycles (2000 to 2022). Every estimator is checked against R on real PISA data; see [VERIFICATION.md](VERIFICATION.md).

**Live Demo:** [kevinschoenholzer.com/edustrat](https://kevinschoenholzer.com/edustrat/)

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.19221284.svg)](https://doi.org/10.5281/zenodo.19221284)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Data Source](https://img.shields.io/badge/data-OECD%20PISA-blue)](https://www.oecd.org/pisa/data/)

## Overview

EduStrat enables students, instructors, and researchers to explore educational inequality using microdata from the OECD Programme for International Student Assessment (PISA). All statistical computations run client-side in the browser. It needs no software installation, no server and no programming.

### Features

- **Survey-weighted estimates**: means, ESCS gradients, achievement gaps and regression models with the PISA student weight, a senate weight or no weight
- **Design-based standard errors**: Fay BRR standard errors from the 80 PISA replicate weights for the country-cycles that carry them; model-based standard errors elsewhere, labelled as such
- **Regression models**: pooled OLS, country fixed effects and random effects, with a Hausman test, school-clustered standard errors and regression diagnostics; ESCS or parental schooling (four levels) as the predictor
- **Inequality measures**: Gini coefficient, Lorenz curves, percentile ratios (P90/P10), SES quartile gaps with Cohen's *d*, variance decomposition and Oaxaca-Blinder decomposition
- **Within-country trends**: one estimate per PISA cycle and country, with a precision-weighted trend and a country fixed-effects panel
- **Missing data**: a comparison of listwise deletion with full-information maximum likelihood (FIML) for the gradient
- **Show the R code**: each result panel shows the R code that reproduces the number on screen, and the Export tab bundles the opened panels into one R script
- **Teaching aids**: shareable links that open a configured analysis, a guided tour, self-check questions and a lab-report export
- **Exports**: CSV tables, every chart as a PNG file, and a self-contained HTML report with all charts

### Verification

The JavaScript estimators are compared with independent R implementations (`stats`, `plm`, `lmtest`, `car`, `intsvy`, `mice`, `sandwich`) on the same PISA files: 83 checks on point estimates and model statistics, 21 on BRR standard errors, 38 on the trend estimators, 18 on the FIML estimator, 23 on the inequality and clustering estimators, and 19 on the R code generator. [VERIFICATION.md](VERIFICATION.md) describes the harness and how to rerun it.

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
├── css/styles.css              # Styles
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
│   ├── scripts/                # R scripts: data pipeline and R reference checks
│   └── verification/           # Node harness that runs the app's own modules, with reports
├── paper.md                    # Paper draft
├── paper.bib                   # Paper references
├── VERIFICATION.md             # How the estimators are checked against R
├── CITATION.cff                # Software citation metadata
├── CONTRIBUTING.md             # Contribution guidelines
├── LICENSE                     # MIT License
└── TROUBLESHOOTING.md          # Common issues and solutions
```

## Technology Stack

- **Frontend:** Vanilla JavaScript (ES6 modules), HTML5, CSS3; no build step
- **Visualisation:** [Plotly.js](https://plotly.com/javascript/) 2.35.2
- **Statistics:** [simple-statistics](https://simplestatistics.org/), [jStat](https://jstat.github.io/)
- **Data pipeline:** R with [learningtower](https://cran.r-project.org/package=learningtower) package
- **Data source:** [OECD PISA](https://www.oecd.org/pisa/data/)

## Documentation

- [Methodology](https://kevinschoenholzer.com/edustrat/docs/methodology.html): statistical methods, formulas, assumptions and limitations
- [Data Sources](https://kevinschoenholzer.com/edustrat/docs/data-sources.html): PISA programme overview, variable codebook, country coverage
- [Citation Guide](https://kevinschoenholzer.com/edustrat/docs/citation.html): how to cite this tool and the underlying data
- [Verification](VERIFICATION.md): how each estimator is checked against R
- [Troubleshooting](TROUBLESHOOTING.md): common issues and solutions

## Contributing

Contributions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting issues, suggesting features, and submitting pull requests.

## Citation

If you use EduStrat in your research or teaching, please cite:

```bibtex
@software{schoenholzer2026edustrat,
  title     = {{EduStrat}: A Browser-Based Tool for Teaching Quantitative Analysis of Educational Inequality with {PISA} Microdata},
  author    = {Schoenholzer, Kevin},
  year      = {2026},
  publisher = {Zenodo},
  doi       = {10.5281/zenodo.19221283},
  url       = {https://github.com/kevisc/edustrat}
}
```

The DOI above always points to the newest archived version.

Please also cite the underlying data:

- OECD (2024). Programme for International Student Assessment (PISA) Database. Paris: OECD. https://www.oecd.org/pisa/
- Wang, K. et al. (2024). learningtower: OECD PISA Datasets from 2000-2022 in an Easy-to-Use Format. R package version 1.1.0. https://doi.org/10.32614/CRAN.package.learningtower

## License

MIT License. See [LICENSE](LICENSE) for details.

## Acknowledgements

This work uses data from the OECD Programme for International Student Assessment, accessed via the `learningtower` R package. The author acknowledges support from the Università della Svizzera italiana.
