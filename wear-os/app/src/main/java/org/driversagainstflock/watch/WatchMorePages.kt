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

private val Alert = Color(0xFFFF4D4F)
private val Card = WatchCard

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
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).background(Card, RoundedCornerShape(22.dp)).clickable(onClick = onClick)
        .semantics { contentDescription = listOf(title, detail, badge).filterNotNull().joinToString(", ") }
        .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f)) {
            Text(title, fontFamily = WatchSans, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(detail, fontFamily = WatchSans, fontSize = 12.sp, color = tone,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (badge != null) Box(Modifier.size(23.dp).background(Alert, CircleShape), contentAlignment = Alignment.Center) {
            Text(badge, fontFamily = WatchMono, color = Color.White, fontSize = 12.sp)
        }
    }
}

@Composable
private fun ChangeRow(change: JSONObject, now: Long, onClick: () -> Unit) {
    val added = change.optString("kind") == "added"
    val tone = if (added) Alert else Muted
    Row(Modifier.fillMaxWidth().heightIn(min = 46.dp).background(Card, RoundedCornerShape(23.dp))
        .clickable(onClick = onClick).padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.size(22.dp).background(tone.copy(alpha = 0.22f), CircleShape), contentAlignment = Alignment.Center) {
            Text(if (added) "+" else "−", color = tone, fontFamily = WatchMono, fontSize = 13.sp)
        }
        Column(Modifier.weight(1f)) {
            Text(change.optString("street"), color = Color.White, fontFamily = WatchSans, fontSize = 12.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${if (added) "Added · ALPR" else "Removed"} · ${relativeTime(change.optionalLong("changedAt"), now)}",
                color = Muted, fontFamily = WatchSans, fontSize = 10.sp, maxLines = 1)
        }
    }
}

@Composable
internal fun WatchCameraStrip(alert: JSONObject, ambient: Boolean, passed: Boolean = false, onDismiss: () -> Unit = {}) {
    val color = if (ambient || passed) Muted else Alert
    val label = if (passed) "Passed ${alert.optString("road", "camera")}" else if (alert.optInt("count") > 1) "${alert.optInt("count")} cameras" else alert.optString("type", "Camera")
    Row(
        Modifier.fillMaxWidth().background(color.copy(alpha = if (ambient) 0.08f else 0.18f), RoundedCornerShape(22.dp))
            .clickable(enabled = !passed, onClick = onDismiss)
            .padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Box(Modifier.size(24.dp).background(color.copy(alpha = 0.22f), CircleShape), contentAlignment = Alignment.Center) {
            Box(Modifier.size(8.dp).background(color, CircleShape))
        }
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
        Label("Camera ahead", 18, if (ambient) Muted else Color.White)
        Label(distance(alert.optionalDouble("distanceMeters")), 40, Color.White, mono = true)
        Label(listOf(alert.optString("type", "ALPR"), alert.optionalString("road")).filterNotNull().joinToString(" · "), 14, Muted)
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
            Label("MY AREAS", 11, Muted)
            Label((0 until (items?.length() ?: 0)).sumOf { items?.optJSONObject(it)?.optInt("unreadCount") ?: 0 }.toString(), 34, Color.White, mono = true)
            Label("unread changes", 12, Muted)
            return@Column
        }
        if (change != null && area != null) {
            Spacer(Modifier.height(14.dp))
            val added = change.optString("kind") == "added"
            Box(Modifier.size(28.dp).background((if (added) Alert else Muted).copy(alpha = 0.22f), CircleShape),
                contentAlignment = Alignment.Center) {
                Text(if (added) "+" else "−", fontFamily = WatchMono, fontSize = 16.sp,
                    color = if (added) Alert else Muted)
            }
            Label(if (added) "New ALPR camera" else "Camera removed", 15, Color.White)
            Text(change.optString("street"), fontFamily = WatchSans, fontSize = 12.sp, color = Color.White,
                maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
            val meta = "${area.optString("name").substringBefore(",")} · ${relativeTime(change.optionalLong("changedAt"), now)}" +
                change.optionalString("direction")?.let { " · faces $it" }.orEmpty()
            Text(meta, fontFamily = WatchSans, fontSize = 11.sp, color = Muted, maxLines = 1,
                overflow = TextOverflow.Ellipsis)
            Chip(onClick = { repository.openOnPhone("area-change", area.optInt("id"), change.optInt("id")) },
                enabled = repository.connected && repository.handoffStatus != "sending",
                label = { Text(when (repository.handoffStatus) {
                    "sending" -> "Sending…"; "opened" -> "On your phone"; "failed" -> "Try again"
                    "unavailable" -> "Phone unavailable"; else -> if (!repository.connected) "Phone unavailable" else "Open on phone"
                }) }, modifier = Modifier.fillMaxWidth())
            if (repository.handoffStatus == "failed") Label("Didn't reach your phone", 11, Amber)
        } else if (area != null) {
            Text("‹  ${area.optString("name")}", Modifier.clickable(onClick = onBack), fontFamily = WatchSans,
                fontSize = 13.sp, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (stale) Label("Cached · counts may be behind", 11, Amber)
            if (changes == null || changes.length() == 0) Label(when (area.optString("changesStatus")) {
                "loading" -> "Checking recent changes"
                "unavailable" -> "Changes unavailable on watch"
                else -> "No changes this week"
            }, 13, Muted)
            for (index in 0 until minOf(changes?.length() ?: 0, 10)) {
                val row = changes!!.getJSONObject(index)
                ChangeRow(row, now, onClick = { onChange(row.optInt("id")) })
            }
            Label("${area.optInt("cameraCount")} cameras · ${changes?.length() ?: 0} changes", 11, Muted)
        } else {
            Label("MY AREAS", 11, Muted)
            when (areas.optString("status")) {
                "loading" -> Label("Checking your areas · Syncing with your phone…", 13, Muted)
                "expired" -> {
                    Label("Subscription session expired", 14, Amber)
                    Chip(onClick = { repository.openOnPhone("areas") }, label = { Text("Open on phone") }, modifier = Modifier.fillMaxWidth())
                }
                else -> {
                    if (stale) Label("Cached · counts may be behind", 11, Amber)
                    if (items == null || items.length() == 0) {
                        if (areas.optString("status") == "offline") {
                            Label("Phone unavailable", 16, Muted)
                            Label("Reconnect to see your areas.", 12, Muted)
                        } else {
                            StateGlyph(R.drawable.watch_map_pin_off, Muted)
                            Label("No areas yet", 18, Color.White)
                            Label("Watch a city or ZIP in the phone app.", 12, Muted)
                        }
                    } else {
                        val changesThisWeek = (0 until items.length()).sumOf { index ->
                            items.getJSONObject(index).optInt("addedCount") + items.getJSONObject(index).optInt("removedCount")
                        }
                        if (changesThisWeek == 0) {
                            StateGlyph(R.drawable.watch_circle_check, Brand)
                            Label("All quiet", 18, Color.White)
                            Label("No camera changes in your areas this week.", 12, Muted)
                        }
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
            Label("${delta?.let { if (it >= 0) "+$it" else "$it" } ?: "—"} → ${score ?: "—"}", 36, Brand, mono = true)
            Label("Privacy score", 11, Muted)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            RecapMetric("TIME", elapsed(recap.optionalDouble("durationSeconds")), Color.White, Modifier.weight(1f))
            RecapMetric("MI", recap.optionalDouble("distanceMiles")?.let { String.format("%.1f", it) } ?: "—", Color.White, Modifier.weight(1f))
            RecapMetric("AVOIDED", recap.optionalLong("avoidedCameras")?.toString() ?: "—", Brand, Modifier.weight(1f))
        }
        Spacer(Modifier.height(20.dp))
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

@Composable
private fun RecapMetric(label: String, value: String, color: Color, modifier: Modifier) {
    Column(modifier.background(Card, RoundedCornerShape(14.dp)).padding(vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontFamily = WatchMono, fontSize = 13.sp, color = color, maxLines = 1)
        Text(label, fontFamily = WatchSans, fontSize = 9.sp, color = Muted, maxLines = 1)
    }
}
