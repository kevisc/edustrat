/**
 * Country Selector
 * Manages country and year selection UI
 * Author: Kevin Schoenholzer
 * Date: 2025-12-15
 */

import { getMetadata, setSelectedCountries, setSelectedYears, getSelectedYears as getYearsFromState } from '../core/state-manager.js';

// DOM elements
let countryCheckboxes;
let yearCheckboxes;
let countryFilterInput;
let countriesSelectedCount;
let yearsSelectedCount;

/**
 * Initialize country/year selectors
 */
export function initSelectors() {
    // Get DOM elements
    countryCheckboxes = document.getElementById('country-checkboxes');
    yearCheckboxes = document.getElementById('year-checkboxes');
    countryFilterInput = document.getElementById('country-filter-input');
    countriesSelectedCount = document.getElementById('countries-selected-count');
    yearsSelectedCount = document.getElementById('years-selected-count');

    // Set up event listeners
    setupEventListeners();

    console.log('Country/Year selectors initialized');
}

/**
 * Populate selectors from metadata
 * @param {Object} metadata - Metadata object
 */
export function populateFromMetadata(metadata) {
    if (!metadata) {
        console.error('No metadata provided');
        return;
    }

    populateCountries(metadata.countries);
    populateYears(metadata.years_available);
}

/**
 * Populate country checkboxes
 * @param {Array} countries - Array of country objects
 */
function populateCountries(countries) {
    if (!countryCheckboxes || !countries) return;

    // Sort countries alphabetically by code
    const sortedCountries = [...countries].sort((a, b) => a.code.localeCompare(b.code));

    // Create checkbox HTML
    const html = sortedCountries.map((country, index) => {
        // Auto-select first 3 countries
        const checked = index < 3 ? 'checked' : '';

        return `
            <label>
                <span>${country.code}</span>
                <input type="checkbox" value="${country.code}" ${checked} data-country="${country.code}">
            </label>
        `;
    }).join('');

    countryCheckboxes.innerHTML = html;

    // Add change listeners
    const checkboxes = countryCheckboxes.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', updateCountrySelection);
    });

    // Initial count update
    updateCountrySelection();
}

/**
 * Populate year checkboxes
 * @param {Array} years - Array of years
 */
function populateYears(years) {
    if (!yearCheckboxes || !years) return;

    // Sort years descending
    const sortedYears = [...years].sort((a, b) => b - a);

    // Create checkbox HTML - all years selected by default
    const html = sortedYears.map(year => {
        return `
            <label>
                <span>${year}</span>
                <input type="checkbox" value="${year}" checked data-year="${year}">
            </label>
        `;
    }).join('');

    yearCheckboxes.innerHTML = html;

    // Add change listeners
    const checkboxes = yearCheckboxes.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', updateYearSelection);
    });

    // Initial selection update
    updateYearSelection();
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Select all/clear buttons for countries
    const selectAllCountriesBtn = document.getElementById('select-all-countries-btn');
    const clearAllCountriesBtn = document.getElementById('clear-all-countries-btn');

    if (selectAllCountriesBtn) {
        selectAllCountriesBtn.addEventListener('click', selectAllCountries);
    }

    if (clearAllCountriesBtn) {
        clearAllCountriesBtn.addEventListener('click', clearAllCountries);
    }

    // Country filter
    if (countryFilterInput) {
        countryFilterInput.addEventListener('input', filterCountries);
    }

    // Select all/deselect all buttons for years
    const selectAllYearsBtn = document.getElementById('select-all-years-btn');
    const deselectAllYearsBtn = document.getElementById('deselect-all-years-btn');

    if (selectAllYearsBtn) {
        selectAllYearsBtn.addEventListener('click', selectAllYears);
    }

    if (deselectAllYearsBtn) {
        deselectAllYearsBtn.addEventListener('click', deselectAllYears);
    }
}

/**
 * Update year selection in state
 */
function updateYearSelection() {
    if (!yearCheckboxes) return;

    const checkboxes = yearCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
    const selected = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));

    // Update state
    setSelectedYears(selected);

    // Update count display
    if (yearsSelectedCount) {
        if (selected.length === 0) {
            yearsSelectedCount.textContent = 'No years selected';
            yearsSelectedCount.style.color = '#ef4444';
        } else {
            yearsSelectedCount.textContent = `${selected.length} ${selected.length === 1 ? 'year' : 'years'} selected`;
            yearsSelectedCount.style.color = 'var(--text-secondary)';
        }
    }
}

/**
 * Select all years
 */
function selectAllYears() {
    if (!yearCheckboxes) return;

    const checkboxes = yearCheckboxes.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);

    updateYearSelection();
}

/**
 * Deselect all years
 */
function deselectAllYears() {
    if (!yearCheckboxes) return;

    const checkboxes = yearCheckboxes.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);

    updateYearSelection();
}

/**
 * Update country selection in state
 */
function updateCountrySelection() {
    if (!countryCheckboxes) return;

    const checkboxes = countryCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
    const selected = Array.from(checkboxes).map(cb => cb.value);

    // Update state
    setSelectedCountries(selected);

    // Update count display
    if (countriesSelectedCount) {
        if (selected.length === 0) {
            countriesSelectedCount.textContent = 'No countries selected';
            countriesSelectedCount.style.color = '#ef4444';
        } else {
            countriesSelectedCount.textContent = `${selected.length} ${selected.length === 1 ? 'country' : 'countries'} selected`;
            countriesSelectedCount.style.color = 'var(--text-secondary)';
        }
    }
}

/**
 * Select all countries
 */
function selectAllCountries() {
    if (!countryCheckboxes) return;

    const checkboxes = countryCheckboxes.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        // Only check if visible (not filtered out)
        if (cb.parentElement.style.display !== 'none') {
            cb.checked = true;
        }
    });

    updateCountrySelection();
}

/**
 * Clear all countries
 */
function clearAllCountries() {
    if (!countryCheckboxes) return;

    const checkboxes = countryCheckboxes.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);

    updateCountrySelection();
}

/**
 * Filter countries by search text
 */
function filterCountries() {
    if (!countryCheckboxes || !countryFilterInput) return;

    const filterText = countryFilterInput.value.toLowerCase();
    const labels = countryCheckboxes.querySelectorAll('label');

    labels.forEach(label => {
        const countryCode = label.textContent.toLowerCase();

        if (countryCode.includes(filterText)) {
            label.style.display = '';
        } else {
            label.style.display = 'none';
        }
    });
}

/**
 * Get currently selected countries
 * @returns {Array} Array of country codes
 */
export function getSelectedCountries() {
    if (!countryCheckboxes) return [];

    const checkboxes = countryCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

/**
 * Get currently selected years (all years are auto-selected)
 * @returns {Array} Array of years
 */
export function getSelectedYears() {
    return getYearsFromState();
}

/**
 * Reset selectors to default
 */
export function resetSelectors() {
    // Clear filter
    if (countryFilterInput) {
        countryFilterInput.value = '';
        filterCountries();
    }

    // Select first 3 countries
    if (countryCheckboxes) {
        const checkboxes = countryCheckboxes.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach((cb, index) => {
            cb.checked = index < 3;
        });
        updateCountrySelection();
    }

    // Select all years
    if (yearCheckboxes) {
        const yearCbs = yearCheckboxes.querySelectorAll('input[type="checkbox"]');
        yearCbs.forEach(cb => cb.checked = true);
        updateYearSelection();
    }
}

export default {
    initSelectors,
    populateFromMetadata,
    getSelectedCountries,
    getSelectedYears,
    resetSelectors,
    selectAllCountries,
    clearAllCountries,
    selectAllYears,
    deselectAllYears
};
