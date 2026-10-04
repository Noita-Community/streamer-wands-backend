// Capture the rendered DOM of a running site's pages, for comparing against what another
// version of the site renders for the same streamer.
//
// Run from the project root:
//   node scripts/dump-reference.mjs [base-url] [streamer-name]
//
// Requires the playwright dev dependency and its Chromium build:
//   pnpm exec playwright install chromium
//
// Output goes to reference/:
//   <page>.html                rendered DOM after the page's scripts have run, default toggles
//   <page>.all-switches.html   streamer page only: rendered DOM with every toggle turned on
//   <page>.source.html         the response body as served, before scripts
//
// To capture a logged-in page, pass a session cookie:
//   COOKIE='connect.sid=...' node scripts/dump-reference.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'https://onlywands.com').replace(/\/$/, '');
const streamer = process.argv[3] ?? 'DunkOrSlam';
const outDir = resolve('reference');

const pages = [
    {
        name: `streamer-${streamer}`,
        path: `/streamer/${streamer}`,
        waitFor: '#app, .wand-display',
        switches: true,
    },
    { name: 'nostreamer', path: '/streamer/no_such_streamer_zz_reference' },
    { name: process.env.COOKIE ? 'index-logged-in' : 'index-logged-out', path: '/' },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });

if (process.env.COOKIE) {
    const { hostname } = new URL(base);
    const cookies = process.env.COOKIE.split(';').map((pair) => {
        const at = pair.indexOf('=');
        return {
            name: pair.slice(0, at).trim(),
            value: pair.slice(at + 1).trim(),
            domain: hostname,
            path: '/',
        };
    });
    await context.addCookies(cookies);
}

const snapshotDom = (page) =>
    page.evaluate(() => '<!doctype html>\n' + document.documentElement.outerHTML);

/**
 * Most sections of the viewer page are hidden behind toggles. Turn every unchecked one on,
 * repeating because enabling a section can reveal further toggles inside it.
 */
async function enableAllSwitches(page) {
    const labels = [];
    for (let round = 0; round < 6; round++) {
        const turnedOn = await page.evaluate(() => {
            const out = [];
            for (const input of document.querySelectorAll('.switch-group input[type=checkbox]')) {
                if (input.checked || input.disabled) continue;
                input.click();
                out.push(input.closest('.switch-group')?.textContent?.trim() ?? '?');
            }
            return out;
        });
        if (turnedOn.length === 0) break;
        labels.push(...turnedOn);
        await page.waitForTimeout(500);
    }
    return labels;
}

for (const { name, path, waitFor, switches } of pages) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    const response = await page.goto(base + path, { waitUntil: 'networkidle' });
    const source = (await response?.text()) ?? '';
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 10_000 }).catch(() => {});
    // Let the client-side render and any first websocket message settle.
    await page.waitForTimeout(1500);

    const dom = await snapshotDom(page);

    await writeFile(resolve(outDir, `${name}.source.html`), source);
    await writeFile(resolve(outDir, `${name}.html`), dom);
    console.log(
        `${response?.status()} ${path} -> reference/${name}.html (${dom.length} chars rendered, ${source.length} served)` +
            (errors.length ? `, ${errors.length} page errors: ${errors[0]}` : ''),
    );

    if (switches) {
        const labels = await enableAllSwitches(page);
        const expanded = await snapshotDom(page);
        await writeFile(resolve(outDir, `${name}.all-switches.html`), expanded);
        console.log(
            `    -> reference/${name}.all-switches.html (${expanded.length} chars) after enabling ${labels.length} switches:`,
        );
        for (const label of labels) console.log(`       ${label}`);
    }
    await page.close();
}

await browser.close();
