import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('reports render failures while preserving the Expo Router recovery UI', () => {
    const error = new Error('Scorecard render failed');
    const retry = () => {};
    const recordedErrors = [];
    const module = { exports: {} };
    const RouterErrorBoundary = () => {};
    const code = require('@babel/core').transformSync(
        readFileSync(
            new URL(
                '../../root/crash-reporting-error-boundary.js',
                import.meta.url,
            ),
            'utf8',
        ),
        {
            babelrc: false,
            configFile: false,
            plugins: [
                require('@babel/plugin-transform-modules-commonjs'),
                [
                    require('@babel/plugin-transform-react-jsx'),
                    { runtime: 'automatic' },
                ],
            ],
        },
    ).code;
    const modules = {
        'expo-router': { ErrorBoundary: RouterErrorBoundary },
        react: { useEffect: (callback) => callback() },
        'react/jsx-runtime': {
            jsx: (component, props) => ({ component, props }),
        },
        '../../lib/crashlytics': {
            recordCrashlyticsError: (value) => recordedErrors.push(value),
        },
    };
    new Function('require', 'module', 'exports', code)(
        (name) => {
            assert.ok(modules[name], `Unexpected import: ${name}`);
            return modules[name];
        },
        module,
        module.exports,
    );
    const output = module.exports.CrashReportingErrorBoundary({ error, retry });
    assert.deepEqual(recordedErrors, [error]);
    assert.equal(output.component, RouterErrorBoundary);
    assert.equal(output.props.error, error);
    assert.equal(output.props.retry, retry);
    const root = readFileSync(
        new URL('../../../app/_layout.js', import.meta.url),
        'utf8',
    );
    assert.match(root, /CrashReportingErrorBoundary as ErrorBoundary/);
});
