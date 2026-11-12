package org.driversagainstflock.tv

import android.graphics.Color as AndroidColor
import android.view.Gravity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.mapbox.geojson.Feature
import com.mapbox.geojson.FeatureCollection
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.MapView
import com.mapbox.bindgen.Value
import com.mapbox.maps.Style
import com.mapbox.maps.MapboxExperimental
import com.mapbox.maps.extension.style.layers.generated.modelLayer
import com.mapbox.maps.extension.style.layers.properties.generated.ModelType
import com.mapbox.maps.extension.style.expressions.generated.Expression
import com.google.gson.JsonArray
import com.mapbox.maps.extension.style.layers.addLayer
import com.mapbox.maps.extension.style.layers.generated.circleLayer
import com.mapbox.maps.extension.style.sources.addSource
import com.mapbox.maps.extension.style.sources.generated.GeoJsonSource
import com.mapbox.maps.extension.style.sources.generated.geoJsonSource
import com.mapbox.maps.extension.style.sources.getSourceAs
import com.mapbox.maps.plugin.logo.logo
import com.mapbox.maps.plugin.scalebar.scalebar

private const val ADDED = "tv-added"
private const val REMOVED = "tv-removed"
private const val MAPPED = "tv-mapped"
private const val SELECTED = "tv-selected"
private const val CONES = "tv-cones"
private const val HIGHLIGHT = "tv-highlight"

private fun valid(camera: TvCamera): Boolean = camera.latitude.isFinite() && camera.longitude.isFinite()

private fun features(cameras: List<TvCamera>): FeatureCollection = FeatureCollection.fromFeatures(
    cameras.filter(::valid).map { Feature.fromGeometry(Point.fromLngLat(it.longitude, it.latitude)) }
)
private fun mappedFeatures(points: List<TvMapPoint>): FeatureCollection = FeatureCollection.fromFeatures(
    points.filter { it.latitude in -90.0..90.0 && it.longitude in -180.0..180.0 }
        .map { Feature.fromGeometry(Point.fromLngLat(it.longitude, it.latitude)) }
)

private fun coneFeatures(mapped: List<TvMapPoint>, changes: List<TvCamera>): FeatureCollection {
    val points = (changes.filter { it.kind != "removed" && valid(it) }.map { TvMapPoint(it.longitude, it.latitude, it.direction) } + mapped)
        .filter { it.latitude in -90.0..90.0 && it.longitude in -180.0..180.0 && cameraDirections(it.direction).isNotEmpty() }
        .distinctBy { it.longitude to it.latitude }
    return FeatureCollection.fromFeatures(points.flatMap { point ->
        cameraDirections(point.direction).map { direction ->
            Feature.fromGeometry(Point.fromLngLat(point.longitude, point.latitude)).apply {
                addProperty("rotation", JsonArray().apply { add(0); add(0); add(direction) })
            }
        }
    })
}

@OptIn(MapboxExperimental::class)
@Composable
fun TvMap(
    mapped: List<TvMapPoint>,
    changes: List<TvCamera>,
    selected: TvCamera?,
    modifier: Modifier = Modifier,
    leftInset: Int = 0,
    ambient: Boolean = false,
) {
    val context = LocalContext.current
    val dark = LocalTvPalette.current.dark
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val insetPixels = with(LocalDensity.current) { leftInset.dp.roundToPx() }
    if (context.getString(R.string.mapbox_access_token).isBlank()) {
        Box(modifier.background(Page), contentAlignment = Alignment.Center) { Label("Map unavailable", 17, Secondary) }
        return
    }
    val view = remember(context, dark, ambient) {
        MapView(context).apply {
            scalebar.enabled = false
            isFocusable = false
            isFocusableInTouchMode = false
            logo.position = Gravity.TOP or Gravity.RIGHT
            logo.marginTop = 24f
            logo.marginRight = 24f
        }
    }
    var ready by remember(view) { mutableStateOf(false) }
    var error by remember(view) { mutableStateOf(false) }

    DisposableEffect(view, lifecycle) {
        var disposed = false
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> view.onStart()
                Lifecycle.Event.ON_RESUME -> view.onResume()
                Lifecycle.Event.ON_STOP -> view.onStop()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) view.onStart()
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) view.onResume()
        val errorSubscription = view.mapboxMap.subscribeMapLoadingError {
            if (!disposed) error = true
        }
        view.mapboxMap.loadStyle(Style.STANDARD) { style ->
            if (disposed) return@loadStyle
            style.setStyleImportConfigProperty("basemap", "lightPreset", Value.valueOf(if (dark) "night" else "day"))
            val empty = FeatureCollection.fromFeatures(emptyList<Feature>())
            style.addStyleModel("camera-view-cone", "asset://camera-view-cone.glb")
            style.addSource(geoJsonSource(CONES) { featureCollection(empty) })
            style.addLayer(modelLayer("tv-camera-cones", CONES) {
                slot("top")
                modelId("camera-view-cone")
                modelRotation(Expression.get("rotation"))
                modelAllowDensityReduction(false)
                // Keep the phone cone asset legible on the TV overview as well as the detail map.
                modelScale(Expression.fromRaw("""["interpolate",["exponential",0.5],["zoom"],8,["literal",[256,256,256]],22,["literal",[0.015625,0.015625,0.015625]]]"""))
                modelTranslation(listOf(0.0, 0.0, 2.5))
                modelType(ModelType.LOCATION_INDICATOR)
                modelOpacity(if (ambient) .45 else 1.0)
                modelEmissiveStrength(if (dark) 1.0 else .95)
                modelCastShadows(false)
                modelReceiveShadows(false)
            })
            style.addSource(geoJsonSource(MAPPED) { featureCollection(empty) })
            style.addSource(geoJsonSource(ADDED) { featureCollection(empty) })
            style.addSource(geoJsonSource(REMOVED) { featureCollection(empty) })
            style.addSource(geoJsonSource(SELECTED) { featureCollection(empty) })
            style.addSource(geoJsonSource(HIGHLIGHT) { featureCollection(empty) })
            style.addLayer(circleLayer("tv-mapped-dots", MAPPED) {
                circleEmissiveStrength(1.0)
                circleColor(AndroidColor.rgb(115, 125, 137))
                circleRadius(4.0)
                circleOpacity(if (ambient) 0.45 else 0.75)
            })
            style.addLayer(circleLayer("tv-added-dots", ADDED) {
                circleEmissiveStrength(1.0)
                circleColor(AndroidColor.rgb(255, 77, 79))
                circleRadius(6.0)
                circleOpacity(if (ambient) 0.45 else 1.0)
                circleStrokeColor(AndroidColor.rgb(17, 21, 27))
                circleStrokeWidth(2.0)
            })
            style.addLayer(circleLayer("tv-removed-dots", REMOVED) {
                circleEmissiveStrength(1.0)
                circleColor(AndroidColor.rgb(130, 141, 155))
                circleRadius(6.0)
                circleOpacity(if (ambient) 0.45 else 1.0)
                circleStrokeColor(AndroidColor.rgb(17, 21, 27))
                circleStrokeWidth(2.0)
            })
            style.addLayer(circleLayer("tv-selected-ring", SELECTED) {
                circleEmissiveStrength(1.0)
                circleColor(AndroidColor.TRANSPARENT)
                circleRadius(12.0)
                circleStrokeColor(AndroidColor.rgb(47, 193, 119))
                circleStrokeWidth(4.0)
            })
            style.addLayer(circleLayer("tv-new-glow", HIGHLIGHT) {
                circleEmissiveStrength(1.0)
                circleColor(AndroidColor.rgb(255, 77, 79))
                circleRadius(16.0)
                circleOpacity(0.23)
            })
            ready = true
        }
        onDispose {
            disposed = true
            errorSubscription.cancel()
            lifecycle.removeObserver(observer)
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) view.onStop()
            view.onDestroy()
        }
    }

    LaunchedEffect(view, ready, mapped, changes, selected, leftInset, ambient) {
        if (!ready) return@LaunchedEffect
        val style = view.mapboxMap.getStyle() ?: return@LaunchedEffect
        val cones = coneFeatures(mapped, changes)
        style.getSourceAs<GeoJsonSource>(CONES)?.featureCollection(cones)
        style.getSourceAs<GeoJsonSource>(MAPPED)?.featureCollection(mappedFeatures(mapped))
        style.getSourceAs<GeoJsonSource>(ADDED)?.featureCollection(features(changes.filter { it.kind == "added" }))
        style.getSourceAs<GeoJsonSource>(REMOVED)?.featureCollection(features(changes.filter { it.kind == "removed" }))
        style.getSourceAs<GeoJsonSource>(SELECTED)?.featureCollection(features(if (ambient) emptyList() else listOfNotNull(selected)))
        style.getSourceAs<GeoJsonSource>(HIGHLIGHT)?.featureCollection(features(if (ambient) listOfNotNull(changes.firstOrNull { it.kind == "added" }) else emptyList()))
        val points = changes.filter(::valid)
        val selectedPoint = selected?.takeIf(::valid) ?: points.firstOrNull()
        val mappedCenter = mapped.filter { it.latitude in -90.0..90.0 && it.longitude in -180.0..180.0 }
            .takeIf { it.isNotEmpty() }?.let { points ->
                TvMapPoint(points.map { it.longitude }.average(), points.map { it.latitude }.average())
            }
        val target = selectedPoint?.let { TvMapPoint(it.longitude, it.latitude) } ?: mappedCenter ?: return@LaunchedEffect
        view.mapboxMap.setCamera(
            CameraOptions.Builder()
                .center(Point.fromLngLat(target.longitude, target.latitude))
                .zoom(if (ambient) 11.0 else if (leftInset > 400) 13.0 else 12.0)
                .padding(EdgeInsets(0.0, insetPixels.toDouble(), 0.0, 0.0))
                .build()
        )
    }

    Box(modifier) {
        AndroidView(factory = { view }, modifier = Modifier.fillMaxSize())
        if (error) Label("Map temporarily unavailable", 15, Secondary, modifier = Modifier.align(Alignment.Center).background(Card))
    }
}
