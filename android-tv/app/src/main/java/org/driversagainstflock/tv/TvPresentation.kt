package org.driversagainstflock.tv

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

internal fun TvArea.subtitle(full: Boolean = false): String {
    val type = when (kind) {
        "radius" -> description.substringBefore(" · ").takeIf { it.contains(" mi") }?.removeSuffix(" radius") ?: "Radius"
        "zip" -> "ZIP"
        else -> kind.replaceFirstChar { it.uppercase() }
    }
    val detail = if (kind == "radius" && description.startsWith("$type · ")) description.removePrefix("$type · ") else description
    return listOf(type, detail.takeIf { full && it != type && it != "$type radius" }.orEmpty(),
        "$cameraCount cameras${if (full) " mapped" else ""}").filter { it.isNotBlank() }.joinToString(" · ")
}

/** Unknown history is not zero activity. Older phones only provide this week's totals. */
internal fun TvArea.historyBars(): List<Int?> = if (weeklyChanges.size == 8) weeklyChanges else
    List(7) { null } + if (feedAvailable) added + removed else null

internal fun TvCamera.dayLabel(): String = changedAt?.let {
    Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("EEEE"))
} ?: when (detail.substringBefore(" · ")) {
    "Tue" -> "Tuesday"
    "Mon" -> "Monday"
    "Sun" -> "Sunday"
    else -> ""
}

internal fun TvCamera.summary(): String = if (verification.isNotBlank()) {
    listOf(direction.takeIf { it.isNotBlank() }?.let { "Faces $it" }, "verified by $verification").filterNotNull().joinToString(" · ")
} else detail.substringAfter(" · ", detail).ifBlank { "Community mapped" }
