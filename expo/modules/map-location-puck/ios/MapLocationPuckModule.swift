import CryptoKit
import ExpoModulesCore
import Foundation
@_spi(Experimental) import MapboxMaps
import UIKit

private let locationPuckModelLayer = "puck-model-layer"
private let locationPuckModelSource = "puck-model-source"
private let locationPuckIndicatorLayer = "puck"

public final class MapLocationPuckModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MapLocationPuck")

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

    AsyncFunction("getLocationPuckState") { (mapViewTag: Int) async throws -> [String: Any?] in
      let mapView = try await self.resolveMapView(tag: mapViewTag)
      return try await self.getLocationPuckState(from: mapView)
    }
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

    guard let modelURL = Self.locationPuckModelURL() else {
      throw MapLocationPuckException("Bundled navigation_puck.glb could not be found.")
    }

    let resolvedScale = min(max(scale, 16), 128)
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
      modelScaleMode: .constant(.viewport),
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
