# Outreach Emails — EduStrat Publication

## 1. Email to learningtower R package maintainer

**To:** kevinwangstats@gmail.com
**Subject:** EduStrat — a web tool built on learningtower; seeking feedback before publication

---

Dear Dr. Wang,

I am writing to let you know about a project that builds directly on the learningtower R package and to ask for your feedback before I submit a paper describing it.

**What I built.** EduStrat (Educational Stratification in PISA) is a browser-based tool for exploratory analysis of how parental socioeconomic status relates to student achievement in PISA data. It uses learningtower as its data source: an R pipeline extracts and chunks the harmonised PISA microdata from the package into 513 country–year JSON files, which the JavaScript application then loads on demand in the browser. The tool covers all eight PISA cycles (2000–2022) available through learningtower and approximately 3.5 million student observations across 101 countries.

The application provides survey-weighted descriptive statistics, inequality metrics, ESCS gradient estimation, regression model comparison (OLS, fixed effects, random effects), variance decomposition, and exportable results — all without requiring users to install R or write code. It is designed primarily for teaching quantitative methods in comparative education and for exploratory research.

- Live application: https://kevinschoenholzer.com/edustrat/
- Source code: https://github.com/kevisc/edustrat

**Why I am writing.** I am preparing a submission to the Journal of Open Source Education (JOSE) describing EduStrat as educational software. Before submitting, I wanted to:

1. **Inform you** that learningtower is a core dependency and data source for this project.
2. **Ask whether you are comfortable** with this use of the package. The data pipeline calls learningtower's functions to extract and preprocess the PISA microdata. The pre-generated JSON files are derived from this extraction.
3. **Ask whether the citation is appropriate.** I currently cite learningtower as follows:

   > Wang, K., Yacobellis, P., Siregar, E., Romanes, S., Fitter, K., Dalla Riva, G. V., Cook, D., Tierney, N., Dingorkar, P., Sai Subramanian, S., & Chen, G. (2024). learningtower: OECD PISA datasets from 2000–2022 in an easy-to-use format. R package version 1.1.0. https://doi.org/10.32614/CRAN.package.learningtower

   If there is a preferred citation or if the author list should be updated, I am happy to adjust.

4. **Ask whether you have any concerns** about the project, the way I use the data, or anything else.

I would be grateful for any feedback. The project is open-source under the MIT licence and acknowledges learningtower prominently in the documentation, the paper, and the application itself.

Thank you for building learningtower — it made this project possible.

Best regards,
Kevin Schoenholzer
Università della Svizzera italiana (USI)
kevin.schoenholzer@usi.ch
https://kevinschoenholzer.com

---

## 2. Email to OECD PISA team

**To:** edu.pisa@oecd.org
**Subject:** Secondary use of PISA public-use microdata in an open-source educational tool — seeking confirmation

---

Dear PISA Data Team,

I am a postdoctoral researcher at the Università della Svizzera italiana (USI) in Lugano, Switzerland. I am writing to inform you about a project that uses publicly available PISA microdata and to confirm that my usage and citation are consistent with the OECD's data use policies.

**About the project.** I have developed EduStrat (Educational Stratification in PISA), a browser-based, open-source tool for exploratory analysis of the relationship between family socioeconomic status (ESCS) and student achievement using PISA data. The tool covers eight PISA assessment cycles (2000–2022), more than 100 participating countries, and approximately 3.5 million student observations. It is designed for use in graduate-level instruction and exploratory research.

- Live application: https://kevinschoenholzer.com/edustrat/
- Source code: https://github.com/kevisc/edustrat

**Data source and processing.** The underlying data are accessed through the learningtower R package (Wang et al., 2024), which provides harmonised extracts of the publicly available PISA student questionnaire and cognitive assessment files. My preprocessing pipeline extracts student-level records (achievement scores, ESCS index, demographic variables, and sampling weights) and stores them as country–year JSON files for browser consumption. No restricted-access or confidential PISA files are used. The tool works exclusively with variables available in the public-use files.

**Planned publication.** I am preparing a paper describing EduStrat for submission to the Journal of Open Source Education (JOSE). The paper and the application cite the PISA data source as follows:

> OECD (2009). PISA data analysis manual: SPSS (2nd ed.). OECD Publishing. https://doi.org/10.1787/9789264056275-en
>
> OECD (2024). Programme for International Student Assessment (PISA) Database. Paris: OECD. Available at: https://www.oecd.org/pisa/

The application documentation also directs users to cite the PISA data directly when publishing results derived from the tool.

**My questions:**

1. Is there any concern with this use of publicly available PISA microdata in an open-source educational tool?
2. Is the citation format above appropriate, or is there a preferred citation you would like me to use?
3. Are there any additional terms of use or acknowledgement requirements I should be aware of?

The tool is non-commercial, open-source (MIT licence), and designed to make PISA data more accessible for teaching and exploratory research. I want to ensure full compliance with the OECD's data policies before publication.

Thank you for your time and for making PISA data publicly available. The programme's commitment to open data is what makes projects like this possible.

Best regards,
Kevin Schoenholzer
Postdoctoral Researcher
Institute of Communication and Public Policy
Università della Svizzera italiana (USI)
kevin.schoenholzer@usi.ch
ORCID: 0000-0001-9892-5869
https://kevinschoenholzer.com
