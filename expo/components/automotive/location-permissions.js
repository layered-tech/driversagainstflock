const LOCATION_PERMISSIONS = [
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
];

export function createAutomotiveLocationPermissions({
    location,
    requestPermissions,
    onReady = () => {},
}) {
    let pending = null;
    let wasReady = false;
    async function check(request) {
        let permission = await location.getForegroundPermissionsAsync();
        if (
            permission.status !== 'granted' &&
            request &&
            permission.canAskAgain !== false
        ) {
            await requestPermissions(
                LOCATION_PERMISSIONS,
                'Allow location on this car for maps and directions. Park to continue.',
                'Allow location',
                'Not now',
            );
            permission = await location.getForegroundPermissionsAsync();
        }
        if (permission.status !== 'granted') {
            wasReady = false;
            return {
                ready: false,
                message:
                    permission.canAskAgain === false
                        ? 'Location access is blocked. While parked, open Car setup, then App permissions to allow location.'
                        : 'Location is required for directions. While parked, open Car setup to allow location.',
            };
        }
        if (!(await location.hasServicesEnabledAsync())) {
            wasReady = false;
            return {
                ready: false,
                message:
                    'Location is turned off on this car. While parked, open Car setup, then Location settings.',
            };
        }
        if (!wasReady) onReady();
        wasReady = true;
        return { ready: true, message: null };
    }
    return {
        ensure({ request = true } = {}) {
            if (!pending) {
                pending = check(request).finally(() => {
                    pending = null;
                });
            }
            return pending;
        },
    };
}
