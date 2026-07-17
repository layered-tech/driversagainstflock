export type EnhancedLocation = {
    accuracy?: number;
    altitude?: number;
    bearing?: number;
    course?: number;
    horizontalAccuracy?: number;
    inTunnel?: boolean;
    isDegradedMapMatching?: boolean;
    isOffRoad?: boolean;
    isTeleport?: boolean;
    latitude: number;
    longitude: number;
    offRoadProbability?: number;
    roadContext?: RoadContext;
    roadEdgeId?: string;
    roadEdgeMatchProbability?: number;
    speed?: number;
    speedLimit?: {
        sign?: string;
        speed: number;
        speedLimitMph: number;
        unit: 'km/h' | 'm/s' | 'mph' | string;
    };
    timestamp?: number;
    zLevel?: number;
};

export type RawLocation = EnhancedLocation;

/** GeoJSON coordinate order: [longitude, latitude]. */
export type ElectronicHorizonCoordinate = [number, number];

/** A single Mapbox Electronic Horizon road-graph edge. */
export type ElectronicHorizonSegment = {
    coordinates: ElectronicHorizonCoordinate[];
    /** The native edge identifier is stringified to preserve 64-bit precision in JavaScript. */
    edgeId: string;
    /** Whether the edge belongs to the active route; always false during free drive. */
    isOnRoute?: boolean;
    /** 0 is the most-probable path; higher values are progressively further branches. */
    level: number;
    probability: number;
};

export type ElectronicHorizon = {
    /**
     * The one selected most-probable path. Alert calculations must use this geometry only;
     * `segments` is exposed so debug UI can label every level-zero edge.
     */
    primaryPath: {
        coordinates: ElectronicHorizonCoordinate[];
        segments: ElectronicHorizonSegment[];
    };
    graphPosition?: {
        edgeId: string;
        percentAlong: number;
    };
    resultType?: string;
    /** Unix timestamp in milliseconds. */
    updatedAt: number;
};

export type TripSessionState = 'started' | 'stopped' | 'unavailable' | string;

export type NavigationCameraMode = 'following' | 'idle';

export type MapboxStyleSlot = 'bottom' | 'middle' | 'top';

export type MapboxAppLayerId = 'directions-route-line';

export type NavigationCameraState =
    | 'following'
    | 'idle'
    | 'overview'
    | 'transition_to_following'
    | 'transition_to_overview'
    | 'unavailable'
    | string;

export type RoadComponent = {
    imageBaseUrl?: string;
    language?: string;
    text?: string;
};

export type RoadContext = {
    components?: RoadComponent[];
    edgeId?: string;
    edgeMatchProbability?: number;
    inTunnel?: boolean;
    isDegradedMapMatching?: boolean;
    isOffRoad?: boolean;
    primaryText?: string;
    road?: {
        components?: RoadComponent[];
    };
    zLevel?: number;
};

export type EventSubscription = {
    remove(): void;
};

export type StartTripSessionOptions = {
    foregroundService?: boolean;
};

export type UseEnhancedLocationOptions = StartTripSessionOptions & {
    enabled?: boolean;
};

export type UseElectronicHorizonOptions = StartTripSessionOptions & {
    enabled?: boolean;
};

export type NavigationCameraOptions = {
    locationUpdateTimestamp?: number;
    padding?: {
        paddingBottom?: number;
        paddingLeft?: number;
        paddingRight?: number;
        paddingTop?: number;
    };
    pitch?: number;
    zoomLevel?: number;
};

export type UseNavigationCameraOptions = {
    attachKey?: string | number;
    cameraOptions?: NavigationCameraOptions;
    enabled?: boolean;
    mapViewRef?: { current?: unknown } | unknown;
    mode?: NavigationCameraMode;
    surfaceId?: string;
};

export type AndroidAutoLifecycleState =
    | 'willAppear'
    | 'didAppear'
    | 'willDisappear'
    | 'didDisappear';

export declare function isSupported(): boolean;
/** Whether this native build exposes Mapbox Electronic Horizon. */
export declare function isElectronicHorizonSupported(): boolean;
/** Whether this Android build can bind Mapbox Navigation to the car session. */
export declare function isAndroidAutoLifecycleSupported(): boolean;
export declare function activateAndroidAutoLifecycleAsync(): Promise<boolean>;
export declare function deactivateAndroidAutoLifecycleAsync(): Promise<boolean>;
export declare function updateAndroidAutoLifecycleStateAsync(
    state: AndroidAutoLifecycleState,
): Promise<boolean>;
export declare function isNavigationPuck3DSupported(): boolean;
export declare function applyNavigationPuck3DAsync(
    mapViewRef: { current?: unknown } | unknown,
    scale: number,
    slot?: MapboxStyleSlot,
    layerAbove?: MapboxAppLayerId,
): Promise<boolean>;
export declare function clearNavigationPuck3DAsync(
    mapViewRef: { current?: unknown } | unknown,
): Promise<boolean>;
export declare function startTripSessionAsync(
    options?: StartTripSessionOptions,
): Promise<boolean>;
export declare function stopTripSessionAsync(): Promise<boolean>;
export declare function getTripSessionStateAsync(): Promise<TripSessionState>;
export declare function getLastEnhancedLocationAsync(): Promise<EnhancedLocation | null>;
export declare function getLastElectronicHorizonAsync(): Promise<ElectronicHorizon | null>;
export declare function attachNavigationCameraAsync(
    surfaceId: string,
    mapViewTag: number,
    options?: NavigationCameraOptions,
): Promise<boolean>;
export declare function detachNavigationCameraAsync(
    surfaceId: string,
): Promise<boolean>;
export declare function setNavigationCameraModeAsync(
    surfaceId: string,
    mode: NavigationCameraMode,
): Promise<boolean>;
export declare function updateNavigationCameraOptionsAsync(
    surfaceId: string,
    options?: NavigationCameraOptions,
): Promise<boolean>;
export declare function addEnhancedLocationListener(
    listener: (location: EnhancedLocation) => void,
): EventSubscription;
export declare function addElectronicHorizonListener(
    listener: (event: ElectronicHorizon) => void,
): EventSubscription;
export declare function addRawLocationListener(
    listener: (location: RawLocation) => void,
): EventSubscription;
export declare function addTripSessionStateListener(
    listener: (event: { state: TripSessionState }) => void,
): EventSubscription;
export declare function addNavigationCameraStateListener(
    listener: (event: {
        state: NavigationCameraState;
        surfaceId: string;
    }) => void,
): EventSubscription;
export declare function useEnhancedLocation(
    options?: UseEnhancedLocationOptions,
): EnhancedLocation | null;
export declare function useElectronicHorizon(
    options?: UseElectronicHorizonOptions,
): ElectronicHorizon | null;
export declare function useNavigationCamera(
    options?: UseNavigationCameraOptions,
): {
    attached: boolean;
    isSupported: boolean;
    state: NavigationCameraState;
};
export declare function useNavigationTripSession(): {
    isSupported: boolean;
    startTripSession(options?: StartTripSessionOptions): Promise<boolean>;
    state: TripSessionState;
    stopTripSession(): Promise<boolean>;
};
