import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
    getE2EAndroidAutoCommandFromURL,
    getE2ECarPlayCommandFromURL,
    getE2EMockFlagsFromURL,
    isE2ELiveGpsDriveResetURL,
} from '../../root/e2e-map-api-mock-url.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
function redirect(environment, path) {
    const module = { exports: {} };
    const source = transformSync(
        readFileSync(
            new URL('../../../app/+native-intent.js', import.meta.url),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [
                require.resolve('@babel/plugin-transform-modules-commonjs'),
            ],
        },
    ).code;
    new Function('require', 'module', 'exports', source)(
        (name) =>
            name.endsWith('/config')
                ? { APP_ENVIRONMENT: environment }
                : {
                      getE2EAndroidAutoCommandFromURL,
                      getE2ECarPlayCommandFromURL,
                      isE2ELiveGpsDriveResetURL,
                  },
        module,
        module.exports,
    );
    return module.exports.redirectSystemPath({ path });
}

test('Android fixture commands preserve live API mode and normalize only E2E navigation links', () => {
    for (const command of [
        'seed',
        'state',
        'route-render',
        'reset',
        'locations&locations=work',
        'search&query=Walmart%20Delafield',
    ]) {
        const url = `driversagainstflock://e2e-android-auto?command=${command}`;
        assert.equal(
            getE2EAndroidAutoCommandFromURL(url).requestType,
            'android-auto',
        );
        assert.equal(getE2EMockFlagsFromURL(url).mocksAreEnabled, false);
        assert.equal(redirect('e2e', url), '/');
        for (const environment of ['development', 'production'])
            assert.equal(redirect(environment, url), url);
    }
});

test('Android fixture URLs reject unknown actions, locations, queries and schemes', () => {
    for (const url of [
        'https://example.com/e2e-android-auto?command=seed',
        'driversagainstflock://e2e-android-auto?command=execute',
        'driversagainstflock://e2e-android-auto?command=locations&locations=other',
        'driversagainstflock://e2e-android-auto?command=search&query=other',
        'driversagainstflock://e2e-android-auto?command=search',
        'driversagainstflock://other?command=seed',
    ])
        assert.equal(getE2EAndroidAutoCommandFromURL(url), null);
});
