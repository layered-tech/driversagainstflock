import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    AUTO_PLAY_MANEUVER_TYPE,
    getAutoPlayManeuverConfig,
} from '../../auto-play-maneuver-config.js';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const drivingGuidanceCardsSource = readFileSync(
    new URL('../driving-guidance-cards.js', import.meta.url),
    'utf8',
);
const directionsSource = readFileSync(
    new URL('../directions.js', import.meta.url),
    'utf8',
);
const roundaboutExitImagesSource = readFileSync(
    new URL('../../auto-play-roundabout-exit-images.js', import.meta.url),
    'utf8',
);

describe('Auto Play roundabout maneuvers', () => {
    test('reduces provider roundabout details to the exit number', () => {
        assert.deepEqual(
            getAutoPlayManeuverConfig({
                exit_bearings: [0, 90, 0],
                exit_number: 2,
                type: 7,
            }),
            {
                exitNumber: 2,
                glyph: 'rotate',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Roundabout,
            },
        );
    });

    test('does not infer roundabout direction or geometry', () => {
        assert.deepEqual(
            getAutoPlayManeuverConfig({
                exit_bearings: [0, 270, 180, 90],
                exit_number: 3,
                type: 7,
            }),
            {
                exitNumber: 3,
                glyph: 'rotate',
                maneuverType: AUTO_PLAY_MANEUVER_TYPE.Roundabout,
            },
        );
    });

    test('keeps exit-only guidance as a simple roundabout fallback', () => {
        assert.deepEqual(getAutoPlayManeuverConfig({ type: 8 }), {
            glyph: 'rotate',
            maneuverType: AUTO_PLAY_MANEUVER_TYPE.Roundabout,
        });
    });
});

test('automotive guidance uses numbered roundabout assets', () => {
    assert.match(
        autoPlaySource,
        /getAutoPlayRoundaboutExitImage\(\s*maneuverConfig\.exitNumber/,
    );
    assert.match(
        roundaboutExitImagesSource,
        /1: require\('[^']*roundabout-exit-1\.png'\)/,
    );
    assert.match(
        roundaboutExitImagesSource,
        /19: require\('[^']*roundabout-exit-19\.png'\)/,
    );

    for (const exitNumber of [1, 2, 9, 10, 19]) {
        assert.equal(
            existsSync(
                new URL(
                    `../../../assets/auto-play/roundabout-exits/roundabout-exit-${exitNumber}.png`,
                    import.meta.url,
                ),
            ),
            true,
        );
    }
});

test('mobile and route progress retain the numbered roundabout badge', () => {
    assert.match(
        drivingGuidanceCardsSource,
        /<RoundaboutExitIcon exitNumber=\{roundaboutExitNumber\}/,
    );
    assert.match(
        directionsSource,
        /shouldHoldRoundaboutManeuver\(currentManeuver, userLocation\)/,
    );
});
