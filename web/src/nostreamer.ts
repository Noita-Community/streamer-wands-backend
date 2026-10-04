// Entry point for the page shown when /streamer/<name> names nobody the server knows.
// The page is static; the only dynamic part is echoing the name that was asked for.

import { streamerNameFromLocation } from './util.ts';

const target = document.querySelector('[data-streamer-name]');
if (target) target.textContent = streamerNameFromLocation();
