#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildEmulatorRouteReplay,
    parseEmulatorRoute,
    replayEmulatorRoute,
} from './emulator-route-replay.mjs';
import { createEmulatorGpsClient } from './emulator-gps-client.mjs';

const run = promisify(execFile);
const APP_ID = 'com.anonymous.drivefree.dev';
const phone = process.env.WATCH_E2E_PHONE_DEVICE;
const watch = process.env.WATCH_E2E_WATCH_DEVICE;
const metroPort = Number(process.env.WATCH_E2E_METRO_PORT || 8091);
const guided = process.argv.includes('--guided');
const wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

async function adb(serial, args) {
    const { stdout } = await run('adb', ['-s', serial, ...args], {
        maxBuffer: 1024 * 1024,
    });
    return stdout;
}

export async function synchronizeWatchEmulatorClock(phoneSerial, watchSerial, execute = adb) {
    if (!phoneSerial.startsWith('emulator-') || !watchSerial.startsWith('emulator-')) {
        throw new Error('The watch camera E2E clock check requires two emulators.');
    }
    const phoneTime = Number((await execute(phoneSerial, ['shell', 'date', '+%s%3N'])).trim());
    const watchTime = Number((await execute(watchSerial, ['shell', 'date', '+%s%3N'])).trim());
    if (!Number.isFinite(phoneTime) || !Number.isFinite(watchTime)) {
        throw new Error('Could not read both emulator clocks.');
    }
    if (Math.abs(phoneTime - watchTime) <= 2_000) return false;
    const uptime = Number((await execute(watchSerial, ['shell', 'cat', '/proc/uptime'])).split(' ')[0]);
    if (!Number.isFinite(uptime)) throw new Error('Could not read watch emulator uptime.');
    await execute(watchSerial, ['shell', 'cmd', 'time_detector', 'suggest_network_time',
        '--elapsed_realtime', String(Math.round(uptime * 1000)),
        '--unix_epoch_time', String(phoneTime), '--uncertainty_millis', '1000']);
    const corrected = Number((await execute(watchSerial, ['shell', 'date', '+%s%3N'])).trim());
    if (!Number.isFinite(corrected) || Math.abs(phoneTime - corrected) > 5_000) {
        throw new Error('Wear OS emulator clock is still too far from the phone clock.');
    }
    return true;
}

export function readWatchCueEvidence(preferencesXml, vibratorDump, appId) {
    const value = (key) => (preferencesXml.match(
        new RegExp(`<string name="${key}">([\\s\\S]*?)<\\/string>`),
    )?.[1] ?? '').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
    const snapshot = JSON.parse(value('snapshot') || '{}');
    const cameraVibrationRecord = vibratorDump.split('\n').filter((line) =>
        line.includes(`| ${appId} (`) &&
        /duration:\s+3\d\dms/.test(line) &&
        line.includes('Step=60ms')).at(-1) ?? null;
    return {
        navigationStatus: snapshot.navigation?.status,
        destination: snapshot.navigation?.destination ?? '',
        routeSessionId: snapshot.navigation?.sessionId ?? null,
        cameraAlertId: snapshot.cameraAlert?.id ?? null,
        cameraSourceAgeMs: snapshot.cameraAlert?.sourceAt
            ? Date.now() - snapshot.cameraAlert.sourceAt : null,
        cameraAlertsEnabled: snapshot.cameraAlertsEnabled === true,
        lastCueId: value('last_cue_id') || null,
        lastCameraCueKey: value('last_camera_cue_key') || null,
        cameraVibrationRecord,
    };
}

function controlBounds(xml, label) {
    const node = [...xml.matchAll(/<node\b[^>]*>/g)]
        .map(([value]) => value)
        .find((value) => value.includes(`content-desc="${label}`));
    const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    return bounds ? {
        x: Math.round((Number(bounds[1]) + Number(bounds[3])) / 2),
        y: Math.round((Number(bounds[2]) + Number(bounds[4])) / 2),
    } : null;
}

async function phoneControl(label, tap = false) {
    await adb(phone, ['shell', 'uiautomator', 'dump', '/sdcard/watch-e2e-ui.xml']);
    const xml = await adb(phone, ['exec-out', 'cat', '/sdcard/watch-e2e-ui.xml']);
    const bounds = controlBounds(xml, label);
    if (tap && bounds) await adb(phone, ['shell', 'input', 'tap', String(bounds.x), String(bounds.y)]);
    return bounds !== null;
}

async function phoneHasText(text) {
    await adb(phone, ['shell', 'uiautomator', 'dump', '/sdcard/watch-e2e-ui.xml']);
    const xml = await adb(phone, ['exec-out', 'cat', '/sdcard/watch-e2e-ui.xml']);
    return xml.includes(`text="${text}"`);
}

async function waitForPhoneControl(label, tap = false) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (await phoneControl(label, tap)) return;
        await wait(500);
    }
    throw new Error(`Phone control did not appear: ${label}`);
}

async function startGuidedWalmart() {
    if (await phoneControl('End route guidance')) {
        await phoneControl('End route guidance', true);
    }
    if (await phoneControl('Get directions to this place')) {
        if (!(await phoneHasText('411 Pewaukee Rd, Pewaukee, WI 53072, USA'))) {
            throw new Error('Selected place is not the 411 Pewaukee Rd Walmart.');
        }
        await phoneControl('Get directions to this place', true);
    } else {
        await waitForPhoneControl('Open directions', true);
        await waitForPhoneControl('Destination location', true);
        await waitForPhoneControl('Search choose destination');
        await wait(300);
        await adb(phone, ['shell', 'input', 'text', 'Walmart%sPewaukee']);
        await waitForPhoneControl('Use Walmart, Pewaukee Road', true);
        await waitForPhoneControl('Destination location: Walmart');
        if (!(await phoneHasText('411 Pewaukee Rd, Pewaukee, WI 53072, USA'))) {
            throw new Error('Selected Walmart is not the 411 Pewaukee Rd store.');
        }
        await waitForPhoneControl('Get directions on the map', true);
    }
    await waitForPhoneControl('Fastest Route,');
    if (!(await phoneHasText('1 camera'))) {
        throw new Error('The Walmart fastest route does not include a mapped camera.');
    }
    await phoneControl('Fastest Route,', true);
    await waitForPhoneControl('Start driving', true);
}

async function watchEvidence(includeVibration = false) {
    const preferences = await adb(watch, [
        'exec-out', 'run-as', APP_ID, 'cat', 'shared_prefs/watch_state.xml',
    ]);
    const vibration = includeVibration
        ? await adb(watch, ['shell', 'dumpsys', 'vibrator_manager'])
        : '';
    return readWatchCueEvidence(preferences, vibration, APP_ID);
}

export function watchNavigationMatchesScenario(evidence, useGuidance) {
    return useGuidance
        ? evidence.navigationStatus === 'active' &&
            evidence.destination.includes('Walmart') && Boolean(evidence.routeSessionId)
        : evidence.navigationStatus === 'idle';
}

async function main() {
    if (!phone || !watch || phone === watch) {
        throw new Error('Set distinct WATCH_E2E_PHONE_DEVICE and WATCH_E2E_WATCH_DEVICE serials.');
    }
    await Promise.all([adb(phone, ['get-state']), adb(watch, ['get-state'])]);
    if (await synchronizeWatchEmulatorClock(phone, watch)) {
        console.log('Synchronized Wear OS emulator clock with phone emulator.');
    }
    const metro = await fetch(`http://127.0.0.1:${metroPort}/status`).catch(() => null);
    if (!metro?.ok || !(await metro.text()).includes('packager-status:running')) {
        throw new Error(`Start Metro on port ${metroPort} with APP_ENV=e2e and EXPO_PUBLIC_E2E_MAP_API_MOCKS=0.`);
    }
    await adb(phone, ['shell', 'am', 'force-stop', APP_ID]);
    const developmentClientUrl = `exp+driversagainstflock://expo-development-client/?url=${encodeURIComponent(`http://10.0.2.2:${metroPort}`)}`;
    await adb(phone, ['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW',
        '-d', developmentClientUrl, APP_ID]);
    let mapReady = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
        mapReady = guided
            ? await phoneControl('Open directions') || await phoneControl('End route guidance') ||
                await phoneControl('Get directions to this place')
            : await phoneControl('Start free drive') || await phoneControl('Exit free drive');
        if (mapReady) break;
        await wait(1000);
    }
    if (!mapReady) throw new Error('Phone map did not open from Metro.');
    const baseline = await watchEvidence(true);
    if (!baseline.cameraAlertsEnabled) {
        throw new Error('Enable Alert on wrist in the phone Watch settings first.');
    }
    const route = parseEmulatorRoute(JSON.parse(readFileSync(
        new URL('../.android-auto/route-pewaukee.json', import.meta.url),
        'utf8',
    )));
    const fixes = buildEmulatorRouteReplay(route, { fromMs: 0, toMs: 65_000 });
    const gpx = readFileSync(new URL('../.android-auto/route-pewaukee.gpx', import.meta.url), 'utf8');
    const gpxPoints = [...gpx.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"><time>([^<]+)<\/time><\/trkpt>/g)];
    const gpxStart = Date.parse(gpxPoints[0]?.[3]);
    for (const [index, fix] of fixes.entries()) {
        const point = gpxPoints[index];
        if (!point || Number(point[1]) !== fix.latitude || Number(point[2]) !== fix.longitude ||
            Date.parse(point[3]) - gpxStart !== fix.atMs) {
            throw new Error(`GPX and emulator replay differ at fix ${index}`);
        }
    }
    const gps = await createEmulatorGpsClient({
        serial: phone,
        androidSdkRoot: process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
            join(process.env.HOME, 'Library/Android/sdk'),
    });
    let sawCamera = false;
    let polling = false;
    let poller = null;
    let alreadyDriving = false;
    const sample = async () => {
        if (polling) return;
        polling = true;
        try {
            const evidence = await watchEvidence();
            sawCamera ||= watchNavigationMatchesScenario(evidence, guided) &&
                evidence.cameraAlertId !== null &&
                evidence.cameraSourceAgeMs >= -5_000 &&
                evidence.cameraSourceAgeMs < 15_000;
        } finally {
            polling = false;
        }
    };
    try {
        await gps.setLocation(fixes[0]);
        if (guided) {
            await startGuidedWalmart();
            let active = false;
            for (let attempt = 0; attempt < 20; attempt += 1) {
                const evidence = await watchEvidence();
                active = watchNavigationMatchesScenario(evidence, true);
                if (active) break;
                await wait(500);
            }
            if (!active) throw new Error('Watch did not receive active guidance to Walmart.');
        } else {
            alreadyDriving = await phoneControl('Exit free drive');
            if (!alreadyDriving && !(await phoneControl('Start free drive', true))) {
                throw new Error('Open the phone map so free driving can be started.');
            }
            if (!(await phoneControl('Exit free drive'))) {
                throw new Error('The phone did not enter free driving.');
            }
        }
        poller = setInterval(() => sample().catch(() => {}), 750);
        await replayEmulatorRoute(fixes, {
            sendFix: (fix) => gps.setLocation(fix),
            wait,
        });
        for (let attempt = 0; attempt < 15; attempt += 1) {
            await sample();
            const evidence = await watchEvidence(true);
            if (sawCamera && evidence.lastCameraCueKey !== baseline.lastCameraCueKey &&
                evidence.lastCameraCueKey && evidence.cameraVibrationRecord &&
                evidence.cameraVibrationRecord !== baseline.cameraVibrationRecord) {
                console.log(`PASS: ${route.name} ${guided ? 'Walmart guidance' : 'free drive'} ALPR displayed and watch camera vibration recorded`);
                return;
            }
            await wait(1000);
        }
        const evidence = await watchEvidence(true);
        throw new Error(`Missing watch camera haptic during ${guided ? 'Walmart guidance' : 'free drive'}: alertDisplayed=${sawCamera}, cameraCueRecorded=${evidence.lastCameraCueKey !== baseline.lastCameraCueKey && Boolean(evidence.lastCameraCueKey)}, newVibrationRecorded=${Boolean(evidence.cameraVibrationRecord && evidence.cameraVibrationRecord !== baseline.cameraVibrationRecord)}`);
    } finally {
        if (poller !== null) clearInterval(poller);
        await gps.restore();
        gps.close();
        if (guided) await phoneControl('End route guidance', true);
        else if (!alreadyDriving) await phoneControl('Exit free drive', true);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(`Wear OS camera E2E failed: ${error.message}`);
        process.exitCode = 1;
    });
}
