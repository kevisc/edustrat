/**
 * Data Export Module
 * Exports aggregated statistics and analysis results (not micro-level data)
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 *
 * Note: Per OECD Terms of Use for PISA Public Use Files, micro-level
 * student data must not be distributed. This module exports only
 * aggregated statistics, summaries, and computed estimates.
 */

/**
 * Export aggregated country-year summary statistics from loaded data.
 * Computes weighted means, SDs, and sample sizes per country-year.
 * Does NOT export micro-level student records (per OECD Terms of Use).
 *
 * @param {Array} data - Student data array
 * @param {Object} state - Application state
 * @param {String} filename - Optional filename
 */
export function exportAggregatedSummary(data, state, filename = 'pisa_aggregated_summary.csv') {
    if (!data || data.length === 0) {
        console.warn('No data to export');
        alert('No data available to export. Please load data first.');
        return;
    }

    // Group data by country-year
    const groups = {};
    data.forEach(record => {
        const key = `${record.country}_${record.year}`;
        if (!groups[key]) {
            groups[key] = { country: record.country, year: record.year, records: [] };
        }
        groups[key].records.push(record);
    });

    // Build provenance header
    let csv = '# Educational Stratification in PISA - Aggregated Summary Statistics\n';
    csv += `# Generated: ${new Date().toISOString()}\n`;
    csv += `# Data Source: OECD PISA via learningtower R package\n`;
    csv += `# Citation: OECD (2024). Programme for International Student Assessment (PISA) Database. Paris: OECD. Available at: https://www.oecd.org/pisa/\n`;
    csv += '#\n';
    csv += '# Note: This file contains aggregated country-year statistics only.\n';
    csv += '# Micro-level student data is not exported per OECD Terms of Use.\n';
    csv += '#\n';
    csv += `# Selection Criteria:\n`;
    csv += `#   Countries: ${state.selectedCountries?.join(', ') || 'All'}\n`;
    csv += `#   Years: ${state.selectedYears?.join(', ') || 'All'}\n`;
    csv += `#   Total Students: ${data.length}\n`;
    csv += '#\n';
    csv += '# ===== DATA BEGINS BELOW THIS LINE =====\n';

    // Column headers
    csv += 'Country,Year,N_Students,Math_Mean,Math_SD,Reading_Mean,Reading_SD,Science_Mean,Science_SD,ESCS_Mean,ESCS_SD\n';

    // Compute aggregated statistics for each country-year
    const sortedKeys = Object.keys(groups).sort();
    sortedKeys.forEach(key => {
        const group = groups[key];
        const records = group.records;
        const n = records.length;

        const computeWeightedStats = (varName) => {
            let sumW = 0, sumWX = 0;
            const valid = [];
            records.forEach(r => {
                const val = +r[varName];
                const w = +r.stu_wgt || 1;
                if (isFinite(val) && isFinite(w) && w > 0) {
                    sumW += w;
                    sumWX += w * val;
                    valid.push({ val, w });
                }
            });
            if (sumW === 0 || valid.length === 0) return { mean: '', sd: '' };
            const mean = sumWX / sumW;
            let sumWD2 = 0;
            valid.forEach(({ val, w }) => { sumWD2 += w * (val - mean) ** 2; });
            const sd = Math.sqrt(sumWD2 / sumW);
            return { mean: mean.toFixed(2), sd: sd.toFixed(2) };
        };

        const math = computeWeightedStats('math');
        const reading = computeWeightedStats('reading');
        const science = computeWeightedStats('science');
        const escs = computeWeightedStats('escs');

        csv += `${group.country},${group.year},${n},${math.mean},${math.sd},${reading.mean},${reading.sd},${science.mean},${science.sd},${escs.mean},${escs.sd}\n`;
    });

    downloadCSV(csv, filename);
    console.log(`✓ Aggregated summary exported: ${filename} (${sortedKeys.length} country-year groups, ${data.length} students summarized)`);
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
    exportAggregatedSummary,
    exportAggregatedData,
    exportDataDictionary
};
