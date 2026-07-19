import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { getContributeAuthProgressPresentation } from '../../contribute/contribute-auth-progress-state.js';

const contributeStartSheetSource = readFileSync(
    new URL('../../contribute/contribute-start-sheet.js', import.meta.url),
    'utf8',
);
const authCallbackHandlerSource = readFileSync(
    new URL('../../root/auth-callback-handler.js', import.meta.url),
    'utf8',
);

function getPresentation(overrides = {}) {
    return getContributeAuthProgressPresentation({
        hasUser: false,
        hasWriteScope: false,
        isAuthenticated: false,
        isLoading: false,
        isSigningIn: false,
        ...overrides,
    });
}

describe('Contribute OpenStreetMap auth progress', () => {
    test('shows real connection stages while signing in', () => {
        const presentation = getPresentation({ isSigningIn: true });

        assert.equal(presentation.mode, 'connecting');
        assert.equal(presentation.title, 'Connecting your account');
        assert.equal(
            presentation.graphicAccessibilityLabel,
            'Connecting the OpenStreetMap account.',
        );
        assert.deepEqual(
            presentation.steps.map(({ status, tone }) => ({ status, tone })),
            [
                { status: 'Connecting', tone: 'active' },
                { status: 'Waiting', tone: 'pending' },
            ],
        );
    });

    test('advances as the account and write scope become available', () => {
        const accountPresentation = getPresentation({
            hasUser: true,
            isAuthenticated: true,
            isSigningIn: true,
        });
        const completedPresentation = getPresentation({
            hasUser: true,
            hasWriteScope: true,
            isAuthenticated: true,
            isSigningIn: true,
        });

        assert.equal(accountPresentation.title, 'Account connected');
        assert.deepEqual(
            accountPresentation.steps.map(({ status, tone }) => ({
                status,
                tone,
            })),
            [
                { status: 'Connected', tone: 'complete' },
                { status: 'Requesting', tone: 'active' },
            ],
        );
        assert.equal(completedPresentation.graphicTone, 'complete');
        assert.equal(
            completedPresentation.graphicAccessibilityLabel,
            'OpenStreetMap account connected with editing access.',
        );
        assert.deepEqual(
            completedPresentation.steps.map(({ status }) => status),
            ['Connected', 'Allowed'],
        );
    });

    test('describes stored-session hydration as an account check', () => {
        const presentation = getPresentation({ isLoading: true });

        assert.equal(presentation.mode, 'restoring');
        assert.equal(presentation.title, 'Checking your account');
        assert.equal(
            presentation.graphicAccessibilityLabel,
            'Checking this device for a saved OpenStreetMap account.',
        );
        assert.equal(presentation.steps[0].status, 'Checking');
        assert.equal(presentation.steps[1].status, 'Waiting');
    });

    test('prefers active sign-in and hides progress after auth settles', () => {
        assert.equal(
            getPresentation({ isLoading: true, isSigningIn: true }).mode,
            'connecting',
        );
        assert.equal(getPresentation(), null);
        assert.equal(
            getPresentation({
                hasUser: true,
                hasWriteScope: true,
                isAuthenticated: true,
            }),
            null,
        );
    });

    test('keeps progress in the existing Contribute start sheet', () => {
        assert.match(
            contributeStartSheetSource,
            /const authProgressIsVisible = isLoading \|\| isSigningIn;/,
        );
        assert.match(
            contributeStartSheetSource,
            /authProgressIsVisible \? \([\s\S]*?<ContributeAuthProgress/,
        );
        assert.match(
            contributeStartSheetSource,
            /enablePanDownToClose=\{!isSigningIn\}/,
        );
        assert.match(
            contributeStartSheetSource,
            /pressBehavior: isSigningIn \? 'none' : 'close'/,
        );
        assert.match(
            contributeStartSheetSource,
            /if \(isSigningIn\) \{\s+return;\s+\}[\s\S]*?closeStartSheet\(\)/,
        );
        assert.doesNotMatch(contributeStartSheetSource, /ActivityIndicator/);
        assert.match(
            contributeStartSheetSource,
            /testID="contribute-sign-in-button"/,
        );
        assert.match(
            contributeStartSheetSource,
            /testID="contribute-start-editing-button"/,
        );
        assert.match(
            contributeStartSheetSource,
            /try \{\s+await ensureWriteAccess\(\);\s+\} catch \(error\) \{[\s\S]*?setSignInError/,
        );
        assert.match(
            contributeStartSheetSource,
            /\{signInError \? \([\s\S]*?\{signInError\}/,
        );
    });

    test('keeps the global callback handler headless', () => {
        assert.doesNotMatch(authCallbackHandlerSource, /react-native/);
        assert.doesNotMatch(authCallbackHandlerSource, /BottomSheet/);
        assert.match(authCallbackHandlerSource, /return null;/);
        assert.match(
            authCallbackHandlerSource,
            /try \{\s+await completeOpenStreetMapLogin\(params\);\s+\} catch \{[\s\S]*?\} finally \{\s+returnToMap\(\);\s+\}/,
        );
        assert.match(authCallbackHandlerSource, /handledCallbacksRef/);
        assert.match(authCallbackHandlerSource, /Linking\.getInitialURL\(\)/);
        assert.match(
            authCallbackHandlerSource,
            /Linking\.addEventListener\('url'/,
        );
        assert.match(authCallbackHandlerSource, /router\.replace\('\/'\)/);
    });
});
