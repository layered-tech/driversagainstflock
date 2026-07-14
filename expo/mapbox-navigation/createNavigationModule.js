function createNavigationModule({
    EventEmitter,
    findNodeHandle,
    Platform,
    React,
    requireNativeModule,
}) {
    const MODULE_NAME = 'RNMapboxNavigation';
    const ENHANCED_LOCATION_EVENT_NAME = 'onEnhancedLocation';
    const NAVIGATION_CAMERA_STATE_EVENT_NAME = 'onNavigationCameraState';
    const RAW_LOCATION_EVENT_NAME = 'onRawLocation';
    const TRIP_SESSION_STATE_EVENT_NAME = 'onTripSessionState';

    function isSupportedPlatform() {
        return Platform.OS === 'android' || Platform.OS === 'ios';
    }

    function loadNativeModule() {
        if (!isSupportedPlatform()) {
            return null;
        }

        try {
            return requireNativeModule(MODULE_NAME);
        } catch {
            return null;
        }
    }

    const NativeRNMapboxNavigation = loadNativeModule();
    const eventEmitter = NativeRNMapboxNavigation
        ? new EventEmitter(NativeRNMapboxNavigation)
        : null;
    let enhancedLocationConsumerCount = 0;
    let enhancedLocationForegroundServiceConsumerCount = 0;

    function makeNoopSubscription() {
        return {
            remove() {},
        };
    }

    function isSupported() {
        return isSupportedPlatform() && Boolean(NativeRNMapboxNavigation);
    }

    function isNavigationPuck3DSupported() {
        return (
            isSupported() &&
            typeof NativeRNMapboxNavigation.applyNavigationPuck3D ===
                'function' &&
            typeof NativeRNMapboxNavigation.clearNavigationPuck3D === 'function'
        );
    }

    async function startTripSessionAsync(options = {}) {
        if (!NativeRNMapboxNavigation) {
            return false;
        }

        await NativeRNMapboxNavigation.startTripSession(
            Boolean(options.foregroundService),
        );

        return true;
    }

    async function stopTripSessionAsync() {
        if (!NativeRNMapboxNavigation) {
            return false;
        }

        await NativeRNMapboxNavigation.stopTripSession();

        return true;
    }

    async function getTripSessionStateAsync() {
        if (!NativeRNMapboxNavigation) {
            return 'unavailable';
        }

        return NativeRNMapboxNavigation.getTripSessionState();
    }

    async function getLastEnhancedLocationAsync() {
        if (!NativeRNMapboxNavigation) {
            return null;
        }

        return NativeRNMapboxNavigation.getLastEnhancedLocation();
    }

    function normalizeNavigationCameraOptions(options = {}) {
        const padding = options.padding ?? {};

        return {
            padding: {
                paddingBottom: Number(padding.paddingBottom) || 0,
                paddingLeft: Number(padding.paddingLeft) || 0,
                paddingRight: Number(padding.paddingRight) || 0,
                paddingTop: Number(padding.paddingTop) || 0,
            },
            ...(Number.isFinite(Number(options.pitch))
                ? { pitch: Number(options.pitch) }
                : {}),
            ...(Number.isFinite(Number(options.locationUpdateTimestamp))
                ? {
                      locationUpdateTimestamp: Number(
                          options.locationUpdateTimestamp,
                      ),
                  }
                : {}),
            ...(Number.isFinite(Number(options.zoomLevel))
                ? { zoomLevel: Number(options.zoomLevel) }
                : {}),
        };
    }

    function getNavigationCameraOptionsKey(options) {
        const normalizedOptions = normalizeNavigationCameraOptions(options);

        return [
            normalizedOptions.padding.paddingBottom,
            normalizedOptions.padding.paddingLeft,
            normalizedOptions.padding.paddingRight,
            normalizedOptions.padding.paddingTop,
            normalizedOptions.pitch ?? '',
            normalizedOptions.locationUpdateTimestamp ?? '',
            normalizedOptions.zoomLevel ?? '',
        ].join(':');
    }

    function getMapViewTag(mapViewRef) {
        if (typeof findNodeHandle !== 'function') {
            return null;
        }

        const mapView = mapViewRef?.current ?? mapViewRef;
        const nativeMapView = mapView?._nativeRef ?? mapView;
        const tag = nativeMapView ? findNodeHandle(nativeMapView) : null;

        return Number.isFinite(Number(tag)) ? Number(tag) : null;
    }

    async function applyNavigationPuck3DAsync(mapViewRef, scale) {
        if (!isNavigationPuck3DSupported()) {
            return false;
        }

        const mapViewTag = getMapViewTag(mapViewRef);
        const numericScale = Number(scale);

        if (!mapViewTag || !Number.isFinite(numericScale)) {
            return false;
        }

        return Boolean(
            await NativeRNMapboxNavigation.applyNavigationPuck3D(
                mapViewTag,
                Math.min(Math.max(numericScale, 16), 128),
            ),
        );
    }

    async function clearNavigationPuck3DAsync(mapViewRef) {
        if (
            !isNavigationPuck3DSupported() ||
            typeof NativeRNMapboxNavigation.clearNavigationPuck3D !== 'function'
        ) {
            return false;
        }

        const mapViewTag = getMapViewTag(mapViewRef);

        if (!mapViewTag) {
            return false;
        }

        return Boolean(
            await NativeRNMapboxNavigation.clearNavigationPuck3D(mapViewTag),
        );
    }

    async function attachNavigationCameraAsync(
        surfaceId,
        mapViewTag,
        options = {},
    ) {
        if (!NativeRNMapboxNavigation || !surfaceId || !mapViewTag) {
            return false;
        }

        return Boolean(
            await NativeRNMapboxNavigation.attachNavigationCamera(
                surfaceId,
                mapViewTag,
                normalizeNavigationCameraOptions(options),
            ),
        );
    }

    async function detachNavigationCameraAsync(surfaceId) {
        if (!NativeRNMapboxNavigation || !surfaceId) {
            return false;
        }

        return Boolean(
            await NativeRNMapboxNavigation.detachNavigationCamera(surfaceId),
        );
    }

    async function setNavigationCameraModeAsync(surfaceId, mode) {
        if (!NativeRNMapboxNavigation || !surfaceId) {
            return false;
        }

        return Boolean(
            await NativeRNMapboxNavigation.setNavigationCameraMode(
                surfaceId,
                mode === 'following' ? 'following' : 'idle',
            ),
        );
    }

    async function updateNavigationCameraOptionsAsync(surfaceId, options = {}) {
        if (!NativeRNMapboxNavigation || !surfaceId) {
            return false;
        }

        return Boolean(
            await NativeRNMapboxNavigation.updateNavigationCameraOptions(
                surfaceId,
                normalizeNavigationCameraOptions(options),
            ),
        );
    }

    function getRetainedTripSessionOptions() {
        return {
            foregroundService:
                enhancedLocationForegroundServiceConsumerCount > 0,
        };
    }

    async function retainEnhancedLocationTripSessionAsync(options = {}) {
        if (!NativeRNMapboxNavigation) {
            return false;
        }

        const foregroundService = Boolean(options.foregroundService);

        enhancedLocationConsumerCount += 1;

        if (foregroundService) {
            enhancedLocationForegroundServiceConsumerCount += 1;
        }

        await startTripSessionAsync(getRetainedTripSessionOptions());

        return true;
    }

    async function releaseEnhancedLocationTripSessionAsync(options = {}) {
        if (!NativeRNMapboxNavigation) {
            return false;
        }

        const foregroundService = Boolean(options.foregroundService);

        if (enhancedLocationConsumerCount > 0) {
            enhancedLocationConsumerCount -= 1;
        }

        if (
            foregroundService &&
            enhancedLocationForegroundServiceConsumerCount > 0
        ) {
            enhancedLocationForegroundServiceConsumerCount -= 1;
        }

        if (enhancedLocationConsumerCount > 0) {
            return true;
        }

        enhancedLocationConsumerCount = 0;
        enhancedLocationForegroundServiceConsumerCount = 0;
        await stopTripSessionAsync();

        return true;
    }

    function addEnhancedLocationListener(listener) {
        if (!eventEmitter) {
            return makeNoopSubscription();
        }

        return eventEmitter.addListener(ENHANCED_LOCATION_EVENT_NAME, listener);
    }

    function addRawLocationListener(listener) {
        if (!eventEmitter) {
            return makeNoopSubscription();
        }

        return eventEmitter.addListener(RAW_LOCATION_EVENT_NAME, listener);
    }

    function addTripSessionStateListener(listener) {
        if (!eventEmitter) {
            return makeNoopSubscription();
        }

        return eventEmitter.addListener(
            TRIP_SESSION_STATE_EVENT_NAME,
            listener,
        );
    }

    function addNavigationCameraStateListener(listener) {
        if (!eventEmitter) {
            return makeNoopSubscription();
        }

        return eventEmitter.addListener(
            NAVIGATION_CAMERA_STATE_EVENT_NAME,
            listener,
        );
    }

    function useEnhancedLocation(options = {}) {
        const enabled = options.enabled !== false;
        const foregroundService = Boolean(options.foregroundService);
        const [location, setLocation] = React.useState(null);

        React.useEffect(() => {
            if (!enabled || !isSupported()) {
                return undefined;
            }

            let isActive = true;
            const subscription = addEnhancedLocationListener((nextLocation) => {
                if (isActive) {
                    setLocation(nextLocation);
                }
            });

            getLastEnhancedLocationAsync()
                .then((lastLocation) => {
                    if (isActive && lastLocation) {
                        setLocation(lastLocation);
                    }
                })
                .catch(() => {});

            retainEnhancedLocationTripSessionAsync({ foregroundService }).catch(
                () => {},
            );

            return () => {
                isActive = false;
                subscription.remove();
                releaseEnhancedLocationTripSessionAsync({
                    foregroundService,
                }).catch(() => {});
            };
        }, [enabled, foregroundService]);

        return location;
    }

    function useNavigationTripSession() {
        const [state, setState] = React.useState('unavailable');

        React.useEffect(() => {
            if (!isSupported()) {
                return undefined;
            }

            let isActive = true;
            const subscription = addTripSessionStateListener((event) => {
                if (isActive) {
                    setState(event.state);
                }
            });

            getTripSessionStateAsync()
                .then((nextState) => {
                    if (isActive) {
                        setState(nextState);
                    }
                })
                .catch(() => {});

            return () => {
                isActive = false;
                subscription.remove();
            };
        }, []);

        const startTripSession = React.useCallback(startTripSessionAsync, []);
        const stopTripSession = React.useCallback(stopTripSessionAsync, []);

        return {
            isSupported: isSupported(),
            startTripSession,
            state,
            stopTripSession,
        };
    }

    function useNavigationCamera(options = {}) {
        const enabled = options.enabled === true;
        const surfaceId = options.surfaceId ?? 'default';
        const mode = options.mode === 'following' ? 'following' : 'idle';
        const attachKey = options.attachKey ?? '';
        const cameraOptions = options.cameraOptions ?? {};
        const cameraOptionsKey = getNavigationCameraOptionsKey(cameraOptions);
        const attachedCameraOptionsKeyRef = React.useRef(null);
        const [state, setState] = React.useState('unavailable');
        const [attached, setAttached] = React.useState(false);

        React.useEffect(() => {
            if (!isSupported()) {
                return undefined;
            }

            let isActive = true;
            const subscription = addNavigationCameraStateListener((event) => {
                if (isActive && event?.surfaceId === surfaceId) {
                    setState(event.state ?? 'unavailable');
                }
            });

            return () => {
                isActive = false;
                subscription.remove();
            };
        }, [surfaceId]);

        React.useEffect(() => {
            if (!enabled || !isSupported()) {
                setAttached(false);
                return undefined;
            }

            const mapViewTag = getMapViewTag(options.mapViewRef);

            if (!mapViewTag) {
                setAttached(false);
                return undefined;
            }

            let isActive = true;

            // A deferred marker may remain in props while a surface remounts. An
            // attached camera must start with its current options, not revive an old
            // deferred update after it begins following.
            attachNavigationCameraAsync(surfaceId, mapViewTag, cameraOptions)
                .then((attachedCamera) => {
                    if (!isActive) {
                        return;
                    }

                    attachedCameraOptionsKeyRef.current = cameraOptionsKey;
                    setAttached(attachedCamera);
                })
                .catch(() => {
                    if (isActive) {
                        setAttached(false);
                    }
                });

            return () => {
                isActive = false;
                attachedCameraOptionsKeyRef.current = null;
                setAttached(false);
                detachNavigationCameraAsync(surfaceId).catch(() => {});
            };
        }, [attachKey, enabled, options.mapViewRef, surfaceId]);

        React.useEffect(() => {
            if (!enabled || !attached || !isSupported()) {
                return undefined;
            }

            if (attachedCameraOptionsKeyRef.current === cameraOptionsKey) {
                attachedCameraOptionsKeyRef.current = null;
                return undefined;
            }

            updateNavigationCameraOptionsAsync(surfaceId, cameraOptions).catch(
                () => {},
            );

            return undefined;
        }, [attached, cameraOptionsKey, enabled, surfaceId]);

        // Native surfaces decide whether an option snapshot can be applied
        // immediately based on their current following state. Keep mode changes
        // separate so only a location update frames the queued snapshot.
        React.useEffect(() => {
            if (!enabled || !attached || !isSupported()) {
                return undefined;
            }

            setNavigationCameraModeAsync(surfaceId, mode).catch(() => {});

            return undefined;
        }, [attached, enabled, mode, surfaceId]);

        return {
            attached,
            isSupported: isSupported(),
            state,
        };
    }

    return {
        addNavigationCameraStateListener,
        addEnhancedLocationListener,
        addRawLocationListener,
        addTripSessionStateListener,
        applyNavigationPuck3DAsync,
        attachNavigationCameraAsync,
        clearNavigationPuck3DAsync,
        detachNavigationCameraAsync,
        getLastEnhancedLocationAsync,
        getTripSessionStateAsync,
        isNavigationPuck3DSupported,
        isSupported,
        setNavigationCameraModeAsync,
        startTripSessionAsync,
        stopTripSessionAsync,
        updateNavigationCameraOptionsAsync,
        useEnhancedLocation,
        useNavigationCamera,
        useNavigationTripSession,
    };
}

module.exports = createNavigationModule;
