package org.driversagainstflock.watch

import java.util.Locale
import kotlin.math.roundToInt

// Match the phone's directions estimates so the two screens agree at rounding boundaries.
internal fun distance(meters: Double?): String {
    if (meters == null) return "—"
    if (meters < 161) {
        val feet = if (meters <= 0) 0 else ((meters * 3.28084 / 50).roundToInt() * 50).coerceAtLeast(50)
        return "$feet ft"
    }
    return traveledDistance(meters)
}

internal fun traveledDistance(meters: Double?): String {
    if (meters == null) return "—"
    val miles = meters / 1609.344
    return String.format(Locale.US, if (miles >= 10) "%.0f mi" else "%.1f mi", miles)
}

internal fun duration(seconds: Double?): String {
    if (seconds == null) return "—"
    val minutes = (seconds / 60).roundToInt().coerceAtLeast(1)
    if (minutes < 60) return "$minutes min"
    val remainder = minutes % 60
    return if (remainder == 0) "${minutes / 60} hr" else "${minutes / 60} hr $remainder min"
}

internal fun elapsed(seconds: Double?): String = seconds?.toLong()?.let {
    String.format(Locale.US, "%d:%02d", it / 60, it % 60)
} ?: "—"

internal fun roadName(instruction: String): String = instruction.substringAfter(" onto ",
    instruction.substringAfter(" toward ", instruction))
