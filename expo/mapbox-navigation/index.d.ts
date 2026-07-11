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
    unit: "km/h" | "m/s" | "mph" | string;
  };
  timestamp?: number;
  zLevel?: number;
};

export type RawLocation = EnhancedLocation;

export type TripSessionState = "started" | "stopped" | "unavailable" | string;

export type NavigationCameraMode = "following" | "idle";

export type NavigationCameraState =
  | "following"
  | "idle"
  | "overview"
  | "transition_to_following"
  | "transition_to_overview"
  | "unavailable"
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

export type NavigationCameraOptions = {
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

export declare function isSupported(): boolean;
export declare function startTripSessionAsync(
  options?: StartTripSessionOptions,
): Promise<boolean>;
export declare function stopTripSessionAsync(): Promise<boolean>;
export declare function getTripSessionStateAsync(): Promise<TripSessionState>;
export declare function getLastEnhancedLocationAsync(): Promise<EnhancedLocation | null>;
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
export declare function useNavigationCamera(options?: UseNavigationCameraOptions): {
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
