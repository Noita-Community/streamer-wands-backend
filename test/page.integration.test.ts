// The viewer page, in a real browser, against a real server. These cover what only exists once
// everything is running together: the page following a streamer's mod over the websocket, and
// the choices it makes from what arrives. They assert on what the page says, not how it looks.
//
// Needs Playwright's Chromium: pnpm exec playwright install chromium

import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type Page } from 'playwright';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { createApp } from '../server/app.ts';
import { Secret } from '../server/config.ts';
import { openDb } from '../server/db.ts';
import { silentLogger } from '../server/log.ts';
import { signTicket } from '../server/ticket.ts';

const wire = (name: string): string =>
    readFileSync(new URL(`./fixtures/wire-${name}.json`, import.meta.url), 'utf8');

const SECRET = new Secret('test-secret');
/** The mod version the server under test hands out; the "current" fixtures report the same. */
const MOD_VERSION = '1.2.10';

describe('viewer page', () => {
    const db = openDb(':memory:');
    const app = createApp({
        db,
        jwtSecret: SECRET,
        log: silentLogger,
        modVersion: MOD_VERSION,
        webDir: new URL('../dist/web', import.meta.url).pathname,
    });
    let base = '';
    let browser: Browser;
    const mods: WebSocket[] = [];

    beforeAll(async () => {
        await build({ logLevel: 'silent' });
        await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
        base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
        browser = await chromium.launch();
    }, 60_000);

    afterAll(async () => {
        for (const mod of mods) mod.close();
        await browser?.close();
        await app.close();
        db.close();
    });

    /** A streamer's mod, connected and ready to send. Each test uses its own streamer. */
    async function connectMod(displayName: string): Promise<{ send: (fixture: string) => void }> {
        const ticket = signTicket({ id: `id-${displayName}`, displayName }, SECRET);
        const socket = new WebSocket(`ws://${base}/${ticket}`);
        mods.push(socket);
        await new Promise((resolve, reject) => {
            socket.once('open', resolve);
            socket.once('error', reject);
        });
        return { send: (fixture) => socket.send(wire(fixture)) };
    }

    async function open(name: string): Promise<Page> {
        const page = await browser.newPage();
        page.on('pageerror', (err) => {
            throw err;
        });
        await page.goto(`http://${base}/streamer/${name}`);
        return page;
    }

    /** The on/off switch with this label, as the checkbox behind it. */
    const toggle = (page: Page, label: string) =>
        page.locator('.switch-group', { hasText: label }).locator('input[type=checkbox]');

    /** Click a switch. The checkbox itself is hidden behind a styled slider. */
    const flip = (page: Page, label: string) =>
        page.locator('.switch-group', { hasText: label }).locator('label').click();

    const health = (page: Page) => page.locator('.health');

    it('shows what the streamer last sent, and names them in the title', async () => {
        const mod = await connectMod('Alice');
        mod.send('current-full');
        const page = await open('alice');
        // 5.34 of 6.4 game units, at 25 hit points each.
        await expect.poll(() => health(page).textContent()).toContain('133.5 / 160');
        expect(await page.title()).toBe('Alice wands');
        await page.close();
    });

    it('follows the streamer as their mod sends new snapshots', async () => {
        const mod = await connectMod('Bob');
        mod.send('current-minimal');
        const page = await open('Bob');
        await expect.poll(() => health(page).textContent()).toContain('100 / 100');

        mod.send('current-full');
        await expect.poll(() => health(page).textContent()).toContain('133.5 / 160');
        await page.close();
    });

    it('holds what is on screen while auto refresh is off, then catches up', async () => {
        const mod = await connectMod('Carol');
        mod.send('current-minimal');
        const page = await open('Carol');
        await expect.poll(() => health(page).textContent()).toContain('100 / 100');

        await flip(page, 'Auto Refresh Data');
        mod.send('current-full');
        // Long enough for the snapshot to have arrived and been ignored.
        await page.waitForTimeout(400);
        expect(await health(page).textContent()).toContain('100 / 100');

        await flip(page, 'Auto Refresh Data');
        await expect.poll(() => health(page).textContent()).toContain('133.5 / 160');
        await page.close();
    });

    it('starts on the Apotheosis data when the run has the mod, and lets the viewer change it', async () => {
        const mod = await connectMod('Dave');
        mod.send('current-apotheosis');
        const page = await open('Dave');
        await expect.poll(() => toggle(page, 'Show Apotheosis Content').isChecked()).toBe(true);
        // Creature shifts exist only in Apotheosis; the fixture has had two.
        await expect.poll(() => toggle(page, 'Show Creature Shifts [2]').count()).toBe(1);

        await flip(page, 'Show Apotheosis Content');
        await expect.poll(() => toggle(page, 'Show Creature Shifts').count()).toBe(0);

        // A later snapshot does not undo the viewer's choice.
        mod.send('current-apotheosis');
        await page.waitForTimeout(300);
        expect(await toggle(page, 'Show Apotheosis Content').isChecked()).toBe(false);
        await page.close();
    });

    it('starts on the base game data otherwise', async () => {
        const mod = await connectMod('Erin');
        mod.send('current-full');
        const page = await open('Erin');
        await expect.poll(() => health(page).count()).toBe(1);
        expect(await toggle(page, 'Show Apotheosis Content').isChecked()).toBe(false);
        expect(await toggle(page, 'Show Creature Shifts').count()).toBe(0);
        await page.close();
    });

    it('warns when the streamer’s mod is not the version the server hands out', async () => {
        const mod = await connectMod('Frank');
        // A mod from before versions were reported.
        mod.send('middle-generation');
        const page = await open('Frank');
        await expect
            .poll(() => page.locator('.outdated').textContent())
            .toContain('Streamer is running outdated version: no version found');
        expect(await page.locator('.outdated').textContent()).toContain(
            `please update to version: ${MOD_VERSION}`,
        );

        mod.send('current-full');
        await expect.poll(() => page.locator('.outdated').count()).toBe(0);
        await page.close();
    });

    it('says so when a streamer has logged in but never sent anything', async () => {
        db.ensureStreamer('id-Grace', 'Grace');
        const page = await open('grace');
        await expect
            .poll(() => page.locator('.outdated').textContent())
            .toContain('Nothing has been received from Grace yet.');
        await page.close();
    });

    it('answers 404 for a name nobody has, and shows the name', async () => {
        const page = await browser.newPage();
        const response = await page.goto(`http://${base}/streamer/nobody_by_this_name`);
        expect(response?.status()).toBe(404);
        await expect
            .poll(() => page.locator('h1').first().textContent())
            .toContain('Streamer "nobody_by_this_name" Not Found');
        await page.close();
    });

    it('counts what a search finds in a progress table', async () => {
        const mod = await connectMod('Heidi');
        mod.send('current-full');
        const page = await open('Heidi');
        await flip(page, 'Show Progress Table');

        const spells = page.locator('.prog', { hasText: 'Spells -' });
        await spells.locator('input.search').fill('bomb');

        // Every spell with "bomb" in its name or id, counted from the same data the page uses.
        const icons = JSON.parse(
            readFileSync(new URL('../web/data/icons.json', import.meta.url), 'utf8'),
        ) as { spells: { id: string; name: string }[] };
        const expected = icons.spells.filter((spell) =>
            `${spell.id} ${spell.name}`.toLowerCase().includes('bomb'),
        ).length;
        expect(expected).toBeGreaterThan(0);
        await expect
            .poll(() => spells.locator('.stats').textContent())
            .toContain(`(${expected} found)`);

        await spells.locator('input.search').fill('');
        await expect.poll(() => spells.locator('.stats').textContent()).not.toContain('found');
        await page.close();
    });

    it('counts unlocked progress out of what the table lists', async () => {
        const mod = await connectMod('Ivan');
        // The fixture has unlocked two perks, two spells and two enemies.
        mod.send('current-full');
        const page = await open('Ivan');
        await flip(page, 'Show Progress Table');
        for (const table of ['Perks', 'Spells', 'Enemies']) {
            await expect
                .poll(() =>
                    page
                        .locator('.prog', { hasText: `${table} -` })
                        .locator('.stats')
                        .textContent(),
                )
                .toMatch(/2\/\d+/);
        }
        await page.close();
    });
});
