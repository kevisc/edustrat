---
title: 'EduStrat: A Browser-Based Tool for Teaching Quantitative Analysis of Educational Inequality with PISA Microdata'
tags:
  - JavaScript
  - R
  - education
  - educational inequality
  - PISA
  - socioeconomic status
  - survey weighting
  - intergenerational transmission
  - teaching tool
authors:
  - name: Kevin Schoenholzer
    orcid: 0000-0001-9892-5869
    affiliation: 1
affiliations:
  - name: Institute of Communication and Public Policy, Università della Svizzera italiana (USI), Lugano, Switzerland
    index: 1
date: 25 March 2026
bibliography: paper.bib
---

# Summary

EduStrat (Educational Stratification in PISA) is a browser-based, open-source tool that enables students, instructors, and researchers to explore how parental socioeconomic characteristics predict student academic achievement using microdata from the OECD Programme for International Student Assessment [PISA; @oecd2024pisa]. The tool covers eight PISA cycles (2000--2022), more than 100 countries, and approximately 3.5 million student observations. Users select countries and years through an interactive interface; the application loads pre-generated data subsets on demand and performs all statistical computations client-side---requiring no software installation, no server, and no programming. EduStrat computes survey-weighted descriptive statistics, inequality indices (Gini coefficient, Lorenz curves, percentile ratios), regression models (pooled OLS, fixed effects, random effects) with diagnostic tests, achievement gap decomposition, and variance decomposition. All outputs can be exported as CSV tables, publication-quality figures (PNG/SVG), or self-contained HTML reports with embedded analytic metadata. In accordance with the OECD Terms of Use for PISA Public Use Files, the application does not redistribute micro-level student data; all exports provide computed estimates and aggregated statistics only.

# Statement of Need

Courses in comparative education, educational policy, and quantitative social science frequently engage with PISA data to illustrate concepts such as educational inequality, intergenerational transmission, and cross-national variation in achievement. However, working with PISA microdata presents substantial pedagogical barriers. The data arise from complex stratified sampling designs requiring proper survey weighting; achievement is released as plausible values; and results are sensitive to choices about weights, country selections, and regression specifications [@oecd2009; @wu2005; @mislevy1992]. Teaching these concepts typically requires students to write code in R, Stata, or Python before producing even basic descriptive summaries---diverting class time from substantive learning to software troubleshooting.

Existing tools partially address this gap. The `learningtower` R package [@wang2024] provides cleaned PISA extracts, but requires R proficiency. The OECD's PISA Data Explorer offers a web interface but is limited to pre-tabulated summaries without regression modelling or diagnostic testing. The `intsvy` [@caro2017] and `EdSurvey` [@bailey2024] R packages provide comprehensive analytical capabilities but assume substantial programming experience.

EduStrat fills the space between these tools: it provides the analytical depth of R-based packages (regression, decomposition, diagnostics) in an accessible browser interface that requires no installation or coding. This allows instructors to focus class time on interpreting results, comparing specifications, and understanding methodological choices---rather than debugging software environments. Students can immediately engage with questions like: *How does the ESCS gradient differ between Finland and the United States? How does the Hausman test inform the choice between fixed and random effects? What happens to inequality metrics when we change the country selection?*

# Functionality and Teaching Use

EduStrat implements the core quantitative methods taught in graduate courses on educational inequality and comparative education, organised across interactive analysis tabs.

**Survey-weighted descriptive statistics.** Students learn why sampling weights matter by toggling between weighted and unweighted results and observing how estimates change. The tool computes weighted means, standard deviations, and quantiles following OECD guidelines [@oecd2009].

**Inequality metrics.** The Gini coefficient, coefficient of variation, percentile ratios (P90/P10), and Lorenz curves allow students to compare distributional properties of achievement across countries and understand what each metric captures.

**ESCS gradients and quartile gaps.** The central measure of intergenerational transmission---the regression slope of achievement on the ESCS index [@wuyts2024]---is computed with interactive visualisations showing scatter plots and fitted lines. Quartile-based gaps (Q4--Q1) with Cohen's *d* provide intuitive effect size interpretation.

**Regression model comparison.** Students estimate pooled OLS, country fixed-effects, and random-effects models side by side, with coefficient tables, diagnostic plots (residual vs. fitted, Q-Q plots), and the Hausman specification test. This teaches specification sensitivity: how conclusions about the SES--achievement relationship change depending on modelling choices.

**Variance decomposition.** Within- and between-country decomposition with intraclass correlation illustrates multilevel structure in educational data.

**Export system.** Results are exportable as CSV, PNG/SVG, or self-contained HTML reports with embedded analytic metadata (countries, years, variables, weight choice, model specification). This supports reproducibility and teaches students to document their analytic decisions. Per OECD Terms of Use, exports provide aggregated statistics and computed estimates only---not individual student records.

The tool has been used in graduate-level instruction at the Università della Svizzera italiana to teach survey weighting, regression specification sensitivity, and cross-country inequality comparisons. Its browser-based design has proven effective in workshop settings where participants have heterogeneous software environments. Instructors can adopt EduStrat by directing students to the hosted application or by serving it locally with any HTTP server. The modular codebase (20 ES6 JavaScript modules, ~11,200 lines) and comprehensive documentation (methodology, data sources, variable codebook) support both direct use and adaptation.

# Project Story

EduStrat originated from the practical challenge of teaching quantitative methods in comparative education. Preparing PISA microdata for classroom demonstrations required writing substantial data-wrangling and analysis code before each session, and students without R or Stata experience could not independently replicate or extend the analyses shown in class. The tool was developed to package these recurring analytical operations---weighted descriptives, gradient estimation, specification comparison, variance decomposition---into a self-contained web application that students could use immediately.

The data architecture reflects a key constraint: serving approximately 3.5 million student records to a browser. Rather than loading the full ~1.25 GB dataset, EduStrat pre-generates 513 country--year JSON files and loads only the requested subsets (typically 30--40 MB). The data pipeline consists of three R scripts that extract, chunk, and validate PISA microdata from the `learningtower` package [@wang2024]. Statistical computations use survey weights throughout, with outputs validated against R reference implementations. Design trade-offs---using a single plausible value per domain (a constraint of the `learningtower` package, which provides only PV1) and omitting replicate-weight variance estimation---are documented in the interface and discussed in the accompanying methodology documentation, providing additional teaching opportunities about the gap between exploratory and inferential analysis.

# Acknowledgements

EduStrat is archived on Zenodo [@schoenholzer2026edustrat] and a live demo is available at [kevinschoenholzer.com/edustrat](https://kevinschoenholzer.com/edustrat/).

This work uses data from the OECD Programme for International Student Assessment [@oecd2024pisa], accessed via the `learningtower` R package [@wang2024]. The author thanks the OECD for making PISA data publicly available and the `learningtower` development team for their data harmonisation work. The author acknowledges support from the Università della Svizzera italiana. Generative AI tools (Claude, Anthropic) were used during development for code generation assistance and documentation drafting; all outputs were reviewed and validated by the author.

# References
