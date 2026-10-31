package org.driversagainstflock.watch

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Intent
import android.graphics.drawable.Icon
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.material3.Typography.BODY_LARGE
import androidx.wear.protolayout.material3.MaterialScope
import androidx.wear.protolayout.material3.primaryLayout
import androidx.wear.protolayout.material3.text
import androidx.wear.protolayout.material3.textEdgeButton
import androidx.wear.protolayout.modifiers.clickable
import androidx.wear.protolayout.types.layoutString
import androidx.wear.tiles.Material3TileService
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileService
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.tile
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.MonochromaticImageComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import kotlin.time.Duration.Companion.minutes

internal data class QuickAccess(val mode: String, val title: String, val detail: String, val unread: Int?,
    val area: String?, val score: Int?)

internal fun quickAccess(snapshot: WatchSnapshot?, now: Long, connected: Boolean): QuickAccess {
    val nav = snapshot?.navigation
    val areas = snapshot?.areas
    val sourceAt = areas?.optionalLong("sourceAt")
    val age = sourceAt?.let { now - it }
    val areasAvailable = areas != null && age != null && age <= 86_400_000 && areas.optString("status") != "expired"
    val items = areas?.optJSONArray("items")
    var unread = 0
    var topArea: String? = null
    var topCount = 0
    for (index in 0 until (items?.length() ?: 0)) {
        val item = items!!.getJSONObject(index)
        val count = item.optInt("unreadCount")
        unread += count
        if (count > topCount) { topCount = count; topArea = item.optString("name") }
    }
    val score = snapshot?.recap?.optionalLong("privacyScore")?.toInt()?.takeIf { it in 0..100 }
    if (nav?.optString("status") == "active" && !snapshot.stale(now)) {
        val maneuver = nav.optJSONObject("maneuver")
        return QuickAccess("navigation", distance(maneuver?.optionalDouble("distanceMeters")),
            maneuver?.optString("instruction") ?: "Open guidance", if (areasAvailable) unread else null, topArea, score)
    }
    if (!areasAvailable) {
        return QuickAccess("unavailable", "Phone not connected", "Open DAF to reconnect", null, null, score)
    }
    return QuickAccess(if (!connected || age!! >= 3_600_000) "stale" else "areas",
        if (unread == 0) "0 unread" else "$unread unread changes",
        if (age >= 3_600_000) "Updated ${age / 3_600_000}h ago" else if (unread == 0) "All quiet this week" else topArea ?: "My areas",
        unread, topArea, score)
}

internal fun loadQuickAccess(context: android.content.Context): QuickAccess {
    val payload = context.getSharedPreferences("watch_state", 0).getString("snapshot", null)
    val snapshot = payload?.let { runCatching { WatchSnapshot.parse(it) }.getOrNull() }
    return quickAccess(snapshot, System.currentTimeMillis(), WatchRepository.get(context).connected)
}

class WatchAreasTileService : Material3TileService() {
    override suspend fun MaterialScope.tileResponse(requestParams: RequestBuilders.TileRequest): TileBuilders.Tile {
        val state = loadQuickAccess(this@WatchAreasTileService)
        val targetPage = if (state.mode == "navigation") 0 else 0
        val areasClick = clickable(action = ActionBuilders.launchAction(ComponentName(this@WatchAreasTileService, MainActivity::class.java),
            mapOf("page" to ActionBuilders.intExtra(targetPage))))
        val scoreClick = clickable(action = ActionBuilders.launchAction(ComponentName(this@WatchAreasTileService, MainActivity::class.java),
            mapOf("page" to ActionBuilders.intExtra(1))))
        return tile(timeline = TimelineBuilders.Timeline.fromLayoutElement(primaryLayout(
            titleSlot = { text((if (state.mode == "navigation") "DAF · NAVIGATING" else "DAF · MY AREAS").layoutString) },
            mainSlot = { text("${state.title}\n${state.detail}".layoutString, typography = BODY_LARGE) },
            bottomSlot = { textEdgeButton(onClick = if (state.mode == "navigation") areasClick else scoreClick,
                labelContent = { text((if (state.mode == "navigation") "Open guidance" else "Scorecard").layoutString) }) },
            onClick = areasClick,
        )), freshness = 15.minutes)
    }
}

class WatchComplicationService : SuspendingComplicationDataSourceService() {
    private fun text(value: String) = PlainComplicationText.Builder(value).build()
    private fun tap(page: Int): PendingIntent = PendingIntent.getActivity(this, page,
        Intent(this, MainActivity::class.java).putExtra("page", page), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? =
        data(request.complicationType, loadQuickAccess(this))
    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        data(type, QuickAccess("areas", "4 unread changes", "Oakland", 4, "Oakland", 82))
    private fun data(type: ComplicationType, state: QuickAccess): ComplicationData? {
        val count = state.unread?.toString() ?: "—"
        val description = text(if (state.unread == null) "Areas unavailable" else "${state.unread} unread Area changes")
        return when (type) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(text(count), description)
                .setTapAction(tap(0)).build()
            ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(
                text(if (state.unread == null) "Areas unavailable" else "$count new · ${state.area ?: "My areas"}"), description)
                .setTapAction(tap(0)).build()
            ComplicationType.MONOCHROMATIC_IMAGE -> MonochromaticImageComplicationData.Builder(
                MonochromaticImage.Builder(Icon.createWithResource(this, R.drawable.app_logo)).build(),
                text("Open DAF companion"),
            ).setTapAction(tap(0)).build()
            ComplicationType.RANGED_VALUE -> state.score?.let { score ->
                RangedValueComplicationData.Builder(score.toFloat(), 0f, 100f, text("Privacy score $score"))
                    .setTapAction(tap(1)).build()
            }
            else -> null
        }
    }
}

internal fun requestQuickAccessUpdate(context: android.content.Context) {
    TileService.getUpdater(context).requestUpdate(WatchAreasTileService::class.java)
    ComplicationDataSourceUpdateRequester.create(context,
        ComponentName(context, WatchComplicationService::class.java)).requestUpdateAll()
}
