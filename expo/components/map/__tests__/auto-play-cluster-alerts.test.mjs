import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getAutoPlayAlertSurfaceVisibility } from '../../auto-play-alert-surface-visibility.js';

const autoPlayMapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);

for (const surface of ['Android Auto cluster', 'CarPlay dashboard']) {
    test(`${surface} hides ALPR and police alerts`, () => {
        assert.deepEqual(
            getAutoPlayAlertSurfaceVisibility({
                isRootMapSurface: false,
                policeAlertsVisible: true,
                surveillanceMarkersVisible: true,
            }),
            {
                policeAlertsVisible: false,
                surveillanceMarkersVisible: false,
                upcomingAlertsVisible: false,
            },
        );
    });
}

test('the main in-car map keeps its configured alerts', () => {
    assert.deepEqual(
        getAutoPlayAlertSurfaceVisibility({
            isRootMapSurface: true,
            policeAlertsVisible: true,
            surveillanceMarkersVisible: true,
        }),
        {
            policeAlertsVisible: true,
            surveillanceMarkersVisible: true,
            upcomingAlertsVisible: true,
        },
    );
});

test('the automotive map renderer applies the surface alert policy', () => {
    assert.match(
        autoPlayMapSurfaceSource,
        /getAutoPlayAlertSurfaceVisibility\(\{[\s\S]*?isRootMapSurface,[\s\S]*?policeAlertsVisible:[\s\S]*?surveillanceMarkersVisible:/,
    );
    assert.match(
        autoPlayMapSurfaceSource,
        /markersAreVisible:\s*alertSurfaceVisibility\.surveillanceMarkersVisible/,
    );
    assert.match(
        autoPlayMapSurfaceSource,
        /policeAlertsAreEnabled:\s*alertSurfaceVisibility\.policeAlertsVisible/,
    );
    assert.match(
        autoPlayMapSurfaceSource,
        /enabled:\s*alertSurfaceVisibility\.upcomingAlertsVisible/,
    );
    assert.match(
        autoPlayMapSurfaceSource,
        /upcomingAlerts=\{[\s\S]*?alertSurfaceVisibility\.upcomingAlertsVisible[\s\S]*?upcomingAlerts[\s\S]*?: \[\]/,
    );
});
