/**
 * Data Export Module
 * Exports filtered/analyzed datasets with provenance metadata
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

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
 * Export current dataset to CSV with provenance header
 * @param {Array} data - Student data array
 * @param {Object} state - Application state
 * @param {String} filename - Optional filename
 */
export function exportCurrentDataset(data, state, filename = 'pisa_data_export.csv') {
    if (!data || data.length === 0) {
        console.warn('No data to export');
        alert('No data available to export. Please load data first.');
        return;
    }

    // Build provenance header
    let csv = '# Educational Stratification in PISA - Data Export\n';
    csv += `# Generated: ${new Date().toISOString()}\n`;
    csv += `# Data Source: OECD PISA via learningtower R package\n`;
    csv += `# Citation: OECD (2023). PISA Database. https://www.oecd.org/pisa/data/\n`;
    csv += '#\n';
    csv += `# Selection Criteria:\n`;
    csv += `#   Countries: ${state.selectedCountries?.join(', ') || 'All'}\n`;
    csv += `#   Years: ${state.selectedYears?.join(', ') || 'All'}\n`;
    csv += `#   Total Students: ${data.length}\n`;
    csv += '#\n';
    csv += `# Variables:\n`;

    // Get variable names from first record
    if (data.length === 0) {
        console.warn('No data records to export');
        return;
    }

    const sampleRecord = data[0];
    const variables = Object.keys(sampleRecord);

    variables.forEach(varName => {
        const description = getVariableDescription(varName);
        csv += `#   ${varName}: ${description}\n`;
    });

    csv += '#\n';
    csv += '# ===== DATA BEGINS BELOW THIS LINE =====\n';

    // Column headers
    csv += variables.join(',') + '\n';

    // Data rows
    data.forEach(record => {
        const row = variables.map(varName => {
            const value = record[varName];

            // Handle different data types
            if (value === null || value === undefined) {
                return '';
            } else if (typeof value === 'string') {
                // Escape quotes and wrap in quotes if contains comma
                const escaped = value.replace(/"/g, '""');
                return value.includes(',') || value.includes('"') ? `"${escaped}"` : value;
            } else {
                return value;
            }
        });

        csv += row.join(',') + '\n';
    });

    downloadCSV(csv, filename);
    console.log(`✓ Dataset exported: ${filename} (${data.length} records, ${variables.length} variables)`);
}

/**
 * Export aggregated statistics by country-year
 * @param {Object} comparativeResults - Comparative statistics
 * @param {String} filename - Optional filename
 */
export function exportAggregatedData(comparativeResults, filename = 'pisa_aggregated_stats.csv') {
    if (!comparativeResults || Object.keys(comparativeResults).length === 0) {
        console.warn('No comparative results to export');
        return;
    }

    let csv = '# Educational Stratification in PISA - Aggregated Statistics\n';
    csv += `# Generated: ${new Date().toISOString()}\n`;
    csv += '# Aggregated by Country-Year\n';
    csv += '#\n';

    csv += 'Country,Year,Mean_Achievement,Gini_Coefficient,SES_Gradient,Sample_Size\n';

    Object.keys(comparativeResults).sort().forEach(country => {
        const countryData = comparativeResults[country];

        Object.keys(countryData).sort().forEach(year => {
            const stats = countryData[year];

            if (stats) {
                csv += `${country},${year},${stats.mean?.toFixed(2) || ''},${stats.gini?.toFixed(4) || ''},${stats.predictorGradient?.toFixed(2) || ''},${stats.n || ''}\n`;
            }
        });
    });

    downloadCSV(csv, filename);
    console.log(`✓ Aggregated data exported: ${filename}`);
}

/**
 * Export data dictionary describing all variables
 * @param {Array} data - Sample data to extract variables from
 * @param {String} filename - Optional filename
 */
export function exportDataDictionary(data, filename = 'data_dictionary.csv') {
    if (!data || data.length === 0) {
        console.warn('No data provided for dictionary');
        return;
    }

    const sampleRecord = data[0];
    const variables = Object.keys(sampleRecord);

    let csv = 'Variable Name,Description,Type,Example Value\n';

    variables.forEach(varName => {
        const value = sampleRecord[varName];
        const type = typeof value;
        const description = getVariableDescription(varName);
        const example = value !== null && value !== undefined ? value : 'N/A';

        csv += `"${varName}","${description}",${type},"${example}"\n`;
    });

    downloadCSV(csv, filename);
    console.log(`✓ Data dictionary exported: ${filename}`);
}

/**
 * Export subset of data by country or year
 * @param {Array} data - Full dataset
 * @param {String} filterType - 'country' or 'year'
 * @param {String|Number} filterValue - Country code or year
 * @param {String} filename - Optional filename
 */
export function exportDataSubset(data, filterType, filterValue, filename = null) {
    if (!data || data.length === 0) {
        console.warn('No data to filter');
        return;
    }

    const filteredData = data.filter(d => d[filterType] === filterValue);

    if (filteredData.length === 0) {
        alert(`No data found for ${filterType} = ${filterValue}`);
        return;
    }

    const fname = filename || `pisa_data_${filterType}_${filterValue}.csv`;

    // Create minimal state for provenance
    const state = {
        selectedCountries: filterType === 'country' ? [filterValue] : [...new Set(filteredData.map(d => d.country))],
        selectedYears: filterType === 'year' ? [filterValue] : [...new Set(filteredData.map(d => d.year))]
    };

    exportCurrentDataset(filteredData, state, fname);
}

/**
 * Export data with computed variables (e.g., achievement quartiles, SES categories)
 * @param {Array} data - Original data
 * @param {Object} state - Application state
 * @param {String} filename - Optional filename
 */
export function exportEnrichedDataset(data, state, filename = 'pisa_data_enriched.csv') {
    if (!data || data.length === 0) {
        console.warn('No data to export');
        return;
    }

    // Create enriched version with computed variables
    const enrichedData = data.map(record => {
        const newRecord = { ...record };

        // Add outcome variable (if different from original field names)
        const outcomeVar = state.currentOutcome || 'math';
        newRecord.outcome_variable = outcomeVar;
        newRecord.outcome_value = record[outcomeVar];

        // Add predictor variable (using helper to handle parent_edu ISCED codes)
        const predictorVar = state.currentPredictor || 'escs';
        newRecord.predictor_variable = predictorVar;
        newRecord.predictor_value = getPredictorValue(record, predictorVar);

        // Calculate SES quartile
        // This is simplified - full implementation would need proper weighted quartiles
        const sesValue = newRecord.predictor_value;
        if (sesValue !== null && isFinite(sesValue)) {
            // Placeholder quartile assignment
            newRecord.ses_quartile = 'Q2'; // Would need proper calculation
        }

        return newRecord;
    });

    exportCurrentDataset(enrichedData, state, filename);
}

/**
 * Get variable description for data dictionary
 * @param {String} varName - Variable name
 * @returns {String} Description
 */
function getVariableDescription(varName) {
    const descriptions = {
        // Core variables
        'country': 'Country code (ISO 3166-1 alpha-3)',
        'year': 'PISA assessment year',
        'student_id': 'Unique student identifier',

        // Achievement scores
        'math': 'Mathematics achievement score',
        'reading': 'Reading achievement score',
        'science': 'Science achievement score',

        // SES variables
        'escs': 'PISA Economic, Social and Cultural Status Index',
        'wealth': 'Family wealth index',
        'books': 'Number of books at home',

        // Parental education
        'mother_educ': 'Mother\'s education level (ISCED)',
        'father_educ': 'Father\'s education level (ISCED)',
        'parent_edu': 'Highest parental education',

        // Demographics
        'gender': 'Student gender',
        'age': 'Student age',

        // Weights
        'w_fstuwt': 'Final student weight',
        'w_fsenwt': 'Senate weight',
        'studentWeight': 'Student sampling weight',
        'senateWeight': 'Senate (equally weighted) weight',

        // Other
        'school_id': 'School identifier',
        'computer': 'Has computer at home'
    };

    return descriptions[varName] || 'PISA assessment variable';
}

/**
 * Helper function to download CSV
 * @param {String} csvContent - CSV content
 * @param {String} filename - Filename
 */
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

export default {
    exportCurrentDataset,
    exportAggregatedData,
    exportDataDictionary,
    exportDataSubset,
    exportEnrichedDataset
};
