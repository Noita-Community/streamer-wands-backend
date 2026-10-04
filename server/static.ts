// Serves the built frontend (Vite's output directory).
//
// Files under /assets/ have a content hash in their name, so they are served as immutable.
// Everything else (the HTML entry points, fonts, images) is served with revalidation: the
// browser keeps a copy but checks it is current, and gets a 304 when it is.

import { createReadStream, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
};

/**
 * Sends the file at a URL path, which must start with a slash, from under `root`.
 * Returns false without responding if there is no such file, so the caller can answer 404 its
 * own way. `status` is for serving a page under a non-200 status, such as the not-found page.
 */
export type SendFile = (
    req: IncomingMessage,
    res: ServerResponse,
    urlPath: string,
    status?: number,
) => boolean;

export function createStatic(root: string): SendFile {
    const base = resolve(root);

    return (req, res, urlPath, status = 200) => {
        // Resolving collapses any ".." in the path; the result must still be inside the root.
        const file = resolve(base, '.' + urlPath);
        if (!file.startsWith(base + sep)) return false;
        const stat = statSync(file, { throwIfNoEntry: false });
        if (!stat?.isFile()) return false;

        const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
        const headers: Record<string, string | number> = {
            'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
            etag,
            'cache-control': urlPath.startsWith('/assets/')
                ? 'public, max-age=31536000, immutable'
                : 'no-cache',
        };

        if (status === 200 && req.headers['if-none-match'] === etag) {
            res.writeHead(304, headers);
            res.end();
            return true;
        }

        headers['content-length'] = stat.size;
        res.writeHead(status, headers);
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
