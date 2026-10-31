package org.driversagainstflock.watch

import org.json.JSONObject

const val PROTOCOL_VERSION = 1
const val STALE_AFTER_MS = 15_000L

data class WatchSnapshot(val json: JSONObject) {
    val publisherId = json.getString("publisherId")
    val publisherStartedAt = json.getLong("publisherStartedAt")
    val revision = json.getLong("revision")
    val navigation = json.getJSONObject("navigation")
    val scorecard = json.getJSONObject("scorecard")
    val cameraAlert: JSONObject? = json.optJSONObject("cameraAlert")
    val areas: JSONObject? = json.optJSONObject("areas")
    val recap: JSONObject? = json.optJSONObject("recap")
    val publishedAt = json.getLong("publishedAt")
    val hapticsEnabled = json.optBoolean("hapticsEnabled", true)
    val cameraAlertsEnabled = json.optBoolean("cameraAlertsEnabled", false)
    val sessionId: String? = navigation.optionalString("sessionId")
    fun sourceAge(now: Long): Long? = navigation.optionalLong("sourceAt")?.let { now - it }
    fun stale(now: Long): Boolean = sourceAge(now)?.let { it >= STALE_AFTER_MS || it < -5_000 } ?: true

    companion object {
        fun parse(payload: String): WatchSnapshot {
            require(payload.toByteArray().size <= 65_536) { "Payload too large" }
            val json = JSONObject(payload)
            require(json.getInt("protocolVersion") == PROTOCOL_VERSION) { "Incompatible protocol" }
            require(json.getString("publisherId").length in 1..80)
            require(json.getLong("publisherStartedAt") > 0 && json.getLong("revision") > 0)
            require(json.getLong("publishedAt") > 0)
            require(json.getString("environment") in setOf("production", "staging", "development", "e2e"))
            val nav = json.getJSONObject("navigation")
            require(nav.getString("status") in setOf("idle", "active", "rerouting", "waiting-for-location", "missing-maneuver"))
            require(nav.getLong("routeRevision") >= 0)
            require(nav.getString("status") == "idle" || !nav.optionalString("sessionId").isNullOrEmpty())
            val maneuver = nav.optJSONObject("maneuver")
            if (nav.getString("status") == "active") {
                require(maneuver != null)
                require(maneuver.getString("kind") in setOf("left", "right", "sharp-left", "sharp-right", "slight-left", "slight-right", "keep-left", "keep-right", "straight", "roundabout", "uturn", "depart", "arrive"))
                require(maneuver.getString("instruction").length <= 240)
            }
            require(nav.optString("destination").length <= 240)
            val score = json.getJSONObject("scorecard")
            require(score.getString("status") in setOf("active", "tracking-off", "initializing", "unavailable", "no-active-drive"))
            json.optJSONObject("cameraAlert")?.let { alert ->
                require(alert.getString("id").length in 1..80)
                require(alert.optString("type").length <= 40 && alert.optString("road").length <= 80)
                require(alert.getDouble("distanceMeters") >= 0 && alert.getDouble("distanceMeters").isFinite())
                require(alert.getInt("count") in 1..100)
                require(alert.getLong("sourceAt") > 0)
                require(alert.optionalLong("issuedAt")?.let { it > 0 } != false)
            }
            json.optJSONObject("areas")?.let { areas ->
                require(areas.getString("status") in setOf("loading", "ready", "offline", "expired"))
                val items = areas.getJSONArray("items")
                require(items.length() <= 25)
                for (index in 0 until items.length()) {
                    val area = items.getJSONObject(index)
                    require(area.getInt("id") > 0 && area.getString("name").length <= 120)
                    require(area.getInt("unreadCount") >= 0 && area.getInt("cameraCount") >= 0)
                    require(area.optString("changesStatus", "ready") in setOf("loading", "ready", "unavailable"))
                    val changes = area.getJSONArray("changes")
                    require(changes.length() <= 10)
                    for (changeIndex in 0 until changes.length()) {
                        val change = changes.getJSONObject(changeIndex)
                        require(change.getInt("id") > 0 && change.getString("kind") in setOf("added", "removed"))
                        require(change.optString("street").length <= 120)
                    }
                }
            }
            json.optJSONObject("recap")?.let { recap ->
                require(recap.getString("status") in setOf("none", "initializing", "tracking-off", "completed", "canceled"))
                if (recap.getString("status") in setOf("completed", "canceled")) {
                    require(recap.getString("id").length in 1..80 && recap.getLong("endedAt") > 0)
                }
            }
            listOf(nav to listOf("sourceAt", "distanceRemainingMeters", "durationRemainingSeconds", "arrivalAt"),
                score to listOf("sourceAt", "elapsedSeconds", "distanceMeters", "confirmedCrossings", "possibleCrossings", "cameraCrossings"),
                (maneuver ?: JSONObject()) to listOf("distanceMeters", "exitNumber")).forEach { (obj, keys) ->
                keys.forEach { key -> if (!obj.isNull(key)) require(obj.getDouble(key).isFinite() && obj.getDouble(key) >= 0) }
            }
            return WatchSnapshot(json)
        }
    }
}

fun JSONObject.optionalString(key: String): String? = if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }
fun JSONObject.optionalLong(key: String): Long? = if (isNull(key)) null else optLong(key)
fun JSONObject.optionalDouble(key: String): Double? = if (isNull(key)) null else optDouble(key).takeIf { it.isFinite() }

class SnapshotGate {
    var current: WatchSnapshot? = null
        private set
    private val retiredPublishers = ArrayDeque<String>()
    fun accept(next: WatchSnapshot): Boolean {
        val previous = current
        if (next.publisherId in retiredPublishers) return false
        if (previous != null) {
            if (next.publisherId == previous.publisherId && next.revision <= previous.revision) return false
            if (next.publisherId != previous.publisherId) {
                if (next.publisherStartedAt <= previous.publisherStartedAt) return false
                retiredPublishers.addLast(previous.publisherId)
                while (retiredPublishers.size > 16) retiredPublishers.removeFirst()
            }
        }
        current = next
        return true
    }
}
