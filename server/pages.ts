// Serves the HTML pages, with the data each one starts from written into it.
//
// A page's HTML file contains the comment <!-- page-data -->. It is replaced, per request, by
//
//   <script type="application/json" id="page-data">{ ... }</script>
//
// The browser does not run a script of that type; the page's own code reads its text and parses
// it (web/src/page-data.ts). The page therefore has its data as soon as it loads, with no
// request that could fail.

import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join } from 'node:path';

const PLACEHOLDER = '<!-- page-data -->';

/**
 * JSON that is safe inside a <script> element.
 *
 * The HTML parser ends a script element at the first "</script" it finds, without regard for
 * JSON strings, so data containing that text would otherwise end the element early and have
 * the rest read as HTML. Writing every "<" as its JSON escape leaves nothing for the HTML
 * parser to find, and JSON.parse turns it back.
 */
export function jsonForScript(data: unknown): string {
    return JSON.stringify(data).replaceAll('<', '\\u003c');
}

export type Pages = ReturnType<typeof createPages>;

/** `webDir` is the built frontend; the HTML files are the ones in its pages/ directory. */
export function createPages(webDir: string) {
    return {
        /** Send the page `name`.html with `data` written into it. */
        send(res: ServerResponse, name: string, data: unknown, status = 200): void {
            // Read per request: the files are small, and a rebuilt frontend is picked up at once.
            const html = readFileSync(join(webDir, 'pages', `${name}.html`), 'utf8');
            const script = `<script type="application/json" id="page-data">${jsonForScript(data)}</script>`;
            // A function, so that "$" in the data is not read as a replacement pattern.
            const body = html.replace(PLACEHOLDER, () => script);
            res.writeHead(status, {
                'content-type': 'text/html; charset=utf-8',
                'content-length': Buffer.byteLength(body),
                'cache-control': 'no-store',
            });
            res.end(body);
        },
    };
}
