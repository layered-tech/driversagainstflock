package org.driversagainstflock.watch

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.Text
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

private val Alert = Color(0xFFFF4D4F)
private val Card = Color(0xFF161B22)

private fun relativeTime(timestamp: Long?, now: Long): String {
    if (timestamp == null || timestamp <= 0) return ""
    val hours = ((now - timestamp).coerceAtLeast(0) / 3_600_000)
    return when {
        hours < 1 -> "just now"
        hours < 24 -> "${hours}h ago"
        else -> "${hours / 24}d ago"
    }
}

@Composable
private fun AreaRow(title: String, detail: String, badge: String? = null, tone: Color = Muted,
    onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().background(Card, RoundedCornerShape(14.dp)).clickable(onClick = onClick)
        .semantics { contentDescription = listOf(title, detail, badge).filterNotNull().joinToString(", ") }
        .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f)) {
            Text(title, fontFamily = WatchSans, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(detail, fontFamily = WatchMono, fontSize = 11.sp, color = tone,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (badge != null) Text(badge, fontFamily = WatchMono, color = Alert, fontSize = 15.sp)
        Text("›", color = Muted, fontSize = 17.sp)
    }
}

@Composable
internal fun WatchCameraStrip(alert: JSONObject, ambient: Boolean, passed: Boolean = false, onDismiss: () -> Unit = {}) {
    val color = if (ambient || passed) Muted else Alert
    val label = if (passed) "Passed ${alert.optString("road", "camera")}" else if (alert.optInt("count") > 1) "${alert.optInt("count")} cameras" else alert.optString("type", "Camera")
    Row(
        Modifier.fillMaxWidth().background(color.copy(alpha = if (ambient) 0.08f else 0.18f), RoundedCornerShape(15.dp))
            .clickable(enabled = !passed, onClick = onDismiss)
            .padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Box(Modifier.size(12.dp).background(color, CircleShape))
        Column(Modifier.weight(1f)) {
            Text("$label  ${distance(alert.optionalDouble("distanceMeters"))}", fontFamily = WatchMono,
                fontWeight = FontWeight.SemiBold, fontSize = 12.sp, color = color, maxLines = 1)
            alert.optionalString("road")?.let {
                Text(it, fontFamily = WatchSans, fontSize = 11.sp, color = if (ambient) Muted else Color.White,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
internal fun WatchFullCameraPage(alert: JSONObject, ambient: Boolean, onDismiss: () -> Unit) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Label("Camera ahead", 18, if (ambient) Muted else Alert)
        Label(distance(alert.optionalDouble("distanceMeters")), 28, Color.White, mono = true)
        Label(listOf(alert.optString("type", "ALPR"), alert.optionalString("road")).filterNotNull().joinToString(" · "), 13, Muted)
        if (!ambient) Chip(onClick = onDismiss, label = { Text("Dismiss") }, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
internal fun WatchAreasPage(
    repository: WatchPresentation,
    areas: JSONObject,
    now: Long,
    ambient: Boolean,
    selectedAreaId: Int,
    selectedChangeId: Int,
    onArea: (Int) -> Unit,
    onChange: (Int) -> Unit,
    onBack: () -> Unit,
) {
    val items = areas.optJSONArray("items")
    val area = (0 until (items?.length() ?: 0)).mapNotNull { items?.optJSONObject(it) }
        .find { it.optInt("id") == selectedAreaId }
    val changes = area?.optJSONArray("changes")
    val change = (0 until (changes?.length() ?: 0)).mapNotNull { changes?.optJSONObject(it) }
        .find { it.optInt("id") == selectedChangeId }
    val age = areas.optionalLong("sourceAt")?.let { now - it }
    val stale = areas.optString("status") == "offline" || age == null || age >= 3_600_000
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (ambient) {
            Label("MY AREAS", 13, Muted)
            Label((0 until (items?.length() ?: 0)).sumOf { items?.optJSONObject(it)?.optInt("unreadCount") ?: 0 }.toString(), 34, Color.White, mono = true)
            Label("unread changes", 12, Muted)
            return@Column
        }
        if (change != null && area != null) {
            Text("‹  ${area.optString("name")}", Modifier.fillMaxWidth().clickable(onClick = onBack),
                fontFamily = WatchSans, fontSize = 12.sp, color = Muted, maxLines = 1)
            Label(if (change.optString("kind") == "added") "New ALPR camera" else "Camera removed", 18,
                if (change.optString("kind") == "added") Alert else Muted)
            Label(change.optString("street"), 14, Color.White)
            val time = change.optionalLong("changedAt")?.let { DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(it)) } ?: "—"
            Label("${area.optString("name")} · $time", 11, Muted)
            if (change.optString("direction").isNotBlank()) Label("Faces ${change.optString("direction")}", 11, Muted)
            Chip(onClick = { repository.openOnPhone("area-change", area.optInt("id"), change.optInt("id")) },
                enabled = repository.connected && repository.handoffStatus != "sending",
                label = { Text(when (repository.handoffStatus) {
                    "sending" -> "Sending…"; "opened" -> "On your phone"; "failed" -> "Try again"
                    "unavailable" -> "Phone unavailable"; else -> if (!repository.connected) "Phone unavailable" else "Open on phone"
                }) }, modifier = Modifier.fillMaxWidth())
            if (repository.handoffStatus == "failed") Label("Didn't reach your phone", 11, Amber)
        } else if (area != null) {
            Text("‹  MY AREAS", Modifier.fillMaxWidth().clickable(onClick = onBack), fontFamily = WatchSans,
                fontSize = 12.sp, color = Muted)
            Label(area.optString("name"), 18, Color.White)
            if (stale) Label("Cached · counts may be behind", 11, Amber)
            if (changes == null || changes.length() == 0) Label(when (area.optString("changesStatus")) {
                "loading" -> "Checking recent changes"
                "unavailable" -> "Changes unavailable on watch"
                else -> "No changes this week"
            }, 13, Muted)
            for (index in 0 until minOf(changes?.length() ?: 0, 10)) {
                val row = changes!!.getJSONObject(index)
                val added = row.optString("kind") == "added"
                AreaRow(title = row.optString("street"),
                    detail = "${if (added) "Added" else "Removed"} · ${relativeTime(row.optionalLong("changedAt"), now)}",
                    badge = if (added) "+" else "−", tone = if (added) Alert else Muted,
                    onClick = { onChange(row.optInt("id")) })
            }
            Label("${area.optInt("cameraCount")} cameras · ${changes?.length() ?: 0} changes", 11, Muted)
        } else {
            Label("MY AREAS", 17, Color.White)
            when (areas.optString("status")) {
                "loading" -> Label("Checking your areas · Syncing with your phone…", 13, Muted)
                "expired" -> {
                    Label("Subscription session expired", 14, Amber)
                    Chip(onClick = { repository.openOnPhone("areas") }, label = { Text("Open on phone") }, modifier = Modifier.fillMaxWidth())
                }
                else -> {
                    if (stale) Label("Cached · last sync may be behind", 11, Amber)
                    if (items == null || items.length() == 0) {
                        if (areas.optString("status") == "offline") {
                            Label("Phone unavailable", 16, Muted)
                            Label("Reconnect to see your areas.", 12, Muted)
                        } else {
                            Label("No areas yet", 16, Muted)
                            Label("Watch a city or ZIP in the phone app.", 12, Muted)
                        }
                    } else {
                        val total = (0 until items.length()).sumOf { items.getJSONObject(it).optInt("unreadCount") }
                        if (total == 0) Label("All quiet this week", 12, Brand)
                        for (index in 0 until items.length()) {
                            val row = items.getJSONObject(index)
                            val latestChange = row.optJSONArray("changes")?.optJSONObject(0)
                            val latestTime = relativeTime(latestChange?.optionalLong("changedAt"), now)
                            val detail = if (row.optString("changesStatus") == "loading") "Checking recent changes"
                                else if (row.optString("changesStatus") == "unavailable") "Changes unavailable"
                                else if (latestChange == null) "Quiet week. Zero new boxes."
                                else "+${row.optInt("addedCount")}  −${row.optInt("removedCount")}" +
                                    if (latestTime.isNotEmpty()) " · $latestTime" else ""
                            AreaRow(title = row.optString("name"), detail = detail,
                                badge = row.optInt("unreadCount").takeIf { it > 0 }?.toString(),
                                onClick = { onArea(row.optInt("id")) })
                        }
                    }
                    Label("Start a route on your phone", 11, Muted)
                }
            }
        }
    }
}

@Composable
internal fun WatchRecapPage(repository: WatchPresentation, recap: JSONObject, elapsedMs: Long,
    ambient: Boolean, onInteraction: () -> Unit, onDismiss: () -> Unit) {
    val status = recap.optString("status")
    Column(Modifier.fillMaxWidth().clickable(onClick = onInteraction), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Label(if (status == "canceled") "ROUTE CANCELED" else "DRIVE COMPLETE", 13, Muted)
        if (status == "tracking-off") Label("Tracking is off", 17, Muted)
        else if (status == "initializing" || status == "none") Label("Finalizing on phone…", 16, Muted)
        else {
            val delta = recap.optionalLong("privacyScoreDelta")
            val score = recap.optionalLong("privacyScore")
            Label("${delta?.let { if (it >= 0) "+$it" else "$it" } ?: "—"} → ${score ?: "—"}", 26, Brand, mono = true)
            Label("Privacy score", 11, Muted)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(elapsed(recap.optionalDouble("durationSeconds")), fontFamily = WatchMono, fontSize = 14.sp,
                    color = Color.White, maxLines = 1)
                Label("TIME", 10, Muted)
            }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(recap.optionalDouble("distanceMiles")?.let { String.format("%.1f mi", it) } ?: "—",
                    fontFamily = WatchMono, fontSize = 14.sp, color = Color.White, maxLines = 1)
                Label("DIST", 10, Muted)
            }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(recap.optionalLong("avoidedCameras")?.toString() ?: "—", fontFamily = WatchMono,
                    fontSize = 14.sp, color = Brand, maxLines = 1)
                Label("AVOIDED", 10, Muted)
            }
        }
        if (!ambient) {
            val crossed = recap.optionalLong("confirmedCrossings")?.plus(recap.optionalLong("possibleCrossings") ?: 0)
            if (crossed != null) Label("$crossed crossed · +${recap.optionalLong("xpEarned") ?: 0} XP", 12, if (crossed > 0) Alert else Brand)
            if (status in setOf("completed", "canceled") && recap.optionalString("id") != null) {
                Chip(onClick = { onInteraction(); repository.openOnPhone("scorecard", driveId = recap.optString("id")) },
                    label = { Text("Open on phone") }, modifier = Modifier.fillMaxWidth())
            }
            Chip(onClick = { onInteraction(); onDismiss() }, label = { Text("Dismiss") }, modifier = Modifier.fillMaxWidth())
            val remaining = 23 - (elapsedMs / 1000)
            if (status !in setOf("none", "initializing") && remaining in 1..15) Label("Closes in $remaining s", 11, Muted)
        } else Label("${recap.optionalLong("avoidedCameras") ?: "—"} avoided", 12, Muted)
    }
}
