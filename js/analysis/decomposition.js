/**
 * Variance Decomposition Module
 * Performs variance decomposition and achievement gap analysis
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

import { weightedMean } from '../core/utils.js';

/**
 * Get predictor value from a record, handling parent_edu ISCED codes
 * @param {Object} record - Student record
 * @param {String} predictorVar - Predictor variable name
 * @returns {Number|null} Numeric predictor value or null if missing
 */
function getPredictorValue(record, predictorVar) {
    if (predictorVar === 'parent_edu') {
        return parseParentEducation(record);
    }
    const value = +record[predictorVar];
    return isFinite(value) ? value : null;
}

/**
 * Parse parental education from ISCED codes
 * @param {Object} record - Student record
 * @returns {Number|null} Numeric education level
 */
function parseParentEducation(record) {
    const parseISCED = (val) => {
        if (typeof val === 'number' && isFinite(val)) return val;
        const numVal = Number(val);
        if (isFinite(numVal)) return numVal;

        if (typeof val === 'string') {
            const upper = val.toUpperCase().trim();
            if (upper === 'NONE' || upper === 'NA' || upper === 'N/A' || upper === '') return null;
            const match = upper.match(/ISCED\s*(\d)/i);
            if (match) return parseInt(match[1], 10);
        }
        return null;
    };

    const motherEduc = parseISCED(record.mother_educ);
    const fatherEduc = parseISCED(record.father_educ);

    if (motherEduc !== null && fatherEduc !== null) {
        return Math.max(motherEduc, fatherEduc);
    }
    return motherEduc !== null ? motherEduc : fatherEduc;
}

/**
 * Calculate variance decomposition (within/between countries)
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {Array} countries - Array of country codes
 * @returns {Object} Variance decomposition results
 */
export function calculateVarianceDecomposition(data, outcomeVar = 'math', countries = null) {
    if (!data || data.length === 0) {
        return null;
    }

    // Get countries if not provided
    if (!countries) {
        countries = [...new Set(data.map(d => d.country))];
    }

    // Overall mean and variance
    const allScores = data.map(d => +d[outcomeVar]).filter(isFinite);
    const overallMean = ss.mean(allScores);
    const totalVariance = ss.variance(allScores);

    // Group data by country
    const byCountry = {};
    countries.forEach(c => { byCountry[c] = []; });

    data.forEach(d => {
        const val = +d[outcomeVar];
        if (isFinite(val) && d.country) {
            byCountry[d.country]?.push(val);
        }
    });

    // Calculate between-country variance (weighted by group size)
    const N = allScores.length;
    let betweenVariance = 0;

    countries.forEach(country => {
        const countryScores = byCountry[country] || [];
        if (countryScores.length > 0) {
            const countryMean = ss.mean(countryScores);
            const weight = countryScores.length / N;
            betweenVariance += weight * Math.pow(countryMean - overallMean, 2);
        }
    });

    // Within-country variance
    const withinVariance = Math.max(0, totalVariance - betweenVariance);

    // Intraclass correlation (ICC)
    const icc = totalVariance > 0 ? betweenVariance / totalVariance : 0;

    // Percent of total
    const percentBetween = (betweenVariance / totalVariance) * 100;
    const percentWithin = (withinVariance / totalVariance) * 100;

    return {
        totalVariance,
        betweenVariance,
        withinVariance,
        percentBetween,
        percentWithin,
        icc,
        rho: icc // Alternative name
    };
}

/**
 * Decompose achievement gap by SES quartiles
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} sesVar - Name of SES variable (e.g., 'escs' or 'parent_edu')
 * @param {String} weightType - Type of weights to use
 * @returns {Object} Gap decomposition results
 */
export function decomposeAchievementGap(data, outcomeVar = 'math', sesVar = 'escs', weightType = 'student') {
    if (!data || data.length === 0) {
        return null;
    }

    // Filter valid data and extract predictor values
    const validRecords = [];
    for (const d of data) {
        const y = +d[outcomeVar];
        const x = getPredictorValue(d, sesVar);
        if (isFinite(y) && x !== null) {
            validRecords.push({ record: d, score: y, ses: x });
        }
    }

    if (validRecords.length < 4) {
        return null;
    }

    // Get weights
    const weights = validRecords.map(d => getWeight(d.record, weightType));
    const sesValues = validRecords.map(d => d.ses);
    const scoreValues = validRecords.map(d => d.score);

    // Calculate SES quartiles
    const sortedData = validRecords.map((d, i) => ({
        record: d.record,
        ses: d.ses,
        score: d.score,
        weight: weights[i]
    })).sort((a, b) => a.ses - b.ses);

    // Weighted quartiles
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let cumWeight = 0;
    const quartileThresholds = [0.25, 0.50, 0.75].map(p => p * totalWeight);
    const quartileBoundaries = [null, null, null];

    let qi = 0;
    for (let i = 0; i < sortedData.length && qi < 3; i++) {
        cumWeight += sortedData[i].weight;
        if (cumWeight >= quartileThresholds[qi]) {
            quartileBoundaries[qi] = sortedData[i].ses;
            qi++;
        }
    }

    // Assign quartiles
    const quartileData = [[], [], [], []];
    sortedData.forEach(d => {
        if (d.ses <= quartileBoundaries[0]) {
            quartileData[0].push(d);
        } else if (d.ses <= quartileBoundaries[1]) {
            quartileData[1].push(d);
        } else if (d.ses <= quartileBoundaries[2]) {
            quartileData[2].push(d);
        } else {
            quartileData[3].push(d);
        }
    });

    // Calculate means for each quartile
    const quartileStats = quartileData.map((qData, i) => {
        if (qData.length === 0) {
            return { mean: NaN, n: 0, sd: NaN };
        }

        const scores = qData.map(d => d.score);
        const weights = qData.map(d => d.weight);

        const mean = weightedMean(scores, weights);
        const variance = scores.reduce((sum, score, i) =>
            sum + weights[i] * Math.pow(score - mean, 2), 0
        ) / weights.reduce((a, b) => a + b, 0);
        const sd = Math.sqrt(variance);

        return {
            mean,
            n: qData.length,
            sd,
            quartile: i + 1
        };
    });

    // Q4-Q1 gap
    const gap = quartileStats[3].mean - quartileStats[0].mean;

    // Pooled SD for effect size
    const pooledVariance = (
        Math.pow(quartileStats[0].sd, 2) +
        Math.pow(quartileStats[3].sd, 2)
    ) / 2;
    const pooledSD = Math.sqrt(pooledVariance);
    const effectSize = gap / Math.max(pooledSD, 1e-9);

    return {
        q1: quartileStats[0],
        q2: quartileStats[1],
        q3: quartileStats[2],
        q4: quartileStats[3],
        gap_q4_q1: gap,
        pooled_sd: pooledSD,
        effect_size: effectSize,
        gap_percent: (gap / Math.max(quartileStats[0].mean, 1)) * 100
    };
}

/**
 * Calculate variance decomposition by multiple grouping variables
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {Array} groupVars - Array of grouping variables (e.g., ['country', 'year'])
 * @returns {Object} Multi-level variance decomposition
 */
export function calculateMultilevelDecomposition(data, outcomeVar = 'math', groupVars = ['country']) {
    if (!data || data.length === 0 || groupVars.length === 0) {
        return null;
    }

    const results = {};

    // Single-level decompositions
    groupVars.forEach(groupVar => {
        const groups = [...new Set(data.map(d => d[groupVar]))];
        const decomp = calculateVarianceDecomposition(data, outcomeVar, groups);
        results[groupVar] = decomp;
    });

    // Cross-classification (e.g., country × year)
    if (groupVars.length === 2) {
        const [var1, var2] = groupVars;
        const groups1 = [...new Set(data.map(d => d[var1]))];
        const groups2 = [...new Set(data.map(d => d[var2]))];

        const cellMeans = {};
        groups1.forEach(g1 => {
            cellMeans[g1] = {};
            groups2.forEach(g2 => {
                const cellData = data.filter(d => d[var1] === g1 && d[var2] === g2);
                if (cellData.length > 0) {
                    const scores = cellData.map(d => +d[outcomeVar]).filter(isFinite);
                    if (scores.length > 0) {
                        cellMeans[g1][g2] = {
                            mean: ss.mean(scores),
                            n: scores.length
                        };
                    }
                }
            });
        });

        results.cross_classification = {
            var1,
            var2,
            cellMeans,
            nCells: Object.keys(cellMeans).reduce((sum, g1) =>
                sum + Object.keys(cellMeans[g1]).length, 0
            )
        };
    }

    return results;
}

/**
 * Calculate achievement gap trend over years
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} sesVar - Name of SES variable
 * @param {String} weightType - Type of weights to use
 * @returns {Object} Gap trends by year
 */
export function calculateGapTrend(data, outcomeVar = 'math', sesVar = 'escs', weightType = 'student') {
    const years = [...new Set(data.map(d => d.year))].sort();
    const trends = {};

    years.forEach(year => {
        const yearData = data.filter(d => d.year === year);
        const gap = decomposeAchievementGap(yearData, outcomeVar, sesVar, weightType);
        trends[year] = gap;
    });

    // Calculate trend (simple linear regression of gap on year)
    const yearGaps = years.map(year => ({
        year: +year,
        gap: trends[year]?.gap_q4_q1 || NaN
    })).filter(d => isFinite(d.gap));

    if (yearGaps.length >= 2) {
        const meanYear = ss.mean(yearGaps.map(d => d.year));
        const meanGap = ss.mean(yearGaps.map(d => d.gap));

        const numerator = yearGaps.reduce((sum, d) =>
            sum + (d.year - meanYear) * (d.gap - meanGap), 0
        );
        const denominator = yearGaps.reduce((sum, d) =>
            sum + Math.pow(d.year - meanYear, 2), 0
        );

        const trend = denominator > 0 ? numerator / denominator : 0;

        return {
            byYear: trends,
            years,
            trend, // Points per year
            interpretation: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable'
        };
    }

    return {
        byYear: trends,
        years,
        trend: null,
        interpretation: 'insufficient_data'
    };
}

/**
 * Calculate comparative decomposition across countries
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} sesVar - Name of SES variable
 * @param {String} weightType - Type of weights to use
 * @returns {Object} Comparative results by country
 */
export function calculateComparativeDecomposition(data, outcomeVar = 'math', sesVar = 'escs', weightType = 'student') {
    const countries = [...new Set(data.map(d => d.country))];
    const results = {};

    countries.forEach(country => {
        const countryData = data.filter(d => d.country === country);
        results[country] = decomposeAchievementGap(countryData, outcomeVar, sesVar, weightType);
    });

    // Rank countries by gap size
    const ranked = Object.keys(results)
        .filter(c => results[c] && isFinite(results[c].gap_q4_q1))
        .sort((a, b) => results[a].gap_q4_q1 - results[b].gap_q4_q1);

    return {
        byCountry: results,
        ranked, // Countries from smallest to largest gap
        countries
    };
}

/**
 * Get weight for a single record
 * @param {Object} record - Student record
 * @param {String} weightType - Type of weight
 * @returns {Number} Weight value
 */
function getWeight(record, weightType) {
    if (weightType === 'none') {
        return 1;
    }

    if (weightType === 'senate') {
        const v = record.w_fsenwt || record.senateWeight || record.W_FSENWT;
        if (v && isFinite(+v) && +v > 0) return +v;
        return 1;
    }

    // Default: student weight
    const v = record.w_fstuwt || record.studentWeight || record.W_FSTUWT || record.weight;
    if (v && isFinite(+v) && +v > 0) return +v;

    return 1;
}

export default {
    calculateVarianceDecomposition,
    decomposeAchievementGap,
    calculateMultilevelDecomposition,
    calculateGapTrend,
    calculateComparativeDecomposition
};
