package org.driversagainstflock.watch

import android.graphics.Bitmap
import android.content.ContentValues
import android.provider.MediaStore
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test

class WatchUiTest {
    @get:Rule val compose = createComposeRule()
    private class Presentation : WatchPresentation {
        override var snapshot by mutableStateOf<WatchSnapshot?>(null)
        override var connected by mutableStateOf(true)
        override var incompatible by mutableStateOf(false)
        override val remoteProtocolVersion = 1
        override val connectionChecked = true
        override val received = 12
        override val dropped = 2
        override val lastError = "none"
        override val pingStatus = "42 ms"
        override val hapticStatus = "Ready"
        override var endedAt by mutableStateOf<Long?>(null)
        override var endedByArrival by mutableStateOf(false)
        override val history = listOf("Accepted revision 12", "Ping 42 ms")
        override val handoffStatus = "idle"
        override val dismissedCameraId: String? = null
        override val recentCameraAlert: JSONObject? = null
        override val cameraEndedAt: Long? = null
        override fun refresh(request: Boolean) {}
        override fun preview(pattern: String) {}
        override fun openOnPhone(target: String, areaId: Int?, changeId: Int?, driveId: String?) {}
        override fun areaOpened(areaId: Int) {}
        override fun dismissCamera() {}
        override fun resetHandoff() {}
    }
    private fun snapshot(navStatus: String = "active", scoreStatus: String = "active", stale: Boolean = false, instruction: String? = null): WatchSnapshot {
        val context = InstrumentationRegistry.getInstrumentation().context
        val json = JSONObject(context.assets.open("active.json").bufferedReader().use { it.readText() })
        val now = System.currentTimeMillis()
        json.put("publishedAt", now)
        val nav = json.getJSONObject("navigation")
        nav.put("sourceAt", if (stale) now - 30_000 else now).put("status", navStatus)
        if (navStatus == "idle") nav.put("sessionId", JSONObject.NULL)
        if (navStatus != "active") nav.put("maneuver", JSONObject.NULL)
        if (instruction != null) nav.getJSONObject("maneuver").put("instruction", instruction)
        json.getJSONObject("scorecard").put("status", scoreStatus).put("sourceAt", now)
        return WatchSnapshot.parse(json.toString())
    }
    private fun screenshot(name: String) {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "watch-$name.png")
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/DAFWatchTests")
        }
        val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)!!
        context.contentResolver.openOutputStream(uri)!!.use {
            compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it)
        }
    }
    @Test fun navigationStatesAndPageSwitching() {
        val state = Presentation().apply { snapshot = snapshot() }
        compose.setContent { WatchApp(state, ambient = false) }
        compose.onNodeWithText("Turn right onto Market St").assertIsDisplayed()
        screenshot("navigation")
        compose.onNodeWithTag("watch-pager").performTouchInput { swipeLeft() }
        compose.onNodeWithText("SCORECARD").assertIsDisplayed()
        compose.onNodeWithText("18:42").assertIsDisplayed()
        compose.onNodeWithText("AVOIDED").assertIsDisplayed()
        compose.onNodeWithText("CROSSED").assertIsDisplayed()
        screenshot("scorecard")
        compose.onNodeWithTag("watch-pager").performTouchInput { swipeLeft() }
        compose.onNodeWithText("DIAGNOSTICS").assertIsDisplayed()
        screenshot("diagnostics")
        compose.runOnIdle { state.snapshot = snapshot("idle") }
        compose.onNodeWithText("Start a route").assertIsDisplayed()
        screenshot("idle")
        compose.runOnIdle { state.connected = false }
        compose.onNodeWithText("Phone disconnected").assertIsDisplayed()
        screenshot("disconnected")
        compose.runOnIdle { state.connected = true; state.snapshot = null }
        compose.onNodeWithText("Connecting to phone").assertIsDisplayed()
        compose.runOnIdle { state.incompatible = true }
        compose.onNodeWithText("Update the phone app").assertIsDisplayed()
        screenshot("incompatible")
        compose.runOnIdle { state.incompatible = false; state.snapshot = snapshot("rerouting") }
        compose.onAllNodesWithText("Rerouting")[0].assertIsDisplayed()
        compose.onNodeWithText("Turn right onto Market St").assertDoesNotExist()
        screenshot("rerouting")
        compose.runOnIdle { state.snapshot = snapshot("waiting-for-location") }
        compose.onNodeWithText("Waiting for location").assertIsDisplayed()
        compose.runOnIdle { state.snapshot = snapshot("missing-maneuver") }
        compose.onNodeWithText("Follow the road").assertIsDisplayed()
        compose.runOnIdle { state.snapshot = snapshot(stale = true) }
        compose.onNodeWithText("Showing the last update").assertIsDisplayed()
        screenshot("stale")
        compose.runOnIdle { state.snapshot = snapshot("idle"); state.endedAt = System.currentTimeMillis() }
        compose.onNodeWithText("Route ended").assertIsDisplayed()
    }
    @Test fun phonePreviewOpensHapticsDuringAnActiveRoute() {
        val state = Presentation().apply { snapshot = snapshot() }
        compose.setContent { WatchApp(state, ambient = false, launchPage = 3) }
        compose.onNodeWithText("FEEL THE TURNS").assertIsDisplayed()
        compose.onNodeWithText("Left").assertIsDisplayed()
    }
    @Test fun scorecardUnavailableStates() {
        val state = Presentation().apply { snapshot = snapshot() }
        compose.setContent { WatchApp(state, ambient = false) }
        compose.onNodeWithTag("watch-pager").performTouchInput { swipeLeft() }
        listOf("tracking-off" to "Tracking is off", "initializing" to "Starting up",
            "unavailable" to "Metrics paused", "no-active-drive" to "No drive yet").forEach { (status, text) ->
            compose.runOnIdle { state.snapshot = snapshot(scoreStatus = status) }
            compose.onNodeWithText(text).assertIsDisplayed()
            screenshot("score-$status")
        }
    }
    @Test fun cameraAreasAndRecapScreens() {
        val state = Presentation().apply { snapshot = snapshot() }
        compose.setContent { WatchApp(state, ambient = false) }
        val now = System.currentTimeMillis()
        val camera = JSONObject().put("id", "alpr-7").put("type", "ALPR")
            .put("road", "San Pablo Ave").put("distanceMeters", 644)
            .put("count", 1).put("sourceAt", now)
        compose.runOnIdle { state.snapshot = WatchSnapshot.parse(JSONObject(snapshot().json.toString())
            .put("cameraAlert", camera).put("cameraAlertsEnabled", true).toString()) }
        compose.onNodeWithText("ALPR  0.4 mi").assertIsDisplayed()
        screenshot("camera-card")

        val area = JSONObject().put("id", 7).put("name", "Oakland, CA")
            .put("unreadCount", 3).put("cameraCount", 116).put("addedCount", 2)
            .put("removedCount", 1).put("readThroughId", 23)
            .put("changes", org.json.JSONArray().put(JSONObject().put("id", 22)
                .put("kind", "added").put("street", "International Blvd & 35th Ave")
                .put("operator", "ALPR").put("direction", "NE").put("changedAt", now - 7_200_000)))
        val idle = JSONObject(snapshot("idle").json.toString())
            .put("areas", JSONObject().put("status", "ready").put("sourceAt", now)
                .put("items", org.json.JSONArray().put(area)))
        compose.runOnIdle { state.snapshot = WatchSnapshot.parse(idle.toString()) }
        compose.onNodeWithText("MY AREAS").assertIsDisplayed()
        screenshot("areas-home")
        compose.onNodeWithText("Oakland, CA").performClick()
        compose.onNodeWithText("International Blvd & 35th Ave", substring = true).assertIsDisplayed()
        screenshot("area-summary")
        compose.onNodeWithText("International Blvd & 35th Ave", substring = true).performClick()
        compose.onNodeWithText("New ALPR camera").assertIsDisplayed()
        screenshot("area-change")

        val recap = JSONObject().put("status", "completed").put("id", "drive-1")
            .put("endedAt", now).put("durationSeconds", 1122).put("distanceMiles", 9.3)
            .put("confirmedCrossings", 1).put("possibleCrossings", 0)
            .put("avoidedCameras", 4).put("xpEarned", 180)
            .put("privacyScore", 82).put("privacyScoreDelta", 18)
        compose.runOnIdle { state.snapshot = WatchSnapshot.parse(idle.put("recap", recap).toString()); state.endedAt = now - 4_000 }
        compose.onNodeWithText("DRIVE COMPLETE").assertIsDisplayed()
        screenshot("recap")
    }
    @Test fun endedRouteWaitsForItsOwnRecap() {
        val now = System.currentTimeMillis()
        val idle = JSONObject(snapshot("idle").json.toString()).put("recap", JSONObject()
            .put("status", "completed").put("id", "earlier-drive").put("endedAt", now - 600_000))
        val state = Presentation().apply {
            snapshot = WatchSnapshot.parse(idle.toString())
            endedAt = now - 4_000
        }
        compose.setContent { WatchApp(state, ambient = false) }
        compose.onNodeWithText("Finalizing on phone…").assertIsDisplayed()
    }
    @Test fun missingCrossingDetailsRemainUnavailableAndCanBeScrolledIntoView() {
        val missing = snapshot().json
        missing.getJSONObject("scorecard")
            .put("confirmedCrossings", JSONObject.NULL)
            .put("possibleCrossings", JSONObject.NULL)
            .put("cameraCrossings", JSONObject.NULL)
        val state = Presentation().apply { snapshot = WatchSnapshot.parse(missing.toString()) }
        compose.setContent { WatchApp(state, ambient = false) }
        compose.onNodeWithTag("watch-pager").performTouchInput { swipeLeft() }
        compose.onNodeWithText("CROSSED").assertIsDisplayed()
        compose.onNodeWithText("—").assertIsDisplayed()
        compose.onNodeWithText("0").assertDoesNotExist()
    }
    @Test fun largeTextAndAmbientRemainReadable() {
        val state = Presentation().apply { snapshot = snapshot(instruction = "Turn right onto a very long road name toward the destination") }
        var ambient by mutableStateOf(false)
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(LocalDensity.current.density, 1.3f)) {
                WatchApp(state, ambient)
            }
        }
        compose.onNodeWithText("Turn right onto a very long road name toward the destination").assertIsDisplayed()
        screenshot("large-text")
        compose.runOnIdle { ambient = true }
        compose.onNodeWithText("a very long road name toward the destination").assertIsDisplayed()
        screenshot("ambient")
    }
}
