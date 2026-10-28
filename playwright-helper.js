// Shared Playwright setup: iPhone-ish viewport against the local web build.
const { chromium } = require('playwright');
const BASE = process.env.BASE ?? 'http://localhost:8081';

async function launch() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { browser, page, errors };
}
const go = (page, path) => page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
const shot = (page, name) => page.screenshot({ path: `shots/${name}.png` });
const reportErrors = (errors) => {
  const real = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  console.log(real.length === 0 ? 'PASS: no page errors' : 'FAIL: page errors:\n' + real.join('\n'));
};
module.exports = { launch, go, shot, reportErrors };
