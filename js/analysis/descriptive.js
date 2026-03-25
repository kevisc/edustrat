/**
 * Descriptive Statistics Module
 * Calculates weighted descriptive statistics, inequality measures, and summary stats
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

import { weightedMean, weightedVariance, weightedSD, weightedQuantile,
         calculateGini } from '../core/utils.js';

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
 * Calculate comprehensive descriptive statistics
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable (e.g., 'math', 'reading', 'science')
 * @param {String} weightType - Type of weights to use ('student', 'senate', 'none')
 * @returns {Object} Descriptive statistics
 */
export function calculateDescriptiveStats(data, outcomeVar = 'math', weightType = 'student') {
    if (!data || data.length === 0) {
        console.warn('No data provided to calculateDescriptiveStats');
        return null;
    }

    // Extract values and weights
    const values = [];
    const weights = [];

    data.forEach(d => {
        const value = +d[outcomeVar];
        if (isFinite(value)) {
            values.push(value);
            weights.push(getWeight(d, weightType));
        }
    });

    if (values.length === 0) {
        console.warn('No valid values found for outcome variable:', outcomeVar);
        return null;
    }

    // Calculate statistics
    const mean = weightedMean(values, weights);
    const sd = weightedSD(values, weights);
    const p10 = weightedQuantile(values, weights, 0.10);
    const p25 = weightedQuantile(values, weights, 0.25);
    const p50 = weightedQuantile(values, weights, 0.50);
    const p75 = weightedQuantile(values, weights, 0.75);
    const p90 = weightedQuantile(values, weights, 0.90);

    // Min and max
    const sortedValues = [...values].sort((a, b) => a - b);
    const min = sortedValues[0];
    const max = sortedValues[sortedValues.length - 1];

    return {
        mean,
        sd,
        min,
        max,
        median: p50,
        p10,
        p25,
        p50,
        p75,
        p90,
        q1: p25,
        q3: p75,
        iqr: p75 - p25,
        n: values.length
    };
}

/**
 * Calculate inequality measures
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} weightType - Type of weights to use
 * @returns {Object} Inequality measures
 */
export function calculateInequalityMeasures(data, outcomeVar = 'math', weightType = 'student') {
    if (!data || data.length === 0) {
        return null;
    }

    // Extract values and weights
    const values = [];
    const weights = [];
    data.forEach(d => {
        const value = +d[outcomeVar];
        if (isFinite(value)) {
            values.push(value);
            weights.push(getWeight(d, weightType));
        }
    });

    if (values.length === 0) {
        return null;
    }

    // Calculate Gini coefficient (weighted)
    const gini = calculateGini(values, weightType !== 'none' ? weights : null);

    // Calculate descriptive stats for other measures
    const descriptive = calculateDescriptiveStats(data, outcomeVar, weightType);
    if (!descriptive) {
        return null;
    }

    // Coefficient of variation
    const cv = descriptive.sd / Math.max(descriptive.mean, 1e-9);

    // P90/P10 ratio
    const p90p10 = descriptive.p90 / Math.max(descriptive.p10, 1e-9);

    return {
        gini,
        cv,
        p90p10,
        range: descriptive.max - descriptive.min,
        iqr: descriptive.iqr
    };
}

/**
 * Calculate SES gradient (slope of achievement ~ SES regression)
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} predictorVar - Name of predictor variable (e.g., 'escs' or 'parent_edu')
 * @param {String} weightType - Type of weights to use
 * @returns {Number} SES gradient (beta coefficient)
 */
export function calculateSESGradient(data, outcomeVar = 'math', predictorVar = 'escs', weightType = 'student') {
    if (!data || data.length === 0) {
        return NaN;
    }

    const scores = [];
    const predictor = [];
    const weights = [];

    data.forEach(d => {
        const y = +d[outcomeVar];
        const x = getPredictorValue(d, predictorVar);

        if (isFinite(y) && x !== null) {
            scores.push(y);
            predictor.push(x);
            weights.push(getWeight(d, weightType));
        }
    });

    if (scores.length < 2) {
        return NaN;
    }

    // Weighted means
    const meanY = weightedMean(scores, weights);
    const meanX = weightedMean(predictor, weights);

    // Weighted covariance and variance
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < scores.length; i++) {
        numerator += weights[i] * (predictor[i] - meanX) * (scores[i] - meanY);
        denominator += weights[i] * Math.pow(predictor[i] - meanX, 2);
    }

    const beta = numerator / Math.max(denominator, 1e-9);
    return beta;
}

/**
 * Calculate statistics by group (e.g., by country, by year)
 * @param {Array} data - Array of student records
 * @param {String} groupVar - Variable to group by (e.g., 'country', 'year')
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} weightType - Type of weights to use
 * @returns {Object} Statistics by group
 */
export function calculateStatsByGroup(data, groupVar, outcomeVar = 'math', weightType = 'student') {
    if (!data || data.length === 0) {
        return {};
    }

    // Get unique groups
    const groups = [...new Set(data.map(d => d[groupVar]))].filter(g => g !== null && g !== undefined);

    const results = {};

    groups.forEach(group => {
        const groupData = data.filter(d => d[groupVar] === group);

        results[group] = {
            descriptive: calculateDescriptiveStats(groupData, outcomeVar, weightType),
            inequality: calculateInequalityMeasures(groupData, outcomeVar, weightType),
            n: groupData.length
        };
    });

    return results;
}

/**
 * Calculate data quality metrics
 * @param {Array} data - Array of student records
 * @param {Array} variables - List of variable names to check
 * @returns {Object} Data quality metrics
 */
export function calculateDataQuality(data, variables = ['math', 'reading', 'science', 'escs']) {
    if (!data || data.length === 0) {
        return null;
    }

    const n = data.length;
    const quality = {
        total_records: n,
        missing: {},
        complete_cases: 0
    };

    // Count missing for each variable
    variables.forEach(varName => {
        const missing = data.filter(d => {
            const val = d[varName];
            return val === null || val === undefined || !isFinite(+val);
        }).length;

        quality.missing[varName] = {
            count: missing,
            percent: (missing / n) * 100
        };
    });

    // Count complete cases (all variables present)
    quality.complete_cases = data.filter(d => {
        return variables.every(varName => {
            const val = d[varName];
            return val !== null && val !== undefined && isFinite(+val);
        });
    }).length;

    quality.complete_cases_percent = (quality.complete_cases / n) * 100;

    return quality;
}

/**
 * Calculate achievement gap by SES quartiles
 * @param {Array} data - Array of student records
 * @param {String} outcomeVar - Name of outcome variable
 * @param {String} sesVar - Name of SES variable (e.g., 'escs' or 'parent_edu')
 * @param {String} weightType - Type of weights to use
 * @returns {Object} Achievement gap statistics
 */
export function calculateAchievementGap(data, outcomeVar = 'math', sesVar = 'escs', weightType = 'student') {
    if (!data || data.length === 0) {
        return null;
    }

    // Filter valid data and extract predictor values
    const validRecords = [];
    for (const d of data) {
        const y = +d[outcomeVar];
        const x = getPredictorValue(d, sesVar);
        if (isFinite(y) && x !== null) {
            validRecords.push({ record: d, y, x });
        }
    }

    if (validRecords.length < 4) {
        return null;
    }

    // Get SES quartiles
    const sesValues = validRecords.map(d => d.x);
    const sesWeights = validRecords.map(d => getWeight(d.record, weightType));

    const q1_threshold = weightedQuantile(sesValues, sesWeights, 0.25);
    const q4_threshold = weightedQuantile(sesValues, sesWeights, 0.75);

    // Split into quartiles
    const q1Data = validRecords.filter(d => d.x <= q1_threshold).map(d => d.record);
    const q4Data = validRecords.filter(d => d.x >= q4_threshold).map(d => d.record);

    // Calculate means
    const q1Stats = calculateDescriptiveStats(q1Data, outcomeVar, weightType);
    const q4Stats = calculateDescriptiveStats(q4Data, outcomeVar, weightType);

    if (!q1Stats || !q4Stats) {
        return null;
    }

    // Gap measures
    const gap = q4Stats.mean - q1Stats.mean;
    const pooledSD = Math.sqrt((q1Stats.sd ** 2 + q4Stats.sd ** 2) / 2);
    const effectSize = gap / Math.max(pooledSD, 1e-9);

    return {
        q1_mean: q1Stats.mean,
        q1_n: q1Stats.n,
        q4_mean: q4Stats.mean,
        q4_n: q4Stats.n,
        gap,
        effect_size: effectSize,
        pooled_sd: pooledSD
    };
}

/**
 * Get weight for a single record
 * @param {Object} record - Student record
 * @param {String} weightType - Type of weight ('student', 'senate', 'none')
 * @returns {Number} Weight value
 */
function getWeight(record, weightType) {
    if (weightType === 'none') {
        return 1;
    }

    if (weightType === 'senate') {
        // Try senate weight fields
        const senateWeight = record.w_fsenwt || record.senateWeight || record.W_FSENWT;
        if (senateWeight && isFinite(+senateWeight) && +senateWeight > 0) {
            return +senateWeight;
        }
        return 1;
    }

    // Default: student weight (stu_wgt is the learningtower field name for W_FSTUWT)
    const studentWeight = record.stu_wgt || record.w_fstuwt || record.studentWeight || record.W_FSTUWT || record.weight;
    if (studentWeight && isFinite(+studentWeight) && +studentWeight > 0) {
        return +studentWeight;
    }

    return 1;
}

export default {
    calculateDescriptiveStats,
    calculateInequalityMeasures,
    calculateSESGradient,
    calculateStatsByGroup,
    calculateDataQuality,
    calculateAchievementGap
};
