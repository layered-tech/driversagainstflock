package org.driversagainstflock.watch

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.wear.compose.material.*
import kotlinx.coroutines.delay
import java.text.DateFormat
import java.util.Date
import org.json.JSONObject

private val WatchSans = FontFamily(Font(R.font.hanken_semibold, FontWeight.SemiBold))
private val WatchMono = FontFamily(Font(R.font.jetbrains_semibold, FontWeight.SemiBold))

private val Brand = Color(0xFF1FBF6B)
private val Amber = Color(0xFFFFB02E)
private val Muted = Color(0xFFB3B3B3)

@Composable
fun WatchApp(repository: WatchPresentation, ambient: Boolean, resumed: Boolean = true, resumeRevision: Int = 0) {
    val pager = rememberPagerState(pageCount = { 4 })
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val snapshot = repository.snapshot
    LaunchedEffect(ambient, resumed) {
        while (true) {
            now = System.currentTimeMillis()
            if (!ambient && resumed) repository.refresh()
            delay(if (ambient || !resumed) 60_000 else 1_000)
        }
    }
    LaunchedEffect(snapshot?.sessionId, resumeRevision) { pager.scrollToPage(0) }
    MaterialTheme(colors = Colors(primary = Brand, background = Color.Black, onBackground = Color.White)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(state = pager, userScrollEnabled = !ambient, modifier = Modifier.fillMaxSize().testTag("watch-pager")) { page ->
                ScalingLazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    contentPadding = PaddingValues(horizontal = 26.dp, vertical = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    autoCentering = null,
                ) {
                    when (page) {
                        0 -> item { NavigationPage(repository, snapshot, now, ambient) }
                        1 -> item { ScorecardPage(repository, snapshot, now, ambient) }
                        2 -> {
                            item { Label("Diagnostics", 18, Color.White) }
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
                            rows.forEach { (key, value) -> item { Metric(key, value) } }
                            item { Chip(onClick = { repository.refresh(request = true) }, label = { Text("Retry / ping phone") }, modifier = Modifier.fillMaxWidth()) }
                            item { Label("Recent diagnostics", 12, Muted) }
                            repository.history.takeLast(8).reversed().forEach { event -> item { Label(event, 12, Muted) } }
                        }
                        else -> {
                            item { Label("Haptic cues", 18, if (ambient) Muted else Color.White) }
                            item { Label("One advance cue for each maneuver", 12, Muted) }
                            item { Label(if (snapshot?.hapticsEnabled == false) "Turn vibrations are off" else repository.hapticStatus, 12, Muted) }
                            if (!ambient) {
                                listOf("left" to "Left · one tap", "right" to "Right · two taps", "neutral" to "Roundabout / U-turn · long pulse").forEach { (pattern, description) ->
                                    item { Chip(onClick = { repository.preview(pattern) }, label = { Text(description) }, modifier = Modifier.fillMaxWidth()) }
                                }
                                item { Label("Turn vibrations on or off in the phone app.", 12, Muted) }
                            }
                        }
                    }
                }
            }
            if (!ambient) {
                Row(Modifier.align(Alignment.BottomCenter).padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    repeat(4) { page -> Box(Modifier.size(4.dp).background(if (pager.currentPage == page) Brand else Color.DarkGray, CircleShape)) }
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
            repository.incompatible -> Message("Update needed", "Incompatible companion", "Update the phone and watch apps together.", Muted)
            !repository.connectionChecked -> Message("Connecting", "Connecting…", "Looking for your phone.", Muted)
            !repository.connected -> Message("Disconnected", "Phone disconnected", "Guidance resumes on reconnect.", if (ambient) Muted else Color(0xFFFF4D4F))
            snapshot == null -> Message("Connecting", "Connecting…", "Waiting for the phone.", Muted)
            repository.endedAt?.let { now - it < 3_000 } == true -> Message("Ended", if (repository.endedByArrival) "Arrived" else "Route ended", "Returning to idle", Muted)
            status == "idle" -> {
                Spacer(Modifier.height(17.dp))
                ManeuverIcon("depart", null, if (ambient) Color.White else Brand)
                Label("Start a Route", 20, Color.White)
                Label("On your phone", 14, Muted)
                Status("Connected", Muted)
            }
            status == "rerouting" -> Message("Rerouting", "Rerouting", "New route in a moment.", if (ambient) Color.White else Amber)
            status == "waiting-for-location" -> {
                Message("Locating", "Waiting for location", "Guidance starts when the phone has a fix.", Muted)
                Label(distance(nav.optionalDouble("distanceRemainingMeters")), 14, Muted)
            }
            else -> {
                Status(if (stale) "Stale · ${(snapshot.sourceAge(now)?.div(1000) ?: 0).coerceAtLeast(0)}s" else if (ambient) "Last guidance" else "Live", if (stale && !ambient) Amber else liveColor)
                val maneuver = nav.optJSONObject("maneuver")
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ManeuverIcon(maneuver?.optString("kind") ?: "straight", maneuver?.optionalLong("exitNumber"), liveColor)
                    Label(distance(maneuver?.optionalDouble("distanceMeters")), 26, contentColor, mono = true)
                }
                var expanded by remember(maneuver?.optString("id")) { mutableStateOf(false) }
                val instruction = maneuver?.optString("instruction")?.takeIf { it.isNotBlank() } ?: "Follow the road"
                Text(instruction, fontFamily = WatchSans, fontSize = 16.sp, color = contentColor, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                    maxLines = if (expanded) Int.MAX_VALUE else 2, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded }.semantics { contentDescription = instruction })
                if (stale) Label("Showing the last update", 12, Muted)
                Text(nav.optString("destination"), fontFamily = WatchSans, fontSize = 12.sp, color = Muted, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
                val eta = nav.optionalLong("arrivalAt")?.let { DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(it)) } ?: "—"
                Text(buildAnnotatedString {
                    withStyle(SpanStyle(color = liveColor)) { append(eta) }
                    append(" · ${duration(nav.optionalDouble("durationRemainingSeconds"))} · ${distance(nav.optionalDouble("distanceRemainingMeters"))}")
                }, fontSize = 11.sp, color = Muted, fontFamily = WatchMono, textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
private fun ScorecardPage(repository: WatchPresentation, snapshot: WatchSnapshot?, now: Long, ambient: Boolean) {
    val score = snapshot?.scorecard
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Label("Scorecard", 18, Color.White)
        when {
            repository.incompatible -> Message("Update needed", "Incompatible companion", "Update both apps.", Muted)
            score == null -> Message("Connecting", "Starting up", "Waiting for drive metrics.", Muted)
            score.optString("status") == "tracking-off" -> Message("Tracking off", "Tracking is off", "Manage tracking on your phone.", Muted)
            score.optString("status") == "initializing" -> Message("Initializing", "Starting up", "First metrics in a few seconds.", Muted)
            score.optString("status") == "unavailable" -> Message("Unavailable", "Metrics paused", "Phone is catching up.", Muted)
            score.optString("status") != "active" -> Message("No active drive", "No drive yet", "Start a route on your phone.", Muted)
            else -> {
                val age = score.optionalLong("sourceAt")?.let { now - it }
                val stale = !repository.connected || age == null || age >= STALE_AFTER_MS || age < -5_000
                Status(if (stale) "Metrics paused" else "Active drive", if (stale && !ambient) Amber else if (ambient) Muted else Brand)
                Metric("Elapsed", elapsed(score.optionalDouble("elapsedSeconds")), ambient)
                Metric("Distance traveled", traveledDistance(score.optionalDouble("distanceMeters")), ambient)
                Metric("Camera crossings", score.optionalLong("cameraCrossings")?.toString() ?: "—", ambient)
                Label("${score.optionalLong("confirmedCrossings")?.toString() ?: "—"} confirmed · ${score.optionalLong("possibleCrossings")?.toString() ?: "—"} possible", 12, Muted)
            }
        }
    }
}

@Composable private fun Message(chip: String, title: String, body: String, color: Color) {
    Status(chip, color)
    Spacer(Modifier.height(10.dp))
    Label(title, 18, Color.White)
    Label(body, 13, Muted)
}
@Composable private fun Status(text: String, color: Color) {
    Text(text, fontFamily = WatchSans, color = color, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
        modifier = Modifier.background(color.copy(alpha = 0.14f), CircleShape).padding(horizontal = 9.dp, vertical = 3.dp))
}
@Composable private fun Label(text: String, size: Int, color: Color, mono: Boolean = false) {
    Text(text, color = color, fontSize = size.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
        fontFamily = if (mono) WatchMono else WatchSans)
}
@Composable private fun Metric(label: String, value: String, ambient: Boolean = false) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Label(label, 12, Muted); Label(value, 16, if (ambient) Muted else Color.White, mono = true)
    }
}
@Composable private fun ManeuverIcon(kind: String, exit: Long?, color: Color) {
    val id = when (kind) {
        "left" -> R.drawable.maneuver_left; "right" -> R.drawable.maneuver_right
        "slight-left" -> R.drawable.maneuver_slight_left; "slight-right" -> R.drawable.maneuver_slight_right
        "sharp-left" -> R.drawable.maneuver_sharp_left; "sharp-right" -> R.drawable.maneuver_sharp_right
        "keep-left" -> R.drawable.maneuver_keep_left; "keep-right" -> R.drawable.maneuver_keep_right
        "roundabout" -> R.drawable.maneuver_roundabout; "uturn" -> R.drawable.maneuver_uturn
        "depart" -> R.drawable.maneuver_depart; "arrive" -> R.drawable.maneuver_arrive
        else -> R.drawable.maneuver_straight
    }
    Box(contentAlignment = Alignment.Center) {
        Image(painterResource(id), kind.replace('-', ' '), Modifier.size(48.dp), colorFilter = ColorFilter.tint(color))
        if (kind == "roundabout" && exit != null) Text(exit.toString(), fontSize = 13.sp, color = color)
    }
}
