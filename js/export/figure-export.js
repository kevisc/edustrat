/**
 * Figure Export Module
 * Exports Plotly charts as PNG or SVG files
 * Author: Kevin Schoenholzer
 * Date: 2025-12-16
 */

/**
 * Export a Plotly chart as PNG
 * @param {String} chartDivId - ID of the chart div
 * @param {String} filename - Optional filename (without extension)
 * @param {Number} width - Optional width in pixels (default: 1200)
 * @param {Number} height - Optional height in pixels (default: 800)
 * @param {Number} scale - Optional scale factor (default: 2 for high resolution)
 */
export function exportChartAsPNG(chartDivId, filename = null, width = 1200, height = 800, scale = 2) {
    const chartDiv = document.getElementById(chartDivId);

    if (!chartDiv) {
        console.warn(`Chart div not found: ${chartDivId}`);
        return;
    }

    const fname = filename || `${chartDivId}_${Date.now()}`;

    Plotly.downloadImage(chartDiv, {
        format: 'png',
        width: width,
        height: height,
        scale: scale,
        filename: fname
    }).then(() => {
        console.log(`✓ Chart exported as PNG: ${fname}.png`);
    }).catch(error => {
        console.error('Error exporting chart as PNG:', error);
    });
}

/**
 * Export a Plotly chart as SVG
 * @param {String} chartDivId - ID of the chart div
 * @param {String} filename - Optional filename (without extension)
 * @param {Number} width - Optional width in pixels
 * @param {Number} height - Optional height in pixels
 */
export function exportChartAsSVG(chartDivId, filename = null, width = 1200, height = 800) {
    const chartDiv = document.getElementById(chartDivId);

    if (!chartDiv) {
        console.warn(`Chart div not found: ${chartDivId}`);
        return;
    }

    const fname = filename || `${chartDivId}_${Date.now()}`;

    Plotly.downloadImage(chartDiv, {
        format: 'svg',
        width: width,
        height: height,
        filename: fname
    }).then(() => {
        console.log(`✓ Chart exported as SVG: ${fname}.svg`);
    }).catch(error => {
        console.error('Error exporting chart as SVG:', error);
    });
}

/**
 * Export all visible charts in current tab as PNG
 * @param {String} format - 'png' or 'svg'
 */
export function exportAllVisibleCharts(format = 'png') {
    // Get active tab
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) {
        console.warn('No active tab found');
        return;
    }

    const tabName = activeTab.getAttribute('data-tab');
    console.log(`Exporting all charts from ${tabName} tab as ${format.toUpperCase()}...`);

    // Find all chart divs in active tab content
    const tabContent = document.getElementById(tabName);
    if (!tabContent) {
        console.warn(`Tab content not found: ${tabName}`);
        return;
    }

    // Find all Plotly chart containers
    let chartDivs = Array.from(tabContent.querySelectorAll('.js-plotly-plot'))
        .filter(div => div.data && div.data.length > 0);

    if (chartDivs.length === 0) {
        const fallbackDivs = tabContent.querySelectorAll('[id*="chart"], [id*="-plot"], [id*="-curve"], [id*="-map"]');
        chartDivs = Array.from(fallbackDivs).filter(div => div.data && div.data.length > 0);
    }

    if (chartDivs.length === 0) {
        console.warn('No charts found in active tab');
        alert('No charts found to export in the current tab.');
        return;
    }

    let exported = 0;
    chartDivs.forEach(chartDiv => {
        const divId = chartDiv.id;
        const filename = `${tabName}_${divId}`;

        if (format === 'svg') {
            exportChartAsSVG(divId, filename);
        } else {
            exportChartAsPNG(divId, filename);
        }

        exported++;
    });

    console.log(`✓ Exported ${exported} charts as ${format.toUpperCase()}`);
    alert(`Exporting ${exported} charts as ${format.toUpperCase()}. Downloads will start shortly.`);
}

/**
 * Export specific charts by their IDs
 * @param {Array} chartIds - Array of chart div IDs
 * @param {String} format - 'png' or 'svg'
 * @param {String} prefix - Optional prefix for filenames
 */
export function exportSpecificCharts(chartIds, format = 'png', prefix = '') {
    if (!chartIds || chartIds.length === 0) {
        console.warn('No chart IDs provided');
        return;
    }

    console.log(`Exporting ${chartIds.length} specific charts as ${format.toUpperCase()}...`);

    chartIds.forEach(chartId => {
        const filename = prefix ? `${prefix}_${chartId}` : chartId;

        if (format === 'svg') {
            exportChartAsSVG(chartId, filename);
        } else {
            exportChartAsPNG(chartId, filename);
        }
    });

    console.log(`✓ Exported ${chartIds.length} charts`);
}

/**
 * Export all main analysis charts (overview, distribution, regression, comparative)
 * @param {String} format - 'png' or 'svg'
 */
export function exportAllAnalysisCharts(format = 'png') {
    const mainCharts = [
        'overview-chart',
        'distribution-chart',
        'percentile-chart',
        'lorenz-curve',
        'gap-plot',
        'regression-scatter',
        'coefficient-plot',
        'residual-plot-ols',
        'residual-plot-fe',
        'residual-plot-re',
        'qq-plot-ols',
        'qq-plot-fe',
        'qq-plot-re',
        'decomposition-chart',
        'world-map',
        'temporal-trends',
        'country-comparison',
        'gap-comparison'
    ];

    // Filter to only charts that exist and have data
    const existingCharts = mainCharts.filter(id => {
        const div = document.getElementById(id);
        return div && div.data && div.data.length > 0;
    });

    if (existingCharts.length === 0) {
        alert('No analysis charts available to export. Please load data and navigate through the tabs first.');
        return;
    }

    console.log(`Exporting ${existingCharts.length} analysis charts as ${format.toUpperCase()}...`);

    exportSpecificCharts(existingCharts, format, 'pisa_analysis');

    alert(`Exporting ${existingCharts.length} analysis charts as ${format.toUpperCase()}. Downloads will start shortly.`);
}

/**
 * Get chart as base64-encoded PNG for embedding in reports
 * @param {String} chartDivId - ID of the chart div
 * @param {Number} width - Optional width
 * @param {Number} height - Optional height
 * @returns {Promise<String>} Base64-encoded PNG
 */
export async function getChartAsBase64PNG(chartDivId, width = 800, height = 600) {
    const chartDiv = document.getElementById(chartDivId);

    if (!chartDiv) {
        console.warn(`Chart div not found: ${chartDivId}`);
        return null;
    }

    try {
        const imgData = await Plotly.toImage(chartDiv, {
            format: 'png',
            width: width,
            height: height,
            scale: 2
        });

        return imgData;
    } catch (error) {
        console.error(`Error getting chart as base64: ${chartDivId}`, error);
        return null;
    }
}

/**
 * Add download buttons to all chart containers
 */
export function addDownloadButtonsToCharts() {
    let chartDivs = Array.from(document.querySelectorAll('.js-plotly-plot'));
    if (chartDivs.length === 0) {
        chartDivs = Array.from(document.querySelectorAll('[id*="chart"], [id*="-plot"], [id*="-curve"], [id*="-map"]'));
    }

    chartDivs.forEach(chartDiv => {
        // Check if chart has Plotly data
        if (!chartDiv.data || chartDiv.data.length === 0) {
            return;
        }

        // Check if button already exists
        if (chartDiv.parentElement.querySelector('.chart-download-btn')) {
            return;
        }

        // Create button container
        const btnContainer = document.createElement('div');
        btnContainer.className = 'chart-download-btns';
        btnContainer.style.cssText = 'position: absolute; top: 10px; right: 10px; z-index: 10;';

        // PNG button
        const pngBtn = document.createElement('button');
        pngBtn.className = 'btn btn-secondary';
        pngBtn.style.cssText = 'padding: 4px 8px; font-size: 12px; margin-right: 4px;';
        pngBtn.innerHTML = '📥 PNG';
        pngBtn.title = 'Download as PNG';
        pngBtn.onclick = () => exportChartAsPNG(chartDiv.id);

        // SVG button
        const svgBtn = document.createElement('button');
        svgBtn.className = 'btn btn-secondary';
        svgBtn.style.cssText = 'padding: 4px 8px; font-size: 12px;';
        svgBtn.innerHTML = '📥 SVG';
        svgBtn.title = 'Download as SVG';
        svgBtn.onclick = () => exportChartAsSVG(chartDiv.id);

        btnContainer.appendChild(pngBtn);
        btnContainer.appendChild(svgBtn);

        // Make chart container relative if not already
        if (chartDiv.parentElement.style.position !== 'relative') {
            chartDiv.parentElement.style.position = 'relative';
        }

        chartDiv.parentElement.insertBefore(btnContainer, chartDiv);
    });

    console.log('✓ Download buttons added to charts');
}

export default {
    exportChartAsPNG,
    exportChartAsSVG,
    exportAllVisibleCharts,
    exportSpecificCharts,
    exportAllAnalysisCharts,
    getChartAsBase64PNG,
    addDownloadButtonsToCharts
};
