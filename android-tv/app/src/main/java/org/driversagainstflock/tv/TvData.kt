package org.driversagainstflock.tv

import org.json.JSONObject
import kotlin.math.abs

data class TvCamera(val id: String, val longitude: Double, val latitude: Double, val street: String, val kind: String = "added", val detail: String = "", val direction: String = "", val model: String = "", val verification: String = "", val changedAt: Long? = null)
data class TvMapPoint(val longitude: Double, val latitude: Double, val direction: String = "")
data class TvArea(val id: Long, val name: String, val description: String, val cameraCount: Int, val added: Int, val removed: Int, val cadence: String, val changes: List<TvCamera>, val feedAvailable: Boolean = true, val kind: String = "", val mappedCameras: List<TvMapPoint> = emptyList(), val weeklyChanges: List<Int> = emptyList())

object TvMarkerParser {
    fun parse(json: String): List<TvCamera> {
        val points = JSONObject(json).optJSONArray("points") ?: return emptyList()
        return (0 until minOf(points.length(), 10_000)).mapNotNull { index ->
            val item = points.optJSONObject(index) ?: return@mapNotNull null
            val location = item.optJSONArray("location") ?: return@mapNotNull null
            val lng = location.optDouble(0, Double.NaN)
            val lat = location.optDouble(1, Double.NaN)
            if (!lng.isFinite() || !lat.isFinite() || abs(lng) > 180 || abs(lat) > 90) return@mapNotNull null
            val properties = item.optJSONObject("properties") ?: return@mapNotNull null
            val id = properties.optString("id").take(100)
            if (id.isBlank()) return@mapNotNull null
            val tags = properties.optJSONArray("osm_nodes")?.optJSONObject(0)?.optJSONObject("tags")
            TvCamera(id, lng, lat, tags?.optString("addr:street")?.takeIf { it.isNotBlank() } ?: "Mapped ALPR camera",
                detail = "OpenStreetMap", direction = properties.optString("direction", "Unknown"),
                model = tags?.optString("manufacturer")?.takeIf { it.isNotBlank() } ?: "Unknown")
        }.distinctBy { it.id }
    }
}

/** Directional selection snaps to the nearest point in the requested half-plane. */
fun nextCamera(cameras: List<TvCamera>, selected: TvCamera?, dx: Int, dy: Int): TvCamera? {
    if (selected == null) return cameras.firstOrNull()
    return cameras.filter { it.id != selected.id }.mapNotNull { candidate ->
        val x = candidate.longitude - selected.longitude
        val y = candidate.latitude - selected.latitude
        val forward = x * dx + y * dy
        if (forward <= 0) null else candidate to (forward + abs(x * dy - y * dx) * 3)
    }.minByOrNull { it.second }?.first ?: selected
}
