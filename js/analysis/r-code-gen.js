/**
 * R code generation — the "Show the R" panels.
 *
 * For every results surface the app can emit (a) the R code that reproduces the
 * analysis on the same data with the user's current selections baked in, (b) the
 * estimator in notation with the live numbers substituted, and (c) the expected R
 * output built from the very model object the table on screen was rendered from.
 *
 * The "expected output" claim is honest by construction: every estimator shown
 * here is numerically verified against the corresponding R call (VERIFICATION.md;
 * pipeline/scripts/04, 06, 07, 08), so the numbers the app displays are the
 * numbers R prints, to the documented precision. The templates below mirror the
 * verified R calls one-to-one.
 *
 * Two data preambles are offered:
 *   - 'learningtower' (default): the public R package the app's chunks derive
 *     from (pipeline/scripts/01-generate-chunks.R). Fully public reproduction.
 *   - 'chunk': reads the app's own country-year JSON chunks with jsonlite — for
 *     readers who cloned the repository. Used by the verification harness to run
 *     generated snippets end-to-end.
 * BRR standard errors are the one case learningtower cannot reproduce (it ships
 * only the final weight); those snippets switch the preamble to the OECD Public
 * Use Files, exactly as pipeline/scripts/05-add-replicate-weights.R documents.
 *
 * This module is pure (no DOM) so the harness can exercise it in Node.
 *
 * Author: Kevin Schoenholzer
 */

const R_OUTCOME = { math: 'math', reading: 'read', science: 'science' };
const TRENDS_METRIC_LABEL = {
    mean: 'weighted mean (with standard error)',
    gradient: 'ESCS gradient (with standard error)',
    gini: 'weighted achievement Gini',
    gap: 'Q4-Q1 SES achievement gap'
};

function fmt(v, d = 3) {
    return (v === null || v === undefined || !isFinite(v)) ? 'NA' : (+v).toFixed(d);
}

function pFmt(p) {
    if (p === null || p === undefined || !isFinite(p)) return 'NA';
    return p < 2e-16 ? '<2e-16' : p.toExponential(2);
}

/** Map the app's variable names onto the names R's summary() would print. */
function rVarName(name, spec) {
    if (name === 'Intercept') return '(Intercept)';
    if (name === spec.predictorVar) return spec.predictorVar === 'reading' ? 'read' : name;
    if (name.startsWith('α_')) return `factor(country)${name.slice(2)}`;
    if (name.startsWith('γ_')) return `factor(year)${name.slice(2)}`;
    if (name === 'Female') return 'female';
    if (name === 'Parental_Education') return 'parent_edu';
    return name;
}

function rVec(values, quote = true) {
    const items = values.map(v => (quote ? `"${v}"` : v));
    return items.length === 1 ? items[0] : `c(${items.join(', ')})`;
}

// --- Data preamble -------------------------------------------------------------

/**
 * Shared data-loading preamble for the user's current selection.
 * @param {Object} spec - { countries, years, outcomeVar, predictorVar, weightType,
 *                          controls, dataSource, chunkDir }
 */
export function buildDataPreamble(spec) {
    const outcomeR = R_OUTCOME[spec.outcomeVar] || spec.outcomeVar;
    const lines = [];

    if (spec.dataSource === 'chunk') {
        lines.push(
            '# Data: the app\'s own country-year chunks (repository clone).',
            'library(jsonlite)',
            'library(dplyr)',
            '',
            `codes <- expand.grid(country = ${rVec(spec.countries)}, year = ${rVec(spec.years, false)})`,
            'student <- do.call(rbind, lapply(seq_len(nrow(codes)), function(i) {',
            `  ch <- fromJSON(file.path(${JSON.stringify(spec.chunkDir || 'data/country-year')},`,
            '    paste0(codes$country[i], "_", codes$year[i], ".json")))',
            '  ch$students',
            '}))',
            `student$read <- student$reading  # chunks use the app's field name`
        );
    } else {
        lines.push(
            '# Data: the public learningtower package — the same source the app\'s',
            '# chunks are generated from (pipeline/scripts/01-generate-chunks.R).',
            'library(learningtower)',
            'library(dplyr)',
            '',
            `student <- load_student(${rVec(spec.years, false)}) |>`,
            `  filter(country %in% ${rVec(spec.countries)})`
        );
    }

    lines.push(
        '',
        '# Weights: non-positive/missing final student weights fall back to 1,',
        '# exactly as the app\'s getWeight() does.',
        'student <- student |>',
        '  mutate(stu_wgt = ifelse(is.finite(stu_wgt) & stu_wgt > 0, stu_wgt, 1))'
    );

    if (spec.weightType === 'senate') {
        lines.push(
            '',
            '# Senate weights: the final weight rescaled so each country-cycle sums',
            '# to 5,000 (every country counts equally, regardless of size).',
            'student <- student |>',
            '  group_by(country, year) |>',
            '  mutate(w_sen = stu_wgt * 5000 / sum(stu_wgt)) |>',
            '  ungroup()'
        );
    }

    if (spec.predictorVar === 'parent_edu' || (spec.controls || []).includes('parent_edu')) {
        lines.push(
            '',
            '# Parental education: highest ISCED level of either parent, parsed the',
            '# same way as the app (numeric, or the digit in "ISCED 3A" etc.).',
            'parse_isced <- function(v) {',
            '  n <- suppressWarnings(as.numeric(v))',
            '  ifelse(is.finite(n), n,',
            '    suppressWarnings(as.numeric(sub(".*ISCED\\\\s*([0-9]).*", "\\\\1", toupper(v)))))',
            '}',
            'student <- student |>',
            '  mutate(parent_edu = pmax(parse_isced(mother_educ), parse_isced(father_educ), na.rm = TRUE))'
        );
    }

    if ((spec.controls || []).includes('gender')) {
        lines.push(
            '',
            'student <- student |>',
            '  mutate(female = as.integer(substr(tolower(gender), 1, 1) == "f"))'
        );
    }

    lines.push(
        '',
        `# The app drops rows with a missing outcome or predictor (listwise).`,
        `student <- student |> filter(is.finite(${outcomeR}), is.finite(${spec.predictorVar === 'reading' ? 'read' : spec.predictorVar}))`
    );

    return lines.join('\n');
}

function weightsArg(spec) {
    if (spec.weightType === 'none') return '';
    if (spec.weightType === 'senate') return ', weights = w_sen';
    return ', weights = stu_wgt';
}

function rhsTerms(spec, { countryFE = false } = {}) {
    const terms = [spec.predictorVar === 'reading' ? 'read' : spec.predictorVar];
    if (countryFE) terms.push('factor(country)');
    const controls = spec.controls || [];
    if (controls.includes('year')) terms.push('factor(year)');
    if (controls.includes('gender')) terms.push('female');
    if (controls.includes('parent_edu') && spec.predictorVar !== 'parent_edu') terms.push('parent_edu');
    return terms.join(' + ');
}

// --- Expected-output helpers -----------------------------------------------------

function coefficientBlock(model, spec, { brr = false } = {}) {
    const SE = brr && model.standardErrorsBRR ? model.standardErrorsBRR : model.standardErrors;
    const TT = brr && model.tStatisticsBRR ? model.tStatisticsBRR : model.tStatistics;
    const PP = brr && model.pValuesBRR ? model.pValuesBRR : model.pValues;
    const rows = [];
    const nameW = Math.max(...model.variableNames.map(n => rVarName(n, spec).length), 12);
    rows.push(`## ${'Term'.padEnd(nameW)}  ${'Estimate'.padStart(10)}  ${'Std. Error'.padStart(10)}  ${'t value'.padStart(8)}  Pr(>|t|)`);
    model.coefficients.forEach((b, i) => {
        // Long dummy lists add noise; keep the intercept, the focal predictor and
        // controls, and summarise the fixed-effect dummies.
        const raw = model.variableNames[i];
        if ((raw.startsWith('α_') || raw.startsWith('γ_')) && model.variableNames.length > 8) return;
        rows.push(`## ${rVarName(raw, spec).padEnd(nameW)}  ${fmt(b).padStart(10)}  ${fmt(SE[i]).padStart(10)}  ${fmt(TT ? TT[i] : b / SE[i], 2).padStart(8)}  ${pFmt(PP ? PP[i] : NaN)}`);
    });
    const nDummies = model.variableNames.filter(n => n.startsWith('α_') || n.startsWith('γ_')).length;
    if (nDummies > 0 && model.variableNames.length > 8) {
        rows.push(`## (${nDummies} fixed-effect dummies omitted from this preview)`);
    }
    return rows.join('\n');
}

// --- Generators ------------------------------------------------------------------

/**
 * Regression models (pooled OLS / country fixed effects / random effects).
 * @param {Object} model - fitted model object as rendered (runPooledOLS/FE/RE)
 * @param {Object} spec - selection spec
 */
export function generateRegressionCode(model, spec) {
    const outcomeR = R_OUTCOME[spec.outcomeVar] || spec.outcomeVar;
    const isFE = /Fixed Effects/.test(model.modelName);
    const isRE = /Random Effects/.test(model.modelName);
    const usesBRR = model.seActive === 'BRR';

    let code = buildDataPreamble(spec) + '\n\n';
    let note = '';

    if (isRE) {
        code += [
            '# Random effects (Swamy–Arora), as verified against plm. plm has no',
            '# weighted random-effects estimator, so the verified comparison is the',
            '# UNWEIGHTED model; the app applies the same quasi-demeaning with weights.',
            'library(plm)',
            `m <- plm(${outcomeR} ~ ${rhsTerms(spec)}, data = student,`,
            '         index = "country", model = "random", random.method = "swar")',
            'summary(m)'
        ].join('\n');
        note = 'Weighted RE has no exact plm equivalent; the unweighted call above is the verified reference (VERIFICATION.md).';
    } else if (usesBRR) {
        code += [
            '# This model\'s displayed standard errors are BRR (80 Fay replicate',
            '# weights). learningtower ships only the final weight, so replicate-',
            '# weight inference needs the OECD Public Use File (SPSS student file,',
            '# W_FSTURWT1..80) — see pipeline/scripts/05-add-replicate-weights.R.',
            'library(intsvy)',
            `# point estimate + BRR SE with intsvy on the PUF data frame \`puf\`:`,
            `pisa.reg(y = "PV1${spec.outcomeVar.toUpperCase()}", x = ${rVec([spec.predictorVar === 'reading' ? 'read' : spec.predictorVar])}, data = puf)`,
            '',
            '# The point estimates (not the BRR errors) are reproduced from public',
            '# data by the weighted lm below:',
            `m <- lm(${outcomeR} ~ ${rhsTerms(spec, { countryFE: isFE })}, data = student${weightsArg(spec)})`,
            'summary(m)'
        ].join('\n');
        note = 'BRR standard errors require the OECD PUF replicate weights; the app computes them with the verified Fay formula (pipeline/scripts/06-verify-brr.R).';
    } else {
        code += [
            `# ${model.modelName} — the verified R equivalent (VERIFICATION.md).`,
            `m <- lm(${outcomeR} ~ ${rhsTerms(spec, { countryFE: isFE })}, data = student${weightsArg(spec)})`,
            'summary(m)'
        ].join('\n');
        if (model.standardErrorsCluster) {
            code += [
                '',
                '',
                '# School-clustered standard errors (students are sampled within schools):',
                'library(sandwich)',
                'sqrt(diag(vcovCL(m, cluster = student$school_id, type = "HC1")))'
            ].join('\n');
        }
    }

    const seLabel = usesBRR ? ' (BRR, as displayed)' : '';
    const expectedOutput = [
        `## Expected output${seLabel} — these are the app's verified numbers:`,
        coefficientBlock(model, spec, { brr: usesBRR }),
        `## R-squared: ${fmt(model.r2)}   Adj. R-squared: ${fmt(model.adjR2)}   N: ${model.nobs.toLocaleString()}`
    ].join('\n');

    const beta = model.coefficients[1], se = (usesBRR && model.standardErrorsBRR ? model.standardErrorsBRR : model.standardErrors)[1];
    const notation = isRE
        ? `y<sub>ic</sub> = (α + u<sub>c</sub>) + β·x<sub>ic</sub> + ε<sub>ic</sub>, GLS with Swamy–Arora variance components — β̂ = <strong>${fmt(beta, 2)}</strong> (SE ${fmt(se, 2)})`
        : isFE
            ? `y<sub>ic</sub> = α<sub>c</sub> + β·x<sub>ic</sub> + ε<sub>ic</sub>, country intercepts α<sub>c</sub> — β̂ = <strong>${fmt(beta, 2)}</strong> (SE ${fmt(se, 2)})`
            : `y<sub>i</sub> = α + β·x<sub>i</sub> + ε<sub>i</sub>, weighted least squares — β̂ = <strong>${fmt(beta, 2)}</strong> (SE ${fmt(se, 2)})`;

    return { title: model.modelName, code, notation, expectedOutput, note };
}

/**
 * FIML vs listwise comparison (Regression tab card).
 */
export function generateFimlCode(ccModel, fimlModel, spec) {
    const outcomeR = R_OUTCOME[spec.outcomeVar] || spec.outcomeVar;
    const x = spec.predictorVar === 'reading' ? 'read' : spec.predictorVar;

    // FIML keeps partially observed rows, so the preamble must NOT listwise-filter.
    const preamble = buildDataPreamble({ ...spec, controls: [] })
        .replace(/\n# The app drops rows[\s\S]*$/, '');

    const code = [
        preamble,
        '',
        '# Listwise deletion (the default everywhere else in the app):',
        `cc <- lm(${outcomeR} ~ ${x}, data = filter(student, is.finite(${outcomeR}), is.finite(${x}))${weightsArg(spec)})`,
        '',
        '# FIML: the app estimates the joint-normal model by EM over every',
        '# partially-observed student. It is verified to machine precision against',
        '# an independent R EM (pipeline/scripts/08-verify-fiml.R). A convergent',
        '# check with multiple imputation:',
        'library(mice)',
        `d   <- select(student, ${outcomeR}, ${x})`,
        'w   <- student$stu_wgt',
        'imp  <- mice(d, m = 20, method = "norm", seed = 2026, printFlag = FALSE)',
        `fits <- with(imp, lm(${outcomeR} ~ ${x}, weights = w))`,
        'summary(pool(fits))'
    ].join('\n');

    const expectedOutput = [
        '## Expected output — the app\'s verified numbers:',
        `## Listwise:  beta = ${fmt(ccModel.coefficients[1])}  (SE ${fmt(ccModel.standardErrors[1])}, n = ${ccModel.nobs.toLocaleString()})`,
        `## FIML:      beta = ${fmt(fimlModel.coefficients[1])}  (SE ${fmt(fimlModel.standardErrors[1])}, n = ${fimlModel.nUsed.toLocaleString()} incl. ${(fimlModel.nUsed - fimlModel.nComplete).toLocaleString()} partial)`,
        '## mice pooling agrees with the FIML slope to well under 1% on the verified datasets.'
    ].join('\n');

    const notation = `(μ̂, Σ̂) from EM over all observed patterns; β̂ = Σ̂<sub>xy</sub>/Σ̂<sub>xx</sub> = <strong>${fmt(fimlModel.coefficients[1], 2)}</strong> vs listwise <strong>${fmt(ccModel.coefficients[1], 2)}</strong>`;

    return { title: 'Missing data: listwise vs FIML', code, notation, expectedOutput, note: '' };
}

/**
 * Within-country trends (Trends tab): per-cycle estimates + precision-weighted
 * trend + country fixed-effects panel.
 */
export function generateTrendsCode(analysis, spec) {
    const outcomeR = R_OUTCOME[spec.outcomeVar] || spec.outcomeVar;
    const x = spec.predictorVar === 'reading' ? 'read' : spec.predictorVar;
    const countries = Object.keys(analysis.byCountry);
    const metric = analysis.metric;

    let helpers = [];
    let perCycle;
    if (metric === 'mean') {
        perCycle = [`  m <- lm(${outcomeR} ~ 1, data = s, weights = stu_wgt)`,
                    '  data.frame(country = s$country[1], year = s$year[1],',
                    '             est = coef(m)[1], se = summary(m)$coefficients[1, 2])'];
    } else if (metric === 'gradient') {
        perCycle = [`  m <- lm(${outcomeR} ~ ${x}, data = s, weights = stu_wgt)`,
                    '  data.frame(country = s$country[1], year = s$year[1],',
                    '             est = coef(m)[2], se = summary(m)$coefficients[2, 2])'];
    } else if (metric === 'gini') {
        helpers = ['gini_w <- function(y, w) {',
                   '  o <- order(y); y <- y[o]; w <- w[o]',
                   '  Fm <- (cumsum(w) - w/2) / sum(w)',
                   '  mu <- weighted.mean(y, w)',
                   '  2 * weighted.mean((y - mu) * (Fm - weighted.mean(Fm, w)), w) / mu',
                   '}', ''];
        perCycle = ['  data.frame(country = s$country[1], year = s$year[1],',
                    `             est = gini_w(s$${outcomeR}, s$stu_wgt), se = NA)  # no analytic SE without replicate weights`];
    } else { // gap
        helpers = ['wq <- function(v, w, p) { o <- order(v); v <- v[o]; w <- w[o]; v[which(cumsum(w) >= p * sum(w))[1]] }',
                   'gap_q41 <- function(y, x, w) {',
                   '  q1 <- x <= wq(x, w, 0.25); q4 <- x > wq(x, w, 0.75)',
                   '  weighted.mean(y[q4], w[q4]) - weighted.mean(y[q1], w[q1])',
                   '}', ''];
        perCycle = ['  data.frame(country = s$country[1], year = s$year[1],',
                    `             est = gap_q41(s$${outcomeR}, s$${x}, s$stu_wgt), se = NA)  # no analytic SE without replicate weights`];
    }

    const code = [
        '# Within-country trend over PISA cycles (Trends tab). The app loads every',
        '# available cycle for the focal countries — do the same here.',
        'library(learningtower)',
        'library(dplyr)',
        '',
        `student <- load_student("all") |> filter(country %in% ${rVec(countries)})`,
        'student <- student |> mutate(stu_wgt = ifelse(is.finite(stu_wgt) & stu_wgt > 0, stu_wgt, 1))',
        '',
        ...helpers,
        `# Per-cycle ${TRENDS_METRIC_LABEL[metric] || metric} per country:`,
        'cells <- do.call(rbind, lapply(split(student, list(student$country, student$year), drop = TRUE), function(s) {',
        `  s <- filter(s, is.finite(${outcomeR})${metric === 'mean' ? '' : `, is.finite(${x})`})`,
        '  if (nrow(s) < 100) return(NULL)',
        ...perCycle,
        '}))',
        '',
        ...(metric === 'mean' || metric === 'gradient'
            ? ['# Precision-weighted within-country trend (slope per DECADE), then the',
               '# country fixed-effects panel — exactly the verified calls',
               '# (pipeline/scripts/07-verify-trends.R):',
               'cells$time <- (cells$year - 2000) / 10',
               'by(cells, cells$country, function(d) summary(lm(est ~ time, data = d, weights = 1/se^2)))',
               'summary(lm(est ~ time + factor(country), data = cells, weights = 1/se^2))']
            : ['# Without per-cycle standard errors the trend is fit equally weighted,',
               '# matching what the app reports for this metric:',
               'cells$time <- (cells$year - 2000) / 10',
               'by(cells, cells$country, function(d) summary(lm(est ~ time, data = d)))',
               'summary(lm(est ~ time + factor(country), data = cells))'])
    ].join('\n');

    const lines = ['## Expected output — the app\'s verified numbers:'];
    countries.forEach(c => {
        const tr = analysis.byCountry[c].trend;
        if (tr) lines.push(`## ${c}: slope = ${fmt(tr.slopePerDecade)} per decade  (SE ${fmt(tr.se)}, ${tr.nCycles} cycles, ${tr.weighting})`);
    });
    if (analysis.fePanel) {
        const f = analysis.fePanel;
        lines.push(`## FE panel: slope = ${fmt(f.slopePerDecade)} per decade  (SE ${fmt(f.se)}, p ${fmt(f.p, 3)}, ${f.nCountries} countries, ${f.nCells} cells)`);
    }

    const notation = `θ̂<sub>ct</sub> per cycle, then θ̂<sub>ct</sub> = α<sub>c</sub> + β·(year−2000)/10 + ε, weights 1/SE² — β̂ = <strong>${analysis.fePanel ? fmt(analysis.fePanel.slopePerDecade, 2) : '—'}</strong> per decade`;

    return { title: 'Within-country trends', code, notation, expectedOutput: lines.join('\n'), note: '' };
}

/**
 * Q4–Q1 achievement gap (Gap Analysis tab, overall granularity).
 */
export function generateGapCode(gap, spec) {
    const outcomeR = R_OUTCOME[spec.outcomeVar] || spec.outcomeVar;
    const x = spec.predictorVar === 'reading' ? 'read' : spec.predictorVar;

    const code = [
        buildDataPreamble(spec),
        '',
        '# Survey-weighted SES quartiles, then the Q4-Q1 achievement gap:',
        'wq <- function(v, w, p) {           # weighted quantile (type used by the app)',
        '  o <- order(v); v <- v[o]; w <- w[o]',
        '  v[which(cumsum(w) >= p * sum(w))[1]]',
        '}',
        `w  <- ${spec.weightType === 'none' ? 'rep(1, nrow(student))' : (spec.weightType === 'senate' ? 'student$w_sen' : 'student$stu_wgt')}`,
        `q1 <- student$${x} <= wq(student$${x}, w, 0.25)`,
        `q4 <- student$${x} >  wq(student$${x}, w, 0.75)`,
        `m1 <- weighted.mean(student$${outcomeR}[q1], w[q1])`,
        `m4 <- weighted.mean(student$${outcomeR}[q4], w[q4])`,
        'gap <- m4 - m1',
        's1 <- sqrt(weighted.mean((student$' + outcomeR + '[q1] - m1)^2, w[q1]))',
        's4 <- sqrt(weighted.mean((student$' + outcomeR + '[q4] - m4)^2, w[q4]))',
        'cohens_d <- gap / sqrt((s1^2 + s4^2) / 2)',
        'c(gap = gap, d = cohens_d)'
    ].join('\n');

    const expectedOutput = [
        '## Expected output — the app\'s numbers:',
        `## Q1 mean = ${fmt(gap.q1.mean, 1)}   Q4 mean = ${fmt(gap.q4.mean, 1)}`,
        `## gap (Q4-Q1) = ${fmt(gap.gap_q4_q1, 1)} score points   Cohen's d = ${fmt(gap.effect_size, 2)}`
    ].join('\n');

    const notation = `gap = ȳ<sub>Q4</sub> − ȳ<sub>Q1</sub> = ${fmt(gap.q4.mean, 1)} − ${fmt(gap.q1.mean, 1)} = <strong>${fmt(gap.gap_q4_q1, 1)}</strong>; d = gap / s<sub>pooled</sub> = <strong>${fmt(gap.effect_size, 2)}</strong>`;

    return { title: 'Q4–Q1 achievement gap', code, notation, expectedOutput, note: '' };
}

/**
 * Overview cards (weighted mean, Gini, SES gradient).
 */
export function generateOverviewCode(stats, spec) {
    const outcomeR = R_OUTCOME[spec.outcomeVar] || spec.outcomeVar;
    const x = spec.predictorVar === 'reading' ? 'read' : spec.predictorVar;
    const wExpr = spec.weightType === 'none' ? 'rep(1, nrow(student))'
        : (spec.weightType === 'senate' ? 'student$w_sen' : 'student$stu_wgt');

    const code = [
        buildDataPreamble(spec),
        '',
        `w <- ${wExpr}`,
        '',
        '# Weighted mean (the intercept of a weighted regression on a constant):',
        `weighted.mean(student$${outcomeR}, w)`,
        '',
        '# Weighted Gini — covariance form on weighted fractional ranks, the exact',
        '# estimator the app uses (verified; see VERIFICATION.md):',
        'gini_w <- function(y, w) {',
        '  o <- order(y); y <- y[o]; w <- w[o]',
        '  Fm <- (cumsum(w) - w/2) / sum(w)      # midpoint cumulative weight share',
        '  mu <- weighted.mean(y, w)',
        '  2 * weighted.mean((y - mu) * (Fm - weighted.mean(Fm, w)), w) / mu',
        '}',
        `gini_w(student$${outcomeR}, w)`,
        '',
        '# SES gradient — weighted bivariate regression slope:',
        `coef(lm(${outcomeR} ~ ${x}, data = student, weights = w))[2]`
    ].join('\n');

    const expectedOutput = [
        '## Expected output — the app\'s numbers:',
        `## weighted mean  = ${fmt(stats.mean, 2)}`,
        `## weighted Gini  = ${fmt(stats.gini, 4)}`,
        `## SES gradient   = ${fmt(stats.gradient, 2)} points per unit of ${spec.predictorVar}`
    ].join('\n');

    const notation = `ȳ<sub>w</sub> = Σwy/Σw = <strong>${fmt(stats.mean, 1)}</strong>; G = 2·cov<sub>w</sub>(y, F)/ȳ<sub>w</sub> = <strong>${fmt(stats.gini, 3)}</strong>; β̂ = <strong>${fmt(stats.gradient, 2)}</strong>`;

    return { title: 'Overview statistics', code, notation, expectedOutput, note: '' };
}

export default {
    buildDataPreamble,
    generateRegressionCode,
    generateFimlCode,
    generateTrendsCode,
    generateGapCode,
    generateOverviewCode
};
