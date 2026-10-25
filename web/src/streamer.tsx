// Entry point for the viewer page, /streamer/<name>.

import { render } from 'preact';

import type { StreamerPageData } from '../../server/page-data.ts';
import { App } from './App.tsx';
import { readPageData } from './page-data.ts';

render(<App page={readPageData<StreamerPageData>()} />, document.getElementById('app')!);
