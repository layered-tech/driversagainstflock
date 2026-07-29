import Combine
import CoreLocation
import CryptoKit
import ExpoModulesCore
import Foundation
@_spi(Experimental) import MapboxMaps
import os
import UIKit

private let locationPuckModelLayer = "puck-model-layer"
private let locationPuckModelSource = "puck-model-source"
private let locationPuckIndicatorLayer = "puck"
private let cameraFollowTransitionTimeoutMilliseconds = 1_000
private let mapPerformanceSignpostLog = OSLog(
  subsystem: Bundle.main.bundleIdentifier ?? "com.anonymous.drivefree",
  category: "PointsOfInterest"
)

@MainActor
private final class CameraFollowTransitionCompletion {
  private var continuation: CheckedContinuation<Bool, Never>?

  init(_ continuation: CheckedContinuation<Bool, Never>) {
    self.continuation = continuation
  }

  func resolve(_ result: Bool) {
    guard let continuation else {
      return
    }

    self.continuation = nil
    continuation.resume(returning: result)
  }
}

@MainActor
private final class OwnedLocationProviderState {
  let dataModel: LocationDataModel
  private(set) var previousDataModel: LocationDataModel
  private(set) var latestHeading: Heading
  private(set) var latestLocation: Location
  private(set) var latestRecordedAt: Double?

  private let headingSubject: CurrentValueSubject<Heading, Never>
  private let locationSubject: CurrentValueSubject<[Location], Never>

  init(
    previousDataModel: LocationDataModel,
    location: Location,
    heading: Heading,
    recordedAt: Double?
  ) {
    let headingSubject = CurrentValueSubject<Heading, Never>(heading)
    let locationSubject = CurrentValueSubject<[Location], Never>([location])

    self.headingSubject = headingSubject
    self.locationSubject = locationSubject
    self.latestHeading = heading
    self.latestLocation = location
    self.latestRecordedAt = recordedAt
    self.previousDataModel = previousDataModel
    self.dataModel = LocationDataModel(
      location: locationSubject.eraseToAnyPublisher(),
      heading: headingSubject.eraseToAnyPublisher()
    )
  }

  func reassertOwnership(on locationManager: LocationManager) {
    guard locationManager.dataModel !== dataModel else {
      return
    }

    previousDataModel = locationManager.dataModel
    locationManager.dataModel = dataModel
  }

  func update(location: Location, heading: Heading, recordedAt: Double?) {
    if
      let recordedAt,
      let latestRecordedAt,
      recordedAt < latestRecordedAt
    {
      return
    }

    // Publish heading first so the next puck position renders with the matching
    // orientation. Both values are delivered synchronously on the main actor.
    latestHeading = heading
    latestLocation = location
    latestRecordedAt = recordedAt ?? latestRecordedAt
    headingSubject.send(heading)
    locationSubject.send([location])
  }
}

public final class MapLocationPuckModule: Module {
  private let cameraFollowStates = NSMapTable<MapView, FollowPuckViewportState>(
    keyOptions: .weakMemory,
    valueOptions: .strongMemory
  )
  private let locationProviderStates = NSMapTable<MapView, OwnedLocationProviderState>(
    keyOptions: .weakMemory,
    valueOptions: .strongMemory
  )
  private let mapPerformanceSignpostLock = NSLock()
  private var mapPerformanceSignpostIDs: [String: OSSignpostID] = [:]

  public func definition() -> ModuleDefinition {
    Name("MapLocationPuck")

    Function("beginMapPerformanceSignpost") {
      (operation: String, identifier: String, detail: String) -> Bool in
      guard !operation.isEmpty, !identifier.isEmpty else {
        return false
      }

      let signpostID = OSSignpostID(log: mapPerformanceSignpostLog)

      self.mapPerformanceSignpostLock.lock()
      self.mapPerformanceSignpostIDs[identifier] = signpostID
      self.mapPerformanceSignpostLock.unlock()

      os_signpost(
        .begin,
        log: mapPerformanceSignpostLog,
        name: "Map Pipeline",
        signpostID: signpostID,
        "%{public}s %{public}s",
        operation,
        detail
      )

      return true
    }

    Function("endMapPerformanceSignpost") {
      (operation: String, identifier: String, detail: String) -> Bool in
      self.mapPerformanceSignpostLock.lock()
      let signpostID = self.mapPerformanceSignpostIDs.removeValue(forKey: identifier)
      self.mapPerformanceSignpostLock.unlock()

      guard !operation.isEmpty, let signpostID else {
        return false
      }

      os_signpost(
        .end,
        log: mapPerformanceSignpostLog,
        name: "Map Pipeline",
        signpostID: signpostID,
        "%{public}s %{public}s",
        operation,
        detail
      )

      return true
    }

    Function("recordMapPerformanceSignpost") {
      (operation: String, detail: String) -> Bool in
      guard !operation.isEmpty else {
        return false
      }

      os_signpost(
        .event,
        log: mapPerformanceSignpostLog,
        name: "Map Pipeline",
        "%{public}s %{public}s",
        operation,
        detail
      )

      return true
    }

    AsyncFunction("applyLocationPuck3D") {
      (mapViewTag: Int, scale: Double, slot: String?, layerAbove: String?) async throws -> Bool in
      let mapView = try await self.resolveMapView(tag: mapViewTag)
      return try await self.applyLocationPuck3D(
        to: mapView,
        scale: scale,
        slot: slot,
        layerAbove: layerAbove
      )
    }

    AsyncFunction("clearLocationPuck3D") { (mapViewTag: Int) async throws -> Bool in
      let mapView = try await self.resolveMapView(tag: mapViewTag)
      return try await self.clearLocationPuck3D(from: mapView)
    }

    AsyncFunction("setLocationPuckLocation") {
      (
        mapViewTag: Int,
        longitude: Double,
        latitude: Double,
        heading: Double,
        recordedAt: Double?
      ) async throws -> Bool in
      let mapView = try await self.resolveMapView(tag: mapViewTag)
      return try await self.setLocationPuckLocation(
        on: mapView,
        longitude: longitude,
        latitude: latitude,
        heading: heading,
        recordedAt: recordedAt
      )
    }

    AsyncFunction("clearLocationPuckLocationProvider") {
      (mapViewTag: Int) async throws -> Bool in
      let mapView = try await self.resolveMapView(tag: mapViewTag)
      return try await self.clearLocationPuckLocationProvider(from: mapView)
    }

    AsyncFunction("setLocationPuckCameraFollow") {
      (
        mapViewTag: Int,
        enabled: Bool,
        zoom: Double?,
        pitch: Double?,
        paddingTop: Double,
        paddingLeft: Double,
        paddingBottom: Double,
        paddingRight: Double
      ) async throws -> Bool in
      let mapView = try await self.resolveMapView(tag: mapViewTag)
      return await self.setLocationPuckCameraFollow(
        on: mapView,
        enabled: enabled,
        zoom: zoom,
        pitch: pitch,
        paddingTop: paddingTop,
        paddingLeft: paddingLeft,
        paddingBottom: paddingBottom,
        paddingRight: paddingRight
      )
    }

    AsyncFunction("isLocationPuckCameraFollowActive") {
      (mapViewTag: Int) async throws -> Bool in
      let mapView = try await self.resolveMapView(tag: mapViewTag)
      return await self.isLocationPuckCameraFollowActive(on: mapView)
    }

    AsyncFunction("getLocationPuckState") { (mapViewTag: Int) async throws -> [String: Any?] in
      let mapView = try await self.resolveMapView(tag: mapViewTag)
      return try await self.getLocationPuckState(from: mapView)
    }
  }

  @MainActor
  private func setLocationPuckCameraFollow(
    on mapView: MapView,
    enabled: Bool,
    zoom: Double?,
    pitch: Double?,
    paddingTop: Double,
    paddingLeft: Double,
    paddingBottom: Double,
    paddingRight: Double
  ) async -> Bool {
    guard enabled else {
      clearCameraFollowState(on: mapView)
      return true
    }

    guard reassertLiveLocationProvider(on: mapView) else {
      return false
    }

    var options = FollowPuckViewportStateOptions()

    options.bearing = .heading
    options.padding = UIEdgeInsets(
      top: paddingTop,
      left: paddingLeft,
      bottom: paddingBottom,
      right: paddingRight
    )
    options.zoom = zoom.map { CGFloat($0) }
    options.pitch = pitch.map { CGFloat($0) }

    let followState = cameraFollowStates.object(forKey: mapView)
      ?? mapView.viewport.makeFollowPuckViewportState(options: options)

    followState.options = options
    cameraFollowStates.setObject(followState, forKey: mapView)
    let ownsViewport = await transitionImmediately(
      mapView.viewport,
      to: followState
    )

    if
      !ownsViewport,
      cameraFollowStates.object(forKey: mapView) === followState
    {
      if viewportOwnsCameraFollowState(mapView.viewport, followState: followState) {
        mapView.viewport.idle()
      }

      cameraFollowStates.removeObject(forKey: mapView)
    }

    return ownsViewport
  }

  @MainActor
  private func transitionImmediately(
    _ viewport: ViewportManager,
    to followState: FollowPuckViewportState
  ) async -> Bool {
    let transitionSucceeded = await withCheckedContinuation { continuation in
      let completion = CameraFollowTransitionCompletion(continuation)

      viewport.transition(
        to: followState,
        transition: viewport.makeImmediateViewportTransition()
      ) { success in
        completion.resolve(success)
      }
      DispatchQueue.main.asyncAfter(
        deadline: .now() + .milliseconds(cameraFollowTransitionTimeoutMilliseconds)
      ) {
        completion.resolve(false)
      }
    }

    return transitionSucceeded && viewportOwnsCameraFollowState(
      viewport,
      followState: followState
    )
  }

  @MainActor
  private func viewportOwnsCameraFollowState(
    _ viewport: ViewportManager,
    followState: FollowPuckViewportState
  ) -> Bool {
    switch viewport.status {
    case .state(let state):
      return state === followState
    case .transition(_, let toState):
      return toState === followState
    case .idle:
      return false
    }
  }

  @MainActor
  private func clearCameraFollowState(on mapView: MapView) {
    guard let removedState = cameraFollowStates.object(forKey: mapView) else {
      return
    }

    cameraFollowStates.removeObject(forKey: mapView)

    if viewportOwnsCameraFollowState(mapView.viewport, followState: removedState) {
      mapView.viewport.idle()
    }
  }

  @MainActor
  private func isLocationPuckCameraFollowActive(on mapView: MapView) -> Bool {
    guard
      liveLocationProviderIsOwned(on: mapView),
      let followState = cameraFollowStates.object(forKey: mapView)
    else {
      return false
    }

    return viewportOwnsCameraFollowState(mapView.viewport, followState: followState)
  }

  @MainActor
  private func setLocationPuckLocation(
    on mapView: MapView,
    longitude: Double,
    latitude: Double,
    heading: Double,
    recordedAt: Double?
  ) throws -> Bool {
    guard longitude.isFinite, latitude.isFinite, heading.isFinite else {
      throw MapLocationPuckException("Location puck coordinates and heading must be finite.")
    }

    let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)

    guard CLLocationCoordinate2DIsValid(coordinate) else {
      throw MapLocationPuckException("Location puck coordinate is invalid.")
    }

    guard let locationManager = mapView.location else {
      throw MapLocationPuckException("Mapbox location component is unavailable.")
    }

    let normalizedRecordedAt = Self.normalizedRecordedAt(recordedAt)
    let timestamp = Self.locationTimestamp(normalizedRecordedAt)
    let normalizedHeading = Self.normalizedHeading(heading)
    let location = Location(
      coordinate: coordinate,
      timestamp: timestamp,
      bearing: normalizedHeading
    )
    let headingValue = Heading(
      direction: normalizedHeading,
      accuracy: 1,
      timestamp: timestamp
    )

    if let providerState = locationProviderStates.object(forKey: mapView) {
      providerState.reassertOwnership(on: locationManager)
      providerState.update(
        location: location,
        heading: headingValue,
        recordedAt: normalizedRecordedAt
      )
      return true
    }

    let providerState = OwnedLocationProviderState(
      previousDataModel: locationManager.dataModel,
      location: location,
      heading: headingValue,
      recordedAt: normalizedRecordedAt
    )

    locationProviderStates.setObject(providerState, forKey: mapView)
    locationManager.dataModel = providerState.dataModel

    return true
  }

  @MainActor
  private func clearLocationPuckLocationProvider(from mapView: MapView) throws -> Bool {
    guard let providerState = locationProviderStates.object(forKey: mapView) else {
      return false
    }

    guard let locationManager = mapView.location else {
      throw MapLocationPuckException("Mapbox location component is unavailable.")
    }

    clearCameraFollowState(on: mapView)

    if locationManager.dataModel === providerState.dataModel {
      locationManager.dataModel = providerState.previousDataModel
    }

    locationProviderStates.removeObject(forKey: mapView)

    return true
  }

  @MainActor
  private func liveLocationProviderIsOwned(on mapView: MapView) -> Bool {
    guard
      let locationManager = mapView.location,
      let providerState = locationProviderStates.object(forKey: mapView)
    else {
      return false
    }

    return locationManager.dataModel === providerState.dataModel
  }

  @MainActor
  private func reassertLiveLocationProvider(on mapView: MapView) -> Bool {
    guard
      let locationManager = mapView.location,
      let providerState = locationProviderStates.object(forKey: mapView)
    else {
      return false
    }

    providerState.reassertOwnership(on: locationManager)

    return liveLocationProviderIsOwned(on: mapView)
  }

  @MainActor
  private func resolveMapView(tag: Int) throws -> MapView {
    guard let resolvedView = appContext?.findView(withTag: tag, ofType: UIView.self) else {
      throw MapLocationPuckException("Map view with tag \(tag) could not be resolved.")
    }

    guard let mapView = Self.findMapView(in: resolvedView) else {
      throw MapLocationPuckException("Resolved view \(tag) does not contain a Mapbox map view.")
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
  private func applyLocationPuck3D(
    to mapView: MapView,
    scale: Double,
    slot: String?,
    layerAbove: String?
  ) throws -> Bool {
    guard let location = mapView.location else {
      throw MapLocationPuckException("Mapbox location component is unavailable.")
    }

    guard reassertLiveLocationProvider(on: mapView) else {
      return false
    }

    guard let modelURL = Self.locationPuckModelURL() else {
      throw MapLocationPuckException("Bundled navigation_puck.glb could not be found.")
    }

    let resolvedScale = scale
    let model = Model(
      id: "drivers-against-flock-location-puck",
      uri: modelURL,
      orientation: [0, 0, 0]
    )
    var configuration = Puck3DConfiguration(
      model: model,
      modelScale: .constant([resolvedScale, resolvedScale, resolvedScale]),
      modelRotation: .constant([0, 0, 0]),
      modelCastShadows: .constant(false),
      modelReceiveShadows: .constant(false),
      modelScaleMode: .constant(.map),
      modelEmissiveStrength: .constant(1)
    )
    configuration.slot = Self.mapboxStyleSlot(slot)
    configuration.layerPosition = Self.mapboxPuckLayerPosition(layerAbove)

    location.options.puckType = .puck3D(configuration)
    location.options.puckBearing = .heading
    location.options.puckBearingEnabled = true

    return true
  }

  @MainActor
  private func clearLocationPuck3D(from mapView: MapView) throws -> Bool {
    guard let location = mapView.location else {
      throw MapLocationPuckException("Mapbox location component is unavailable.")
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

  @MainActor
  private func getLocationPuckState(from mapView: MapView) throws -> [String: Any?] {
    guard let location = mapView.location else {
      throw MapLocationPuckException("Mapbox location component is unavailable.")
    }

    let configuration: Puck3DConfiguration?
    if let puckType = location.options.puckType, case .puck3D(let puck3D) = puckType {
      configuration = puck3D
    } else {
      configuration = nil
    }

    let modelURL = configuration?.model.uri
    let modelData = modelURL.flatMap { try? Data(contentsOf: $0) }
    let modelScale: [Double]? = Self.constantValue(configuration?.modelScale)
    let modelRotation: [Double]? = Self.constantValue(configuration?.modelRotation)
      ?? configuration?.model.orientation
    let modelCastShadows: Bool? = Self.constantValue(configuration?.modelCastShadows)
    let modelReceiveShadows: Bool? = Self.constantValue(configuration?.modelReceiveShadows)
    let modelScaleMode: ModelScaleMode? = Self.constantValue(configuration?.modelScaleMode)
    let modelEmissiveStrength: Double? = Self.constantValue(configuration?.modelEmissiveStrength)
    let providerState = locationProviderStates.object(forKey: mapView)
    let providerCoordinate = providerState?.latestLocation.coordinate
    let cameraCenter = mapView.mapboxMap.cameraState.center

    return [
      "puckKind": configuration == nil ? "2d" : "3d",
      "modelUri": modelURL?.absoluteString,
      "modelScale": modelScale,
      "modelRotation": modelRotation,
      "modelCastShadows": modelCastShadows,
      "modelReceiveShadows": modelReceiveShadows,
      "modelScaleMode": modelScaleMode?.rawValue,
      "modelEmissiveStrength": modelEmissiveStrength,
      "locationEnabled": configuration != nil,
      "puckBearing": Self.puckBearingName(location.options.puckBearing),
      "puckBearingEnabled": location.options.puckBearingEnabled,
      "slot": configuration?.slot?.rawValue,
      "modelLayerExists": mapView.mapboxMap.style.layerExists(withId: locationPuckModelLayer),
      "modelSourceExists": mapView.mapboxMap.style.sourceExists(withId: locationPuckModelSource),
      "indicatorLayerExists": mapView.mapboxMap.style.layerExists(withId: locationPuckIndicatorLayer),
      "providerOwnedByApp": location.dataModel === providerState?.dataModel,
      "providerLatitude": providerCoordinate?.latitude,
      "providerLongitude": providerCoordinate?.longitude,
      "providerHeading": providerState?.latestHeading.direction,
      "cameraFollowingPuck": cameraFollowStates.object(forKey: mapView).map { followState in
        viewportOwnsCameraFollowState(mapView.viewport, followState: followState)
      } ?? false,
      "cameraCenterLatitude": cameraCenter.latitude,
      "cameraCenterLongitude": cameraCenter.longitude,
      "modelAssetByteLength": modelData?.count,
      "modelAssetSha256": modelData.map(Self.sha256)
    ]
  }

  private static func locationPuckModelURL() -> URL? {
    let bundles = [Bundle.main, Bundle(for: MapLocationPuckModule.self)]

    for bundle in bundles {
      if let url = bundle.url(forResource: "navigation_puck", withExtension: "glb") {
        return url
      }
    }

    return nil
  }

  private static func locationTimestamp(_ recordedAt: Double?) -> Date {
    guard let recordedAt else {
      return Date()
    }

    return Date(timeIntervalSince1970: recordedAt / 1_000)
  }

  private static func normalizedRecordedAt(_ recordedAt: Double?) -> Double? {
    guard let recordedAt, recordedAt.isFinite, recordedAt > 0 else {
      return nil
    }

    return recordedAt
  }

  private static func normalizedHeading(_ heading: Double) -> Double {
    let normalizedHeading = heading.truncatingRemainder(dividingBy: 360)

    return normalizedHeading >= 0 ? normalizedHeading : normalizedHeading + 360
  }

  private static func constantValue<T: Codable>(_ value: Value<T>?) -> T? {
    guard let value else {
      return nil
    }

    if case .constant(let constant) = value {
      return constant
    }

    return nil
  }

  private static func mapboxStyleSlot(_ slot: String?) -> Slot? {
    guard let slot, ["bottom", "middle", "top"].contains(slot) else {
      return nil
    }

    return Slot(rawValue: slot)
  }

  private static func mapboxPuckLayerPosition(_ layerAbove: String?) -> LayerPosition? {
    guard layerAbove == "directions-route-line" else {
      return nil
    }

    return .above("directions-route-line")
  }

  private static func puckBearingName(_ puckBearing: PuckBearing) -> String {
    switch puckBearing {
    case .heading:
      return "heading"
    case .course:
      return "course"
    }
  }

  private static func sha256(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}

private struct MapLocationPuckException: LocalizedError {
  private let message: String

  init(_ message: String) {
    self.message = message
  }

  var errorDescription: String? { message }
}
