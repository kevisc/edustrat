/**
 * Educational Stratification in PISA - Main Application
 * Author: Kevin Schoenholzer
 * Date: 2026
 */

// Import modules
import { getState, setState, setLoading, getCurrentOutcome, setCurrentOutcome,
         getCurrentPredictor, setCurrentPredictor } from './core/state-manager.js';
import { loadMetadata, loadSelectedData, getCacheStats } from './core/data-loader.js';
import { initLoadingIndicator, updateProgress, showDataStatus, hideLoading,
         showButtonSpinner, hideButtonSpinner, resetProgress } from './ui/loading-indicator.js';
import { initSelectors, populateFromMetadata } from './ui/country-selector.js';

// Import analysis modules
import { calculateDescriptiveStats, calculateInequalityMeasures, calculateSESGradient,
         calculateStatsByGroup } from './analysis/descriptive.js';
import { runPooledOLS, runFixedEffects, runRandomEffects } from './analysis/regression.js';
import { decomposeAchievementGap, calculateVarianceDecomposition, calculateGapTrend, calculateComparativeDecomposition } from './analysis/decomposition.js';
import { hausmanTest } from './analysis/diagnostics.js';

// Import visualization modules
import { updateOverviewStats, renderOverviewChart } from './visualization/overview-viz.js';
import { renderAllDistributionCharts } from './visualization/distribution-viz.js';
import {
    renderRegressionComparison,
    renderCoefficientPlot,
    renderHausmanTest,
    renderRegressionScatterPlots,
    renderResidualPlot,
    renderQQPlot
} from './visualization/regression-viz.js';
import { renderAllComparativeCharts } from './visualization/comparative-viz.js';
import {
    createDiagnosticsComparisonTable,
    createHausmanTestPanel,
    createResidualDiagnosticsTable,
    createCooksDistanceSummary,
    createAssumptionCheckSummary,
    renderResidualPlotOptimized
} from './visualization/diagnostics-viz.js';

// Import export modules
import { exportComprehensiveSummary, exportDescriptiveStats, exportAllRegressionModels } from './export/csv-export.js';
import { exportCurrentDataset } from './export/data-export.js';
import { exportAllAnalysisCharts } from './export/figure-export.js';
import { generateFullReport } from './export/report-export.js';

// Application initialization
async function initApp() {
    console.log('==================================================');
    console.log('Educational Stratification in PISA');
    console.log('Initializing...');
    console.log('==================================================');

    try {
        // Initialize UI components
        initLoadingIndicator();
        initSelectors();
        initTabSystem();
        // initAdvancedOptions(); // Removed - no longer needed without sidebar
        initEventListeners();

        // Make regression functions available globally for visualizations
        window.runPooledOLS = runPooledOLS;
        window.runFixedEffects = runFixedEffects;
        window.runRandomEffects = runRandomEffects;

        // Make decomposition functions available globally
        window.calculateGapTrend = calculateGapTrend;
        window.calculateComparativeDecomposition = calculateComparativeDecomposition;
        window.decomposeAchievementGap = decomposeAchievementGap;
        window.calculateVarianceDecomposition = calculateVarianceDecomposition;

        // Make descriptive stats available globally for report generation
        window.calculateDescriptiveStats = calculateDescriptiveStats;

        // Load metadata
        showDataStatus('Loading metadata...', 'info');
        const metadata = await loadMetadata();

        console.log('Metadata loaded:', metadata);

        // Populate UI from metadata
        populateFromMetadata(metadata);

        // Update status
        showDataStatus(
            `Ready to analyze PISA data from ${metadata.countries.length} countries
             (${metadata.years_available.join(', ')}). Select countries and years, then click "Load Selected Data".`,
            'info'
        );

        console.log('✓ Application initialized successfully');

    } catch (error) {
        console.error('Failed to initialize app:', error);
        showDataStatus(
            `Failed to load metadata: ${error.message}. Please check that data files are generated.`,
            'error'
        );

        alert(`Application initialization failed:\n\n${error.message}\n\nPlease ensure you have run the R scripts to generate data files.`);
    }
}

/**
 * Show loading cursor during calculations
 */
function startCalculating() {
    document.body.classList.add('calculating');
}

/**
 * Hide loading cursor after calculations
 */
function stopCalculating() {
    document.body.classList.remove('calculating');
}

/**
 * Wrap async function with loading indicator
 * @param {Function} fn - Async function to execute
 * @returns {Function} Wrapped function
 */
function withLoading(fn) {
    return async function(...args) {
        startCalculating();
        try {
            return await fn(...args);
        } finally {
            // Small delay to ensure UI updates
            setTimeout(() => stopCalculating(), 100);
        }
    };
}

/**
 * Initialize tab system
 */
function initTabSystem() {
    const tabButtons = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');

            // Remove active class from all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked tab
            button.classList.add('active');

            const targetContent = document.getElementById(tabName);
            if (targetContent) {
                targetContent.classList.add('active');

                // Trigger any tab-specific initialization if needed
                onTabSwitch(tabName);
            }
        });
    });

    console.log('Tab system initialized');
}

/**
 * Clear Plotly charts from non-active tabs to save memory
 * @param {String} activeTab - Currently active tab name
 */
function clearInactivePlotlyCharts(activeTab) {
    // Map tabs to their chart div IDs
    const tabCharts = {
        'overview': ['overview-chart'],
        'distribution': ['distribution-chart', 'percentile-chart', 'lorenz-curve'],
        'gap-decomposition': ['gap-plot'],
        'regression': ['coefficient-plot', 'regression-scatter'],
        'diagnostics': ['residual-plot-ols', 'residual-plot-fe', 'residual-plot-re',
                       'qq-plot-ols', 'qq-plot-fe', 'qq-plot-re', 'decomposition-chart'],
        'comparative': ['country-comparison', 'world-map', 'temporal-trends', 'gap-comparison']
    };

    // Clear charts from all tabs except the active one
    Object.keys(tabCharts).forEach(tab => {
        if (tab !== activeTab) {
            tabCharts[tab].forEach(chartId => {
                const chartDiv = document.getElementById(chartId);
                if (chartDiv && typeof Plotly !== 'undefined') {
                    try {
                        Plotly.purge(chartDiv);
                    } catch (e) {
                        // Chart might not exist yet, ignore
                    }
                }
            });
        }
    });
}

/**
 * Handle tab switching
 * @param {String} tabName - Name of activated tab
 */
function onTabSwitch(tabName) {
    const state = getState();

    // Clear Plotly charts from inactive tabs to save memory
    clearInactivePlotlyCharts(tabName);

    // Only run analyses if data is loaded
    if (!state.mergedData || state.mergedData.length === 0) {
        console.log(`Tab switched to ${tabName}, but no data loaded yet`);
        return;
    }

    console.log(`Switched to tab: ${tabName}`);

    const data = state.mergedData;
    const outcomeVar = getCurrentOutcome();
    const predictorVar = getCurrentPredictor();
    const weightType = getWeightType();

    // Run tab-specific visualizations with loading indicator
    startCalculating();

    // Use setTimeout to ensure cursor updates before heavy computation
    setTimeout(() => {
        try {
            switch (tabName) {
                case 'overview':
                    updateOverviewStats(data, outcomeVar, predictorVar, weightType);
                    renderOverviewChart(data, outcomeVar, predictorVar, weightType);
                    break;

                case 'distribution':
                    renderAllDistributionCharts(data, outcomeVar);
                    break;

                case 'gap-decomposition':
                    renderGapDecomposition(data, outcomeVar, predictorVar, weightType);
                    break;

                case 'regression':
                    runRegressionAnalyses(data, outcomeVar, predictorVar, weightType);
                    break;

                case 'comparative': {
                    const comparativeResults = state.analysisResults?.comparative;
                    const gapResults = state.analysisResults?.comparativeGap?.byCountry;
                    if (comparativeResults) {
                        renderAllComparativeCharts(data, comparativeResults, gapResults, outcomeVar, predictorVar);
                    }
                    break;
                }

                case 'diagnostics':
                    renderDiagnostics(data, outcomeVar);
                    break;

                default:
                    console.log(`No specific rendering for tab: ${tabName}`);
            }
        } catch (error) {
            console.error(`Error rendering ${tabName} tab:`, error);
        } finally {
            stopCalculating();
        }
    }, 50);
}

/**
 * Initialize advanced options toggle
 * DEPRECATED - No longer needed with tab-based layout
 */
// function initAdvancedOptions() {
//     const header = document.getElementById('advanced-options-header');
//     const content = document.getElementById('advanced-options-content');

//     if (header && content) {
//         header.addEventListener('click', () => {
//             header.classList.toggle('expanded');
//             content.classList.toggle('expanded');
//         });
//     }

//     console.log('Advanced options initialized');
// }

/**
 * Initialize event listeners
 */
function initEventListeners() {
    // Load data button
    const loadDataBtn = document.getElementById('load-data-btn');
    const loadCompleteMessage = document.getElementById('loading-complete-message');

    if (loadCompleteMessage) {
        loadCompleteMessage.style.display = 'none';
        loadCompleteMessage.textContent = '';
    }
    if (loadDataBtn) {
        loadDataBtn.addEventListener('click', handleLoadData);
    }

    // Outcome variable selector
    const outcomeSelect = document.getElementById('outcome');
    if (outcomeSelect) {
        outcomeSelect.addEventListener('change', (e) => {
            setCurrentOutcome(e.target.value);
            console.log('Outcome changed to:', e.target.value);

            // Re-run analyses if data is loaded
            const state = getState();
            if (state.mergedData && state.mergedData.length > 0) {
                console.log('Outcome changed - re-running analyses');
                runInitialAnalyses(state.mergedData);
                // Re-render current tab
                const activeTab = document.querySelector('.tab.active');
                if (activeTab) {
                    onTabSwitch(activeTab.getAttribute('data-tab'));
                }
            }
        });
    }

    // Predictor variable selector
    const predictorSelect = document.getElementById('predictor');
    if (predictorSelect) {
        predictorSelect.addEventListener('change', (e) => {
            setCurrentPredictor(e.target.value);
            console.log('Predictor changed to:', e.target.value);

            // Re-run analyses if data is loaded
            const state = getState();
            if (state.mergedData && state.mergedData.length > 0) {
                console.log('Predictor changed - re-running analyses');
                runInitialAnalyses(state.mergedData);
                // Re-render current tab
                const activeTab = document.querySelector('.tab.active');
                if (activeTab) {
                    onTabSwitch(activeTab.getAttribute('data-tab'));
                }
            }
        });
    }

    // Gap granularity selector
    const gapGranularitySelect = document.getElementById('gap-granularity');
    if (gapGranularitySelect) {
        gapGranularitySelect.addEventListener('change', (e) => {
            console.log('Gap granularity changed to:', e.target.value);

            // Re-render gap decomposition if data is loaded
            const state = getState();
            if (state.mergedData && state.mergedData.length > 0) {
                const data = state.mergedData;
                const outcomeVar = getCurrentOutcome();
                const predictorVar = getCurrentPredictor();
                const weightType = getWeightType();
                renderGapDecomposition(data, outcomeVar, predictorVar, weightType);
            }
        });
    }

    // Export buttons
    const exportSummaryBtn = document.getElementById('export-summary-btn');
    if (exportSummaryBtn) {
        exportSummaryBtn.addEventListener('click', handleExportSummary);
    }

    const exportRegressionBtn = document.getElementById('export-regression-btn');
    if (exportRegressionBtn) {
        exportRegressionBtn.addEventListener('click', handleExportRegression);
    }

    const exportDataBtn = document.getElementById('export-data-btn');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', handleExportData);
    }

    const exportChartsBtn = document.getElementById('export-charts-btn');
    if (exportChartsBtn) {
        exportChartsBtn.addEventListener('click', handleExportCharts);
    }

    const exportReportBtn = document.getElementById('export-report-btn');
    if (exportReportBtn) {
        exportReportBtn.addEventListener('click', handleExportReport);
    }

    // Regression country filter dropdown
    const regressionCountryFilter = document.getElementById('regression-country-filter');
    if (regressionCountryFilter) {
        regressionCountryFilter.addEventListener('change', (e) => {
            console.log('Regression country filter changed to:', e.target.value);

            // Re-render regression visualizations with the selected country filter
            const state = getState();
            if (state.mergedData && state.mergedData.length > 0) {
                const outcomeVar = getCurrentOutcome();
                const predictorVar = getCurrentPredictor();
                const weightType = getWeightType();

                // Re-run regression analyses which will respect the dropdown selection
                runRegressionAnalyses(state.mergedData, outcomeVar, predictorVar, weightType);
            }
        });
    }

    // Diagnostics country selector dropdown
    const diagnosticsCountrySelect = document.getElementById('diagnostics-country-select');
    if (diagnosticsCountrySelect) {
        diagnosticsCountrySelect.addEventListener('change', (e) => {
            console.log('Diagnostics country changed to:', e.target.value);

            // Re-render diagnostics for the selected country
            const state = getState();
            if (state.mergedData && state.mergedData.length > 0) {
                const outcomeVar = getCurrentOutcome();
                renderDiagnostics(state.mergedData, outcomeVar);
            }
        });
    }

    // DEPRECATED: Optional visualization toggles removed - all visualizations now auto-render
    // Visualization checkboxes and render buttons have been removed from the UI

    console.log('Event listeners initialized');
}

/**
 * Handle load data button click
 */
async function handleLoadData() {
    const state = getState();

    // Validate selections
    if (state.selectedCountries.length === 0) {
        alert('Please select at least one country.');
        return;
    }

    if (state.selectedYears.length === 0) {
        alert('Please select at least one year.');
        return;
    }

    const loadDataBtn = document.getElementById('load-data-btn');
    const loadCompleteMessage = document.getElementById('loading-complete-message');

    if (loadCompleteMessage) {
        loadCompleteMessage.style.display = 'none';
        loadCompleteMessage.textContent = '';
    }

    try {
        console.log('===========================================');
        console.log('Loading data...');
        console.log('Countries:', state.selectedCountries);
        console.log('Years:', state.selectedYears);
        console.log('===========================================');

        // Show loading UI
        showButtonSpinner(loadDataBtn);
        resetProgress();
        setLoading(true);

        // Update status
        const totalChunks = state.selectedCountries.length * state.selectedYears.length;
        showDataStatus(
            `Loading ${totalChunks} data chunks (${state.selectedCountries.length} countries × ${state.selectedYears.length} years)...`,
            'info'
        );

        // Load data with progress tracking
        const data = await loadSelectedData((progress) => {
            updateProgress(progress);
        });

        // Store merged data in state
        setState({ mergedData: data });

        // Get cache stats
        const stats = getCacheStats();

        console.log('===========================================');
        console.log('Data loading complete!');
        console.log('Total students:', data.length.toLocaleString());
        console.log('Countries:', stats.countries.join(', '));
        console.log('Years:', stats.years.join(', '));
        console.log('===========================================');

        // Update status
        showDataStatus(
            `✓ Loaded ${data.length.toLocaleString()} student records from ${stats.chunksLoaded} data chunks.
             Ready to analyze! Switch to different tabs to explore the data.`,
            'success'
        );

        if (loadCompleteMessage) {
            loadCompleteMessage.textContent = 'Done loading. You can now explore the analysis tabs above.';
            loadCompleteMessage.style.display = 'block';
        }

        // Run initial analyses
        // TODO: Phase 3 - Run descriptive statistics and populate overview tab
        runInitialAnalyses(data);

    } catch (error) {
        console.error('Error loading data:', error);

        showDataStatus(
            `Failed to load data: ${error.message}`,
            'error'
        );

        alert(`Failed to load data:\n\n${error.message}\n\nPlease check:\n1. R scripts have been run\n2. Data files exist in pisa/data/country-year/\n3. Browser console for details`);

    } finally {
        setLoading(false);
        hideButtonSpinner(loadDataBtn);
        hideLoading();
    }
}

/**
 * Run initial analyses on loaded data
 * @param {Array} data - Merged student data
 */
function runInitialAnalyses(data) {
    console.log('Running initial analyses...');

    if (!data || data.length === 0) {
        console.warn('No data to analyze');
        return;
    }

    // Get current selections
    const outcomeVar = getCurrentOutcome();
    const predictorVar = getCurrentPredictor();
    const state = getState();
    const weightType = getWeightType();

    // Get unique countries and years
    const countries = [...new Set(data.map(d => d.country))];
    const years = [...new Set(data.map(d => d.year))];

    console.log('Data summary:');
    console.log('- Students:', data.length);
    console.log('- Countries:', countries.length, '-', countries.join(', '));
    console.log('- Years:', years.length, '-', years.join(', '));

    try {
        // 1. Calculate descriptive statistics
        const descriptive = calculateDescriptiveStats(data, outcomeVar, weightType);
        const inequality = calculateInequalityMeasures(data, outcomeVar, weightType);
        const gradient = calculateSESGradient(data, outcomeVar, predictorVar, weightType);

        console.log('✓ Descriptive statistics calculated');
        console.log('  - Mean:', descriptive?.mean?.toFixed(2));
        console.log('  - Gini:', inequality?.gini?.toFixed(3));
        console.log('  - Gradient:', gradient?.toFixed(2));

        // 2. Update overview stats and chart
        updateOverviewStats(data, outcomeVar, predictorVar, weightType);
        renderOverviewChart(data, outcomeVar, predictorVar, weightType);

        console.log('✓ Overview tab updated');

        // 3. Calculate comparative statistics by country-year
        const comparativeResults = calculateComparativeStats(data, outcomeVar, predictorVar, weightType);
        const comparativeGap = calculateComparativeDecomposition(data, outcomeVar, predictorVar, weightType);

        // 4. Store results in state
        setState({
            analysisResults: {
                descriptive,
                inequality,
                gradient,
                comparative: comparativeResults,
                comparativeGap
            }
        });

        // 5. Populate regression country dropdown
        populateRegressionCountryDropdown(countries);

        // 6. Populate diagnostics country dropdown
        populateDiagnosticsCountryDropdown(countries);

        console.log('✓ Initial analyses complete');

    } catch (error) {
        console.error('Error in initial analyses:', error);
    }
}

/**
 * Calculate comparative statistics (by country and year)
 * @param {Array} data - Student data
 * @param {String} outcomeVar - Outcome variable
 * @param {String} predictorVar - Predictor variable
 * @param {String} weightType - Weight type
 * @returns {Object} Comparative results
 */
function calculateComparativeStats(data, outcomeVar, predictorVar, weightType) {
    const results = {};
    const countries = [...new Set(data.map(d => d.country))];
    const years = [...new Set(data.map(d => d.year))];

    countries.forEach(country => {
        results[country] = {};

        years.forEach(year => {
            const subData = data.filter(d => d.country === country && d.year === year);

            if (subData.length > 0) {
                const stats = calculateDescriptiveStats(subData, outcomeVar, weightType);
                const ineq = calculateInequalityMeasures(subData, outcomeVar, weightType);
                const grad = calculateSESGradient(subData, outcomeVar, predictorVar, weightType);

                results[country][year] = {
                    mean: stats?.mean || NaN,
                    gini: ineq?.gini || NaN,
                    predictorGradient: grad || NaN,
                    n: subData.length
                };
            }
        });
    });

    return results;
}

/**
 * Populate regression country filter dropdown
 * @param {Array} countries - List of country codes
 */
function populateRegressionCountryDropdown(countries) {
    const dropdown = document.getElementById('regression-country-filter');
    if (!dropdown) return;

    // Sort countries alphabetically
    const sortedCountries = [...countries].sort();

    // Clear existing options except "All Countries Combined"
    dropdown.innerHTML = '<option value="all">All Countries Combined</option>';

    // Add individual country options
    sortedCountries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        dropdown.appendChild(option);
    });

    console.log(`✓ Populated regression country dropdown with ${sortedCountries.length} countries`);
}

/**
 * Populate the diagnostics country dropdown with available countries
 * @param {Array} countries - Array of country codes
 */
function populateDiagnosticsCountryDropdown(countries) {
    const dropdown = document.getElementById('diagnostics-country-select');
    if (!dropdown) return;

    // Sort countries alphabetically
    const sortedCountries = [...countries].sort();

    // Clear existing options and add placeholder
    dropdown.innerHTML = '<option value="">-- Select a country --</option>';

    // Add individual country options
    sortedCountries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        dropdown.appendChild(option);
    });

    // Auto-select first country if available
    if (sortedCountries.length > 0) {
        dropdown.value = sortedCountries[0];
    }

    console.log(`✓ Populated diagnostics country dropdown with ${sortedCountries.length} countries`);
}

/**
 * Get current selection from diagnostics country dropdown
 * @returns {String} Selected country code or empty string
 */
function getDiagnosticsCountry() {
    const dropdown = document.getElementById('diagnostics-country-select');
    return dropdown ? dropdown.value : '';
}

/**
 * Get current selection from regression country filter dropdown
 * @returns {String} Selected country code or 'all'
 */
function getRegressionCountryFilter() {
    const dropdown = document.getElementById('regression-country-filter');
    return dropdown ? dropdown.value : 'all';
}

/**
 * Get current outcome field name based on selection
 * @returns {String} Field name in data
 */
function getOutcomeFieldName() {
    const outcome = getCurrentOutcome();
    const map = {
        'math': 'math',
        'reading': 'reading',
        'science': 'science'
    };
    return map[outcome] || 'math';
}

/**
 * Get current predictor field name based on selection
 * @returns {String} Field name in data
 */
function getPredictorFieldName() {
    const predictor = getCurrentPredictor();
    const map = {
        'escs': 'escs',
        'parent_edu': 'mother_educ' // or father_educ, or composite
    };
    return map[predictor] || 'escs';
}

/**
 * Get selected control variables
 * @returns {Array} Array of control variable names
 */
function getSelectedControls() {
    // Gender is always included as a control variable
    const controls = ['gender'];

    if (document.getElementById('ctrl-year')?.checked) {
        controls.push('year');
    }

    return controls;
}

/**
 * Get selected weight type
 * @returns {String} Weight type
 */
function getWeightType() {
    const weightSelect = document.getElementById('weight-type');
    return weightSelect ? weightSelect.value : 'student';
}

/**
 * Render gap decomposition analysis
 * @param {Array} data - Student data
 * @param {String} outcomeVar - Outcome variable
 * @param {String} predictorVar - Predictor variable
 * @param {String} weightType - Weight type
 */
function renderGapDecomposition(data, outcomeVar, predictorVar, weightType) {
    console.log('Rendering gap decomposition...');

    const granularitySelect = document.getElementById('gap-granularity');
    const granularity = granularitySelect ? granularitySelect.value : 'overall';

    const resultsDiv = document.getElementById('gap-results');
    if (!resultsDiv) return;

    let html = '';

    // Import decomposition functions
    const { calculateGapTrend, calculateComparativeDecomposition } = window;

    if (granularity === 'overall') {
        // Overall gap across all data
        const gap = decomposeAchievementGap(data, outcomeVar, predictorVar, weightType);
        const decomp = calculateVarianceDecomposition(data, outcomeVar);

        if (!gap && !decomp) {
            console.warn('No gap decomposition results');
            return;
        }

        html = '<div class="grid-2" style="gap: 2rem;">';

        // Achievement gap card
        if (gap) {
            html += `
                <div class="stat-card">
                    <h3>Achievement Gap (Q4-Q1 SES)</h3>
                    <div class="methodology-note">
                        <strong>Gap:</strong> ${gap.gap_q4_q1.toFixed(2)} score points<br>
                        <strong>Effect Size:</strong> ${gap.effect_size.toFixed(2)} (Cohen's d)<br>
                        <strong>Q1 Mean:</strong> ${gap.q1.mean.toFixed(2)} (n=${gap.q1.n})<br>
                        <strong>Q4 Mean:</strong> ${gap.q4.mean.toFixed(2)} (n=${gap.q4.n})
                    </div>
                </div>
            `;
        }

        // Variance decomposition card
        if (decomp) {
            html += `
                <div class="stat-card">
                    <h3>Variance Decomposition</h3>
                    <div class="methodology-note">
                        <strong>Total Variance:</strong> ${decomp.totalVariance.toFixed(2)}<br>
                        <strong>Within-country:</strong> ${decomp.percentWithin.toFixed(1)}%<br>
                        <strong>Between-country:</strong> ${decomp.percentBetween.toFixed(1)}%<br>
                        <strong>ICC (ρ):</strong> ${decomp.icc.toFixed(3)}
                    </div>
                </div>
            `;
        }

        html += '</div>';

    } else if (granularity === 'by-country') {
        // Gap by country
        const comparative = calculateComparativeDecomposition(data, outcomeVar, predictorVar, weightType);

        if (!comparative || !comparative.byCountry) {
            html = '<p>No country-level gap data available.</p>';
        } else {
            html = '<div class="table-container"><table class="results-table">';
            html += '<thead><tr><th>Country</th><th>Gap (Q4-Q1)</th><th>Effect Size</th><th>Q1 Mean</th><th>Q4 Mean</th><th>N</th></tr></thead><tbody>';

            comparative.ranked.forEach(country => {
                const gap = comparative.byCountry[country];
                if (gap) {
                    html += `<tr>
                        <td><strong>${country}</strong></td>
                        <td>${gap.gap_q4_q1.toFixed(2)}</td>
                        <td>${gap.effect_size.toFixed(2)}</td>
                        <td>${gap.q1.mean.toFixed(2)}</td>
                        <td>${gap.q4.mean.toFixed(2)}</td>
                        <td>${(gap.q1.n + gap.q4.n).toLocaleString()}</td>
                    </tr>`;
                }
            });

            html += '</tbody></table></div>';

            // Render visualization
            renderGapPlot(comparative.byCountry, 'country', outcomeVar);
        }

    } else if (granularity === 'by-year') {
        // Gap by year
        const trends = calculateGapTrend(data, outcomeVar, predictorVar, weightType);

        if (!trends || !trends.byYear) {
            html = '<p>No year-level gap data available.</p>';
        } else {
            html = '<div class="table-container"><table class="results-table">';
            html += '<thead><tr><th>Year</th><th>Gap (Q4-Q1)</th><th>Effect Size</th><th>Q1 Mean</th><th>Q4 Mean</th><th>N</th></tr></thead><tbody>';

            trends.years.forEach(year => {
                const gap = trends.byYear[year];
                if (gap) {
                    html += `<tr>
                        <td><strong>${year}</strong></td>
                        <td>${gap.gap_q4_q1.toFixed(2)}</td>
                        <td>${gap.effect_size.toFixed(2)}</td>
                        <td>${gap.q1.mean.toFixed(2)}</td>
                        <td>${gap.q4.mean.toFixed(2)}</td>
                        <td>${(gap.q1.n + gap.q4.n).toLocaleString()}</td>
                    </tr>`;
                }
            });

            html += '</tbody></table></div>';

            if (trends.trend !== null) {
                html += `<div class="stat-card" style="margin-top: 1rem;">
                    <h3>Temporal Trend</h3>
                    <div class="methodology-note">
                        <strong>Trend:</strong> ${trends.interpretation} (${trends.trend.toFixed(2)} points/year)
                    </div>
                </div>`;
            }

            // Render visualization
            renderGapPlot(trends.byYear, 'year', outcomeVar);
        }

    } else if (granularity === 'by-country-year') {
        // Gap by country × year
        const countries = [...new Set(data.map(d => d.country))].sort();
        const years = [...new Set(data.map(d => d.year))].sort();

        const gapsByCountryYear = {};
        countries.forEach(country => {
            years.forEach(year => {
                const countryYearData = data.filter(d => d.country === country && d.year === year);
                if (countryYearData.length > 100) { // Minimum sample size
                    const gap = decomposeAchievementGap(countryYearData, outcomeVar, predictorVar, weightType);
                    if (!gapsByCountryYear[country]) {
                        gapsByCountryYear[country] = {};
                    }
                    gapsByCountryYear[country][year] = gap;
                }
            });
        });

        html = '<div class="table-container"><table class="results-table">';
        html += '<thead><tr><th>Country</th><th>Year</th><th>Gap (Q4-Q1)</th><th>Effect Size</th><th>Q1 Mean</th><th>Q4 Mean</th><th>N</th></tr></thead><tbody>';

        Object.keys(gapsByCountryYear).sort().forEach(country => {
            Object.keys(gapsByCountryYear[country]).sort().forEach(year => {
                const gap = gapsByCountryYear[country][year];
                if (gap) {
                    html += `<tr>
                        <td><strong>${country}</strong></td>
                        <td>${year}</td>
                        <td>${gap.gap_q4_q1.toFixed(2)}</td>
                        <td>${gap.effect_size.toFixed(2)}</td>
                        <td>${gap.q1.mean.toFixed(2)}</td>
                        <td>${gap.q4.mean.toFixed(2)}</td>
                        <td>${(gap.q1.n + gap.q4.n).toLocaleString()}</td>
                    </tr>`;
                }
            });
        });

        html += '</tbody></table></div>';

        // Render visualization
        renderGapPlot(gapsByCountryYear, 'country-year', outcomeVar);
    }

    resultsDiv.innerHTML = html;
}

/**
 * Render gap visualization (bar chart)
 * @param {Object} gapData - Gap data by country, year, or country-year
 * @param {String} type - 'country', 'year', or 'country-year'
 * @param {String} outcomeVar - Outcome variable
 */
function renderGapPlot(gapData, type, outcomeVar) {
    const chartDiv = document.getElementById('gap-plot');
    if (!chartDiv) return;

    let traces = [];

    if (type === 'country') {
        // Bar chart by country
        const countries = Object.keys(gapData).filter(c => gapData[c] && isFinite(gapData[c].gap_q4_q1));
        countries.sort((a, b) => gapData[a].gap_q4_q1 - gapData[b].gap_q4_q1);

        const gaps = countries.map(c => gapData[c].gap_q4_q1);
        const effectSizes = countries.map(c => gapData[c].effect_size);

        traces.push({
            x: countries,
            y: gaps,
            name: 'Gap (Q4-Q1)',
            type: 'bar',
            marker: { color: '#3b82f6' },
            yaxis: 'y'
        });

        traces.push({
            x: countries,
            y: effectSizes,
            name: 'Effect Size',
            type: 'scatter',
            mode: 'markers+lines',
            marker: { size: 10, color: '#ef4444' },
            line: { color: '#ef4444', width: 2 },
            yaxis: 'y2'
        });

    } else if (type === 'year') {
        // Bar chart by year
        const years = Object.keys(gapData).filter(y => gapData[y] && isFinite(gapData[y].gap_q4_q1));
        years.sort();

        const gaps = years.map(y => gapData[y].gap_q4_q1);

        traces.push({
            x: years,
            y: gaps,
            name: 'Gap (Q4-Q1)',
            type: 'bar',
            marker: { color: '#10b981' }
        });

    } else if (type === 'country-year') {
        // Grouped bar chart by country and year
        const countries = Object.keys(gapData).sort();
        const allYears = new Set();

        countries.forEach(country => {
            Object.keys(gapData[country]).forEach(year => allYears.add(year));
        });

        const years = Array.from(allYears).sort();

        years.forEach(year => {
            const gaps = [];
            const countryNames = [];

            countries.forEach(country => {
                if (gapData[country][year] && isFinite(gapData[country][year].gap_q4_q1)) {
                    gaps.push(gapData[country][year].gap_q4_q1);
                    countryNames.push(country);
                }
            });

            if (gaps.length > 0) {
                traces.push({
                    x: countryNames,
                    y: gaps,
                    name: `Year ${year}`,
                    type: 'bar'
                });
            }
        });
    }

    const layout = {
        title: {
            text: `Achievement Gap by ${type === 'country' ? 'Country' : type === 'year' ? 'Year' : 'Country × Year'}`,
            font: { color: '#f1f5f9', size: 16 }
        },
        xaxis: {
            title: type === 'year' ? 'Year' : 'Country',
            gridcolor: '#334155'
        },
        yaxis: {
            title: 'Achievement Gap (Q4-Q1 score points)',
            gridcolor: '#334155'
        },
        paper_bgcolor: '#1e293b',
        plot_bgcolor: '#1e293b',
        font: { color: '#f1f5f9' },
        barmode: type === 'country-year' ? 'group' : 'relative',
        showlegend: type === 'country-year' || type === 'country',
        margin: { l: 60, r: type === 'country' ? 120 : 40, t: 80, b: 80 }
    };

    // Add second y-axis for country comparison (effect size)
    if (type === 'country') {
        layout.yaxis2 = {
            title: 'Effect Size (Cohen\'s d)',
            overlaying: 'y',
            side: 'right',
            gridcolor: 'transparent'
        };
    }

    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d']
    };

    Plotly.newPlot(chartDiv, traces, layout, config);
}

/**
 * Determine which regression models are appropriate for the data structure
 * @param {Array} data - Student data
 * @returns {Object} Object indicating which models can be run
 */
function determineApplicableModels(data) {
    // Count unique countries and years
    const uniqueCountries = [...new Set(data.map(d => d.country))];
    const uniqueYears = [...new Set(data.map(d => d.year))];

    const nCountries = uniqueCountries.length;
    const nYears = uniqueYears.length;

    console.log(`Data structure: ${nCountries} countries, ${nYears} years`);

    return {
        canRunOLS: true, // OLS always applicable
        canRunFE: nCountries > 1, // Need multiple countries for country FE
        canRunRE: nCountries > 1, // Need multiple countries for RE
        nCountries,
        nYears,
        isSingleCountry: nCountries === 1,
        isSingleYear: nYears === 1,
        message: nCountries === 1
            ? 'Single country selected: Only OLS regression available (FE/RE require multiple countries)'
            : nYears === 1
            ? 'Single year selected: FE and RE available without year controls'
            : null
    };
}

/**
 * Run separate regressions for each country-year combination
 * @param {Array} data - Student data
 * @param {String} outcomeVar - Outcome variable
 * @param {String} predictorVar - Predictor variable
 * @param {String} weightType - Weight type
 * @param {Array} controls - Control variables
 */
/**
 * Run and render regression analyses
 * @param {Array} data - Student data
 * @param {String} outcomeVar - Outcome variable
 * @param {String} predictorVar - Predictor variable
 * @param {String} weightType - Weight type
 */
function runRegressionAnalyses(data, outcomeVar, predictorVar, weightType) {
    console.log('Running regression analyses...');

    const controls = getSelectedControls();

    // Check if a specific country is selected in the dropdown filter
    const countryFilter = getRegressionCountryFilter();
    let filteredData = data;

    if (countryFilter !== 'all') {
        filteredData = data.filter(d => d.country === countryFilter);
        console.log(`Filtering to country: ${countryFilter} (${filteredData.length} students)`);
    }

    // Pooled analysis (default)
    const models = {};

    // Determine which models are appropriate for this data
    const applicable = determineApplicableModels(filteredData);

    // Check which models are selected
    const wantOLS = document.getElementById('ols-model')?.checked !== false; // Default true
    const wantFE = document.getElementById('fe-model')?.checked !== false; // Default true
    const wantRE = document.getElementById('re-model')?.checked !== false; // Default true

    // Show info message if models are restricted
    if (applicable.message) {
        console.warn(applicable.message);
    }

    try {
        if (wantOLS && applicable.canRunOLS) {
            const ols = runPooledOLS(filteredData, outcomeVar, predictorVar, controls, weightType);
            if (ols) models.ols = ols;
        }

        if (wantFE && applicable.canRunFE) {
            const fe = runFixedEffects(filteredData, outcomeVar, predictorVar, controls, weightType);
            if (fe) models.fixedEffects = fe;
        } else if (wantFE && !applicable.canRunFE) {
            console.log('Skipping Fixed Effects: requires multiple countries');
        }

        if (wantRE && applicable.canRunRE) {
            const re = runRandomEffects(filteredData, outcomeVar, predictorVar, controls, weightType);
            if (re) models.randomEffects = re;
        } else if (wantRE && !applicable.canRunRE) {
            console.log('Skipping Random Effects: requires multiple countries');
        }

        // Render results
        renderRegressionComparison(models);

        // Show info message if models were skipped
        if (applicable.message) {
            const resultsDiv = document.getElementById('regression-results');
            if (resultsDiv) {
                const infoBox = document.createElement('div');
                infoBox.className = 'alert alert-info';
                infoBox.style.marginTop = '1rem';
                infoBox.innerHTML = `<strong>ℹ️ Note:</strong> ${applicable.message}`;
                resultsDiv.insertBefore(infoBox, resultsDiv.firstChild);
            }
        }

        // Always render all regression visualizations
        renderCoefficientPlot(models, predictorVar);
        renderRegressionScatterPlots(filteredData, outcomeVar, predictorVar, models);

        // Hausman test if both FE and RE are available
        if (models.fixedEffects && models.randomEffects) {
            const predLabel = getPredictorLabel(predictorVar);
            const hausman = hausmanTest(models.fixedEffects, models.randomEffects, predLabel);
            // Store globally for diagnostics tab
            window.lastHausmanTest = hausman;
            if (hausman) {
                renderHausmanTest(hausman);
            }
        } else {
            window.lastHausmanTest = null;
        }

        // Store models globally for diagnostics tab to access
        window.lastRegressionModels = models;

        console.log('✓ Regression analyses complete');

    } catch (error) {
        console.error('Error in regression analyses:', error);
    }
}

/**
 * Render diagnostics tab with tables and one optimized plot
 * Analyzes a single country at a time for more meaningful diagnostics
 * @param {Array} data - Student data
 * @param {String} outcomeVar - Outcome variable
 */
function renderDiagnostics(data, outcomeVar) {
    console.log('Rendering diagnostics...');

    // Get selected country from dropdown
    const selectedCountry = getDiagnosticsCountry();
    const infoDiv = document.getElementById('diagnostics-country-info');

    // Check if a country is selected
    if (!selectedCountry) {
        // Show placeholder message in all diagnostic sections
        const placeholderMsg = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">Select a country above to view diagnostics</div>';

        ['assumption-dashboard', 'model-comparison-table', 'hausman-panel',
         'residual-diagnostics-table', 'cooks-distance-summary', 'residual-plot-main'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = placeholderMsg;
        });

        if (infoDiv) {
            infoDiv.textContent = 'Select a country to view its regression diagnostics';
        }
        return;
    }

    // Filter data to selected country only
    const countryData = data.filter(d => d.country === selectedCountry);

    if (countryData.length === 0) {
        const noDataMsg = `<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">No data available for ${selectedCountry}</div>`;

        ['assumption-dashboard', 'model-comparison-table', 'hausman-panel',
         'residual-diagnostics-table', 'cooks-distance-summary', 'residual-plot-main'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = noDataMsg;
        });

        if (infoDiv) {
            infoDiv.textContent = `No data available for ${selectedCountry}`;
        }
        return;
    }

    // Update info display
    const years = [...new Set(countryData.map(d => d.year))].sort();
    if (infoDiv) {
        infoDiv.innerHTML = `<strong>${selectedCountry}</strong>: ${countryData.length.toLocaleString()} students across ${years.length} year(s): ${years.join(', ')}`;
    }

    // Get current predictor and weight type
    const predictorVar = getCurrentPredictor();
    const weightType = getWeightType();

    // Run regression models for this single country
    console.log(`Running diagnostics regressions for ${selectedCountry}...`);

    const models = {};
    let hausmanResult = null;

    try {
        // Run OLS on country data
        models.ols = runPooledOLS(countryData, outcomeVar, predictorVar, ['gender'], weightType);

        // For single-country diagnostics, FE/RE would be by year (if multiple years)
        if (years.length > 1) {
            models.fixedEffects = runFixedEffects(countryData, outcomeVar, predictorVar, ['gender'], weightType);
            models.randomEffects = runRandomEffects(countryData, outcomeVar, predictorVar, ['gender'], weightType);

            // Hausman test
            if (models.fixedEffects && models.randomEffects) {
                const predLabel = getPredictorLabel(predictorVar);
                hausmanResult = hausmanTest(models.fixedEffects, models.randomEffects, predLabel);
            }
        }
    } catch (error) {
        console.error(`Error running regressions for ${selectedCountry}:`, error);
    }

    // 1. Render Assumption Check Summary (table)
    const assumptionDiv = document.getElementById('assumption-dashboard');
    if (assumptionDiv) {
        assumptionDiv.innerHTML = createAssumptionCheckSummary(models, hausmanResult);
    }

    // 2. Render Model Comparison Table
    const comparisonDiv = document.getElementById('model-comparison-table');
    if (comparisonDiv) {
        comparisonDiv.innerHTML = createDiagnosticsComparisonTable(models);
    }

    // 3. Render Hausman Test Panel (table)
    const hausmanDiv = document.getElementById('hausman-panel');
    if (hausmanDiv) {
        if (years.length > 1) {
            hausmanDiv.innerHTML = createHausmanTestPanel(hausmanResult);
        } else {
            hausmanDiv.innerHTML = '<div style="padding: 1rem; color: var(--text-secondary);">Hausman test requires multiple years of data (panel structure). This country has data from only one year.</div>';
        }
    }

    // 4. Render Residual Diagnostics Table
    const residualDiagDiv = document.getElementById('residual-diagnostics-table');
    if (residualDiagDiv) {
        residualDiagDiv.innerHTML = createResidualDiagnosticsTable(models);
    }

    // 5. Render Cook's Distance Summary Table
    const cooksDiv = document.getElementById('cooks-distance-summary');
    if (cooksDiv) {
        cooksDiv.innerHTML = createCooksDistanceSummary(models);
    }

    // 6. Render ONE residual plot (OLS only, max 3000 points for performance)
    if (models.ols) {
        renderResidualPlotOptimized(models.ols, 'OLS (Pooled)', 'residual-plot-main');
    }

    console.log('✓ Diagnostics rendered');
}

/**
 * Get predictor label for display
 * @param {String} predictor - Predictor variable name
 * @returns {String} Display label
 */
function getPredictorLabel(predictor) {
    const labels = {
        'escs': 'Socioeconomic Status (ESCS)',
        'parent_edu': 'Parental Education'
    };
    return labels[predictor] || predictor;
}

/**
 * Export handlers
 */
function handleExportSummary() {
    const state = getState();

    if (!state.mergedData || state.mergedData.length === 0) {
        alert('No data loaded. Please load data before exporting.');
        return;
    }

    exportComprehensiveSummary(state);
}

function handleExportRegression() {
    const state = getState();

    if (!state.mergedData || state.mergedData.length === 0) {
        alert('No data loaded. Please load data before exporting.');
        return;
    }

    // Run regressions and export
    const outcomeVar = getCurrentOutcome();
    const predictorVar = getCurrentPredictor();
    const weightType = getWeightType();
    const controls = getSelectedControls();

    const models = {};
    try {
        const ols = runPooledOLS(state.mergedData, outcomeVar, predictorVar, controls, weightType);
        if (ols) models.ols = ols;

        const fe = runFixedEffects(state.mergedData, outcomeVar, predictorVar, controls, weightType);
        if (fe) models.fixedEffects = fe;

        const re = runRandomEffects(state.mergedData, outcomeVar, predictorVar, controls, weightType);
        if (re) models.randomEffects = re;

        if (Object.keys(models).length > 0) {
            exportAllRegressionModels(models);
        } else {
            alert('No regression models available to export.');
        }
    } catch (error) {
        console.error('Error exporting regressions:', error);
        alert(`Error exporting regressions: ${error.message}`);
    }
}

function handleExportData() {
    const state = getState();

    if (!state.mergedData || state.mergedData.length === 0) {
        alert('No data loaded. Please load data before exporting.');
        return;
    }

    exportCurrentDataset(state.mergedData, state);
}

async function handleExportCharts() {
    const state = getState();

    if (!state.mergedData || state.mergedData.length === 0) {
        alert('No data loaded. Please load data and view charts before exporting.');
        return;
    }

    alert('Rendering all charts before export...\n\nThis may take a few seconds.');

    try {
        await renderAllVisualizationsForReport();
        await new Promise(resolve => setTimeout(resolve, 750));
        exportAllAnalysisCharts('png');
    } catch (error) {
        console.error('Error exporting charts:', error);
        alert(`Error exporting charts: ${error.message}`);
    }
}

async function handleExportReport() {
    const state = getState();

    if (!state.mergedData || state.mergedData.length === 0) {
        alert('No data loaded. Please load data before generating a report.');
        return;
    }

    // Show loading message
    alert('Generating comprehensive analysis report...\n\nThis may take a few seconds as all visualizations are being rendered and captured.');

    try {
        // Force render ALL visualizations before exporting
        console.log('Pre-rendering all visualizations for report...');
        await renderAllVisualizationsForReport();

        // Wait a bit for Plotly to finish rendering all charts
        await new Promise(resolve => setTimeout(resolve, 1000));

        await generateFullReport(state);
    } catch (error) {
        console.error('Error generating report:', error);
        alert(`Error generating report: ${error.message}`);
    }
}

/**
 * Render all visualizations across all tabs for report generation
 * This ensures every chart is available for capture, regardless of which tabs/options the user selected
 */
async function renderAllVisualizationsForReport() {
    const state = getState();
    const data = state.mergedData;
    const outcomeVar = getCurrentOutcome();
    const predictorVar = getCurrentPredictor();
    const weightType = getWeightType();

    console.log('Rendering all tabs and visualizations...');

    // 1. Overview tab
    updateOverviewStats(data, outcomeVar, predictorVar, weightType);
    renderOverviewChart(data, outcomeVar, predictorVar, weightType);

    // 2. Distribution tab
    renderAllDistributionCharts(data, outcomeVar);

    // 3. Gap decomposition tab - render all granularity levels
    // Save current granularity
    const gapSelect = document.getElementById('gap-granularity');
    const originalGranularity = gapSelect ? gapSelect.value : 'overall';

    // Render overall view (which includes variance decomposition)
    if (gapSelect) gapSelect.value = 'overall';
    renderGapDecomposition(data, outcomeVar, predictorVar, weightType);

    // 4. Regression tab - run all analyses (visualizations auto-render)
    runRegressionAnalyses(data, outcomeVar, predictorVar, weightType);

    // 5. Diagnostics - render all diagnostic plots
    renderDiagnostics(data, outcomeVar);

    // 6. Comparative tab
    const comparativeResults = state.analysisResults?.comparative;
    const gapResults = state.analysisResults?.comparativeGap?.byCountry;
    if (comparativeResults) {
        renderAllComparativeCharts(data, comparativeResults, gapResults, outcomeVar, predictorVar);
    }

    // Restore original gap granularity
    if (gapSelect) {
        gapSelect.value = originalGranularity;
        renderGapDecomposition(data, outcomeVar, predictorVar, weightType);
    }

    console.log('✓ All visualizations rendered for report');
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    // DOM already loaded
    initApp();
}

// Make app available globally for debugging (development only)
if (typeof window !== 'undefined') {
    window.PISAApp = {
        getState,
        getCacheStats,
        handleLoadData,
        runInitialAnalyses
    };
}

console.log('App module loaded');
