package com.rnmapbox.navigation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.common.UIManagerType
import com.mapbox.common.location.Location
import com.mapbox.geojson.Point
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.MapboxExperimental
import com.mapbox.maps.plugin.LocationPuck2D
import com.mapbox.maps.plugin.LocationPuck3D
import com.mapbox.maps.plugin.ModelScaleMode
import com.mapbox.maps.plugin.PuckBearing
import com.mapbox.maps.plugin.animation.camera
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.navigation.base.ExperimentalMapboxNavigationAPI
import com.mapbox.navigation.base.ExperimentalPreviewMapboxNavigationAPI
import com.mapbox.navigation.base.options.EHorizonOptions
import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.base.road.model.Road
import com.mapbox.navigation.base.road.model.RoadComponent
import com.mapbox.navigation.base.speed.model.SpeedLimitInfo
import com.mapbox.navigation.base.speed.model.SpeedUnit
import com.mapbox.navigation.base.trip.model.eh.EHorizonEdge
import com.mapbox.navigation.base.trip.model.eh.EHorizonGraphPosition
import com.mapbox.navigation.base.trip.model.eh.EHorizonPosition
import com.mapbox.navigation.base.trip.model.roadobject.RoadObjectEnterExitInfo
import com.mapbox.navigation.base.trip.model.roadobject.RoadObjectPassInfo
import com.mapbox.navigation.base.trip.model.roadobject.distanceinfo.RoadObjectDistanceInfo
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.core.lifecycle.MapboxNavigationObserver
import com.mapbox.navigation.core.trip.session.eh.EHorizonObserver
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.TripSessionState
import com.mapbox.navigation.core.trip.session.TripSessionStateObserver
import com.mapbox.navigation.ui.maps.camera.NavigationCamera
import com.mapbox.navigation.ui.maps.camera.data.FollowingFrameOptions
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource
import com.mapbox.navigation.ui.maps.camera.state.NavigationCameraState
import com.mapbox.navigation.ui.maps.camera.state.NavigationCameraStateChangedObserver
import com.mapbox.navigation.ui.maps.camera.transition.NavigationCameraTransitionOptions
import com.mapbox.navigation.ui.maps.internal.camera.updateFollowingFrameTransitionOptions
import com.rnmapbox.rnmbx.components.mapview.RNMBXMapView
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.types.toJSValueExperimental

@OptIn(
  ExperimentalMapboxNavigationAPI::class,
  ExperimentalPreviewMapboxNavigationAPI::class,
  MapboxExperimental::class
)
class RNMapboxNavigationModule : Module() {
  private var activityLifecycleOwner: LifecycleOwner? = null
  private var androidAutoLifecycleOwner: AndroidAutoSessionLifecycleOwner? = null
  private var lastEnhancedLocation: Bundle? = null
  private var lastElectronicHorizon: Bundle? = null
  private var lastLoggedSpeedLimitKey: String? = null
  private var mapboxNavigation: MapboxNavigation? = null
  private var observerRegistered = false
  private var pendingTripSessionForegroundService: Boolean? = null
  private val navigationCameraSurfaces = mutableMapOf<String, NavigationCameraSurface>()

  private val navigationObserver = object : MapboxNavigationObserver {
    override fun onAttached(mapboxNavigation: MapboxNavigation) {
      bindNavigation(mapboxNavigation)
      startPendingTripSession()
    }

    override fun onDetached(mapboxNavigation: MapboxNavigation) {
      if (this@RNMapboxNavigationModule.mapboxNavigation === mapboxNavigation) {
        unbindNavigation(mapboxNavigation)
      }
    }
  }

  private val locationObserver = object : LocationObserver {
    override fun onNewRawLocation(rawLocation: Location) {
      sendEvent(RAW_LOCATION_EVENT_NAME, locationToBundle(rawLocation))
    }

    override fun onNewLocationMatcherResult(locationMatcherResult: LocationMatcherResult) {
      val payload = matcherResultToBundle(locationMatcherResult)
      lastEnhancedLocation = Bundle(payload)
      updateNavigationCameraSurfaces(locationMatcherResult)
      sendEvent(ENHANCED_LOCATION_EVENT_NAME, payload)
    }
  }

  private val electronicHorizonObserver = object : EHorizonObserver {
    override fun onPositionUpdated(
      position: EHorizonPosition,
      distances: List<RoadObjectDistanceInfo>
    ) {
      val navigation = mapboxNavigation ?: return
      val payload = electronicHorizonToBundle(navigation, position)

      lastElectronicHorizon = Bundle(payload)
      sendEvent(ELECTRONIC_HORIZON_EVENT_NAME, payload)
    }

    override fun onRoadObjectEnter(objectEnterExitInfo: RoadObjectEnterExitInfo) = Unit

    override fun onRoadObjectExit(objectEnterExitInfo: RoadObjectEnterExitInfo) = Unit

    override fun onRoadObjectPassed(objectPassInfo: RoadObjectPassInfo) = Unit

    override fun onRoadObjectAdded(roadObjectId: String) = Unit

    override fun onRoadObjectUpdated(roadObjectId: String) = Unit

    override fun onRoadObjectRemoved(roadObjectId: String) = Unit
  }

  private val tripSessionStateObserver = TripSessionStateObserver { state ->
    sendEvent(
      TRIP_SESSION_STATE_EVENT_NAME,
      Bundle().apply {
        putString("state", tripSessionStateToString(state))
      }
    )
  }

  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)

    Events(
      ELECTRONIC_HORIZON_EVENT_NAME,
      ENHANCED_LOCATION_EVENT_NAME,
      NAVIGATION_CAMERA_STATE_EVENT_NAME,
      RAW_LOCATION_EVENT_NAME,
      TRIP_SESSION_STATE_EVENT_NAME
    )

    AsyncFunction("startTripSession") { withForegroundService: Boolean ->
      val context = reactContext()

      if (!hasForegroundLocationPermission(context)) {
        throw MissingLocationPermissionException()
      }

      pendingTripSessionForegroundService = withForegroundService
      ensureNavigationApp(context)

      mapboxNavigation?.let {
        startTripSession(it, withForegroundService)
      }

      return@AsyncFunction null
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopTripSession") {
      pendingTripSessionForegroundService = null
      mapboxNavigation?.stopTripSession()
      lastElectronicHorizon = null
      return@AsyncFunction null
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("activateAndroidAutoLifecycle") {
      return@AsyncFunction activateAndroidAutoLifecycle()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("deactivateAndroidAutoLifecycle") {
      return@AsyncFunction deactivateAndroidAutoLifecycle()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("updateAndroidAutoLifecycleState") { state: String ->
      return@AsyncFunction updateAndroidAutoLifecycleState(state)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getTripSessionState") {
      mapboxNavigation?.let {
        return@AsyncFunction tripSessionStateToString(it.getTripSessionState())
      }

      return@AsyncFunction UNAVAILABLE_STATE
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getLastEnhancedLocation") {
      return@AsyncFunction lastEnhancedLocation?.toJSValueExperimental()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("applyNavigationPuck3D") { mapViewTag: Int, scale: Double, slot: String?, layerAbove: String? ->
      val rnMapView = resolveMapView(mapViewTag)
      val location = rnMapView.mapView.location
      val resolvedScale = scale.toFloat().coerceIn(
        MINIMUM_NAVIGATION_PUCK_SCALE,
        MAXIMUM_NAVIGATION_PUCK_SCALE
      )

      location.locationPuck = LocationPuck3D(
        modelUri = NAVIGATION_PUCK_MODEL_URI,
        modelScale = listOf(resolvedScale, resolvedScale, resolvedScale),
        modelRotation = listOf(0f, 0f, 0f),
        modelCastShadows = false,
        modelReceiveShadows = false,
        modelScaleMode = ModelScaleMode.VIEWPORT,
        modelEmissiveStrength = 1f
      )
      location.puckBearing = PuckBearing.HEADING
      location.puckBearingEnabled = true
      location.slot = slot?.takeIf(MAPBOX_STYLE_SLOTS::contains)
      location.layerAbove = layerAbove?.takeIf(APP_STYLE_LAYER_IDS::contains)
      location.layerBelow = null
      location.enabled = true

      return@AsyncFunction true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("clearNavigationPuck3D") { mapViewTag: Int ->
      val rnMapView = resolveMapView(mapViewTag)
      val location = rnMapView.mapView.location
      val hadNavigationPuck3D = location.locationPuck is LocationPuck3D

      location.layerAbove = null
      location.layerBelow = null
      location.slot = null

      if (!hadNavigationPuck3D) {
        return@AsyncFunction false
      }

      location.enabled = false
      location.locationPuck = LocationPuck2D()

      return@AsyncFunction true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getLastElectronicHorizon") {
      return@AsyncFunction lastElectronicHorizon?.toJSValueExperimental()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("attachNavigationCamera") { surfaceId: String, mapViewTag: Int, options: Map<String, Any?>? ->
      val context = reactContext()

      ensureNavigationApp(context)

      val mapView = resolveMapView(mapViewTag)
      val surface = createNavigationCameraSurface(surfaceId, mapView, options)

      navigationCameraSurfaces.remove(surfaceId)?.detach()
      navigationCameraSurfaces[surfaceId] = surface

      return@AsyncFunction true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("detachNavigationCamera") { surfaceId: String ->
      navigationCameraSurfaces.remove(surfaceId)?.detach()
      return@AsyncFunction true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setNavigationCameraMode") { surfaceId: String, mode: String ->
      val surface = navigationCameraSurfaces[surfaceId]
        ?: return@AsyncFunction false

      surface.setMode(mode)
      return@AsyncFunction true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("updateNavigationCameraOptions") { surfaceId: String, options: Map<String, Any?>? ->
      val surface = navigationCameraSurfaces[surfaceId]
        ?: return@AsyncFunction false

      surface.updateOptions(options)
      return@AsyncFunction true
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      pendingTripSessionForegroundService = null
      lastElectronicHorizon = null
      deactivateAndroidAutoLifecycle()
      detachActivityLifecycleOwner()
      detachNavigationCameraSurfaces()
      mapboxNavigation?.let { navigation ->
        navigation.stopTripSession()
        unbindNavigation(navigation)
      }

      if (observerRegistered) {
        MapboxNavigationApp.unregisterObserver(navigationObserver)
        observerRegistered = false
      }
    }
  }

  private fun ensureNavigationApp(context: Context) {
    ensureNavigationAppSetup(context)
    attachActivityLifecycleOwner()

    MapboxNavigationApp.current()?.let {
      bindNavigation(it)
    }
  }

  private fun ensureNavigationAppSetup(context: Context) {
    if (!MapboxNavigationApp.isSetup()) {
      MapboxNavigationApp.setup(createNavigationOptions(context))
    }

    if (!observerRegistered) {
      MapboxNavigationApp.registerObserver(navigationObserver)
      observerRegistered = true
    }
  }

  private fun createNavigationOptions(context: Context): NavigationOptions {
    val electronicHorizonOptions = EHorizonOptions.Builder()
      .length(ELECTRONIC_HORIZON_LENGTH_METERS)
      .expansion(ELECTRONIC_HORIZON_MPP_ONLY_EXPANSION)
      .minTimeDeltaBetweenUpdates(ELECTRONIC_HORIZON_MIN_UPDATE_INTERVAL_SECONDS)
      .build()

    return NavigationOptions.Builder(context)
      .eHorizonOptions(electronicHorizonOptions)
      .build()
  }

  private fun attachActivityLifecycleOwner() {
    val lifecycleOwner = appContext.currentActivity as? LifecycleOwner ?: return

    if (activityLifecycleOwner === lifecycleOwner) {
      return
    }

    activityLifecycleOwner?.let { previousLifecycleOwner ->
      if (previousLifecycleOwner.lifecycle.currentState != Lifecycle.State.DESTROYED) {
        MapboxNavigationApp.detach(previousLifecycleOwner)
      }
    }

    MapboxNavigationApp.attach(lifecycleOwner)
    activityLifecycleOwner = lifecycleOwner
  }

  private fun detachActivityLifecycleOwner() {
    val lifecycleOwner = activityLifecycleOwner ?: return

    if (lifecycleOwner.lifecycle.currentState != Lifecycle.State.DESTROYED) {
      MapboxNavigationApp.detach(lifecycleOwner)
    }

    activityLifecycleOwner = null
  }

  private fun activateAndroidAutoLifecycle(): Boolean {
    val context = reactContext()

    ensureNavigationAppSetup(context)

    if (androidAutoLifecycleOwner != null) {
      return true
    }

    val lifecycleOwner = AndroidAutoSessionLifecycleOwner()

    androidAutoLifecycleOwner = lifecycleOwner
    MapboxNavigationApp.attach(lifecycleOwner)
    lifecycleOwner.create()

    MapboxNavigationApp.current()?.let {
      bindNavigation(it)
    }

    return true
  }

  private fun updateAndroidAutoLifecycleState(state: String): Boolean {
    val lifecycleOwner = androidAutoLifecycleOwner ?: return false

    return lifecycleOwner.updateVisibilityState(state)
  }

  private fun deactivateAndroidAutoLifecycle(): Boolean {
    val lifecycleOwner = androidAutoLifecycleOwner ?: return false

    lifecycleOwner.disconnect()
    androidAutoLifecycleOwner = null

    return true
  }

  private fun bindNavigation(nextNavigation: MapboxNavigation) {
    if (mapboxNavigation === nextNavigation) {
      return
    }

    mapboxNavigation?.let {
      unbindNavigation(it)
    }

    mapboxNavigation = nextNavigation
    nextNavigation.registerLocationObserver(locationObserver)
    nextNavigation.registerEHorizonObserver(electronicHorizonObserver)
    nextNavigation.registerTripSessionStateObserver(tripSessionStateObserver)
  }

  private fun unbindNavigation(navigation: MapboxNavigation) {
    navigation.unregisterLocationObserver(locationObserver)
    navigation.unregisterEHorizonObserver(electronicHorizonObserver)
    navigation.unregisterTripSessionStateObserver(tripSessionStateObserver)
    detachNavigationCameraSurfaces()
    lastElectronicHorizon = null

    if (mapboxNavigation === navigation) {
      mapboxNavigation = null
    }
  }

  private fun startPendingTripSession() {
    val withForegroundService = pendingTripSessionForegroundService ?: return
    mapboxNavigation?.let {
      startTripSession(it, withForegroundService)
    }
  }

  private fun startTripSession(
    navigation: MapboxNavigation,
    withForegroundService: Boolean
  ) {
    val isStarted = navigation.getTripSessionState() == TripSessionState.STARTED

    if (!isStarted) {
      navigation.startTripSession(withForegroundService = withForegroundService)
      return
    }

    if (!withForegroundService || navigation.isRunningForegroundService()) {
      return
    }

    navigation.stopTripSession()
    navigation.startTripSession(withForegroundService = true)
  }

  private fun electronicHorizonToBundle(
    navigation: MapboxNavigation,
    position: EHorizonPosition
  ): Bundle {
    val primaryPathEdges = runCatching {
      selectPrimaryPath(position.eHorizon.mpp(position))
    }.getOrNull().orEmpty()
    val graphPosition = position.eHorizonGraphPosition
    val primaryEdgeGeometries = primaryPathEdges.mapNotNull { edge ->
      electronicHorizonEdgeGeometry(
        navigation,
        edge,
        graphPosition.takeIf { it.edgeId == edge.id }
      )
    }
    val primaryCoordinates: ArrayList<ArrayList<Double>> = mergeElectronicHorizonCoordinates(primaryEdgeGeometries)
      .takeIf { it.size >= 2 }
      ?: ArrayList()
    val primarySegments = primaryEdgeGeometries.filter { it.coordinates.size >= 2 }

    return Bundle().apply {
      putBundle(
        "primaryPath",
        Bundle().apply {
          putSerializable("coordinates", primaryCoordinates)
          putParcelableArrayList(
            "segments",
            ArrayList(primarySegments.map { geometry -> electronicHorizonEdgeToBundle(geometry) })
          )
        }
      )
      putBundle(
        "graphPosition",
        Bundle().apply {
          putString("edgeId", graphPosition.edgeId.toString())
          putDouble("percentAlong", graphPosition.percentAlong)
        }
      )
      putString("resultType", position.eHorizonResultType)
      putDouble("updatedAt", System.currentTimeMillis().toDouble())
    }
  }

  private fun selectPrimaryPath(
    candidatePaths: List<List<EHorizonEdge>>
  ): List<EHorizonEdge>? {
    val paths = candidatePaths.filter { it.isNotEmpty() }

    if (paths.isEmpty()) {
      return null
    }

    val splitIndex = sharedElectronicHorizonPrefixLength(paths)

    return paths.maxByOrNull { path ->
      electronicHorizonCandidateProbability(path, splitIndex)
    }
  }

  private fun sharedElectronicHorizonPrefixLength(paths: List<List<EHorizonEdge>>): Int {
    val shortestPathLength = paths.minOf { it.size }

    for (index in 0 until shortestPathLength) {
      val edgeId = paths.first()[index].id

      if (paths.any { path -> path[index].id != edgeId }) {
        return index
      }
    }

    return shortestPathLength
  }

  private fun electronicHorizonCandidateProbability(
    path: List<EHorizonEdge>,
    splitIndex: Int
  ): Double {
    val probability = path.getOrNull(splitIndex)?.probability
      ?: path.lastOrNull()?.probability
      ?: 0.0

    return when {
      !probability.isFinite() -> 0.0
      probability > 1.0 -> (probability / 100.0).coerceIn(0.0, 1.0)
      else -> probability.coerceIn(0.0, 1.0)
    }
  }

  private fun electronicHorizonEdgeGeometry(
    navigation: MapboxNavigation,
    edge: EHorizonEdge,
    graphPosition: EHorizonGraphPosition? = null
  ): ElectronicHorizonEdgeGeometry? {
    val shape = runCatching {
      navigation.graphAccessor.getEdgeShape(edge.id)
    }.getOrNull() ?: return null
    val graphPositionCoordinate = graphPosition?.let { position ->
      runCatching {
        navigation.graphAccessor.getGraphPositionCoordinate(position)
      }.getOrNull()
    }
    val forwardShape = graphPositionCoordinate?.let { coordinate ->
      trimElectronicHorizonEdgeShape(shape, coordinate)
    } ?: shape
    val coordinates = ArrayList(forwardShape.map { point ->
      arrayListOf(point.longitude(), point.latitude())
    })

    if (coordinates.isEmpty()) {
      return null
    }

    return ElectronicHorizonEdgeGeometry(edge, coordinates)
  }

  private fun trimElectronicHorizonEdgeShape(shape: List<Point>, currentPosition: Point): List<Point> {
    if (shape.size < 2) {
      return shape
    }

    var closestSegmentIndex = 0
    var shortestDistanceSquared = Double.POSITIVE_INFINITY

    for (index in 0 until shape.lastIndex) {
      val distanceSquared = squaredDistanceToSegment(
        currentPosition,
        shape[index],
        shape[index + 1]
      )

      if (distanceSquared < shortestDistanceSquared) {
        shortestDistanceSquared = distanceSquared
        closestSegmentIndex = index
      }
    }
    val forwardShape = ArrayList<Point>()

    forwardShape.add(currentPosition)

    for (index in (closestSegmentIndex + 1) until shape.size) {
      forwardShape.add(shape[index])
    }

    return forwardShape
  }

  private fun squaredDistanceToSegment(point: Point, start: Point, end: Point): Double {
    val longitudeScale = kotlin.math.cos(
      Math.toRadians((point.latitude() + start.latitude() + end.latitude()) / 3)
    )
    val pointX = point.longitude() * longitudeScale
    val pointY = point.latitude()
    val startX = start.longitude() * longitudeScale
    val startY = start.latitude()
    val endX = end.longitude() * longitudeScale
    val endY = end.latitude()
    val segmentX = endX - startX
    val segmentY = endY - startY
    val segmentLengthSquared = segmentX * segmentX + segmentY * segmentY

    if (segmentLengthSquared == 0.0) {
      val deltaX = pointX - startX
      val deltaY = pointY - startY
      return deltaX * deltaX + deltaY * deltaY
    }

    val projection = (
      (pointX - startX) * segmentX + (pointY - startY) * segmentY
      ) / segmentLengthSquared
    val clampedProjection = projection.coerceIn(0.0, 1.0)
    val closestX = startX + clampedProjection * segmentX
    val closestY = startY + clampedProjection * segmentY
    val deltaX = pointX - closestX
    val deltaY = pointY - closestY

    return deltaX * deltaX + deltaY * deltaY
  }

  private fun mergeElectronicHorizonCoordinates(
    segments: List<ElectronicHorizonEdgeGeometry>
  ): ArrayList<ArrayList<Double>> {
    val coordinates = ArrayList<ArrayList<Double>>()

    segments.forEach { segment ->
      segment.coordinates.forEach { coordinate ->
        if (coordinates.lastOrNull() != coordinate) {
          coordinates.add(ArrayList(coordinate))
        }
      }
    }

    return coordinates
  }

  private fun electronicHorizonEdgeToBundle(geometry: ElectronicHorizonEdgeGeometry): Bundle {
    return Bundle().apply {
      putString("edgeId", geometry.edge.id.toString())
      putSerializable("coordinates", geometry.coordinates)
      putDouble("level", geometry.edge.level.toDouble())
      putDouble("probability", geometry.edge.probability)
      putBoolean("isOnRoute", geometry.edge.isOnRoute)
    }
  }

  private fun matcherResultToBundle(result: LocationMatcherResult): Bundle {
    return locationToBundle(result.enhancedLocation).apply {
      putBoolean("isDegradedMapMatching", result.isDegradedMapMatching)
      putBoolean("inTunnel", result.inTunnel)
      putBoolean("isOffRoad", result.isOffRoad)
      putBoolean("isTeleport", result.isTeleport)
      putDouble("offRoadProbability", result.offRoadProbability.toDouble())
      putDouble("roadEdgeMatchProbability", result.roadEdgeMatchProbability.toDouble())
      result.roadEdgeId?.let {
        putString("roadEdgeId", it.toString())
      }
      result.zLevel?.let {
        putDouble("zLevel", it.toDouble())
      }
      roadContextToBundle(result)?.let {
        putBundle("roadContext", it)
      }
      speedLimitToBundle(result.speedLimitInfo)?.let {
        putBundle("speedLimit", it)
      }
    }
  }

  private fun roadContextToBundle(result: LocationMatcherResult): Bundle? {
    val road = result.road ?: return null
    val components = road.components
    val primaryText = components.firstOrNull { component ->
      component.text.isNotBlank()
    }?.text

    if (
      primaryText.isNullOrBlank() &&
      result.roadEdgeId == null &&
      result.zLevel == null &&
      result.roadEdgeMatchProbability <= 0
    ) {
      return null
    }

    return Bundle().apply {
      primaryText?.let {
        putString("primaryText", it)
      }
      putBundle("road", roadToBundle(road))
      putParcelableArrayList(
        "components",
        ArrayList(components.mapNotNull { roadComponentToBundle(it) })
      )
      putBoolean("inTunnel", result.inTunnel)
      putBoolean("isDegradedMapMatching", result.isDegradedMapMatching)
      putBoolean("isOffRoad", result.isOffRoad)
      putDouble("edgeMatchProbability", result.roadEdgeMatchProbability.toDouble())
      result.roadEdgeId?.let {
        putString("edgeId", it.toString())
      }
      result.zLevel?.let {
        putDouble("zLevel", it.toDouble())
      }
    }
  }

  private fun roadToBundle(road: Road): Bundle {
    return Bundle().apply {
      putParcelableArrayList(
        "components",
        ArrayList(road.components.mapNotNull { roadComponentToBundle(it) })
      )
    }
  }

  private fun roadComponentToBundle(component: RoadComponent): Bundle? {
    if (
      component.text.isBlank() &&
      component.language.isNullOrBlank() &&
      component.imageBaseUrl.isNullOrBlank()
    ) {
      return null
    }

    return Bundle().apply {
      if (component.text.isNotBlank()) {
        putString("text", component.text)
      }
      component.language?.let {
        putString("language", it)
      }
      component.imageBaseUrl?.let {
        putString("imageBaseUrl", it)
      }
    }
  }

  private fun updateNavigationCameraSurfaces(result: LocationMatcherResult) {
    if (navigationCameraSurfaces.isEmpty()) {
      return
    }

    navigationCameraSurfaces.values.forEach { surface ->
      surface.onLocationMatcherResult(result)
    }
  }

  private fun createNavigationCameraSurface(
    surfaceId: String,
    rnMapView: RNMBXMapView,
    options: Map<String, Any?>?
  ): NavigationCameraSurface {
    val mapView = rnMapView.mapView
    val mapboxMap = rnMapView.getMapboxMap()
    val viewportDataSource = MapboxNavigationViewportDataSource(mapboxMap).apply {
      this.options.followingFrameOptions.focalPoint = FollowingFrameOptions.FocalPoint(0.5, 0.5)
    }
    val navigationCamera = NavigationCamera(
      mapboxMap,
      mapView.camera,
      viewportDataSource
    )

    return NavigationCameraSurface(
      surfaceId = surfaceId,
      viewportDataSource = viewportDataSource,
      navigationCamera = navigationCamera,
      pixelDensity = mapView.resources.displayMetrics.density.toDouble(),
      onStateChanged = { state ->
        sendNavigationCameraState(surfaceId, state)
      }
    ).apply {
      applyInitialOptions(options)
    }
  }

  private fun sendNavigationCameraState(surfaceId: String, state: NavigationCameraState) {
    sendEvent(
      NAVIGATION_CAMERA_STATE_EVENT_NAME,
      Bundle().apply {
        putString("surfaceId", surfaceId)
        putString("state", state.name.lowercase())
      }
    )
  }

  private fun detachNavigationCameraSurfaces() {
    navigationCameraSurfaces.values.forEach { surface ->
      surface.detach()
    }
    navigationCameraSurfaces.clear()
  }

  private fun resolveMapView(mapViewTag: Int): RNMBXMapView {
    val reactContext = appContext.reactContext as? ReactContext
    val fabricView = reactContext?.let { context ->
      runCatching {
        UIManagerHelper
          .getUIManager(context, UIManagerType.FABRIC)
          ?.resolveView(mapViewTag)
      }.getOrNull()
    }
    val expoView = runCatching {
      appContext.findView<View>(mapViewTag)
    }.getOrNull()
    val activityView = appContext.currentActivity
      ?.window
      ?.decorView
      ?.rootView
      ?.findViewById<View>(mapViewTag)
    val view = fabricView ?: expoView ?: activityView
      ?: throw NavigationCameraException("Map view with tag $mapViewTag could not be resolved.")

    return findMapView(view)
      ?: throw NavigationCameraException("Resolved view $mapViewTag is not an RNMBX map view.")
  }

  private fun findMapView(view: View?): RNMBXMapView? {
    if (view is RNMBXMapView) {
      return view
    }

    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        val childMapView = findMapView(view.getChildAt(index))

        if (childMapView != null) {
          return childMapView
        }
      }
    }

    return null
  }

  private fun speedLimitToBundle(speedLimitInfo: SpeedLimitInfo): Bundle? {
    val speed = speedLimitInfo.speed
    if (speed == null) {
      logSpeedLimitInfo(speedLimitInfo, null)
      return null
    }

    val speedLimitMph = when (speedLimitInfo.unit) {
      SpeedUnit.KILOMETERS_PER_HOUR -> speed * KILOMETERS_PER_HOUR_TO_MILES_PER_HOUR
      SpeedUnit.METERS_PER_SECOND -> speed * METERS_PER_SECOND_TO_MILES_PER_HOUR
      SpeedUnit.MILES_PER_HOUR -> speed.toDouble()
    }

    logSpeedLimitInfo(speedLimitInfo, speedLimitMph)

    return Bundle().apply {
      putDouble("speed", speed.toDouble())
      putDouble("speedLimitMph", speedLimitMph)
      putString("sign", speedLimitInfo.sign.name.lowercase())
      putString("unit", speedUnitToString(speedLimitInfo.unit))
    }
  }

  private fun logSpeedLimitInfo(speedLimitInfo: SpeedLimitInfo, speedLimitMph: Double?) {
    val speed = speedLimitInfo.speed
    val key = listOf(
      speed?.toString() ?: "none",
      speedLimitInfo.unit.name,
      speedLimitInfo.sign.name
    )
      .joinToString(":")

    if (lastLoggedSpeedLimitKey == key) {
      return
    }

    lastLoggedSpeedLimitKey = key

    if (speedLimitMph == null) {
      Log.d(
        LOG_TAG,
        "Mapbox Navigation speed limit info received without speed value: " +
          "unit=${speedUnitToString(speedLimitInfo.unit)}, sign=${speedLimitInfo.sign.name.lowercase()}"
      )
      return
    }

    Log.d(
      LOG_TAG,
      "Mapbox Navigation speed limit parsed: " +
        "speed=$speed, unit=${speedUnitToString(speedLimitInfo.unit)}, " +
        "sign=${speedLimitInfo.sign.name.lowercase()}, speedLimitMph=$speedLimitMph"
    )
  }

  private fun speedUnitToString(unit: SpeedUnit): String {
    return when (unit) {
      SpeedUnit.KILOMETERS_PER_HOUR -> "km/h"
      SpeedUnit.METERS_PER_SECOND -> "m/s"
      SpeedUnit.MILES_PER_HOUR -> "mph"
    }
  }

  private fun locationToBundle(location: Location): Bundle {
    return Bundle().apply {
      putDouble("latitude", location.latitude)
      putDouble("longitude", location.longitude)
      putDoubleIfPresent("accuracy", location.horizontalAccuracy)
      putDoubleIfPresent("altitude", location.altitude)
      putDoubleIfPresent("bearing", location.bearing)
      putDoubleIfPresent("course", location.bearing)
      putDoubleIfPresent("horizontalAccuracy", location.horizontalAccuracy)
      putDoubleIfPresent("speed", location.speed)
      putLongIfPresent("timestamp", location.timestamp)
    }
  }

  private fun Bundle.putDoubleIfPresent(key: String, value: Double?) {
    if (value != null) {
      putDouble(key, value)
    }
  }

  private fun Bundle.putLongIfPresent(key: String, value: Long?) {
    if (value != null) {
      putDouble(key, value.toDouble())
    }
  }

  private fun hasForegroundLocationPermission(context: Context): Boolean {
    return ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_COARSE_LOCATION
      ) == PackageManager.PERMISSION_GRANTED
  }

  private fun reactContext(): Context {
    return appContext.reactContext ?: throw Exceptions.ReactContextLost()
  }

  private fun tripSessionStateToString(state: TripSessionState): String {
    return state.name.lowercase()
  }

  private class AndroidAutoSessionLifecycleOwner : LifecycleOwner {
    private val lifecycleRegistry = LifecycleRegistry(this)

    override val lifecycle: Lifecycle
      get() = lifecycleRegistry

    fun create() {
      if (lifecycle.currentState == Lifecycle.State.INITIALIZED) {
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_CREATE)
      }
    }

    fun updateVisibilityState(state: String): Boolean {
      when (state) {
        AUTO_PLAY_RENDER_STATE_WILL_APPEAR -> create()
        AUTO_PLAY_RENDER_STATE_DID_APPEAR -> resume()
        AUTO_PLAY_RENDER_STATE_WILL_DISAPPEAR -> moveToStarted()
        AUTO_PLAY_RENDER_STATE_DID_DISAPPEAR -> stop()
        else -> return false
      }

      return true
    }

    fun disconnect() {
      stop()

      if (lifecycle.currentState == Lifecycle.State.CREATED) {
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_DESTROY)
      }
    }

    private fun resume() {
      create()

      if (lifecycle.currentState == Lifecycle.State.CREATED) {
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_START)
      }

      if (lifecycle.currentState == Lifecycle.State.STARTED) {
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_RESUME)
      }
    }

    private fun moveToStarted() {
      create()

      if (lifecycle.currentState == Lifecycle.State.CREATED) {
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_START)
      }

      if (lifecycle.currentState == Lifecycle.State.RESUMED) {
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE)
      }
    }

    private fun stop() {
      if (lifecycle.currentState == Lifecycle.State.RESUMED) {
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE)
      }

      if (lifecycle.currentState == Lifecycle.State.STARTED) {
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_STOP)
      }
    }
  }

  private class MissingLocationPermissionException :
    Exception("Location permission is required to start a Mapbox Navigation trip session.")

  private class NavigationCameraException(
    message: String,
    cause: Throwable? = null
  ) : Exception(message, cause)

  private class NavigationCameraSurface(
    private val surfaceId: String,
    private val viewportDataSource: MapboxNavigationViewportDataSource,
    private val navigationCamera: NavigationCamera,
    private val pixelDensity: Double,
    private val onStateChanged: (NavigationCameraState) -> Unit
  ) {
    private var requestedMode = NAVIGATION_CAMERA_MODE_IDLE
    private var followingRequestPending = false
    private var lastLocationUpdateAtMs: Long? = null
    private var lastLocationBoundOptionsAtMs: Long? = null
    private var latestEnhancedLocation: Location? = null
    private var optionsLocationUpdateTimestamp: Long? = null
    private var pendingOptions: Map<String, Any?>? = null
    private val recentEnhancedLocations = linkedMapOf<Long, Location>()
    private val stateObserver = NavigationCameraStateChangedObserver { state ->
      onStateChanged(state)
    }

    init {
      navigationCamera.registerNavigationCameraStateChangeObserver(stateObserver)
    }

    fun onLocationMatcherResult(result: LocationMatcherResult) {
      rememberEnhancedLocation(result.enhancedLocation)

      if (requestedMode != NAVIGATION_CAMERA_MODE_FOLLOWING) {
        viewportDataSource.onLocationChanged(result.enhancedLocation)
        viewportDataSource.evaluate()
        return
      }

      val transitionOptions = NavigationCameraTransitionOptions.Builder()
        .maxDuration(nextLocationTransitionDurationMs())
        .build()

      navigationCamera.updateFollowingFrameTransitionOptions(transitionOptions)

      pendingOptions?.let { options ->
        pendingOptions = null
        applyOptions(options)
      }

      viewportDataSource.onLocationChanged(result.enhancedLocation)
      viewportDataSource.evaluate()

      if (followingRequestPending) {
        followingRequestPending = false
        lastLocationBoundOptionsAtMs = optionsLocationUpdateTimestamp
        navigationCamera.requestNavigationCameraToFollowing(
          transitionOptions,
          transitionOptions
        )
      }
    }

    fun updateOptions(options: Map<String, Any?>?) {
      if (requestedMode != NAVIGATION_CAMERA_MODE_FOLLOWING) {
        pendingOptions = null
        applyOptions(options)
        return
      }

      val locationUpdateTimestamp = getOptionalLong(options, "locationUpdateTimestamp")
      val appliesToCurrentLocation =
        locationUpdateTimestamp != null && locationUpdateTimestamp != lastLocationBoundOptionsAtMs

      if (appliesToCurrentLocation) {
        pendingOptions = null
        applyOptions(options)
        lastLocationBoundOptionsAtMs = locationUpdateTimestamp
        val matchingLocation = recentEnhancedLocations[locationUpdateTimestamp]
          ?: latestEnhancedLocation

        matchingLocation?.let { location ->
          viewportDataSource.onLocationChanged(location)
          viewportDataSource.evaluate()

          if (followingRequestPending) {
            val transitionOptions = NavigationCameraTransitionOptions.Builder()
              .maxDuration(0)
              .build()

            followingRequestPending = false
            navigationCamera.requestNavigationCameraToFollowing(
              transitionOptions,
              transitionOptions
            )
          }
        }
        return
      }

      // Keep the latest passive camera snapshot until a fresh matched location
      // frames it. Re-evaluating here would animate to the previous location.
      pendingOptions = options?.toMap() ?: emptyMap()
    }

    fun applyInitialOptions(options: Map<String, Any?>?) {
      pendingOptions = null
      applyOptions(options)
    }

    private fun applyOptions(options: Map<String, Any?>?) {
      optionsLocationUpdateTimestamp =
        getOptionalLong(options, "locationUpdateTimestamp")
      val padding = options?.get("padding") as? Map<*, *>
      // React reports padding in dp; Mapbox EdgeInsets use physical pixels.
      viewportDataSource.followingPadding = EdgeInsets(
        getPaddingDouble(padding, "paddingTop") * pixelDensity,
        getPaddingDouble(padding, "paddingLeft") * pixelDensity,
        getPaddingDouble(padding, "paddingBottom") * pixelDensity,
        getPaddingDouble(padding, "paddingRight") * pixelDensity
      )

      getOptionalDouble(options, "zoomLevel")?.let {
        viewportDataSource.followingZoomPropertyOverride(it)
      }

      getOptionalDouble(options, "pitch")?.let {
        viewportDataSource.followingPitchPropertyOverride(it)
      }
    }

    fun setMode(mode: String) {
      val nextMode = when (mode) {
        NAVIGATION_CAMERA_MODE_FOLLOWING -> NAVIGATION_CAMERA_MODE_FOLLOWING
        else -> NAVIGATION_CAMERA_MODE_IDLE
      }

      if (requestedMode == nextMode) {
        return
      }

      requestedMode = nextMode

      if (requestedMode == NAVIGATION_CAMERA_MODE_FOLLOWING) {
        val matchingLocation = optionsLocationUpdateTimestamp?.let(recentEnhancedLocations::get)

        if (matchingLocation == null) {
          followingRequestPending = true
        } else {
          val transitionOptions = NavigationCameraTransitionOptions.Builder()
            .maxDuration(0)
            .build()

          viewportDataSource.onLocationChanged(matchingLocation)
          viewportDataSource.evaluate()
          lastLocationBoundOptionsAtMs = optionsLocationUpdateTimestamp
          followingRequestPending = false
          navigationCamera.requestNavigationCameraToFollowing(
            transitionOptions,
            transitionOptions
          )
        }
      } else {
        followingRequestPending = false
        lastLocationUpdateAtMs = null
        lastLocationBoundOptionsAtMs = null
        pendingOptions?.let(::applyOptions)
        pendingOptions = null
        navigationCamera.requestNavigationCameraToIdle()
      }
    }

    fun detach() {
      followingRequestPending = false
      lastLocationUpdateAtMs = null
      lastLocationBoundOptionsAtMs = null
      latestEnhancedLocation = null
      optionsLocationUpdateTimestamp = null
      pendingOptions = null
      recentEnhancedLocations.clear()
      navigationCamera.unregisterNavigationCameraStateChangeObserver(stateObserver)
      navigationCamera.requestNavigationCameraToIdle()
    }

    private fun nextLocationTransitionDurationMs(): Long {
      val now = SystemClock.elapsedRealtime()
      val previousUpdateAtMs = lastLocationUpdateAtMs

      lastLocationUpdateAtMs = now

      if (previousUpdateAtMs == null) {
        return 0
      }

      val intervalMs = now - previousUpdateAtMs

      return if (intervalMs in 1..MAXIMUM_LOCATION_TRANSITION_INTERVAL_MS) {
        intervalMs
      } else {
        0
      }
    }

    private fun rememberEnhancedLocation(location: Location) {
      latestEnhancedLocation = location

      val timestamp = location.timestamp ?: return

      recentEnhancedLocations[timestamp] = location

      while (recentEnhancedLocations.size > RECENT_ENHANCED_LOCATION_LIMIT) {
        val oldestTimestamp = recentEnhancedLocations.keys.firstOrNull() ?: break
        recentEnhancedLocations.remove(oldestTimestamp)
      }
    }

    private fun getPaddingDouble(map: Map<*, *>?, key: String): Double {
      return getOptionalDouble(map, key) ?: 0.0
    }

    private fun getOptionalDouble(map: Map<*, *>?, key: String): Double? {
      if (map == null || !map.containsKey(key)) {
        return null
      }

      val value = map[key]
      return when (value) {
        is Number -> value.toDouble()
        else -> null
      }
    }

    private fun getOptionalLong(map: Map<*, *>?, key: String): Long? {
      if (map == null || !map.containsKey(key)) {
        return null
      }

      return (map[key] as? Number)?.toLong()
    }

    private companion object {
      private const val MAXIMUM_LOCATION_TRANSITION_INTERVAL_MS = 5000L
      private const val NAVIGATION_CAMERA_MODE_FOLLOWING = "following"
      private const val NAVIGATION_CAMERA_MODE_IDLE = "idle"
      private const val RECENT_ENHANCED_LOCATION_LIMIT = 8
    }
  }

  private data class ElectronicHorizonEdgeGeometry(
    val edge: EHorizonEdge,
    val coordinates: ArrayList<ArrayList<Double>>
  )

  private companion object {
    private const val AUTO_PLAY_RENDER_STATE_DID_APPEAR = "didAppear"
    private const val AUTO_PLAY_RENDER_STATE_DID_DISAPPEAR = "didDisappear"
    private const val AUTO_PLAY_RENDER_STATE_WILL_APPEAR = "willAppear"
    private const val AUTO_PLAY_RENDER_STATE_WILL_DISAPPEAR = "willDisappear"
    private const val ELECTRONIC_HORIZON_EVENT_NAME = "onElectronicHorizon"
    private const val ELECTRONIC_HORIZON_LENGTH_METERS = 16093.44
    private const val ELECTRONIC_HORIZON_MPP_ONLY_EXPANSION = 0
    private const val ELECTRONIC_HORIZON_MIN_UPDATE_INTERVAL_SECONDS = 1.0
    private const val ENHANCED_LOCATION_EVENT_NAME = "onEnhancedLocation"
    private const val KILOMETERS_PER_HOUR_TO_MILES_PER_HOUR = 0.62137119223733
    private const val LOG_TAG = "RNMapboxNavigation"
    private const val MAXIMUM_NAVIGATION_PUCK_SCALE = 128f
    private val APP_STYLE_LAYER_IDS = setOf("directions-route-line")
    private val MAPBOX_STYLE_SLOTS = setOf("bottom", "middle", "top")
    private const val METERS_PER_SECOND_TO_MILES_PER_HOUR = 2.2369362920544
    private const val MINIMUM_NAVIGATION_PUCK_SCALE = 16f
    private const val MODULE_NAME = "RNMapboxNavigation"
    private const val NAVIGATION_CAMERA_STATE_EVENT_NAME = "onNavigationCameraState"
    private const val NAVIGATION_PUCK_MODEL_URI = "asset://navigation_puck.glb"
    private const val RAW_LOCATION_EVENT_NAME = "onRawLocation"
    private const val TRIP_SESSION_STATE_EVENT_NAME = "onTripSessionState"
    private const val UNAVAILABLE_STATE = "unavailable"
  }
}
