// Entry point for the front page, /. Logged out, it says how to log in. Logged in, it offers
// the streamer their copy of the mod.

import { render } from 'preact';

import type { IndexPageData } from '../../server/page-data.ts';
import { readPageData } from './page-data.ts';

type User = NonNullable<IndexPageData['user']>;

function Menu({ user }: { user: User | null }) {
    return (
        <ul class="links">
            <li>
                <a href="/">home</a>
            </li>
            {user ? (
                <>
                    <li>
                        <a href="/auth/logout">logout</a>
                    </li>
                    <li>
                        <a
                            href={`/streamer/${encodeURIComponent(user.login ?? user.display_name)}`}
                        >
                            stream link
                        </a>
                    </li>
                </>
            ) : (
                <li>
                    <a href="/auth/login">login</a>
                </li>
            )}
        </ul>
    );
}

function LoggedOut() {
    return (
        <div class="prose instructions">
            <h1 class="instructions">Instructions</h1>
            <p>
                Log in via Twitch to get your customized mod zip file. Logging in asks Twitch for no
                permissions; it is only used to identify which streamer's wands page to update as
                you play the game.
            </p>
        </div>
    );
}

function Download({ user, versions }: { user: User; versions: string[] }) {
    return (
        <>
            <div class="prose instructions">
                <h1>Instructions</h1>
                <p>
                    Download your customized mod zip bundle below. The bundle marked "latest" is
                    recommended, older versions may not work correctly but are provided for your
                    convenience. <strong>Do not share this zip file with others!</strong> The mod
                    bundle includes credentials that identify which streamer page to update. If
                    another user installs the same zip bundle, they will be sending wand updates to{' '}
                    <em>your</em> stream page!
                </p>
                <p>
                    Progress for Spells and Perks is fully tracked by streamer-wands and requires no
                    additional steps by you. Enemy progress cannot be obtained by the mod natively,
                    so the data shown to viewers on the website will only include enemies that have
                    been killed <em>for the first time</em> since you installed the mod. You can
                    optionally upload your stats file below to download a bundle that includes all
                    of your enemy progress.
                </p>
            </div>
            <div class="prose releases">
                <h1>Customized mod bundle for {user.display_name}:</h1>
                <form
                    id="download-form"
                    method="post"
                    action="/release"
                    enctype="multipart/form-data"
                >
                    <div class="row relative">
                        <label class="w-half" for="select-version">
                            Version
                        </label>
                        <select class="w-half" id="select-version" name="version" required>
                            {versions.map((version, i) => (
                                <option value={version} selected={i === 0}>
                                    {version}
                                    {i === 0 ? ' (latest)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div class="row">
                        <label class="w-half" for="stats-file">
                            Stats file (optional)
                        </label>
                        <input
                            class="w-half"
                            id="stats-file"
                            name="statsfile"
                            type="file"
                            accept=".salakieli"
                        />
                    </div>
                    <small class="row">The stats file (on Windows, Steam) is located at:</small>
                    <small class="row">
                        <code class="click-to-copy">
                            %USERPROFILE%\AppData\LocalLow\Nolla_Games_Noita\save00\stats\_stats.salakieli
                        </code>
                    </small>
                    <div class="row">
                        <button type="submit">Download</button>
                    </div>
                </form>
            </div>
        </>
    );
}

const { user, versions } = readPageData<IndexPageData>();

render(<Menu user={user} />, document.getElementById('menu')!);
render(
    user ? <Download user={user} versions={versions} /> : <LoggedOut />,
    document.getElementById('app')!,
);
