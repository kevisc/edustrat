/**
 * Browser smoke-test — confirms EduStrat runs correctly in a real browser engine.
 *
 * Unlike the Node harnesses (which import the modules directly), this loads the
 * deployed page in headless Chrome, then:
 *   1. checks the page loads with no console/page errors;
 *   2. confirms the weight selector exposes exactly the three point-weight options;
 *   3. runs the actual analysis + visualization modules inside the browser against a
 *      real chunk, and asserts the rendered regression table reports BRR
 *      (replicate-weight) standard errors when replicate weights are present.
 *
 * It serves the repo over a throwaway static server (no build step) and drives the
 * system Chrome via puppeteer-core, so no browser download is required.
 *
 * Requirements: `npm install` (brings puppeteer-core) and a local Chrome/Chromium.
 * Set CHROME_PATH to override the executable location.
 *
 * Usage:  node run-browser-check.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');           // edustrat/
const PORT = 8137;
const CHROME = process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const file = path.join(ROOT, rel || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(PORT, r));
const BASE = `http://localhost:${PORT}`;

let ok = true;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#weight-type', { timeout: 15000 });

  const opts = await page.$$eval('#weight-type option', els => els.map(e => e.value));
  const optsOk = JSON.stringify(opts) === JSON.stringify(['student', 'senate', 'none']);
  console.log(`[${optsOk ? 'PASS' : 'FAIL'}] weight options = ${JSON.stringify(opts)}`);
  ok &&= optsOk;

  const r = await page.evaluate(async (base) => {
    const reg = await import(`${base}/js/analysis/regression.js`);
    const viz = await import(`${base}/js/visualization/regression-viz.js`);
    const chunk = await (await fetch(`${base}/data/country-year/FIN_2018.json`)).json();
    const m = reg.runPooledOLS(chunk.students, 'math', 'escs', [], 'student');
    const html = viz.createModelTable(m);
    return { seMethod: m.seMethod, brrSE: m.standardErrorsBRR ? m.standardErrorsBRR[1] : null,
             noteShown: /Standard errors: BRR \(80 Fay/.test(html),
             brrInTable: new RegExp(`<td>${(m.standardErrorsBRR[1]).toFixed(3)}</td>`).test(html) };
  }, BASE);
  const brrOk = r.seMethod.startsWith('BRR') && r.noteShown && r.brrInTable;
  console.log(`[${brrOk ? 'PASS' : 'FAIL'}] in-browser BRR: ${r.seMethod}, SE=${r.brrSE.toFixed(3)}, note+table rendered=${r.noteShown && r.brrInTable}`);
  ok &&= brrOk;

  const errOk = errors.length === 0;
  console.log(`[${errOk ? 'PASS' : 'FAIL'}] console/page errors: ${errors.length ? JSON.stringify(errors.slice(0, 5)) : 'none'}`);
  ok &&= errOk;
} finally {
  await browser.close();
  server.close();
}
console.log(ok ? '\nBrowser check passed.' : '\nBrowser check FAILED.');
process.exit(ok ? 0 : 1);
