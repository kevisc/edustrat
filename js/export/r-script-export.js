/**
 * .R script export — bundles every "Show the R" payload generated this session
 * into a single downloadable, runnable replication script.
 *
 * Author: Kevin Schoenholzer
 */

import { getRegisteredPayloads } from '../ui/r-code-panel.js';

/**
 * Download the replication script for the current session.
 * @param {Object} spec - current selection spec (for the header)
 */
export function downloadRScript(spec) {
    const payloads = getRegisteredPayloads();
    if (payloads.length === 0) {
        alert('No analyses to export yet. Visit the analysis tabs first — every "Show the R code" panel the app generates is bundled into this script.');
        return;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const header = [
        '# ==========================================================================',
        '# EduStrat — analysis replication script',
        `# Generated ${stamp}`,
        `# Selection: ${spec.countries.join(', ')} | cycles: ${spec.years.join(', ')}`,
        `# Outcome: ${spec.outcomeVar} | predictor: ${spec.predictorVar} | weights: ${spec.weightType}`,
        '#',
        '# Every estimator below is the R call the application is numerically',
        '# verified against (see VERIFICATION.md in the repository). The "Expected',
        '# output" comments are the numbers the app displayed for this selection.',
        '# Sections are self-contained, so library()/data steps repeat by design.',
        '# ==========================================================================',
        ''
    ].join('\n');

    const body = payloads.map(p => [
        `## ==== ${p.title} ${'='.repeat(Math.max(4, 66 - p.title.length))}`,
        '',
        p.code,
        '',
        p.expectedOutput,
        p.note ? `# Note: ${p.note}` : ''
    ].filter(Boolean).join('\n')).join('\n\n\n');

    const blob = new Blob([header + '\n' + body + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `edustrat-replication-${stamp}.R`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export default { downloadRScript };
