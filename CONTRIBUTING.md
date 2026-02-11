# Contributing to EduStrat

Thank you for your interest in contributing to EduStrat (Educational Stratification in PISA). This document provides guidelines for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and constructive environment. We expect all contributors to:

- Be respectful and considerate in communication
- Accept constructive criticism gracefully
- Focus on what is best for the project and its users
- Show empathy towards other community members

## How to Contribute

### Reporting Bugs

If you find a bug, please open a GitHub issue with:

1. A clear, descriptive title
2. Steps to reproduce the problem
3. Expected behavior vs. actual behavior
4. Browser and operating system information
5. Screenshots if applicable (especially for visualization issues)

### Suggesting Features

Feature requests are welcome. Please open a GitHub issue with:

1. A clear description of the proposed feature
2. The use case it addresses (research, teaching, policy analysis, etc.)
3. Any relevant references to statistical methods or data sources

### Submitting Code Changes

1. Fork the repository
2. Create a feature branch from `main` (`git checkout -b feature/your-feature`)
3. Make your changes, following the code style guidelines below
4. Test your changes in multiple browsers (Chrome, Firefox, Safari, Edge)
5. Submit a pull request with a clear description of the changes

### Code Style Guidelines

- **JavaScript**: ES6 module syntax, consistent indentation (4 spaces), descriptive function and variable names
- **R scripts**: Follow tidyverse style guide conventions
- **Documentation**: Use clear, concise language; include mathematical notation where appropriate

### Areas Where Contributions Are Especially Welcome

- **Statistical methods**: Additional inequality metrics, decomposition methods, or regression specifications
- **Data coverage**: Support for additional PISA variables or assessment domains
- **Visualization**: New chart types or improved interactivity
- **Accessibility**: Improvements to screen reader support, keyboard navigation, or color contrast
- **Documentation**: Corrections, clarifications, or translations
- **Testing**: Validation of statistical outputs against reference implementations

## Development Setup

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, or Edge)
- A local HTTP server (e.g., Python's `http.server`, Node's `http-server`, or VS Code Live Server)
- R (version 4.0+) if modifying the data pipeline
- Required R packages: `learningtower`, `dplyr`, `jsonlite`, `tidyr`

### Running Locally

```bash
# Clone the repository
git clone https://github.com/kevisc/edustrat.git
cd edustrat

# Start a local server (choose one)
python3 -m http.server 8000
# or
npx http-server -p 8000

# Open http://localhost:8000 in your browser
```

### Regenerating Data (if needed)

```bash
cd pipeline/scripts
Rscript 01-generate-chunks.R
Rscript 02-create-metadata.R
Rscript 03-validate-chunks.R
```

## Questions?

If you have questions about contributing, please open a GitHub issue with the "question" label.
