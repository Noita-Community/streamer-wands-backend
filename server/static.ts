// Serves the frontend's static files: everything under static/ in the built frontend, at
// /static/ on the site.
//
// The Cache-Control headers are written for a caching proxy as much as for browsers. In
// production nginx sits in front and keeps its own copy of whatever these headers allow (see
// ops/nginx.conf.example), so most requests for these files never reach this server.
//
// Files under /static/assets/ have a content hash in their name, so they are served as
// immutable. The rest (fonts, images) keep their names when they change, so they are cacheable
// for an hour: long enough to be worth caching, short enough that a change shows up soon.

import { createReadStream, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
};

/**
 * Sends the file at a URL path beginning /static/. Returns false without responding if there
 * is no such file, so the caller can answer 404 its own way.
 */
export type SendFile = (req: IncomingMessage, res: ServerResponse, urlPath: string) => boolean;

/** `webDir` is the built frontend; the files served are the ones in its static/ directory. */
export function createStatic(webDir: string): SendFile {
    const base = resolve(webDir, 'static');

    return (req, res, urlPath) => {
        if (!urlPath.startsWith('/static/')) return false;
        // A path containing ".." can resolve to somewhere outside the base. Resolving applies
        // those segments, so that comparing prefixes afterwards reliably catches it.
        const file = resolve(base, urlPath.slice('/static/'.length));
        if (!file.startsWith(base + sep)) return false;
        const stat = statSync(file, { throwIfNoEntry: false });
        if (!stat?.isFile()) return false;

        const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
        const headers: Record<string, string | number> = {
            'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
            etag,
            'cache-control': urlPath.startsWith('/static/assets/')
                ? 'public, max-age=31536000, immutable'
                : 'public, max-age=3600',
        };

        if (req.headers['if-none-match'] === etag) {
            res.writeHead(304, headers);
            res.end();
            return true;
        }

        headers['content-length'] = stat.size;
        res.writeHead(200, headers);
        if (req.method === 'HEAD') {
            res.end();
            return true;
        }
        createReadStream(file)
            .on('error', () => res.destroy())
            .pipe(res);
        return true;
    };
}
