// Entry point for the viewer page, /streamer/<name>.

import { render } from 'preact';

import { App } from './App.tsx';
import { streamerNameFromLocation } from './util.ts';

render(<App name={streamerNameFromLocation()} />, document.getElementById('app')!);
