/**
 * Loading Indicator
 * Manages progress bar and loading states
 * Author: Kevin Schoenholzer
 * Date: 2025-12-15
 */

import { subscribeToState, isLoading } from '../core/state-manager.js';

// DOM elements
let progressContainer;
let progressBar;
let progressPercentage;
let progressText;
let progressDetails;
let loadingSpinner;

/**
 * Initialize loading indicator
 */
export function initLoadingIndicator() {
    // Get DOM elements
    progressContainer = document.getElementById('loading-progress');
    progressBar = document.getElementById('progress-bar');
    progressPercentage = document.getElementById('progress-percentage');
    progressText = document.getElementById('progress-text');
    progressDetails = document.getElementById('progress-details');
    loadingSpinner = document.getElementById('loading-spinner');

    // Subscribe to loading state changes
    subscribeToState((updates) => {
        if ('isLoading' in updates) {
            if (updates.isLoading) {
                showLoading();
            } else {
                hideLoading();
            }
        }
    });

    console.log('Loading indicator initialized');
}

/**
 * Show loading indicator
 */
export function showLoading() {
    if (progressContainer) {
        progressContainer.classList.add('active');
    }
    if (loadingSpinner) {
        loadingSpinner.style.display = 'inline-block';
    }
}

/**
 * Hide loading indicator
 */
export function hideLoading() {
    if (progressContainer) {
        progressContainer.classList.remove('active');
    }
    if (loadingSpinner) {
        loadingSpinner.style.display = 'none';
    }
}

/**
 * Update progress bar
 * @param {Object} progress - Progress object {loaded, total, current, percentage}
 */
export function updateProgress(progress) {
    const { loaded, total, current, percentage } = progress;

    // Update progress bar width
    if (progressBar && progressPercentage) {
        progressBar.style.width = `${percentage}%`;
        progressPercentage.textContent = `${percentage}%`;
    }

    // Update progress text
    if (progressText) {
        if (current === 'complete') {
            progressText.textContent = 'Loading complete!';
        } else {
            progressText.textContent = `Loading ${current}...`;
        }
    }

    // Update progress details
    if (progressDetails) {
        if (current === 'complete') {
            progressDetails.textContent = `Successfully loaded ${total} data chunks`;
        } else {
            progressDetails.textContent = `Loaded ${loaded} of ${total} country-year combinations`;
        }
    }
}

/**
 * Set loading message
 * @param {String} message - Message to display
 */
export function setLoadingMessage(message) {
    if (progressText) {
        progressText.textContent = message;
    }
}

/**
 * Set loading details
 * @param {String} details - Details to display
 */
export function setLoadingDetails(details) {
    if (progressDetails) {
        progressDetails.textContent = details;
    }
}

/**
 * Reset progress to 0%
 */
export function resetProgress() {
    if (progressBar && progressPercentage) {
        progressBar.style.width = '0%';
        progressPercentage.textContent = '0%';
    }
    if (progressText) {
        progressText.textContent = 'Initializing...';
    }
    if (progressDetails) {
        progressDetails.textContent = 'Loading data...';
    }
}

/**
 * Show button spinner
 * @param {HTMLElement} button - Button element
 */
export function showButtonSpinner(button) {
    const spinner = button.querySelector('.spinner-inline');
    if (spinner) {
        spinner.style.display = 'inline-block';
    }
    button.disabled = true;
}

/**
 * Hide button spinner
 * @param {HTMLElement} button - Button element
 */
export function hideButtonSpinner(button) {
    const spinner = button.querySelector('.spinner-inline');
    if (spinner) {
        spinner.style.display = 'none';
    }
    button.disabled = false;
}

/**
 * Show loading spinner in specific element
 * @param {String} elementId - ID of container element
 * @param {String} message - Optional message
 */
export function showSpinnerIn(elementId, message = 'Loading...') {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
            <div class="spinner"></div>
            <div style="margin-top: 1rem; color: var(--text-secondary);">${message}</div>
        </div>
    `;
}

/**
 * Clear loading spinner from element
 * @param {String} elementId - ID of container element
 */
export function clearSpinner(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = '';
    }
}

/**
 * Show data status message
 * @param {String} message - Message to show
 * @param {String} type - Type: 'info', 'success', 'error'
 */
export function showDataStatus(message, type = 'info') {
    const statusEl = document.getElementById('data-status');
    if (!statusEl) return;

    // Update class
    statusEl.className = `alert alert-${type}`;

    // Update content
    if (type === 'success') {
        statusEl.innerHTML = `<strong>✓ Ready!</strong><br>${message}`;
    } else if (type === 'error') {
        statusEl.innerHTML = `<strong>✗ Error!</strong><br>${message}`;
    } else {
        statusEl.innerHTML = `<strong>ℹ Info</strong><br>${message}`;
    }
}

/**
 * Create progress callback for data loading
 * @returns {Function} Progress callback function
 */
export function createProgressCallback() {
    return (progress) => {
        updateProgress(progress);
    };
}

export default {
    initLoadingIndicator,
    showLoading,
    hideLoading,
    updateProgress,
    setLoadingMessage,
    setLoadingDetails,
    resetProgress,
    showButtonSpinner,
    hideButtonSpinner,
    showSpinnerIn,
    clearSpinner,
    showDataStatus,
    createProgressCallback
};
