package org.driversagainstflock.tv

/** Same cardinal values, numeric normalization and multi-direction delimiters as the phone map. */
internal fun cameraDirections(value: String): List<Double> {
    val cardinals = listOf("N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW")
    val aliases = mapOf("NORTH" to "N", "EAST" to "E", "SOUTH" to "S", "WEST" to "W", "NORTHBOUND" to "N", "EASTBOUND" to "E", "SOUTHBOUND" to "S", "WESTBOUND" to "W")
    return value.substringBefore(" · ").split(Regex("[;,]|(?<=[0-9A-Za-z])-(?=[0-9A-Za-z])")).mapNotNull { token ->
        val text = token.trim().uppercase().replace(" ", "")
        val number = Regex("^[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)").find(text)?.value?.toDoubleOrNull()
        if (number != null && number.isFinite()) ((number % 360) + 360) % 360
        else cardinals.indexOf(aliases[text] ?: text).takeIf { it >= 0 }?.times(22.5)
    }.distinct().take(8)
}
