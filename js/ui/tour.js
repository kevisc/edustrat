/**
 * First-visit guided tour
 * A lightweight, dependency-free walkthrough that dims the page, rings a target
 * element, and shows a stepped tooltip. Shown automatically on first visit
 * (remembered via localStorage) and re-runnable from the "Take a tour" button.
 * Author: Kevin Schoenholzer
 */

const TOUR_KEY = 'edustrat_tour_seen_v1';

// Each step targets an element present on the initial Home view (so the tour is
// robust and does not depend on data being loaded). target === null is centered.
const STEPS = [
    {
        target: null,
        title: 'Welcome to EduStrat',
        text: 'A guided tool for exploring educational inequality with PISA microdata. Here is a 30-second tour of how it works.'
    },
    {
        target: '.tabs',
        title: 'The tabs are the stages of analysis',
        text: 'You move left to right: load data, then Overview, Distribution, Gap Analysis, Regression, Diagnostics, Comparative, and Export.'
    },
    {
        target: '.tab[data-tab="data-config"]',
        title: 'Start with the data',
        text: 'Open the Data tab to choose countries and years — or use the one-click replicate-weight comparison set — then press Load Data.'
    },
    {
        target: null,
        title: 'Flow through the analysis',
        text: 'After loading, the Overview opens automatically. Use the "Continue →" button at the bottom of each tab to step to the next analysis.'
    },
    {
        target: '.tab[data-tab="documentation"]',
        title: 'Methodology & sources',
        text: 'Full methodology, data sources, verification, and how to cite are under Docs. You can replay this tour any time from the home page.'
    }
];

let idx = 0;
let dom = null;

function buildDom() {
    if (dom) return dom;
    const backdrop = document.createElement('div');
    backdrop.className = 'tour-backdrop';

    const ring = document.createElement('div');
    ring.className = 'tour-ring';

    const card = document.createElement('div');
    card.className = 'tour-card';
    card.innerHTML = `
        <div class="tour-step-count"></div>
        <div class="tour-title"></div>
        <div class="tour-text"></div>
        <div class="tour-actions">
            <button type="button" class="tour-skip">Skip</button>
            <div class="tour-nav">
                <button type="button" class="btn btn-secondary tour-back">Back</button>
                <button type="button" class="btn btn-primary tour-next">Next</button>
            </div>
        </div>
    `;

    backdrop.appendChild(ring);
    document.body.appendChild(backdrop);
    document.body.appendChild(card);

    card.querySelector('.tour-skip').addEventListener('click', endTour);
    backdrop.addEventListener('click', endTour);
    card.querySelector('.tour-back').addEventListener('click', () => go(idx - 1));
    card.querySelector('.tour-next').addEventListener('click', () => {
        if (idx >= STEPS.length - 1) endTour();
        else go(idx + 1);
    });

    dom = { backdrop, ring, card };
    return dom;
}

function go(i) {
    idx = Math.max(0, Math.min(STEPS.length - 1, i));
    render();
}

function render() {
    const { backdrop, ring, card } = buildDom();
    const step = STEPS[idx];
    backdrop.style.display = 'block';
    card.style.display = 'block';

    card.querySelector('.tour-step-count').textContent = `Step ${idx + 1} of ${STEPS.length}`;
    card.querySelector('.tour-title').textContent = step.title;
    card.querySelector('.tour-text').textContent = step.text;
    card.querySelector('.tour-back').style.visibility = idx === 0 ? 'hidden' : 'visible';
    card.querySelector('.tour-next').textContent = idx === STEPS.length - 1 ? 'Finish' : 'Next';

    const target = step.target ? document.querySelector(step.target) : null;
    if (target) {
        const r = target.getBoundingClientRect();
        const pad = 6;
        ring.style.display = 'block';
        ring.style.top = `${r.top - pad}px`;
        ring.style.left = `${r.left - pad}px`;
        ring.style.width = `${r.width + pad * 2}px`;
        ring.style.height = `${r.height + pad * 2}px`;
        positionCard(card, r);
    } else {
        ring.style.display = 'none';
        // centre the card
        card.style.top = '50%';
        card.style.left = '50%';
        card.style.transform = 'translate(-50%, -50%)';
    }
}

function positionCard(card, r) {
    card.style.transform = 'none';
    const cardW = Math.min(360, window.innerWidth * 0.92);
    const margin = 12;
    // Prefer below the target; flip above if not enough room.
    const below = r.bottom + margin;
    const cardH = card.offsetHeight || 180;
    let top = (below + cardH < window.innerHeight) ? below : Math.max(margin, r.top - margin - cardH);
    let left = r.left + r.width / 2 - cardW / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin));
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
}

function endTour() {
    if (dom) {
        dom.backdrop.style.display = 'none';
        dom.card.style.display = 'none';
    }
    try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { /* ignore */ }
    window.removeEventListener('resize', onResize);
}

function onResize() { if (dom && dom.card.style.display === 'block') render(); }

/** Start (or restart) the tour from the beginning. */
export function startTour() {
    idx = 0;
    buildDom();
    window.addEventListener('resize', onResize);
    render();
}

/** Start the tour only if the visitor has not seen it before. */
export function maybeStartTour() {
    let seen = false;
    try { seen = !!localStorage.getItem(TOUR_KEY); } catch (e) { /* ignore */ }
    if (!seen) setTimeout(startTour, 600);
}

export default { startTour, maybeStartTour };
