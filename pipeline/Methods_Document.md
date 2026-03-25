# Methodological Documentation: EduStrat (Educational Stratification in PISA)

## Abstract

This document provides comprehensive methodological documentation for EduStrat (Educational Stratification in PISA), a browser-based statistical tool for exploratory analysis of socioeconomic stratification in educational achievement using Programme for International Student Assessment (PISA) microdata. We detail data preparation procedures, statistical methods, visualization techniques, and analytical frameworks implemented in the application. EduStrat covers eight PISA assessment cycles (2000, 2003, 2006, 2009, 2012, 2015, 2018, 2022), more than 100 participating countries, and approximately 3.5 million student observations.

## 1. Introduction

### 1.1 Purpose

EduStrat enables researchers, instructors, and students to conduct cross-national comparative analyses of educational inequality using standardized assessment data. The tool implements established methods from educational sociology and stratification research to quantify and visualize the relationship between parental socioeconomic characteristics---education, occupational status, and household wealth, as captured by the PISA ESCS (Economic, Social and Cultural Status) index---and children's academic achievement at age 15.

### 1.2 Data Source

Data derive from PISA assessments administered by the Organisation for Economic Co-operation and Development (OECD). PISA assesses 15-year-old students' competencies in mathematics, reading, and science across participating countries (OECD, 2024). We utilize data from all eight assessment cycles (2000, 2003, 2006, 2009, 2012, 2015, 2018, 2022), accessed via the learningtower R package (Wang et al., 2024).

## 2. Data Preparation

### 2.1 Data Extraction and Processing

Data preparation follows a standardized pipeline implemented in R:

1. **Data Loading**: Raw PISA data are extracted from the learningtower package using `load_student()` for specified assessment years.

2. **Variable Selection**: Core variables include:
   - Achievement scores (mathematics, reading, science)
   - Socioeconomic status (ESCS index)
   - Demographic characteristics (gender, parental education)
   - Home resources (computer, internet, books)
   - Survey weights (student weight, replicate weights)

3. **Missing Data Handling**: Records with missing values on key variables (achievement scores, ESCS) are excluded using listwise deletion. Missing values on secondary variables are imputed using domain-specific defaults (e.g., median parental education = ISCED level 3).

4. **Variable Transformation**:
   - Parental education: ISCED levels converted to ordinal scale (0-5)
   - Gender: Binary encoding (0 = female, 1 = male)
   - Home possessions: Binary indicators for computer and internet access
   - Books at home: Categorical variable converted to approximate counts

### 2.2 Socioeconomic Status Measurement

The primary measure of socioeconomic background is the PISA Index of Economic, Social and Cultural Status (ESCS). ESCS is a composite index derived from:
- Highest parental occupation (HISEI)
- Highest parental education (in years of schooling)
- Home possessions

ESCS is standardized within each assessment cycle to have mean 0 and standard deviation 1 across OECD countries. This standardization enables cross-national comparability while preserving within-country variation.

### 2.3 Achievement Measurement

Achievement is operationalized using mathematics scores as the primary outcome. PISA employs plausible values methodology to account for measurement error (von Davier et al., 2009). For computational efficiency in the web application, we utilize the first plausible value for mathematics achievement. Scores are scaled to have international mean approximately 500 and standard deviation 100.

### 2.4 Sampling and Weighting

PISA employs a two-stage stratified sampling design: schools are sampled first, then students within schools. To ensure representativeness:
- Student-level weights (`stu_wgt`) adjust for differential selection probabilities
- Replicate weights enable standard error estimation via balanced repeated replication (BRR)

For medium-sized datasets optimized for browser performance, stratified random sampling maintains 1,000 students per country-year combination, preserving the original SES distribution within each stratum.

## 3. Statistical Methods

### 3.1 Descriptive Statistics

#### 3.1.1 Central Tendency and Dispersion

Summary statistics account for complex survey design using survey weights:
- Weighted mean achievement: $\bar{y}_w = \frac{\sum_{i=1}^{n} w_i y_i}{\sum_{i=1}^{n} w_i}$
- Weighted standard deviation: $s_w = \sqrt{\frac{\sum_{i=1}^{n} w_i (y_i - \bar{y}_w)^2}{\sum_{i=1}^{n} w_i}}$

where $y_i$ represents achievement for student $i$ and $w_i$ is the survey weight.

#### 3.1.2 Achievement Gaps

Socioeconomic achievement gaps are calculated as:
$$\text{Gap} = \bar{y}_{Q4} - \bar{y}_{Q1}$$

where $\bar{y}_{Q4}$ and $\bar{y}_{Q1}$ represent mean achievement in the top and bottom SES quartiles, respectively.

### 3.2 Regression Analysis

#### 3.2.1 Basic Linear Model

The baseline regression model estimates the association between SES and achievement:

$$y_i = \beta_0 + \beta_1 \text{SES}_i + \epsilon_i$$

where:
- $y_i$ = achievement score for student $i$
- $\text{SES}_i$ = socioeconomic status (ESCS index)
- $\beta_1$ = SES slope (points gained per standard deviation increase in SES)
- $\epsilon_i$ = error term

#### 3.2.2 Extended Models with Controls

Extended models incorporate demographic and contextual variables:

$$y_i = \beta_0 + \beta_1 \text{SES}_i + \beta_2 \text{Gender}_i + \beta_3 \text{ParentEdu}_i + \sum_{k=4}^{K} \beta_k X_{ki} + \epsilon_i$$

where $X_{ki}$ represents additional control variables (home resources, school characteristics).

#### 3.2.3 Survey-Weighted Regression

To account for complex sampling, weighted least squares regression is implemented:

$$\min_{\boldsymbol{\beta}} \sum_{i=1}^{n} w_i (y_i - \mathbf{x}_i'\boldsymbol{\beta})^2$$

Standard errors are computed using replicate weights via BRR method to reflect design effects.

#### 3.2.4 Multilevel Analysis

For pooled analyses across countries, hierarchical linear models (HLM) decompose variance:

**Level 1 (Student):**
$$y_{ij} = \beta_{0j} + \beta_{1j} \text{SES}_{ij} + r_{ij}$$

**Level 2 (Country):**
$$\beta_{0j} = \gamma_{00} + u_{0j}$$
$$\beta_{1j} = \gamma_{10} + u_{1j}$$

The intraclass correlation (ICC) quantifies between-country variance:
$$\rho = \frac{\sigma^2_u}{\sigma^2_u + \sigma^2_r}$$

### 3.3 Inequality Decomposition

#### 3.3.1 Variance Decomposition

Total achievement variance is decomposed into within-group and between-group components:

$$\sigma^2_{total} = \sigma^2_{between} + \sigma^2_{within}$$

The variance ratio indicates the proportion explained by SES quartiles:
$$R^2 = \frac{\sigma^2_{between}}{\sigma^2_{total}}$$

#### 3.3.2 Blinder-Oaxaca Decomposition

For temporal comparisons, achievement differences are decomposed:

$$\Delta\bar{y} = (\bar{X}_2 - \bar{X}_1)'\beta_1 + \bar{X}_2'(\beta_2 - \beta_1)$$

where the first term captures composition effects (changing SES distribution) and the second captures coefficient effects (changing returns to SES).

### 3.4 Inequality Metrics

#### 3.4.1 Gini Coefficient

The Gini coefficient measures concentration of achievement:

$$G = \frac{\sum_{i=1}^{n} \sum_{j=1}^{n} |y_i - y_j|}{2n^2\bar{y}}$$

Values range from 0 (perfect equality) to 1 (maximum inequality).

#### 3.4.2 Lorenz Curve

The Lorenz curve plots cumulative proportion of achievement against cumulative proportion of students (ranked by achievement):

$$L(p) = \frac{\sum_{i=1}^{np} y_i}{\sum_{i=1}^{n} y_i}$$

Greater deviation from the 45-degree line indicates higher inequality.

#### 3.4.3 Theil Index

The Theil index measures entropy-based inequality:

$$T = \frac{1}{n}\sum_{i=1}^{n} \frac{y_i}{\bar{y}} \ln\left(\frac{y_i}{\bar{y}}\right)$$

Theil's T can be additively decomposed into within-group and between-group inequality.

### 3.5 Effect Size Metrics

#### 3.5.1 Cohen's d

Standardized mean differences between SES groups:

$$d = \frac{\bar{y}_1 - \bar{y}_2}{s_{pooled}}$$

where $s_{pooled} = \sqrt{\frac{(n_1-1)s_1^2 + (n_2-1)s_2^2}{n_1 + n_2 - 2}}$

#### 3.5.2 Correlation Coefficient

The Pearson correlation quantifies linear association strength:

$$r = \frac{\sum_{i=1}^{n}(x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum_{i=1}^{n}(x_i - \bar{x})^2}\sqrt{\sum_{i=1}^{n}(y_i - \bar{y})^2}}$$

## 4. Visualization Methods

### 4.1 Distribution Plots

#### 4.1.1 Kernel Density Estimation

Achievement distributions are visualized using Gaussian kernel density estimation:

$$\hat{f}(x) = \frac{1}{nh}\sum_{i=1}^{n} K\left(\frac{x - x_i}{h}\right)$$

where $K$ is the Gaussian kernel and $h$ is bandwidth selected via Silverman's rule of thumb.

#### 4.1.2 Box Plots

Box plots display five-number summaries (minimum, Q1, median, Q3, maximum) with outliers identified using the 1.5×IQR criterion.

### 4.2 Regression Visualizations

#### 4.2.1 Scatter Plots with Regression Lines

Bivariate relationships visualized via scatter plots with overlaid ordinary least squares (OLS) regression lines. Confidence bands represent 95% confidence intervals for predicted values.

#### 4.2.2 Residual Plots

Model diagnostics via residual analysis:
- Residual vs. fitted values: assesses homoscedasticity
- Q-Q plots: evaluates normality assumption
- Scale-location plots: checks variance equality

### 4.3 Inequality Visualizations

#### 4.3.1 Lorenz Curves

Lorenz curves plotted with reference line (perfect equality) for visual assessment of inequality magnitude. Note: Display limited to three countries simultaneously for visual clarity.

#### 4.3.2 Bar Charts

Comparative bar charts display inequality metrics (Gini, achievement gaps) across countries with confidence intervals derived from replicate weights.

## 5. Application Architecture

### 5.1 Technical Implementation

The application is implemented as a client-side web application using HTML5, JavaScript, and external libraries:

- **Plotly.js**: Interactive statistical graphics
- **PapaParse**: CSV parsing
- **Simple-statistics**: Statistical computations
- **D3.js**: Data manipulation
- **jStat**: Probability distributions

### 5.2 Data Loading

Users load preprocessed PISA data files (JSON or CSV format):
1. File validation ensures required fields (country, year, achievement, ses) are present
2. Files exceeding 500 MB are rejected to prevent browser memory exhaustion
3. Data are parsed into JavaScript arrays for analysis

### 5.3 Interactive Controls

User interface provides:
- Country selection (single or multiple with checkboxes)
- Year selection (temporal analysis support)
- Control variable selection (gender, parental education, home resources)
- Visualization type selection
- Analysis method specification

### 5.4 Computational Workflow

Analysis pipeline:
1. **Data Filtering**: Subset data based on user-specified countries/years
2. **Computation**: Calculate requested statistics using survey weights
3. **Visualization**: Generate interactive plots with Plotly
4. **Output**: Display results with interpretation guidance

## 6. Analytical Procedures

### 6.1 Within-Country Analysis

For single-country selection:
1. Compute weighted descriptive statistics
2. Estimate regression models with selected controls
3. Calculate inequality metrics
4. Generate country-specific visualizations

### 6.2 Cross-Country Comparison

For multiple-country selection:
1. Compute statistics separately for each country
2. Standardize metrics for comparability
3. Generate comparative visualizations
4. Calculate between-country variance in inequality

### 6.3 Temporal Analysis

For multiple-year selection:
1. Compute time-series of inequality metrics
2. Assess trends using linear regression
3. Conduct decomposition analysis to identify sources of change
4. Visualize temporal patterns with line plots

### 6.4 Decomposition Analysis

Variance decomposition procedure:
1. Partition sample into SES quartiles
2. Calculate within-quartile variance
3. Calculate between-quartile variance
4. Compute variance ratios and proportion explained

## 7. Interpretation Guidelines

### 7.1 SES Slope Interpretation

The SES regression coefficient ($\beta_1$) represents the expected achievement difference (in score points) associated with a one standard deviation increase in ESCS. Typical values:
- $\beta_1$ < 30: Weak SES gradient
- $\beta_1$ = 30-40: Moderate SES gradient
- $\beta_1$ > 40: Strong SES gradient

### 7.2 Achievement Gap Interpretation

The Q4-Q1 achievement gap quantifies inequality in absolute terms:
- Gap < 60: Low inequality
- Gap = 60-90: Moderate inequality  
- Gap > 90: High inequality

### 7.3 Variance Explained Interpretation

$R^2$ from SES regression indicates proportion of achievement variance explained:
- $R^2$ < 0.10: SES weakly predictive
- $R^2$ = 0.10-0.20: SES moderately predictive
- $R^2$ > 0.20: SES strongly predictive

### 7.4 Gini Coefficient Interpretation

Gini values for achievement typically range 0.08-0.15:
- G < 0.10: Relatively equal achievement distribution
- G = 0.10-0.12: Moderate inequality
- G > 0.12: High inequality

## 8. Limitations and Considerations

### 8.1 Causality

All analyses are correlational. Associations between SES and achievement do not imply causal relationships due to potential confounding and reverse causality.

### 8.2 Measurement

PISA scores are standardized assessments that may not capture all relevant dimensions of educational achievement. ESCS is a composite index that simplifies multidimensional socioeconomic variation.

### 8.3 Sample Size

Medium-sized datasets (n ≈ 1,000 per country-year) provide adequate statistical power for main effects but may lack precision for subgroup analyses. Confidence intervals appropriately reflect uncertainty.

### 8.4 Cross-National Comparability

While PISA employs rigorous standardization procedures, cross-national comparisons should be interpreted cautiously given cultural, linguistic, and institutional differences.

### 8.5 Survey Weights

Weighted analyses account for sampling design but assume weights correctly represent population parameters. Non-response and coverage errors may remain.

## 9. Best Practices for Use

### 9.1 Exploratory Phase

1. Begin with single-country, single-year analysis
2. Examine distributions and identify outliers
3. Check correlation matrix for multicollinearity
4. Visualize relationships before formal modeling

### 9.2 Modeling Phase

1. Start with bivariate SES-achievement model
2. Add controls incrementally to assess robustness
3. Check model diagnostics (residuals, influence)
4. Compare nested models using F-tests or information criteria

### 9.3 Comparative Phase

1. Standardize metrics across countries for comparability
2. Account for multiple comparisons in significance testing
3. Visualize confidence intervals for uncertainty quantification
4. Interpret differences substantively, not just statistically

### 9.4 Reporting Phase

1. Report effect sizes alongside p-values
2. Provide confidence intervals for key estimates
3. Acknowledge limitations in interpretation
4. Consider alternative explanations for findings

## 10. Technical Specifications

### 10.1 Data Format Requirements

Input data must include:
- **country**: ISO 3-letter country code (character)
- **year**: Assessment year (integer)
- **achievement**: Mathematics score (numeric)
- **ses**: ESCS index (numeric)
- **studentWeight**: Survey weight (numeric)
- Optional: control variables (various types)

### 10.2 Computational Requirements

Browser requirements:
- Modern browser (Chrome, Firefox, Safari, Edge)
- Minimum 4 GB RAM
- JavaScript enabled
- Data files < 500 MB for stable performance

### 10.3 Performance Considerations

Computational complexity:
- Descriptive statistics: O(n)
- Regression analysis: O(n·p²) where p = number of predictors
- Inequality metrics: O(n log n) due to sorting
- Visualizations: O(n)

Recommended data sizes:
- Sample dataset (n ≈ 30,000): Near-instant computation
- Medium dataset (n ≈ 400,000): 1-5 seconds per analysis
- Full dataset (n ≈ 2,100,000): Use R/Python instead of browser

## 11. Validation and Quality Assurance

### 11.1 Statistical Validation

Implementation validated against:
- R statistical computing environment
- Published PISA technical reports
- Replicated analyses from peer-reviewed literature

### 11.2 Numerical Precision

JavaScript numerical computations use double-precision floating-point (IEEE 754). Precision adequate for educational assessment data (typically 0-1000 scale).

### 11.3 Data Quality Checks

Automated checks verify:
- Required fields present and non-missing
- Achievement scores within plausible range (0-1000)
- SES index standardized (approximate mean 0, SD 1)
- Survey weights positive and non-zero

## 12. References

Blinder, A. S. (1973). Wage discrimination: Reduced form and structural estimates. *Journal of Human Resources*, 8(4), 436--455. https://doi.org/10.2307/144855

Ganzeboom, H. B. G., De Graaf, P. M., & Treiman, D. J. (1992). A standard international socio-economic index of occupational status. *Social Science Research*, 21(1), 1--56. https://doi.org/10.1016/0049-089X(92)90017-B

Mislevy, R. J., Beaton, A. E., Kaplan, B., & Sheehan, K. M. (1992). Estimating population characteristics from sparse matrix samples of item responses. *Journal of Educational Measurement*, 29(2), 133--161. https://doi.org/10.1111/j.1745-3984.1992.tb00371.x

Oaxaca, R. (1973). Male-female wage differentials in urban labor markets. *International Economic Review*, 14(3), 693--709. https://doi.org/10.2307/2525981

OECD (2009). *PISA data analysis manual: SPSS* (2nd ed.). OECD Publishing. https://doi.org/10.1787/9789264056275-en

OECD (2024). *PISA 2022 Technical Report*. OECD Publishing. https://doi.org/10.1787/01820d6d-en

von Davier, M., Gonzalez, E., & Mislevy, R. (2009). What are plausible values and why are they useful? *IERI Monograph Series: Issues and Methodologies in Large-Scale Assessments*, 2, 9--36.

Wang, K., Yacobellis, P., Siregar, E., Romanes, S., Fitter, K., Dalla Riva, G. V., Cook, D., Tierney, N., Dingorkar, P., Sai Subramanian, S., & Chen, G. (2024). *learningtower: OECD PISA datasets from 2000--2022 in an easy-to-use format* (R package version 1.1.0). https://doi.org/10.32614/CRAN.package.learningtower

Wu, M. (2005). The role of plausible values in large-scale surveys. *Studies in Educational Evaluation*, 31(2--3), 114--128. https://doi.org/10.1016/j.stueduc.2005.05.005

Wuyts, C. (2024). The measurement of socio-economic status in PISA. OECD.

## 13. Appendix: Variable Codebook

### 13.1 Core Variables

| Variable | Description | Scale | Range |
|----------|-------------|-------|-------|
| country | Country code | Nominal | 3-letter ISO codes |
| year | Assessment year | Discrete | 2000, 2003, 2006, 2009, 2012, 2015, 2018, 2022 |
| achievement | Mathematics score | Continuous | 0-1000 |
| ses | ESCS index | Continuous | Approximately -4 to +4 |
| studentWeight | Survey weight | Continuous | > 0 |

### 13.2 Control Variables

| Variable | Description | Scale | Range |
|----------|-------------|-------|-------|
| gender | Student gender | Binary | 0 (female), 1 (male) |
| parentEdu | Maximum parental education | Ordinal | 0-5 (ISCED levels) |
| computerNum | Computer at home | Binary | 0 (no), 1 (yes) |
| internetNum | Internet at home | Binary | 0 (no), 1 (yes) |
| bookNum | Books at home | Continuous | Approximate count |
| wealth | Family wealth index | Continuous | Standardized |

## 14. Support and Citation

### 14.1 Citing This Tool

When using this tool in research, please cite as:

Schoenholzer, K. (2026). EduStrat: A browser-based tool for teaching quantitative analysis of educational inequality with PISA microdata [Working paper]. https://github.com/kevisc/edustrat

### 14.2 Data Citation

OECD Programme for International Student Assessment (PISA) data should be cited according to OECD guidelines. Access via the learningtower package should acknowledge Wang et al. (2024).

### 14.3 Contact

For methodological questions, bug reports, or feature requests, please open an issue on the project's GitHub repository: https://github.com/kevisc/edustrat

---

**Document Version**: 2.0
**Last Updated**: February 2026
**Author**: Kevin Schoenholzer, Università della Svizzera italiana (USI)
**License**: MIT License
