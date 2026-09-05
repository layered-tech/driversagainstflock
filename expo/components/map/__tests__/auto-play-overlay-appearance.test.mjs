import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const autoPlayStatusOverlaySource = readFileSync(
    new URL('../../auto-play-map-status-overlay.js', import.meta.url),
    'utf8',
);
const currentRoadContextSource = readFileSync(
    new URL('../current-road-context.js', import.meta.url),
    'utf8',
);
const drivingLocationRoadStackSource = readFileSync(
    new URL('../driving-location-road-stack.js', import.meta.url),
    'utf8',
);
const upcomingAlertDistanceTrackSource = readFileSync(
    new URL('../upcoming-alert-distance-track.js', import.meta.url),
    'utf8',
);
const mapPresentationSource = readFileSync(
    new URL('../use-map-presentation.js', import.meta.url),
    'utf8',
);

test('AutoPlay status cards use an explicit car appearance with a handset fallback', () => {
    assert.match(
        autoPlayStatusOverlaySource,
        /export function AutoPlayTopRightStatusOverlay\(\{[\s\S]*?isDarkMode,[\s\S]*?\}\) \{[\s\S]*?const systemColorScheme = useColorScheme\(\);[\s\S]*?const resolvedIsDarkMode =\s*isDarkMode \?\? \(?systemColorScheme === 'dark'\)?/,
    );
    assert.match(
        autoPlayStatusOverlaySource,
        /<AutoPlaySingleResultCountdownCard[\s\S]*?isDarkMode=\{resolvedIsDarkMode\}/,
    );
    assert.match(
        autoPlayStatusOverlaySource,
        /<AutoPlayRouteLoadingCard[\s\S]*?isDarkMode=\{resolvedIsDarkMode\}/,
    );
    assert.match(
        autoPlayStatusOverlaySource,
        /isDarkMode\s*\? 'text-white'\s*: 'text-daf-text-primary'/,
    );
    assert.doesNotMatch(autoPlayStatusOverlaySource, /dark:/);
});

test('AutoPlay driving status passes explicit appearance to its shared primitives', () => {
    assert.match(
        autoPlayStatusOverlaySource,
        /export function AutoPlayMapStatusOverlay\(\{[\s\S]*?isDarkMode,[\s\S]*?\}\) \{[\s\S]*?const systemColorScheme = useColorScheme\(\);[\s\S]*?const resolvedIsDarkMode =\s*isDarkMode \?\? \(?systemColorScheme === 'dark'\)?/,
    );
    assert.match(
        autoPlayStatusOverlaySource,
        /<DrivingLocationRoadStack[\s\S]*?currentRoadPillIsDarkMode=\{resolvedIsDarkMode\}/,
    );
    assert.match(
        autoPlayStatusOverlaySource,
        /<SpeedLimitSign[\s\S]*?isDarkMode=\{resolvedIsDarkMode\}/,
    );
    assert.match(
        drivingLocationRoadStackSource,
        /currentRoadPillIsDarkMode,[\s\S]*?<CurrentRoadPill[\s\S]*?isDarkMode=\{currentRoadPillIsDarkMode\}/,
    );
});

test('CurrentRoadPill supports explicit appearance while retaining handset defaults', () => {
    assert.match(
        currentRoadContextSource,
        /import \{ Text, useColorScheme, View \} from 'react-native'/,
    );
    assert.match(
        currentRoadContextSource,
        /export function CurrentRoadPill\(\{[\s\S]*?isDarkMode,[\s\S]*?\}\) \{[\s\S]*?const systemColorScheme = useColorScheme\(\);[\s\S]*?const resolvedIsDarkMode =\s*isDarkMode \?\? \(?systemColorScheme === 'dark'\)?/,
    );
    assert.match(
        currentRoadContextSource,
        /resolvedIsDarkMode\s*\? 'border-white\/15 bg-neutral-900\/95'\s*: 'border-black\/10 bg-white\/95'/,
    );
    assert.match(
        currentRoadContextSource,
        /resolvedIsDarkMode \? 'text-neutral-100' : 'text-neutral-900'/,
    );
    assert.doesNotMatch(currentRoadContextSource, /dark:/);
});

test('UpcomingAlertDistanceTrack supports explicit appearance while retaining handset defaults', () => {
    assert.match(
        upcomingAlertDistanceTrackSource,
        /isDarkMode,[\s\S]*?const systemColorScheme = useColorScheme\(\);[\s\S]*?const resolvedIsDarkMode =\s*isDarkMode \?\? \(?systemColorScheme === 'dark'\)?/,
    );
    assert.match(
        upcomingAlertDistanceTrackSource,
        /getDafTheme\(resolvedIsDarkMode \? 'dark' : 'light'\)/,
    );
    assert.match(
        upcomingAlertDistanceTrackSource,
        /resolvedIsDarkMode \? 'bg-\[#1A2027\]' : 'bg-daf-surface-alt'/,
    );
    assert.doesNotMatch(upcomingAlertDistanceTrackSource, /dark:/);
});

test('map presentation can override handset appearance for car-only controls', () => {
    assert.match(
        mapPresentationSource,
        /isDarkModeOverride,[\s\S]*?const isSystemDarkMode = useColorScheme\(\) === 'dark';[\s\S]*?const resolvedIsDarkMode =\s*isDarkModeOverride \?\? isSystemDarkMode/,
    );
    assert.match(
        mapPresentationSource,
        /const isDarkMapLayer =\s*mapLightPresetUsesDarkAppearance\(mapLightPreset\)/,
    );
    assert.match(
        mapPresentationSource,
        /const primaryButtonIndicatorColor = resolvedIsDarkMode/,
    );
    assert.match(
        mapPresentationSource,
        /const searchPlaceholderColor = resolvedIsDarkMode/,
    );
    assert.match(
        mapPresentationSource,
        /backgroundColor: resolvedIsDarkMode \? '#161B22' : '#ffffff'/,
    );
    assert.match(
        mapPresentationSource,
        /backgroundColor: resolvedIsDarkMode \? '#3A434E' : '#D4D9DF'/,
    );
    assert.match(mapPresentationSource, /isSystemDarkMode: resolvedIsDarkMode/);
});
