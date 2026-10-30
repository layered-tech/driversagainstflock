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
    val publishedAt = json.getLong("publishedAt")
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
