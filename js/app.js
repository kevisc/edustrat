/**
 * Educational Stratification in PISA - Main Application
 * Author: Kevin Schoenholzer
 * Date: 2026
 */

// Import modules
import { getState, setState, setLoading, getCurrentOutcome, setCurrentOutcome,
         getCurrentPredictor, setCurrentPredictor, subscribeToState } from './core/state-manager.js';
import { loadMetadata, loadSelectedData, loadChunk, getCacheStats, getLastLoadErrors } from './core/data-loader.js';
import { initLoadingIndicator, updateProgress, showDataStatus, hideLoading,
         showButtonSpinner, hideButtonSpinner, resetProgress } from './ui/loading-indicator.js';
import { initSelectors, populateFromMetadata } from './ui/country-selector.js';
import { startTour, maybeStartTour } from './ui/tour.js';

// Import analysis modules
import { calculateDescriptiveStats, calculateInequalityMeasures, calculateSESGradient,
         calculateStatsByGroup } from './analysis/descriptive.js';
import { runPooledOLS, runFixedEffects, runRandomEffects } from './analysis/regression.js';
import { fimlRegression } from './analysis/fiml.js';
import { decomposeAchievementGap, calculateVarianceDecomposition, calculateGapTrend, calculateComparativeDecomposition } from './analysis/decomposition.js';
import { oaxacaDecomposition } from './analysis/oaxaca.js';
import { calculateTheilDecomposition } from './core/utils.js';
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
import { analyzeWithinCountryTrends } from './analysis/trends.js';
import { renderWithinCountryTrends } from './visualization/trends-viz.js';
import { generateRegressionCode, generateFimlCode, generateTrendsCode,
         generateGapCode, generateOverviewCode } from './analysis/r-code-gen.js';
import { baseLayout, BASE_CONFIG, CHART_COLORS } from './visualization/chart-theme.js';
import { attachRCodePanel } from './ui/r-code-panel.js';
import { downloadRScript } from './export/r-script-export.js';
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
import { exportAggregatedSummary } from './export/data-export.js';
import { exportAllAnalysisCharts } from './export/figure-export.js';
import { generateFullReport } from './export/report-export.js';

// Application initialization
async function initApp() {
    console.log('==================================================');
    console.log('Educational Stratification in PISA');
    console.log('Initializing...');
    console.log('==================================================');

    try {
        // Guard Plotly against rendering into hidden tab panels. A chart drawn into a
        // display:none container (an inactive tab) has zero size, and Plotly's async
        // auto-margin redraw then throws (_redrawFromAutoMarginCount). Charts are
        // re-rendered when their tab becomes visible (see onTabSwitch), so skipping a
        // hidden draw is safe and silent.
        if (typeof Plotly !== 'undefined' && !Plotly.__edustratGuarded) {
            const _newPlot = Plotly.newPlot.bind(Plotly);
            Plotly.newPlot = (div, ...rest) => {
                const el = (typeof div === 'string') ? document.getElementById(div) : div;
                if (!el || el.offsetParent === null || el.clientWidth === 0) return Promise.resolve();
                // Swallow async render rejections from Plotly's internal layout teardown
                // (e.g. when a tab is switched away while a chart is still rendering,
                // which would otherwise surface as an "uncaught (in promise)" error).
                return _newPlot(el, ...rest).catch(err => {
                    console.debug('Plotly render skipped:', err && err.message);
                });
            };
            Plotly.__edustratGuarded = true;
        }

        // Belt-and-braces: Plotly schedules some redraw/teardown work outside the
        // newPlot promise (auto-margin recompute, drag/scroll handler setup). If a
        // chart is purged because its tab was switched away while still rendering,
        // that work can throw asynchronously on a torn-down graph. Suppress only those
        // specific internal Plotly errors so the console stays clean, without masking
        // genuine application errors.
        if (!window.__edustratPlotlyErrGuard) {
            const isPlotlyTeardownError = (msg) => typeof msg === 'string' &&
                /_scrollZoom|_redrawFromAutoMarginCount|reading '_full/.test(msg);
            window.addEventListener('unhandledrejection', (e) => {
                if (isPlotlyTeardownError(e.reason && e.reason.message)) e.preventDefault();
            });
            window.addEventListener('error', (e) => {
                if (isPlotlyTeardownError(e.message)) { e.preventDefault(); return true; }
            }, true);
            window.__edustratPlotlyErrGuard = true;
        }

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

        // Shareable links: restore any selection encoded in the URL hash, then
        // keep the hash in sync with subsequent selection changes.
        applyUrlHash();
        hashSyncEnabled = true;
        subscribeToState(() => syncUrlHash());

        const copyLinkBtn = document.getElementById('copy-link-btn');
        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', async () => {
                syncUrlHash();
                const url = location.href.replace(/#.*$/, '') + location.hash +
                    (location.hash.includes('c=') ? '&load=1' : '');
                try {
                    await navigator.clipboard.writeText(url);
                    copyLinkBtn.textContent = 'Link copied';
                    setTimeout(() => { copyLinkBtn.textContent = 'Copy shareable link'; }, 1500);
                } catch (e) {
                    prompt('Copy this link:', url);
                }
            });
        }

        // Offer a short guided tour on first visit.
        maybeStartTour();

    } catch (error) {
        console.error('Failed to initialize app:', error);
        showDataStatus(
            `Failed to load metadata: ${error.message}. Check your internet connection (data is fetched from the live host), then reload the page.`,
            'error'
        );
        // The status banner lives on the Data tab; switch there so the error is visible
        // instead of surfacing only a modal alert on the Home tab.
        goToTab('data-config');
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

// Ordered analysis flow for the "Continue →" navigation at the bottom of each tab.
const ANALYSIS_FLOW = ['overview', 'distribution', 'gap-decomposition', 'regression',
                       'diagnostics', 'comparative', 'trends', 'export'];
const TAB_LABELS = {
    'data-config': 'Data', overview: 'Overview', distribution: 'Distribution',
    'gap-decomposition': 'Gap Analysis', regression: 'Regression',
    diagnostics: 'Diagnostics', comparative: 'Comparative', trends: 'Trends', export: 'Export'
};

// ---- Shareable-link (URL hash) state -----------------------------------------

let hashSyncEnabled = false;

/** Serialize the current selection into the URL hash (replaceState: no history spam). */
function syncUrlHash() {
    if (!hashSyncEnabled) return;
    const state = getState();
    if (!state.selectedCountries.length && !state.selectedYears.length) return;
    const params = new URLSearchParams();
    if (state.selectedCountries.length) params.set('c', state.selectedCountries.join('.'));
    if (state.selectedYears.length) params.set('y', state.selectedYears.join('.'));
    params.set('o', getCurrentOutcome());
    params.set('p', getCurrentPredictor());
    params.set('w', getWeightType());
    history.replaceState(null, '', '#' + params.toString());
}

/**
 * Restore a selection from the URL hash (after the metadata has populated the
 * checkboxes). With load=1 the data loads automatically — an instructor can
 * hand students a link that opens straight onto a configured analysis.
 * @returns {Boolean} true if a selection was restored
 */
function applyUrlHash() {
    if (!location.hash || location.hash.length < 2) return false;
    const params = new URLSearchParams(location.hash.slice(1));
    const tick = (sel, vals) => document.querySelectorAll(sel).forEach(cb => {
        const want = vals.includes(cb.value);
        if (cb.checked !== want) {
            cb.checked = want;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    const c = params.get('c'), y = params.get('y');
    if (c) tick('#country-checkboxes input[type="checkbox"]', c.split('.'));
    if (y) tick('#year-checkboxes input[type="checkbox"]', y.split('.'));
    const o = params.get('o');
    if (o) { const el = document.getElementById('outcome'); if (el) { el.value = o; setCurrentOutcome(o); } }
    const p = params.get('p');
    if (p) { const el = document.getElementById('predictor'); if (el) { el.value = p; setCurrentPredictor(p); } }
    const w = params.get('w');
    if (w) { const el = document.getElementById('weight-type'); if (el) el.value = w; }

    if (c && y) {
        showDataStatus('Selection restored from the shared link. Press "Load Selected Data" to run it.', 'info');
        if (params.get('load') === '1') handleLoadData();
        return true;
    }
    return false;
}

/**
 * Programmatically switch to a tab (reuses the tab button's own handler) and
 * scroll to the top so the new analysis starts in view.
 * @param {String} name - data-tab value of the target tab
 */
function goToTab(name) {
    const btn = document.querySelector(`.tab[data-tab="${name}"]`);
    if (btn) btn.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Add (or refresh) the "← Back / Continue →" footer on an analysis tab so users
 * can step through the flow without hunting for the next tab.
 * @param {String} tabName - active tab
 */
function ensureFlowNav(tabName) {
    const i = ANALYSIS_FLOW.indexOf(tabName);
    if (i === -1) return;
    const content = document.getElementById(tabName);
    if (!content) return;

    const existing = content.querySelector('.flow-nav');
    if (existing) existing.remove();

    const prev = i > 0 ? ANALYSIS_FLOW[i - 1] : 'data-config';
    const next = i < ANALYSIS_FLOW.length - 1 ? ANALYSIS_FLOW[i + 1] : null;

    const nav = document.createElement('div');
    nav.className = 'flow-nav';
    nav.innerHTML = `
        <button type="button" class="btn btn-secondary flow-prev">← ${TAB_LABELS[prev]}</button>
        <span class="flow-step">Step ${i + 1} of ${ANALYSIS_FLOW.length}</span>
        ${next
            ? `<button type="button" class="btn btn-primary flow-next">Continue to ${TAB_LABELS[next]} →</button>`
            : `<button type="button" class="btn btn-secondary flow-next">↑ Back to top</button>`}
    `;
    nav.querySelector('.flow-prev').addEventListener('click', () => goToTab(prev));
    nav.querySelector('.flow-next').addEventListener('click', () =>
        next ? goToTab(next) : window.scrollTo({ top: 0, behavior: 'smooth' }));
    content.appendChild(nav);
}

/**
 * Attach the Show-the-R panel for the Overview cards (weighted mean, Gini,
 * SES gradient) beneath the overview chart.
 */
function attachOverviewRPanel(data, outcomeVar, predictorVar, weightType) {
    try {
        const chart = document.getElementById('overview-chart');
        const container = chart ? chart.parentElement : null;
        if (!container) return;
        const desc = calculateDescriptiveStats(data, outcomeVar, weightType);
        const ineq = calculateInequalityMeasures(data, outcomeVar, weightType);
        const grad = calculateSESGradient(data, outcomeVar, predictorVar, weightType);
        if (!desc || !ineq) return;
        attachRCodePanel(container,
            generateOverviewCode({ mean: desc.mean, gini: ineq.gini, gradient: grad }, buildRSpec()),
            'overview');
    } catch (e) {
        console.warn('R panel (overview) failed:', e.message);
    }
}

/**
 * Assemble the selection spec the R code generators need (countries, years,
 * variables, weighting, controls) from the application state. Render functions
 * only receive the variable choices, so the selection is read here.
 * @param {Object} overrides - per-surface additions (e.g. { countryFilter })
 * @returns {Object} spec for js/analysis/r-code-gen.js
 */
function buildRSpec(overrides = {}) {
    const state = getState();
    const data = state.mergedData || [];
    // Prefer what is actually loaded over what is ticked, so the snippet
    // reproduces the on-screen analysis even after selections changed.
    const countries = [...new Set(data.map(d => d.country))].sort();
    const years = [...new Set(data.map(d => d.year))].sort((a, b) => a - b);
    return {
        countries: countries.length ? countries : state.selectedCountries,
        years: years.length ? years : state.selectedYears,
        outcomeVar: getCurrentOutcome(),
        predictorVar: getCurrentPredictor(),
        weightType: getWeightType(),
        controls: getSelectedControls(),
        dataSource: 'learningtower',
        ...overrides
    };
}

/**
 * Show a call-to-action on an analysis tab opened before any data is loaded,
 * so pre-load tabs are not silent dead-ends of stale placeholders.
 * @param {String} tabName - active tab
 */
function showNoDataMessage(tabName) {
    if (['home', 'data-config', 'documentation'].includes(tabName)) return;
    const content = document.getElementById(tabName);
    if (!content || content.querySelector('.no-data-cta')) return;
    const cta = document.createElement('div');
    cta.className = 'alert alert-info no-data-cta';
    cta.style.display = 'flex';
    cta.style.alignItems = 'center';
    cta.style.gap = '1rem';
    cta.innerHTML = `
        <span>No data loaded yet. Choose countries and years on the Data tab, then press <strong>Load Selected Data</strong>.</span>
        <button type="button" class="btn btn-primary" style="white-space: nowrap;">Go to Data</button>`;
    cta.querySelector('button').addEventListener('click', () => goToTab('data-config'));
    content.insertBefore(cta, content.firstChild);
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
        'comparative': ['country-comparison', 'world-map', 'temporal-trends', 'gap-comparison'],
        'trends': ['trends-chart']
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
        showNoDataMessage(tabName);
        return;
    }

    // Add the "Continue →" flow footer to analysis tabs
    ensureFlowNav(tabName);

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
                    attachOverviewRPanel(data, outcomeVar, predictorVar, weightType);
                    break;

                case 'distribution':
                    renderAllDistributionCharts(data, outcomeVar, weightType);
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

                case 'trends':
                    // Async: pulls every available cycle for the focal countries and
                    // manages its own in-chart loading state, so it is not awaited here.
                    renderTrendsTab(outcomeVar, predictorVar, weightType);
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

    // Home page: "Get started" jumps to the Data tab; "Take a tour" replays the tour.
    const homeStartBtn = document.getElementById('home-start-btn');
    if (homeStartBtn) homeStartBtn.addEventListener('click', () => goToTab('data-config'));
    const takeTourBtn = document.getElementById('take-tour-btn');
    if (takeTourBtn) takeTourBtn.addEventListener('click', () => startTour());

    // "Load BRR comparison set" preset: selects exactly the country-years that carry
    // replicate weights, sets the student weight, and loads them in one click.
    const brrDemoBtn = document.getElementById('load-brr-demo-btn');
    if (brrDemoBtn) {
        brrDemoBtn.addEventListener('click', () => {
            const BRR_COUNTRIES = ['FIN', 'USA', 'DEU', 'KOR', 'MEX'];
            const BRR_YEARS = ['2015', '2018', '2022'];
            const tick = (selector, values) => {
                document.querySelectorAll(selector).forEach(cb => {
                    cb.checked = values.includes(cb.value);
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                });
            };
            tick('#year-checkboxes input[type="checkbox"]', BRR_YEARS);
            tick('#country-checkboxes input[type="checkbox"]', BRR_COUNTRIES);
            const wt = document.getElementById('weight-type');
            if (wt) wt.value = 'student';
            handleLoadData();
        });
    }

    // Sampling-weight selector: re-run analyses immediately so BRR vs. model-based
    // standard errors can be compared by toggling the dropdown (no reload needed).
    const weightTypeSelect = document.getElementById('weight-type');
    if (weightTypeSelect) {
        weightTypeSelect.addEventListener('change', () => {
            syncUrlHash();
            const state = getState();
            if (state.mergedData && state.mergedData.length > 0) {
                runInitialAnalyses(state.mergedData);
                const activeTab = document.querySelector('.tab.active');
                if (activeTab) {
                    onTabSwitch(activeTab.getAttribute('data-tab'));
                }
            }
        });
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

    // Trends metric selector: recompute the within-country trend from the already
    // loaded cycles (no reload needed; only the focal statistic changes).
    const trendMetricSelect = document.getElementById('trend-metric');
    if (trendMetricSelect) {
        trendMetricSelect.addEventListener('change', () => {
            const activeTab = document.querySelector('.tab.active');
            if (activeTab && activeTab.getAttribute('data-tab') === 'trends') {
                renderTrendsTab(getCurrentOutcome(), getCurrentPredictor(), getWeightType());
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

    const exportRBtn = document.getElementById('export-r-btn');
    if (exportRBtn) {
        exportRBtn.addEventListener('click', () => downloadRScript(buildRSpec()));
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

        // A total load failure must not fall through to the success banner
        // ("Loaded 0 student records ... Ready to analyze!").
        if (!data || data.length === 0) {
            throw new Error('No data could be loaded for this selection. Check your internet connection (data is fetched from the live host) and try again.');
        }

        // Store merged data in state
        setState({ mergedData: data });

        // Remove any "no data yet" call-to-action panels injected on analysis tabs.
        document.querySelectorAll('.no-data-cta').forEach(el => el.remove());

        // Get cache stats
        const stats = getCacheStats();

        console.log('===========================================');
        console.log('Data loading complete!');
        console.log('Total students:', data.length.toLocaleString());
        console.log('Countries:', stats.countries.join(', '));
        console.log('Years:', stats.years.join(', '));
        console.log('===========================================');

        // Update status — report partial failures rather than a clean success.
        const loadErrors = getLastLoadErrors();
        if (loadErrors.length > 0) {
            const failed = loadErrors.map(e => `${e.country} ${e.year}`).join(', ');
            showDataStatus(
                `Loaded ${data.length.toLocaleString()} student records, but ${loadErrors.length} chunk(s) failed: ${failed}. Results will exclude those country-years.`,
                'warning'
            );
        } else {
            showDataStatus(
                `✓ Loaded ${data.length.toLocaleString()} student records from ${stats.chunksLoaded} data chunks.
                 Ready to analyze! Switch to different tabs to explore the data.`,
                'success'
            );
        }

        if (loadCompleteMessage) {
            loadCompleteMessage.textContent = 'Done loading. You can now explore the analysis tabs above.';
            loadCompleteMessage.style.display = 'block';
        }

        // Run initial analyses
        runInitialAnalyses(data);

        // Open the Overview tab automatically so the user starts the analysis flow.
        goToTab('overview');

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
 * Populate and render the Oaxaca–Blinder section on the Gap Analysis tab.
 * Shown only when the loaded data contain at least two countries.
 */
function renderOaxacaSection(data, outcomeVar, predictorVar, weightType) {
    const section = document.getElementById('oaxaca-section');
    const selA = document.getElementById('oaxaca-a');
    const selB = document.getElementById('oaxaca-b');
    const results = document.getElementById('oaxaca-results');
    if (!section || !selA || !selB || !results) return;

    const countries = [...new Set(data.map(d => d.country))].sort();
    if (countries.length < 2) { section.style.display = 'none'; return; }
    section.style.display = 'block';

    // (Re)populate the selectors, preserving current choices when possible.
    const fill = (sel, def) => {
        const cur = sel.value;
        sel.innerHTML = countries.map(c => `<option value="${c}">${c}</option>`).join('');
        sel.value = countries.includes(cur) ? cur : def;
    };
    fill(selA, countries[0]);
    fill(selB, countries[1]);
    if (selA.value === selB.value) selB.value = countries.find(c => c !== selA.value);

    const render = () => {
        const a = selA.value, b = selB.value;
        if (a === b) { results.innerHTML = '<p style="color: var(--text-secondary);">Choose two different countries.</p>'; return; }
        const recsA = data.filter(d => d.country === a);
        const recsB = data.filter(d => d.country === b);
        const controls = getSelectedControls().filter(c => c !== 'year');
        const d = oaxacaDecomposition(recsA, recsB, outcomeVar, predictorVar, controls, weightType);
        if (!d) { results.innerHTML = '<p style="color: var(--text-secondary);">Not enough complete cases for this pair.</p>'; return; }

        const pct = v => `${(100 * v / d.gap).toFixed(1)}%`;
        const fmt2 = v => v.toFixed(2);
        results.innerHTML = `
            <div class="stat-card">
                <div class="methodology-note">
                    <strong>Gap (${a} − ${b}):</strong> ${fmt2(d.gap)} score points
                    (${fmt2(d.meanA)} vs ${fmt2(d.meanB)}; n = ${d.nA.toLocaleString()} / ${d.nB.toLocaleString()})<br><br>
                    <strong>Twofold (reference: ${b}):</strong><br>
                    &nbsp;&nbsp;Explained by composition (endowments): ${fmt2(d.twofold.explained)} (${pct(d.twofold.explained)})<br>
                    &nbsp;&nbsp;Unexplained (returns + interaction): ${fmt2(d.twofold.unexplained)} (${pct(d.twofold.unexplained)})<br><br>
                    <strong>Threefold:</strong>
                    endowments ${fmt2(d.threefold.endowments)},
                    coefficients ${fmt2(d.threefold.coefficients)},
                    interaction ${fmt2(d.threefold.interaction)}<br><br>
                    <strong>Per-variable endowment contributions:</strong>
                    ${d.detail.map(t => `${t.variable}: ${fmt2(t.endowment)}`).join(' · ')}
                </div>
            </div>`;
    };

    selA.onchange = render;
    selB.onchange = render;
    render();
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
 * Per-record weight (same fallback rule as the analysis modules).
 */
function getRecordWeight(record, weightType) {
    if (weightType === 'none') return 1;
    if (weightType === 'senate') {
        const v = record.w_fsenwt || record.senateWeight || record.W_FSENWT;
        return (v && isFinite(+v) && +v > 0) ? +v : 1;
    }
    const v = record.stu_wgt || record.w_fstuwt || record.studentWeight || record.W_FSTUWT || record.weight;
    return (v && isFinite(+v) && +v > 0) ? +v : 1;
}

// Within-country trends: cap the number of focal countries so the tab never
// fetches an unreasonable number of cycle chunks, and cache the loaded records so
// switching the focal metric/outcome recomputes without re-downloading.
const TRENDS_MAX_COUNTRIES = 6;
let trendsRecordsCache = { key: null, records: null };

/**
 * Render the Within-Country Trends tab. For each focal country it pulls *every*
 * available PISA cycle (from metadata) — a superset of the years selected for the
 * other tabs — so the trend spans the full series, then computes per-cycle
 * estimates, the precision-weighted within-country trend, and the country
 * fixed-effects panel for the chosen metric.
 * @param {String} outcomeVar - current outcome (math/reading/science)
 * @param {String} predictorVar - current SES predictor (escs/parent_edu)
 * @param {String} weightType - current weighting (student/senate/none)
 */
async function renderTrendsTab(outcomeVar, predictorVar, weightType) {
    const state = getState();
    const chartDiv = document.getElementById('trends-chart');
    const tableDiv = document.getElementById('trends-table');
    const metric = document.getElementById('trend-metric')?.value || 'gradient';

    const selected = state.selectedCountries || [];
    if (selected.length === 0) {
        if (chartDiv) chartDiv.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:2rem;">Select one or more countries on the Data tab and load data to see within-country trends.</p>';
        if (tableDiv) tableDiv.innerHTML = '';
        return;
    }

    const countries = selected.slice(0, TRENDS_MAX_COUNTRIES);
    const capped = selected.length > TRENDS_MAX_COUNTRIES;
    const key = countries.slice().sort().join(',');

    // Load all available cycles for the focal countries (cached across re-renders).
    let records = (trendsRecordsCache.key === key) ? trendsRecordsCache.records : null;
    if (!records) {
        if (chartDiv) chartDiv.innerHTML = `<p style="text-align:center;color:#94a3b8;padding:2rem;">Loading all PISA cycles for ${countries.join(', ')}…</p>`;
        const meta = state.metadata;
        const pairs = [];
        countries.forEach(c => {
            const cm = meta?.countries?.find(m => m.code === c);
            const years = (cm && Array.isArray(cm.years) && cm.years.length) ? cm.years : (state.selectedYears || []);
            years.forEach(y => pairs.push({ country: c, year: y }));
        });
        records = [];
        let done = 0;
        for (const { country, year } of pairs) {
            try {
                const chunk = await loadChunk(country, year);
                if (chunk?.students) records.push(...chunk.students);
            } catch (e) {
                console.warn(`Trends: could not load ${country}_${year}: ${e.message}`);
            }
            done++;
            if (chartDiv) chartDiv.innerHTML = `<p style="text-align:center;color:#94a3b8;padding:2rem;">Loading all PISA cycles for ${countries.join(', ')}… (${done}/${pairs.length} files)</p>`;
        }
        trendsRecordsCache = { key, records };
    }

    // The async load may have outlived the user's stay on this tab.
    if (document.querySelector('.tab.active')?.getAttribute('data-tab') !== 'trends') return;

    const analysis = analyzeWithinCountryTrends(records, { metric, outcomeVar, predictorVar, weightType });
    renderWithinCountryTrends(analysis, { chartId: 'trends-chart', tableId: 'trends-table', caveatsId: 'trends-caveats' });

    try {
        const tDiv = document.getElementById('trends-table');
        if (tDiv) attachRCodePanel(tDiv, generateTrendsCode(analysis, buildRSpec({ countries })), 'trends');
    } catch (e) { console.warn('R panel (trends) failed:', e.message); }

    const noteEl = document.getElementById('trends-cap-note');
    if (noteEl) noteEl.textContent = capped
        ? `Showing the first ${TRENDS_MAX_COUNTRIES} of ${selected.length} selected countries (to limit the number of cycle files fetched).`
        : '';
}

/**
 * Render the listwise-deletion vs FIML comparison for the bivariate gradient.
 * Pure addition to the Regression tab — does not affect the OLS/FE/RE pipeline.
 * @param {Array} data - Student data (already country-filtered)
 * @param {String} outcomeVar - Outcome variable
 * @param {String} predictorVar - SES predictor
 * @param {String} weightType - Weight type
 */
function renderFimlComparison(data, outcomeVar, predictorVar, weightType) {
    const div = document.getElementById('fiml-comparison');
    if (!div) return;

    const predLabel = getPredictorLabel(predictorVar);
    const cc = runPooledOLS(data, outcomeVar, predictorVar, [], weightType);
    const fiml = fimlRegression(data, outcomeVar, predictorVar, weightType);

    if (!cc || !fiml || !Number.isFinite(fiml.coefficients?.[1])) {
        div.innerHTML = '<p style="color:var(--text-secondary);">Not enough data to compare missing-data methods for this selection.</p>';
        return;
    }

    const fmt = (v, d = 2) => (v == null || !isFinite(v)) ? '—' : (+v).toFixed(d);
    const ccBeta = cc.coefficients[1];
    const ccSe = (cc.seActive === 'BRR' && cc.standardErrorsBRR) ? cc.standardErrorsBRR[1] : cc.standardErrors[1];
    const ccN = cc.nobs;
    const fBeta = fiml.coefficients[1];
    const fSe = fiml.standardErrors[1];
    const recovered = fiml.nUsed - fiml.nComplete;
    const diff = fBeta - ccBeta;

    const th = t => `<th style="text-align:left;padding:0.4rem 0.7rem;border-bottom:1px solid var(--border);">${t}</th>`;
    const td = t => `<td style="padding:0.4rem 0.7rem;">${t}</td>`;

    div.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:0.92rem;max-width:660px;">
            <thead><tr>${th('Method')}${th(predLabel + ' gradient (β)')}${th('SE')}${th('Students used')}</tr></thead>
            <tbody>
                <tr>${td('Listwise deletion')}${td('<strong>' + fmt(ccBeta) + '</strong>')}${td(fmt(ccSe))}${td(ccN.toLocaleString() + ' complete cases')}</tr>
                <tr>${td('FIML (EM, joint normal)')}${td('<strong>' + fmt(fBeta) + '</strong>')}${td(fmt(fSe))}${td(fiml.nUsed.toLocaleString() + ' (' + fiml.nComplete.toLocaleString() + ' complete)')}</tr>
            </tbody>
        </table>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.6rem;">
            FIML recovers <strong>${recovered.toLocaleString()}</strong> partially-observed student${recovered === 1 ? '' : 's'} that listwise deletion discards.
            The gradient is <strong>${fmt(Math.abs(diff))}</strong> points ${diff >= 0 ? 'higher' : 'lower'} under FIML
            (${fmt(Math.abs(diff) / Math.max(Math.abs(ccBeta), 1e-9) * 100, 1)}% relative).
            ${recovered === 0 ? 'With no partially-observed cases in this selection, the two methods coincide.' : 'A larger gap indicates greater sensitivity to how missing data are handled.'}
        </p>`;

    try {
        const spec = buildRSpec({ countries: [...new Set(data.map(d => d.country))].sort() });
        attachRCodePanel(div, generateFimlCode(cc, fiml, spec), 'fiml');
    } catch (e) { console.warn('R panel (FIML) failed:', e.message); }
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

    let overallGap = null; // kept for the Show-the-R panel below

    // The gap plot only draws for the by-* granularities; hide its container on
    // "overall" so no empty chart card shows.
    const gapPlotDiv = document.getElementById('gap-plot');
    if (gapPlotDiv) gapPlotDiv.style.display = (granularity === 'overall') ? 'none' : 'block';

    if (granularity === 'overall') {
        // Overall gap across all data
        const gap = decomposeAchievementGap(data, outcomeVar, predictorVar, weightType);
        const decomp = calculateVarianceDecomposition(data, outcomeVar);
        overallGap = gap;

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

        // Variance decomposition card (variance-based ICC + additive Theil decomposition)
        if (decomp) {
            let theilLines = '';
            try {
                const vals = [], wts = [], grps = [];
                for (const r of data) {
                    const v = +r[outcomeVar];
                    if (isFinite(v) && v > 0 && r.country) {
                        vals.push(v);
                        wts.push(weightType === 'none' ? 1 : getRecordWeight(r, weightType));
                        grps.push(r.country);
                    }
                }
                const t = calculateTheilDecomposition(vals, grps, wts);
                if (isFinite(t.total)) {
                    theilLines = `
                        <strong>Theil-T (additively decomposable):</strong> ${t.total.toFixed(4)}<br>
                        <strong>&nbsp;&nbsp;within-country:</strong> ${t.within.toFixed(4)} (${(100 * t.within / t.total).toFixed(1)}%)<br>
                        <strong>&nbsp;&nbsp;between-country:</strong> ${t.between.toFixed(4)} (${(100 * t.between / t.total).toFixed(1)}%)<br>`;
                }
            } catch (e) { console.warn('Theil decomposition failed:', e.message); }

            html += `
                <div class="stat-card">
                    <h3>Variance Decomposition</h3>
                    <div class="methodology-note">
                        <strong>Total Variance:</strong> ${decomp.totalVariance.toFixed(2)}<br>
                        <strong>Within-country:</strong> ${decomp.percentWithin.toFixed(1)}%<br>
                        <strong>Between-country:</strong> ${decomp.percentBetween.toFixed(1)}%<br>
                        <strong>ICC (ρ):</strong> ${decomp.icc.toFixed(3)}<br>
                        ${theilLines}
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

    // Show-the-R panel for the overall gap (the verified quartile-gap recipe).
    if (granularity === 'overall' && overallGap) {
        try {
            attachRCodePanel(resultsDiv, generateGapCode(overallGap, buildRSpec()), 'gap:overall');
        } catch (e) { console.warn('R panel (gap) failed:', e.message); }
    }

    // Oaxaca–Blinder section (needs at least two countries in the loaded data).
    renderOaxacaSection(data, outcomeVar, predictorVar, weightType);
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
            marker: { color: CHART_COLORS[0] },
            yaxis: 'y'
        });

        traces.push({
            x: countries,
            y: effectSizes,
            name: 'Effect Size',
            type: 'scatter',
            mode: 'markers+lines',
            marker: { size: 10, color: CHART_COLORS[7] },
            line: { color: CHART_COLORS[7], width: 2 },
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
            marker: { color: CHART_COLORS[0] }
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

    const layout = baseLayout({
        title: {
            text: `Achievement Gap by ${type === 'country' ? 'Country' : type === 'year' ? 'Year' : 'Country × Year'}`
        },
        xaxis: { title: { text: type === 'year' ? 'Year' : 'Country' } },
        yaxis: { title: { text: 'Achievement Gap (Q4-Q1 score points)' } },
        barmode: type === 'country-year' ? 'group' : 'relative',
        showlegend: type === 'country-year' || type === 'country',
        margin: { r: type === 'country' ? 120 : 40 }
    });

    // Add second y-axis for country comparison (effect size)
    if (type === 'country') {
        layout.yaxis2 = {
            title: { text: 'Effect Size (Cohen\'s d)' },
            overlaying: 'y',
            side: 'right',
            gridcolor: 'transparent',
            tickfont: { color: '#55606f', size: 11 }
        };
    }

    Plotly.newPlot(chartDiv, traces, layout, BASE_CONFIG);
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

        // Explicit feedback when every model came back null (e.g. too few
        // complete cases) instead of a silently empty panel.
        if (Object.keys(models).length === 0) {
            const resultsDiv = document.getElementById('regression-results');
            if (resultsDiv) {
                resultsDiv.innerHTML = '<div class="alert alert-info">Not enough complete cases in the current selection to fit a regression model. Load more countries or years, or choose a different predictor.</div>';
            }
        }

        // Show info message if models were skipped
        if (applicable.message) {
            const resultsDiv = document.getElementById('regression-results');
            if (resultsDiv) {
                const infoBox = document.createElement('div');
                infoBox.className = 'alert alert-info';
                infoBox.style.marginTop = '1rem';
                infoBox.innerHTML = `<strong>Note:</strong> ${applicable.message}`;
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

        // Show-the-R panels: one per rendered model box, matched by header text.
        try {
            const spec = buildRSpec(countryFilter !== 'all' ? { countries: [countryFilter] } : {});
            document.querySelectorAll('#regression-results .model-box').forEach(box => {
                const header = (box.querySelector('.model-header')?.textContent || '').trim();
                const model = Object.values(models).find(m => m.modelName === header);
                if (model) attachRCodePanel(box, generateRegressionCode(model, spec), `reg:${model.modelName}`);
            });
        } catch (e) { console.warn('R panel (regression) failed:', e.message); }

        // Missing-data comparison: listwise deletion vs FIML for the bivariate gradient.
        renderFimlComparison(filteredData, outcomeVar, predictorVar, weightType);

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
    // The FE-vs-RE (Hausman) contrast groups by country, so it is degenerate for a
    // single country — it lives on the Regression tab with several countries loaded.
    const hausmanResult = null;

    try {
        // Baseline OLS on this country's data
        models.ols = runPooledOLS(countryData, outcomeVar, predictorVar, ['gender'], weightType);

        // With several cycles, the meaningful within-country contrast is year
        // effects: same model plus a dummy per PISA cycle.
        if (years.length > 1) {
            const yfe = runFixedEffects(countryData, outcomeVar, predictorVar, ['gender', 'year'], weightType);
            if (yfe) {
                yfe.modelName = 'OLS + Year fixed effects';
                yfe.ngroups = years.length; // groups are cycles here, not countries
                models.fixedEffects = yfe;
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

    // 3. Hausman panel: on this per-country view the FE-vs-RE contrast cannot be
    // estimated (it groups by country), so point to where it lives instead.
    const hausmanDiv = document.getElementById('hausman-panel');
    if (hausmanDiv) {
        hausmanDiv.innerHTML = `<div style="padding: 1rem; color: var(--text-secondary);">
            The Hausman test contrasts country fixed effects with country random effects, so it needs
            several countries in one model. Load two or more countries and run it on the
            <strong>Regression</strong> tab ("All Countries Combined") — the result appears beneath the model tables there.
            This per-country view fits OLS${years.length > 1 ? ' and a year-effects specification' : ''} instead.
        </div>`;
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

    exportAggregatedSummary(state.mergedData, state);
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
