/**
 * Data Loader
 * Handles loading country-year data chunks and metadata
 * Author: Kevin Schoenholzer
 * Date: 2025-12-15
 */

import { getState, setMetadata, setLoading, clearMergedDataCache } from './state-manager.js';

// Configuration
const DATA_BASE_URL = 'data/';
const METADATA_URL = `${DATA_BASE_URL}metadata.json`;
const CHUNK_URL_TEMPLATE = `${DATA_BASE_URL}country-year/{COUNTRY}_{YEAR}.json`;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

/**
 * Load metadata file
 * @returns {Promise<Object>} Metadata object
 */
export async function loadMetadata() {
    try {
        console.log('Loading metadata from:', METADATA_URL);

        const response = await fetch(METADATA_URL);

        if (!response.ok) {
            throw new Error(`Failed to load metadata: ${response.statusText} (${response.status})`);
        }

        const metadata = await response.json();

        console.log(`Metadata loaded: ${metadata.countries.length} countries, ${metadata.years_available.length} years`);

        // Store in state
        setMetadata(metadata);

        return metadata;
    } catch (error) {
        console.error('Error loading metadata:', error);
        throw new Error(`Failed to load metadata: ${error.message}`);
    }
}

/**
 * Load a single country-year data chunk
 * @param {String} country - Country code (e.g., 'USA')
 * @param {Number} year - Year (e.g., 2018)
 * @param {Number} retryCount - Current retry attempt (internal use)
 * @returns {Promise<Object>} Chunk data
 */
export async function loadChunk(country, year, retryCount = 0) {
    const key = `${country}_${year}`;
    const state = getState();

    // Check if already cached
    if (state.loadedChunks.has(key)) {
        console.log(`Using cached chunk: ${key}`);
        return state.loadedChunks.get(key);
    }

    const url = CHUNK_URL_TEMPLATE.replace('{COUNTRY}', country).replace('{YEAR}', year);

    try {
        console.log(`Loading chunk: ${key} from ${url}`);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const chunk = await response.json();

        // Validate chunk structure
        if (!chunk.country || !chunk.year || !chunk.students) {
            throw new Error(`Invalid chunk structure for ${key}`);
        }

        // Validate data matches request
        if (chunk.country !== country || chunk.year !== year) {
            console.warn(`Data mismatch: requested ${country} ${year}, got ${chunk.country} ${chunk.year}`);
        }

        // Cache the chunk
        state.loadedChunks.set(key, chunk);

        console.log(`Loaded ${key}: ${chunk.n_students} students`);

        return chunk;

    } catch (error) {
        console.error(`Error loading ${key}:`, error.message);

        // Retry logic
        if (retryCount < MAX_RETRIES) {
            console.log(`Retrying ${key} (attempt ${retryCount + 1}/${MAX_RETRIES})...`);

            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));

            return loadChunk(country, year, retryCount + 1);
        }

        // All retries failed
        throw new Error(`Failed to load ${key} after ${MAX_RETRIES} attempts: ${error.message}`);
    }
}

/**
 * Load multiple chunks in parallel with progress tracking
 * @param {Array<Object>} countryYearPairs - Array of {country, year} objects
 * @param {Function} onProgress - Callback for progress updates (loaded, total, current)
 * @returns {Promise<Array>} Array of loaded chunks
 */
export async function loadMultipleChunks(countryYearPairs, onProgress = null) {
    const total = countryYearPairs.length;
    const results = [];
    const errors = [];

    console.log(`Loading ${total} chunks...`);

    setLoading(true);

    try {
        // Load chunks sequentially to control concurrency
        // (could be made parallel with Promise.all for better performance)
        for (let i = 0; i < countryYearPairs.length; i++) {
            const { country, year } = countryYearPairs[i];
            const key = `${country}_${year}`;

            try {
                // Update progress
                if (onProgress) {
                    onProgress({
                        loaded: i,
                        total: total,
                        current: key,
                        percentage: Math.round((i / total) * 100)
                    });
                }

                const chunk = await loadChunk(country, year);
                results.push(chunk);

            } catch (error) {
                console.error(`Error loading ${key}:`, error);
                errors.push({ country, year, error: error.message });

                // Continue loading other chunks despite error
                // (graceful degradation)
            }
        }

        // Final progress update
        if (onProgress) {
            onProgress({
                loaded: total,
                total: total,
                current: 'complete',
                percentage: 100
            });
        }

        console.log(`Loaded ${results.length}/${total} chunks successfully`);

        if (errors.length > 0) {
            console.warn(`${errors.length} chunks failed to load:`, errors);
        }

        // Clear merged data cache since new chunks were loaded
        clearMergedDataCache();

        return results;

    } finally {
        setLoading(false);
    }
}

/**
 * Get a chunk from cache
 * @param {String} country - Country code
 * @param {Number} year - Year
 * @returns {Object|null} Cached chunk or null if not found
 */
export function getCachedChunk(country, year) {
    const key = `${country}_${year}`;
    const state = getState();
    return state.loadedChunks.get(key) || null;
}

/**
 * Merge multiple chunks into a single dataset
 * @param {Array<Object>} chunks - Array of chunk objects
 * @returns {Array} Combined array of student records
 */
export function mergeChunks(chunks) {
    const allStudents = [];

    for (const chunk of chunks) {
        if (chunk && chunk.students && Array.isArray(chunk.students)) {
            allStudents.push(...chunk.students);
        }
    }

    console.log(`Merged ${chunks.length} chunks: ${allStudents.length} total students`);

    return allStudents;
}

/**
 * Load data for current user selections
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} Merged student data
 */
export async function loadSelectedData(onProgress = null) {
    const state = getState();

    const countries = state.selectedCountries;
    const years = state.selectedYears;

    if (!countries || countries.length === 0) {
        throw new Error('No countries selected');
    }

    if (!years || years.length === 0) {
        throw new Error('No years selected');
    }

    // Create country-year pairs
    const pairs = [];
    for (const country of countries) {
        for (const year of years) {
            pairs.push({ country, year });
        }
    }

    console.log(`Loading data for ${countries.length} countries × ${years.length} years = ${pairs.length} chunks`);

    // Load chunks
    const chunks = await loadMultipleChunks(pairs, onProgress);

    // Merge into single dataset
    const mergedData = mergeChunks(chunks);

    return mergedData;
}

/**
 * Clear all cached chunks
 */
export function clearChunkCache() {
    const state = getState();
    const count = state.loadedChunks.size;
    state.loadedChunks.clear();
    clearMergedDataCache();
    console.log(`Cleared ${count} cached chunks`);
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
export function getCacheStats() {
    const state = getState();

    const chunks = Array.from(state.loadedChunks.values());
    const totalStudents = chunks.reduce((sum, chunk) => sum + (chunk.n_students || 0), 0);

    return {
        chunksLoaded: state.loadedChunks.size,
        totalStudents: totalStudents,
        countries: [...new Set(chunks.map(c => c.country))],
        years: [...new Set(chunks.map(c => c.year))]
    };
}

/**
 * Validate chunk data quality
 * @param {Object} chunk - Chunk to validate
 * @returns {Object} Validation result {valid: boolean, errors: []}
 */
export function validateChunk(chunk) {
    const errors = [];

    // Required fields
    if (!chunk.country) errors.push('Missing country');
    if (!chunk.year) errors.push('Missing year');
    if (!chunk.students) errors.push('Missing students array');
    if (chunk.n_students === undefined) errors.push('Missing n_students');

    // Data consistency
    if (chunk.students && chunk.n_students !== chunk.students.length) {
        errors.push(`Student count mismatch: header says ${chunk.n_students}, actual ${chunk.students.length}`);
    }

    // Data quality
    if (chunk.data_quality) {
        const quality = chunk.data_quality;
        const missingCount = (quality.missing_math || 0) +
                           (quality.missing_reading || 0) +
                           (quality.missing_science || 0) +
                           (quality.missing_escs || 0);

        if (missingCount > chunk.n_students * 0.5) {
            errors.push(`High missingness: ${missingCount}/${chunk.n_students} records have missing data`);
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * Preload chunks for better UX (optional)
 * @param {Array<Object>} countryYearPairs - Pairs to preload
 */
export async function preloadChunks(countryYearPairs) {
    console.log(`Preloading ${countryYearPairs.length} chunks in background...`);

    // Load in background without blocking
    loadMultipleChunks(countryYearPairs, null).catch(error => {
        console.warn('Preloading failed (non-critical):', error);
    });
}

export default {
    loadMetadata,
    loadChunk,
    loadMultipleChunks,
    getCachedChunk,
    mergeChunks,
    loadSelectedData,
    clearChunkCache,
    getCacheStats,
    validateChunk,
    preloadChunks
};
