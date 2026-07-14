import Combine
import CoreLocation
import ExpoModulesCore
@_spi(Experimental) import MapboxMaps
import MapboxNavigationCore
import UIKit

// MARK: - Constants

private let MODULE_NAME = "RNMapboxNavigation"
private let ENHANCED_LOCATION_EVENT_NAME = "onEnhancedLocation"
private let RAW_LOCATION_EVENT_NAME = "onRawLocation"
private let TRIP_SESSION_STATE_EVENT_NAME = "onTripSessionState"
private let NAVIGATION_CAMERA_STATE_EVENT_NAME = "onNavigationCameraState"

private let TRIP_SESSION_STATE_STARTED = "started"
private let TRIP_SESSION_STATE_STOPPED = "stopped"
private let TRIP_SESSION_STATE_UNAVAILABLE = "unavailable"

private let NAVIGATION_CAMERA_MODE_FOLLOWING = "following"
private let NAVIGATION_CAMERA_MODE_IDLE = "idle"

private let MAXIMUM_LOCATION_TRANSITION_INTERVAL: TimeInterval = 5.0

// MARK: - Expo module

/// iOS counterpart of the Android `RNMapboxNavigationModule`.
///
/// This bridges the Mapbox Navigation SDK for iOS (`MapboxNavigationCore`) free-drive / passive
/// trip session so React Native receives the same map-matched ("enhanced") locations, raw
/// locations, trip-session state and navigation-camera control that the Android side provides.
///
/// All navigation work is delegated to ``RNMapboxNavigationController`` (a `@MainActor`
/// app-lifetime singleton) because every `MapboxNavigation` entry point is main-actor isolated
/// and the `MapboxNavigationProvider` must never be instantiated twice.
public final class RNMapboxNavigationModule: Module {
  public func definition() -> ModuleDefinition {
    Name(MODULE_NAME)

    Events(
      ENHANCED_LOCATION_EVENT_NAME,
      NAVIGATION_CAMERA_STATE_EVENT_NAME,
      RAW_LOCATION_EVENT_NAME,
      TRIP_SESSION_STATE_EVENT_NAME
    )

    OnCreate {
      let module = self
      Task { @MainActor in
        RNMapboxNavigationController.shared.attach(module)
      }
    }

    AsyncFunction("startTripSession") { (withForegroundService: Bool) in
      try await RNMapboxNavigationController.shared.startTripSession(
        withForegroundService: withForegroundService
      )
    }

    AsyncFunction("stopTripSession") {
      await RNMapboxNavigationController.shared.stopTripSession()
    }

    AsyncFunction("getTripSessionState") { () async -> String in
      await RNMapboxNavigationController.shared.getTripSessionState()
    }

    AsyncFunction("getLastEnhancedLocation") { () async -> [String: Any]? in
      await RNMapboxNavigationController.shared.getLastEnhancedLocation()
    }

    AsyncFunction("applyNavigationPuck3D") { (mapViewTag: Int, scale: Double) async throws -> Bool in
      let mapView = try await self.resolveMapView(tag: mapViewTag)
      return try await self.applyNavigationPuck3D(to: mapView, scale: scale)
    }

    AsyncFunction("clearNavigationPuck3D") { (mapViewTag: Int) async throws -> Bool in
      let mapView = try await self.resolveMapView(tag: mapViewTag)
      return try await self.clearNavigationPuck3D(from: mapView)
    }

    AsyncFunction("attachNavigationCamera") { (surfaceId: String, mapViewTag: Int, options: [String: Any]?) async throws -> Bool in
      let mapView = try await self.resolveMapView(tag: mapViewTag)
      return try await RNMapboxNavigationController.shared.attachNavigationCamera(
        surfaceId: surfaceId,
        mapView: mapView,
        options: options
      )
    }

    AsyncFunction("detachNavigationCamera") { (surfaceId: String) async -> Bool in
      await RNMapboxNavigationController.shared.detachNavigationCamera(surfaceId: surfaceId)
    }

    AsyncFunction("setNavigationCameraMode") { (surfaceId: String, mode: String) async -> Bool in
      await RNMapboxNavigationController.shared.setNavigationCameraMode(surfaceId: surfaceId, mode: mode)
    }

    AsyncFunction("updateNavigationCameraOptions") { (surfaceId: String, options: [String: Any]?) async -> Bool in
      await RNMapboxNavigationController.shared.updateNavigationCameraOptions(
        surfaceId: surfaceId,
        options: options
      )
    }

    OnDestroy {
      let module = self
      Task { @MainActor in
        RNMapboxNavigationController.shared.detach(module)
      }
    }
  }

  /// Resolves a React Native view tag to the underlying `MapboxMaps.MapView` owned by
  /// `@rnmapbox/maps`' `RNMBXMapView`. On the New Architecture (Fabric) the tag resolves to the
  /// component-view wrapper, so we recurse the view tree looking for the concrete `MapView`
  /// instance (which `RNMBXMapView` adds as a subview). This needs only `MapboxMaps`, so the module
  /// does not have to link or import `@rnmapbox/maps`.
  @MainActor
  private func resolveMapView(tag: Int) throws -> MapView {
    guard let resolvedView = appContext?.findView(withTag: tag, ofType: UIView.self) else {
      throw NavigationCameraException("Map view with tag \(tag) could not be resolved.")
    }

    guard let mapView = RNMapboxNavigationModule.findMapView(in: resolvedView) else {
      throw NavigationCameraException("Resolved view \(tag) does not contain a Mapbox map view.")
    }

    return mapView
  }

  @MainActor
  private static func findMapView(in view: UIView) -> MapView? {
    if let mapView = view as? MapView {
      return mapView
    }

    for subview in view.subviews {
      if let mapView = findMapView(in: subview) {
        return mapView
      }
    }

    return nil
  }

  @MainActor
  private func applyNavigationPuck3D(to mapView: MapView, scale: Double) throws -> Bool {
    guard let location = mapView.location else {
      throw NavigationPuckException("Mapbox location component is unavailable.")
    }

    guard let modelURL = Self.navigationPuckModelURL() else {
      throw NavigationPuckException("Bundled navigation_puck.glb could not be found.")
    }

    let resolvedScale = min(max(scale, 16), 128)
    let model = Model(
      id: "drivers-against-flock-navigation-puck",
      uri: modelURL,
      orientation: [0, 0, 0]
    )
    let configuration = Puck3DConfiguration(
      model: model,
      modelScale: .constant([resolvedScale, resolvedScale, resolvedScale]),
      modelCastShadows: .constant(false),
      modelReceiveShadows: .constant(false),
      modelEmissiveStrength: .constant(1)
    )

    location.options.puckType = .puck3D(configuration)
    location.options.puckBearing = .heading
    location.options.puckBearingEnabled = true

    return true
  }

  @MainActor
  private func clearNavigationPuck3D(from mapView: MapView) throws -> Bool {
    guard let location = mapView.location else {
      throw NavigationPuckException("Mapbox location component is unavailable.")
    }

    guard
      let puckType = location.options.puckType,
      case .puck3D = puckType
    else {
      return false
    }

    location.options.puckType = nil

    return true
  }

  private static func navigationPuckModelURL() -> URL? {
    let bundles = [Bundle.main, Bundle(for: RNMapboxNavigationModule.self)]

    for bundle in bundles {
      if let url = bundle.url(forResource: "navigation_puck", withExtension: "glb") {
        return url
      }
    }

    return nil
  }
}

// MARK: - Errors

private struct MissingLocationPermissionException: LocalizedError {
  var errorDescription: String? {
    "Location permission is required to start a Mapbox Navigation trip session."
  }
}

private struct MissingAccessTokenException: LocalizedError {
  var errorDescription: String? {
    "A Mapbox access token is required to start Mapbox Navigation. Set it via Mapbox.setAccessToken(...) "
      + "(EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN) before starting a trip session or attaching the navigation camera."
  }
}

private struct NavigationCameraException: LocalizedError {
  private let message: String

  init(_ message: String) {
    self.message = message
  }

  var errorDescription: String? { message }
}

private struct NavigationPuckException: LocalizedError {
  private let message: String

  init(_ message: String) {
    self.message = message
  }

  var errorDescription: String? { message }
}

// MARK: - Controller

/// Owns the single ``MapboxNavigationProvider`` and all trip-session / camera state for the app's
/// lifetime. `@MainActor` isolated because every `MapboxNavigation` API is main-actor bound.
@MainActor
final class RNMapboxNavigationController {
  static let shared = RNMapboxNavigationController()

  private weak var module: RNMapboxNavigationModule?
  private var provider: MapboxNavigationProvider?
  private var cancellables = Set<AnyCancellable>()
  private var isSubscribed = false
  private var lastEnhancedLocation: [String: Any]?
  private var lastEnhancedCLLocation: CLLocation?
  private var cameraSurfaces = [String: NavigationCameraSurface]()
  private var lastLoggedSpeedLimitKey: String?

  private init() {}

  // MARK: Module lifecycle

  func attach(_ module: RNMapboxNavigationModule) {
    self.module = module
  }

  func detach(_ module: RNMapboxNavigationModule) {
    // Only tear down if the module being destroyed is the currently attached one. On a fast JS
    // reload a new module can attach before the old one is destroyed.
    guard self.module === module else {
      return
    }

    self.module = nil
    detachAllCameraSurfaces()
    stopTripSession()
    cancellables.removeAll()
    isSubscribed = false
  }

  // MARK: Trip session

  func startTripSession(withForegroundService: Bool) throws {
    guard hasLocationPermission() else {
      throw MissingLocationPermissionException()
    }

    let navigation = try ensureNavigation()
    subscribeIfNeeded(to: navigation)

    if !navigation.tripSession().currentSession.state.isTripSessionActive {
      navigation.tripSession().startFreeDrive()
    }
  }

  func stopTripSession() {
    provider?.mapboxNavigation.tripSession().setToIdle()
  }

  func getTripSessionState() -> String {
    guard let provider else {
      return TRIP_SESSION_STATE_UNAVAILABLE
    }

    return Self.tripSessionStateString(provider.mapboxNavigation.tripSession().currentSession.state)
  }

  func getLastEnhancedLocation() -> [String: Any]? {
    if let lastEnhancedLocation {
      return lastEnhancedLocation
    }

    // Fall back to the SDK's synchronous snapshot if we have not received an event yet.
    guard let state = provider?.mapboxNavigation.navigation().currentLocationMatching else {
      return nil
    }

    return enhancedLocationPayload(from: state)
  }

  // MARK: Navigation camera

  func attachNavigationCamera(surfaceId: String, mapView: MapView, options: [String: Any]?) throws -> Bool {
    // Camera framing needs the enhanced-location stream even when the JS side only attached the
    // camera; make sure we are subscribed.
    subscribeIfNeeded(to: try ensureNavigation())

    cameraSurfaces.removeValue(forKey: surfaceId)?.detach()

    let surface = NavigationCameraSurface(surfaceId: surfaceId, mapView: mapView) { [weak self] state in
      self?.sendNavigationCameraState(surfaceId: surfaceId, state: state)
    }
    surface.applyInitialOptions(options)

    if let lastEnhancedCLLocation {
      surface.onEnhancedLocation(lastEnhancedCLLocation)
    }

    cameraSurfaces[surfaceId] = surface
    return true
  }

  func detachNavigationCamera(surfaceId: String) -> Bool {
    cameraSurfaces.removeValue(forKey: surfaceId)?.detach()
    return true
  }

  func setNavigationCameraMode(surfaceId: String, mode: String) -> Bool {
    guard let surface = cameraSurfaces[surfaceId] else {
      return false
    }

    surface.setMode(mode)
    return true
  }

  func updateNavigationCameraOptions(surfaceId: String, options: [String: Any]?) -> Bool {
    guard let surface = cameraSurfaces[surfaceId] else {
      return false
    }

    surface.updateOptions(options)
    return true
  }

  // MARK: Provider + subscriptions

  private func ensureNavigation() throws -> MapboxNavigation {
    if let provider {
      return provider.mapboxNavigation
    }

    // `CoreConfig`'s `credentials` default is `ApiConfiguration.default`, which `assertionFailure`s
    // (a hard crash in debug builds) when it cannot find an access token in the app bundle's
    // Info.plist / UserDefaults. This app never writes `MBXAccessToken` to the Info.plist; it
    // registers the token at runtime via `Mapbox.setAccessToken(...)` (@rnmapbox/maps), which lands
    // in `MapboxOptions.accessToken` — a source `ApiConfiguration.default` never consults. Resolve
    // the token ourselves and pass explicit credentials so the SDK never reaches its asserting
    // default. `MapboxNavigationProvider` then mirrors this token back into `MapboxOptions`.
    guard let accessToken = Self.resolveAccessToken() else {
      throw MissingAccessTokenException()
    }

    // Only enable background matching if the app opted in via `UIBackgroundModes: ["location"]`.
    // Enabling background tracking without the entitlement makes CoreLocation crash the app.
    let backgroundModes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? []
    let allowsBackgroundTracking = backgroundModes.contains("location")

    let config = CoreConfig(
      credentials: NavigationCoreApiConfiguration(accessToken: accessToken),
      locationSource: .live,
      disableBackgroundTrackingLocation: !allowsBackgroundTracking
    )
    let created = MapboxNavigationProvider(coreConfig: config)
    provider = created
    return created.mapboxNavigation
  }

  /// Resolves the Mapbox access token from the runtime source `@rnmapbox/maps` populates
  /// (``MapboxOptions/accessToken``), falling back to the same bundle / `UserDefaults` locations the
  /// Navigation SDK's `ApiConfiguration.default` consults. Returns `nil` when no non-empty token is
  /// available so the caller can surface a catchable error instead of the SDK asserting.
  private static func resolveAccessToken() -> String? {
    let runtimeToken = MapboxOptions.accessToken
    if !runtimeToken.isEmpty {
      return runtimeToken
    }

    let bundleToken = (Bundle.main.object(forInfoDictionaryKey: "MBXAccessToken") as? String)
      ?? (Bundle.main.object(forInfoDictionaryKey: "MGLMapboxAccessToken") as? String)
      ?? UserDefaults.standard.string(forKey: "MBXAccessToken")

    if let bundleToken, !bundleToken.isEmpty {
      return bundleToken
    }

    return nil
  }

  private func subscribeIfNeeded(to navigation: MapboxNavigation) {
    guard !isSubscribed else {
      return
    }
    isSubscribed = true

    // Combine's `sink` closure is nonisolated, so hop back onto the main actor (where this
    // controller and every MapboxNavigation API live) before touching our state.
    navigation.navigation().locationMatching
      .sink { [weak self] state in
        Task { @MainActor in
          self?.handleLocationMatching(state)
        }
      }
      .store(in: &cancellables)

    navigation.tripSession().session
      .sink { [weak self] session in
        Task { @MainActor in
          self?.handleSession(session)
        }
      }
      .store(in: &cancellables)
  }

  private func handleLocationMatching(_ state: MapMatchingState) {
    postEvent(RAW_LOCATION_EVENT_NAME, Self.locationPayload(from: state.location))

    let payload = enhancedLocationPayload(from: state)
    lastEnhancedLocation = payload
    lastEnhancedCLLocation = state.enhancedLocation

    for surface in cameraSurfaces.values {
      surface.onEnhancedLocation(state.enhancedLocation)
    }

    postEvent(ENHANCED_LOCATION_EVENT_NAME, payload)
  }

  private func handleSession(_ session: Session) {
    postEvent(
      TRIP_SESSION_STATE_EVENT_NAME,
      ["state": Self.tripSessionStateString(session.state)]
    )
  }

  private func sendNavigationCameraState(surfaceId: String, state: String) {
    postEvent(
      NAVIGATION_CAMERA_STATE_EVENT_NAME,
      ["surfaceId": surfaceId, "state": state]
    )
  }

  /// Bridges `[String: Any]` to the `[String: Any?]` that `Module.sendEvent` expects (Swift does not
  /// convert the two dictionary types implicitly).
  private func postEvent(_ name: String, _ payload: [String: Any]) {
    guard let module else {
      return
    }

    var body = [String: Any?]()
    for (key, value) in payload {
      body[key] = value
    }
    module.sendEvent(name, body)
  }

  private func detachAllCameraSurfaces() {
    for surface in cameraSurfaces.values {
      surface.detach()
    }
    cameraSurfaces.removeAll()
  }

  // MARK: Payload builders

  private func enhancedLocationPayload(from state: MapMatchingState) -> [String: Any] {
    var payload = Self.locationPayload(from: state.enhancedLocation)

    let result = state.mapMatchingResult
    payload["isOffRoad"] = result.isOffRoad
    payload["isTeleport"] = result.isTeleport
    payload["offRoadProbability"] = result.offRoadProbability
    payload["roadEdgeMatchProbability"] = result.roadEdgeMatchProbability

    if let roadContext = Self.roadContextPayload(from: state) {
      payload["roadContext"] = roadContext
    }

    if let speedLimit = speedLimitPayload(from: state.speedLimit) {
      payload["speedLimit"] = speedLimit
    }

    return payload
  }

  private static func locationPayload(from location: CLLocation) -> [String: Any] {
    var payload: [String: Any] = [
      "latitude": location.coordinate.latitude,
      "longitude": location.coordinate.longitude,
    ]

    if location.horizontalAccuracy >= 0 {
      payload["accuracy"] = location.horizontalAccuracy
      payload["horizontalAccuracy"] = location.horizontalAccuracy
    }

    if location.verticalAccuracy >= 0 {
      payload["altitude"] = location.altitude
    }

    if location.course >= 0 {
      payload["bearing"] = location.course
      payload["course"] = location.course
    }

    if location.speed >= 0 {
      payload["speed"] = location.speed
    }

    payload["timestamp"] = location.timestamp.timeIntervalSince1970 * 1000

    return payload
  }

  private static func roadContextPayload(from state: MapMatchingState) -> [String: Any]? {
    let edgeMatchProbability = state.mapMatchingResult.roadEdgeMatchProbability
    let primaryText = state.roadName?.text.trimmingCharacters(in: .whitespacesAndNewlines)
    let hasPrimaryText = !(primaryText?.isEmpty ?? true)

    guard hasPrimaryText || edgeMatchProbability > 0 else {
      return nil
    }

    var components: [[String: Any]] = []
    if let component = roadComponentPayload(from: state.roadName) {
      components.append(component)
    }

    var roadContext: [String: Any] = [
      "edgeMatchProbability": edgeMatchProbability,
      "isOffRoad": state.mapMatchingResult.isOffRoad,
      "components": components,
      "road": ["components": components],
    ]

    if hasPrimaryText, let primaryText {
      roadContext["primaryText"] = primaryText
    }

    return roadContext
  }

  private static func roadComponentPayload(from roadName: RoadName?) -> [String: Any]? {
    guard let roadName else {
      return nil
    }

    let text = roadName.text.trimmingCharacters(in: .whitespacesAndNewlines)
    let language = roadName.language.trimmingCharacters(in: .whitespacesAndNewlines)
    let imageBaseUrl = roadName.shield?.baseUrl.trimmingCharacters(in: .whitespacesAndNewlines)

    if text.isEmpty && language.isEmpty && (imageBaseUrl?.isEmpty ?? true) {
      return nil
    }

    var component: [String: Any] = [:]
    if !text.isEmpty {
      component["text"] = text
    }
    if !language.isEmpty {
      component["language"] = language
    }
    if let imageBaseUrl, !imageBaseUrl.isEmpty {
      component["imageBaseUrl"] = imageBaseUrl
    }

    return component.isEmpty ? nil : component
  }

  private func speedLimitPayload(from speedLimit: SpeedLimit) -> [String: Any]? {
    guard let value = speedLimit.value else {
      return nil
    }

    let speed = value.value
    let unit = value.unit.symbol
    let speedLimitMph = value.converted(to: .milesPerHour).value
    let sign = Self.signStandardString(speedLimit.signStandard)

    logSpeedLimitIfChanged(speed: speed, unit: unit, sign: sign, speedLimitMph: speedLimitMph)

    return [
      "speed": speed,
      "speedLimitMph": speedLimitMph,
      "unit": unit,
      "sign": sign,
    ]
  }

  private func logSpeedLimitIfChanged(speed: Double, unit: String, sign: String, speedLimitMph: Double) {
    let key = "\(speed):\(unit):\(sign)"
    guard lastLoggedSpeedLimitKey != key else {
      return
    }
    lastLoggedSpeedLimitKey = key

    NSLog(
      "[RNMapboxNavigation] Speed limit parsed: speed=%@, unit=%@, sign=%@, speedLimitMph=%@",
      String(speed), unit, sign, String(speedLimitMph)
    )
  }

  // MARK: Value mapping

  private static func tripSessionStateString(_ state: Session.State) -> String {
    switch state {
    case .idle:
      return TRIP_SESSION_STATE_STOPPED
    case .freeDrive(let freeDriveState):
      switch freeDriveState {
      case .active:
        return TRIP_SESSION_STATE_STARTED
      case .paused:
        return TRIP_SESSION_STATE_STOPPED
      @unknown default:
        return TRIP_SESSION_STATE_STOPPED
      }
    case .activeGuidance:
      return TRIP_SESSION_STATE_STARTED
    @unknown default:
      return TRIP_SESSION_STATE_STOPPED
    }
  }

  /// `SignStandard` lives in `MapboxDirections`; use a reflection-based mapping so this module does
  /// not have to import it. The SDK reports either MUTCD (US) or Vienna Convention signs.
  private static func signStandardString(_ signStandard: Any) -> String {
    let raw = String(describing: signStandard).lowercased()
    if raw.contains("vienna") {
      return "vienna"
    }
    if raw.contains("mutcd") {
      return "mutcd"
    }
    return raw
  }

  private func hasLocationPermission() -> Bool {
    let status = CLLocationManager().authorizationStatus
    switch status {
    case .denied, .restricted:
      return false
    default:
      // `.notDetermined` is allowed: the SDK's location manager triggers the system prompt.
      return true
    }
  }
}

// MARK: - Camera surface

/// Mirrors the Android `NavigationCameraSurface`. Instead of the Navigation SDK's `NavigationCamera`
/// (which is compiled against the nav SDK's own pinned MapboxMaps and expects a route), this eases
/// the externally-owned map's camera to each map-matched location — the free-drive equivalent of
/// Android's `MapboxNavigationViewportDataSource.onLocationChanged` following behaviour, and it
/// stays entirely within the MapboxMaps instance `@rnmapbox/maps` already resolved.
@MainActor
private final class NavigationCameraSurface {
  private struct CameraOptionsSnapshot {
    let locationUpdateTimestamp: Int64?
    let paddingTop: Double
    let paddingLeft: Double
    let paddingBottom: Double
    let paddingRight: Double
    let zoom: Double?
    let pitch: Double?
  }

  private let surfaceId: String
  private weak var mapView: MapView?
  private let onStateChanged: @MainActor (String) -> Void

  private var mode = NAVIGATION_CAMERA_MODE_IDLE
  private var paddingTop: Double = 0
  private var paddingLeft: Double = 0
  private var paddingBottom: Double = 0
  private var paddingRight: Double = 0
  private var zoom: Double?
  private var pitch: Double?
  private var followingStateIsPending = false
  private var lastLocationBoundOptionsAtMs: Int64?
  private var locationTransitionEndsAtUptime: TimeInterval?
  private var lastLocationUpdateUptime: TimeInterval?
  private var latestEnhancedLocation: CLLocation?
  private var optionsLocationUpdateTimestamp: Int64?
  private var pendingOptions: CameraOptionsSnapshot?
  private var recentEnhancedLocations = [Int64: CLLocation]()
  private var recentEnhancedLocationTimestamps = [Int64]()

  init(surfaceId: String, mapView: MapView, onStateChanged: @escaping @MainActor (String) -> Void) {
    self.surfaceId = surfaceId
    self.mapView = mapView
    self.onStateChanged = onStateChanged
  }

  func applyInitialOptions(_ options: [String: Any]?) {
    let nextOptions = Self.optionsSnapshot(options)

    pendingOptions = nil
    applyOptions(nextOptions)
  }

  func updateOptions(_ options: [String: Any]?) {
    let nextOptions = Self.optionsSnapshot(options)

    guard mode == NAVIGATION_CAMERA_MODE_FOLLOWING else {
      pendingOptions = nil
      applyOptions(nextOptions)
      return
    }

    let locationUpdateTimestamp = nextOptions.locationUpdateTimestamp
    let appliesToCurrentLocation = locationUpdateTimestamp != nil
      && locationUpdateTimestamp != lastLocationBoundOptionsAtMs

    if appliesToCurrentLocation, let locationUpdateTimestamp {
      pendingOptions = nil
      applyOptions(nextOptions)
      lastLocationBoundOptionsAtMs = locationUpdateTimestamp

      if let location = recentEnhancedLocations[locationUpdateTimestamp] ?? latestEnhancedLocation {
        applyCamera(to: location, duration: remainingLocationTransitionDuration())
        publishFollowingStateIfNeeded()
      }
      return
    }

    // Keep the latest passive camera snapshot until a fresh matched location
    // frames it. Applying it now would animate to the previous location.
    pendingOptions = nextOptions
  }

  func setMode(_ mode: String) {
    let nextMode = mode == NAVIGATION_CAMERA_MODE_FOLLOWING
      ? NAVIGATION_CAMERA_MODE_FOLLOWING
      : NAVIGATION_CAMERA_MODE_IDLE

    guard self.mode != nextMode else {
      return
    }

    self.mode = nextMode

    if nextMode == NAVIGATION_CAMERA_MODE_FOLLOWING {
      followingStateIsPending = true

      if
        let optionsLocationUpdateTimestamp,
        let location = recentEnhancedLocations[optionsLocationUpdateTimestamp]
      {
        applyCamera(to: location, duration: 0)
        lastLocationBoundOptionsAtMs = optionsLocationUpdateTimestamp
        publishFollowingStateIfNeeded()
      }
    } else {
      followingStateIsPending = false
      lastLocationBoundOptionsAtMs = nil
      locationTransitionEndsAtUptime = nil
      lastLocationUpdateUptime = nil
      if let pendingOptions {
        applyOptions(pendingOptions)
      }
      pendingOptions = nil
      mapView?.camera.cancelAnimations()
      onStateChanged(NAVIGATION_CAMERA_MODE_IDLE)
    }
  }

  func onEnhancedLocation(_ location: CLLocation) {
    rememberEnhancedLocation(location)

    guard mode == NAVIGATION_CAMERA_MODE_FOLLOWING else {
      return
    }

    let transitionDuration = nextLocationTransitionDuration()
    locationTransitionEndsAtUptime = transitionDuration > 0
      ? ProcessInfo.processInfo.systemUptime + transitionDuration
      : nil

    if let pendingOptions {
      self.pendingOptions = nil
      applyOptions(pendingOptions)
    }

    applyCamera(to: location, duration: transitionDuration)
    publishFollowingStateIfNeeded()
  }

  func detach() {
    followingStateIsPending = false
    lastLocationBoundOptionsAtMs = nil
    locationTransitionEndsAtUptime = nil
    lastLocationUpdateUptime = nil
    latestEnhancedLocation = nil
    optionsLocationUpdateTimestamp = nil
    pendingOptions = nil
    recentEnhancedLocations.removeAll()
    recentEnhancedLocationTimestamps.removeAll()
    mapView?.camera.cancelAnimations()
    onStateChanged(NAVIGATION_CAMERA_MODE_IDLE)
    mapView = nil
  }

  private func applyOptions(_ options: CameraOptionsSnapshot) {
    optionsLocationUpdateTimestamp = options.locationUpdateTimestamp
    paddingTop = options.paddingTop
    paddingLeft = options.paddingLeft
    paddingBottom = options.paddingBottom
    paddingRight = options.paddingRight
    zoom = options.zoom
    pitch = options.pitch
  }

  private func publishFollowingStateIfNeeded() {
    guard followingStateIsPending else {
      return
    }

    followingStateIsPending = false
    lastLocationBoundOptionsAtMs = optionsLocationUpdateTimestamp
    onStateChanged(NAVIGATION_CAMERA_MODE_FOLLOWING)
  }

  private func rememberEnhancedLocation(_ location: CLLocation) {
    latestEnhancedLocation = location

    let timestamp = Self.locationTimestampMilliseconds(location)
    recentEnhancedLocations[timestamp] = location
    recentEnhancedLocationTimestamps.removeAll { $0 == timestamp }
    recentEnhancedLocationTimestamps.append(timestamp)

    while recentEnhancedLocationTimestamps.count > 8 {
      let oldestTimestamp = recentEnhancedLocationTimestamps.removeFirst()
      recentEnhancedLocations.removeValue(forKey: oldestTimestamp)
    }
  }

  private func applyCamera(to location: CLLocation, duration: TimeInterval) {
    guard let mapView else {
      return
    }

    let cameraOptions = CameraOptions(
      center: location.coordinate,
      padding: UIEdgeInsets(
        top: paddingTop,
        left: paddingLeft,
        bottom: paddingBottom,
        right: paddingRight
      ),
      zoom: zoom.map { CGFloat($0) },
      bearing: location.course >= 0 ? location.course : nil,
      pitch: pitch.map { CGFloat($0) }
    )

    mapView.camera.cancelAnimations()

    if duration > 0 {
      _ = mapView.camera.ease(to: cameraOptions, duration: duration)
    } else {
      mapView.mapboxMap.setCamera(to: cameraOptions)
    }
  }

  private func nextLocationTransitionDuration() -> TimeInterval {
    let now = ProcessInfo.processInfo.systemUptime
    defer {
      lastLocationUpdateUptime = now
    }

    guard let previousUpdateUptime = lastLocationUpdateUptime else {
      return 0
    }

    let interval = now - previousUpdateUptime

    guard interval > 0, interval <= MAXIMUM_LOCATION_TRANSITION_INTERVAL else {
      return 0
    }

    return interval
  }

  private func remainingLocationTransitionDuration() -> TimeInterval {
    guard let locationTransitionEndsAtUptime else {
      return 0
    }

    return max(
      0,
      locationTransitionEndsAtUptime - ProcessInfo.processInfo.systemUptime
    )
  }

  private static func double(_ value: Any?) -> Double? {
    switch value {
    case let doubleValue as Double:
      return doubleValue
    case let intValue as Int:
      return Double(intValue)
    case let numberValue as NSNumber:
      return numberValue.doubleValue
    default:
      return nil
    }
  }

  private static func locationTimestampMilliseconds(_ location: CLLocation) -> Int64 {
    Int64(location.timestamp.timeIntervalSince1970 * 1000)
  }

  private static func optionsSnapshot(_ options: [String: Any]?) -> CameraOptionsSnapshot {
    let padding = options?["padding"] as? [String: Any]

    return CameraOptionsSnapshot(
      locationUpdateTimestamp: double(options?["locationUpdateTimestamp"]).map { Int64($0) },
      paddingTop: double(padding?["paddingTop"]) ?? 0,
      paddingLeft: double(padding?["paddingLeft"]) ?? 0,
      paddingBottom: double(padding?["paddingBottom"]) ?? 0,
      paddingRight: double(padding?["paddingRight"]) ?? 0,
      zoom: double(options?["zoomLevel"]),
      pitch: double(options?["pitch"])
    )
  }
}
