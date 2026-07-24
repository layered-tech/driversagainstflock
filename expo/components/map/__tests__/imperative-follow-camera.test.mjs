import assert from 'node:assert/strict';
import test from 'node:test';
import { getImperativeFollowCameraStop } from '../imperative-follow-camera.js';

test('builds a padded camera update around the accepted matched location', () => {
    const padding = {
        paddingBottom: 320,
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 72,
    };

    assert.deepEqual(
        getImperativeFollowCameraStop({
            location: {
                courseHeading: 91,
                latitude: 30.2672,
                longitude: -97.7431,
            },
            padding,
            pitch: 55,
            zoomLevel: 16.5,
        }),
        {
            animationDuration: 450,
            animationMode: 'easeTo',
            centerCoordinate: [-97.7431, 30.2672],
            heading: 91,
            padding,
            pitch: 55,
            zoomLevel: 16.5,
        },
    );
});

test('rejects a camera update without a finite coordinate', () => {
    assert.equal(
        getImperativeFollowCameraStop({
            location: { latitude: 30.2672 },
        }),
        null,
    );
});
