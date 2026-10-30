package org.driversagainstflock.watch

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class WatchCueTest {
    private fun snapshot(): WatchSnapshot {
        val fixture = javaClass.classLoader!!.getResource("active.json")!!.readText()
        return WatchSnapshot.parse(JSONObject(fixture).apply {
            getJSONObject("navigation").put("sourceAt", 10_000)
        }.toString())
    }

    private fun cue(now: Long = 10_000): WatchCue = WatchCue.parse(JSONObject().apply {
        put("version", 1)
        put("id", "phone-1:drive-1:1:2")
        put("pattern", "right")
        put("publisherId", "fixture-phone")
        put("sessionId", "drive-1")
        put("maneuverId", "1:2")
        put("issuedAt", now)
        put("expiresAt", now + 3_000)
    }.toString())

    @Test fun activeCueRequiresCurrentSessionAndManeuver() {
        val snapshot = snapshot()
        assertTrue(cue().eligible(snapshot, 10_500))
        assertFalse(cue().eligible(snapshot, 13_000))
        assertFalse(cue().eligible(snapshot, 25_000))
        assertFalse(cue().copy(sessionId = "old-route").eligible(snapshot, 10_500))
        assertFalse(cue().copy(maneuverId = "1:1").eligible(snapshot, 10_500))
        assertFalse(cue().copy(publisherId = "old-phone").eligible(snapshot, 10_500))
        val disabled = WatchSnapshot.parse(JSONObject(snapshot.json.toString()).put("hapticsEnabled", false).toString())
        assertFalse(cue().eligible(disabled, 10_500))
    }

    @Test fun previewsExpireAndInvalidPayloadsAreRejected() {
        val preview = cue().copy(preview = true)
        assertTrue(preview.eligible(null, 10_500))
        assertFalse(preview.eligible(null, 13_000))
        assertTrue(runCatching { WatchCue.parse("{}") }.isFailure)
        assertTrue(runCatching { WatchCue.parse(JSONObject().put("version", 1).put("id", "x")
            .put("pattern", "unknown").put("issuedAt", 10_000).put("expiresAt", 13_000).toString()) }.isFailure)
    }
}
