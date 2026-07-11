package com.rnmapbox.navigation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.mapbox.common.location.Location
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.plugin.animation.camera
import com.mapbox.navigation.base.ExperimentalMapboxNavigationAPI
import com.mapbox.navigation.base.options.NavigationOptions
import com.mapbox.navigation.base.road.model.Road
import com.mapbox.navigation.base.road.model.RoadComponent
import com.mapbox.navigation.base.speed.model.SpeedLimitInfo
import com.mapbox.navigation.base.speed.model.SpeedUnit
import com.mapbox.navigation.core.MapboxNavigation
import com.mapbox.navigation.core.MapboxNavigationProvider
import com.mapbox.navigation.core.lifecycle.MapboxNavigationApp
import com.mapbox.navigation.core.lifecycle.MapboxNavigationObserver
import com.mapbox.navigation.core.trip.session.LocationMatcherResult
import com.mapbox.navigation.core.trip.session.LocationObserver
import com.mapbox.navigation.core.trip.session.TripSessionState
import com.mapbox.navigation.core.trip.session.TripSessionStateObserver
import com.mapbox.navigation.ui.maps.camera.NavigationCamera
import com.mapbox.navigation.ui.maps.camera.data.MapboxNavigationViewportDataSource
import com.mapbox.navigation.ui.maps.camera.state.NavigationCameraState
import com.mapbox.navigation.ui.maps.camera.state.NavigationCameraStateChangedObserver
import com.rnmapbox.rnmbx.components.mapview.RNMBXMapView
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.types.toJSValueExperimental

@OptIn(ExperimentalMapboxNavigationAPI::class)
class RNMapboxNavigationModule : Module() {
  private var lastEnhancedLocation: Bundle? = null
  private var lastLoggedSpeedLimitKey: String? = null
  private var lifecycleAttached = false
  private var mapboxNavigation: MapboxNavigation? = null
  private var navigationProviderInstanceCreated = false
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
      return@AsyncFunction null
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
      detachNavigationCameraSurfaces()
      mapboxNavigation?.let { navigation ->
        navigation.stopTripSession()
        unbindNavigation(navigation)
      }

      if (observerRegistered) {
        MapboxNavigationApp.unregisterObserver(navigationObserver)
        observerRegistered = false
      }

      if (navigationProviderInstanceCreated && MapboxNavigationProvider.isCreated()) {
        MapboxNavigationProvider.destroy()
        navigationProviderInstanceCreated = false
      }
    }
  }

  private fun ensureNavigationApp(context: Context) {
    if (!MapboxNavigationApp.isSetup()) {
      MapboxNavigationApp.setup(NavigationOptions.Builder(context).build())
    }

    if (!observerRegistered) {
      MapboxNavigationApp.registerObserver(navigationObserver)
      observerRegistered = true
    }

    attachLifecycleOwner()

    MapboxNavigationApp.current()?.let {
      bindNavigation(it)
      return
    }

    ensureNavigationProvider(context).let {
      bindNavigation(it)
    }
  }

  private fun ensureNavigationProvider(context: Context): MapboxNavigation {
    if (MapboxNavigationProvider.isCreated()) {
      return MapboxNavigationProvider.retrieve()
    }

    navigationProviderInstanceCreated = true

    return MapboxNavigationProvider.create(NavigationOptions.Builder(context).build())
  }

  private fun attachLifecycleOwner() {
    if (lifecycleAttached) {
      return
    }

    val lifecycleOwner = appContext.currentActivity as? LifecycleOwner ?: return

    MapboxNavigationApp.attach(lifecycleOwner)
    lifecycleAttached = true
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
    nextNavigation.registerTripSessionStateObserver(tripSessionStateObserver)
  }

  private fun unbindNavigation(navigation: MapboxNavigation) {
    navigation.unregisterLocationObserver(locationObserver)
    navigation.unregisterTripSessionStateObserver(tripSessionStateObserver)
    detachNavigationCameraSurfaces()

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
    if (navigation.getTripSessionState() == TripSessionState.STARTED) {
      return
    }

    navigation.startTripSession(withForegroundService = withForegroundService)
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
    val viewportDataSource = MapboxNavigationViewportDataSource(mapboxMap)
    val navigationCamera = NavigationCamera(
      mapboxMap,
      mapView.camera,
      viewportDataSource
    )

    return NavigationCameraSurface(
      surfaceId = surfaceId,
      viewportDataSource = viewportDataSource,
      navigationCamera = navigationCamera,
      onStateChanged = { state ->
        sendNavigationCameraState(surfaceId, state)
      }
    ).apply {
      updateOptions(options)
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
    val rootView = appContext.currentActivity?.window?.decorView?.rootView
      ?: throw NavigationCameraException("Current activity view hierarchy is unavailable.")
    val view = rootView.findViewById<View>(mapViewTag)
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
    private val onStateChanged: (NavigationCameraState) -> Unit
  ) {
    private var requestedMode = NAVIGATION_CAMERA_MODE_IDLE
    private val stateObserver = NavigationCameraStateChangedObserver { state ->
      onStateChanged(state)
    }

    init {
      navigationCamera.registerNavigationCameraStateChangeObserver(stateObserver)
    }

    fun onLocationMatcherResult(result: LocationMatcherResult) {
      viewportDataSource.onLocationChanged(result.enhancedLocation)
      viewportDataSource.evaluate()
    }

    fun updateOptions(options: Map<String, Any?>?) {
      val padding = options?.get("padding") as? Map<*, *>
      viewportDataSource.followingPadding = EdgeInsets(
        getPaddingDouble(padding, "paddingTop"),
        getPaddingDouble(padding, "paddingLeft"),
        getPaddingDouble(padding, "paddingBottom"),
        getPaddingDouble(padding, "paddingRight")
      )

      getOptionalDouble(options, "zoomLevel")?.let {
        viewportDataSource.followingZoomPropertyOverride(it)
      }

      getOptionalDouble(options, "pitch")?.let {
        viewportDataSource.followingPitchPropertyOverride(it)
      }

      viewportDataSource.evaluate()

      if (requestedMode == NAVIGATION_CAMERA_MODE_FOLLOWING) {
        navigationCamera.requestNavigationCameraToFollowing()
      }
    }

    fun setMode(mode: String) {
      requestedMode = when (mode) {
        NAVIGATION_CAMERA_MODE_FOLLOWING -> NAVIGATION_CAMERA_MODE_FOLLOWING
        else -> NAVIGATION_CAMERA_MODE_IDLE
      }

      if (requestedMode == NAVIGATION_CAMERA_MODE_FOLLOWING) {
        navigationCamera.requestNavigationCameraToFollowing()
      } else {
        navigationCamera.requestNavigationCameraToIdle()
      }
    }

    fun detach() {
      navigationCamera.unregisterNavigationCameraStateChangeObserver(stateObserver)
      navigationCamera.requestNavigationCameraToIdle()
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

    private companion object {
      private const val NAVIGATION_CAMERA_MODE_FOLLOWING = "following"
      private const val NAVIGATION_CAMERA_MODE_IDLE = "idle"
    }
  }

  private companion object {
    private const val ENHANCED_LOCATION_EVENT_NAME = "onEnhancedLocation"
    private const val KILOMETERS_PER_HOUR_TO_MILES_PER_HOUR = 0.62137119223733
    private const val LOG_TAG = "RNMapboxNavigation"
    private const val METERS_PER_SECOND_TO_MILES_PER_HOUR = 2.2369362920544
    private const val MODULE_NAME = "RNMapboxNavigation"
    private const val NAVIGATION_CAMERA_STATE_EVENT_NAME = "onNavigationCameraState"
    private const val RAW_LOCATION_EVENT_NAME = "onRawLocation"
    private const val TRIP_SESSION_STATE_EVENT_NAME = "onTripSessionState"
    private const val UNAVAILABLE_STATE = "unavailable"
  }
}
