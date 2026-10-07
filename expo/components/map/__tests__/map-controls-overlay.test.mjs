import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { iconPaths } from '../../design-system/icon-paths.js';
import { loadTourModule } from './tour-test-helpers.mjs';

const { MapControlIcon } = loadTourModule(
    new URL('../map-control-icon.js', import.meta.url),
    {
        'react-native': { View: 'View' },
        '../design-system/icon': { Icon: 'Icon' },
    },
);

const mapControlsOverlaySource = readFileSync(
    new URL('../map-controls-overlay.js', import.meta.url),
    'utf8',
);
const mapScreenSource = readFileSync(
    new URL('../../map-screen.js', import.meta.url),
    'utf8',
);
const mapScreenContextSource = readFileSync(
    new URL('../map-screen-context.js', import.meta.url),
    'utf8',
);

describe('MapControlsOverlay', () => {
    test('hides the free-drive control during route navigation', () => {
        assert.match(mapControlsOverlaySource, /showFreeDriveButton = true/);
        assert.match(mapControlsOverlaySource, /\{showFreeDriveButton \? \(/);
        assert.match(
            mapScreenSource,
            /const freeDriveIsActive = isDrivingMode && !selectedDirectionsRouteOption/,
        );
        assert.match(
            mapScreenSource,
            /<MapControlsOverlay\s+showFreeDriveButton=\{freeDriveIsActive\}/,
        );
    });

    test('shows the drawer button first during active route navigation', () => {
        assert.match(mapControlsOverlaySource, /showDrawerButton = false/);
        assert.match(
            mapControlsOverlaySource,
            /\{showDrawerButton \? \([\s\S]*?accessibilityLabel="Open menu"[\s\S]*?testID="driving-drawer-button"[\s\S]*?\) : null\}\s*\n\s*<MapLayerButton/,
        );
        assert.match(
            mapScreenSource,
            /<MapControlsOverlay\s+showFreeDriveButton=\{freeDriveIsActive\}\s+onDrawerPress=\{\s*searchController\.handleDrawerPress\s*\}\s+showDrawerButton=\{Boolean\(\s*selectedDirectionsRouteOption,\s*\)\}/,
        );
    });

    test('exits free drive when mobile search opens', () => {
        assert.match(
            mapScreenSource,
            /if \(!freeDriveIsActive \|\| !searchController\.searchPageIsVisible\) \{[\s\S]*?logMapDrivingStopped\(\{ route: null \}\);[\s\S]*?setDrivingModeIsActive\(false\);/,
        );
    });

    test('offsets the directional arrow without shifting the symmetric exit icon', () => {
        const navigation = MapControlIcon({ name: 'navigation' });
        const exit = MapControlIcon({ name: 'x' });

        assert.match(
            navigation.props.className,
            /-translate-x-px translate-y-px/,
        );
        assert.doesNotMatch(exit.props.className, /translate/);
    });

    test('keeps stroke weight consistent across the optically sized rail icons', () => {
        for (const name of [
            'menu',
            'sliders-horizontal',
            'route',
            'map',
            'navigation',
            'x',
            'chevron-left',
            'plus',
            'minus',
            'locate-fixed',
            'pencil',
        ]) {
            const wrapper = MapControlIcon({ name, color: '#1FBF6B' });
            const icon = wrapper.props.children;

            assert.equal(icon.type, 'Icon');
            assert.equal(icon.props.name, name);
            assert.equal(icon.props.color, '#1FBF6B');
            assert.ok(iconPaths[name]?.length > 0);
            assert.ok(icon.props.size <= 28);
            assert.ok(
                Math.abs((icon.props.stroke * icon.props.size) / 24 - 2) <
                    0.0001,
            );
        }
    });

    test('compensates for zoom glyph whitespace while keeping plus and minus equal', () => {
        const icon = (name) => MapControlIcon({ name }).props.children.props;

        assert.equal(icon('plus').size, icon('minus').size);
        assert.ok(icon('plus').size > icon('sliders-horizontal').size);
        assert.ok(icon('x').size > icon('navigation').size);
    });

    test('centers the enlarged back chevron with a horizontal optical offset', () => {
        const back = MapControlIcon({ name: 'chevron-left' });
        const exit = MapControlIcon({ name: 'x' });

        assert.match(back.props.className, /-translate-x-px/);
        assert.doesNotMatch(back.props.className, /translate-y/);
        assert.ok(
            back.props.children.props.size > exit.props.children.props.size,
        );
    });

    test('uses the shared icon sizing for directions back and both details close buttons', () => {
        for (const [testID, name] of [
            ['directions-route-back-button', 'chevron-left'],
            ['marker-details-close-button', 'x'],
            ['place-details-close-button', 'x'],
        ]) {
            assert.match(
                mapScreenSource,
                new RegExp(
                    `testID="${testID}"\\s*>\\s*<MapControlIcon\\s+color=\\{\\s*presentation\\.searchPrimaryIconColor\\s*\\}\\s+name="${name}"\\s*/>\\s*</Pressable>`,
                ),
            );
        }
    });

    test('shows an icon-only map-view control with an accessibility label', () => {
        assert.match(
            mapControlsOverlaySource,
            /\{drivingMapViewControlIsVisible \? \([\s\S]*?accessibilityLabel=\{`Map view: \$\{drivingMapViewPresentation\.label\}`\}[\s\S]*?testID="driving-map-view-button"/,
        );
        assert.match(
            mapControlsOverlaySource,
            /getNextDrivingMapViewMode\(drivingMapViewMode\)/,
        );
        assert.match(
            mapControlsOverlaySource,
            /testID="driving-map-view-button"\s*>\s*<MapControlIcon\s+color=\{defaultMapControlIconColor\}\s+name=\{drivingMapViewPresentation\.iconName\}\s*\/>\s*<\/MapControlButton>/,
        );
        assert.match(
            mapScreenSource,
            /drivingMapViewControlIsVisible: Boolean\(\s*isDrivingMode && selectedDirectionsRouteOption/,
        );
    });

    test('fits the active route only while route overview is selected', () => {
        assert.match(
            mapScreenSource,
            /drivingMapViewMode !== DRIVING_MAP_VIEW_ROUTE_OVERVIEW[\s\S]*?fitDrivingCameraToBounds\(drivingRouteOverviewBounds/,
        );
        assert.match(
            mapScreenSource,
            /getDirectionsRouteBounds\(directionsRoute\)/,
        );
    });

    test('returns route overview to perspective when recenter is pressed', () => {
        assert.match(
            mapScreenSource,
            /const handleDrivingRecenterPress = useCallback\(\(\) => \{[\s\S]*?drivingMapViewMode === DRIVING_MAP_VIEW_ROUTE_OVERVIEW[\s\S]*?setDrivingMapViewMode\(DRIVING_MAP_VIEW_PERSPECTIVE\)[\s\S]*?locationController\.handleDrivingRecenterPress\(\)/,
        );
        assert.match(
            mapScreenContextSource,
            /handleDrivingRecenterPressOverride \?\?[\s\S]*?locationController\.handleDrivingRecenterPress/,
        );
    });
});
