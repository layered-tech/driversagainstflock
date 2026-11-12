package org.driversagainstflock.tv

import org.json.JSONObject

object TvSnapshot {
    /** Persist an allowlisted model, never arbitrary fields received over the socket. */
    fun encode(areas: List<TvArea>, receivedAt: Long): JSONObject = JSONObject()
        .put("protocolVersion", 1).put("receivedAt", receivedAt)
        .put("areas", org.json.JSONArray(areas.map { area ->
            JSONObject().put("id", area.id).put("name", area.name).put("kind", area.kind).put("description", area.description)
                .put("cameraCount", area.cameraCount).put("addedCount", area.added).put("removedCount", area.removed)
                .put("weeklyChanges", org.json.JSONArray(area.weeklyChanges))
                .put("cadence", area.cadence).put("changesStatus", if (area.feedAvailable) "ready" else "unavailable")
                .put("mappedCameras", org.json.JSONArray(area.mappedCameras.map { point ->
                    JSONObject().put("latitude", point.latitude).put("longitude", point.longitude).put("direction", point.direction)
                }))
                .put("changes", org.json.JSONArray(area.changes.map { camera ->
                    JSONObject().put("id", camera.id.toLong()).put("street", camera.street).put("kind", camera.kind)
                        .put("operator", camera.detail).put("direction", camera.direction)
                        .put("changedAt", camera.changedAt ?: JSONObject.NULL)
                        .put("latitude", if (camera.latitude.isFinite()) camera.latitude else JSONObject.NULL)
                        .put("longitude", if (camera.longitude.isFinite()) camera.longitude else JSONObject.NULL)
                }))
        }))

    fun areas(snapshot: JSONObject): List<TvArea> {
        require(snapshot.optInt("protocolVersion") == 1)
        val areas = snapshot.getJSONArray("areas")
        require(areas.length() <= 25)
        return (0 until areas.length()).map { index ->
            val area = areas.getJSONObject(index)
            val id = area.getLong("id")
            require(id > 0)
            val changes = area.getJSONArray("changes")
            require(changes.length() <= 100)
            val mappedCameras = area.optJSONArray("mappedCameras") ?: org.json.JSONArray()
            require(mappedCameras.length() <= 500)
            TvArea(id, area.optString("name").take(160), area.optString("description").take(160),
                area.optInt("cameraCount").coerceAtLeast(0), area.optInt("addedCount").coerceAtLeast(0), area.optInt("removedCount").coerceAtLeast(0),
                area.optString("cadence").take(20),
                (0 until changes.length()).map { c ->
                    val change = changes.getJSONObject(c)
                    val changeId = change.getLong("id")
                    require(changeId > 0)
                    val lat = change.optDouble("latitude", Double.NaN)
                    val lng = change.optDouble("longitude", Double.NaN)
                    TvCamera(changeId.toString(), if (lng in -180.0..180.0) lng else Double.NaN,
                        if (lat in -90.0..90.0) lat else Double.NaN, change.optString("street").take(160),
                        change.optString("kind").takeIf { it in setOf("added", "removed", "updated") } ?: "updated",
                        change.optString("operator").take(160), change.optString("direction").take(160),
                        changedAt = change.optLong("changedAt").takeIf { it > 0 })
                }, area.optString("changesStatus") == "ready", area.optString("kind").takeIf { it in setOf("city", "county", "zip", "radius", "drawn") } ?: "",
                (0 until mappedCameras.length()).mapNotNull { index ->
                    val point = mappedCameras.optJSONObject(index) ?: return@mapNotNull null
                    val lat = point.optDouble("latitude", Double.NaN)
                    val lng = point.optDouble("longitude", Double.NaN)
                    if (lat in -90.0..90.0 && lng in -180.0..180.0) TvMapPoint(lng, lat, point.optString("direction").take(160)) else null
                }, weeklyChanges = area.optJSONArray("weeklyChanges")?.takeIf { it.length() == 8 }?.let { weeks ->
                    (0 until 8).map { weeks.optInt(it).coerceAtLeast(0) }
                }.orEmpty())
        }
    }
}
