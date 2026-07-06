/**
 * "Show the R" panel — attaches a collapsible panel beneath a results surface
 * with (a) the R code reproducing the analysis on the current selection, (b) the
 * estimator in notation with live numbers, and (c) the expected R output built
 * from the on-screen model object. Payloads come from js/analysis/r-code-gen.js.
 *
 * Payloads are also registered in a session cache so the Export tab can bundle
 * every open analysis into a single downloadable .R script.
 *
 * Author: Kevin Schoenholzer
 */

const payloadRegistry = new Map();

/**
 * All payloads generated so far this session (for the .R script export).
 * @returns {Array<{key, title, code, expectedOutput, note}>}
 */
export function getRegisteredPayloads() {
    return [...payloadRegistry.entries()].map(([key, p]) => ({ key, ...p }));
}

/**
 * Attach (or refresh) a Show-the-R panel at the end of a container.
 * @param {HTMLElement} container - element to append the panel to
 * @param {Object} payload - { title, code, notation, expectedOutput, note }
 * @param {String} key - stable identifier (per surface) for refresh + export
 */
export function attachRCodePanel(container, payload, key) {
    if (!container || !payload) return;
    payloadRegistry.set(key, payload);

    let panel = container.querySelector(`:scope > details.r-code-panel[data-rkey="${key}"]`);
    if (!panel) {
        panel = document.createElement('details');
        panel.className = 'r-code-panel';
        panel.dataset.rkey = key;
        container.appendChild(panel);
    }

    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    panel.innerHTML = `
        <summary>Show the R code for this result</summary>
        <div class="r-code-body">
            <div class="r-code-toolbar">
                <span class="r-code-title">${esc(payload.title)} — verified R equivalent</span>
                <button type="button" class="btn btn-secondary r-code-copy">Copy code</button>
            </div>
            <pre class="r-code-block"><code>${esc(payload.code)}</code></pre>
            ${payload.notation ? `<div class="r-code-notation">${payload.notation}</div>` : ''}
            <pre class="r-code-expected"><code>${esc(payload.expectedOutput)}</code></pre>
            ${payload.note ? `<p class="r-code-note">${esc(payload.note)}</p>` : ''}
        </div>`;

    const btn = panel.querySelector('.r-code-copy');
    btn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(payload.code);
            btn.textContent = 'Copied';
            setTimeout(() => { btn.textContent = 'Copy code'; }, 1500);
        } catch (e) {
            console.warn('Clipboard unavailable:', e.message);
            btn.textContent = 'Select & copy manually';
        }
    });
}

export default { attachRCodePanel, getRegisteredPayloads };
