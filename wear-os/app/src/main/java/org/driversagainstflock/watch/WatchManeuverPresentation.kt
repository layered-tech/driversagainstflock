package org.driversagainstflock.watch

internal fun maneuverExitNumber(kind: String?, exit: Long?): Long? =
    exit?.takeIf { kind == "roundabout" && it > 0 }

internal fun maneuverDescription(kind: String?, exit: Long?): String {
    val exitNumber = maneuverExitNumber(kind, exit)
    return if (exitNumber != null) "Roundabout exit $exitNumber" else kind?.replace('-', ' ') ?: "Guidance updating"
}

internal fun maneuverExitTextSize(exit: Long, iconSize: Float): Float =
    iconSize * minOf(0.3f, 0.6f / exit.toString().length)
