import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export function easAuthenticationHeaders(
    environment,
    homeDirectory = homedir(),
) {
    if (environment.EXPO_STAGING || environment.EXPO_LOCAL) {
        throw new Error('Wear versioning requires the production EAS service.');
    }
    if (environment.EXPO_TOKEN) {
        return { authorization: `Bearer ${environment.EXPO_TOKEN}` };
    }
    try {
        const session = JSON.parse(
            readFileSync(resolve(homeDirectory, '.expo/state.json'), 'utf8'),
        ).auth?.sessionSecret;
        if (typeof session === 'string' && session)
            return { 'expo-session': session };
    } catch {
        // Never include authentication file contents in errors.
    }
    throw new Error(
        'Log in with eas login or set EXPO_TOKEN before building the watch.',
    );
}

export function createEasVersionClient(project, headers, fetchRequest = fetch) {
    const variables = {
        appId: project.appId,
        applicationIdentifier: project.applicationIdentifier,
        platform: 'ANDROID',
    };
    async function request(query, variables, operation) {
        try {
            const response = await fetchRequest(
                'https://api.expo.dev/graphql',
                {
                    method: 'POST',
                    redirect: 'error',
                    headers: { ...headers, 'content-type': 'application/json' },
                    body: JSON.stringify({ query, variables }),
                    signal: AbortSignal.timeout(30_000),
                },
            );
            if (!response.ok) throw new Error();
            const result = await response.json();
            if (result.errors?.length || !result.data) throw new Error();
            return result.data;
        } catch {
            throw new Error(
                `Unable to ${operation} the EAS Android version. Check your EAS login and connection; no watch build was started.`,
            );
        }
    }
    async function latest() {
        const data = await request(
            `query LatestAppVersion($appId: String!, $platform: AppPlatform!, $applicationIdentifier: String!) {
            app { byId(appId: $appId) { latestAppVersionByPlatformAndApplicationIdentifier(platform: $platform, applicationIdentifier: $applicationIdentifier) { id buildVersion } } }
        }`,
            variables,
            'read',
        );
        const version =
            data.app?.byId?.latestAppVersionByPlatformAndApplicationIdentifier;
        const code = Number(version?.buildVersion);
        if (
            !version?.id ||
            !/^[1-9][0-9]*$/.test(String(version.buildVersion)) ||
            !Number.isInteger(code) ||
            code > 2_100_000_000
        ) {
            throw new Error(
                'EAS returned no valid Android version code. Initialize it with eas build:version:set.',
            );
        }
        return { id: version.id, code };
    }
    return {
        latest,
        async reserve(code, previous) {
            if (
                !Number.isInteger(code) ||
                code <= previous.code ||
                code > 2_100_000_000
            ) {
                throw new Error(
                    'The reserved EAS version must be a higher valid Android version code.',
                );
            }
            const current = await latest();
            if (current.id !== previous.id || current.code !== previous.code) {
                throw new Error(
                    'The EAS Android version changed during allocation. Retry after other phone/watch builds finish.',
                );
            }
            const data = await request(
                `mutation CreateAppVersionMutation($appVersionInput: AppVersionInput!) {
                appVersion { createAppVersion(appVersionInput: $appVersionInput) { id } }
            }`,
                {
                    appVersionInput: {
                        ...variables,
                        storeVersion: project.storeVersion,
                        buildVersion: String(code),
                    },
                },
                'reserve',
            );
            const id = data.appVersion?.createAppVersion?.id;
            const confirmed = await latest();
            if (!id || confirmed.id !== id || confirmed.code !== code) {
                throw new Error(
                    'Could not confirm the reserved EAS version. Retry after other phone/watch builds finish.',
                );
            }
        },
    };
}

export function loadEasVersionClient(expoDirectory, environment, profile) {
    const eas = JSON.parse(
        readFileSync(resolve(expoDirectory, 'eas.json'), 'utf8'),
    );
    if (
        eas.cli?.appVersionSource !== 'remote' ||
        !['staging', 'production'].includes(profile)
    ) {
        throw new Error(
            'Wear builds require remote EAS versioning and a staging or production profile.',
        );
    }
    const result = spawnSync(
        process.execPath,
        [
            '-e',
            `const c=require('./app.config.js'); console.log(JSON.stringify({appId:c.extra?.eas?.projectId,applicationIdentifier:c.android?.package,storeVersion:c.version}));`,
        ],
        {
            cwd: expoDirectory,
            env: { ...environment, APP_ENV: profile, EXPO_NO_DOTENV: '1' },
            encoding: 'utf8',
            timeout: 30_000,
        },
    );
    let project;
    try {
        project = JSON.parse(result.stdout);
    } catch {
        /* Report only a safe configuration error below. */
    }
    if (
        result.status !== 0 ||
        !project?.appId ||
        !project?.applicationIdentifier ||
        !project?.storeVersion
    ) {
        throw new Error(
            'Unable to resolve the phone EAS project and Android application ID.',
        );
    }
    return createEasVersionClient(
        project,
        easAuthenticationHeaders(environment),
    );
}
