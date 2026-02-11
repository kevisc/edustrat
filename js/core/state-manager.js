/**
 * State Manager
 * Central state management for the PISA Educational Inequality Explorer
 * Author: Kevin Schoenholzer
 * Date: 2025-12-15
 */

// Global application state
const AppState = {
    // Metadata
    metadata: null,

    // Loaded data chunks
    loadedChunks: new Map(), // key: "USA_2018", value: chunk data

    // User selections
    selectedCountries: [],
    selectedYears: [],

    // Analysis parameters
    currentOutcome: 'math', // 'math', 'reading', or 'science'
    currentPredictor: 'escs', // 'escs' or 'parent_edu'
    weightType: 'student', // 'student', 'senate', 'replicate', 'none'
    controlVariables: [], // ['gender', 'parent_edu', 'year']

    // Merged data
    mergedData: null,

    // Analysis results cache
    analysisResults: {
        descriptive: null,
        regression: null,
        decomposition: null,
        diagnostics: null,
        comparative: null,
        comparativeGap: null
    },

    // UI state
    currentTab: 'overview',
    isLoading: false,

    // State change listeners
    listeners: []
};

/**
 * Get current state
 * @returns {Object} Current application state
 */
export function getState() {
    return AppState;
}

/**
 * Update state with new values
 * @param {Object} updates - Object with state updates
 */
export function setState(updates) {
    Object.assign(AppState, updates);
    notifyListeners(updates);
}

/**
 * Update a specific property in a nested state object
 * @param {String} path - Dot-notation path (e.g., 'analysisResults.descriptive')
 * @param {*} value - New value
 */
export function setNestedState(path, value) {
    const keys = path.split('.');
    let current = AppState;

    for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    notifyListeners({ [path]: value });
}

/**
 * Subscribe to state changes
 * @param {Function} callback - Function to call when state changes
 * @returns {Function} Unsubscribe function
 */
export function subscribeToState(callback) {
    AppState.listeners.push(callback);

    // Return unsubscribe function
    return () => {
        const index = AppState.listeners.indexOf(callback);
        if (index > -1) {
            AppState.listeners.splice(index, 1);
        }
    };
}

/**
 * Notify all listeners of state changes
 * @param {Object} updates - The updates that were made
 */
function notifyListeners(updates) {
    AppState.listeners.forEach(callback => {
        try {
            callback(updates, AppState);
        } catch (error) {
            console.error('Error in state listener:', error);
        }
    });
}

/**
 * Get merged data from all loaded chunks
 * @returns {Array} Combined student records from all chunks
 */
export function getMergedData() {
    if (AppState.mergedData) {
        return AppState.mergedData;
    }

    // Merge all loaded chunks
    const allStudents = [];

    for (const [key, chunk] of AppState.loadedChunks) {
        if (chunk && chunk.students) {
            allStudents.push(...chunk.students);
        }
    }

    AppState.mergedData = allStudents;
    return allStudents;
}

/**
 * Clear merged data cache (call when new chunks are loaded)
 */
export function clearMergedDataCache() {
    AppState.mergedData = null;
}

/**
 * Get currently selected countries
 * @returns {Array} Array of country codes
 */
export function getSelectedCountries() {
    return AppState.selectedCountries;
}

/**
 * Get currently selected years
 * @returns {Array} Array of years
 */
export function getSelectedYears() {
    return AppState.selectedYears;
}

/**
 * Set selected countries
 * @param {Array} countries - Array of country codes
 */
export function setSelectedCountries(countries) {
    AppState.selectedCountries = countries;
    clearMergedDataCache();
    notifyListeners({ selectedCountries: countries });
}

/**
 * Set selected years
 * @param {Array} years - Array of years
 */
export function setSelectedYears(years) {
    AppState.selectedYears = years;
    clearMergedDataCache();
    notifyListeners({ selectedYears: years });
}

/**
 * Get current outcome variable
 * @returns {String} 'math', 'reading', or 'science'
 */
export function getCurrentOutcome() {
    return AppState.currentOutcome;
}

/**
 * Set current outcome variable
 * @param {String} outcome - 'math', 'reading', or 'science'
 */
export function setCurrentOutcome(outcome) {
    AppState.currentOutcome = outcome;
    // Clear cached results since outcome changed
    AppState.analysisResults = {
        descriptive: null,
        regression: null,
        decomposition: null,
        diagnostics: null,
        comparative: null,
        comparativeGap: null
    };
    notifyListeners({ currentOutcome: outcome });
}

/**
 * Get current predictor variable
 * @returns {String} 'escs' or 'parent_edu'
 */
export function getCurrentPredictor() {
    return AppState.currentPredictor;
}

/**
 * Set current predictor variable
 * @param {String} predictor - 'escs' or 'parent_edu'
 */
export function setCurrentPredictor(predictor) {
    AppState.currentPredictor = predictor;
    // Clear cached results since predictor changed
    AppState.analysisResults = {
        descriptive: null,
        regression: null,
        decomposition: null,
        diagnostics: null,
        comparative: null,
        comparativeGap: null
    };
    notifyListeners({ currentPredictor: predictor });
}

/**
 * Get loading state
 * @returns {Boolean} True if data is currently loading
 */
export function isLoading() {
    return AppState.isLoading;
}

/**
 * Set loading state
 * @param {Boolean} loading - True if loading, false otherwise
 */
export function setLoading(loading) {
    AppState.isLoading = loading;
    notifyListeners({ isLoading: loading });
}

/**
 * Get metadata
 * @returns {Object} Application metadata
 */
export function getMetadata() {
    return AppState.metadata;
}

/**
 * Set metadata
 * @param {Object} metadata - Application metadata
 */
export function setMetadata(metadata) {
    AppState.metadata = metadata;
    notifyListeners({ metadata });
}

/**
 * Reset application state
 */
export function resetState() {
    AppState.loadedChunks.clear();
    AppState.selectedCountries = [];
    AppState.selectedYears = [];
    AppState.mergedData = null;
    AppState.analysisResults = {
        descriptive: null,
        regression: null,
        decomposition: null,
        diagnostics: null
    };
    notifyListeners({ reset: true });
}

/**
 * Get a specific analysis result from cache
 * @param {String} type - 'descriptive', 'regression', 'decomposition', or 'diagnostics'
 * @returns {*} Cached result or null
 */
export function getAnalysisResult(type) {
    return AppState.analysisResults[type];
}

/**
 * Cache an analysis result
 * @param {String} type - 'descriptive', 'regression', 'decomposition', or 'diagnostics'
 * @param {*} result - Result to cache
 */
export function setAnalysisResult(type, result) {
    AppState.analysisResults[type] = result;
    notifyListeners({ [`analysisResults.${type}`]: result });
}

/**
 * Clear all cached analysis results
 */
export function clearAnalysisResults() {
    AppState.analysisResults = {
        descriptive: null,
        regression: null,
        decomposition: null,
        diagnostics: null,
        comparative: null,
        comparativeGap: null
    };
    notifyListeners({ analysisResults: AppState.analysisResults });
}

// Make state available globally for debugging (development only)
if (typeof window !== 'undefined') {
    window.AppState = AppState;
    window.getState = getState;
}

export default {
    getState,
    setState,
    setNestedState,
    subscribeToState,
    getMergedData,
    clearMergedDataCache,
    getSelectedCountries,
    getSelectedYears,
    setSelectedCountries,
    setSelectedYears,
    getCurrentOutcome,
    setCurrentOutcome,
    getCurrentPredictor,
    setCurrentPredictor,
    isLoading,
    setLoading,
    getMetadata,
    setMetadata,
    resetState,
    getAnalysisResult,
    setAnalysisResult,
    clearAnalysisResults
};
