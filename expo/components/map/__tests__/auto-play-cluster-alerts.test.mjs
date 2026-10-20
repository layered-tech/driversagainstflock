import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getAutoPlayAlertSurfaceVisibility } from '../../auto-play-alert-surface-visibility.js';

const autoPlayMapSurfaceSource = readFileSync(
    new URL('../../auto-play-map-surface-content.js', import.meta.url),
    'utf8',
);

test('the Android Auto cluster keeps passive ALPR nodes without police or upcoming alerts', () => {
    assert.deepEqual(
        getAutoPlayAlertSurfaceVisibility({
            isRootMapSurface: false,
            isClusterMapSurface: true,
            policeAlertsVisible: true,
            surveillanceMarkersVisible: true,
        }),
        {
            policeAlertsVisible: false,
            surveillanceMarkersVisible: true,
            upcomingAlertsVisible: false,
        },
    );
});

test('the Android Auto cluster respects the ALPR marker preference', () => {
    assert.deepEqual(
        getAutoPlayAlertSurfaceVisibility({
            isRootMapSurface: false,
            isClusterMapSurface: true,
            policeAlertsVisible: true,
            surveillanceMarkersVisible: false,
        }),
        {
            policeAlertsVisible: false,
            surveillanceMarkersVisible: false,
            upcomingAlertsVisible: false,
        },
    );
});

test('the CarPlay dashboard keeps ALPR, police, and upcoming alerts', () => {
    assert.deepEqual(
        getAutoPlayAlertSurfaceVisibility({
            isDashboardMapSurface: true,
            isRootMapSurface: false,
            policeAlertsVisible: true,
            surveillanceMarkersVisible: true,
        }),
        {
            policeAlertsVisible: true,
            surveillanceMarkersVisible: true,
            upcomingAlertsVisible: true,
        },
    );
    assert.deepEqual(
        getAutoPlayAlertSurfaceVisibility({
            isDashboardMapSurface: true,
            isRootMapSurface: false,
            policeAlertsVisible: false,
            surveillanceMarkersVisible: false,
        }),
        {
            policeAlertsVisible: false,
            surveillanceMarkersVisible: false,
            upcomingAlertsVisible: true,
        },
    );
});

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
        /getAutoPlayAlertSurfaceVisibility\(\{[\s\S]*?isClusterMapSurface,[\s\S]*?isRootMapSurface,[\s\S]*?policeAlertsVisible:[\s\S]*?surveillanceMarkersVisible:/,
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
        /useAutoPlayNavigationAlerts\(\{[\s\S]*?enabled:[\s\S]*?alertSurfaceVisibility\.upcomingAlertsVisible[\s\S]*?upcomingAlerts,[\s\S]*?userLocation: mapPreferences\.userLocation,[\s\S]*?\}\);/,
    );
});
