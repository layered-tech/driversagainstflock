import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    createEasVersionClient,
    easAuthenticationHeaders,
} from '../wear-eas-version.mjs';

const project = {
    appId: 'project-id',
    applicationIdentifier: 'com.anonymous.drivefree',
    storeVersion: '2.9.3',
};
const latestData = (code = '346', id = 'current') => ({
    app: {
        byId: {
            latestAppVersionByPlatformAndApplicationIdentifier: {
                id,
                buildVersion: code,
            },
        },
    },
});
const response = (data) => ({ ok: true, json: async () => ({ data }) });

test('reads and reserves the shared Android counter with EAS authentication', async () => {
    const calls = [];
    const replies = [
        latestData(),
        latestData(),
        { appVersion: { createAppVersion: { id: 'reserved' } } },
        latestData('347', 'reserved'),
    ];
    const client = createEasVersionClient(
        project,
        { authorization: 'Bearer fixture' },
        async (url, options) => {
            assert.equal(url, 'https://api.expo.dev/graphql');
            assert.equal(options.redirect, 'error');
            assert.equal(options.headers.authorization, 'Bearer fixture');
            calls.push(JSON.parse(options.body));
            return response(replies.shift());
        },
    );
    const latest = await client.latest();
    await client.reserve(347, latest);
    assert.equal(calls.length, 4);
    assert.deepEqual(calls[0].variables, {
        appId: project.appId,
        applicationIdentifier: project.applicationIdentifier,
        platform: 'ANDROID',
    });
    assert.deepEqual(calls[2].variables.appVersionInput, {
        ...calls[0].variables,
        storeVersion: '2.9.3',
        buildVersion: '347',
    });
});

test('detects another allocation before writing and a conflicting confirmation', async () => {
    let calls = 0;
    const changed = createEasVersionClient(project, {}, async () => {
        calls++;
        return response(latestData('347', 'other'));
    });
    await assert.rejects(
        changed.reserve(347, { id: 'current', code: 346 }),
        /changed during allocation/,
    );
    assert.equal(calls, 1);
    const replies = [
        latestData(),
        { appVersion: { createAppVersion: { id: 'reserved' } } },
        latestData('348', 'other'),
    ];
    const conflict = createEasVersionClient(project, {}, async () =>
        response(replies.shift()),
    );
    await assert.rejects(
        conflict.reserve(347, { id: 'current', code: 346 }),
        /Could not confirm/,
    );
});

test('rejects failed requests and malformed remote codes without leaking server content', async () => {
    for (const fetchRequest of [
        async () => {
            throw new Error('private-token');
        },
        async () => ({ ok: false }),
        async () => ({
            ok: true,
            json: async () => ({ errors: [{ message: 'private-token' }] }),
        }),
    ]) {
        const client = createEasVersionClient(project, {}, fetchRequest);
        await assert.rejects(client.latest(), (error) => {
            assert.match(error.message, /Unable to read/);
            assert.doesNotMatch(error.message, /private-token/);
            return true;
        });
    }
    for (const code of ['0', '-1', '1.2', '0346', 'invalid', '2100000001']) {
        await assert.rejects(
            createEasVersionClient(project, {}, async () =>
                response(latestData(code)),
            ).latest(),
            /valid Android version/,
        );
    }
});

test('mutation failures are not retried or treated as a successful reservation', async () => {
    let calls = 0;
    const client = createEasVersionClient(project, {}, async () => {
        if (++calls === 1) return response(latestData());
        throw new Error('private-token');
    });
    await assert.rejects(
        client.reserve(347, { id: 'current', code: 346 }),
        /Unable to reserve/,
    );
    assert.equal(calls, 2);
});

test('uses EXPO_TOKEN or the existing EAS session without exposing invalid auth data', (t) => {
    const home = mkdtempSync(join(tmpdir(), 'wear-eas-auth-'));
    t.after(() => rmSync(home, { recursive: true, force: true }));
    mkdirSync(join(home, '.expo'));
    assert.throws(() => easAuthenticationHeaders({}, home), /eas login/);
    writeFileSync(
        join(home, '.expo/state.json'),
        JSON.stringify({ auth: { sessionSecret: 'fixture-session' } }),
    );
    assert.deepEqual(easAuthenticationHeaders({}, home), {
        'expo-session': 'fixture-session',
    });
    assert.deepEqual(
        easAuthenticationHeaders({ EXPO_TOKEN: 'fixture-token' }, home),
        { authorization: 'Bearer fixture-token' },
    );
    assert.throws(
        () => easAuthenticationHeaders({ EXPO_LOCAL: '1' }, home),
        /production EAS/,
    );
});
