package expo.modules.maplocationpuck

import android.animation.ValueAnimator
import android.view.animation.LinearInterpolator
import android.view.View
import android.view.ViewGroup
import com.mapbox.bindgen.Value
import com.mapbox.common.location.LocationError
import com.mapbox.geojson.Point
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.MapboxExperimental
import com.mapbox.maps.plugin.LocationPuck2D
import com.mapbox.maps.plugin.LocationPuck3D
import com.mapbox.maps.plugin.ModelScaleMode
import com.mapbox.maps.plugin.PuckBearing
import com.mapbox.maps.plugin.locationcomponent.DefaultLocationProvider
import com.mapbox.maps.plugin.locationcomponent.LocationConsumer
import com.mapbox.maps.plugin.locationcomponent.LocationProvider
import com.mapbox.maps.plugin.locationcomponent.OnIndicatorBearingChangedListener
import com.mapbox.maps.plugin.locationcomponent.OnIndicatorPositionChangedListener
import com.mapbox.maps.plugin.locationcomponent.PuckLocatedAtPointListener
import com.mapbox.maps.plugin.locationcomponent.location
import com.mapbox.maps.plugin.viewport.CompletionListener
import com.mapbox.maps.plugin.viewport.ViewportStatus
import com.mapbox.maps.plugin.viewport.data.FollowPuckViewportStateBearing
import com.mapbox.maps.plugin.viewport.data.FollowPuckViewportStateOptions
import com.mapbox.maps.plugin.viewport.state.FollowPuckViewportState
import com.mapbox.maps.plugin.viewport.viewport
import com.rnmapbox.rnmbx.components.mapview.RNMBXMapView
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference
import java.security.MessageDigest
import java.util.WeakHashMap
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

private const val LOCATION_PROVIDER_TIMEOUT_MS = 1_000L
private const val CAMERA_FOLLOW_TRANSITION_TIMEOUT_MS = 1_000L
private const val LOCATION_PUCK_DEFAULT_ANIMATION_DURATION_MS = 1_000L
private const val LOCATION_PUCK_MINIMUM_ANIMATION_DURATION_MS = 250L
private const val LOCATION_PUCK_MAXIMUM_ANIMATION_DURATION_MS = 1_200L
private const val LOCATION_PUCK_STALE_SNAP_THRESHOLD_MS = 3_000.0
private const val LOCATION_PUCK_HEADING_CORRECTION_DURATION_MS = 250.0
private const val LOCATION_PUCK_MODEL_ASSET = "navigation_puck.glb"
private const val LOCATION_PUCK_MODEL_URI = "asset://navigation_puck.glb"
private const val LOCATION_PUCK_MODEL_LAYER = "mapbox-location-model-layer"
private const val LOCATION_PUCK_MODEL_SOURCE = "mapbox-location-model-source"
private const val LOCATION_PUCK_INDICATOR_LAYER = "mapbox-location-indicator-layer"
private const val NON_ZERO_HEADING_CORRECTION_EPSILON = 0.0001
private const val HEADING_CORRECTION_UPDATE_EPSILON_DEGREES = 0.25
private val MAPBOX_STYLE_SLOTS = setOf("bottom", "middle", "top")
private val APP_STYLE_LAYER_IDS = setOf("directions-route-line")

private class SharedLocationPuckProvider : LocationProvider {
    private val locationConsumers = linkedSetOf<LocationConsumer>()
    private var lastBearing: Double? = null
    private var lastPoint: Point? = null
    private var lastRecordedAt: Double? = null

    val bearing: Double?
        get() = lastBearing

    val point: Point?
        get() = lastPoint

    override fun registerLocationConsumer(locationConsumer: LocationConsumer) {
        locationConsumers.add(locationConsumer)
        lastPoint?.let { point -> locationConsumer.onLocationUpdated(point) }
        lastBearing?.let { bearing -> locationConsumer.onBearingUpdated(bearing) }
    }

    override fun unRegisterLocationConsumer(locationConsumer: LocationConsumer) {
        locationConsumers.remove(locationConsumer)
    }

    fun update(
        point: Point,
        bearing: Double,
        recordedAt: Double?,
    ): Boolean {
        if (
            recordedAt != null &&
            lastRecordedAt != null &&
            recordedAt < checkNotNull(lastRecordedAt)
        ) {
            return false
        }

        val previousRecordedAt = lastRecordedAt
        val animationDuration = when {
            lastPoint == null -> 0L
            recordedAt == null || previousRecordedAt == null ->
                LOCATION_PUCK_DEFAULT_ANIMATION_DURATION_MS
            // Snap after a stale backlog (e.g. frozen renderer recovery) instead of gliding to catch up.
            recordedAt - previousRecordedAt > LOCATION_PUCK_STALE_SNAP_THRESHOLD_MS -> 0L
            else -> (recordedAt - previousRecordedAt)
                .toLong()
                .coerceIn(
                    LOCATION_PUCK_MINIMUM_ANIMATION_DURATION_MS,
                    LOCATION_PUCK_MAXIMUM_ANIMATION_DURATION_MS,
                )
        }
        val animationOptions: (ValueAnimator.() -> Unit)? =
            animationDuration.takeIf { it > 0 }?.let { durationMillis ->
                {
                    duration = durationMillis
                    interpolator = LinearInterpolator()
                }
            }

        lastPoint = point
        lastBearing = bearing
        lastRecordedAt = recordedAt ?: lastRecordedAt

        locationConsumers.toList().forEach { consumer ->
            consumer.onLocationUpdated(point, options = animationOptions)
            consumer.onBearingUpdated(bearing, options = animationOptions)
        }

        return true
    }
}

private data class SharedLocationPuckProviderState(
    var previousProvider: LocationProvider?,
    val provider: SharedLocationPuckProvider,
    var renderedBearing: Double? = null,
    var appliedHeadingCorrection: Double? = null,
    var effectiveModelHeading: Double? = null,
    var maximumAbsoluteHeadingCorrection: Double = 0.0,
    var headingCorrectionEverNonZero: Boolean = false,
    var headingCorrectionApplicationCount: Int = 0,
    var bearingListener: OnIndicatorBearingChangedListener? = null,
) {
    fun resetHeadingCorrection() {
        renderedBearing = null
        appliedHeadingCorrection = null
        effectiveModelHeading = null
        maximumAbsoluteHeadingCorrection = 0.0
        headingCorrectionEverNonZero = false
        headingCorrectionApplicationCount = 0
        bearingListener = null
    }
}

private fun findMapView(view: View): RNMBXMapView? {
    if (view is RNMBXMapView) {
        return view
    }

    if (view !is ViewGroup) {
        return null
    }

    for (index in 0 until view.childCount) {
        val mapView = findMapView(view.getChildAt(index))

        if (mapView != null) {
            return mapView
        }
    }

    return null
}

private fun ByteArray.sha256(): String {
    return MessageDigest
        .getInstance("SHA-256")
        .digest(this)
        .joinToString("") { byte -> "%02x".format(byte) }
}

@OptIn(MapboxExperimental::class)
class MapLocationPuckModule : Module() {
    private val cameraFollowStates = WeakHashMap<RNMBXMapView, FollowPuckViewportState>()
    private val locationProviderStates =
        WeakHashMap<RNMBXMapView, SharedLocationPuckProviderState>()

    private fun findMapView(viewTag: Int): RNMBXMapView? {
        val rootView = appContext.findView<View>(viewTag) ?: return null

        return findMapView(rootView)
    }

    private fun requireMapView(viewTag: Int): RNMBXMapView {
        val mapView = findMapView(viewTag)
            ?: throw IllegalStateException("The Mapbox map view is unavailable.")

        if (!mapView.isInitialized) {
            throw IllegalStateException("The Mapbox map view has not finished initializing.")
        }

        return mapView
    }

    private fun readLocationPuckModel(): ByteArray? {
        val context = appContext.reactContext ?: return null

        return runCatching {
            context.assets.open(LOCATION_PUCK_MODEL_ASSET).use { asset ->
                asset.readBytes()
            }
        }.getOrNull()
    }

    private fun ensureLocationProviderForUpdate(mapView: RNMBXMapView): SharedLocationPuckProvider {
        val location = mapView.mapView.location
        val currentProvider = location.getLocationProvider()
        val existingState = locationProviderStates[mapView]

        if (existingState != null) {
            if (currentProvider !== existingState.provider) {
                existingState.previousProvider = currentProvider
                location.setLocationProvider(existingState.provider)
            }

            location.enabled = true

            return existingState.provider
        }

        val provider = SharedLocationPuckProvider()

        locationProviderStates[mapView] = SharedLocationPuckProviderState(
            previousProvider = currentProvider,
            provider = provider,
        )
        location.setLocationProvider(provider)
        location.enabled = true

        return provider
    }

    private fun liveLocationProviderIsOwned(mapView: RNMBXMapView): Boolean {
        val state = locationProviderStates[mapView] ?: return false

        return state.provider.point != null &&
            mapView.mapView.location.getLocationProvider() === state.provider
    }

    private fun reassertLiveLocationProvider(mapView: RNMBXMapView): Boolean {
        val location = mapView.mapView.location
        val state = locationProviderStates[mapView] ?: return false

        if (state.provider.point == null) {
            return false
        }

        val currentProvider = location.getLocationProvider()

        if (currentProvider !== state.provider) {
            state.previousProvider = currentProvider
            location.setLocationProvider(state.provider)
        }

        location.enabled = true

        return liveLocationProviderIsOwned(mapView)
    }

    private fun viewportOwnsCameraFollowState(
        mapView: RNMBXMapView,
        followState: FollowPuckViewportState,
    ): Boolean {
        return when (val status = mapView.mapView.viewport.status) {
            is ViewportStatus.State -> status.state === followState
            is ViewportStatus.Transition -> status.toState === followState
            else -> false
        }
    }

    private fun clearCameraFollowState(mapView: RNMBXMapView) {
        val removedState = cameraFollowStates.remove(mapView) ?: return

        if (viewportOwnsCameraFollowState(mapView, removedState)) {
            mapView.mapView.viewport.idle()
        }
    }

    private fun normalizedHeading(heading: Double): Double {
        return ((heading % 360.0) + 360.0) % 360.0
    }

    private fun shortestSignedHeadingCorrection(
        matchedHeading: Double,
        renderedBearing: Double,
    ): Double {
        return (normalizedHeading(matchedHeading) - normalizedHeading(renderedBearing) + 540.0) %
            360.0 - 180.0
    }

    private fun modelRotationValue(zRotation: Double): Value {
        return Value(
            listOf(
                Value(0.0),
                Value(0.0),
                Value(zRotation),
            ),
        )
    }

    private fun zeroDurationTransitionValue(): Value {
        return Value(
            hashMapOf(
                "duration" to Value(0.0),
                "delay" to Value(0.0),
            ),
        )
    }

    private fun headingCorrectionTransitionValue(): Value {
        return Value(
            hashMapOf(
                "duration" to Value(LOCATION_PUCK_HEADING_CORRECTION_DURATION_MS),
                "delay" to Value(0.0),
            ),
        )
    }

    private fun applyHeadingCorrection(mapView: RNMBXMapView): Boolean {
        val state = locationProviderStates[mapView] ?: return false
        val matchedHeading = state.provider.bearing ?: return false
        val renderedBearing = state.renderedBearing ?: return false
        val location = mapView.mapView.location
        val mapboxMap = mapView.getMapboxMap()

        if (
            location.locationPuck !is LocationPuck3D ||
            !mapboxMap.styleLayerExists(LOCATION_PUCK_MODEL_LAYER)
        ) {
            return false
        }

        val correction = shortestSignedHeadingCorrection(
            matchedHeading = matchedHeading,
            renderedBearing = renderedBearing,
        )

        if (
            state.appliedHeadingCorrection?.let { appliedCorrection ->
                kotlin.math.abs(appliedCorrection - correction) <
                    HEADING_CORRECTION_UPDATE_EPSILON_DEGREES
            } == true
        ) {
            return true
        }

        val transitionResult = mapboxMap.setStyleLayerProperty(
            LOCATION_PUCK_MODEL_LAYER,
            "model-rotation-transition",
            headingCorrectionTransitionValue(),
        )
        val rotationResult = mapboxMap.setStyleLayerProperty(
            LOCATION_PUCK_MODEL_LAYER,
            "model-rotation",
            modelRotationValue(correction),
        )

        if (transitionResult.isError || rotationResult.isError) {
            return false
        }

        state.appliedHeadingCorrection = correction
        state.effectiveModelHeading = normalizedHeading(renderedBearing + correction)
        state.maximumAbsoluteHeadingCorrection = maxOf(
            state.maximumAbsoluteHeadingCorrection,
            kotlin.math.abs(correction),
        )
        state.headingCorrectionEverNonZero =
            state.headingCorrectionEverNonZero ||
                kotlin.math.abs(correction) > NON_ZERO_HEADING_CORRECTION_EPSILON
        state.headingCorrectionApplicationCount += 1

        return true
    }

    private fun attachHeadingCorrection(mapView: RNMBXMapView) {
        val state = locationProviderStates[mapView] ?: return
        val location = mapView.mapView.location

        if (location.locationPuck !is LocationPuck3D) {
            return
        }

        // The model layer may have been recreated by a style update. Reapply
        // once at attachment time, then coalesce per-frame bearing callbacks.
        state.appliedHeadingCorrection = null

        if (state.bearingListener == null) {
            val mapViewReference = WeakReference(mapView)
            val listener = object : OnIndicatorBearingChangedListener {
                override fun onIndicatorBearingChanged(indicatorBearing: Double) {
                    val liveMapView = mapViewReference.get() ?: return
                    val liveState = locationProviderStates[liveMapView] ?: return

                    liveState.renderedBearing = normalizedHeading(indicatorBearing)
                    applyHeadingCorrection(liveMapView)
                }
            }

            state.bearingListener = listener
            location.addOnIndicatorBearingChangedListener(listener)
        }

        applyHeadingCorrection(mapView)
    }

    private fun clearHeadingCorrection(
        mapView: RNMBXMapView,
        resetModelRotation: Boolean = true,
    ) {
        val state = locationProviderStates[mapView] ?: return
        val location = mapView.mapView.location

        state.bearingListener?.let(location::removeOnIndicatorBearingChangedListener)

        if (
            resetModelRotation &&
            mapView.getMapboxMap().styleLayerExists(LOCATION_PUCK_MODEL_LAYER)
        ) {
            mapView.getMapboxMap().setStyleLayerProperty(
                LOCATION_PUCK_MODEL_LAYER,
                "model-rotation-transition",
                zeroDurationTransitionValue(),
            )
            mapView.getMapboxMap().setStyleLayerProperty(
                LOCATION_PUCK_MODEL_LAYER,
                "model-rotation",
                modelRotationValue(0.0),
            )
        }

        state.resetHeadingCorrection()
    }

    override fun definition() = ModuleDefinition {
        Name("MapLocationPuck")

        AsyncFunction("setLocationPuckLocation") {
                viewTag: Int,
                longitude: Double,
                latitude: Double,
                heading: Double,
                recordedAt: Double?,
            ->
            val mapView = requireMapView(viewTag)
            val provider = ensureLocationProviderForUpdate(mapView)

            val providerWasUpdated = provider.update(
                point = Point.fromLngLat(longitude, latitude),
                bearing = normalizedHeading(heading),
                recordedAt = recordedAt?.takeIf(Double::isFinite),
            )

            if (providerWasUpdated) {
                applyHeadingCorrection(mapView)
            }

            providerWasUpdated
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("clearLocationPuckLocationProvider") { viewTag: Int ->
            val mapView = requireMapView(viewTag)
            clearCameraFollowState(mapView)
            clearHeadingCorrection(mapView)
            val state = locationProviderStates.remove(mapView)

            if (state != null && mapView.mapView.location.getLocationProvider() === state.provider) {
                val context = appContext.reactContext

                mapView.mapView.location.setLocationProvider(
                    state.previousProvider
                        ?: checkNotNull(context) {
                            "The React context is unavailable."
                        }.let(::DefaultLocationProvider),
                )
            }

            state != null
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("applyLocationPuck3D") { viewTag: Int, scaleExpression: String, slot: String?, layerAbove: String? ->
            val mapView = requireMapView(viewTag)
            val location = mapView.mapView.location

            checkNotNull(readLocationPuckModel()) {
                "Bundled $LOCATION_PUCK_MODEL_ASSET could not be found."
            }

            if (!reassertLiveLocationProvider(mapView)) {
                return@AsyncFunction false
            }

            location.locationPuck = LocationPuck3D(
                modelUri = LOCATION_PUCK_MODEL_URI,
                modelScaleExpression = scaleExpression,
                modelRotation = listOf(0f, 0f, 0f),
                modelCastShadows = false,
                modelReceiveShadows = false,
                modelScaleMode = ModelScaleMode.MAP,
                modelEmissiveStrength = 1f,
            )
            location.puckBearing = PuckBearing.HEADING
            location.puckBearingEnabled = true
            location.slot = slot?.takeIf(MAPBOX_STYLE_SLOTS::contains)
            location.layerAbove = layerAbove?.takeIf(APP_STYLE_LAYER_IDS::contains)
            location.layerBelow = null
            location.enabled = true
            attachHeadingCorrection(mapView)

            true
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("clearLocationPuck3D") { viewTag: Int ->
            val mapView = requireMapView(viewTag)
            val location = mapView.mapView.location
            val hadLocationPuck3D = location.locationPuck is LocationPuck3D

            if (hadLocationPuck3D) {
                clearHeadingCorrection(mapView)
                location.locationPuck = LocationPuck2D(opacity = 0f)
                location.layerAbove = null
                location.layerBelow = null
                location.slot = null
            }

            hadLocationPuck3D
        }.runOnQueue(Queues.MAIN)

        (AsyncFunction("setLocationPuckCameraFollow") Coroutine {
                viewTag: Int,
                enabled: Boolean,
                zoom: Double?,
                pitch: Double?,
                paddingTop: Double,
                paddingLeft: Double,
                paddingBottom: Double,
                paddingRight: Double,
            ->
            val mapView = requireMapView(viewTag)
            val viewport = mapView.mapView.viewport

            if (!enabled) {
                clearCameraFollowState(mapView)

                return@Coroutine true
            }

            if (!reassertLiveLocationProvider(mapView)) {
                return@Coroutine false
            }

            val pixelDensity = mapView.resources.displayMetrics.density.toDouble()
            val optionsBuilder = FollowPuckViewportStateOptions.Builder()
                .bearing(FollowPuckViewportStateBearing.SyncWithLocationPuck)
                .padding(
                    EdgeInsets(
                        paddingTop * pixelDensity,
                        paddingLeft * pixelDensity,
                        paddingBottom * pixelDensity,
                        paddingRight * pixelDensity,
                    ),
                )

            zoom?.takeIf(Double::isFinite)?.let(optionsBuilder::zoom)
            pitch?.takeIf(Double::isFinite)?.let(optionsBuilder::pitch)

            val options = optionsBuilder.build()
            val followState = cameraFollowStates[mapView]
                ?: viewport.makeFollowPuckViewportState(options)

            followState.options = options
            cameraFollowStates[mapView] = followState
            val transitionSucceeded = withTimeoutOrNull(
                CAMERA_FOLLOW_TRANSITION_TIMEOUT_MS,
            ) {
                suspendCancellableCoroutine { continuation ->
                    viewport.transitionTo(
                        followState,
                        viewport.makeImmediateViewportTransition(),
                        CompletionListener { succeeded ->
                            if (continuation.isActive) {
                                continuation.resume(succeeded)
                            }
                        },
                    )
                }
            } ?: false
            val ownsViewport =
                transitionSucceeded &&
                    liveLocationProviderIsOwned(mapView) &&
                    viewportOwnsCameraFollowState(mapView, followState)

            if (!ownsViewport && cameraFollowStates[mapView] === followState) {
                if (viewportOwnsCameraFollowState(mapView, followState)) {
                    viewport.idle()
                }

                cameraFollowStates.remove(mapView)
            }

            return@Coroutine ownsViewport
        }).runOnQueue(Queues.MAIN)

        AsyncFunction("isLocationPuckCameraFollowActive") { viewTag: Int ->
            val mapView = requireMapView(viewTag)
            val followState = cameraFollowStates[mapView]

            followState != null &&
                liveLocationProviderIsOwned(mapView) &&
                viewportOwnsCameraFollowState(mapView, followState)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("getLocationPuckState") { viewTag: Int ->
            val mapView = requireMapView(viewTag)
            val location = mapView.mapView.location
            val locationPuck = location.locationPuck
            val locationPuck3D = locationPuck as? LocationPuck3D
            val style = mapView.getMapboxMap().style
            val modelAsset = readLocationPuckModel()
            val providerState = locationProviderStates[mapView]
            val providerPoint = providerState?.provider?.point
            val cameraCenter = mapView.getMapboxMap().cameraState.center

            mapOf(
                "puckKind" to if (locationPuck3D != null) "3d" else "2d",
                "modelUri" to locationPuck3D?.modelUri,
                "modelScale" to locationPuck3D?.modelScale,
                "modelScaleIsExpression" to (locationPuck3D?.modelScaleExpression != null),
                "modelRotation" to locationPuck3D?.modelRotation,
                "modelCastShadows" to locationPuck3D?.modelCastShadows,
                "modelReceiveShadows" to locationPuck3D?.modelReceiveShadows,
                "modelScaleMode" to locationPuck3D?.modelScaleMode?.value,
                "modelEmissiveStrength" to locationPuck3D?.modelEmissiveStrength,
                "locationEnabled" to location.enabled,
                "puckBearing" to location.puckBearing.value,
                "puckBearingEnabled" to location.puckBearingEnabled,
                "slot" to location.slot,
                "layerAbove" to location.layerAbove,
                "modelLayerExists" to (style?.styleLayerExists(LOCATION_PUCK_MODEL_LAYER) == true),
                "modelSourceExists" to (style?.styleSourceExists(LOCATION_PUCK_MODEL_SOURCE) == true),
                "indicatorLayerExists" to (style?.styleLayerExists(LOCATION_PUCK_INDICATOR_LAYER) == true),
                "providerOwnedByApp" to
                    (location.getLocationProvider() === providerState?.provider),
                "providerLatitude" to providerPoint?.latitude(),
                "providerLongitude" to providerPoint?.longitude(),
                "providerHeading" to providerState?.provider?.bearing,
                "renderedBearing" to providerState?.renderedBearing,
                "appliedHeadingCorrection" to providerState?.appliedHeadingCorrection,
                "effectiveModelHeading" to providerState?.effectiveModelHeading,
                "maximumAbsoluteHeadingCorrection" to
                    providerState?.maximumAbsoluteHeadingCorrection,
                "headingCorrectionEverNonZero" to
                    providerState?.headingCorrectionEverNonZero,
                "headingCorrectionApplicationCount" to
                    providerState?.headingCorrectionApplicationCount,
                "headingCorrectionObserverActive" to
                    (providerState?.bearingListener != null),
                "cameraFollowingPuck" to (
                    cameraFollowStates[mapView]?.let { followState ->
                        viewportOwnsCameraFollowState(mapView, followState)
                    } == true
                ),
                "cameraCenterLatitude" to cameraCenter.latitude(),
                "cameraCenterLongitude" to cameraCenter.longitude(),
                "cameraBearing" to mapView.getMapboxMap().cameraState.bearing,
                "modelAssetByteLength" to modelAsset?.size,
                "modelAssetSha256" to modelAsset?.sha256(),
            )
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("isPuckRenderedAtCoordinate") { viewTag: Int, longitude: Double, latitude: Double, promise: Promise ->
            val mapView = requireMapView(viewTag)
            val location = mapView.mapView.location

            if (location.locationPuck !is LocationPuck3D) {
                promise.resolve(false)
                return@AsyncFunction
            }

            var isSettled = false
            location.isLocatedAt(
                Point.fromLngLat(longitude, latitude),
                object : PuckLocatedAtPointListener {
                    override fun onResult(isLocatedAt: Boolean) {
                        if (isSettled) {
                            return
                        }

                        isSettled = true
                        promise.resolve(isLocatedAt)
                    }
                },
            )
            mapView.postDelayed(
                {
                    if (!isSettled) {
                        isSettled = true
                        promise.resolve(false)
                    }
                },
                LOCATION_PROVIDER_TIMEOUT_MS,
            )
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("getLocationProviderCoordinate") { viewTag: Int, promise: Promise ->
            val mapView = requireMapView(viewTag)
            val locationProvider = mapView.mapView.location.getLocationProvider()

            if (locationProvider == null) {
                promise.reject(
                    "ERR_MAP_LOCATION_PROVIDER_UNAVAILABLE",
                    "The Mapbox map does not have a location provider.",
                    null,
                )
                return@AsyncFunction
            }

            var isSettled = false
            lateinit var locationConsumer: LocationConsumer

            fun unregisterLocationConsumer() {
                mapView.post {
                    locationProvider.unRegisterLocationConsumer(locationConsumer)
                }
            }

            locationConsumer = object : LocationConsumer {
                override fun onLocationUpdated(
                    vararg locations: Point,
                    options: (ValueAnimator.() -> Unit)?,
                ) {
                    val location = locations.lastOrNull()

                    if (isSettled || location == null) {
                        return
                    }

                    isSettled = true
                    promise.resolve(
                        mapOf(
                            "latitude" to location.latitude(),
                            "longitude" to location.longitude(),
                        ),
                    )
                    unregisterLocationConsumer()
                }

                override fun onBearingUpdated(
                    vararg bearings: Double,
                    options: (ValueAnimator.() -> Unit)?,
                ) = Unit

                override fun onPuckLocationAnimatorDefaultOptionsUpdated(
                    options: ValueAnimator.() -> Unit,
                ) = Unit

                override fun onPuckBearingAnimatorDefaultOptionsUpdated(
                    options: ValueAnimator.() -> Unit,
                ) = Unit

                override fun onHorizontalAccuracyRadiusUpdated(
                    vararg radii: Double,
                    options: (ValueAnimator.() -> Unit)?,
                ) = Unit

                override fun onPuckAccuracyRadiusAnimatorDefaultOptionsUpdated(
                    options: ValueAnimator.() -> Unit,
                ) = Unit

                override fun onError(error: LocationError) {
                    if (isSettled) {
                        return
                    }

                    isSettled = true
                    promise.reject(
                        "ERR_MAP_LOCATION_PROVIDER",
                        error.toString(),
                        null,
                    )
                    unregisterLocationConsumer()
                }
            }

            locationProvider.registerLocationConsumer(locationConsumer)
            mapView.postDelayed(
                {
                    if (!isSettled) {
                        isSettled = true
                        locationProvider.unRegisterLocationConsumer(locationConsumer)
                        promise.reject(
                            "ERR_MAP_LOCATION_PROVIDER_TIMEOUT",
                            "The Mapbox location provider did not return a coordinate.",
                            null,
                        )
                    }
                },
                LOCATION_PROVIDER_TIMEOUT_MS,
            )
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("getIndicatorCoordinate") { viewTag: Int, promise: Promise ->
            val mapView = requireMapView(viewTag)
            val locationComponent = mapView.mapView.location
            var isSettled = false
            lateinit var indicatorPositionListener: OnIndicatorPositionChangedListener

            fun unregisterIndicatorPositionListener() {
                mapView.post {
                    locationComponent.removeOnIndicatorPositionChangedListener(
                        indicatorPositionListener,
                    )
                }
            }

            indicatorPositionListener = object : OnIndicatorPositionChangedListener {
                override fun onIndicatorPositionChanged(point: Point) {
                    if (isSettled) {
                        return
                    }

                    isSettled = true
                    promise.resolve(
                        mapOf(
                            "latitude" to point.latitude(),
                            "longitude" to point.longitude(),
                        ),
                    )
                    unregisterIndicatorPositionListener()
                }
            }

            locationComponent.addOnIndicatorPositionChangedListener(
                indicatorPositionListener,
            )
            mapView.postDelayed(
                {
                    if (!isSettled) {
                        isSettled = true
                        locationComponent.removeOnIndicatorPositionChangedListener(
                            indicatorPositionListener,
                        )
                        promise.reject(
                            "ERR_MAP_INDICATOR_POSITION_TIMEOUT",
                            "The Mapbox location indicator did not return a coordinate.",
                            null,
                        )
                    }
                },
                LOCATION_PROVIDER_TIMEOUT_MS,
            )
        }.runOnQueue(Queues.MAIN)
    }
}
