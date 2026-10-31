package org.driversagainstflock.watch

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.*
import kotlinx.coroutines.delay
import java.util.Date
import java.util.Locale
import java.text.SimpleDateFormat
import org.json.JSONObject

internal val WatchSans = FontFamily(Font(R.font.hanken_semibold, FontWeight.SemiBold))
internal val WatchMono = FontFamily(Font(R.font.jetbrains_semibold, FontWeight.SemiBold))

internal val Brand = Color(0xFF1FBF6B)
internal val Amber = Color(0xFFFFB02E)
internal val Muted = Color(0xFFB3B3B3)
internal val WatchCard = Color(0xFF1F1F1F)
internal val WatchAlert = Color(0xFFFF4D4F)
internal val WatchViolet = Color(0xFF7A5CFF)

@Composable
fun WatchApp(repository: WatchPresentation, ambient: Boolean, resumed: Boolean = true, resumeRevision: Int = 0, launchPage: Int = 0) {
    val pager = rememberPagerState(pageCount = { 4 })
    var selectedAreaId by remember { mutableIntStateOf(0) }
    var selectedChangeId by remember { mutableIntStateOf(0) }
    var dismissedRecapId by remember { mutableStateOf<String?>(null) }
    var recapInteracted by remember { mutableStateOf(false) }
    var recapAmbientStartedAt by remember { mutableStateOf<Long?>(null) }
    var recapPausedMs by remember { mutableLongStateOf(0L) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val snapshot = repository.snapshot
    BackHandler(enabled = selectedAreaId != 0 && snapshot?.sessionId == null) {
        if (selectedChangeId != 0) selectedChangeId = 0 else selectedAreaId = 0
    }
    LaunchedEffect(ambient, resumed) {
        while (true) {
            now = System.currentTimeMillis()
            if (!ambient && resumed) repository.refresh()
            delay(if (ambient || !resumed) 60_000 else 1_000)
        }
    }
    LaunchedEffect(snapshot?.sessionId, resumeRevision, launchPage) {
        pager.scrollToPage(if (launchPage == 3) 3 else if (snapshot?.sessionId != null) 0 else launchPage.coerceIn(0, 3))
        if (snapshot?.sessionId != null) { selectedAreaId = 0; selectedChangeId = 0 }
    }
    val endedAt = repository.endedAt
    val recap = snapshot?.recap?.takeIf { candidate ->
        val status = candidate.optString("status")
        status !in setOf("completed", "canceled") || endedAt == null ||
            candidate.optionalLong("endedAt")?.let { kotlin.math.abs(endedAt - it) <= 60_000 } == true
    }
    val recapId = recap?.optionalString("id")
    LaunchedEffect(ambient, endedAt) {
        if (endedAt == null) {
            recapAmbientStartedAt = null
            recapPausedMs = 0
            recapInteracted = false
        } else if (ambient && recapAmbientStartedAt == null) {
            recapAmbientStartedAt = System.currentTimeMillis()
        } else if (!ambient && recapAmbientStartedAt != null) {
            recapPausedMs += System.currentTimeMillis() - recapAmbientStartedAt!!
            recapAmbientStartedAt = null
        }
    }
    val recapElapsed = endedAt?.let { now - it - recapPausedMs -
        (recapAmbientStartedAt?.let { started -> now - started } ?: 0) } ?: 0
    val recapKey = recapId ?: endedAt?.let { "pending:$it" }
    val recapWaiting = recap == null || recap.optString("status") in setOf("none", "initializing")
    val showRecap = endedAt != null && recapKey != null && dismissedRecapId != recapKey &&
        recapElapsed >= 3_000 && (recapInteracted || recapElapsed < (if (recapWaiting) 60_000 else 23_000)) &&
        (recapAmbientStartedAt?.let { now - it < 120_000 } != false)
    MaterialTheme(colors = Colors(primary = Brand, background = Color.Black, onBackground = Color.White)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(state = pager, userScrollEnabled = !ambient, modifier = Modifier.fillMaxSize().testTag("watch-pager")) { page ->
                val listState = rememberScalingLazyListState()
                LaunchedEffect(page, listState.isScrollInProgress, showRecap) {
                    if (page == 0 && showRecap && listState.isScrollInProgress) recapInteracted = true
                }
                ScalingLazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    contentPadding = PaddingValues(horizontal = 24.dp, vertical = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    autoCentering = null,
                ) {
                    if (!(page == 0 && snapshot?.navigation?.optString("status") == "idle" &&
                        snapshot.cameraAlert != null && !showRecap)) {
                        item { WatchTime(now) }
                    }
                    when (page) {
                        0 -> item {
                            when {
                                showRecap -> WatchRecapPage(repository, recap ?: JSONObject().put("status", "initializing"), recapElapsed, ambient,
                                    onInteraction = { recapInteracted = true }, onDismiss = { dismissedRecapId = recapKey })
                                snapshot?.navigation?.optString("status") == "idle" && snapshot.cameraAlert != null &&
                                    snapshot.cameraAlert.optString("id") != repository.dismissedCameraId &&
                                    now - (snapshot.cameraAlert.optionalLong("sourceAt") ?: 0) < STALE_AFTER_MS ->
                                    WatchFullCameraPage(snapshot.cameraAlert, ambient, repository::dismissCamera)
                                snapshot?.navigation?.optString("status") == "idle" && snapshot.areas != null &&
                                    repository.connected && !repository.incompatible ->
                                    WatchAreasPage(repository, snapshot.areas, now, ambient, selectedAreaId, selectedChangeId,
                                        onArea = { areaId -> selectedAreaId = areaId; selectedChangeId = 0; repository.areaOpened(areaId) },
                                        onChange = { repository.resetHandoff(); selectedChangeId = it },
                                        onBack = { if (selectedChangeId != 0) selectedChangeId = 0 else selectedAreaId = 0 })
                                else -> NavigationPage(repository, snapshot, now, ambient)
                            }
                        }
                        1 -> item { ScorecardPage(repository, snapshot, now, ambient) }
                        2 -> {
                            item { Label("DIAGNOSTICS", 11, Muted) }
                            val nav = snapshot?.navigation
                            val rows = listOf(
                                "Connection" to if (repository.connected) "Connected" else "Disconnected",
                                "Environment" to (snapshot?.json?.optString("environment") ?: BuildConfig.APP_ENVIRONMENT),
                                "Phone app" to (snapshot?.json?.optString("phoneVersion") ?: "—"),
                                "Watch app" to BuildConfig.VERSION_NAME,
                                "Protocol" to "Watch v$PROTOCOL_VERSION / phone ${repository.remoteProtocolVersion ?: "—"}",
                                "Data age" to (snapshot?.sourceAge(now)?.let { "${(it / 1000).coerceAtLeast(0)} s" } ?: "—"),
                                "Publisher" to (snapshot?.publisherId?.take(12) ?: "—"),
                                "Session" to (snapshot?.sessionId?.take(12) ?: "—"),
                                "Maneuver" to (nav?.optJSONObject("maneuver")?.optString("id") ?: "—"),
                                "Route revision" to (nav?.optLong("routeRevision")?.toString() ?: "—"),
                                "Revision" to (snapshot?.revision?.toString() ?: "—"),
                                "Received / dropped" to "${repository.received} / ${repository.dropped}",
                                "Last error" to repository.lastError,
                                "Ping" to repository.pingStatus,
                                "Haptics" to if (snapshot?.hapticsEnabled == false) "Off on phone" else repository.hapticStatus,
                            )
                            rows.forEach { (key, value) -> item { DiagnosticRow(key, value) } }
                            item { Chip(onClick = { repository.refresh(request = true) }, label = { Text("Retry / ping phone") }, modifier = Modifier.fillMaxWidth()) }
                            item { Label("Recent diagnostics", 12, Muted) }
                            repository.history.takeLast(8).reversed().forEach { event -> item { Label(event, 12, Muted) } }
                        }
                        else -> {
                            item { Label("FEEL THE TURNS", 11, Muted) }
                            if (!ambient) {
                                listOf("left" to "Left", "right" to "Right", "neutral" to "Roundabout").forEach { (pattern, title) ->
                                    item { HapticPatternRow(pattern, title, repository::preview) }
                                }
                                item { Label(if (snapshot?.hapticsEnabled == false) "Haptics off on phone" else "Turn haptics off in the phone app", 11, Muted) }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NavigationPage(repository: WatchPresentation, snapshot: WatchSnapshot?, now: Long, ambient: Boolean) {
    val nav = snapshot?.navigation ?: JSONObject()
    val status = nav?.optString("status")
    val stale = snapshot?.stale(now) != false
    val liveColor = if (ambient) Muted else if (stale) Color.White else Brand
    val contentColor = if (ambient) Muted else Color.White
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
        when {
            repository.incompatible -> Message("Update needed", "Update the phone app", "This watch app needs a compatible phone app.", Muted)
            !repository.connectionChecked -> Message("Connecting", "Connecting to phone", "Usually a second or two.", Muted)
            !repository.connected -> Message("Disconnected", "Phone disconnected", "Guidance resumes on reconnect.", if (ambient) Muted else Color(0xFFFF4D4F))
            snapshot == null -> Message("Connecting", "Connecting to phone", "Usually a second or two.", Muted)
            repository.endedAt?.let { now - it < 3_000 } == true -> Message("Ended", if (repository.endedByArrival) "Arrived" else "Route ended", "Returning to idle", Muted)
            status == "idle" -> {
                Label("START A ROUTE", 11, Muted)
                ManeuverIcon("depart", null, if (ambient) Color.White else Brand)
                Label("Start a route", 24, Color.White)
                Label("On your phone", 14, Muted)
            }
            status == "rerouting" -> Message("Rerouting", "Rerouting", "Keep driving. New route in a moment.", if (ambient) Color.White else Amber)
            status == "waiting-for-location" -> {
                Message("Locating", "Waiting for location", "Guidance starts when the phone has a fix.", Muted)
                Label(distance(nav.optionalDouble("distanceRemainingMeters")), 14, Muted)
            }
            else -> {
                val liveAlert = snapshot.cameraAlert?.takeIf { now - (it.optionalLong("sourceAt") ?: 0) < STALE_AFTER_MS && !stale &&
                    it.optString("id") != repository.dismissedCameraId }
                val passedAlert = repository.recentCameraAlert?.takeIf {
                    repository.cameraEndedAt?.let { ended -> now - ended < 5_000 } == true
                }
                if (!ambient) Status(if (stale) "Stale · ${(snapshot.sourceAge(now)?.div(1000) ?: 0).coerceAtLeast(0)}s" else "Live", if (stale) Amber else Brand)
                val maneuver = nav.optJSONObject("maneuver")
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ManeuverIcon(maneuver?.optString("kind") ?: "straight", maneuver?.optionalLong("exitNumber"), liveColor)
                    ManeuverDistance(distance(maneuver?.optionalDouble("distanceMeters")), contentColor)
                }
                val instruction = maneuver?.optString("instruction")?.takeIf { it.isNotBlank() } ?: "Follow the road"
                Text(if (ambient) roadName(instruction) else instruction, fontFamily = WatchSans, fontSize = 16.sp, color = contentColor,
                    fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                    maxLines = if (ambient || liveAlert != null) 1 else 2, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = instruction })
                if (stale) Label("Showing the last update", 12, Muted)
                if (!ambient) Text("⌖ ${nav.optString("destination")}", fontFamily = WatchSans, fontSize = 12.sp, color = WatchViolet,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
                if (liveAlert != null || passedAlert != null) {
                    WatchCameraStrip(liveAlert ?: passedAlert!!, ambient, passed = liveAlert == null,
                        onDismiss = repository::dismissCamera)
                } else {
                    val eta = nav.optionalLong("arrivalAt")?.let { SimpleDateFormat("h:mm", Locale.US).format(Date(it)) } ?: "—"
                    if (!ambient) Text(buildAnnotatedString {
                        withStyle(SpanStyle(color = liveColor)) { append(eta) }
                        append(" · ${duration(nav.optionalDouble("durationRemainingSeconds"))} · ${distance(nav.optionalDouble("distanceRemainingMeters"))}")
                    }, fontSize = 11.sp, color = Muted, fontFamily = WatchMono, textAlign = TextAlign.Center)
                }
            }
        }
    }
}

@Composable
private fun ScorecardPage(repository: WatchPresentation, snapshot: WatchSnapshot?, now: Long, ambient: Boolean) {
    val score = snapshot?.scorecard
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Label("SCORECARD", 11, Muted)
        when {
            repository.incompatible -> Message("Update needed", "Incompatible companion", "Update both apps.", Muted)
            score == null -> Message("Connecting", "Starting up", "Waiting for drive metrics.", Muted)
            score.optString("status") == "tracking-off" -> Message("", "Tracking is off", "Turn it on in the phone app to see drive metrics.", Muted)
            score.optString("status") == "initializing" -> Message("Initializing", "Starting up", "First metrics in a few seconds.", Muted)
            score.optString("status") == "unavailable" -> Message("", "Metrics paused", "Phone is catching up.", Amber)
            score.optString("status") != "active" -> Message("", "No drive yet", "Metrics appear when a route starts on your phone.", Muted)
            else -> {
                val age = score.optionalLong("sourceAt")?.let { now - it }
                val stale = !repository.connected || age == null || age >= STALE_AFTER_MS || age < -5_000
                Label(elapsed(score.optionalDouble("elapsedSeconds")), 40, if (ambient) Muted else Color.White, mono = true)
                Label("elapsed · ${traveledDistance(score.optionalDouble("distanceMeters"))}", 12, Muted)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ScoreTile("AVOIDED", score.optionalLong("avoidedCameras")?.toString() ?: "—", if (ambient) Muted else Brand, Modifier.weight(1f))
                    ScoreTile("CROSSED", score.optionalLong("cameraCrossings")?.toString() ?: "—", if (ambient) Muted else WatchAlert, Modifier.weight(1f))
                }
                if (!ambient) Status(if (stale) "Metrics paused" else "Tracking", if (stale) Amber else Brand)
            }
        }
    }
}

@Composable private fun Message(chip: String, title: String, body: String, color: Color) {
    if (chip.isNotEmpty()) Status(chip, color)
    Spacer(Modifier.height(16.dp))
    val icon = when {
        title == "No drive yet" -> R.drawable.watch_navigation
        title == "Tracking is off" -> R.drawable.watch_eye_off
        title == "Starting up" || title == "Connecting to phone" -> R.drawable.watch_loader
        title == "Metrics paused" -> R.drawable.watch_history
        title == "Phone disconnected" -> R.drawable.watch_link_off
        title == "Waiting for location" -> R.drawable.watch_crosshair
        title == "Rerouting" -> R.drawable.watch_rotate_cw
        title == "Update the phone app" -> R.drawable.watch_smartphone
        else -> null
    }
    if (icon != null) StateGlyph(icon, color)
    Label(title, 18, Color.White)
    Label(body, 13, Muted)
}
@Composable internal fun StateGlyph(id: Int, color: Color) {
    Image(painterResource(id), null, Modifier.size(28.dp), colorFilter = ColorFilter.tint(color))
}
@Composable private fun WatchTime(now: Long) {
    Label(SimpleDateFormat("h:mm", Locale.US).format(Date(now)), 11, Muted, mono = true)
}
@Composable private fun ManeuverDistance(formatted: String, color: Color) {
    val split = formatted.split(' ', limit = 2)
    Text(buildAnnotatedString {
        append(split[0])
        if (split.size > 1) withStyle(SpanStyle(fontSize = 14.sp, color = Muted)) { append(" ${split[1]}") }
    }, color = color, fontSize = 36.sp, fontFamily = WatchMono, fontWeight = FontWeight.SemiBold, maxLines = 1)
}
@Composable private fun ScoreTile(label: String, value: String, color: Color, modifier: Modifier) {
    Column(modifier.background(WatchCard, RoundedCornerShape(22.dp)).padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Label(value, 24, color, mono = true)
        Label(label, 11, Muted)
    }
}
@Composable private fun DiagnosticRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().background(WatchCard, RoundedCornerShape(16.dp)).padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, color = Muted, fontFamily = WatchSans, fontSize = 11.sp, modifier = Modifier.weight(0.9f), maxLines = 1)
        Text(value, color = Color.White, fontFamily = WatchMono, fontSize = 11.sp, modifier = Modifier.weight(1.1f), maxLines = 1,
            overflow = TextOverflow.Ellipsis)
    }
}
@Composable private fun HapticPatternRow(pattern: String, title: String, onPreview: (String) -> Unit) {
    var selected by remember { mutableStateOf(false) }
    LaunchedEffect(selected) { if (selected) { delay(700); selected = false } }
    val subtitle = when (pattern) { "left" -> "One short tap"; "right" -> "Two short taps"; else -> "One long pulse · also U-turn" }
    val icon = when (pattern) { "left" -> R.drawable.maneuver_left; "right" -> R.drawable.maneuver_right; else -> R.drawable.maneuver_roundabout }
    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).background(if (selected) Brand.copy(alpha = 0.25f) else WatchCard, RoundedCornerShape(22.dp))
        .clickable { selected = true; onPreview(pattern) }.padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Image(painterResource(icon), title, Modifier.size(26.dp), colorFilter = ColorFilter.tint(Brand))
        Column(Modifier.weight(1f)) {
            Text(title, color = Color.White, fontFamily = WatchSans, fontSize = 15.sp, maxLines = 1)
            Text(subtitle, color = Muted, fontFamily = WatchSans, fontSize = 11.sp, maxLines = 2)
        }
        Text(when (pattern) { "left" -> "●"; "right" -> "●●"; else -> "━" }, color = Brand, fontSize = 13.sp)
    }
}
@Composable private fun Status(text: String, color: Color) {
    Text(text, fontFamily = WatchSans, color = color, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
        modifier = Modifier.background(color.copy(alpha = 0.14f), CircleShape).padding(horizontal = 9.dp, vertical = 3.dp))
}
@Composable internal fun Label(text: String, size: Int, color: Color, mono: Boolean = false) {
    Text(text, color = color, fontSize = size.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
        fontFamily = if (mono) WatchMono else WatchSans)
}
@Composable private fun ManeuverIcon(kind: String, exit: Long?, color: Color) {
    val id = maneuverResourceId(kind)
    Box(contentAlignment = Alignment.Center) {
        Image(painterResource(id), kind.replace('-', ' '), Modifier.size(56.dp), colorFilter = ColorFilter.tint(color))
        if (kind == "roundabout" && exit != null) Text(exit.toString(), fontSize = 13.sp, color = color)
    }
}

internal fun maneuverResourceId(kind: String): Int = when (kind) {
        "left" -> R.drawable.maneuver_left; "right" -> R.drawable.maneuver_right
        "slight-left" -> R.drawable.maneuver_slight_left; "slight-right" -> R.drawable.maneuver_slight_right
        "sharp-left" -> R.drawable.maneuver_sharp_left; "sharp-right" -> R.drawable.maneuver_sharp_right
        "keep-left" -> R.drawable.maneuver_keep_left; "keep-right" -> R.drawable.maneuver_keep_right
        "roundabout" -> R.drawable.maneuver_roundabout; "uturn" -> R.drawable.maneuver_uturn
        "depart" -> R.drawable.maneuver_depart; "arrive" -> R.drawable.maneuver_arrive
        else -> R.drawable.maneuver_straight
    }
