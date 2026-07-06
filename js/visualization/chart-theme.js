/**
 * Shared chart theme — single source of truth for every Plotly chart.
 *
 * Light theme matching the page's restrained slate design tokens, with ONE
 * colorblind-validated categorical palette used consistently (series colors
 * follow the entity — country slot order is fixed, never re-cycled per chart)
 * and a reserved status palette for pass/caution/concern semantics.
 *
 * The categorical palette was validated with the six-check palette validator
 * against this app's white chart surface: lightness band PASS, chroma PASS,
 * worst adjacent CVD ΔE 24.2 (target ≥ 12) PASS. Three slots sit below 3:1
 * contrast on white; the mitigation (visible legends, hover labels, adjacent
 * results tables) is part of every chart here.
 *
 * Author: Kevin Schoenholzer
 */

// Categorical palette — fixed slot order (the ordering is the CVD-safety
// mechanism; do not re-sort or cycle).
export const CHART_COLORS = [
    '#2a78d6', // blue
    '#1baf7a', // aqua
    '#eda100', // yellow
    '#008300', // green
    '#4a3aa7', // violet
    '#e34948', // red
    '#e87ba4', // magenta
    '#eb6834'  // orange
];

// Status palette — reserved for state (pass/caution/concern), never for series.
export const STATUS = {
    good: '#0ca30c',
    warning: '#fab219',
    serious: '#ec835a',
    critical: '#d03b3b'
};

// Ink & chrome, mirroring the page's CSS design tokens.
export const INK = {
    primary: '#1c2430',
    secondary: '#55606f',
    muted: '#8a93a1',
    grid: '#e4e7ec',
    axis: '#cfd4dc',
    reference: '#8a93a1'  // reference/annotation lines (e.g. 2015 mode change)
};

/** Stable series color by slot index (wraps after 8 — prefer ≤ 8 series). */
export function seriesColor(i) {
    return CHART_COLORS[i % CHART_COLORS.length];
}

function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, override) {
    const out = { ...base };
    for (const k of Object.keys(override || {})) {
        out[k] = (isPlainObject(base[k]) && isPlainObject(override[k]))
            ? deepMerge(base[k], override[k])
            : override[k];
    }
    return out;
}

const AXIS = {
    gridcolor: INK.grid,
    linecolor: INK.axis,
    zerolinecolor: INK.grid,
    tickcolor: INK.axis,
    tickfont: { color: INK.secondary, size: 11 },
    title: { font: { color: INK.secondary, size: 12 } },
    automargin: true
};

/**
 * Base Plotly layout for the light theme. Charts spread their specifics over it:
 *   const layout = baseLayout({ title: {...}, xaxis: { title: {...} } });
 * Nested objects (axes, legend, title) merge rather than replace.
 * @param {Object} overrides - chart-specific layout
 * @returns {Object} merged Plotly layout
 */
export function baseLayout(overrides = {}) {
    const base = {
        paper_bgcolor: 'rgba(0,0,0,0)',   // the CSS card provides the surface
        plot_bgcolor: 'rgba(0,0,0,0)',
        colorway: CHART_COLORS,
        font: { family: "'Inter', system-ui, sans-serif", color: INK.primary, size: 12 },
        title: { font: { color: INK.primary, size: 15 } },
        xaxis: AXIS,
        yaxis: AXIS,
        legend: {
            bgcolor: 'rgba(255,255,255,0.9)',
            bordercolor: INK.grid,
            borderwidth: 1,
            font: { size: 11, color: INK.secondary },
            itemsizing: 'constant'
        },
        hoverlabel: {
            bgcolor: '#ffffff',
            bordercolor: INK.axis,
            font: { color: INK.primary, size: 12 }
        },
        margin: { t: 56, r: 24, b: 56, l: 64 }
    };
    return deepMerge(base, overrides);
}

/** Shared Plotly config (modebar etc.). */
export const BASE_CONFIG = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
};

export default { CHART_COLORS, STATUS, INK, seriesColor, baseLayout, BASE_CONFIG };
