package org.driversagainstflock.watch

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Intent
import android.graphics.drawable.Icon
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.material3.MaterialScope
import androidx.wear.protolayout.ColorBuilders
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.DimensionBuilders.weight
import androidx.wear.protolayout.LayoutElementBuilders.Box
import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER
import androidx.wear.protolayout.LayoutElementBuilders.Row
import androidx.wear.protolayout.LayoutElementBuilders.Text
import androidx.wear.protolayout.LayoutElementBuilders.FontStyle
import androidx.wear.protolayout.LayoutElementBuilders.FONT_WEIGHT_BOLD
import androidx.wear.protolayout.LayoutElementBuilders.FONT_WEIGHT_MEDIUM
import androidx.wear.protolayout.LayoutElementBuilders.VERTICAL_ALIGN_CENTER
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.layout.androidImageResource
import androidx.wear.protolayout.layout.imageResource
import androidx.wear.protolayout.material3.icon
import androidx.wear.protolayout.modifiers.clickable
import androidx.wear.protolayout.types.argb
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
    val area: String?, val score: Int?, val chip: String? = null, val sub: String = "",
    val maneuverKind: String? = null)

internal fun quickAccess(snapshot: WatchSnapshot?, now: Long, connected: Boolean): QuickAccess {
    val nav = snapshot?.navigation
    val areas = snapshot?.areas
    val sourceAt = areas?.optionalLong("sourceAt")
    val age = sourceAt?.let { now - it }
    val areasAvailable = areas != null && age != null && age <= 86_400_000 && areas.optString("status") != "expired"
    val items = areas?.optJSONArray("items")
    val areaCount = items?.length() ?: 0
    var unread = 0
    var topArea: String? = null
    var topCount = 0
    val areaSummaries = mutableListOf<String>()
    for (index in 0 until (items?.length() ?: 0)) {
        val item = items!!.getJSONObject(index)
        val count = item.optInt("unreadCount")
        unread += count
        val activity = listOf(item.optInt("addedCount").takeIf { it > 0 }?.let { "+$it" },
            item.optInt("removedCount").takeIf { it > 0 }?.let { "−$it" }).filterNotNull().joinToString(" ")
        if (activity.isNotEmpty() && areaSummaries.size < 2) {
            areaSummaries += "${item.optString("name").substringBefore(",")} $activity"
        }
        if (count > topCount) { topCount = count; topArea = item.optString("name") }
    }
    val score = snapshot?.recap?.optionalLong("privacyScore")?.toInt()?.takeIf { it in 0..100 }
    if (nav?.optString("status") == "active" && (connected || !snapshot.stale(now))) {
        val maneuver = nav.optJSONObject("maneuver")
        val remainingMinutes = nav.optionalLong("durationRemainingSeconds")?.let { (it + 59) / 60 }
        val trip = listOfNotNull(nav.optionalLong("arrivalAt")?.let { arrival ->
            java.text.SimpleDateFormat("h:mm", java.util.Locale.getDefault()).format(java.util.Date(arrival)) },
            remainingMinutes?.let { "$it min" }, nav.optionalDouble("distanceRemainingMeters")?.let {
                String.format(java.util.Locale.US, "%.1f mi", it / 1609.344)
            })
            .joinToString(" · ")
        return QuickAccess("navigation", distance(maneuver?.optionalDouble("distanceMeters")),
            maneuver?.optString("instruction") ?: "Open guidance", if (areasAvailable) unread else null, topArea, score,
            sub = trip, maneuverKind = maneuver?.optString("kind"))
    }
    if (!areasAvailable) {
        return QuickAccess("unavailable", "Phone not connected", "Reconnect to see your areas", null, null, score,
            chip = "Phone not connected", sub = if (age != null && age >= 86_400_000) "Last synced yesterday" else "Open DAF to reconnect")
    }
    return QuickAccess(if (!connected || age!! >= 3_600_000) "stale" else "areas",
        if (unread == 0) "0 unread" else "$unread unread changes",
        if (unread == 0) "$areaCount ${if (areaCount == 1) "area" else "areas"} watched"
        else areaSummaries.joinToString(" · ").ifEmpty { topArea ?: "My areas" },
        unread, topArea, score, chip = if (age >= 3_600_000) "Updated ${age / 3_600_000}h ago" else null)
}

internal fun loadQuickAccess(context: android.content.Context): QuickAccess {
    val payload = context.getSharedPreferences("watch_state", 0).getString("snapshot", null)
    val snapshot = payload?.let { runCatching { WatchSnapshot.parse(it) }.getOrNull() }
    return quickAccess(snapshot, System.currentTimeMillis(), WatchRepository.get(context).connected)
}

private const val TILE_WHITE = -0x1
private const val TILE_MUTED = 0x99FFFFFF.toInt()
private const val TILE_DIM = 0x80FFFFFF.toInt()
private const val TILE_GREEN = 0xFF1FBF6B.toInt()
private const val TILE_NEUTRAL = 0x1FFFFFFF
private const val TILE_AMBER = 0xFFFFB02E.toInt()

private fun tileText(value: String, size: Float, color: Int = TILE_WHITE, weight: Int = FONT_WEIGHT_MEDIUM,
    mono: Boolean = false): Text {
    val font = FontStyle.Builder().setSize(sp(size)).setWeight(weight).setColor(ColorBuilders.argb(color))
    if (mono) font.setPreferredFontFamilies("monospace", "Roboto")
    return Text.Builder().setText(value).setFontStyle(font.build()).setMaxLines(1).build()
}

private fun tileSpace(height: Float): androidx.wear.protolayout.LayoutElementBuilders.Spacer =
    androidx.wear.protolayout.LayoutElementBuilders.Spacer.Builder().setHeight(dp(height)).build()

private fun tileBackground(color: Int, radius: Float): ModifiersBuilders.Background =
    ModifiersBuilders.Background.Builder().setColor(ColorBuilders.argb(color))
        .setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(radius)).build()).build()

private fun tilePill(label: String, color: Int, foreground: Int, width: Float,
    onClick: ModifiersBuilders.Clickable): Box = Box.Builder().setWidth(dp(width)).setHeight(dp(36f))
    .setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER).setVerticalAlignment(VERTICAL_ALIGN_CENTER)
    .setModifiers(ModifiersBuilders.Modifiers.Builder().setBackground(tileBackground(color, 18f))
        .setClickable(onClick).build())
    .addContent(tileText(label, 11f, foreground, FONT_WEIGHT_BOLD)).build()

class WatchAreasTileService : Material3TileService() {
    override suspend fun MaterialScope.tileResponse(requestParams: RequestBuilders.TileRequest): TileBuilders.Tile {
        val state = loadQuickAccess(this@WatchAreasTileService)
        val areasClick = clickable(action = ActionBuilders.launchAction(ComponentName(this@WatchAreasTileService, MainActivity::class.java),
            mapOf("page" to ActionBuilders.intExtra(0))))
        val scoreClick = clickable(action = ActionBuilders.launchAction(ComponentName(this@WatchAreasTileService, MainActivity::class.java),
            mapOf("page" to ActionBuilders.intExtra(1))))
        val header = Row.Builder().setHeight(dp(12f)).setVerticalAlignment(VERTICAL_ALIGN_CENTER)
            .addContent(Box.Builder().setWidth(dp(12f)).setHeight(dp(12f))
                .setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER).setVerticalAlignment(VERTICAL_ALIGN_CENTER)
                .setModifiers(ModifiersBuilders.Modifiers.Builder().setBackground(tileBackground(TILE_GREEN, 4f)).build())
                .addContent(icon(imageResource(androidImageResource(R.drawable.watch_shield_check)),
                    width = dp(9f), height = dp(9f), tintColor = 0xFF06281A.toInt().argb)).build())
            .addContent(androidx.wear.protolayout.LayoutElementBuilders.Spacer.Builder().setWidth(dp(5f)).build())
            .addContent(tileText(when (state.mode) {
                "navigation" -> "DAF · NAVIGATING"
                "unavailable" -> "DAF"
                else -> "DAF · MY AREAS"
            }, 10f, TILE_MUTED, FONT_WEIGHT_BOLD)).build()
        val center = Column.Builder().setWidth(expand()).setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER)
        state.chip?.let { chip ->
            center.addContent(Box.Builder().setHeight(dp(20f)).setWidth(dp(if (state.mode == "unavailable") 124f else 93f))
                .setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER).setVerticalAlignment(VERTICAL_ALIGN_CENTER)
                .setModifiers(ModifiersBuilders.Modifiers.Builder().setBackground(tileBackground(
                    if (state.mode == "stale") 0x33FFB02E else TILE_NEUTRAL, 10f)).build())
                .addContent(tileText(chip, 9.5f, if (state.mode == "stale") TILE_AMBER else TILE_WHITE, FONT_WEIGHT_BOLD)).build())
            center.addContent(tileSpace(4f))
        }
        if (state.mode == "navigation") {
            val distanceParts = state.title.split(' ', limit = 2)
            center.addContent(Row.Builder().setVerticalAlignment(VERTICAL_ALIGN_CENTER)
                .addContent(icon(imageResource(androidImageResource(maneuverResourceId(state.maneuverKind ?: "right"))),
                    width = dp(40f), height = dp(40f), tintColor = TILE_GREEN.argb))
                .addContent(androidx.wear.protolayout.LayoutElementBuilders.Spacer.Builder().setWidth(dp(8f)).build())
                .addContent(tileText(distanceParts[0], 28f, TILE_WHITE, FONT_WEIGHT_BOLD, mono = true))
                .addContent(tileText(" ${distanceParts.getOrElse(1) { "" }}", 11f, TILE_MUTED)).build())
        } else {
            center.addContent(tileText(state.unread?.toString() ?: "—", 40f,
                if (state.unread == 0) TILE_DIM else TILE_WHITE, FONT_WEIGHT_BOLD, mono = true))
        }
        center.addContent(tileSpace(4f))
        center.addContent(tileText(when {
            state.mode == "navigation" || state.mode == "unavailable" -> state.detail
            state.unread == 0 -> "All quiet this week"
            else -> "unread changes"
        }, 12f, TILE_WHITE, FONT_WEIGHT_BOLD))
        val sub = if (state.sub.isNotEmpty()) state.sub else if (state.mode == "navigation") "" else state.detail
        if (sub.isNotEmpty()) {
            center.addContent(tileSpace(4f))
            center.addContent(tileText(sub, 10f, TILE_MUTED))
        }
        val actions = Row.Builder().setHeight(dp(36f)).setVerticalAlignment(VERTICAL_ALIGN_CENTER)
        if (state.mode == "navigation" || state.mode == "unavailable") {
            actions.addContent(tilePill(if (state.mode == "navigation") "Open guidance" else "Open DAF",
                if (state.mode == "navigation") TILE_GREEN else TILE_NEUTRAL,
                if (state.mode == "navigation") 0xFF06281A.toInt() else TILE_WHITE,
                if (state.mode == "navigation") 122f else 87f, areasClick))
        } else {
            actions.addContent(tilePill("Areas", TILE_GREEN, 0xFF06281A.toInt(), 68f, areasClick))
            actions.addContent(androidx.wear.protolayout.LayoutElementBuilders.Spacer.Builder().setWidth(dp(6f)).build())
            actions.addContent(tilePill("Scorecard", TILE_NEUTRAL, TILE_WHITE, 90f, scoreClick))
        }
        val root = Column.Builder().setWidth(expand()).setHeight(expand())
            .setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER)
            .setModifiers(ModifiersBuilders.Modifiers.Builder()
                .setPadding(ModifiersBuilders.Padding.Builder().setTop(dp(22f)).setBottom(dp(18f))
                    .setStart(dp(24f)).setEnd(dp(24f)).build())
                .setClickable(areasClick).build())
            .addContent(header)
            .addContent(Box.Builder().setWidth(expand()).setHeight(weight(1f))
                .setHorizontalAlignment(HORIZONTAL_ALIGN_CENTER).setVerticalAlignment(VERTICAL_ALIGN_CENTER)
                .addContent(center.build()).build())
            .addContent(actions.build()).build()
        return tile(timeline = TimelineBuilders.Timeline.fromLayoutElement(root), freshness = 15.minutes)
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
