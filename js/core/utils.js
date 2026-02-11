/**
 * Statistical Utilities
 * Weighted statistics and helper functions for PISA analysis
 * Author: Kevin Schoenholzer
 * Date: 2025-12-15
 */

/**
 * Calculate weighted mean
 * @param {Array<Number>} values - Data values
 * @param {Array<Number>} weights - Weights for each value
 * @returns {Number} Weighted mean
 */
export function weightedMean(values, weights) {
    if (!values || !weights || values.length === 0) return NaN;

    const sum = values.reduce((acc, v, i) => acc + v * weights[i], 0);
    const weightSum = weights.reduce((acc, w) => acc + w, 0);

    return sum / weightSum;
}

/**
 * Calculate weighted variance
 * @param {Array<Number>} values - Data values
 * @param {Array<Number>} weights - Weights for each value
 * @returns {Number} Weighted variance
 */
export function weightedVariance(values, weights) {
    if (!values || !weights || values.length === 0) return NaN;

    const mean = weightedMean(values, weights);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    const variance = values.reduce((sum, v, i) =>
        sum + weights[i] * Math.pow(v - mean, 2), 0) / totalWeight;

    return variance;
}

/**
 * Calculate weighted standard deviation
 * @param {Array<Number>} values - Data values
 * @param {Array<Number>} weights - Weights for each value
 * @returns {Number} Weighted standard deviation
 */
export function weightedSD(values, weights) {
    return Math.sqrt(weightedVariance(values, weights));
}

/**
 * Calculate weighted quantile
 * @param {Array<Number>} values - Data values
 * @param {Array<Number>} weights - Weights for each value
 * @param {Number} p - Percentile (0-1)
 * @returns {Number} Quantile value
 */
export function weightedQuantile(values, weights, p) {
    if (!values || !weights || values.length === 0) return NaN;

    // Create array of {value, weight} and sort by value
    const weightedValues = values.map((v, i) => ({ value: v, weight: weights[i] }))
                                 .sort((a, b) => a.value - b.value);

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const targetWeight = p * totalWeight;

    let cumWeight = 0;
    for (let i = 0; i < weightedValues.length; i++) {
        cumWeight += weightedValues[i].weight;
        if (cumWeight >= targetWeight) {
            return weightedValues[i].value;
        }
    }

    return weightedValues[weightedValues.length - 1].value;
}

/**
 * Calculate comprehensive weighted statistics
 * @param {Array<Number>} values - Data values
 * @param {Array<Number>} weights - Weights for each value
 * @returns {Object} Object with mean, median, sd, min, max, quartiles
 */
export function calculateWeightedStats(values, weights) {
    if (!values || !weights || values.length === 0) {
        return {
            mean: NaN,
            median: NaN,
            sd: NaN,
            min: NaN,
            max: NaN,
            q1: NaN,
            q3: NaN,
            p10: NaN,
            p90: NaN,
            n: 0
        };
    }

    const weightedValues = values.map((v, i) => ({ value: v, weight: weights[i] }))
                                .sort((a, b) => a.value - b.value);

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const mean = weightedMean(values, weights);
    const variance = weightedVariance(values, weights);
    const sd = Math.sqrt(variance);

    // Weighted percentiles
    const percentiles = [0.1, 0.25, 0.5, 0.75, 0.9];
    const quantiles = {};

    percentiles.forEach(p => {
        let cumWeight = 0;
        const targetWeight = p * totalWeight;

        for (let i = 0; i < weightedValues.length; i++) {
            cumWeight += weightedValues[i].weight;
            if (cumWeight >= targetWeight) {
                quantiles[`p${Math.round(p * 100)}`] = weightedValues[i].value;
                break;
            }
        }
    });

    return {
        mean: mean,
        median: quantiles.p50,
        sd: sd,
        min: weightedValues[0].value,
        max: weightedValues[weightedValues.length - 1].value,
        q1: quantiles.p25,
        q3: quantiles.p75,
        p10: quantiles.p10,
        p90: quantiles.p90,
        n: values.length
    };
}

/**
 * Calculate Gini coefficient
 * @param {Array<Number>} values - Data values
 * @param {Array<Number>} weights - Optional weights
 * @returns {Number} Gini coefficient (0-1)
 */
export function calculateGini(values, weights = null) {
    if (!values || values.length === 0) return 0;

    // Unweighted Gini
    if (!weights) {
        const sorted = [...values].sort((a, b) => a - b);
        const n = sorted.length;

        let sumOfProducts = 0;
        let totalSum = 0;

        for (let i = 0; i < n; i++) {
            sumOfProducts += (i + 1) * sorted[i];
            totalSum += sorted[i];
        }

        const gini = (2 * sumOfProducts) / (n * totalSum) - (n + 1) / n;
        return Math.abs(gini);
    }

    // Weighted Gini
    const sortedData = values.map((v, i) => ({ value: v, weight: weights[i] }))
                             .sort((a, b) => a.value - b.value);

    let cumWeightedValue = 0;
    let cumWeight = 0;
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const totalWeightedValue = values.reduce((sum, v, i) => sum + v * weights[i], 0);

    let sumOfProducts = 0;

    for (let i = 0; i < sortedData.length; i++) {
        cumWeight += sortedData[i].weight;
        cumWeightedValue += sortedData[i].value * sortedData[i].weight;
        sumOfProducts += cumWeight * sortedData[i].value * sortedData[i].weight;
    }

    const gini = (2 * sumOfProducts) / (totalWeight * totalWeightedValue) - 1 - (1 / totalWeight);

    return Math.abs(gini);
}

/**
 * Calculate SES gradient (regression slope)
 * @param {Array<Number>} scores - Achievement scores (Y)
 * @param {Array<Number>} ses - SES values (X)
 * @param {Array<Number>} weights - Weights
 * @returns {Number} Slope coefficient (beta)
 */
export function calculateSESGradient(scores, ses, weights) {
    if (!scores || !ses || !weights || scores.length === 0) return NaN;

    const n = scores.length;
    const meanY = weightedMean(scores, weights);
    const meanX = weightedMean(ses, weights);

    const numerator = scores.reduce((sum, y, i) =>
        sum + weights[i] * (ses[i] - meanX) * (y - meanY), 0);
    const denominator = ses.reduce((sum, x, i) =>
        sum + weights[i] * Math.pow(x - meanX, 2), 0);

    return numerator / denominator;
}

/**
 * Calculate correlation coefficient
 * @param {Array<Number>} x - First variable
 * @param {Array<Number>} y - Second variable
 * @param {Array<Number>} weights - Optional weights
 * @returns {Number} Correlation coefficient
 */
export function calculateCorrelation(x, y, weights = null) {
    if (!x || !y || x.length !== y.length || x.length === 0) return NaN;

    if (!weights) {
        weights = new Array(x.length).fill(1);
    }

    const meanX = weightedMean(x, weights);
    const meanY = weightedMean(y, weights);
    const sdX = weightedSD(x, weights);
    const sdY = weightedSD(y, weights);

    if (sdX === 0 || sdY === 0) return NaN;

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    const covariance = x.reduce((sum, xi, i) =>
        sum + weights[i] * (xi - meanX) * (y[i] - meanY), 0) / totalWeight;

    return covariance / (sdX * sdY);
}

/**
 * Sanitize weights (ensure positive and finite)
 * @param {Array<Number>} weights - Raw weights
 * @returns {Array<Number>} Sanitized weights
 */
export function sanitizeWeights(weights) {
    return weights.map(w => (Number.isFinite(w) && w > 0) ? +w : 1);
}

/**
 * Calculate effect size (Cohen's d)
 * @param {Array<Number>} group1 - First group values
 * @param {Array<Number>} group2 - Second group values
 * @param {Array<Number>} weights1 - Weights for group 1
 * @param {Array<Number>} weights2 - Weights for group 2
 * @returns {Number} Cohen's d effect size
 */
export function calculateCohenD(group1, group2, weights1 = null, weights2 = null) {
    if (!weights1) weights1 = new Array(group1.length).fill(1);
    if (!weights2) weights2 = new Array(group2.length).fill(1);

    const mean1 = weightedMean(group1, weights1);
    const mean2 = weightedMean(group2, weights2);

    const var1 = weightedVariance(group1, weights1);
    const var2 = weightedVariance(group2, weights2);

    const n1 = weights1.reduce((sum, w) => sum + w, 0);
    const n2 = weights2.reduce((sum, w) => sum + w, 0);

    // Pooled standard deviation
    const pooledSD = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));

    return (mean1 - mean2) / pooledSD;
}

/**
 * Calculate bootstrap standard errors
 * @param {Array} data - Data array
 * @param {Function} statFunc - Function to calculate statistic
 * @param {Number} nReps - Number of bootstrap replications
 * @returns {Object} {estimate, se, ci_lower, ci_upper}
 */
export function bootstrapSE(data, statFunc, nReps = 1000) {
    const n = data.length;
    const originalEstimate = statFunc(data);
    const bootstrapEstimates = [];

    for (let rep = 0; rep < nReps; rep++) {
        // Resample with replacement
        const sample = [];
        for (let i = 0; i < n; i++) {
            const randomIndex = Math.floor(Math.random() * n);
            sample.push(data[randomIndex]);
        }

        bootstrapEstimates.push(statFunc(sample));
    }

    // Calculate SE from bootstrap distribution
    const bootstrapMean = bootstrapEstimates.reduce((sum, val) => sum + val, 0) / nReps;
    const bootstrapVariance = bootstrapEstimates.reduce((sum, val) =>
        sum + Math.pow(val - bootstrapMean, 2), 0) / (nReps - 1);
    const se = Math.sqrt(bootstrapVariance);

    // 95% confidence interval (percentile method)
    const sortedEstimates = [...bootstrapEstimates].sort((a, b) => a - b);
    const ciLower = sortedEstimates[Math.floor(nReps * 0.025)];
    const ciUpper = sortedEstimates[Math.floor(nReps * 0.975)];

    return {
        estimate: originalEstimate,
        se: se,
        ci_lower: ciLower,
        ci_upper: ciUpper,
        bootstrap_estimates: bootstrapEstimates
    };
}

/**
 * Simple OLS regression (unweighted)
 * @param {Array<Number>} y - Dependent variable
 * @param {Array<Number>} x - Independent variable
 * @returns {Object} {intercept, slope, r2, residuals}
 */
export function simpleOLS(y, x) {
    const n = y.length;

    if (n === 0 || x.length !== n) {
        return { intercept: NaN, slope: NaN, r2: NaN, residuals: [] };
    }

    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
        numerator += (x[i] - meanX) * (y[i] - meanY);
        denominator += Math.pow(x[i] - meanX, 2);
    }

    const slope = numerator / denominator;
    const intercept = meanY - slope * meanX;

    // Calculate R²
    const predictions = x.map(xi => intercept + slope * xi);
    const residuals = y.map((yi, i) => yi - predictions[i]);

    const sst = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
    const sse = residuals.reduce((sum, r) => sum + r * r, 0);
    const r2 = 1 - (sse / sst);

    return {
        intercept,
        slope,
        r2,
        residuals,
        predictions
    };
}

/**
 * Get unique values from array
 * @param {Array} arr - Input array
 * @returns {Array} Unique values
 */
export function unique(arr) {
    return [...new Set(arr)];
}

/**
 * Group data by key
 * @param {Array<Object>} data - Data array
 * @param {String} key - Key to group by
 * @returns {Object} Grouped data
 */
export function groupBy(data, key) {
    return data.reduce((groups, item) => {
        const groupKey = item[key];
        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        groups[groupKey].push(item);
        return groups;
    }, {});
}

/**
 * Format number for display
 * @param {Number} num - Number to format
 * @param {Number} decimals - Number of decimal places
 * @returns {String} Formatted number
 */
export function formatNumber(num, decimals = 2) {
    if (!Number.isFinite(num)) return 'N/A';
    return num.toFixed(decimals);
}

/**
 * Format p-value with stars
 * @param {Number} p - P-value
 * @returns {String} Formatted p-value with significance stars
 */
export function formatPValue(p) {
    if (!Number.isFinite(p)) return 'N/A';

    let stars = '';
    if (p < 0.001) stars = '***';
    else if (p < 0.01) stars = '**';
    else if (p < 0.05) stars = '*';
    else if (p < 0.1) stars = '†';

    return `${p.toFixed(4)}${stars}`;
}

/**
 * Calculate t-statistic p-value
 * @param {Number} t - T-statistic
 * @param {Number} df - Degrees of freedom
 * @returns {Number} Two-tailed p-value
 */
export function tTestPValue(t, df) {
    if (!window.jStat) {
        console.warn('jStat library not loaded, cannot calculate p-value');
        return NaN;
    }

    const cdf = jStat.studentt.cdf(Math.abs(t), Math.max(1, df));
    const p = 2 * (1 - cdf);
    return Math.min(1, Math.max(0, p));
}

// Export all functions as default object
export default {
    weightedMean,
    weightedVariance,
    weightedSD,
    weightedQuantile,
    calculateWeightedStats,
    calculateGini,
    calculateSESGradient,
    calculateCorrelation,
    sanitizeWeights,
    calculateCohenD,
    bootstrapSE,
    simpleOLS,
    unique,
    groupBy,
    formatNumber,
    formatPValue,
    tTestPValue
};
